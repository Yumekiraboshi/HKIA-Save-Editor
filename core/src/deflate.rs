//! Bounded RFC1951 raw DEFLATE. No archive paths, no unbounded output allocation.
use crate::Error;
struct Bits<'a>{b:&'a[u8],p:usize}
impl<'a> Bits<'a>{fn take(&mut self,n:usize)->Result<u32,Error>{if n>16{return Err(Error::Schema)}let end=self.p.checked_add(n).ok_or(Error::Overflow)?;if end>self.b.len()*8{return Err(Error::Truncated)}let mut v=0;for i in 0..n{v|=(((self.b[(self.p+i)/8]>>((self.p+i)%8))&1)as u32)<<i;}self.p=end;Ok(v)}fn align(&mut self){self.p=(self.p+7)&!7;}
 // Stored DEFLATE blocks are byte-aligned. Preserve source bytes exactly
 // and check the range before advancing the sole input cursor.
 fn take_aligned_bytes(&mut self,n:usize)->Result<&'a[u8],Error>{
  if self.p&7!=0{return Err(Error::Schema)}
  let start=self.p/8;
  let end=start.checked_add(n).ok_or(Error::Overflow)?;
  let bytes=self.b.get(start..end).ok_or(Error::Truncated)?;
  self.p=end.checked_mul(8).ok_or(Error::Overflow)?;
  Ok(bytes)
 }}
struct Huff{count:[u16;16],first:[u16;16],offset:[usize;16],symbols:Vec<u16>}
impl Huff{
 fn new(lens:&[u8],allow_empty:bool,allow_single:bool)->Result<Self,Error>{let mut count=[0u16;16];for &n in lens{if n>15{return Err(Error::Schema)}if n!=0{count[n as usize]+=1;}}let total:usize=count.iter().map(|&x|x as usize).sum();if total==0&&!allow_empty{return Err(Error::Schema)}let mut left=1i32;for &n in &count[1..]{left=left*2-n as i32;if left<0{return Err(Error::Schema)}}if left!=0&&total!=0&&!(allow_single&&total==1&&count[1]==1){return Err(Error::Schema)}let mut first=[0u16;16];let mut offset=[0usize;16];for i in 1..16{first[i]=(first[i-1]+count[i-1])<<1;offset[i]=offset[i-1]+count[i-1] as usize;}let mut symbols=vec![0;total];let mut at=offset;for (s,&n) in lens.iter().enumerate(){if n!=0{symbols[at[n as usize]]=s as u16;at[n as usize]+=1;}}Ok(Self{count,first,offset,symbols})}
 fn read(&self,b:&mut Bits<'_>)->Result<usize,Error>{let mut c=0u16;for n in 1..16{c=(c<<1)|b.take(1)? as u16;let f=self.first[n];if c>=f&&c-f<self.count[n]{return Ok(self.symbols[self.offset[n]+(c-f) as usize] as usize)}}Err(Error::Schema)}
}
fn fixed()->Result<(Huff,Huff),Error>{let mut l=vec![8;288];l[144..256].fill(9);l[256..280].fill(7);Ok((Huff::new(&l,false,false)?,Huff::new(&[5;32],false,false)?))}
fn dynamic(b:&mut Bits<'_>)->Result<(Huff,Huff),Error>{let nl=b.take(5)? as usize+257;let nd=b.take(5)? as usize+1;let nc=b.take(4)? as usize+4;if nl>286{return Err(Error::Schema)}let order=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];let mut c=[0u8;19];for &i in &order[..nc]{c[i]=b.take(3)? as u8;}let h=Huff::new(&c,false,false)?;let mut l=Vec::with_capacity(nl+nd);while l.len()<nl+nd{let s=h.read(b)?;let (v,n)=match s{0..=15=>(s as u8,1),16=>(*l.last().ok_or(Error::Schema)?,b.take(2)? as usize+3),17=>(0,b.take(3)? as usize+3),18=>(0,b.take(7)? as usize+11),_=>return Err(Error::Schema)};if l.len()+n>nl+nd{return Err(Error::Schema)}l.extend(std::iter::repeat(v).take(n));}if l[256]==0{return Err(Error::Schema)}Ok((Huff::new(&l[..nl],false,true)?,Huff::new(&l[nl..],true,true)?))}
const LB:[usize;29]=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
const LE:[usize;29]=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
const DB:[usize;30]=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
const DE:[usize;30]=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
pub(crate) fn inflate(raw:&[u8],expected:usize)->Result<Vec<u8>,Error>{if raw.len()>crate::archive::MAX_ARCHIVE||expected>crate::MAX_INPUT{return Err(Error::Budget)}let mut b=Bits{b:raw,p:0};let mut out=Vec::with_capacity(expected);let mut blocks=0u32;loop{blocks+=1;if blocks>65_536{return Err(Error::Budget)}let last=b.take(1)?!=0;let ty=b.take(2)?;match ty{0=>{b.align();let n=b.take(16)? as usize;let inv=b.take(16)? as u16;if (n as u16)^inv!=0xffff{return Err(Error::Schema)}if out.len()+n>expected{return Err(Error::LengthMismatch)}out.extend_from_slice(b.take_aligned_bytes(n)?);},1|2=>{let (l,d)=if ty==1{fixed()?}else{dynamic(&mut b)?};loop{let s=l.read(&mut b)?;match s{0..=255=>{if out.len()==expected{return Err(Error::LengthMismatch)}out.push(s as u8);},256=>break,257..=285=>{let n=LB[s-257]+b.take(LE[s-257])? as usize;let ds=d.read(&mut b)?;if ds>=30{return Err(Error::Schema)}let dist=DB[ds]+b.take(DE[ds])? as usize;if dist>out.len(){return Err(Error::InvalidDistance)}if out.len()+n>expected{return Err(Error::LengthMismatch)}for _ in 0..n{let v=out[out.len()-dist];out.push(v);}},_=>return Err(Error::Schema)}}},_=>return Err(Error::Schema)}if last{break}}if (b.p+7)/8!=raw.len(){return Err(Error::Trailing)}if out.len()!=expected{return Err(Error::LengthMismatch)}Ok(out)}
#[cfg(any())]mod tests{use super::*;const RAW:&[u8]=include_bytes!("../tests/fixtures/session-deflate.raw");const D:&[u8]=include_bytes!("../tests/fixtures/session-dynamic.deflate");const F:&[u8]=include_bytes!("../tests/fixtures/session-fixed.deflate");const S:&[u8]=include_bytes!("../tests/fixtures/session-stored.deflate");#[test]fn all_block_types(){for b in [D,F,S]{assert_eq!(inflate(b,RAW.len()).unwrap(),RAW);}}#[test]fn wrong_len_and_trailing(){assert!(inflate(D,RAW.len()-1).is_err());let mut x=D.to_vec();x.push(0);assert_eq!(inflate(&x,RAW.len()),Err(Error::Trailing));}#[test]fn truncated_and_reserved(){assert!(inflate(&D[..D.len()-1],RAW.len()).is_err());assert!(inflate(&[7],0).is_err());}}


// Frozen pre-optimization bitwise stored decoder: unit-test oracle only.
// It never opens the product ZIP reader or enables a second Engine.
#[cfg(any())]
mod stored_aligned_tests {
 use super::*;
 fn old_stored_only(raw:&[u8],expected:usize)->Result<Vec<u8>,Error>{
  if raw.len()>crate::archive::MAX_ARCHIVE||expected>crate::MAX_INPUT{
   return Err(Error::Budget)
  }
  let mut b=Bits{b:raw,p:0};
  let mut out=Vec::with_capacity(expected);
  let mut blocks=0u32;
  loop{
   blocks+=1;
   if blocks>65_536{return Err(Error::Budget)}
   let last=b.take(1)?!=0;
   if b.take(2)?!=0{return Err(Error::Schema)}
   b.align();
   let n=b.take(16)? as usize;
   let inv=b.take(16)? as u16;
   if (n as u16)^inv!=0xffff{return Err(Error::Schema)}
   if out.len()+n>expected{return Err(Error::LengthMismatch)}
   for _ in 0..n{out.push(b.take(8)? as u8);}
   if last{break}
  }
  if (b.p+7)/8!=raw.len(){return Err(Error::Trailing)}
  if out.len()!=expected{return Err(Error::LengthMismatch)}
  Ok(out)
 }
 fn stored(data:&[u8],last:bool)->Vec<u8>{
  assert!(data.len()<=u16::MAX as usize);
  let len=data.len() as u16;
  let mut out=vec![if last{1}else{0}];
  out.extend_from_slice(&len.to_le_bytes());
  out.extend_from_slice(&(!len).to_le_bytes());
  out.extend_from_slice(data);
  out
 }
 #[test]
 fn empty_small_and_full_stored_blocks_byte_exact_with_frozen_old_decoder(){
  for n in [0usize,1,2,3,7,31,255,256,257,4096,8191,32767,65535]{
   let data=(0..n).map(|i|((i*29+11)%251)as u8).collect::<Vec<_>>();
   let raw=stored(&data,true);
   let before=raw.clone();
   assert_eq!(old_stored_only(&raw,n),Ok(data.clone()));
   assert_eq!(inflate(&raw,n),Ok(data));
   assert_eq!(raw,before,"input archive bytes must remain immutable");
  }
 }
 #[test]
 fn multiple_raw_stored_blocks_preserve_alignment_and_order(){
  let first=(0..255).map(|i|i as u8).collect::<Vec<_>>();
  let last=(0..10_000).map(|i|((i*17)%253)as u8).collect::<Vec<_>>();
  let mut raw=stored(&first,false);
  raw.extend(stored(&[],false));
  raw.extend(stored(&last,true));
  let mut expected=first;
  expected.extend(last);
  assert_eq!(old_stored_only(&raw,expected.len()),Ok(expected.clone()));
  assert_eq!(inflate(&raw,expected.len()),Ok(expected));
 }
 #[test]
 fn corrupt_truncated_nlen_wrong_size_and_trailing_errors_match_old_decoder(){
  let base=stored(&[9,8,7,6,5],true);
  let mut cases=Vec::<(Vec<u8>,usize)>::new();
  for len in 0..base.len(){cases.push((base[..len].to_vec(),5))}
  for expected in [0usize,1,4,6,9]{cases.push((base.clone(),expected))}
  let mut wrong_nlen=base.clone();wrong_nlen[3]^=1;cases.push((wrong_nlen,5));
  let mut extra=base.clone();extra.push(0);cases.push((extra,5));
  let mut invalid=base.clone();invalid[0]=7;cases.push((invalid,5));
  let large=stored(&vec![0x5a;65535],true);
  for keep in [4usize,5,10,257,8192,65539]{
   cases.push((large[..keep].to_vec(),65535))
  }
  for (raw,expected) in cases{
   let old=old_stored_only(&raw,expected);
   assert_eq!(inflate(&raw,expected),old,
    "raw length {}, expected {}",raw.len(),expected);
  }
 }
 #[test]
 fn zip_input_budget_and_decompression_output_budget_are_unchanged(){
  assert_eq!(inflate(&[],crate::MAX_INPUT+1),Err(Error::Budget));
  assert_eq!(inflate(&[1,0,0,255,255],crate::MAX_INPUT+1),Err(Error::Budget));
  let valid=stored(&[],true);
  assert_eq!(inflate(&valid,0),Ok(Vec::new()));
  assert_eq!(inflate(&valid,1),Err(Error::LengthMismatch));
 }
 #[cfg(target_os="linux")]
 #[test]
 fn paired_old_vs_aligned_64k_is_diagnostic_only(){
  use std::io::Write as _;
  let bytes=(0..65535).map(|i|((i*19+3)%251)as u8).collect::<Vec<_>>();
  let raw=stored(&bytes,true);
  for repetition in 0..2{
   let order=if repetition==0{[0,1]}else{[1,0]};
   let mut old_ns=0u128;let mut new_ns=0u128;
   for method in order{
    let start=std::time::Instant::now();
    let got=if method==0{
     old_stored_only(&raw,bytes.len()).unwrap()
    }else{
     inflate(&raw,bytes.len()).unwrap()
    };
    let elapsed=start.elapsed().as_nanos();
    assert_eq!(got,bytes);
    if method==0{old_ns=elapsed}else{new_ns=elapsed}
   }
   let mut stderr=std::fs::OpenOptions::new().write(true)
    .open("/dev/stderr").expect("Linux stderr");
   writeln!(stderr,
    "R6_RAW_STORED_DEFLATE_64K|repeat={repetition}|old_bitwise_ns={old_ns}|new_aligned_ns={new_ns}|byte_exact=true|scope=synthetic_stored_only"
   ).unwrap();
  }
 }
}

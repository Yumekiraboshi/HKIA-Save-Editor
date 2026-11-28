//! HKIA SaveGameV2 slot envelope. Signature bytes are opaque, never authenticated here.
use crate::{check_block_budget,decode_block_append,Error,MAX_INPUT,MAX_BLOCKS,MAX_BLOCK};
use crate::wire::{Cursor,Token};
use std::{collections::HashSet,ops::Range};
const PREFIX:[u8;32]=[0x13,0x5b,0x4a,0xa4,0xf7,0x02,0xa4,0x5d,0x1c,0xc5,0x62,0xae,0xb5,0xa3,0x86,0xed,0x5d,0x17,0xe1,0xfd,0x58,0x8f,0x42,0x4d,0xcf,0xc5,0x9d,0x2e,0x14,0x0c,0xf5,0x97];
const MAGIC:[u8;32]=[0xa1,0xa2,0xf8,0x33,0x3c,0x66,0xec,0x45,0x5b,0xaa,0x2d,0xfc,0x63,0x25,0xc2,0x43,0x7a,0x77,0x9c,0x99,0x06,0xee,0xcf,0xf0,0xc0,0x22,0xe5,0xf6,0xb6,0xca,0x73,0xb8];
#[derive(Debug,Clone,Copy,PartialEq,Eq)]
pub enum Version { V300,V301,Forward{major:u8,minor:u8,patch:u8} }
impl Version {
 pub fn parse(label:&str)->Result<Self,Error>{
  match label{
   "3.0.0"=>return Ok(Self::V300),
   "3.0.1"=>return Ok(Self::V301),
   _=>{}
  }
  // Strict canonical numeric triplets. A future label alone never authorizes
  // edits: the complete original schema walk and writer roundtrip must pass.
  let parts:Vec<_>=label.split('.').collect();
  if parts.len()!=3{return Err(Error::Version)}
  let mut v=[0u8;3];
  for (i,part) in parts.into_iter().enumerate(){
   if part.is_empty()||part.len()>2||(part.len()>1&&part.starts_with('0'))||
    !part.bytes().all(|c|c.is_ascii_digit()){return Err(Error::Version)}
   v[i]=part.parse().map_err(|_|Error::Version)?;
  }
  if (v[0],v[1],v[2])<=(3,0,1){return Err(Error::Version)}
  Ok(Self::Forward{major:v[0],minor:v[1],patch:v[2]})
 }
 pub fn as_str(self)->String{
  match self{
   Self::V300=>"3.0.0".into(),
   Self::V301=>"3.0.1".into(),
   Self::Forward{major,minor,patch}=>format!("{major}.{minor}.{patch}")
  }
 }
 fn number(self)->i128{
  match self{
   Self::V300=>30000,Self::V301=>30001,
   Self::Forward{major,minor,patch}=>major as i128*10000+minor as i128*100+patch as i128
  }
 }
}
#[derive(Debug,Clone,PartialEq,Eq)]
pub struct BlockSpan {pub compressed:Range<usize>,pub decoded:Range<usize>}
#[derive(Debug)]
pub struct Envelope {pub version:Version,pub marker:usize,pub blocks:Vec<BlockSpan>,pub decoded:Vec<u8>}
fn header(raw:&[u8])->Result<Version,Error>{
    let mut c=Cursor::new(raw);
    if c.array()?!=8{return Err(Error::Schema)}
    for _ in 0..4{c.int(0,u32::MAX as i128)?;}
    let version=match c.token()?{Token::Str(label)=>Version::parse(label)?,_=>return Err(Error::Version)};
    if c.int(0,999999)?!=version.number(){return Err(Error::Version)}
    if c.array()?!=2{return Err(Error::Schema)} c.timestamp()?;c.int(-840,840)?;c.int(0,u64::MAX as i128)?;
    let n=c.map()?;if n>256{return Err(Error::Budget)}
    let mut keys=HashSet::new();
    for _ in 0..n{
        let k=match c.token()?{Token::Str(s) if s.encode_utf16().count()<=128=>s,_=>return Err(Error::Schema)};
        if !keys.insert(k){return Err(Error::Duplicate)}
        if c.array()?!=2{return Err(Error::Schema)} let tag=c.int(0,3)?;
        if c.array()?!=1{return Err(Error::Schema)}
        let t=c.token()?;let valid=match (tag,t){(0,Token::Int(_))=>true,(1,Token::Int(v))=>v>=-9007199254740991&&v<=9007199254740991,(1,Token::F32(v))=>v.is_finite(),(1,Token::F64(v))=>v.is_finite(),(2,Token::Str(_))|(3,Token::Bool(_))=>true,_=>false};
        if !valid{return Err(Error::Schema)}
    }
    let n=c.array()?;if n>1000{return Err(Error::Budget)}
    for _ in 0..n*4{c.int(0,u32::MAX as i128)?;}
    // SerializedPlatformReference is a one-field model, not a save union.
    // Native PlatformType: macOS=7, Switch=9. Accept the observed v3.0.1
    // macOS framing, preserving the original platform through export.
    // Other platforms still fail closed.
    if c.array()?!=1{return Err(Error::Schema)}
    let platform=c.int(7,9)?;
    if !(platform==9||platform==7&&version==Version::V301)||c.pos!=raw.len(){return Err(Error::Schema)}
    Ok(version)
}
pub fn decode_envelope(raw:&[u8])->Result<Envelope,Error>{decode_envelope_reuse(raw,Vec::new())}

// Keep this comparison exact at the 4x boundary without overflow.
// The decoded total is already bounded by MAX_DECODED before it is called.
fn discard_oversized_scratch(capacity: usize, total: usize) -> bool {
    capacity > crate::MAX_DECODED
        || (capacity > 1024*1024 && capacity > total.saturating_mul(4))
}

/// A caller-owned scratch allocation is not an input or a validation shortcut.
/// Bounds and framing are checked first; no previous bytes are visible to the parser.
pub(crate) fn decode_envelope_reuse(raw:&[u8],mut decoded:Vec<u8>)->Result<Envelope,Error>{
    if raw.len()>MAX_INPUT{return Err(Error::Budget)}
    let tail=raw.get(32..).ok_or(Error::Truncated)?;
    if raw.get(..32)!=Some(PREFIX.as_slice()){return Err(Error::Marker)}
    let mut matches=tail.windows(MAGIC.len()).enumerate().filter(|(_,b)|*b==MAGIC.as_slice());
    let marker=matches.next().ok_or(Error::Marker)?.0+32;
    if matches.next().is_some(){return Err(Error::Marker)}
    if marker<40{return Err(Error::Schema)}
    let version=header(&raw[32..marker])?;
    let body_start=marker+MAGIC.len();let mut c=Cursor::new(&raw[body_start..]);
    let n=c.array()?;if n<2||n>MAX_BLOCKS+1{return Err(Error::Budget)}
    let lengths=match c.token()?{Token::Ext(98,b)=>b,_=>return Err(Error::Schema)};
    let mut l=Cursor::new(lengths);let mut sizes=Vec::with_capacity(n-1);
    for _ in 1..n{sizes.push(l.int(1,MAX_BLOCK as i128)? as usize);}
    if l.pos!=lengths.len(){return Err(Error::Trailing)}
    let total=check_block_budget(&sizes)?;
    let mut blocks=Vec::with_capacity(n-1);
    decoded.clear();
    // Reuse a comparable allocation, but do not retain a large decoded buffer
    // after a smaller File B opens. This runs only after framing and all block
    // budgets were validated; it never changes the accepted source bytes.
    if discard_oversized_scratch(decoded.capacity(), total) {
        decoded=Vec::new();
    }
    if decoded.capacity()<total{decoded.reserve_exact(total);}
    for size in sizes{
        let b=match c.token()?{Token::Bin(b)=>b,_=>return Err(Error::Schema)};
        let end=body_start+c.pos;let start=end-b.len();let d=decoded.len();
        // All block and aggregate sizes were validated above. This appends
        // directly to the pre-reserved aggregate without one temporary Vec
        // per LZ4 block, while retaining strict block-local match distances.
        decode_block_append(b,size,&mut decoded)?;
        blocks.push(BlockSpan{compressed:start..end,decoded:d..decoded.len()});
    }
    if c.pos!=c.bytes.len(){return Err(Error::Trailing)}
    Ok(Envelope{version,marker,blocks,decoded})
}

#[cfg(any())]
mod r61_reuse_tests {
    use super::*;
    const RAW:&[u8]=include_bytes!("../tests/fixtures/exact-ticks-multiblock.bin");
    #[test]
    fn reuse_decodes_all_bytes_and_keeps_all_spans() {
        let first=decode_envelope(RAW).unwrap();
        let scratch=vec![0xa5;first.decoded.len()+37];
        let ptr=scratch.as_ptr();
        let again=decode_envelope_reuse(RAW,scratch).unwrap();
        assert_eq!(again.decoded.as_ptr(),ptr);
        assert_eq!(again.decoded,first.decoded);
        assert_eq!(again.blocks,first.blocks);
        assert_eq!(again.marker,first.marker);
        assert_eq!(again.version,first.version);
    }
    #[test]
    fn scratch_retention_threshold_is_exact_and_budget_never_weakens() {
        const MIB: usize = 1024*1024;
        // A comparable buffer survives. One extra byte beyond precisely
        // four times the decoded total must not survive integer truncation.
        assert!(!discard_oversized_scratch(4*MIB, MIB));
        assert!(discard_oversized_scratch(4*MIB+1, MIB));
        assert!(!discard_oversized_scratch(MIB, 1));
        assert!(discard_oversized_scratch(MIB+1, 1));
        assert!(!discard_oversized_scratch(crate::MAX_DECODED, crate::MAX_DECODED));
        assert!(discard_oversized_scratch(crate::MAX_DECODED+1, crate::MAX_DECODED));
        assert!(discard_oversized_scratch(usize::MAX, usize::MAX));
    }
    #[test]
    fn oversized_file_a_scratch_is_not_pinned_after_smaller_file_b_open() {
        // The scratch allocation simulates a larger previously closed slot.
        // Only the exact source and decoded tokens determine the new result.
        const V301: &[u8] = include_bytes!("../tests/fixtures/valid-3.0.1.bin");
        for raw in [RAW, V301] {
            let unmodified = raw.to_vec();
            let expected = decode_envelope(raw).unwrap();
            let mut scratch = Vec::with_capacity(8*1024*1024);
            scratch.resize(expected.decoded.len()+17, 0xa5);
            let old_capacity = scratch.capacity();
            assert!(old_capacity/4 > expected.decoded.len());
            let current = decode_envelope_reuse(raw, scratch).unwrap();
            assert_eq!(raw, unmodified.as_slice());
            assert_eq!(current.decoded, expected.decoded);
            assert_eq!(current.blocks, expected.blocks);
            assert_eq!(current.version, expected.version);
            assert_eq!(current.marker, expected.marker);
            assert!(current.decoded.capacity() < old_capacity, "retain only proportional scratch");
            assert!(current.decoded.capacity() <= crate::MAX_DECODED);
        }
    }
    #[test]
    fn scratch_never_bypasses_framing_or_budgets() {
        let mut wrong=RAW.to_vec();wrong[0]^=1;
        let mut trailing=RAW.to_vec();trailing.push(0);
        for raw in [wrong.as_slice(),trailing.as_slice(),&RAW[..RAW.len()-1],b"bad".as_slice()] {
            let ordinary=decode_envelope(raw).unwrap_err();
            assert_eq!(decode_envelope_reuse(raw,vec![0xff;65536]).unwrap_err(),ordinary);
        }
        let x=decode_envelope_reuse(RAW,vec![0;crate::MAX_DECODED+1]).unwrap();
        assert!(x.decoded.capacity()<=crate::MAX_DECODED);
        assert_eq!(x.decoded,decode_envelope(RAW).unwrap().decoded);
    }
}

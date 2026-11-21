use crate::{archive::{ZipIndex,SLOT,ACCOUNT,MAX_ARCHIVE,crc32},envelope::Version,read_slot,ReadSlot,Error,MAX_INPUT,MAX_DECODED,MAX_BLOCK,MAX_BLOCKS,decode_block};
use crate::wire::{Cursor,Token};
use crate::achievement::{self,AchievementValue,AchievementEntry};
use std::{collections::{HashMap,HashSet},ops::Range};

const MAX_TICKS:i64=3_155_378_975_999_999_999;
const MAX_UNDO:usize=256;

#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub struct Entry {pub id:i32,pub ticks:i64}
#[derive(Clone,Copy,Debug)]
enum Change {
 Collection{id:i32,before:Option<Option<i64>>,after:Option<Option<i64>>},
 Achievement{guid:[u32;4],before:Option<AchievementValue>,after:Option<AchievementValue>},
}

pub struct Editor {
 original:Vec<u8>,
 zip:Option<ZipIndex>,
 slot_raw:Vec<u8>,
 slot:ReadSlot,
 base:HashMap<i32,i64>,
 entries:Vec<Entry>,
 changes:HashMap<i32,Option<i64>>,
 achievement_changes:HashMap<[u32;4],AchievementValue>,
 undo:Vec<Change>,
 redo:Vec<Change>,
 revision:u32,
}

impl Editor {
 pub fn open(original:Vec<u8>)->Result<Self,Error>{
  if original.is_empty() || original.len()>MAX_ARCHIVE {return Err(Error::Budget)}
  let (zip,slot_raw)=if original.starts_with(b"PK\x03\x04") {
   let z=ZipIndex::parse(&original)?;
   if !z.entries.iter().any(|x|x.name==SLOT) || !z.entries.iter().any(|x|x.name==ACCOUNT){return Err(Error::Schema)}
   let (s,_)=z.targets(&original)?;
   (Some(z),s.ok_or(Error::Schema)?)
  } else {
   if original.len()>MAX_INPUT{return Err(Error::Budget)}
   (None,original.clone())
  };
  let slot=read_slot(&slot_raw)?;
  if !Self::compatible(&slot) {return Err(Error::Version)}
  let mut base=HashMap::new();let mut entries=Vec::with_capacity(slot.index.collections.len());
  for row in &slot.index.collections {
   if base.insert(row.id,row.ticks).is_some(){return Err(Error::Duplicate)}
   entries.push(Entry{id:row.id,ticks:row.ticks});
  }
  Ok(Self{original,zip,slot_raw,slot,base,entries,changes:HashMap::new(),achievement_changes:HashMap::new(),undo:Vec::new(),redo:Vec::new(),revision:0})
 }
 fn compatible(slot:&ReadSlot)->bool{
  let n=slot.index.collection_version.as_ref().map(|v|v.number);
  n==Some(match slot.envelope.version{Version::V300=>83,Version::V301=>87})
   &&slot.index.collection_map.is_some()
 }
 pub fn version(&self)->&'static str {self.slot.envelope.version.as_str()}
 pub fn source_bytes(&self)->usize {self.original.len()}
 pub fn revision(&self)->u32 {self.revision}
 pub fn is_zip(&self)->bool {self.zip.is_some()}
 pub fn entries(&self)->Vec<Entry>{
  let mut result=Vec::with_capacity(self.entries.len()+self.changes.len());
  for x in &self.entries {
   if let Some(ticks)=self.value(x.id) {result.push(Entry{id:x.id,ticks})}
  }
  let mut appended:Vec<_>=self.changes.iter().filter_map(|(&id,&v)|{
   if self.base.contains_key(&id){None}else{v.map(|ticks|Entry{id,ticks})}
  }).collect();
  appended.sort_by_key(|x|x.id);result.extend(appended);result
 }
 pub fn value(&self,id:i32)->Option<i64>{
  match self.changes.get(&id){Some(v)=>*v,None=>self.base.get(&id).copied()}
 }
 pub fn achievements(&self)->Vec<AchievementEntry>{
  self.slot.index.achievements.iter().filter_map(|model|{
   let value=self.achievement_changes.get(&model.guid).copied().or_else(||achievement::value(model).ok())?;
   Some(AchievementEntry{guid:model.guid,value})
  }).collect()
 }
 pub fn achievement_value(&self,guid:[u32;4])->Option<AchievementValue>{
  self.achievement_changes.get(&guid).copied().or_else(||self.slot.index.achievements.iter().find(|m|m.guid==guid).and_then(|m|achievement::value(m).ok()))
 }
 pub fn dirty(&self)->bool {!self.changes.is_empty()||!self.achievement_changes.is_empty()}
 pub fn can_undo(&self)->bool {!self.undo.is_empty()}
 pub fn can_redo(&self)->bool {!self.redo.is_empty()}
 pub fn can_change_membership(&self)->bool {self.slot.index.deprecated_map.is_some() && self.slot.index.deprecated_count==0 && self.slot.index.deprecated.is_empty()}
 pub fn change(&mut self,id:i32,expected:Option<i64>,next:Option<i64>)->Result<(),Error>{
  if id<=0 || id==i32::MAX || self.value(id)!=expected || next==expected {return Err(Error::Schema)}
  if (expected.is_none() || next.is_none()) && !self.can_change_membership(){return Err(Error::Schema)}
  if expected.is_none() && next.is_some() && (self.slot.envelope.version!=Version::V301 || !crate::catalog::eligible_for_new_history(id)){return Err(Error::Schema)}
  if let Some(t)=next {if !(1..=MAX_TICKS).contains(&t){return Err(Error::Schema)}}
  if expected.is_none() && self.entries.len()+self.changes.len()>=1_000_000 {return Err(Error::Budget)}
  let before=self.changes.get(&id).copied();
  let after=if self.base.get(&id).copied()==next {None}else{Some(next)};
  match after {Some(t)=>{self.changes.insert(id,t);},None=>{self.changes.remove(&id);}}
  self.undo.push(Change::Collection{id,before,after});if self.undo.len()>MAX_UNDO{self.undo.remove(0);}
  self.redo.clear();self.revision=self.revision.checked_add(1).ok_or(Error::Overflow)?;
  Ok(())
 }
 pub fn change_achievement(&mut self,guid:[u32;4],expected:AchievementValue,next:AchievementValue)->Result<(),Error>{
  if !achievement::valid(next) || expected==next || self.achievement_value(guid)!=Some(expected){return Err(Error::Schema)}
  let model=self.slot.index.achievements.iter().find(|m|m.guid==guid).ok_or(Error::Schema)?;
  let original=achievement::value(model)?;
  let before=self.achievement_changes.get(&guid).copied();
  let after=if next==original{None}else{Some(next)};
  match after {Some(v)=>{self.achievement_changes.insert(guid,v);},None=>{self.achievement_changes.remove(&guid);}}
  self.undo.push(Change::Achievement{guid,before,after});
  if self.undo.len()>MAX_UNDO{self.undo.remove(0);}
  self.redo.clear();self.revision=self.revision.checked_add(1).ok_or(Error::Overflow)?;
  Ok(())
 }
 fn restore_change(&mut self,change:&Change,reverse:bool){
  match *change {
   Change::Collection{id,before,after}=>{
    match if reverse{before}else{after}{
     Some(v)=>{self.changes.insert(id,v);},None=>{self.changes.remove(&id);}
    }
   },
   Change::Achievement{guid,before,after}=>{
    match if reverse{before}else{after}{
     Some(v)=>{self.achievement_changes.insert(guid,v);},None=>{self.achievement_changes.remove(&guid);}
    }
   }
  }
 }
 pub fn undo(&mut self)->bool {
  let Some(change)=self.undo.pop() else{return false};
  self.restore_change(&change,true);self.redo.push(change);
  self.revision=self.revision.wrapping_add(1);true
 }
 pub fn redo(&mut self)->bool {
  let Some(change)=self.redo.pop() else{return false};
  self.restore_change(&change,false);self.undo.push(change);
  self.revision=self.revision.wrapping_add(1);true
 }
 pub fn reset(&mut self){self.changes.clear();self.achievement_changes.clear();self.undo.clear();self.redo.clear();self.revision=self.revision.wrapping_add(1)}
 pub fn export(&self)->Result<Vec<u8>,Error>{
  if !self.dirty(){return Err(Error::Schema)}
  let original_payload=&self.slot.envelope.decoded;
  let mut patches:Vec<achievement::Replacement>=Vec::new();
  if !self.changes.is_empty(){
   let map=self.slot.index.collection_map.clone().ok_or(Error::Schema)?;
   let updated=replace_map(original_payload,map.clone(),&self.slot.index.collections,&self.entries())?;
   let inserted=updated.len().checked_sub(original_payload.len()-map.len()).ok_or(Error::Overflow)?;
   if updated[..map.start]!=original_payload[..map.start]||updated[map.start+inserted..]!=original_payload[map.end..]{return Err(Error::Schema)}
   patches.push((map.clone(),updated[map.start..map.start+inserted].to_vec()));
  }
  for model in &self.slot.index.achievements {
   if let Some(value)=self.achievement_changes.get(&model.guid){
    patches.extend(achievement::replacements(model,*value)?);
   }
  }
  let (next_payload,first)=achievement::splice(original_payload,patches)?;
  if next_payload==*original_payload{return Err(Error::Schema)}
  let new_slot=encode_slot(&self.slot_raw,&self.slot,&next_payload,first)?;
  let reread=read_slot(&new_slot)?;
  if !Self::compatible(&reread)||reread.envelope.version!=self.slot.envelope.version{return Err(Error::Schema)}
  let expected=self.entries();
  if reread.index.collections.len()!=expected.len() ||
   !reread.index.collections.iter().zip(&expected).all(|(r,e)|r.id==e.id&&r.ticks==e.ticks) {return Err(Error::Schema)}
  let expected_achievements=self.achievements();
  if reread.index.achievements.len()!=expected_achievements.len() ||
   !reread.index.achievements.iter().zip(&expected_achievements).all(|(r,e)|r.guid==e.guid&&achievement::value(r).ok()==Some(e.value)){return Err(Error::Schema)}
  if reread.index.counters.len()!=self.slot.index.counters.len() ||
   !reread.index.counters.iter().zip(&self.slot.index.counters).all(|(a,b)|a.guid==b.guid&&a.state==b.state){return Err(Error::Schema)}
  if self.zip.is_none(){return Ok(new_slot)}
  let zip=self.zip.as_ref().unwrap();
  let candidate=replace_zip(&self.original,zip,&new_slot)?;
  let newzip=ZipIndex::parse(&candidate)?;
  if newzip.entries.len()!=zip.entries.len(){return Err(Error::Schema)}
  for (i,e) in zip.entries.iter().enumerate(){
   let f=&newzip.entries[i];
   if e.name!=f.name {return Err(Error::Schema)}
   if e.name==SLOT {
    if newzip.extract(&candidate,i)?!=new_slot{return Err(Error::Schema)}
   }else{
    if self.original[e.local.clone()]!=candidate[f.local.clone()] ||
      zip.extract(&self.original,i)?!=newzip.extract(&candidate,i)?{return Err(Error::Schema)}
   }
  }
  Ok(candidate)
 }

}

fn mp_map_len(n:usize)->Result<Vec<u8>,Error>{
 if n>1_000_000{return Err(Error::Budget)}
 if n<16{return Ok(vec![0x80|n as u8])}
 if n<=65535{let mut v=vec![0xde];v.extend((n as u16).to_be_bytes());return Ok(v)}
 let mut v=vec![0xdf];v.extend((n as u32).to_be_bytes());Ok(v)
}
fn encode_pair(id:i32,ticks:i64)->[u8;14]{
 let mut v=[0u8;14];v[0]=0xd2;v[1..5].copy_from_slice(&id.to_be_bytes());v[5]=0xd3;v[6..14].copy_from_slice(&ticks.to_be_bytes());v
}
fn replace_map(raw:&[u8],map:Range<usize>,before:&[crate::native::CollectionEntry],after:&[Entry])->Result<Vec<u8>,Error>{
 if map.start>=map.end||map.end>raw.len(){return Err(Error::Schema)}
 let mut cursor=Cursor::new(&raw[map.clone()]);
 if cursor.map()?!=before.len(){return Err(Error::Schema)}
 let body_start=map.start+cursor.pos;
 let mut at=body_start;
 let mut old=HashMap::new();
 for r in before{
  if r.pair.start!=at||r.pair.end>map.end||r.pair.end<=r.pair.start||r.value.start<r.pair.start||r.value.end!=r.pair.end{return Err(Error::Schema)}
  old.insert(r.id,r);at=r.pair.end;
 }
 if at!=map.end||old.len()!=before.len(){return Err(Error::Schema)}
 let mut seen=HashSet::new();
 for x in after{
  if !seen.insert(x.id){return Err(Error::Schema)}
  if !old.contains_key(&x.id)&&!(1..=MAX_TICKS).contains(&x.ticks){return Err(Error::Schema)}
 }
 let mut out=Vec::with_capacity(raw.len().saturating_add(after.len().saturating_mul(14)));
 out.extend_from_slice(&raw[..map.start]);out.extend(mp_map_len(after.len())?);
 for x in after{
  if let Some(b)=old.get(&x.id){
   if x.ticks==b.ticks{out.extend_from_slice(&raw[b.pair.clone()])}
   else{
    out.extend_from_slice(&raw[b.pair.start..b.value.start]);
    out.push(0xd3);out.extend(x.ticks.to_be_bytes());
   }
  }else{out.extend(encode_pair(x.id,x.ticks));}
  if out.len()>MAX_DECODED{return Err(Error::Budget)}
 }
 out.extend_from_slice(&raw[map.end..]);
 if out.len()>MAX_DECODED{return Err(Error::Budget)}
 Ok(out)
}

fn push_lz4_length(dst:&mut Vec<u8>,mut len:usize){while len>=255 {dst.push(255);len-=255;}dst.push(len as u8)}
fn literal_block(s:&[u8],start:usize)->Vec<u8>{
 let n=s.len()-start;
 let mut out=vec![(n.min(15)as u8)<<4];
 if n>=15{push_lz4_length(&mut out,n-15)}
 out.extend(&s[start..]);out
}
fn compress(s:&[u8])->Result<Vec<u8>,Error>{
 if s.is_empty()||s.len()>MAX_BLOCK{return Err(Error::Budget)}
 let literal=literal_block(s,0);
 if s.len()<13{return Ok(literal)}
 let mut hist=vec![usize::MAX;65536];
 let hash=|p:usize|->usize{(u32::from_le_bytes(s[p..p+4].try_into().unwrap()).wrapping_mul(0x9e3779b1)>>16)as usize};
 let mut out=Vec::new();let (mut anchor,mut p)=(0,0);
 let last=s.len()-12;let limit=s.len()-5;
 while p<=last{
  let h=hash(p);let prev=hist[h];hist[h]=p;
  if prev==usize::MAX||p-prev>65535||s[prev..prev+4]!=s[p..p+4]{p+=1;continue}
  let mut m=4;while p+m<limit&&s[prev+m]==s[p+m]{m+=1}
  let n=p-anchor;out.push(((n.min(15)as u8)<<4)|((m-4).min(15)as u8));
  if n>=15{push_lz4_length(&mut out,n-15)}
  out.extend(&s[anchor..p]);out.extend(((p-prev)as u16).to_le_bytes());
  if m-4>=15{push_lz4_length(&mut out,m-19)}
  let end=p+m;for k in p+1..end.min(last+1){hist[hash(k)]=k}
  anchor=end;p=end;
 }
 out.extend(literal_block(s,anchor));
 if out.len()>=literal.len(){out=literal}
 if decode_block(&out,s.len())?!=s{return Err(Error::Schema)}
 Ok(out)
}
fn mp_bin(bytes:&[u8],out:&mut Vec<u8>)->Result<(),Error>{
 out.push(0xc6);out.extend(u32::try_from(bytes.len()).map_err(|_|Error::Budget)?.to_be_bytes());out.extend(bytes);Ok(())
}
fn encode_slot(original:&[u8],parsed:&ReadSlot,decoded:&[u8],first_change:usize)->Result<Vec<u8>,Error>{
 let e=&parsed.envelope;
 let first=e.blocks.iter().position(|b|b.decoded.end>first_change).ok_or(Error::Schema)?;
 let prefix=e.blocks[first].decoded.start;
 if decoded.len()<prefix||decoded[..prefix]!=e.decoded[..prefix]{return Err(Error::Schema)}
 let mut encoded=Vec::new();let mut lengths=Vec::new();
 for b in &e.blocks[..first]{
  encoded.push(original[b.compressed.clone()].to_vec());
  lengths.push(b.decoded.len());
 }
 let limit=if e.blocks.iter().any(|b|b.decoded.len()>32768){65536}else{32768};
 for block in decoded[prefix..].chunks(limit){
  encoded.push(compress(block)?);lengths.push(block.len());
 }
 if lengths.len()>MAX_BLOCKS||lengths.is_empty(){return Err(Error::Budget)}
 let start=e.marker.checked_add(32).ok_or(Error::Overflow)?;
 let mut out=original[..start].to_vec();
 let count=lengths.len()+1;
 if count<16{out.push(0x90|count as u8)}
 else{out.push(0xdc);out.extend((count as u16).to_be_bytes())}
 let mut ext=Vec::new();
 for &n in &lengths{
  if n==0||n>MAX_BLOCK{return Err(Error::Budget)}
  if n<=65535 {ext.push(0xcd);ext.extend((n as u16).to_be_bytes())}
  else{ext.push(0xce);ext.extend((n as u32).to_be_bytes())}
 }
 out.push(0xc8);out.extend((ext.len() as u16).to_be_bytes());out.push(98);out.extend(ext);
 for block in &encoded{mp_bin(block,&mut out)?;if out.len()>MAX_INPUT{return Err(Error::Budget)}}
 let reread=read_slot(&out)?;
 if reread.envelope.decoded!=decoded||reread.envelope.version!=e.version{return Err(Error::Schema)}
 Ok(out)
}
fn put16(x:&mut[u8],p:usize,n:u16){x[p..p+2].copy_from_slice(&n.to_le_bytes())}
fn put32(x:&mut[u8],p:usize,n:u32){x[p..p+4].copy_from_slice(&n.to_le_bytes())}
fn replace_zip(raw:&[u8],z:&ZipIndex,replacement:&[u8])->Result<Vec<u8>,Error>{
 let target=z.entries.iter().position(|e|e.name==SLOT).ok_or(Error::Schema)?;
 let mut order:Vec<_>=(0..z.entries.len()).collect();order.sort_by_key(|&i|z.entries[i].local.start);
 let mut at=0;
 for &i in &order{if z.entries[i].local.start!=at{return Err(Error::Schema)}at=z.entries[i].local.end}
 if at!=z.central.start{return Err(Error::Schema)}
 let n=u32::try_from(replacement.len()).map_err(|_|Error::Budget)?;let crc=crc32(replacement);
 let mut out=Vec::new();let mut offsets=HashMap::new();
 for i in order{
  let e=&z.entries[i];offsets.insert(i,u32::try_from(out.len()).map_err(|_|Error::Budget)?);
  if i!=target {out.extend_from_slice(&raw[e.local.clone()]);continue}
  let mut head=raw[e.local.start..e.compressed.start].to_vec();
  put16(&mut head,8,0);
  if e.flags&8!=0{put32(&mut head,14,0);put32(&mut head,18,0);put32(&mut head,22,0)}
  else{put32(&mut head,14,crc);put32(&mut head,18,n);put32(&mut head,22,n)}
  out.extend(head);out.extend(replacement);
  if e.flags&8!=0{
   if e.local.end-e.compressed.end==16{out.extend(0x08074b50u32.to_le_bytes())}
   else if e.local.end-e.compressed.end!=12{return Err(Error::Schema)}
   out.extend(crc.to_le_bytes());out.extend(n.to_le_bytes());out.extend(n.to_le_bytes());
  }
 }
 let central=out.len();
 for (i,e) in z.entries.iter().enumerate(){
  let mut data=raw[e.central.clone()].to_vec();
  put32(&mut data,42,*offsets.get(&i).ok_or(Error::Schema)?);
  if i==target{put16(&mut data,10,0);put32(&mut data,16,crc);put32(&mut data,20,n);put32(&mut data,24,n)}
  out.extend(data);
 }
 let size=out.len()-central;
 let mut footer=raw[z.eocd.clone()].to_vec();
 put32(&mut footer,12,size as u32);put32(&mut footer,16,central as u32);out.extend(footer);
 if out.len()>MAX_ARCHIVE{return Err(Error::Budget)}
 Ok(out)
}

#[cfg(test)]
mod tests {
 use super::*;
 #[test]
 fn reencode_and_decode_lz4_roundtrip(){
  for size in [1,12,100,32768,65536]{
   let src=(0..size).map(|i|(i%47)as u8).collect::<Vec<_>>();
   let c=compress(&src).unwrap();assert_eq!(decode_block(&c,src.len()).unwrap(),src);
  }
 }
 #[test]
 fn map_header_works(){
  assert_eq!(mp_map_len(1).unwrap(),[0x81]);
  assert_eq!(mp_map_len(16).unwrap(),[0xde,0,16]);
 }
}

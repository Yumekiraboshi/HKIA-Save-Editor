use crate::{native::{Model,ModelState},Error};
use std::ops::Range;

#[derive(Clone,Copy,Debug,PartialEq)]
pub struct AchievementValue {
 pub complete:bool,
 pub current:f32,
 pub completed:Option<(i64,u32)>,
}
#[derive(Clone,Copy,Debug,PartialEq)]
pub struct AchievementEntry {
 pub guid:[u32;4],
 pub value:AchievementValue,
}
pub fn value(model:&Model)->Result<AchievementValue,Error>{
 match &model.state {
  ModelState::Achievement{complete,current,completed}=>Ok(AchievementValue{complete:*complete,current:*current,completed:*completed}),
  _=>Err(Error::Schema),
 }
}
pub fn valid(v:AchievementValue)->bool{
 v.current.is_finite() && v.current>=0.0 &&
 v.completed.map_or(true,|(secs,nanos)| (0..=253402300799).contains(&secs)&&nanos<1_000_000_000)
}
pub type Replacement=(Range<usize>,Vec<u8>);
pub fn replacements(model:&Model,next:AchievementValue)->Result<Vec<Replacement>,Error>{
 if !valid(next){return Err(Error::Schema)}
 let before=value(model)?;
 let mut patches=Vec::new();
 if before.complete!=next.complete {
  patches.push((model.fields[0].bytes.clone(),vec![if next.complete{0xc3}else{0xc2}]));
 }
 if before.current.to_bits()!=next.current.to_bits() {
  let mut bytes=vec![0xca];bytes.extend(next.current.to_bits().to_be_bytes());
  patches.push((model.fields[1].bytes.clone(),bytes));
 }
 if before.completed!=next.completed {
  let bytes=if let Some((secs,nanos))=next.completed {
   let mut b=vec![0xc7,12,0xff];
   b.extend(nanos.to_be_bytes());b.extend(secs.to_be_bytes());b
  }else{vec![0xc0]};
  patches.push((model.fields[2].bytes.clone(),bytes));
 }
 Ok(patches)
}
pub fn splice(raw:&[u8],mut patches:Vec<Replacement>)->Result<(Vec<u8>,usize),Error>{
 if patches.is_empty(){return Err(Error::Schema)}
 patches.sort_by_key(|(span,_)|span.start);
 let first=patches[0].0.start;
 let mut cursor=0usize;
 let mut result=Vec::with_capacity(raw.len());
 for (span,bytes) in patches {
  if span.start<cursor||span.end<=span.start||span.end>raw.len(){return Err(Error::Schema)}
  result.extend_from_slice(&raw[cursor..span.start]);
  result.extend(bytes);
  if result.len()>crate::MAX_DECODED{return Err(Error::Budget)}
  cursor=span.end;
 }
 result.extend_from_slice(&raw[cursor..]);
 if result.len()>crate::MAX_DECODED{return Err(Error::Budget)}
 Ok((result,first))
}

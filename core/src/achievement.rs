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
 v.completed.map_or(true,|(secs,nanos)| (0..=253402300799).contains(&secs)&&nanos<1_000_000_000&&nanos%100==0)
}
/// The authoritative Steam v3.0.1 single-click edit planner. The browser
/// supplies only a source GUID and the user's click time. Rust derives the
/// goal from native source data, clamps progress, and never changes counters,
/// reward receipts or unrelated achievement documents.
pub fn plan_toggle_v301(
 guid:[u32;4],before:AchievementValue,now_ms:i64
)->Result<AchievementValue,Error>{
 if !valid(before)||!(0..=253_402_300_799_000).contains(&now_ms) {return Err(Error::Schema)}
 let goal=crate::achievement_keys::progress_goal_v301(guid).ok_or(Error::Schema)?;
 let after=if before.complete{
  AchievementValue{complete:false,current:before.current.min(goal-1.0),completed:None}
 }else{
  AchievementValue{complete:true,current:goal,
   completed:Some((now_ms/1000,(now_ms%1000) as u32*1_000_000))}
 };
 if !valid(after){return Err(Error::Schema)}
 Ok(after)
}

#[cfg(test)]mod native_toggle_tests{
 use super::*;
 #[test]fn source_goal_and_clock_cas_values_are_precise(){
  // Source GUID with goal=100; the saved state is not rewritten by planning.
  let guid=[15182560,1296854392,3253409457,3976879535];
  let before=AchievementValue{complete:false,current:999.0,completed:None};
  let after=plan_toggle_v301(guid,before,1_795_251_723_456).unwrap();
  assert_eq!(after,AchievementValue{complete:true,current:100.0,
    completed:Some((1_795_251_723,456_000_000))});
  assert_eq!(before.current,999.0);
  assert_eq!(plan_toggle_v301(guid,after,1_795_251_723_999).unwrap(),
   AchievementValue{complete:false,current:99.0,completed:None});
  assert!(plan_toggle_v301([0;4],before,1_795_251_723_456).is_err());
  assert!(plan_toggle_v301(guid,before,-1).is_err());
  assert!(plan_toggle_v301(guid,before,253_402_300_799_001).is_err());
 }
 #[test]fn category_uses_actual_native_child_count_not_sentinel(){
  // First sorted parent has 5 children, despite native counter sentinel 1.
  let parent=[30428184,1076928834,1057870521,3896485919];
  let after=plan_toggle_v301(parent,AchievementValue{
   complete:false,current:0.0,completed:None},1_795_251_723_456).unwrap();
  assert_eq!(after.current,5.0);
 }
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

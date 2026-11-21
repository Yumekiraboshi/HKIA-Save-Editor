use hkia_save_core::{collection::Editor,archive::MAX_ARCHIVE};
use std::cell::RefCell;

struct State {
 stage: Vec<u8>,
 editor: Option<Editor>,
 reply: Vec<u8>,
 output: Vec<u8>,
}
impl State {
 fn new()->Self{Self{stage:Vec::new(),editor:None,reply:Vec::new(),output:Vec::new()}}
}
thread_local! {static STATE:RefCell<State>=RefCell::new(State::new());}

#[no_mangle]
pub extern "C" fn hkia_stage(len:u32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.stage.clear();a.reply.clear();a.output.clear();
  if len==0||len as usize>MAX_ARCHIVE{return 0}
  a.stage=vec![0;len as usize];a.stage.as_mut_ptr() as usize as u32
 })
}
#[no_mangle]
pub extern "C" fn hkia_open()->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();
  a.editor=None;a.output.clear();a.reply.clear();
  let input=std::mem::take(&mut a.stage);
  match Editor::open(input){Ok(e)=>{a.editor=Some(e);0},Err(_)=>1}
 })
}
#[no_mangle]
pub extern "C" fn hkia_change(id:i32,expected_present:u32,expected_ticks:i64,next_present:u32,next_ticks:i64)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();a.output.clear();
  if expected_present>1||next_present>1{return 1}
  let before=if expected_present==1{Some(expected_ticks)}else{None};
  let after=if next_present==1{Some(next_ticks)}else{None};
  match a.editor.as_mut().map(|e|e.change(id,before,after)){
   Some(Ok(()))=>0,_=>1
  }
 })
}

// Source-validated, version-gated new AchievementModel (Union 16).
#[no_mangle]
pub extern "C" fn hkia_achievement_create(
 g0:u32,g1:u32,g2:u32,g3:u32,
 complete:u32,progress:f32,seconds:i64,nanos:u32,has_date:u32
)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();a.output.clear();
  if complete!=1||has_date!=1{return 1}
  let value=hkia_save_core::achievement::AchievementValue{
   complete:true,current:progress,completed:Some((seconds,nanos))
  };
  match a.editor.as_mut().map(|e|e.create_achievement([g0,g1,g2,g3],value)){
   Some(Ok(()))=>0,_=>1
  }
 })
}
// Create the missing last child and complete an existing parent in one Undo.
#[no_mangle]
pub extern "C" fn hkia_achievement_create_parent(
 g0:u32,g1:u32,g2:u32,g3:u32,
 complete:u32,progress:f32,seconds:i64,nanos:u32,has_date:u32,
 p0:u32,p1:u32,p2:u32,p3:u32,
 before_complete:u32,before_progress:f32,before_seconds:i64,before_nanos:u32,before_has_date:u32,
 after_complete:u32,after_progress:f32,after_seconds:i64,after_nanos:u32,after_has_date:u32
)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();a.output.clear();
  if complete!=1||has_date!=1||[before_complete,before_has_date,after_complete,after_has_date].iter().any(|&x|x>1){return 1}
  let child=hkia_save_core::achievement::AchievementValue{
   complete:true,current:progress,completed:Some((seconds,nanos))
  };
  let before=hkia_save_core::achievement::AchievementValue{
   complete:before_complete==1,current:before_progress,
   completed:if before_has_date==1{Some((before_seconds,before_nanos))}else{None}
  };
  let after=hkia_save_core::achievement::AchievementValue{
   complete:after_complete==1,current:after_progress,
   completed:if after_has_date==1{Some((after_seconds,after_nanos))}else{None}
  };
  match a.editor.as_mut().map(|e|e.create_achievement_with_parent([g0,g1,g2,g3],child,[p0,p1,p2,p3],before,after)){
   Some(Ok(()))=>0,_=>1
  }
 })
}

#[no_mangle]
pub extern "C" fn hkia_achievement_change(
 g0:u32,g1:u32,g2:u32,g3:u32,
 before_complete:u32,before_progress:f32,before_seconds:i64,before_nanos:u32,before_has_date:u32,
 after_complete:u32,after_progress:f32,after_seconds:i64,after_nanos:u32,after_has_date:u32,
)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();a.output.clear();
  if before_complete>1||after_complete>1||before_has_date>1||after_has_date>1{return 1}
  let before=hkia_save_core::achievement::AchievementValue{
   complete:before_complete==1,current:before_progress,
   completed:if before_has_date==1{Some((before_seconds,before_nanos))}else{None},
  };
  let after=hkia_save_core::achievement::AchievementValue{
   complete:after_complete==1,current:after_progress,
   completed:if after_has_date==1{Some((after_seconds,after_nanos))}else{None},
  };
  match a.editor.as_mut().map(|e|e.change_achievement([g0,g1,g2,g3],before,after)){
   Some(Ok(()))=>0,_=>1,
  }
 })
}
/// Single-transaction leaf + parent achievement mutation.
#[no_mangle]
pub extern "C" fn hkia_achievement_pair_change(
 a0:u32,a1:u32,a2:u32,a3:u32,
 abc:u32,abp:f32,abs:i64,abn:u32,abh:u32,
 aac:u32,aap:f32,aas:i64,aan:u32,aah:u32,
 b0:u32,b1:u32,b2:u32,b3:u32,
 bbc:u32,bbp:f32,bbs:i64,bbn:u32,bbh:u32,
 bac:u32,bap:f32,bas:i64,ban:u32,bah:u32
)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();a.output.clear();
  if [abc,abh,aac,aah,bbc,bbh,bac,bah].iter().any(|&n|n>1){return 1}
  let first=(
   [a0,a1,a2,a3],
   hkia_save_core::achievement::AchievementValue{
    complete:abc==1,current:abp,completed:if abh==1{Some((abs,abn))}else{None}
   },
   hkia_save_core::achievement::AchievementValue{
    complete:aac==1,current:aap,completed:if aah==1{Some((aas,aan))}else{None}
   }
  );
  let second=(
   [b0,b1,b2,b3],
   hkia_save_core::achievement::AchievementValue{
    complete:bbc==1,current:bbp,completed:if bbh==1{Some((bbs,bbn))}else{None}
   },
   hkia_save_core::achievement::AchievementValue{
    complete:bac==1,current:bap,completed:if bah==1{Some((bas,ban))}else{None}
   }
  );
  match a.editor.as_mut().map(|e|e.change_achievement_pair(first,second)){
   Some(Ok(()))=>0,_=>1
  }
 })
}

#[no_mangle]
pub extern "C" fn hkia_achievement_snapshot()->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(e)=a.editor.as_ref() else{return 1};
  let rows=e.achievements();
  if rows.len()>1_000_000{return 1}
  let mut bytes=Vec::with_capacity(4+rows.len()*34);
  bytes.extend((rows.len()as u32).to_le_bytes());
  for row in rows {
   for g in row.guid {bytes.extend(g.to_le_bytes());}
   bytes.push(u8::from(row.value.complete));
   bytes.extend(row.value.current.to_bits().to_le_bytes());
   bytes.push(u8::from(row.value.completed.is_some()));
   let (secs,nanos)=row.value.completed.unwrap_or((0,0));
   bytes.extend(secs.to_le_bytes());
   bytes.extend(nanos.to_le_bytes());
  }
  a.reply=bytes;0
 })
}

#[no_mangle]
pub extern "C" fn hkia_counter_snapshot()->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(e)=a.editor.as_ref() else{return 1};
  let counters=e.counters();
  if counters.len()>100_000{return 1}
  let mut bytes=Vec::with_capacity(4+counters.len()*28);
  bytes.extend((counters.len()as u32).to_le_bytes());
  for row in counters {
   let count=match row.counted_values {None=>-1i32,Some(n)=>match i32::try_from(n){Ok(n)=>n,Err(_)=>return 1}};
   let guids=match u32::try_from(row.counted_guids){Ok(n)=>n,Err(_)=>return 1};
   for g in row.guid{bytes.extend(g.to_le_bytes());}
   bytes.extend(row.current.to_bits().to_le_bytes());
   bytes.extend(count.to_le_bytes());
   bytes.extend(guids.to_le_bytes());
  }
  a.reply=bytes;0
 })
}

#[no_mangle]
pub extern "C" fn hkia_undo()->u32{
 STATE.with(|s|{let mut a=s.borrow_mut();a.reply.clear();a.output.clear();match a.editor.as_mut(){Some(e)=>if e.undo(){0}else{1},None=>1}})
}
#[no_mangle]
pub extern "C" fn hkia_redo()->u32{
 STATE.with(|s|{let mut a=s.borrow_mut();a.reply.clear();a.output.clear();match a.editor.as_mut(){Some(e)=>if e.redo(){0}else{1},None=>1}})
}
#[no_mangle]
pub extern "C" fn hkia_reset()->u32{
 STATE.with(|s|{let mut a=s.borrow_mut();a.reply.clear();a.output.clear();match a.editor.as_mut(){Some(e)=>{e.reset();0},None=>1}})
}
#[no_mangle]
pub extern "C" fn hkia_snapshot()->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(e)=a.editor.as_ref() else{return 1};
  let rows=e.entries();
  if rows.len()>1_000_000{return 1}
  let mut bytes=Vec::with_capacity(17+rows.len()*12);
  bytes.push(if e.version()=="3.0.0"{1}else{2});
  bytes.push(u8::from(e.is_zip()) | (u8::from(e.can_change_membership())<<1));bytes.push(u8::from(e.dirty()));
  bytes.push(u8::from(e.can_undo()));bytes.push(u8::from(e.can_redo()));
  bytes.extend(e.revision().to_le_bytes());
  bytes.extend((e.source_bytes()as u32).to_le_bytes());
  bytes.extend((rows.len()as u32).to_le_bytes());
  for row in rows {bytes.extend(row.id.to_le_bytes());bytes.extend(row.ticks.to_le_bytes());}
  a.reply=bytes;0
 })
}
#[no_mangle]
pub extern "C" fn hkia_export()->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.output.clear();
  let Some(e)=a.editor.as_ref() else{return 1};
  let file=match e.export(){Ok(x)=>x,Err(_)=>return 2};
  a.output=file;0
 })
}
#[no_mangle]
pub extern "C" fn hkia_reply_ptr()->u32{STATE.with(|s|s.borrow().reply.as_ptr() as usize as u32)}
#[no_mangle]
pub extern "C" fn hkia_reply_len()->u32{STATE.with(|s|s.borrow().reply.len()as u32)}
#[no_mangle]
pub extern "C" fn hkia_output_ptr()->u32{STATE.with(|s|s.borrow().output.as_ptr() as usize as u32)}
#[no_mangle]
pub extern "C" fn hkia_output_len()->u32{STATE.with(|s|s.borrow().output.len()as u32)}
#[no_mangle]
pub extern "C" fn hkia_clear(){STATE.with(|s|*s.borrow_mut()=State::new());}

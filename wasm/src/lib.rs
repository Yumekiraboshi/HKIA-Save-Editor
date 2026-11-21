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

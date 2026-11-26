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
/// Export the native can-create allowlist for the CURRENT local save.
/// Reply wire format: u32 count + count LE i32 IDs; read-only and side
/// effect free. Never infer collection eligibility from item display flags.
#[no_mangle]
pub extern "C" fn hkia_collection_creatable_snapshot()->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(editor)=a.editor.as_ref() else{return 1};
  let ids=editor.creatable_collection_history_ids();
  if ids.len()>100_000{return 1}
  let mut b=Vec::with_capacity(4+ids.len()*4);
  b.extend((ids.len() as u32).to_le_bytes());
  for id in ids{b.extend(id.to_le_bytes())}
  a.reply=b;
  0
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

/// Existing nonunique inventory stack; Rust owns CAS and unique-data gate.
#[no_mangle]
pub extern "C" fn hkia_inventory_change(document_id:u32,before:i32,after:i32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();a.output.clear();
  match a.editor.as_mut().map(|e|e.change_inventory_quantity(document_id,before,after)){
   Some(Ok(()))=>0,_=>1
  }
 })
}
/// The batch transport uses the same local staging buffer as history replay.
#[no_mangle]
pub extern "C" fn hkia_inventory_batch_limit()->u32{
 hkia_save_core::collection::MAX_INVENTORY_BATCH as u32
}
#[no_mangle]
pub extern "C" fn hkia_inventory_batch_change()->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();a.output.clear();
  let bytes=std::mem::take(&mut a.stage);
  if bytes.is_empty()||bytes.len()%12!=0||bytes.len()/12>hkia_save_core::collection::MAX_INVENTORY_BATCH{return 1}
  let requests=bytes.chunks_exact(12).map(|row|(
   u32::from_le_bytes(row[0..4].try_into().unwrap()),
   i32::from_le_bytes(row[4..8].try_into().unwrap()),
   i32::from_le_bytes(row[8..12].try_into().unwrap())
  )).collect::<Vec<_>>();
  match a.editor.as_mut().map(|e|e.change_inventory_quantities(&requests)){Some(Ok(()))=>0,_=>1}
 })
}
/// 4-byte count + N rows of (document id u32, item id i32, quantity i32,
/// editable u32). Pending ingredient creation uses session-only handles.
#[no_mangle]
pub extern "C" fn hkia_inventory_snapshot()->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(editor)=a.editor.as_ref()else{return 1};
  let rows=editor.inventory();
  if rows.len()>1_000_000{return 1}
  let mut b=Vec::with_capacity(4+rows.len()*16);
  b.extend((rows.len() as u32).to_le_bytes());
  for row in rows{
   b.extend(row.document_id.to_le_bytes());
   b.extend(row.item_id.to_le_bytes());
   b.extend(row.quantity.to_le_bytes());
   b.extend(u32::from(row.editable).to_le_bytes());
  }
  a.reply=b;0
 })
}

/// Source-checked absent ordinary ingredients; session-only handles, not native IDs.
#[no_mangle]
pub extern "C" fn hkia_inventory_creatable_snapshot()->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(editor)=a.editor.as_ref()else{return 1};
  let rows=editor.inventory_creatable();
  let mut b=Vec::with_capacity(4+rows.len()*12);
  b.extend((rows.len() as u32).to_le_bytes());
  for row in rows{
   b.extend(row.document_id.to_le_bytes());b.extend(row.item_id.to_le_bytes());
   b.extend(row.quantity_limit.unwrap_or(0).to_le_bytes());
  }
  a.reply=b;0
 })
}

/// Existing inventory quantity bounds, separate from the stable 16-byte
/// inventory row ABI: count + (document id u32, minimum i32, maximum i32).
#[no_mangle]
pub extern "C" fn hkia_inventory_quantity_bounds()->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(editor)=a.editor.as_ref()else{return 1};
  let rows=editor.inventory();
  if rows.len()>1_000_000{return 1}
  let mut b=vec![0;4];let mut count=0u32;
  for row in rows{
   if let Some(cap)=row.quantity_limit{
    count+=1;b.extend(row.document_id.to_le_bytes());b.extend(row.quantity_minimum.to_le_bytes());b.extend(cap.to_le_bytes());
   }
  }
  b[..4].copy_from_slice(&count.to_le_bytes());
  a.reply=b;0
 })
}

/// Read-only flower display payload: count + rows (u32 document ID, u32 grow
/// state, i32 base color, i32 pattern, i32 pattern color). No edit authority.
#[no_mangle]
pub extern "C" fn hkia_inventory_flowers_snapshot()->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(editor)=a.editor.as_ref()else{return 1};
  let mut b=vec![0;4];let mut count=0u32;
  for (id,grow,color,pattern,accent) in editor.inventory_flowers(){
   if count==1_000_000{return 1}
   count+=1;
   b.extend(id.to_le_bytes());b.extend(u32::from(grow).to_le_bytes());
   b.extend(color.to_le_bytes());b.extend(pattern.to_le_bytes());b.extend(accent.to_le_bytes());
  }
  b[..4].copy_from_slice(&count.to_le_bytes());a.reply=b;0
 })
}

/// Existing inventory unique-data metadata and typed values; exact source
/// payloads stay in Rust. Wire: count, then document ID, UID presence, UID,
/// tag (-2 absent, -1 nil), field count, typed word count, words, edit hint.
#[no_mangle]
pub extern "C" fn hkia_inventory_unique_snapshot()->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(editor)=a.editor.as_ref()else{return 1};
  let mut out=vec![0;4];let mut count=0u32;
  let hints:std::collections::HashSet<_>=editor.inventory_flower_edit_hints().collect();
  let furniture_hints:std::collections::HashSet<_>=editor.inventory_furniture_edit_hints().collect();
  let palette_hints:std::collections::HashSet<_>=editor.inventory_palette_edit_hints().collect();
  let wand_hints:std::collections::HashSet<_>=editor.inventory_wand_edit_hints().collect();
  for (id,uid,nil,data,fields) in editor.inventory_unique_rows(){
   if count>=1_000_000||out.len()>32*1024*1024{return 1}
   count+=1;
   let (tag,words):(i32,Vec<u32>)=match data{
    Some(data)=>data.display_words(),
    None=>(if nil==Some(true){-1}else{-2},Vec::new())
   };
   out.extend(id.to_le_bytes());out.extend(u32::from(uid.is_some()).to_le_bytes());
   out.extend(uid.unwrap_or(0).to_le_bytes());out.extend(tag.to_le_bytes());
   out.extend((fields as u32).to_le_bytes());out.extend((words.len() as u32).to_le_bytes());
   for word in words{out.extend(word.to_le_bytes());}
   let hint=if hints.contains(&id){1u32}else if furniture_hints.contains(&id){2}else if palette_hints.contains(&id){3}else if wand_hints.contains(&id){4}else{0};
   out.extend(hint.to_le_bytes());
  }
  out[..4].copy_from_slice(&count.to_le_bytes());a.reply=out;0
 })
}
/// On-demand native options. No mutation or per-row full inventory scan.
#[no_mangle]
pub extern "C" fn hkia_inventory_flower_variants(id:u32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(e)=a.editor.as_ref()else{return 1};
  let rows=e.inventory_flower_variants(id);
  if rows.len()>100{return 1}
  let mut out=Vec::with_capacity(4+rows.len()*16);
  out.extend((rows.len() as u32).to_le_bytes());
  for row in rows{for n in row{out.extend(n.to_le_bytes());}}
  a.reply=out;0
 })
}
#[no_mangle]
pub extern "C" fn hkia_inventory_default_furniture_ids()->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(e)=a.editor.as_ref()else{return 1};
  let rows=e.inventory_default_furniture_ids();
  let mut out=Vec::with_capacity(4+rows.len()*4);
  out.extend((rows.len() as u32).to_le_bytes());
  for id in rows{out.extend(id.to_le_bytes());}
  a.reply=out;0
 })
}
#[no_mangle]
pub extern "C" fn hkia_inventory_absent_furniture_ids()->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(e)=a.editor.as_ref()else{return 1};
  let rows=e.inventory_absent_furniture_ids();
  let mut out=Vec::with_capacity(4+rows.len()*4);
  out.extend((rows.len() as u32).to_le_bytes());
  for id in rows{out.extend(id.to_le_bytes());}
  a.reply=out;0
 })
}
#[no_mangle]
pub extern "C" fn hkia_inventory_absent_flower_ids()->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(e)=a.editor.as_ref()else{return 1};
  let rows=e.inventory_absent_flower_ids();
  let mut out=Vec::with_capacity(4+rows.len()*4);
  out.extend((rows.len() as u32).to_le_bytes());
  for id in rows{out.extend(id.to_le_bytes());}
  a.reply=out;0
 })
}
#[no_mangle]
pub extern "C" fn hkia_inventory_flower_creation_variants(id:u32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(e)=a.editor.as_ref()else{return 1};
  let rows=e.inventory_flower_creation_variants(id);
  if rows.len()>100{return 1}
  let mut out=Vec::with_capacity(4+rows.len()*16);
  out.extend((rows.len() as u32).to_le_bytes());
  for row in rows{for n in row{out.extend(n.to_le_bytes());}}
  a.reply=out;0
 })
}
#[no_mangle]
pub extern "C" fn hkia_inventory_flower_create(id:u32,b0:i32,b1:i32,b2:i32,b3:i32,a0:i32,a1:i32,a2:i32,a3:i32,quantity:i32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();a.output.clear();
  match a.editor.as_mut().map(|e|e.create_inventory_flower_variant(id,[b0,b1,b2,b3],[a0,a1,a2,a3],quantity)){
   Some(Ok(_))=>0,_=>1
  }
 })
}
#[no_mangle]
pub extern "C" fn hkia_inventory_flower_variant_change(id:u32,b0:i32,b1:i32,b2:i32,b3:i32,a0:i32,a1:i32,a2:i32,a3:i32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();a.output.clear();
  match a.editor.as_mut().map(|e|e.change_inventory_flower_variant(id,[b0,b1,b2,b3],[a0,a1,a2,a3])){
   Some(Ok(()))=>0,_=>1
  }
 })
}
#[no_mangle]
pub extern "C" fn hkia_inventory_flower_color_change(id:u32,before:i32,after:i32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();a.output.clear();
  match a.editor.as_mut().map(|e|e.change_inventory_flower_color(id,before,after)){
   Some(Ok(()))=>0,_=>1
  }
 })
}

/// Effective palette payload: count + (document ID, 12 exact f32 bit words).
#[no_mangle]
pub extern "C" fn hkia_inventory_palettes_snapshot()->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(editor)=a.editor.as_ref()else{return 1};
  let mut b=vec![0;4];let mut count=0u32;
  for (id,colors) in editor.inventory_palettes(){
   if count==1_000_000{return 1}
   count+=1;b.extend(id.to_le_bytes());
   for color in colors{for bits in color{b.extend(bits.to_le_bytes());}}
  }
  b[..4].copy_from_slice(&count.to_le_bytes());a.reply=b;0
 })
}

/// Last source-defined child completion + absent parent creation in one
/// fully validated Rust transaction, including one-step Undo/Redo.
#[no_mangle]
pub extern "C" fn hkia_achievement_parent_create(
 c0:u32,c1:u32,c2:u32,c3:u32,
 before_present:u32,bc:u32,bp:f32,bs:i64,bn:u32,bh:u32,
 ac:u32,ap:f32,as_:i64,an:u32,ah:u32,
 p0:u32,p1:u32,p2:u32,p3:u32,
 pc:u32,pp:f32,ps:i64,pn:u32,ph:u32
)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();a.output.clear();
  if [before_present,bc,bh,ac,ah,pc,ph].iter().any(|&x|x>1){return 1}
  let before=if before_present==1{
   Some(hkia_save_core::achievement::AchievementValue{
    complete:bc==1,current:bp,completed:if bh==1{Some((bs,bn))}else{None}
   })
  }else{None};
  let next=hkia_save_core::achievement::AchievementValue{
   complete:ac==1,current:ap,completed:if ah==1{Some((as_,an))}else{None}
  };
  let parent=hkia_save_core::achievement::AchievementValue{
   complete:pc==1,current:pp,completed:if ph==1{Some((ps,pn))}else{None}
  };
  match a.editor.as_mut().map(|e|
   e.complete_child_and_create_parent([c0,c1,c2,c3],before,next,[p0,p1,p2,p3],parent)
  ){Some(Ok(()))=>0,_=>1}
 })
}

/// Read-only Rust achievement click planning. No saved byte is changed
/// until the caller submits the returned value through normal native CAS.
/// 18-byte response: complete/u8, progress/f32, has_date/u8,
/// seconds/i64, nanoseconds/u32 (all numeric fields little endian).
/// Version-gated, read-only game-native achievement goals.
/// Reply: u32 count, then count entries of 4x LE u32 GUID + LE f32 goal.
/// No independent TypeScript parent-size or threshold calculations.
#[no_mangle]
pub extern "C" fn hkia_achievement_goals_snapshot()->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(editor)=a.editor.as_ref() else{return 1};
  let goals=editor.source_achievement_progress_goals();
  if goals.len()>820{return 1}
  let mut reply=Vec::with_capacity(4+goals.len()*20);
  reply.extend((goals.len() as u32).to_le_bytes());
  for (guid,goal) in goals{
   for part in guid{reply.extend(part.to_le_bytes())}
   reply.extend(goal.to_le_bytes());
  }
  a.reply=reply;
  0
 })
}

#[no_mangle]
pub extern "C" fn hkia_achievement_toggle_plan(
 g0:u32,g1:u32,g2:u32,g3:u32,now_ms:i64
)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();a.output.clear();
  let Some(e)=a.editor.as_ref()else{return 1};
  let version=e.version();
  if version!="3.0.0"&&version!="3.0.1"{return 1}
  let guid=[g0,g1,g2,g3];
  let existing=e.achievement_value(guid);
  let before=existing.unwrap_or(
   hkia_save_core::achievement::AchievementValue{
    complete:false,current:0.0,completed:None
   });
  // Source-defined goals exist only for v3.0.1. A real but unknown saved
  // record may still change state with its exact original progress preserved.
  // A missing unverified ID is never synthesized; v3.0.0 never borrows
  // v3.0.1 goals from a different game source.
  let planned=if version=="3.0.1"{
   match hkia_save_core::achievement::plan_toggle_v301(guid,before,now_ms){
    Ok(value)=>Ok(value),
    Err(_) if existing.is_some()=>
     hkia_save_core::achievement::plan_toggle_existing_without_goal(before,now_ms),
    Err(error)=>Err(error)
   }
  }else if existing.is_some(){
   hkia_save_core::achievement::plan_toggle_existing_without_goal(before,now_ms)
  }else{Err(hkia_save_core::Error::Schema)};
  let after=match planned{Ok(value)=>value,Err(_)=>return 1};
  let mut bytes=Vec::with_capacity(18);
  bytes.push(u8::from(after.complete));
  bytes.extend(after.current.to_bits().to_le_bytes());
  bytes.push(u8::from(after.completed.is_some()));
  let (seconds,nanos)=after.completed.unwrap_or((0,0));
  bytes.extend(seconds.to_le_bytes());
  bytes.extend(nanos.to_le_bytes());
  a.reply=bytes;0
 })
}

/// Single CAS-validated child edit with source-derived parent completion,
/// revocation or date sync decided entirely inside the Rust core. One Undo
/// transaction covers every affected native achievement document.
#[no_mangle]
pub extern "C" fn hkia_achievement_edit_auto(
 g0:u32,g1:u32,g2:u32,g3:u32,
 before_present:u32,bc:u32,bp:f32,bs:i64,bn:u32,bh:u32,
 ac:u32,ap:f32,as_:i64,an:u32,ah:u32
)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();a.output.clear();
  if [before_present,bc,bh,ac,ah].iter().any(|&v|v>1){return 1}
  if before_present==0&&(bc!=0||bh!=0){return 1}
  let before=if before_present==1{
   Some(hkia_save_core::achievement::AchievementValue{
    complete:bc==1,current:bp,completed:if bh==1{Some((bs,bn))}else{None}
   })
  }else{None};
  let next=hkia_save_core::achievement::AchievementValue{
   complete:ac==1,current:ap,completed:if ah==1{Some((as_,an))}else{None}
  };
  match a.editor.as_mut().map(|e|e.edit_achievement_auto([g0,g1,g2,g3],before,next)){
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
  if complete>1||has_date>1||complete!=has_date{return 1}
  let value=hkia_save_core::achievement::AchievementValue{
   complete:complete==1,current:progress,completed:if has_date==1{Some((seconds,nanos))}else{None}
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

/// Bounded local-only native operation journal for IndexedDB recovery.
#[no_mangle]
pub extern "C" fn hkia_history_checkpoint()->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(editor)=a.editor.as_ref()else{return 1};
  match editor.history_checkpoint(){
   Ok(bytes) if bytes.len()<=128*1024=>{a.reply=bytes;0},
   _=>1
  }
 })
}
/// Restore an untrusted checkpoint staged through hkia_stage. Rust rebuilds
/// the full history against the original save atomically, using native CAS.
#[no_mangle]
pub extern "C" fn hkia_history_restore()->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();a.output.clear();
  let checkpoint=std::mem::take(&mut a.stage);
  if checkpoint.len()>128*1024{return 1}
  match a.editor.as_mut().map(|editor|editor.restore_history(&checkpoint)){
   Some(Ok(()))=>0,_=>1
  }
 })
}

/// Native per-tab timeline with applied and redoable events (4+23*N bytes).
#[no_mangle]
pub extern "C" fn hkia_history_snapshot()->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(editor)=a.editor.as_ref()else{return 1};
  let rows=editor.history();
  if rows.len()>512{return 1}
  let mut bytes=Vec::with_capacity(4+rows.len()*23);
  bytes.extend((rows.len() as u32).to_le_bytes());
  for row in rows{
   bytes.push(match row.scope{
    hkia_save_core::collection::HistoryScope::Collections=>0,
    hkia_save_core::collection::HistoryScope::Achievements=>1,
    hkia_save_core::collection::HistoryScope::Inventory=>2
   });
   bytes.push(u8::from(row.applied));
   bytes.push(u8::from(row.paired));
   bytes.extend(row.item_id.to_le_bytes());
   for g in row.guid{bytes.extend(g.to_le_bytes());}
  }
  a.reply=bytes;0
 })
}
#[no_mangle]
pub extern "C" fn hkia_history_jump(scope:u32,target:u32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();a.output.clear();
  let scope=match scope{
   0=>hkia_save_core::collection::HistoryScope::Collections,
   1=>hkia_save_core::collection::HistoryScope::Achievements,
   2=>hkia_save_core::collection::HistoryScope::Inventory,
   _=>return 1
  };
  match a.editor.as_mut(){
   Some(editor)=>if editor.jump_history(scope,target as usize){0}else{1},
   None=>1
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
  let version=e.version();
  let version_flag=if version=="3.0.0"{1}else if version=="3.0.1"{2}else{3};
  if version_flag==3&&version.len()>24{return 1}
  let mut bytes=Vec::with_capacity(17+rows.len()*12+if version_flag==3{1+version.len()}else{0});
  bytes.push(version_flag);
  bytes.push(u8::from(e.is_zip()) | (u8::from(e.can_change_membership())<<1));bytes.push(u8::from(e.dirty()));
  bytes.push(u8::from(e.can_undo()));bytes.push(u8::from(e.can_redo()));
  bytes.extend(e.revision().to_le_bytes());
  bytes.extend((e.source_bytes()as u32).to_le_bytes());
  bytes.extend((rows.len()as u32).to_le_bytes());
  for row in rows {bytes.extend(row.id.to_le_bytes());bytes.extend(row.ticks.to_le_bytes());}
  if version_flag==3 {bytes.push(version.len() as u8);bytes.extend(version.as_bytes());}
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

#[no_mangle]
pub extern "C" fn hkia_inventory_furniture_variants(id:u32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(e)=a.editor.as_ref()else{return 1};
  let rows=e.inventory_furniture_variants(id);
  if rows.len()>2634{return 1}
  let mut out=Vec::with_capacity(4+rows.len()*12);
  out.extend((rows.len() as u32).to_le_bytes());
  for row in rows{for n in row{out.extend(n.to_le_bytes());}}
  a.reply=out;0
 })
}
#[no_mangle]
pub extern "C" fn hkia_inventory_furniture_creation_variants(id:u32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(e)=a.editor.as_ref()else{return 1};
  let rows=e.inventory_furniture_creation_variants(id);
  if rows.len()>2634{return 1}
  let mut out=Vec::with_capacity(4+rows.len()*12);
  out.extend((rows.len() as u32).to_le_bytes());
  for row in rows{for n in row{out.extend(n.to_le_bytes());}}
  a.reply=out;0
 })
}
#[no_mangle]
pub extern "C" fn hkia_inventory_furniture_create(id:u32,b0:i32,b1:i32,b2:i32,a0:i32,a1:i32,a2:i32,quantity:i32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();a.output.clear();
  match a.editor.as_mut().map(|e|e.create_inventory_furniture_variant(id,[b0,b1,b2],[a0,a1,a2],quantity)){
   Some(Ok(_))=>0,_=>1
  }
 })
}
#[no_mangle]
pub extern "C" fn hkia_inventory_furniture_variant_change(id:u32,b0:i32,b1:i32,b2:i32,a0:i32,a1:i32,a2:i32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();a.output.clear();
  match a.editor.as_mut().map(|e|e.change_inventory_furniture_variant(id,[b0,b1,b2],[a0,a1,a2])){
   Some(Ok(()))=>0,_=>1
  }
 })
}

#[no_mangle]
pub extern "C" fn hkia_inventory_palette_variants(id:u32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(e)=a.editor.as_ref()else{return 1};
  let rows=e.inventory_palette_variants(id);
  if rows.len()>438{return 1}
  let mut out=Vec::with_capacity(4+rows.len()*48);
  out.extend((rows.len() as u32).to_le_bytes());
  for row in rows{for bits in row.into_iter().flatten(){out.extend(bits.to_le_bytes());}}
  a.reply=out;0
 })
}
#[no_mangle]
pub extern "C" fn hkia_inventory_palette_variant_change(id:u32,b0:u32,b1:u32,b2:u32,b3:u32,b4:u32,b5:u32,b6:u32,b7:u32,b8:u32,b9:u32,b10:u32,b11:u32,a0:u32,a1:u32,a2:u32,a3:u32,a4:u32,a5:u32,a6:u32,a7:u32,a8:u32,a9:u32,a10:u32,a11:u32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();a.output.clear();
  match a.editor.as_mut().map(|e|e.change_inventory_palette_variant(id,[[b0,b1,b2,b3],[b4,b5,b6,b7],[b8,b9,b10,b11]],[[a0,a1,a2,a3],[a4,a5,a6,a7],[a8,a9,a10,a11]])){
   Some(Ok(()))=>0,_=>1
  }
 })
}

#[no_mangle]
pub extern "C" fn hkia_inventory_palette_creation_variants(id:u32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(e)=a.editor.as_ref()else{return 1};
  let rows=e.inventory_palette_creation_variants(id);
  if rows.len()>438{return 1}
  let mut out=Vec::with_capacity(4+rows.len()*48);
  out.extend((rows.len() as u32).to_le_bytes());
  for row in rows{for bits in row.into_iter().flatten(){out.extend(bits.to_le_bytes());}}
  a.reply=out;0
 })
}
#[no_mangle]
pub extern "C" fn hkia_inventory_palette_create(id:u32,b0:u32,b1:u32,b2:u32,b3:u32,b4:u32,b5:u32,b6:u32,b7:u32,b8:u32,b9:u32,b10:u32,b11:u32,a0:u32,a1:u32,a2:u32,a3:u32,a4:u32,a5:u32,a6:u32,a7:u32,a8:u32,a9:u32,a10:u32,a11:u32,quantity:i32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();a.output.clear();
  match a.editor.as_mut().map(|e|e.create_inventory_palette_variant(id,[[b0,b1,b2,b3],[b4,b5,b6,b7],[b8,b9,b10,b11]],[[a0,a1,a2,a3],[a4,a5,a6,a7],[a8,a9,a10,a11]],quantity)){
   Some(Ok(_))=>0,_=>1
  }
 })
}

/// Separate full Boba tuple snapshot; the existing appearance wire stays stable.
#[no_mangle]
pub extern "C" fn hkia_inventory_boba_snapshot()->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(e)=a.editor.as_ref()else{return 1};
  let mut out=vec![0;4];let mut count=0u32;
  for (id,v,editable) in e.inventory_boba_rows(){
   if count>=1_000_000{return 1}
   count+=1;out.extend(id.to_le_bytes());out.extend(u32::from(editable).to_le_bytes());
   for word in v{out.extend(word.to_le_bytes());}
  }
  out[..4].copy_from_slice(&count.to_le_bytes());
  let witnesses=e.inventory_boba_witnesses();out.extend((witnesses.len() as u32).to_le_bytes());
  for &(item,flavor,color) in witnesses{for word in [item,flavor,color]{out.extend(word.to_le_bytes());}}
  a.reply=out;0
 })
}
#[no_mangle]
pub extern "C" fn hkia_inventory_boba_variants(id:u32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(e)=a.editor.as_ref()else{return 1};
  let rows=e.inventory_boba_variants(id);
  let mut out=Vec::with_capacity(4+rows.len()*20);
  out.extend((rows.len() as u32).to_le_bytes());for row in rows{for word in row{out.extend(word.to_le_bytes());}}
  a.reply=out;0
 })
}
#[no_mangle]
pub extern "C" fn hkia_inventory_boba_variant_change(id:u32,b0:i32,b1:i32,b2:i32,b3:i32,b4:i32,a0:i32,a1:i32,a2:i32,a3:i32,a4:i32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();a.output.clear();
  match a.editor.as_mut().map(|e|e.change_inventory_boba_variant(id,[b0,b1,b2,b3,b4],[a0,a1,a2,a3,a4])){
   Some(Ok(()))=>0,_=>1
  }
 })
}

#[no_mangle]
pub extern "C" fn hkia_inventory_boba_creation_variants(id:u32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(e)=a.editor.as_ref()else{return 1};
  let rows=e.inventory_boba_creation_variants(id);
  if rows.len()>151{return 1}
  let mut out=Vec::with_capacity(4+rows.len()*20);
  out.extend((rows.len() as u32).to_le_bytes());for row in rows{for word in row{out.extend(word.to_le_bytes());}}
  a.reply=out;0
 })
}
#[no_mangle]
pub extern "C" fn hkia_inventory_boba_create(id:u32,b0:i32,b1:i32,b2:i32,b3:i32,b4:i32,a0:i32,a1:i32,a2:i32,a3:i32,a4:i32,quantity:i32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();a.output.clear();
  match a.editor.as_mut().map(|e|e.create_inventory_boba_variant(id,[b0,b1,b2,b3,b4],[a0,a1,a2,a3,a4],quantity)){
   Some(Ok(_))=>0,_=>1
  }
 })
}

#[no_mangle]
pub extern "C" fn hkia_inventory_cafe_snapshot()->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(e)=a.editor.as_ref()else{return 1};
  let mut out=vec![0;4];let mut count=0u32;
  for (id,v,editable) in e.inventory_cafe_rows(){
   if count>=1_000_000{return 1}
   count+=1;out.extend(id.to_le_bytes());out.extend(u32::from(editable).to_le_bytes());
   for word in v{out.extend(word.to_le_bytes());}
  }
  out[..4].copy_from_slice(&count.to_le_bytes());
  let witnesses=e.inventory_cafe_witnesses();out.extend((witnesses.len() as u32).to_le_bytes());
  for &(item,flavor,color) in witnesses{for word in [item,flavor,color]{out.extend(word.to_le_bytes());}}
  a.reply=out;0
 })
}
#[no_mangle]
pub extern "C" fn hkia_inventory_cafe_variants(id:u32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(e)=a.editor.as_ref()else{return 1};
  let rows=e.inventory_cafe_variants(id);
  if rows.len()>147{return 1}
  let mut out=Vec::with_capacity(4+rows.len()*32);
  out.extend((rows.len() as u32).to_le_bytes());
  for (row,ingredient,slot) in rows{for word in row{out.extend(word.to_le_bytes());}out.extend(ingredient.to_le_bytes());out.extend((slot as u32).to_le_bytes());}
  a.reply=out;0
 })
}
#[no_mangle]
pub extern "C" fn hkia_inventory_cafe_variant_change(id:u32,b0:i32,b1:i32,b2:i32,b3:i32,b4:i32,b5:i32,a0:i32,a1:i32,a2:i32,a3:i32,a4:i32,a5:i32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();a.output.clear();
  match a.editor.as_mut().map(|e|e.change_inventory_cafe_variant(id,[b0,b1,b2,b3,b4,b5],[a0,a1,a2,a3,a4,a5])){
   Some(Ok(()))=>0,_=>1
  }
 })
}

#[no_mangle]
pub extern "C" fn hkia_inventory_cafe_creation_variants(id:u32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(e)=a.editor.as_ref()else{return 1};
  let rows=e.inventory_cafe_creation_variants(id);
  if rows.len()>147{return 1}
  let mut out=Vec::with_capacity(4+rows.len()*32);
  out.extend((rows.len() as u32).to_le_bytes());
  for (row,ingredient,slot) in rows{for word in row{out.extend(word.to_le_bytes());}out.extend(ingredient.to_le_bytes());out.extend((slot as u32).to_le_bytes());}
  a.reply=out;0
 })
}
#[no_mangle]
pub extern "C" fn hkia_inventory_cafe_create(id:u32,b0:i32,b1:i32,b2:i32,b3:i32,b4:i32,b5:i32,a0:i32,a1:i32,a2:i32,a3:i32,a4:i32,a5:i32,quantity:i32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();a.output.clear();
  match a.editor.as_mut().map(|e|e.create_inventory_cafe_variant(id,[b0,b1,b2,b3,b4,b5],[a0,a1,a2,a3,a4,a5],quantity)){
   Some(Ok(_))=>0,_=>1
  }
 })
}

#[no_mangle]
pub extern "C" fn hkia_inventory_wand_variants(id:u32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();
  let Some(e)=a.editor.as_ref()else{return 1};
  let rows=e.inventory_wand_variants(id);
  if rows.len()>35{return 1}
  let mut out=Vec::with_capacity(4+rows.len()*8);
  out.extend((rows.len() as u32).to_le_bytes());
  for row in rows{for word in row{out.extend(word.to_le_bytes());}}
  a.reply=out;0
 })
}
#[no_mangle]
pub extern "C" fn hkia_inventory_wand_variant_change(id:u32,b0:i32,b1:i32,a0:i32,a1:i32)->u32{
 STATE.with(|s|{
  let mut a=s.borrow_mut();a.reply.clear();a.output.clear();
  match a.editor.as_mut().map(|e|e.change_inventory_wand_variant(id,[b0,b1],[a0,a1])){
   Some(Ok(()))=>0,_=>1
  }
 })
}

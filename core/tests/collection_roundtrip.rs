
use hkia_save_core::{archive::{ZipIndex,crc32,SLOT,ACCOUNT},collection::Editor,read_slot};
fn cat(v:&[&[u8]])->Vec<u8>{v.concat()}
fn u(n:u32)->Vec<u8>{let mut r=vec![0xce];r.extend(n.to_be_bytes());r}
fn f(n:f32)->Vec<u8>{let mut r=vec![0xca];r.extend(n.to_be_bytes());r}
fn l(n:i64)->Vec<u8>{let mut r=vec![0xd3];r.extend(n.to_be_bytes());r}
fn arr(a:Vec<Vec<u8>>)->Vec<u8>{
 assert!(a.len()<16);
 let mut b=vec![0x90|a.len()as u8];for x in a {b.extend(x)}b
}
fn map(a:Vec<(Vec<u8>,Vec<u8>)>)->Vec<u8>{
 assert!(a.len()<16);
 let mut b=vec![0x80|a.len()as u8];for (k,v) in a {b.extend(k);b.extend(v)}b
}
fn guid(a:[u32;4])->Vec<u8>{let mut b=Vec::new();for x in a{b.extend(u(x))}b}
fn doc(tag:u8,value:Vec<u8>)->Vec<u8>{arr(vec![vec![tag],value])}
fn synthetic_payload(version:&str)->Vec<u8>{
 let v=doc(18,arr(vec![vec![0],u(if version=="3.0.0"{83}else{87}),{
  let mut s=vec![0xa0|version.len()as u8];s.extend(version.as_bytes());s
 }]));
 let a=doc(16,arr(vec![vec![1],guid([1,0,0,1]),arr(vec![vec![0xc2],f(1.0),vec![0xc0]])]));
 let b=doc(16,arr(vec![vec![2],guid([2,0,0,1]),arr(vec![vec![0xc2],f(2.0),vec![0xc0]])]));
 let c=doc(17,arr(vec![vec![1],guid([1,0,0,2]),arr(vec![f(2.0),vec![0xc0],vec![0x90]])]));
 let key1=map(vec![(vec![2],l(638000000000000001)),(vec![3],l(9))]);
 let trait_collection=doc(39,arr(vec![map(vec![]),key1]));
 let obj=doc(32,arr(vec![vec![3],guid([0,0,0,3]),vec![0],arr(vec![trait_collection])]));
 arr(vec![vec![0],vec![4],arr(vec![v,a,b,c,obj])])
}
fn literal(s:&[u8])->Vec<u8>{
 let mut b=vec![(s.len().min(15)as u8)<<4];
 if s.len()>=15{
  let mut n=s.len()-15;
  while n>=255{b.push(255);n-=255}
  b.push(n as u8);
 }
 b.extend(s);b
}
fn slot(version:&str)->Vec<u8>{slot_from_payload(version,synthetic_payload(version))}
fn slot_from_payload(version:&str,payload:Vec<u8>)->Vec<u8>{
 let prefix:[u8;32]=[0x13,0x5b,0x4a,0xa4,0xf7,0x02,0xa4,0x5d,0x1c,0xc5,0x62,0xae,0xb5,0xa3,0x86,0xed,0x5d,0x17,0xe1,0xfd,0x58,0x8f,0x42,0x4d,0xcf,0xc5,0x9d,0x2e,0x14,0x0c,0xf5,0x97];
 let magic:[u8;32]=[0xa1,0xa2,0xf8,0x33,0x3c,0x66,0xec,0x45,0x5b,0xaa,0x2d,0xfc,0x63,0x25,0xc2,0x43,0x7a,0x77,0x9c,0x99,0x06,0xee,0xcf,0xf0,0xc0,0x22,0xe5,0xf6,0xb6,0xca,0x73,0xb8];
 let mut b=prefix.to_vec();b.push(0x98);
 for _ in 0..4{b.extend(u(0))}
 b.push(0xa0|version.len()as u8);b.extend(version.as_bytes());
 b.extend(u(if version=="3.0.0"{30000}else{30001}));
 b.extend([0x92,0xd6,0xff]);b.extend(1_750_000_000u32.to_be_bytes());b.push(0);
 b.push(0);b.push(0x80);b.push(0x90);b.extend([0x91,9]);
 b.extend(magic);
 let compressed=literal(&payload);
 b.extend([0x92,0xc8,0,3,98,0xcd]);
 b.extend((payload.len() as u16).to_be_bytes());
 b.push(0xc6);b.extend((compressed.len() as u32).to_be_bytes());b.extend(compressed);
 b
}
fn put16(v:&mut Vec<u8>,n:u16){v.extend(n.to_le_bytes())}
fn put32(v:&mut Vec<u8>,n:u32){v.extend(n.to_le_bytes())}
fn zip(slot:&[u8])->Vec<u8>{
 let mut b=Vec::new();let mut central=Vec::new();
 for (name,data) in [(SLOT,slot),(ACCOUNT,b"{}".as_slice()),("opaque.bin",b"opaque") ]{
  let name=name.as_bytes();let crc=crc32(data);let pos=b.len() as u32;
  put32(&mut b,0x04034b50);put16(&mut b,20);put16(&mut b,0);put16(&mut b,0);
  put16(&mut b,0);put16(&mut b,0);put32(&mut b,crc);put32(&mut b,data.len()as u32);
  put32(&mut b,data.len()as u32);put16(&mut b,name.len()as u16);put16(&mut b,0);
  b.extend(name);b.extend(data);
  put32(&mut central,0x02014b50);put16(&mut central,20);put16(&mut central,20);
  put16(&mut central,0);put16(&mut central,0);put16(&mut central,0);put16(&mut central,0);
  put32(&mut central,crc);put32(&mut central,data.len()as u32);put32(&mut central,data.len()as u32);
  put16(&mut central,name.len()as u16);put16(&mut central,0);put16(&mut central,0);
  put16(&mut central,0);put16(&mut central,0);put32(&mut central,0);put32(&mut central,pos);
  central.extend(name);
 }
 let off=b.len()as u32;let len=central.len()as u32;
 b.extend(central);put32(&mut b,0x06054b50);for _ in 0..2{put16(&mut b,0)}
 put16(&mut b,3);put16(&mut b,3);put32(&mut b,len);put32(&mut b,off);put16(&mut b,0);
 b
}
#[test]
fn synthetic_slot_time_undo_redo_remove_add(){
 for v in ["3.0.0","3.0.1"]{
  let source=slot(v);let original=source.clone();
  let raw=read_slot(&source).unwrap();
  assert_eq!(raw.index.collections.len(),2);
  let mut e=Editor::open(source).unwrap();
  assert_eq!(e.entries().len(),2);
  assert!(!e.dirty());
  assert!(e.export().is_err());
  assert!(e.change(2,Some(111),Some(222)).is_err());
  e.change(2,Some(638000000000000001),Some(638000000000010001)).unwrap();
  assert!(e.can_undo());assert!(!e.can_redo());
  let changed=e.export().unwrap();assert_ne!(changed,original);
  assert_eq!(Editor::open(changed).unwrap().value(2),Some(638000000000010001));
  assert!(e.undo());assert!(!e.dirty());assert!(e.redo());assert!(e.dirty());
  e.change(3,Some(9),None).unwrap();
  let no3=Editor::open(e.export().unwrap()).unwrap();
  assert_eq!(no3.value(3),None);
  if v=="3.0.1"{
   e.change(315822,None,Some(638000000000000000)).unwrap();
   let added=Editor::open(e.export().unwrap()).unwrap();
   assert_eq!(added.value(315822),Some(638000000000000000));
   assert_eq!(added.value(3),None);
  }
  assert_eq!(original,slot(v));
 }
}
#[test]
fn synthetic_archive_other_members_byte_exact(){
 let source=zip(&slot("3.0.1"));
 let z=ZipIndex::parse(&source).unwrap();
 let mut editor=Editor::open(source.clone()).unwrap();
 editor.change(2,Some(638000000000000001),Some(638000000010000001)).unwrap();
 let result=editor.export().unwrap();let next=ZipIndex::parse(&result).unwrap();
 for (a,b) in z.entries.iter().zip(&next.entries){
  assert_eq!(a.name,b.name);
  if a.name!=SLOT{
   assert_eq!(&source[a.local.clone()],&result[b.local.clone()]);
   assert_eq!(z.extract(&source,z.entries.iter().position(|i|i.name==a.name).unwrap()).unwrap(),
              next.extract(&result,next.entries.iter().position(|i|i.name==b.name).unwrap()).unwrap());
  }
 }
 assert_eq!(Editor::open(result).unwrap().value(2),Some(638000000010000001));
 assert_eq!(Editor::open(source.clone()).unwrap().value(2),Some(638000000000000001));
 let mut corrupt=source;corrupt[45]^=0x80;assert!(Editor::open(corrupt).is_err());
}

#[test]
fn achievement_only_and_mixed_edits_roundtrip_with_undo_and_zip_isolation(){
 use hkia_save_core::achievement::AchievementValue;
 let guid=[1,0,0,1];
 let base=AchievementValue{complete:false,current:1.0,completed:None};
 let done=AchievementValue{complete:true,current:2.0,completed:Some((1_750_000_000,123_456_700))};
 for version in ["3.0.0","3.0.1"] {
  for zipped in [false,true] {
   let raw=slot(version);
   let original=if zipped{zip(&raw)}else{raw.clone()};
   let mut editor=Editor::open(original.clone()).unwrap();
   assert_eq!(editor.achievement_value(guid),Some(base));
   assert!(editor.change_achievement([9,0,0,9],base,done).is_err());
   assert!(editor.change_achievement(guid,done,base).is_err());
   assert!(editor.change_achievement(guid,base,AchievementValue{current:f32::NAN,..done}).is_err());
   editor.change_achievement(guid,base,done).unwrap();
   assert_eq!(editor.achievement_value(guid),Some(done));
   assert!(editor.dirty());
   let completed=editor.export().unwrap();
   let read=Editor::open(completed).unwrap();
   assert_eq!(read.achievement_value(guid),Some(done));
   assert_eq!(read.value(2),Some(638000000000000001));
   assert!(editor.undo());assert_eq!(editor.achievement_value(guid),Some(base));
   assert!(!editor.dirty());assert!(editor.redo());
   editor.change(2,Some(638000000000000001),Some(638000000020000001)).unwrap();
   let mixed=editor.export().unwrap();
   let after=Editor::open(mixed.clone()).unwrap();
   assert_eq!(after.achievement_value(guid),Some(done));
   assert_eq!(after.value(2),Some(638000000020000001));
   if zipped {
    let before_zip=ZipIndex::parse(&original).unwrap();
    let after_zip=ZipIndex::parse(&mixed).unwrap();
    for (a,b) in before_zip.entries.iter().zip(after_zip.entries.iter()){
     if a.name!=SLOT{
      assert_eq!(a.name,b.name);
      assert_eq!(&original[a.local.clone()],&mixed[b.local.clone()]);
     }
    }
   }
   assert!(editor.undo());assert_eq!(editor.value(2),Some(638000000000000001));
   assert_eq!(editor.achievement_value(guid),Some(done));
   assert!(editor.undo());assert!(!editor.dirty());
   assert_eq!(original,if zipped{zip(&slot(version))}else{slot(version)});
  }
 }
}

#[test]
fn category_child_and_parent_atomic_change_with_single_undo_and_no_partial_conflict(){
 use hkia_save_core::achievement::AchievementValue;
 for version in ["3.0.0","3.0.1"] {
  for zipped in [false,true] {
   let raw=slot(version);
   let input=if zipped{zip(&raw)}else{raw};
   let mut editor=Editor::open(input).unwrap();
   let leaf=[1,0,0,1];let parent=[2,0,0,1];
   let old_leaf=AchievementValue{complete:false,current:1.0,completed:None};
   let old_parent=AchievementValue{complete:false,current:2.0,completed:None};
   let last_time=(1_750_000_001,987_654_300);
   let done_leaf=AchievementValue{complete:true,current:1.0,completed:Some(last_time)};
   let done_parent=AchievementValue{complete:true,current:2.0,completed:Some(last_time)};
   let pair=((leaf,old_leaf,done_leaf),(parent,old_parent,done_parent));

   // The pair is rejected without any writes if either CAS input is stale,
   // either GUID is missing, values are malformed, or the GUIDs collide.
   let bad=(parent,AchievementValue{current:99.0,..old_parent},done_parent);
   assert!(editor.change_achievement_pair(pair.0,bad).is_err());
   assert!(editor.change_achievement_pair(pair.0,(leaf,old_leaf,done_parent)).is_err());
   assert!(editor.change_achievement_pair(pair.0,([9,9,9,9],old_parent,done_parent)).is_err());
   assert_eq!(editor.achievement_value(leaf),Some(old_leaf));
   assert_eq!(editor.achievement_value(parent),Some(old_parent));
   assert!(!editor.dirty());assert!(!editor.can_undo());

   editor.change_achievement_pair(pair.0,pair.1).unwrap();
   assert_eq!(editor.achievement_value(leaf),Some(done_leaf));
   assert_eq!(editor.achievement_value(parent),Some(done_parent));
   assert_eq!(editor.revision(),1);
   let exported=editor.export().unwrap();
   let read=Editor::open(exported).unwrap();
   assert_eq!(read.achievement_value(leaf),Some(done_leaf));
   assert_eq!(read.achievement_value(parent),Some(done_parent));
   assert!(editor.undo()); // One undo restores both values.
   assert_eq!(editor.achievement_value(leaf),Some(old_leaf));
   assert_eq!(editor.achievement_value(parent),Some(old_parent));
   assert!(!editor.can_undo());
   assert!(!editor.dirty());
   assert!(editor.redo());
   assert_eq!(editor.achievement_value(leaf),Some(done_leaf));
   assert_eq!(editor.achievement_value(parent),Some(done_parent));
   assert!(editor.can_undo());
  }
 }
}

#[test]
fn verified_new_achievement_creation_v301_raw_and_zip_roundtrips_without_other_changes(){
 use hkia_save_core::achievement::AchievementValue;
 // Original source-guid key from v3.0.1 achievement index (not synthetic).
 let guid=[13220480,1299065047,2812061598,2966187300];
 let done=AchievementValue{complete:true,current:1.0,completed:Some((1_750_000_000,123_456_700))};
 for zipped in [false,true] {
  let raw=slot("3.0.1");
  let original=if zipped{zip(&raw)}else{raw.clone()};
  let mut editor=Editor::open(original.clone()).unwrap();
  let source=read_slot(&raw).unwrap();
  assert_eq!(source.index.documents,5);
  assert!(source.index.root_documents_span.is_some());
  assert_eq!(editor.achievements().len(),2);
  assert!(editor.create_achievement([0,0,0,0],done).is_err());
  assert!(editor.create_achievement([1,0,0,1],done).is_err());
  assert!(editor.create_achievement(guid,AchievementValue{complete:true,completed:None,..done}).is_err());
  assert!(!editor.dirty());
  editor.create_achievement(guid,done).unwrap();
  assert_eq!(editor.achievement_value(guid),Some(done));
  assert_eq!(editor.achievements().len(),3);
  assert!(editor.create_achievement(guid,done).is_err());
  let bytes=editor.export().unwrap();
  let parsed=Editor::open(bytes.clone()).unwrap();
  assert_eq!(parsed.achievement_value(guid),Some(done));
  let decoded=if zipped {
   let z=ZipIndex::parse(&bytes).unwrap();
   z.extract(&bytes,z.entries.iter().position(|x|x.name==SLOT).unwrap()).unwrap()
  } else {bytes};
  let src=read_slot(&decoded).unwrap();
  assert_eq!(src.index.documents,6);
  assert_eq!(src.index.achievements.len(),3);
  assert_eq!(src.index.achievements[2].id,3); // max previous tag16 ID 2 + 1
  assert_eq!(src.index.achievements[2].guid,guid);
  assert!(editor.undo());assert!(editor.achievement_value(guid).is_none());assert!(!editor.dirty());
  assert!(editor.redo());assert_eq!(editor.achievement_value(guid),Some(done));
  assert!(editor.undo());assert_eq!(editor.achievements().len(),2);
  assert_eq!(editor.source_bytes(),original.len()); // untouched source remains recoverable
 }
 let mut old=Editor::open(slot("3.0.0")).unwrap();
 assert!(old.create_achievement(guid,done).is_err());
 assert_eq!(old.achievements().len(),2);
}

#[test]
fn creation_followed_by_uncomplete_edit_has_one_undo_per_step_and_exports_as_incomplete(){
 use hkia_save_core::achievement::AchievementValue;
 let guid=[13220480,1299065047,2812061598,2966187300];
 let done=AchievementValue{complete:true,current:1.0,completed:Some((1_750_000_001,0))};
 let undone=AchievementValue{complete:false,current:0.0,completed:None};
 let mut editor=Editor::open(slot("3.0.1")).unwrap();
 editor.create_achievement(guid,done).unwrap();
 editor.change_achievement(guid,done,undone).unwrap();
 assert_eq!(editor.achievement_value(guid),Some(undone));
 let exported=editor.export().unwrap();
 assert_eq!(Editor::open(exported).unwrap().achievement_value(guid),Some(undone));
 assert!(editor.undo());assert_eq!(editor.achievement_value(guid),Some(done));
 assert!(editor.undo());assert_eq!(editor.achievement_value(guid),None);
 assert!(editor.redo());assert_eq!(editor.achievement_value(guid),Some(done));
 assert!(editor.redo());assert_eq!(editor.achievement_value(guid),Some(undone));
 editor.reset();assert_eq!(editor.achievement_value(guid),None);
}

#[test]
fn absent_parent_is_created_with_absent_last_child_in_single_atomic_undo(){
 use hkia_save_core::achievement::AchievementValue;
 // Source-confirmed one-child GameCounterAchievementsDefinition group.
 let parent=[0x3aad9063,0x467141c3,0x0e4a9888,0xed6f034e];
 let child=[0x7a4030d3,0x4113e55e,0x8cb9a6a2,0xc866d13e];
 let done=AchievementValue{complete:true,current:1.0,completed:Some((1_750_000_000,123_456_700))};
 let wrong_date=AchievementValue{completed:Some((1_750_000_001,0)),..done};
 for zipped in [false,true]{
  let raw=slot("3.0.1");
  let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert!(e.complete_child_and_create_parent(child,None,done,parent,wrong_date).is_err());
  assert!(e.complete_child_and_create_parent(child,None,done,[0,0,0,0],done).is_err());
  assert!(e.complete_child_and_create_parent(child,None,done,parent,AchievementValue{current:2.0,..done}).is_err());
  assert!(!e.dirty());assert!(!e.can_undo());

  e.complete_child_and_create_parent(child,None,done,parent,done).unwrap();
  assert_eq!(e.achievement_value(child),Some(done));
  assert_eq!(e.achievement_value(parent),Some(done));
  assert_eq!(e.achievements().len(),4);
  assert_eq!(e.revision(),1);
  let out=e.export().unwrap();
  let reloaded=Editor::open(out).unwrap();
  assert_eq!(reloaded.achievement_value(child),Some(done));
  assert_eq!(reloaded.achievement_value(parent),Some(done));
  assert_eq!(reloaded.achievements().len(),4);
  assert!(e.undo());
  assert_eq!(e.achievement_value(child),None);
  assert_eq!(e.achievement_value(parent),None);
  assert!(!e.dirty());
  assert!(!e.can_undo());
  assert!(e.redo());
  assert_eq!(e.achievement_value(child),Some(done));
  assert_eq!(e.achievement_value(parent),Some(done));
 }
}
#[test]
fn absent_parent_is_created_with_last_existing_child_and_preserves_prior_undo(){
 use hkia_save_core::achievement::AchievementValue;
 let parent=[0x3aad9063,0x467141c3,0x0e4a9888,0xed6f034e];
 let child=[0x7a4030d3,0x4113e55e,0x8cb9a6a2,0xc866d13e];
 let incomplete=AchievementValue{complete:false,current:0.0,completed:None};
 let done=AchievementValue{complete:true,current:1.0,completed:Some((1_750_000_001,0))};
 let mut e=Editor::open(slot("3.0.1")).unwrap();
 e.create_achievement(child,incomplete).unwrap();
 let rev=e.revision();
 assert!(e.complete_child_and_create_parent(child,Some(done),done,parent,done).is_err());
 assert!(e.complete_child_and_create_parent(child,Some(incomplete),done,parent,
  AchievementValue{current:2.0,..done}).is_err());
 assert_eq!(e.revision(),rev);
 e.complete_child_and_create_parent(child,Some(incomplete),done,parent,done).unwrap();
 assert_eq!(e.achievement_value(child),Some(done));
 assert_eq!(e.achievement_value(parent),Some(done));
 assert_eq!(Editor::open(e.export().unwrap()).unwrap().achievement_value(parent),Some(done));
 assert!(e.undo());
 assert_eq!(e.achievement_value(child),Some(incomplete));
 assert_eq!(e.achievement_value(parent),None);
 assert!(e.undo());
 assert_eq!(e.achievement_value(child),None);
 assert!(e.redo());assert_eq!(e.achievement_value(child),Some(incomplete));
 assert!(e.redo());assert_eq!(e.achievement_value(parent),Some(done));
}


#[test]
fn source_verified_floorplans_all_18_history_add_remove_and_zip_roundtrip(){
 // Steam v3.0.1 original InventoryItemDefinitionAsset.Id / group_floorplans:
 // exact same source IDs as public floorplan icon map and all 16 Babel names.
 const FLOORPLANS:[i32;18]=[
  259795663,290094351,300918892,464377127,559890359,618271257,
  619281290,754411213,768707764,1287138344,1386807800,1436147020,
  1517287020,1611086920,1709307148,1834332337,2124133713,2146463597
 ];
 for zipped in [false,true]{
  let raw=slot("3.0.1");
  let original=if zipped{zip(&raw)}else{raw};
  let mut editor=Editor::open(original.clone()).unwrap();
  assert!(editor.can_change_membership());
  assert!(!editor.dirty());
  for (i,&id) in FLOORPLANS.iter().enumerate(){
   let ticks=638000000000000000i64+(i as i64)*10000;
   assert_eq!(editor.value(id),None);
   editor.change(id,None,Some(ticks)).unwrap();
   assert_eq!(editor.value(id),Some(ticks));
   assert!(editor.change(id,None,Some(ticks)).is_err(),"duplicate CAS");
  }
  assert_eq!(editor.entries().len(),20); // original two + source 18
  let exported=editor.export().unwrap();
  let restored=Editor::open(exported).unwrap();
  assert_eq!(restored.entries().len(),20);
  assert_eq!(restored.version(),"3.0.1");
  for (i,&id) in FLOORPLANS.iter().enumerate(){
   let ticks=638000000000000000i64+(i as i64)*10000;
   assert_eq!(restored.value(id),Some(ticks),"missing floorplan after export");
  }
  // Previously absent saved history is actually removable and undoable.
  let removed=FLOORPLANS[0];
  let ticks=638000000000000000i64;
  editor.change(removed,Some(ticks),None).unwrap();
  assert_eq!(editor.value(removed),None);
  assert!(editor.undo());
  assert_eq!(editor.value(removed),Some(ticks));
  assert!(editor.redo());assert_eq!(editor.value(removed),None);
  assert!(editor.undo());
  for _ in 0..18{assert!(editor.undo());}
  assert!(!editor.dirty());
  assert!(!editor.can_undo());
  assert_eq!(editor.source_bytes(),original.len());
 }
}
#[test]
fn floorplan_history_writer_keeps_other_restricted_ids_and_older_versions_denied(){
 const ID:i32=259795663;
 let ticks=638000000000000000i64;
 let mut v300=Editor::open(slot("3.0.0")).unwrap();
 assert!(v300.change(ID,None,Some(ticks)).is_err());
 assert!(!v300.dirty());assert!(!v300.can_undo());
 let mut v301=Editor::open(slot("3.0.1")).unwrap();
 for denied in [259795662,259795664,2147483647,-1,0] {
  assert!(v301.change(denied,None,Some(ticks)).is_err(),"unverified ID {denied} accepted");
 }
 assert!(!v301.dirty());
 assert_eq!(v301.entries().len(),2);
 v301.change(ID,None,Some(ticks)).unwrap();
 assert_eq!(Editor::open(v301.export().unwrap()).unwrap().value(ID),Some(ticks));
}

#[test]
fn category_parent_relock_is_atomic_and_restores_both_records_with_one_undo(){
 use hkia_save_core::achievement::AchievementValue;
 for version in ["3.0.0","3.0.1"]{
  for zipped in [false,true]{
   let raw=slot(version);
   let input=if zipped{zip(&raw)}else{raw};
   let mut editor=Editor::open(input).unwrap();
   let leaf=[1,0,0,1];let parent=[2,0,0,1];
   let old_leaf=AchievementValue{complete:false,current:1.0,completed:None};
   let old_parent=AchievementValue{complete:false,current:2.0,completed:None};
   let completed_at=Some((1_750_000_001,123_456_700));
   let done_leaf=AchievementValue{complete:true,current:1.0,completed:completed_at};
   let done_parent=AchievementValue{complete:true,current:2.0,completed:completed_at};
   let undone_leaf=AchievementValue{complete:false,current:0.0,completed:None};
   let undone_parent=AchievementValue{complete:false,current:1.0,completed:None};
   editor.change_achievement_pair((leaf,old_leaf,done_leaf),(parent,old_parent,done_parent)).unwrap();
   assert!(editor.change_achievement_pair(
    (leaf,done_leaf,undone_leaf),(parent,old_parent,undone_parent)
   ).is_err(),"stale parent CAS must not partially revoke child");
   assert_eq!(editor.achievement_value(leaf),Some(done_leaf));
   assert_eq!(editor.achievement_value(parent),Some(done_parent));
   editor.change_achievement_pair(
    (leaf,done_leaf,undone_leaf),(parent,done_parent,undone_parent)
   ).unwrap();
   assert_eq!(editor.revision(),2);
   let reopened=Editor::open(editor.export().unwrap()).unwrap();
   assert_eq!(reopened.achievement_value(leaf),Some(undone_leaf));
   assert_eq!(reopened.achievement_value(parent),Some(undone_parent));
   assert!(editor.undo());
   assert_eq!(editor.achievement_value(leaf),Some(done_leaf));
   assert_eq!(editor.achievement_value(parent),Some(done_parent));
   assert!(editor.redo());
   assert_eq!(editor.achievement_value(leaf),Some(undone_leaf));
   assert_eq!(editor.achievement_value(parent),Some(undone_parent));
   assert!(editor.undo());
   assert!(editor.undo());
   assert_eq!(editor.achievement_value(leaf),Some(old_leaf));
   assert_eq!(editor.achievement_value(parent),Some(old_parent));
   assert!(!editor.dirty());
  }
 }
}

#[test]
fn completed_parent_date_sync_is_atomic_cas_checked_and_one_step_undoable_in_raw_and_zip(){
 use hkia_save_core::achievement::AchievementValue;
 for version in ["3.0.0","3.0.1"]{
  for zipped in [false,true]{
   let raw=slot(version);
   let input=if zipped{zip(&raw)}else{raw};
   let mut e=Editor::open(input.clone()).unwrap();
   let leaf=[1,0,0,1];let parent=[2,0,0,1];
   let incomplete_leaf=AchievementValue{complete:false,current:1.0,completed:None};
   let incomplete_parent=AchievementValue{complete:false,current:2.0,completed:None};
   let original_date=Some((1_750_000_001,123_456_700));
   let changed_date=Some((1_750_000_010,987_654_300));
   let old_leaf=AchievementValue{complete:true,current:1.0,completed:original_date};
   let old_parent=AchievementValue{complete:true,current:2.0,completed:original_date};
   let new_leaf=AchievementValue{completed:changed_date,..old_leaf};
   let new_parent=AchievementValue{completed:changed_date,..old_parent};
   e.change_achievement_pair(
    (leaf,incomplete_leaf,old_leaf),(parent,incomplete_parent,old_parent)
   ).unwrap();
   let revision=e.revision();
   assert!(e.change_achievement_pair(
    (leaf,old_leaf,new_leaf),(parent,AchievementValue{current:99.0,..old_parent},new_parent)
   ).is_err(),"bad parent CAS cannot partially mutate either date");
   assert_eq!(e.revision(),revision);
   assert_eq!(e.achievement_value(leaf),Some(old_leaf));
   assert_eq!(e.achievement_value(parent),Some(old_parent));
   e.change_achievement_pair((leaf,old_leaf,new_leaf),(parent,old_parent,new_parent)).unwrap();
   assert_eq!(e.revision(),revision+1);
   assert_eq!(e.achievement_value(leaf),Some(new_leaf));
   assert_eq!(e.achievement_value(parent),Some(new_parent));
   let reopened=Editor::open(e.export().unwrap()).unwrap();
   assert_eq!(reopened.achievement_value(leaf),Some(new_leaf));
   assert_eq!(reopened.achievement_value(parent),Some(new_parent));
   assert!(e.undo());
   assert_eq!(e.achievement_value(leaf),Some(old_leaf));
   assert_eq!(e.achievement_value(parent),Some(old_parent));
   assert!(e.redo());
   assert_eq!(e.achievement_value(leaf),Some(new_leaf));
   assert_eq!(e.achievement_value(parent),Some(new_parent));
   assert!(e.undo());assert!(e.undo());
   assert!(!e.dirty());
   assert_eq!(e.achievement_value(leaf),Some(incomplete_leaf));
   assert_eq!(e.achievement_value(parent),Some(incomplete_parent));
  }
 }
}


#[test]
fn tab_scoped_history_jumps_preserve_interleaved_edits_and_independent_redo_branches(){
 use hkia_save_core::achievement::AchievementValue;
 use hkia_save_core::collection::HistoryScope::{Collections,Achievements};
 for version in ["3.0.0","3.0.1"]{
  for zipped in [false,true]{
   let raw=slot(version);
   let input=if zipped{zip(&raw)}else{raw};
   let mut e=Editor::open(input).unwrap();
   let id=2;let original=638000000000000001i64;
   let first=original+100;let second=original+200;
   let guid=[1,0,0,1];
   let base=AchievementValue{complete:false,current:1.0,completed:None};
   let done=AchievementValue{complete:true,current:2.0,completed:Some((1_750_000_000,123_456_700))};
   let dated=AchievementValue{completed:Some((1_750_000_010,987_654_300)),..done};
   assert!(e.history().is_empty());
   assert!(!e.jump_history(Collections,1));
   e.change(id,Some(original),Some(first)).unwrap();
   e.change_achievement(guid,base,done).unwrap();
   e.change(id,Some(first),Some(second)).unwrap();
   e.change_achievement(guid,done,dated).unwrap();
   let timeline=e.history();
   assert_eq!(timeline.len(),4);
   assert_eq!(timeline.iter().map(|r|r.scope).collect::<Vec<_>>(),
    vec![Collections,Achievements,Collections,Achievements]);
   assert!(timeline.iter().all(|r|r.applied));
   assert_eq!(timeline[0].item_id,id);
   assert_eq!(timeline[1].guid,guid);
   assert!(!e.jump_history(Collections,3));
   assert_eq!(e.value(id),Some(second));
   assert!(e.jump_history(Collections,0));
   assert_eq!(e.value(id),Some(original));
   assert_eq!(e.achievement_value(guid),Some(dated));
   assert_eq!(e.history().iter().filter(|x|x.scope==Collections&&x.applied).count(),0);
   assert_eq!(e.history().iter().filter(|x|x.scope==Collections&&!x.applied).count(),2);
   assert!(e.jump_history(Achievements,1));
   assert_eq!(e.achievement_value(guid),Some(done));
   assert_eq!(e.value(id),Some(original));
   assert!(e.jump_history(Collections,1));
   assert_eq!(e.value(id),Some(first));
   assert_eq!(e.achievement_value(guid),Some(done));
   assert!(e.jump_history(Achievements,2));
   assert_eq!(e.achievement_value(guid),Some(dated));
   assert!(e.jump_history(Collections,0));
   // New achievement edit may prune only achievement redo; collection redo survives.
   e.change_achievement(guid,dated,base).unwrap();
   assert!(e.jump_history(Collections,2));
   assert_eq!(e.value(id),Some(second));
   assert_eq!(e.achievement_value(guid),Some(base));
   assert!(e.jump_history(Achievements,0));
   assert_eq!(e.achievement_value(guid),Some(base));
   // New collection edit preserves both achievement-redo entries.
   e.change(id,Some(second),Some(original+500)).unwrap();
   assert!(e.jump_history(Achievements,2));
   assert_eq!(e.achievement_value(guid),Some(done));
   assert_eq!(e.value(id),Some(original+500));
   let opened=Editor::open(e.export().unwrap()).unwrap();
   assert_eq!(opened.achievement_value(guid),Some(done));
   assert_eq!(opened.value(id),Some(original+500));
   assert!(!e.jump_history(Achievements,300));
   assert_eq!(e.achievement_value(guid),Some(done));
   e.reset();
   assert!(e.history().is_empty());
   assert!(!e.can_undo());
   assert!(!e.can_redo());
   assert!(!e.dirty());
  }
 }
}

#[test]
fn native_pair_is_one_achievement_history_step_and_never_rewinds_collections(){
 use hkia_save_core::achievement::AchievementValue;
 use hkia_save_core::collection::HistoryScope::{Collections,Achievements};
 let mut e=Editor::open(slot("3.0.1")).unwrap();
 let child=[1,0,0,1];let parent=[2,0,0,1];
 let old_child=AchievementValue{complete:false,current:1.0,completed:None};
 let old_parent=AchievementValue{complete:false,current:2.0,completed:None};
 let done_child=AchievementValue{complete:true,current:1.0,completed:Some((1_750_000_000,0))};
 let done_parent=AchievementValue{complete:true,current:2.0,completed:Some((1_750_000_000,0))};
 e.change(2,Some(638000000000000001),Some(638000000000000100)).unwrap();
 e.change_achievement_pair(
  (child,old_child,done_child),(parent,old_parent,done_parent)
 ).unwrap();
 let history=e.history();
 assert_eq!(history.len(),2);
 assert_eq!(history[0].scope,Collections);
 assert_eq!(history[1].scope,Achievements);
 assert!(history[1].paired);
 assert_eq!(history[1].guid,child);
 assert!(e.jump_history(Achievements,0));
 assert_eq!(e.achievement_value(child),Some(old_child));
 assert_eq!(e.achievement_value(parent),Some(old_parent));
 assert_eq!(e.value(2),Some(638000000000000100));
 assert!(e.jump_history(Achievements,1));
 assert_eq!(e.achievement_value(child),Some(done_child));
 assert_eq!(e.achievement_value(parent),Some(done_parent));
 assert_eq!(e.value(2),Some(638000000000000100));
}

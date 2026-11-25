
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
fn version_number(version:&str)->u32{
 let components:Vec<u32>=version.split('.').map(|x|x.parse().unwrap()).collect();
 components[0]*10000+components[1]*100+components[2]
}
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
 b.extend(u(version_number(version)));
 b.extend([0x92,0xd6,0xff]);b.extend(1_750_000_000u32.to_be_bytes());b.push(0);
 b.push(0);b.push(0x80);b.push(0x90);b.extend([0x91,9]);
 b.extend(magic);
 let compressed=literal(&payload);
 b.extend([0x92,0xc8,0,3,98,0xcd]);
 b.extend((payload.len() as u16).to_be_bytes());
 b.push(0xc6);b.extend((compressed.len() as u32).to_be_bytes());b.extend(compressed);
 b
}
/// Synthetic v3.0.1 source-shaped inventory records: ordinary stack and
/// a unique-data-bearing item. Source user saves are never checked in.
fn inventory_slot(version:&str)->Vec<u8>{
 let mut payload=synthetic_payload(version);
 assert_eq!(&payload[..4],&[0x93,0,4,0x95]);
 payload[3]=0x97; // add two original IDocument union(1) entries
 payload.extend(doc(1,arr(vec![u(4),u(315822),u(0),u(6),vec![0xc0]])));
 let unique=arr(vec![vec![0],arr(vec![guid([11,22,33,44])])]);
 payload.extend(doc(1,arr(vec![u(5),u(315822),u(1),u(1),unique])));
 slot_from_payload(version,payload)
}
#[test]
fn inventory_existing_stack_edit_undo_history_export_and_reopen(){
 use hkia_save_core::collection::HistoryScope::{Inventory,Collections};
 for version in ["3.0.0","3.0.1"]{
  for zipped in [false,true]{
   let raw=inventory_slot(version);
   let input=if zipped{zip(&raw)}else{raw};
   let mut e=Editor::open(input.clone()).unwrap();
   let original=e.inventory();
   assert_eq!(original.len(),2);
   assert_eq!((original[0].document_id,original[0].item_id,original[0].quantity),(4,315822,6));
   assert!(!original[1].editable,"unique-data-backed inventory is read-only");
   assert!(e.change_inventory_quantity(5,1,20).is_err());
   assert!(e.change_inventory_quantity(4,9,20).is_err(),"stale CAS rejected");
   assert!(e.change_inventory_quantity(4,6,0).is_err(),"zero count would delete or corrupt a stack");
   if version=="3.0.0"{
    assert!(!original[0].editable);
    assert!(e.change_inventory_quantity(4,6,20).is_err());
    continue
   }
   assert!(original[0].editable);
   e.change_inventory_quantity(4,6,20).unwrap();
   assert_eq!(e.inventory()[0].quantity,20);
   assert_eq!(e.history().len(),1);
   assert_eq!(e.history()[0].scope,Inventory);
   let checkpoint=e.history_checkpoint().unwrap();
   let mut restored=Editor::open(input.clone()).unwrap();
   restored.restore_history(&checkpoint).unwrap();
   assert_eq!(restored.inventory(),e.inventory());
   assert_eq!(restored.history_checkpoint().unwrap(),checkpoint);
   assert!(e.undo_scope(Inventory));
   assert_eq!(e.inventory(),original);
   assert!(!e.dirty());
   assert!(e.redo_scope(Inventory));
   assert_eq!(e.inventory()[0].quantity,20);
   let saved=e.export().unwrap();
   let reopened=Editor::open(saved).unwrap();
   assert_eq!(reopened.inventory()[0].quantity,20);
   assert_eq!(reopened.inventory()[1],original[1],"unique payload and item untouched");
   assert_eq!(reopened.value(2),Some(638000000000000001));
   assert_eq!(reopened.achievements(),Editor::open(input.clone()).unwrap().achievements());
   assert_eq!(Editor::open(input.clone()).unwrap().inventory(),original);
   // Crossing tab history stays independent; export with both patches.
   e.change(2,Some(638000000000000001),Some(638000000000000101)).unwrap();
   assert!(e.jump_history(Inventory,0));
   assert_eq!(e.value(2),Some(638000000000000101));
   assert_eq!(e.inventory(),original);
   assert!(e.jump_history(Inventory,1));
   assert_eq!(e.history().iter().filter(|h|h.scope==Collections&&h.applied).count(),1);
   let mixed=Editor::open(e.export().unwrap()).unwrap();
   assert_eq!(mixed.inventory()[0].quantity,20);
   assert_eq!(mixed.value(2),Some(638000000000000101));
  }
 }
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
  assert_eq!(src.index.achievements[2].id,5); // original DbRoot.NextId 4 + 1
   assert_eq!(src.index.root_next_id.as_ref().unwrap().0,5);
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
   assert_eq!(e.achievement_value(guid),Some(dated));
   assert_eq!(e.value(id),Some(original+500));
   let opened=Editor::open(e.export().unwrap()).unwrap();
   assert_eq!(opened.achievement_value(guid),Some(dated));
   assert_eq!(opened.value(id),Some(original+500));
   assert!(!e.jump_history(Achievements,300));
   assert_eq!(e.achievement_value(guid),Some(dated));
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


#[test]
fn future_semver_uses_native_schema_compatibility_for_existing_collection_and_achievement_edits(){
 use hkia_save_core::achievement::AchievementValue;
 for version in ["3.0.2","3.0.4","3.1.0","4.0.0"]{
  for zipped in [false,true]{
   let raw=slot(version);
   let input=if zipped{zip(&raw)}else{raw};
   let mut editor=Editor::open(input).unwrap();
   assert_eq!(editor.version(),version);
   assert_eq!(editor.value(2),Some(638000000000000001));
   let before=AchievementValue{complete:false,current:1.0,completed:None};
   let after=AchievementValue{complete:true,current:1.0,completed:Some((1_750_000_000,123_456_700))};
   editor.change_achievement([1,0,0,1],before,after).unwrap();
   editor.change(2,Some(638000000000000001),Some(638000000000000200)).unwrap();
   assert!(editor.create_achievement([3,0,0,1],after).is_err(),
    "future achievements absent from the source must not be created blindly");
   assert!(editor.change(12345,None,Some(638000000000000200)).is_err(),
    "new collection source IDs must not be presumed valid across versions");
   let exported=editor.export().unwrap();
   let reopened=Editor::open(exported).unwrap();
   assert_eq!(reopened.version(),version);
   assert_eq!(reopened.value(2),Some(638000000000000200));
   assert_eq!(reopened.achievement_value([1,0,0,1]),Some(after));
   assert!(editor.undo());
   assert_eq!(editor.value(2),Some(638000000000000001));
   assert!(editor.redo());
   assert_eq!(editor.value(2),Some(638000000000000200));
  }
 }
}

#[test]
fn forward_compatibility_rejects_malformed_versions_and_version_metadata_disagreement(){
 for version in ["2.99.99","3.0.01","3.0.0","3.00.2","3.0.300"]{
  if version=="3.0.0"{continue}
  // Synthetic test builder may include rejected headers; do not open.
  assert!(Editor::open(slot(version)).is_err(),"malformed version {version} accepted");
 }
 assert!(Editor::open(slot_from_payload("3.0.2",synthetic_payload("3.0.3"))).is_err(),
  "CollectionVersion metadata must match forward envelope version");
 assert!(Editor::open(slot_from_payload("3.0.3",synthetic_payload("3.0.2"))).is_err());
 // Native schema cannot be skipped by a higher syntactically valid version.
 let mut bad=synthetic_payload("3.0.2");
 // Change the collection history map's saved timestamp into a boolean token.
 let original=l(638000000000000001);
 let p=bad.windows(original.len()).position(|x|x==original.as_slice()).expect("native sample timestamp");
 bad[p]=0xc3;
 assert!(Editor::open(slot_from_payload("3.0.2",bad)).is_err(),
  "incorrect future target types must fail before write");
}


#[test]
fn restored_history_checkpoint_keeps_tab_cursors_redo_order_and_native_state(){
 use hkia_save_core::achievement::AchievementValue;
 use hkia_save_core::collection::HistoryScope::{Collections,Achievements};
 let id=2;let original_ticks=638000000000000001i64;let first_ticks=original_ticks+100;
 let second_ticks=original_ticks+200;let guid=[1,0,0,1];
 let base=AchievementValue{complete:false,current:1.0,completed:None};
 let done=AchievementValue{complete:true,current:1.0,completed:Some((1_750_000_000,123_456_700))};
 let dated=AchievementValue{completed:Some((1_750_000_010,987_654_300)),..done};
 for version in ["3.0.0","3.0.1","3.0.4"]{
  for zipped in [false,true]{
   let raw=slot(version);let input=if zipped{zip(&raw)}else{raw};
   let mut e=Editor::open(input.clone()).unwrap();
   let pristine=e.history_checkpoint().unwrap();
   assert_eq!(&pristine[..8],b"HKIAHS01");assert_eq!(pristine.len(),16);
   e.change(id,Some(original_ticks),Some(first_ticks)).unwrap();
   e.change_achievement(guid,base,done).unwrap();
   e.change(id,Some(first_ticks),Some(second_ticks)).unwrap();
   e.change_achievement(guid,done,dated).unwrap();
   // Interleaved and differently scoped redos are kept in native stack order.
   assert!(e.jump_history(Achievements,1));
   assert!(e.jump_history(Collections,1));
   let expected=e.history();
   let checkpoint=e.history_checkpoint().unwrap();
   assert_ne!(checkpoint,pristine);
   let mut restored=Editor::open(input.clone()).unwrap();
   restored.restore_history(&checkpoint).unwrap();
   assert_eq!(restored.history(),expected);
   assert_eq!(restored.history_checkpoint().unwrap(),checkpoint);
   assert_eq!(restored.value(id),Some(first_ticks));
   assert_eq!(restored.achievement_value(guid),Some(done));
   assert!(restored.jump_history(Collections,2));
   assert_eq!(restored.value(id),Some(second_ticks));
   assert_eq!(restored.achievement_value(guid),Some(done));
   assert!(restored.jump_history(Achievements,2));
   assert_eq!(restored.achievement_value(guid),Some(dated));
   let reread=Editor::open(restored.export().unwrap()).unwrap();
   assert_eq!(reread.achievement_value(guid),Some(dated));
   assert_eq!(reread.value(id),Some(second_ticks));
   // Restored redo branches survive even when both tab edits net to zero.
   assert!(e.jump_history(Collections,0));
   assert!(e.jump_history(Achievements,0));
   assert!(!e.dirty());assert!(!e.can_undo());assert!(e.can_redo());
   let zero=e.history_checkpoint().unwrap();
   let mut undo_only=Editor::open(input).unwrap();
   undo_only.restore_history(&zero).unwrap();
   assert_eq!(undo_only.history(),e.history());
   assert_eq!(undo_only.history_checkpoint().unwrap(),zero);
   assert!(!undo_only.dirty());
   assert!(undo_only.jump_history(Collections,2));
   assert!(undo_only.jump_history(Achievements,2));
   assert_eq!(undo_only.value(id),Some(second_ticks));
   assert_eq!(undo_only.achievement_value(guid),Some(dated));
  }
 }
}

#[test]
fn native_checkpoint_replays_source_verified_achievement_creation_and_grouped_parent_edits(){
 use hkia_save_core::achievement::AchievementValue;
 use hkia_save_core::collection::HistoryScope::Achievements;
 let new_guid=[13220480,1299065047,2812061598,2966187300];
 let original=slot("3.0.1");let mut editor=Editor::open(original.clone()).unwrap();
 let done=AchievementValue{complete:true,current:1.0,completed:Some((1_750_000_000,123_456_700))};
 let undone=AchievementValue{complete:false,current:0.0,completed:None};
 editor.create_achievement(new_guid,done).unwrap();
 editor.change_achievement(new_guid,done,undone).unwrap();
 let leaf=[1,0,0,1];let parent=[2,0,0,1];
 let base_child=AchievementValue{complete:false,current:1.0,completed:None};
 let base_parent=AchievementValue{complete:false,current:2.0,completed:None};
 let done_parent=AchievementValue{complete:true,current:2.0,completed:done.completed};
 editor.change_achievement_pair((leaf,base_child,done),(parent,base_parent,done_parent)).unwrap();
 assert!(editor.jump_history(Achievements,2));
 let checkpoint=editor.history_checkpoint().unwrap();
 let mut recovered=Editor::open(original.clone()).unwrap();
 recovered.restore_history(&checkpoint).unwrap();
 assert_eq!(recovered.history_checkpoint().unwrap(),checkpoint);
 assert_eq!(recovered.achievement_value(new_guid),Some(undone));
 assert_eq!(recovered.achievement_value(leaf),Some(base_child));
 assert_eq!(recovered.achievement_value(parent),Some(base_parent));
 assert_eq!(recovered.history().len(),3);
 assert!(recovered.history()[2].paired);
 assert!(!recovered.history()[2].applied);
 assert!(recovered.jump_history(Achievements,3));
 assert_eq!(recovered.achievement_value(leaf),Some(done));
 assert_eq!(recovered.achievement_value(parent),Some(done_parent));
 assert_eq!(Editor::open(recovered.export().unwrap()).unwrap().achievement_value(new_guid),Some(undone));
}

#[test]
fn native_checkpoint_replays_missing_parent_creation_as_one_reversible_step(){
 use hkia_save_core::achievement::AchievementValue;
 use hkia_save_core::collection::HistoryScope::Achievements;
 let parent=[0x3aad9063,0x467141c3,0x0e4a9888,0xed6f034e];
 let child=[0x7a4030d3,0x4113e55e,0x8cb9a6a2,0xc866d13e];
 let done=AchievementValue{complete:true,current:1.0,completed:Some((1_750_000_000,123_456_700))};
 for zipped in [false,true]{
  let raw=slot("3.0.1");let input=if zipped{zip(&raw)}else{raw};
  let mut editor=Editor::open(input.clone()).unwrap();
  editor.complete_child_and_create_parent(child,None,done,parent,done).unwrap();
  assert!(editor.jump_history(Achievements,0));
  let journal=editor.history_checkpoint().unwrap();
  let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&journal).unwrap();
  assert_eq!(restored.history_checkpoint().unwrap(),journal);
  assert_eq!(restored.history().len(),1);
  assert!(restored.history()[0].paired);
  assert_eq!(restored.achievement_value(child),None);
  assert_eq!(restored.achievement_value(parent),None);
  assert!(restored.jump_history(Achievements,1));
  assert_eq!(restored.achievement_value(child),Some(done));
  assert_eq!(restored.achievement_value(parent),Some(done));
 }
}

#[test]
fn checkpoint_recovery_rejects_corrupted_stale_or_trailing_data_atomically(){
 let original=slot("3.0.1");
 let mut editor=Editor::open(original.clone()).unwrap();
 editor.change(2,Some(638000000000000001),Some(638000000000000100)).unwrap();
 let journal=editor.history_checkpoint().unwrap();
 for damaged in [
  {let mut d=journal.clone();d[0]^=0xff;d},
  {let mut d=journal.clone();d[8..12].copy_from_slice(&257u32.to_le_bytes());d},
  {let mut d=journal.clone();d[12..16].copy_from_slice(&255u32.to_le_bytes());d},
  {let mut d=journal.clone();d.push(0);d},
  {let mut d=journal.clone();d.truncate(d.len()-1);d},
  {let mut d=journal.clone();d[16]=99;d},
  {let mut d=journal.clone();d[17..21].copy_from_slice(&12345i32.to_le_bytes());d},
 ]{
  let mut candidate=Editor::open(original.clone()).unwrap();
  let pristine=candidate.history_checkpoint().unwrap();
  assert!(candidate.restore_history(&damaged).is_err());
  assert_eq!(candidate.history_checkpoint().unwrap(),pristine);
  assert!(!candidate.dirty());assert!(!candidate.can_redo());
 }
 // Do not replace existing user changes when an untrusted checkpoint arrives.
 let before=editor.history_checkpoint().unwrap();
 assert!(editor.restore_history(&before).is_err());
 assert_eq!(editor.history_checkpoint().unwrap(),before);
}

#[test]
fn v301_native_planned_achievement_create_revoke_and_export_roundtrip(){
 use hkia_save_core::achievement::{AchievementValue,plan_toggle_v301};
 // Genuine source-verified local achievement GUID (native goal=12), used
 // only in a synthetic slot. No personal save or fabricated game ID.
 let guid=[15182560,1296854392,3253409457,3976879535];
 let original=slot("3.0.1");
 let mut editor=Editor::open(original.clone()).unwrap();
 assert_eq!(editor.achievement_value(guid),None);
 let empty=AchievementValue{complete:false,current:0.0,completed:None};
 let completed=plan_toggle_v301(guid,empty,1_795_251_723_456).unwrap();
 assert_eq!(completed.current,12.0);
 editor.create_achievement(guid,completed).unwrap();
 assert_eq!(editor.achievement_value(guid),Some(completed));
 assert!(editor.undo());
 assert_eq!(editor.achievement_value(guid),None);
 assert!(editor.redo());
 let saved=editor.export().unwrap();
 assert_eq!(original,slot("3.0.1"),"original synthetic save is immutable");
 let mut reopened=Editor::open(saved).unwrap();
 assert_eq!(reopened.achievement_value(guid),Some(completed));
 let revoked=plan_toggle_v301(guid,completed,1_795_251_723_999).unwrap();
 assert_eq!(revoked,AchievementValue{complete:false,current:11.0,completed:None});
 reopened.change_achievement(guid,completed,revoked).unwrap();
 assert_eq!(Editor::open(reopened.export().unwrap()).unwrap().achievement_value(guid),Some(revoked));
 assert!(reopened.undo());
 assert_eq!(reopened.achievement_value(guid),Some(completed));
 assert!(reopened.redo());
 assert_eq!(reopened.achievement_value(guid),Some(revoked));
}

fn auto_achievement_fixture(version:&str,rows:&[([u32;4],hkia_save_core::achievement::AchievementValue)])->Vec<u8>{
 let v=doc(18,arr(vec![vec![0],u(if version=="3.0.0"{83}else{87}),{
  let mut s=vec![0xa0|version.len()as u8];s.extend(version.as_bytes());s
 }]));
 // DbRoot requires at least one native AchievementModel and GameCounterModel,
 // even when the source-defined category under test is wholly absent.
 let filler=doc(16,arr(vec![vec![1],guid([1,0,0,1]),
  arr(vec![vec![0xc2],f(0.0),vec![0xc0]])]));
 let counter=doc(17,arr(vec![vec![2],guid([1,0,0,2]),
  arr(vec![f(2.0),vec![0xc0],vec![0x90]])]));
 let mut models=vec![v,filler,counter];
 for (i,(key,value)) in rows.iter().enumerate(){
  let date=if let Some((seconds,nanos))=value.completed{
   let mut b=vec![0xc7,12,0xff];
   b.extend(nanos.to_be_bytes());b.extend(seconds.to_be_bytes());b
  }else{vec![0xc0]};
  models.push(doc(16,arr(vec![vec![(i+4)as u8],guid(*key),
   arr(vec![vec![if value.complete{0xc3}else{0xc2}],f(value.current),date])])));
 }
 let key=map(vec![(vec![2],l(638000000000000001)),(vec![3],l(9))]);
 let collection=doc(39,arr(vec![map(vec![]),key]));
 models.push(doc(32,arr(vec![vec![3],guid([0,0,0,3]),vec![0],arr(vec![collection])])));
 slot_from_payload(version,arr(vec![vec![0],vec![4],arr(models)]))
}
#[test]
fn rust_auto_category_last_child_completion_revoke_and_date_sync_one_undo(){
 use hkia_save_core::achievement::AchievementValue as A;
 // These three IDs are from the original v3.0.1 two-child category.
 let p=[735910181,1277923196,579092924,1040734789];
 let c1=[490253731,222802515,1171786643,2805829719];
 let c2=[4168762965,1138949340,3213554308,2987728360];
 let date1=(1_750_000_001,123_456_700);
 let date2=(1_750_000_002,987_654_300);
 let parent=A{complete:false,current:1.0,completed:None};
 let first=A{complete:true,current:1.0,completed:Some(date1)};
 let second=A{complete:false,current:0.0,completed:None};
 let original=auto_achievement_fixture("3.0.1",&[(p,parent),(c1,first),(c2,second)]);
 let mut e=Editor::open(original.clone()).unwrap();
 let done=A{complete:true,current:1.0,completed:Some(date2)};
 let stale=A{current:999.0,..second};
 assert!(e.edit_achievement_auto(c2,Some(stale),done).is_err());
 assert_eq!(e.achievement_value(p),Some(parent));
 assert!(!e.dirty());
 e.edit_achievement_auto(c2,Some(second),done).unwrap();
 let completed_parent=A{complete:true,current:2.0,completed:Some(date2)};
 assert_eq!(e.achievement_value(p),Some(completed_parent));
 assert_eq!(e.achievement_value(c2),Some(done));
 assert!(e.undo()); // both child and parent, one atomic operation
 assert_eq!(e.achievement_value(p),Some(parent));
 assert_eq!(e.achievement_value(c2),Some(second));
 assert!(!e.can_undo());
 assert!(e.redo());
 assert_eq!(e.achievement_value(p),Some(completed_parent));
 // Correcting the date of the previously earlier child changes the source
 // maximum, but never invents nanoseconds or edits siblings.
 let changed=A{completed:Some((1_750_000_004,111_111_100)),..first};
 e.edit_achievement_auto(c1,Some(first),changed).unwrap();
 assert_eq!(e.achievement_value(p).unwrap().completed,changed.completed);
 assert_eq!(e.achievement_value(c2),Some(done));
 assert!(e.undo());
 assert_eq!(e.achievement_value(c1),Some(first));
 assert_eq!(e.achievement_value(p),Some(completed_parent));
 assert!(e.redo());
 // Parent now has an independently edited timestamp, so the next child
 // correction must leave that parent timestamp unchanged.
 let independently_dated=A{completed:Some((1_750_000_099,100)),..e.achievement_value(p).unwrap()};
 let now=e.achievement_value(p).unwrap();
 e.change_achievement(p,now,independently_dated).unwrap();
 let back=A{completed:Some((1_750_000_003,111_111_100)),..changed};
 e.edit_achievement_auto(c1,Some(changed),back).unwrap();
 assert_eq!(e.achievement_value(p),Some(independently_dated));
 // Revoke the child: completed category must be revoked atomically,
 // regardless of whether its timestamp was independently set.
 let revoked=A{complete:false,current:0.0,completed:None};
 e.edit_achievement_auto(c2,Some(done),revoked).unwrap();
 assert_eq!(e.achievement_value(p).unwrap().complete,false);
 assert_eq!(e.achievement_value(p).unwrap().completed,None);
 assert_eq!(e.achievement_value(p).unwrap().current,1.0);
 assert!(e.undo());
 assert_eq!(e.achievement_value(p),Some(independently_dated));
 assert_eq!(e.achievement_value(c2),Some(done));
 let exported=e.export().unwrap();
 let reopen=Editor::open(exported).unwrap();
 assert_eq!(reopen.achievement_value(p),Some(independently_dated));
 assert_eq!(reopen.achievement_value(c1),Some(back));
 assert_eq!(original,auto_achievement_fixture("3.0.1",&[(p,parent),(c1,first),(c2,second)]));
}
#[test]
fn rust_auto_category_missing_parent_and_child_create_atomically(){
 use hkia_save_core::achievement::AchievementValue as A;
 let p=[984453219,1181827523,239769736,3983475534];
 let c=[2051027155,1091822942,2360977058,3362181438];
 let done=A{complete:true,current:1.0,completed:Some((1_750_000_123,123_456_700))};
 let source=auto_achievement_fixture("3.0.1",&[]);
 let mut e=Editor::open(source.clone()).unwrap();
 e.edit_achievement_auto(c,None,done).unwrap();
 assert_eq!(e.achievement_value(c),Some(done));
 assert_eq!(e.achievement_value(p),Some(done));
 assert!(e.undo());
 assert_eq!(e.achievement_value(c),None);
 assert_eq!(e.achievement_value(p),None);
 assert!(!e.can_undo());
 assert!(e.redo());
 let output=e.export().unwrap();
 let again=Editor::open(output).unwrap();
 assert_eq!(again.achievement_value(c),Some(done));
 assert_eq!(again.achievement_value(p),Some(done));
 assert_eq!(source,auto_achievement_fixture("3.0.1",&[]));
 // Existing child + absent parent is also an atomic original-Union16 add.
 let old=A{complete:false,current:0.0,completed:None};
 let mut existing=Editor::open(auto_achievement_fixture("3.0.1",&[(c,old)])).unwrap();
 existing.edit_achievement_auto(c,Some(old),done).unwrap();
 assert_eq!(existing.achievement_value(p),Some(done));
 assert!(existing.undo());
 assert_eq!(existing.achievement_value(c),Some(old));
 assert_eq!(existing.achievement_value(p),None);
 // An already-saved incomplete parent + absent child uses the native
 // source-allowlisted create-with-parent transaction.
 let parent=A{complete:false,current:0.0,completed:None};
 let mut present=Editor::open(auto_achievement_fixture("3.0.1",&[(p,parent)])).unwrap();
 present.edit_achievement_auto(c,None,done).unwrap();
 assert_eq!(present.achievement_value(c),Some(done));
 assert_eq!(present.achievement_value(p),Some(done));
 assert!(present.undo());
 assert_eq!(present.achievement_value(c),None);
 assert_eq!(present.achievement_value(p),Some(parent));
}
#[test]
fn rust_auto_category_missing_siblings_and_unsupported_creation_fail_closed(){
 use hkia_save_core::achievement::AchievementValue as A;
 let p=[735910181,1277923196,579092924,1040734789];
 let c=[490253731,222802515,1171786643,2805829719];
 let before=A{complete:false,current:0.0,completed:None};
 let done=A{complete:true,current:1.0,completed:Some((1_750_000_002,0))};
 let mut e=Editor::open(auto_achievement_fixture("3.0.1",&[(p,before),(c,before)])).unwrap();
 e.edit_achievement_auto(c,Some(before),done).unwrap();
 assert_eq!(e.achievement_value(p),Some(before),"missing second child cannot be assumed completed");
 assert!(e.undo());
 assert_eq!(e.achievement_value(c),Some(before));
 // Unknown ID must never become a new native document.
 assert!(e.edit_achievement_auto([0,0,0,0],None,done).is_err());
 assert!(e.edit_achievement_auto(c,None,done).is_err(),"stale CAS must fail");
 assert_eq!(e.achievement_value(p),Some(before));
 let mut old=Editor::open(auto_achievement_fixture("3.0.0",&[(p,before),(c,before)])).unwrap();
 old.edit_achievement_auto(c,Some(before),done).unwrap();
 assert_eq!(old.achievement_value(p),Some(before),"v3.0.0 must not inherit source-v3.0.1 parent semantics");
 assert!(old.edit_achievement_auto([0,0,0,0],None,done).is_err());
}

#[test]
fn native_collection_creation_eligibility_gates_and_updates(){
 // Only a genuine Rust editor for Steam v3.0.1 with compatible membership
 // layout may offer source-known, missing collected-HISTORY records.
 let source=slot("3.0.1");
 let mut e=Editor::open(source.clone()).unwrap();
 let before=e.creatable_collection_history_ids();
 assert!(e.can_change_membership());
 assert!(before.contains(&315822),"ordinary source-defined history");
 assert!(before.contains(&259795663),"verified floorplan exception");
 assert!(before.contains(&2146463597),"all verified floorplans");
 assert!(!before.contains(&0));
 assert!(!before.contains(&i32::MAX));
 assert!(!before.contains(&259795662),"unverified adjacent floorplan");
 for pair in before.windows(2){assert!(pair[0]<pair[1],"sorted and unique");}
 assert!(before.len()>5000,"full source-defined membership allowlist must be available");
 // Present original history IDs must not be offered as new records.
 assert!(!before.contains(&2));
 assert!(!before.contains(&3));
 let initial_revision=e.revision();
 let _read_again=e.creatable_collection_history_ids();
 assert_eq!(e.revision(),initial_revision,"eligibility must be read-only");
 assert!(!e.dirty());
 let now=638000000000000000;
 e.change(315822,None,Some(now)).unwrap();
 assert!(!e.creatable_collection_history_ids().contains(&315822));
 assert!(e.undo());
 assert_eq!(e.creatable_collection_history_ids(),before);
 assert!(e.redo());
 assert!(!e.creatable_collection_history_ids().contains(&315822));
 let exported=e.export().unwrap();
 let reopened=Editor::open(exported).unwrap();
 assert!(!reopened.creatable_collection_history_ids().contains(&315822));
 assert_eq!(source,slot("3.0.1"),"source file unmodified");
 let old=Editor::open(slot("3.0.0")).unwrap();
 assert!(old.creatable_collection_history_ids().is_empty());
 assert!(old.can_change_membership());
 assert!(old.creatable_collection_history_ids().is_empty(),"v3.0.0 may not reuse v3.0.1 allowlist");
}

#[test]
fn v301_source_achievement_goals_read_only_exact_and_version_gated(){
 // Source-derived goal data lives in one authoritative Rust table. Showing
 // an achievement goal never edits progress, creates a record or alters Undo.
 let source=slot("3.0.1");
 let mut editor=Editor::open(source.clone()).unwrap();
 let goals=editor.source_achievement_progress_goals();
 assert_eq!(goals.len(),820);
 assert!(goals.windows(2).all(|rows|rows[0].0<rows[1].0));
 assert_eq!(goals.iter().find(|(g,_)|*g==[15182560,1296854392,3253409457,3976879535]).unwrap().1,12.0);
 assert_eq!(goals.iter().find(|(g,_)|*g==[735910181,1277923196,579092924,1040734789]).unwrap().1,2.0);
 assert!(goals.iter().all(|(_,goal)|goal.is_finite()&&*goal>=1.0&&goal.fract()==0.0));
 let revision=editor.revision();
 assert_eq!(editor.source_achievement_progress_goals(),goals);
 assert!(!editor.dirty());assert_eq!(editor.revision(),revision);
 editor.change(2,Some(638000000000000001),Some(638000000000000002)).unwrap();
 assert_eq!(editor.source_achievement_progress_goals(),goals);
 assert!(editor.undo());
 assert_eq!(editor.source_achievement_progress_goals(),goals);
 assert_eq!(source,slot("3.0.1"),"original synthetic save untouched");
 let old=Editor::open(slot("3.0.0")).unwrap();
 assert!(old.source_achievement_progress_goals().is_empty(),"do not infer unverified thresholds on v3.0.0");
}

#[test]
fn inventory_unique_data_is_typed_per_document_and_preserved(){
 use hkia_save_core::native::InventoryUniqueData as U;
 let mut payload=synthetic_payload("3.0.1");
 payload[3]=0x9b;
 let flower=arr(vec![vec![7],arr(vec![vec![6],vec![1],vec![10],vec![16]])]);
 let flower2=arr(vec![vec![7],arr(vec![vec![7],vec![9],vec![0],vec![0]])]);
 let furniture=arr(vec![vec![8],arr(vec![u(18),u(877),u(0)])]);
 let color=arr(vec![f(0.25),f(-0.0),f(0.75),f(1.0)]);
 let palette=arr(vec![vec![6],arr(vec![color.clone(),color.clone(),color])]);
 let partial=arr(vec![vec![7],arr(vec![vec![6],vec![1]])]);
 for (doc_id,uid,unique) in [(4,1,flower),(5,2,flower2),(6,3,furniture),(7,4,palette),(8,5,partial)]{
  payload.extend(doc(1,arr(vec![u(doc_id),u(315822),u(uid),u(1),unique])));
 }
 payload.extend(doc(1,arr(vec![u(9),u(567052),u(0),u(6),vec![0xc0]])));
 let mut e=Editor::open(slot_from_payload("3.0.1",payload)).unwrap();
 assert_eq!(e.inventory_unique_data(4),Some(U::Flower{grow_state:6,base_color:1,pattern:10,pattern_color:16}));
 assert_eq!(e.inventory_unique_data(5),Some(U::Flower{grow_state:7,base_color:9,pattern:0,pattern_color:0}));
 assert_eq!(e.inventory_unique_data(6),Some(U::Furniture{materials:[18,877,0]}));
 assert_eq!(e.inventory_unique_data(7),Some(U::Palette{rgba_bits:[[0.25f32.to_bits(),(-0.0f32).to_bits(),0.75f32.to_bits(),1.0f32.to_bits()];3]}));
 assert_eq!(e.inventory_unique_data(8),Some(U::Opaque{tag:7}));
 assert_eq!(e.inventory_unique_data(9),None);
 assert_eq!(e.inventory_unique_data(999),None);
 for id in 4..=8 {assert!(e.change_inventory_quantity(id,1,2).is_err());}
 e.change_inventory_quantity(9,6,20).unwrap();
 let reopened=Editor::open(e.export().unwrap()).unwrap();
 for id in 4..=9{assert_eq!(reopened.inventory_unique_data(id),e.inventory_unique_data(id));}
 assert_eq!(reopened.inventory().last().unwrap().quantity,20);
}

fn plain_flower(color:u8)->Vec<u8>{arr(vec![vec![7],arr(vec![vec![6],vec![color],vec![0],vec![0]])])}
fn flower_color_slot(version:&str,other:Option<u8>)->Vec<u8>{
 let mut payload=synthetic_payload(version);
 payload[3]=if other.is_some(){0x97}else{0x96};
 payload.extend(doc(1,arr(vec![u(4),u(1331175279),u(11),u(93),plain_flower(6)])));
 if let Some(color)=other{payload.extend(doc(1,arr(vec![u(5),u(1331175279),u(12),u(2),plain_flower(color)])));}
 slot_from_payload(version,payload)
}
#[test]
fn plain_flower_color_cas_history_and_export_preserve_identity(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 for zipped in [false,true]{
  let source=flower_color_slot("3.0.1",None);let input=if zipped{zip(&source)}else{source};
  let mut e=Editor::open(input.clone()).unwrap();
  assert_eq!(e.inventory_flower_color_options(4).len(),28);
  assert!(!e.inventory_flower_color_options(4).contains(&14));
  assert!(!e.inventory_flower_color_options(4).contains(&15));
  assert_eq!(e.inventory_original_unique_payload(4),Some(plain_flower(6).as_slice()));
  assert!(e.change_inventory_flower_color(4,8,16).is_err());
  assert!(e.change_inventory_flower_color(4,6,14).is_err());
  assert!(!e.dirty());
  e.change_inventory_flower_color(4,6,8).unwrap();
  assert_eq!(e.inventory_unique_data(4),Some(U::Flower{grow_state:6,base_color:8,pattern:0,pattern_color:0}));
  assert_eq!(e.inventory()[0].quantity,93);assert_eq!(e.history()[0].scope,Inventory);
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input.clone()).unwrap();
  restored.restore_history(&cp).unwrap();assert_eq!(restored.inventory_unique_data(4),e.inventory_unique_data(4));
  assert!(e.undo_scope(Inventory));assert!(!e.dirty());assert!(e.redo_scope(Inventory));
  let exported=e.export().unwrap();let reopened=Editor::open(exported).unwrap();
  assert_eq!(reopened.inventory_unique_data(4),e.inventory_unique_data(4));
  assert_eq!(reopened.inventory()[0].quantity,93);
  let before=Editor::open(input).unwrap();assert_eq!(before.inventory_original_unique_payload(4),Some(plain_flower(6).as_slice()));
 }
 let mut old=Editor::open(flower_color_slot("3.0.0",None)).unwrap();
 assert!(old.inventory_flower_color_options(4).is_empty());assert!(old.change_inventory_flower_color(4,6,8).is_err());
 let mut collision=Editor::open(flower_color_slot("3.0.1",Some(8))).unwrap();
 assert_eq!(collision.inventory_flower_color_options(4).len(),27);
 assert!(!collision.inventory_flower_color_options(4).contains(&8));
 assert!(collision.change_inventory_flower_color(4,6,8).is_err());
 assert!(!collision.dirty());
}
#[test]
fn exact_unique_payloads_retain_all_native_union_branches(){
 let payloads=vec![
 arr(vec![vec![0],arr(vec![guid([1,2,3,4])])]),
 arr(vec![vec![1],arr(vec![guid([1,2,3,4]),guid([5,6,7,8]),guid([9,10,11,12])])]),
 arr(vec![vec![2],arr(vec![vec![6],guid([1,2,3,4]),guid([0;4]),guid([0;4])])]),
 arr(vec![vec![3],arr(vec![arr(vec![u(1),u(2)]),arr(vec![u(3)])])]),
 arr(vec![vec![4],arr(vec![u(1),u(2),u(3),u(4),u(5)])]),
 arr(vec![vec![5],arr(vec![guid([1,2,3,4]),plain_flower(6),u(1),u(2),u(3)])]),
 arr(vec![vec![6],arr(vec![arr(vec![f(1.),f(0.),f(-0.),f(1.)]);3])]),
 plain_flower(6),
 arr(vec![vec![8],arr(vec![u(1),u(2),u(3)])]),
 arr(vec![vec![9],arr(vec![u(1331175279),plain_flower(6),u(1),u(2),u(3)])]),
 arr(vec![vec![10],arr(vec![vec![0xc0]])]),
 arr(vec![vec![11],arr(vec![u(1),vec![0xc0]])])
 ];
 // Change the original fixarray header to array16 for 5+12 documents.
 let mut payload=synthetic_payload("3.0.1");payload.splice(3..4,[0xdc,0,17]);
 for (i,p) in payloads.iter().enumerate(){payload.extend(doc(1,arr(vec![u(100+i as u32),u(315822),u(100+i as u32),u(1),p.clone()])))}
 let e=Editor::open(slot_from_payload("3.0.1",payload)).unwrap();
 for(i,p)in payloads.iter().enumerate(){assert_eq!(e.inventory_original_unique_payload(100+i as u32),Some(p.as_slice()));}
 let expected=[1,3,4,2,5,5,3,4,3,5,1,2];
 for (i,(_,_,_,_,n)) in e.inventory_unique_rows().enumerate(){assert_eq!(n,expected[i]);}
}

#[test]
fn flower_variants_are_source_bounded_atomic_and_recoverable(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let input=flower_color_slot("3.0.1",None);
 let mut e=Editor::open(input.clone()).unwrap();
 let before=[6,6,0,0];
 let options=e.inventory_flower_variants(4);
 assert!(options.contains(&[6,30,0,0]),"cross-color Brown is a native available color");
 assert!(options.contains(&[6,6,10,16]),"ombre uses native default White accent");
 assert!(options.contains(&[6,6,3,0]),"effect uses null accent");
 assert!(options.iter().all(|v|v[0]==6&&![14,15].contains(&v[1])&&![6,15].contains(&v[2])));
 for invalid in [[6,14,0,0],[6,15,0,0],[6,8,6,0],[6,8,15,0],[6,8,10,8],[6,8,3,16],[7,8,0,0],[6,8,0,16]]{
  assert!(e.change_inventory_flower_variant(4,before,invalid).is_err(),"{invalid:?}");
 }
 let patterned=[6,6,10,16];
 e.change_inventory_flower_variant(4,before,patterned).unwrap();
 let options=e.inventory_flower_variants(4);
 assert!(options.contains(&[6,6,10,30]));
 assert!(options.contains(&[6,16,10,17]),"white base uses WarmPink when it would equal the accent");
 let changed=[6,16,10,17];
 e.change_inventory_flower_variant(4,patterned,changed).unwrap();
 assert_eq!(e.inventory_unique_data(4),Some(U::Flower{grow_state:6,base_color:16,pattern:10,pattern_color:17}));
 let cp=e.history_checkpoint().unwrap();
 let mut recovered=Editor::open(input.clone()).unwrap();recovered.restore_history(&cp).unwrap();
 assert_eq!(recovered.inventory_unique_data(4),e.inventory_unique_data(4));
 assert_eq!(recovered.history_checkpoint().unwrap(),cp);
 assert!(e.undo_scope(Inventory));assert_eq!(e.inventory_unique_data(4),Some(U::Flower{grow_state:6,base_color:6,pattern:10,pattern_color:16}));
 assert!(e.redo_scope(Inventory));
 let out=Editor::open(e.export().unwrap()).unwrap();
 assert_eq!(out.inventory_unique_data(4),e.inventory_unique_data(4));
 assert_eq!(out.inventory()[0].quantity,93);
 assert!(e.undo_scope(Inventory));assert!(e.undo_scope(Inventory));assert!(!e.dirty());
}

#[test]
fn flower_edit_rejects_legacy_remote_cabin_reference_to_uid(){
 let mut payload=synthetic_payload("3.0.1");payload[3]=0x97;
 payload.extend(doc(1,arr(vec![u(4),u(1331175279),u(11),u(93),plain_flower(6)])));
 // VisitorCabinClientManager -> owned cabin -> owned home -> deprecated object.
 // ItemId and UniqueId are persisted at keys 1 and 4 of the legacy object.
 let legacy=arr(vec![guid([1,2,3,4]),u(1331175279),u(0),u(0),u(11),
  vec![0xc0],vec![0xc0],plain_flower(6),arr(vec![]),arr(vec![])]);
 let home=arr(vec![guid([5,6,7,8]),l(0),arr(vec![legacy]),u(0),u(0),
  guid([0;4]),arr(vec![]),vec![0xc0],vec![0xc0],u(0)]);
 let cabin=arr(vec![guid([9,10,11,12]),arr(vec![home])]);
 payload.extend(doc(19,arr(vec![u(0),arr(vec![cabin]),arr(vec![])])));
 let mut e=Editor::open(slot_from_payload("3.0.1",payload)).unwrap();
 assert!(e.inventory_flower_variants(4).is_empty());
 assert!(e.change_inventory_flower_variant(4,[6,6,0,0],[6,8,0,0]).is_err());
 assert!(!e.dirty());
}

fn furniture_payload(v:[u32;3])->Vec<u8>{arr(vec![vec![8],arr(v.into_iter().map(u).collect())])}
fn furniture_edit_slot(peer:Option<Vec<u8>>)->Vec<u8>{
 let mut payload=synthetic_payload("3.0.1");payload[3]=if peer.is_some(){0x97}else{0x96};
 payload.extend(doc(1,arr(vec![u(4),u(61381969),u(11),u(93),furniture_payload([13,2,0])])));
 if let Some(p)=peer{payload.extend(doc(1,arr(vec![u(5),u(61381969),u(12),u(2),p])));}
 slot_from_payload("3.0.1",payload)
}
#[test]
fn furniture_variant_source_bounded_cas_history_and_export(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 for zipped in [false,true]{
  let raw=furniture_edit_slot(None);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  let before=[13,2,0];
  assert!(e.inventory_furniture_variants(4).contains(&[502,2,0]));
  assert!(e.inventory_furniture_variants(4).contains(&[13,3,0]));
  for bad in [[14,2,0],[13,2,3],[0,0,0],[285,2,0]]{assert!(e.change_inventory_furniture_variant(4,before,bad).is_err());}
  assert!(e.change_inventory_furniture_variant(4,[503,2,0],[502,2,0]).is_err());
  assert!(!e.dirty());
  e.change_inventory_furniture_variant(4,before,[502,2,0]).unwrap();
  e.change_inventory_furniture_variant(4,[502,2,0],[502,3,0]).unwrap();
  assert_eq!(e.inventory_unique_data(4),Some(U::Furniture{materials:[502,3,0]}));
  assert_eq!(e.inventory()[0].quantity,93);
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();assert_eq!(restored.inventory_unique_data(4),e.inventory_unique_data(4));
  assert!(e.undo_scope(Inventory));assert!(e.redo_scope(Inventory));
  let reopened=Editor::open(e.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory_unique_data(4),e.inventory_unique_data(4));assert_eq!(reopened.inventory()[0].quantity,93);
 }
 let mut collision=Editor::open(furniture_edit_slot(Some(vec![0xc0]))).unwrap();
 assert!(collision.change_inventory_furniture_variant(4,[13,2,0],[503,1,0]).is_err());
 assert!(collision.change_inventory_furniture_variant(4,[13,2,0],[0,1,0]).is_err());
 let legacy=arr(vec![vec![1],arr(vec![guid([1,2,3,4]),guid([0;4]),guid([0;4])])]);
 let opaque=Editor::open(furniture_edit_slot(Some(legacy))).unwrap();
 assert!(opaque.inventory_furniture_variants(4).is_empty());
}

#[test]
fn inventory_quantity_batch_is_atomic_and_recovers_one_history_step(){
 use hkia_save_core::collection::HistoryScope::{Inventory,Collections};
 for zipped in [false,true]{
  let mut payload=synthetic_payload("3.0.1");payload[3]=0x98;
  for (id,item,qty) in [(4,315822,6),(5,567052,9)]{
   payload.extend(doc(1,arr(vec![u(id),u(item),u(0),u(qty),vec![0xc0]])));
  }
  payload.extend(doc(1,arr(vec![u(6),u(1331175279),u(11),u(2),plain_flower(6)])));
  let raw=slot_from_payload("3.0.1",payload);
  let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  let original=e.inventory();
  for request in [vec![(4,6,20),(5,8,20)],vec![(4,6,20),(6,2,20)],
    vec![(4,6,20),(4,6,21)],vec![(4,6,20),(5,9,0)],vec![(4,6,20),(99,1,20)]]{
   assert!(e.change_inventory_quantities(&request).is_err());
   assert_eq!(e.inventory(),original);
   assert_eq!(e.revision(),0);
   assert!(e.history().is_empty());
  }
  e.change_inventory_quantities(&[(4,6,20),(5,9,20)]).unwrap();
  assert_eq!(e.revision(),1);assert_eq!(e.history().len(),1);
  let edited=e.inventory();assert_eq!(edited[0].quantity,20);assert_eq!(edited[1].quantity,20);
  assert_eq!(edited[2],original[2]);
  let checkpoint=e.history_checkpoint().unwrap();
  let mut restored=Editor::open(input.clone()).unwrap();
  restored.restore_history(&checkpoint).unwrap();assert_eq!(restored.inventory(),edited);
  assert_eq!(restored.history_checkpoint().unwrap(),checkpoint);
  e.change(2,Some(638000000000000001),Some(638000000000000101)).unwrap();
  assert!(e.undo_scope(Inventory));assert_eq!(e.inventory(),original);
  assert_eq!(e.value(2),Some(638000000000000101));
  assert!(!e.undo_scope(Inventory));assert!(e.redo_scope(Inventory));
  assert_eq!(e.inventory(),edited);assert_eq!(e.history().len(),2);
  let reopened=Editor::open(e.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory(),edited);assert_eq!(reopened.inventory_unique_data(6),e.inventory_unique_data(6));
  assert!(e.undo_scope(Collections));
  let before=e.history_checkpoint().unwrap();let revision=e.revision();
  assert!(e.change_inventory_quantities(&[(4,20,30),(5,19,30)]).is_err());
  assert_eq!(e.history_checkpoint().unwrap(),before);assert_eq!(e.revision(),revision);
  assert!(e.redo_scope(Collections));
 }
}

#[test]
fn chef_appearance_is_read_only_and_preserves_full_original_payload(){
 use hkia_save_core::native::InventoryUniqueData as U;
 let mut payload=synthetic_payload("3.0.1");payload[3]=0x9a;
 let cafe=arr(vec![vec![3],arr(vec![arr(vec![u(99),u(98)]),arr(vec![u(6),u(14),u(11),u(19)])])]);
 let boba=arr(vec![vec![4],arr(vec![u(14),u(6),u(11),u(19),u(99)])]);
 let empty=arr(vec![vec![3],arr(vec![arr(vec![]),arr(vec![])])]);
 let nil=arr(vec![vec![3],arr(vec![arr(vec![]),vec![0xc0]])]);
 for (id,item,p) in [(4,203331651,cafe.clone()),(5,1798633565,boba.clone()),(6,203331651,empty.clone()),(7,203331651,nil.clone())]{payload.extend(doc(1,arr(vec![u(id),u(item),u(id),u(1),p])));}
 payload.extend(doc(1,arr(vec![u(8),u(315822),u(0),u(6),vec![0xc0]])));
 let mut e=Editor::open(slot_from_payload("3.0.1",payload)).unwrap();
 assert_eq!(e.inventory_unique_data(4),Some(U::CafeAppearance{count:3,colors:[6,14,11]}));
 assert_eq!(e.inventory_unique_data(5),Some(U::BobaAppearance{color_id:14}));
 assert_eq!(e.inventory_unique_data(6),Some(U::CafeAppearance{count:0,colors:[0;3]}));
 assert_eq!(e.inventory_unique_data(7),Some(U::Opaque{tag:3}));
 assert!(e.change_inventory_quantity(4,1,2).is_err());
 e.change_inventory_quantity(8,6,7).unwrap();
 let reopened=Editor::open(e.export().unwrap()).unwrap();
 for (id,p) in [(4,cafe),(5,boba),(6,empty),(7,nil)]{assert_eq!(reopened.inventory_original_unique_payload(id),Some(p.as_slice()));assert_eq!(reopened.inventory_unique_data(id),e.inventory_unique_data(id));}
}

#[test]
fn wand_source_appearance_preserves_nested_identity_and_bytes(){
 use hkia_save_core::native::InventoryUniqueData as U;
 let mut payload=synthetic_payload("3.0.1");payload[3]=0x9a;
 let wand=|source:u32,nested:Vec<u8>|arr(vec![vec![9],arr(vec![u(source),nested,u(104),u(125),u(1)])]);
 let plain=wand(315822,vec![0xc0]);
 let flower=wand(1331175279,plain_flower(6));
 let cafe=wand(203331651,arr(vec![vec![3],arr(vec![arr(vec![u(99)]),arr(vec![u(6),u(14)])])]));
 let nested=wand(39246601,plain.clone());
 for (id,p) in [(4,plain.clone()),(5,flower.clone()),(6,cafe.clone()),(7,nested.clone())]{
  payload.extend(doc(1,arr(vec![u(id),u(39246601),u(id),u(1),p])));
 }
 payload.extend(doc(1,arr(vec![u(8),u(315822),u(0),u(6),vec![0xc0]])));
 let mut e=Editor::open(slot_from_payload("3.0.1",payload)).unwrap();
 for (id,expected) in [
  (4,vec![315822,104,125,1,u32::MAX,0]),
  (5,vec![1331175279,104,125,1,7,4,6,6,0,0]),
  (6,vec![203331651,104,125,1,3,3,2,6,14]),
  (7,vec![39246601,104,125,1,9,0])
 ]{
  let data=e.inventory_unique_data(id).unwrap();
  assert!(matches!(data,U::WandAppearance{..}));
  assert_eq!(data.display_words(),(9,expected));
  assert!(e.change_inventory_quantity(id,1,2).is_err());
 }
 e.change_inventory_quantity(8,6,7).unwrap();
 let reopened=Editor::open(e.export().unwrap()).unwrap();
 for (id,p) in [(4,plain),(5,flower),(6,cafe),(7,nested)]{
  assert_eq!(reopened.inventory_original_unique_payload(id),Some(p.as_slice()));
  assert_eq!(reopened.inventory_unique_data(id),e.inventory_unique_data(id));
 }
}

#[test]
fn inventory_quantity_limits_are_native_and_cas_atomic(){
 let mut payload=synthetic_payload("3.0.1");payload[3]=0x99;
 for (id,item,quantity) in [(4,315822,6),(5,413462588,2),(6,1900000001,1),(7,2147483646,1)]{
  payload.extend(doc(1,arr(vec![u(id),u(item),u(0),u(quantity),vec![0xc0]])));
 }
 let input=slot_from_payload("3.0.1",payload);
 let mut editor=Editor::open(input.clone()).unwrap();
 let rows=editor.inventory();
 assert_eq!(rows.iter().map(|r|r.quantity_limit).collect::<Vec<_>>(),vec![Some(i32::MAX),Some(3),None,None]);
 assert!(editor.change_inventory_quantity(5,2,4).is_err());
 assert!(editor.change_inventory_quantity(6,1,2).is_err());
 assert!(editor.change_inventory_quantity(7,1,2).is_err());
 assert!(editor.change_inventory_quantities(&[(4,6,20),(5,2,4)]).is_err());
 assert_eq!(editor.inventory(),rows);assert_eq!(editor.revision(),0);
 editor.change_inventory_quantities(&[(4,6,20),(5,2,3)]).unwrap();
 assert_eq!(editor.history().len(),1);
 let checkpoint=editor.history_checkpoint().unwrap();
 let reopened=Editor::open(editor.export().unwrap()).unwrap();
 assert_eq!(reopened.inventory()[0].quantity,20);assert_eq!(reopened.inventory()[1].quantity,3);
 assert_eq!(reopened.inventory()[2],rows[2]);assert_eq!(reopened.inventory()[3],rows[3]);
 let mut recovered=Editor::open(input).unwrap();recovered.restore_history(&checkpoint).unwrap();
 assert_eq!(recovered.inventory(),editor.inventory());
 assert!(editor.undo());assert_eq!(editor.inventory(),rows);assert!(editor.redo());
}

#[test]
fn ordinary_ingredient_empty_and_replenish_preserve_identity_and_history(){
 let mut payload=synthetic_payload("3.0.1");payload[3]=0x99;
 for (id,item,uid,quantity) in [(4,1877756618,0,6),(5,627013240,0,0),(6,315822,0,1),(7,1400142412,2,1)]{
  payload.extend(doc(1,arr(vec![u(id),u(item),u(uid),u(quantity),vec![0xc0]])));
 }
 let raw=slot_from_payload("3.0.1",payload);
 for zipped in [false,true]{
  let input=if zipped{zip(&raw)}else{raw.clone()};
  let mut e=Editor::open(input.clone()).unwrap();
  let original=e.inventory();
  assert_eq!(original.iter().map(|r|r.quantity_minimum).collect::<Vec<_>>(),vec![0,0,1,1]);
  assert!(original[1].editable);
  assert!(e.change_inventory_quantities(&[(4,6,0),(6,1,0)]).is_err());
  assert!(e.change_inventory_quantity(7,1,0).is_err());
  assert_eq!(e.inventory(),original);
  e.change_inventory_quantity(4,6,0).unwrap();
  e.change_inventory_quantity(5,0,9).unwrap();
  e.change_inventory_quantities(&[(4,0,5),(5,9,0)]).unwrap();
  assert_eq!(e.inventory()[0].quantity,5);assert_eq!(e.inventory()[1].quantity,0);
  let cp=e.history_checkpoint().unwrap();
  let mut restored=Editor::open(input.clone()).unwrap();restored.restore_history(&cp).unwrap();
  assert_eq!(restored.inventory(),e.inventory());
  let exported=e.export().unwrap();let reopened=Editor::open(exported).unwrap();
  assert_eq!(reopened.inventory(),e.inventory());
  assert_eq!(reopened.inventory().len(),original.len());
  assert!(e.undo());assert_eq!(e.inventory()[0].quantity,0);assert_eq!(e.inventory()[1].quantity,9);
  assert!(e.undo());assert!(e.undo());assert_eq!(e.inventory(),original);assert!(!e.dirty());
 }
}

#[test]
fn create_absent_material_stacks_uses_native_ids_and_scoped_history(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 for zipped in [false,true]{
  let raw=slot("3.0.1");let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  let candidates=e.inventory_creatable();assert_eq!(candidates.len(),262);
  let apple=candidates.iter().find(|r|r.item_id==1877756618).unwrap().document_id;
  let flour=candidates.iter().find(|r|r.item_id==627013240).unwrap().document_id;
  assert!(e.change_inventory_quantities(&[(apple,0,6),(u32::MAX,0,7)]).is_err());
  assert!(e.inventory().is_empty());assert!(!e.dirty());
  e.change_inventory_quantities(&[(apple,0,6),(flour,0,9)]).unwrap();
  assert_eq!(e.inventory().len(),2);assert_eq!(e.inventory_creatable().len(),260);
  assert!(e.change_inventory_quantity(apple,0,1).is_err());
  assert_eq!(e.inventory_unique_rows().count(),2);
  let checkpoint=e.history_checkpoint().unwrap();
  let mut restored=Editor::open(input.clone()).unwrap();restored.restore_history(&checkpoint).unwrap();
  assert_eq!(restored.inventory(),e.inventory());
  assert!(e.undo_scope(Inventory));assert!(e.inventory().is_empty());
  assert!(!e.dirty());assert!(e.redo_scope(Inventory));
  e.change_inventory_quantity(apple,6,0).unwrap();
  assert_eq!(e.inventory().len(),1);assert_eq!(e.inventory_creatable().len(),261);
  assert!(e.undo_scope(Inventory));
  let exported=e.export().unwrap();let reopened=Editor::open(exported).unwrap();
  let rows=reopened.inventory();assert_eq!(rows.len(),2);
  assert_eq!((rows[0].document_id,rows[0].item_id,rows[0].quantity),(5,627013240,9));
  assert_eq!((rows[1].document_id,rows[1].item_id,rows[1].quantity),(6,1877756618,6));
  assert_eq!(reopened.inventory_original_unique_payload(5),Some([0xc0].as_slice()));
  assert_eq!(reopened.inventory_creatable().len(),260);assert_eq!(reopened.achievements(),e.achievements());assert_eq!(reopened.entries(),e.entries());
 }
}

#[test]
fn absent_inventory_and_achievement_share_allocation_across_history_scopes(){
 use hkia_save_core::{achievement::AchievementValue,collection::HistoryScope::{Inventory,Achievements}};
 let input=slot("3.0.1");let mut e=Editor::open(input.clone()).unwrap();
 let item=e.inventory_creatable()[0];let guid=[13220480,1299065047,2812061598,2966187300];
 let done=AchievementValue{complete:true,current:1.0,completed:Some((1_750_000_000,123_456_700))};
 e.change_inventory_quantity(item.document_id,0,6).unwrap();
 e.create_achievement(guid,done).unwrap();
 assert!(e.undo_scope(Inventory));assert!(e.inventory().is_empty());
 let checkpoint=e.history_checkpoint().unwrap();
 let mut recovered=Editor::open(input.clone()).unwrap();recovered.restore_history(&checkpoint).unwrap();
 assert!(recovered.redo_scope(Inventory));assert_eq!(recovered.achievement_value(guid),Some(done));
 let result=recovered.export().unwrap();let checked=read_slot(&result).unwrap();
 assert_eq!(checked.index.root_next_id.unwrap().0,6);
 assert_eq!(checked.index.achievements.last().unwrap().id,5);
 assert_eq!(checked.index.inventory[0].id,6);
 assert_eq!(checked.index.inventory[0].item_id,Some(item.item_id));
 assert!(recovered.undo_scope(Achievements));
 assert_eq!(recovered.inventory()[0].quantity,6);
 let result=recovered.export().unwrap();let checked=read_slot(&result).unwrap();
 assert_eq!(checked.index.root_next_id.unwrap().0,5);
 assert_eq!(checked.index.inventory[0].id,5);
 let mut old=Editor::open(slot("3.0.0")).unwrap();
 assert!(old.inventory_creatable().is_empty());
 assert!(old.change_inventory_quantity(item.document_id,0,6).is_err());
}

#[test]
fn source_verified_fish_and_critters_share_ordinary_add_empty_refill_path(){
 let input=slot("3.0.1");let mut editor=Editor::open(input).unwrap();
 let candidates=editor.inventory_creatable();
 let fish=candidates.iter().find(|r|r.item_id==29960328).unwrap();
 let critter=candidates.iter().find(|r|r.item_id==71754032).unwrap();
 editor.change_inventory_quantities(&[(fish.document_id,0,8),(critter.document_id,0,7)]).unwrap();
 let mut saved=Editor::open(editor.export().unwrap()).unwrap();
 assert_eq!(saved.inventory().len(),2);
 let a=saved.inventory()[0];let b=saved.inventory()[1];
 assert_eq!((a.item_id,a.quantity_minimum,a.quantity),(29960328,0,8));
 assert_eq!((b.item_id,b.quantity_minimum,b.quantity),(71754032,0,7));
 saved.change_inventory_quantities(&[(a.document_id,8,0),(b.document_id,7,0)]).unwrap();
 let reopened=Editor::open(saved.export().unwrap()).unwrap();
 assert_eq!(reopened.inventory().iter().map(|r|r.quantity).collect::<Vec<_>>(),vec![0,0]);
 assert_eq!(reopened.entries(),editor.entries());assert_eq!(reopened.achievements(),editor.achievements());
}

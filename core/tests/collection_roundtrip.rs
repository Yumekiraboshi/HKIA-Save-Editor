
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

fn assert_quantity_only_roundtrip(e:&mut Editor,id:u32,next:i32){
 let row=e.inventory().into_iter().find(|r|r.document_id==id).unwrap();
 assert!(row.editable,"existing document {id} must support quantity editing");
 let payload=e.inventory_original_unique_payload(id).unwrap().to_vec();
 e.change_inventory_quantity(id,row.quantity,next).unwrap();
 let saved=Editor::open(e.export().unwrap()).unwrap();
 assert_eq!(saved.inventory().iter().find(|r|r.document_id==id).unwrap().quantity,next);
 assert_eq!(saved.inventory_original_unique_payload(id),Some(payload.as_slice()));
 e.reset();
}

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
   assert_eq!(original[1].editable,version=="3.0.1");
   if version=="3.0.1"{let mut separate=Editor::open(input.clone()).unwrap();assert_quantity_only_roundtrip(&mut separate,5,20);}else{assert!(e.change_inventory_quantity(5,1,20).is_err());}
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
 for id in 4..=8 {assert_quantity_only_roundtrip(&mut e,id,2);}
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
fn plucked_flower_quantities_preserve_unique_payload_and_history(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 for zipped in [false,true]{
  let raw=flower_color_slot("3.0.1",Some(8));let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
  assert!(original.iter().all(|r|r.editable&&r.quantity_minimum==0&&r.quantity_limit==Some(i32::MAX)));
  assert!(e.change_inventory_quantity(4,92,0).is_err());
  assert!(e.change_inventory_quantities(&[(4,93,9),(5,3,7)]).is_err());assert!(!e.dirty());
  e.change_inventory_quantities(&[(4,93,100),(5,2,200)]).unwrap();
  let saved=Editor::open(e.export().unwrap()).unwrap();
  for (i,n) in [(4,6),(5,8)]{assert_eq!(saved.inventory_original_unique_payload(i),Some(plain_flower(n).as_slice()));}
  e.change_inventory_flower_color(4,6,9).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut recovered=Editor::open(input).unwrap();
  recovered.restore_history(&cp).unwrap();assert_eq!(recovered.inventory(),e.inventory());
  assert!(recovered.undo_scope(Inventory));assert!(recovered.undo_scope(Inventory));
  assert_eq!(recovered.inventory(),original);assert!(recovered.redo_scope(Inventory));assert!(recovered.redo_scope(Inventory));
  let reopened=Editor::open(recovered.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory().iter().map(|r|(r.document_id,r.item_id,r.quantity)).collect::<Vec<_>>(),vec![(4,1331175279,100),(5,1331175279,200)]);
  assert_eq!(reopened.inventory_unique_data(4),e.inventory_unique_data(4));
  assert_eq!(reopened.inventory_original_unique_payload(5),Some(plain_flower(8).as_slice()));
 }
 let mut duplicate=Editor::open(flower_color_slot("3.0.1",Some(6))).unwrap();
 assert!(duplicate.inventory().iter().all(|r|r.editable));assert_quantity_only_roundtrip(&mut duplicate,4,1);
 let mut old=Editor::open(flower_color_slot("3.0.0",None)).unwrap();
 assert!(!old.inventory()[0].editable);assert!(old.change_inventory_quantity(4,93,1).is_err());
 let mut payload=synthetic_payload("3.0.1");payload[3]=0x97;
 payload.extend(doc(1,arr(vec![u(4),u(1331175279),u(11),u(93),plain_flower(6)])));
 payload.extend(doc(1,arr(vec![u(5),u(1331175279),u(12),u(2),arr(vec![vec![7],arr(vec![vec![6],vec![8]])])])));
 let mut opaque=Editor::open(slot_from_payload("3.0.1",payload)).unwrap();
 assert_quantity_only_roundtrip(&mut opaque,4,1);
}
#[test]
fn positive_seed_troweled_and_crafted_clothing_quantities_preserve_variants(){
 for zipped in [false,true]{
  let mut payload=synthetic_payload("3.0.1");payload[3]=0x9a;
  let seed=arr(vec![vec![7],arr(vec![vec![0],vec![6],vec![0],vec![0]])]);
  let plant=arr(vec![vec![7],arr(vec![vec![7],vec![8],vec![0],vec![0]])]);
  let unsupported=arr(vec![vec![7],arr(vec![vec![3],vec![6],vec![0],vec![0]])]);
  for (id,item,uid,unique) in [(4,1331175279,21,seed.clone()),(5,1331175279,22,plant.clone()),(6,897617923,23,plain_flower(6)),(7,1482119840,24,plain_flower(8)),(8,1331175279,25,unsupported.clone())]{
   payload.extend(doc(1,arr(vec![u(id),u(item),u(uid),u(2),unique])));
  }
  let raw=slot_from_payload("3.0.1",payload);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert!(e.inventory()[..4].iter().all(|r|r.editable&&r.quantity_limit==Some(i32::MAX)));
  assert_eq!(e.inventory()[..4].iter().map(|r|r.quantity_minimum).collect::<Vec<_>>(),vec![0,0,1,1]);
  assert!(e.inventory()[4].editable);
  assert!(e.change_inventory_quantities(&[(4,2,8),(8,3,8)]).is_err());assert!(!e.dirty());
  assert_quantity_only_roundtrip(&mut e,8,8);
  e.change_inventory_quantities(&[(4,2,8),(5,2,9),(6,2,10),(7,2,11)]).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut recovered=Editor::open(input).unwrap();
  recovered.restore_history(&cp).unwrap();
  let reopened=Editor::open(recovered.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory().iter().map(|r|r.quantity).collect::<Vec<_>>(),vec![8,9,10,11,2]);
  for id in 4..=8{assert_eq!(reopened.inventory_original_unique_payload(id),e.inventory_original_unique_payload(id));}
 }
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
fn special_inventory_metadata_preserves_exact_names_and_ids_without_write_authority(){
 let name=|s:&str|{let mut bytes=vec![0xd9,s.len() as u8];bytes.extend(s.as_bytes());bytes};
 let schematic=arr(vec![vec![0],arr(vec![guid([0x12345678,0xffffffff,0,0x80000000])])]);
 let layout=arr(vec![vec![10],arr(vec![arr(vec![name("間取り🌸"),l(0x0123456789abcdef),vec![0xc3]])])]);
 let home=arr(vec![doc(0,arr(vec![])),doc(0,arr(vec![])),u(0),arr(vec![]),u(0),u(0),guid([0;4]),u(0)]);
 let kit=arr(vec![vec![11],arr(vec![u(12345),arr(vec![name("ホームキット"),home])])]);
 let partial=arr(vec![vec![10],arr(vec![vec![0xc0]])]);
 for zipped in [false,true]{
  let mut p=synthetic_payload("3.0.1");p[3]=0x9a;
  p.extend(doc(1,arr(vec![u(4),u(315822),u(0),u(6),vec![0xc0]])));
  for (id,payload) in [(5,&schematic),(6,&layout),(7,&kit),(8,&partial)]{
   p.extend(doc(1,arr(vec![u(id),u(315822),u(20+id),u(1),payload.clone()])));
  }
  let raw=slot_from_payload("3.0.1",p);let mut e=Editor::open(if zipped{zip(&raw)}else{raw}).unwrap();
  let metadata=e.inventory_special_metadata_rows().collect::<Vec<_>>();
  assert_eq!(metadata.len(),3);
  assert_eq!(metadata[0],(5,0,vec![0x12345678,0xffffffff,0,0x80000000]));
  assert_eq!(&metadata[1].2[..4],&[0x89abcdef,0x01234567,1,"間取り🌸".len() as u32]);
  assert_eq!(&metadata[2].2[..2],&[12345,"ホームキット".len() as u32]);
  for (row,offset,expected) in [(&metadata[1],4,"間取り🌸"),(&metadata[2],2,"ホームキット")]{
   let bytes:Vec<u8>=row.2[offset..].iter().flat_map(|w|w.to_le_bytes()).collect();
   assert_eq!(&bytes[..expected.len()],expected.as_bytes());
  }
  for id in 5..=8{assert!(e.change_inventory_quantity(id,1,0).is_err());}
  e.change_inventory_quantity(4,6,8).unwrap();
  let saved=Editor::open(e.export().unwrap()).unwrap();
  assert_eq!(saved.inventory_special_metadata_rows().collect::<Vec<_>>(),metadata);
  for (id,payload) in [(5,&schematic),(6,&layout),(7,&kit),(8,&partial)]{assert_eq!(saved.inventory_original_unique_payload(id),Some(payload.as_slice()));}
 }
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
 assert!(options.iter().all(|v|[0,6,7].contains(&v[0])&&![14,15].contains(&v[1])&&![6,15].contains(&v[2])));
 for invalid in [[6,14,0,0],[6,15,0,0],[6,8,6,0],[6,8,15,0],[6,8,10,8],[6,8,3,16],[5,8,0,0],[6,8,0,16]]{
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
fn existing_flower_growth_edit_and_add_preserve_native_identity(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 for zipped in [false,true]{
  let raw=flower_color_slot("3.0.1",None);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let before=[6,6,0,0];let seed=[0,6,0,0];let uprooted=[7,6,0,0];
  let (choices,can)=e.inventory_flower_preview(4,before,seed).unwrap();
  assert!(can&&choices.contains(&before)&&choices.contains(&uprooted));
  assert!(e.change_inventory_flower_variant(4,before,[5,6,0,0]).is_err());
  e.change_inventory_flower_variant(4,before,seed).unwrap();
  let new=e.create_inventory_flower_variant(4,seed,uprooted,2).unwrap();
  assert!(e.change_inventory_flower_variant(4,seed,uprooted).is_err());
  assert!(e.change_inventory_flower_variant(new,uprooted,before).is_err());
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();assert_eq!(restored.inventory(),e.inventory());
  assert!(restored.undo_scope(Inventory));assert!(restored.undo_scope(Inventory));assert!(!restored.dirty());
  assert!(restored.redo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory()[0].document_id,4);assert_eq!(saved.inventory()[0].quantity,93);
  assert_eq!(saved.inventory_unique_data(4),Some(U::Flower{grow_state:0,base_color:6,pattern:0,pattern_color:0}));
  assert_eq!(saved.inventory_unique_data(saved.inventory()[1].document_id),Some(U::Flower{grow_state:7,base_color:6,pattern:0,pattern_color:0}));
 }
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
 assert_eq!(e.inventory()[0].quantity_minimum,1);assert!(e.change_inventory_quantity(4,93,0).is_err());assert_quantity_only_roundtrip(&mut e,4,10);
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
fn customized_furniture_quantity_uses_normalized_identity_and_native_limits(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 for zipped in [false,true]{
  let raw=furniture_edit_slot(Some(furniture_payload([502,2,0])));let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
  assert!(original.iter().all(|r|r.editable&&r.quantity_minimum==0&&r.quantity_limit==Some(i32::MAX)));
  assert!(e.change_inventory_quantities(&[(4,93,50),(5,3,0)]).is_err());assert!(!e.dirty());
  e.change_inventory_quantities(&[(4,93,50),(5,2,20)]).unwrap();
  let quantities=Editor::open(e.export().unwrap()).unwrap();
  for id in 4..=5{assert_eq!(quantities.inventory_original_unique_payload(id),e.inventory_original_unique_payload(id));}
  e.change_inventory_furniture_variant(4,[13,2,0],[13,3,0]).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();assert_eq!(restored.inventory(),e.inventory());
  assert!(restored.undo_scope(Inventory));assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),original);
  assert!(restored.redo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let reopened=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory().iter().map(|r|r.quantity).collect::<Vec<_>>(),vec![50,20]);
  assert_eq!(reopened.inventory_unique_data(4),e.inventory_unique_data(4));
  assert_eq!(reopened.inventory_original_unique_payload(5),e.inventory_original_unique_payload(5));
 }
 let mut duplicate=Editor::open(furniture_edit_slot(Some(furniture_payload([13,2,0])))).unwrap();
 assert_quantity_only_roundtrip(&mut duplicate,4,1);
 let legacy=arr(vec![vec![1],arr(vec![guid([1,2,3,4]),guid([0;4]),guid([0;4])])]);
 let mut opaque=Editor::open(furniture_edit_slot(Some(legacy))).unwrap();
 assert_quantity_only_roundtrip(&mut opaque,4,1);
 // The source defaults of this desk lamp are 503 and 1. An explicit
 // default-material payload aliases a nil ordinary row.
 let mut payload=synthetic_payload("3.0.1");payload[3]=0x97;
 payload.extend(doc(1,arr(vec![u(4),u(61381969),u(11),u(93),furniture_payload([503,1,0])])));
 payload.extend(doc(1,arr(vec![u(5),u(61381969),u(0),u(2),vec![0xc0]])));
 let mut normalized=Editor::open(slot_from_payload("3.0.1",payload)).unwrap();
 assert_quantity_only_roundtrip(&mut normalized,4,1);
 // The copied placement reference index also captures UniqueItemModel.
 let mut payload=synthetic_payload("3.0.1");payload[3]=0x97;
 payload.extend(doc(1,arr(vec![u(4),u(61381969),u(11),u(93),furniture_payload([13,2,0])])));
 let copied=arr(vec![u(6),arr(vec![]),arr(vec![arr(vec![u(61381969),furniture_payload([13,2,0])])])]);
 payload.extend(doc(22,copied));
 let mut referenced=Editor::open(slot_from_payload("3.0.1",payload)).unwrap();
 assert_eq!(referenced.inventory()[0].quantity_minimum,1);assert!(referenced.change_inventory_quantity(4,93,0).is_err());assert_quantity_only_roundtrip(&mut referenced,4,1);
}
#[test]
fn customized_furniture_creation_and_staged_edits_share_native_uid_allocation(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 for zipped in [false,true]{
  let mut payload=synthetic_payload("3.0.1");payload[2]=5;payload[3]=0x97;
  payload.extend(doc(1,arr(vec![u(4),u(61381969),u(41),u(2),furniture_payload([13,2,0])])));
  payload.extend(doc(1,arr(vec![u(5),u(43114910),u(42),u(3),plain_flower(6)])));
  let raw=slot_from_payload("3.0.1",payload);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let before=[13,2,0];let target=[502,2,0];
  assert!(e.inventory_furniture_creation_variants(4).contains(&target));
  assert!(e.create_inventory_furniture_variant(4,before,[503,1,0],1).is_err());
  let a=e.create_inventory_furniture_variant(4,before,target,5).unwrap();
  assert!(!e.inventory_furniture_creation_variants(4).contains(&target));
  assert!(e.change_inventory_furniture_variant(4,before,target).is_err());
  assert!(e.change_inventory_furniture_variant(a,target,[503,1,0]).is_err());
  e.change_inventory_furniture_variant(a,target,[502,3,0]).unwrap();
  e.change_inventory_quantity(a,5,7).unwrap();
  let b=e.create_inventory_flower_variant(5,[6,6,0,0],[6,9,0,0],4).unwrap();
  assert_ne!(a,b);
  let checkpoint=e.history_checkpoint().unwrap();let mut restored=Editor::open(input.clone()).unwrap();restored.restore_history(&checkpoint).unwrap();
  assert_eq!(restored.inventory(),e.inventory());
  for _ in 0..4{assert!(restored.undo_scope(Inventory));}
  let redo=restored.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&redo).unwrap();
  for _ in 0..4{assert!(restored.redo_scope(Inventory));}
  let reopened=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory().len(),4);
  assert_eq!(reopened.inventory_original_unique_payload(4),e.inventory_original_unique_payload(4));
  // Pending export is sorted by Item ID: flower precedes furniture.
  assert_eq!(reopened.inventory_unique_data(6),e.inventory_unique_data(b));
  assert_eq!(reopened.inventory_unique_data(7),e.inventory_unique_data(a));
  assert_eq!(reopened.inventory()[3].quantity,7);
  assert_eq!(reopened.inventory_unique_rows().map(|r|r.1).collect::<Vec<_>>(),vec![Some(41),Some(42),Some(43),Some(44)]);
 }
}
#[test]
fn ordinary_default_furniture_can_be_added_alongside_verified_customized_variants(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let item=61381969i32;let handle=(1u32<<31)|item as u32;
 let default=[503i32,1,0];let original=[13i32,2,0];
 let make=|variants:Vec<(u32,u32,Vec<u8>)>|{
  let mut payload=synthetic_payload("3.0.1");
  // Match the native allocator's persisted high-water mark. Synthetic
  // fixtures with added document IDs must advance DbRoot.NextId as well.
  payload[2]=variants.iter().map(|v|v.0).max().unwrap_or(4).max(4) as u8;
  payload[3]=0x95+variants.len() as u8;
  for (id,uid,p) in variants{payload.extend(doc(1,arr(vec![u(id),u(item as u32),u(uid),u(2),p])));}
  slot_from_payload("3.0.1",payload)
 };
 for zipped in [false,true]{
  let raw=make(vec![(4,11,furniture_payload(original.map(|n|n as u32))),(5,12,furniture_payload([502,2,0]))]);
  let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert!(e.inventory_creatable().iter().any(|r|r.document_id==handle));
  e.change_inventory_quantity(handle,0,3).unwrap();
  assert!(!e.inventory_creatable().iter().any(|r|r.document_id==handle));
  assert!(e.change_inventory_furniture_variant(4,original,default).is_err());
  e.change_inventory_furniture_variant(4,original,[13,3,0]).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();assert_eq!(restored.inventory(),e.inventory());
  assert!(restored.undo_scope(Inventory));assert!(restored.undo_scope(Inventory));
  assert!(restored.inventory_creatable().iter().any(|r|r.document_id==handle));
  assert!(restored.redo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let reopened=Editor::open(restored.export().unwrap()).unwrap();
  let rows=reopened.inventory();assert_eq!(rows.len(),3);
  assert_eq!(rows.iter().map(|r|r.quantity).collect::<Vec<_>>(),vec![2,2,3]);
  assert!(rows.iter().all(|r|r.item_id==item));
  assert_eq!(reopened.inventory_original_unique_payload(rows[2].document_id),Some([0xc0].as_slice()));
  assert_eq!(reopened.inventory_unique_data(4),e.inventory_unique_data(4));
  assert_eq!(reopened.inventory_original_unique_payload(5),e.inventory_original_unique_payload(5));
  assert!(!reopened.inventory_creatable().iter().any(|r|r.item_id==item));
 }
 for variants in [
  vec![(4,11,furniture_payload(default.map(|n|n as u32)))],
  vec![(4,11,furniture_payload(original.map(|n|n as u32))),(5,0,vec![0xc0])],
  vec![(4,11,furniture_payload(original.map(|n|n as u32))),(5,12,furniture_payload(original.map(|n|n as u32)))],
  vec![(4,11,furniture_payload(original.map(|n|n as u32))),(5,11,furniture_payload([502,2,0]))],
  vec![(4,11,furniture_payload(original.map(|n|n as u32))),(5,12,arr(vec![vec![1],arr(vec![guid([1,2,3,4]),guid([0;4]),guid([0;4])])]))],
 ]{
  let mut e=Editor::open(make(variants)).unwrap();
  assert!(!e.inventory_creatable().iter().any(|r|r.document_id==handle));
  assert!(e.change_inventory_quantity(handle,0,1).is_err());assert!(!e.dirty());
 }
 let mut e=Editor::open(make(vec![(4,11,furniture_payload(original.map(|n|n as u32)))])).unwrap();
 e.change_inventory_furniture_variant(4,original,default).unwrap();
 assert!(!e.inventory_creatable().iter().any(|r|r.document_id==handle));
 assert!(e.change_inventory_quantity(handle,0,1).is_err());
 assert!(e.undo_scope(Inventory));
 e.change_inventory_quantity(handle,0,1).unwrap();
 assert!(e.change_inventory_furniture_variant(4,original,default).is_err());
 e.change_inventory_quantity(handle,1,0).unwrap();
 assert!(e.change_inventory_furniture_variant(4,original,default).is_ok());
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
  for request in [vec![(4,6,20),(5,8,20)],vec![(4,6,20),(6,2,-1)],
    vec![(4,6,20),(4,6,21)],vec![(4,6,0),(5,9,20)],vec![(4,6,20),(5,9,-1)],vec![(4,6,20),(99,1,20)]]{
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
 assert_quantity_only_roundtrip(&mut e,4,2);
 e.change_inventory_quantity(8,6,7).unwrap();
 let reopened=Editor::open(e.export().unwrap()).unwrap();
 for (id,p) in [(4,cafe),(5,boba),(6,empty),(7,nil)]{assert_eq!(reopened.inventory_original_unique_payload(id),Some(p.as_slice()));assert_eq!(reopened.inventory_unique_data(id),e.inventory_unique_data(id));}
}

#[test]
fn create_flower_variants_allocates_distinct_native_uids_and_keeps_source(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 for zipped in [false,true]{
  let mut payload=synthetic_payload("3.0.1");payload[2]=5;payload[3]=0x97;
  payload.extend(doc(1,arr(vec![u(4),u(1331175279),u(41),u(2),plain_flower(6)])));
  payload.extend(doc(1,arr(vec![u(5),u(315822),u(0),u(6),vec![0xc0]])));
  let raw=slot_from_payload("3.0.1",payload);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
  let before=[6,6,0,0];let first=[6,9,0,0];let second=[6,16,10,17];
  assert!(e.create_inventory_flower_variant(4,before,before,1).is_err());
  assert!(e.create_inventory_flower_variant(4,before,[5,9,0,0],1).is_err());
  assert!(e.create_inventory_flower_variant(4,before,first,0).is_err());
  assert!(e.inventory_flower_creation_variants(4).contains(&first));
  let a=e.create_inventory_flower_variant(4,before,first,3).unwrap();
  assert!(!e.inventory_flower_creation_variants(4).contains(&first));
  let b=e.create_inventory_flower_variant(4,before,second,4).unwrap();
  assert_ne!(a,b);assert!(a>i32::MAX as u32&&b>i32::MAX as u32);
  assert!(e.create_inventory_flower_variant(4,before,first,1).is_err());
  assert!(e.change_inventory_flower_variant(4,before,first).is_err());
  e.change_inventory_quantity(a,3,5).unwrap();
  assert!(e.change_inventory_quantity(a,4,0).is_err()); // Stale CAS.
  assert_eq!(e.inventory().len(),4);
  let cp=e.history_checkpoint().unwrap();let mut recovered=Editor::open(input).unwrap();recovered.restore_history(&cp).unwrap();
  assert_eq!(recovered.inventory(),e.inventory());
  assert!(recovered.undo_scope(Inventory));assert!(recovered.undo_scope(Inventory));assert!(recovered.undo_scope(Inventory));
  assert_eq!(recovered.inventory(),original);
  assert!(recovered.redo_scope(Inventory));assert!(recovered.redo_scope(Inventory));assert!(recovered.redo_scope(Inventory));
  let reopened=Editor::open(recovered.export().unwrap()).unwrap();
  let rows=reopened.inventory();assert_eq!(rows.len(),4);
  assert_eq!(rows.iter().map(|r|r.quantity).collect::<Vec<_>>(),vec![2,6,5,4]);
  assert_eq!(reopened.inventory_original_unique_payload(4),e.inventory_original_unique_payload(4));
  assert_eq!(reopened.inventory_unique_data(6),e.inventory_unique_data(a));
  assert_eq!(reopened.inventory_unique_data(7),e.inventory_unique_data(b));
  let uid:Vec<_>=reopened.inventory_unique_rows().map(|r|r.1).collect();
  assert_eq!(uid,vec![Some(41),Some(0),Some(42),Some(43)]);
 }
}
#[test]
fn unowned_flower_creation_uses_only_source_defaults_and_native_ids(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let input=slot_from_payload("3.0.1",synthetic_payload("3.0.1"));
 let mut e=Editor::open(input.clone()).unwrap();let item=43114910;let candidate=(1u32<<31)|item as u32;
 assert_eq!(e.inventory_absent_flower_ids().len(),105);
 assert_eq!(e.inventory_flower_creation_variants(candidate),vec![[6,2,0,0],[6,5,0,0],[6,10,0,0]]);
 for bad in [[6,1,0,0],[6,14,0,0],[6,2,1,16],[7,2,0,0]]{
  assert!(e.create_inventory_flower_variant(candidate,[0;4],bad,1).is_err());
 }
 assert!(e.create_inventory_flower_variant((1u32<<31)|312661096,[0;4],[6,3,0,0],1).is_err());
 let a=e.create_inventory_flower_variant(candidate,[0;4],[6,2,0,0],3).unwrap();
 assert_ne!(a,candidate);assert_eq!(e.inventory_flower_creation_variants(candidate),vec![[6,5,0,0],[6,10,0,0]]);
 let b=e.create_inventory_flower_variant(candidate,[0;4],[6,5,0,0],5).unwrap();
 assert!(e.create_inventory_flower_variant(candidate,[0;4],[6,5,0,0],1).is_err());
 let cp=e.history_checkpoint().unwrap();let mut recovered=Editor::open(input).unwrap();recovered.restore_history(&cp).unwrap();
 assert_eq!(recovered.inventory(),e.inventory());
 assert!(recovered.undo_scope(Inventory));assert_eq!(recovered.inventory_flower_creation_variants(candidate).len(),2);
 assert!(recovered.redo_scope(Inventory));
 let reopened=Editor::open(recovered.export().unwrap()).unwrap();
 let rows=reopened.inventory();assert_eq!(rows.len(),2);
 assert_eq!(rows.iter().map(|r|r.quantity).collect::<Vec<_>>(),vec![3,5]);
 assert_eq!(reopened.inventory_unique_data(rows[0].document_id),e.inventory_unique_data(a));
 assert_eq!(reopened.inventory_unique_data(rows[1].document_id),e.inventory_unique_data(b));
 assert!(!reopened.inventory_absent_flower_ids().contains(&item));
}
#[test]
fn native_unpatterned_candles_share_flower_add_edit_zero_refill(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 for zipped in [false,true]{
  let raw=slot_from_payload("3.0.1",synthetic_payload("3.0.1"));
  let input=if zipped{zip(&raw)}else{raw};let mut e=Editor::open(input.clone()).unwrap();
  let mut handles=Vec::new();
  for item in [65427158u32,1124067577]{
   let candidate=(1u32<<31)|item;
   assert!(e.inventory_absent_flower_ids().contains(&(item as i32)));
   assert_eq!(e.inventory_flower_creation_variants(candidate),vec![[6,2,0,0],[6,5,0,0],[6,10,0,0]]);
   assert!(e.create_inventory_flower_variant(candidate,[0;4],[6,2,1,16],1).is_err());
   assert!(e.create_inventory_flower_variant(candidate,[0;4],[7,2,0,0],1).is_err());
   let h=e.create_inventory_flower_variant(candidate,[0;4],[6,2,0,0],3).unwrap();
   e.change_inventory_flower_variant(h,[6,2,0,0],[6,9,0,0]).unwrap();handles.push(h);
  }
  for id in [1377029192u32]{assert!(!e.inventory_absent_flower_ids().contains(&(id as i32)));}
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();let rows=saved.inventory();assert_eq!(rows.len(),2);
  assert!(rows.iter().all(|r|r.editable&&r.quantity_minimum==0&&r.quantity==3));
  for row in &rows{saved.change_inventory_quantity(row.document_id,3,0).unwrap();}
  let mut saved=Editor::open(saved.export().unwrap()).unwrap();
  for row in &rows{saved.change_inventory_quantity(row.document_id,0,5).unwrap();}
  assert!(Editor::open(saved.export().unwrap()).unwrap().inventory().iter().all(|r|r.quantity==5));
 }
}

#[test]
fn rare_candle_pattern_create_edit_delete_and_refill(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 for zipped in [false,true]{
  let raw=slot("3.0.1");let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  for item in [22657460,1858821696]{
   let candidate=(1u32<<31)|item as u32;
   assert!(e.inventory_absent_flower_ids().contains(&item));
   let starters=e.inventory_flower_creation_variants(candidate);
   assert!(starters.contains(&[6,2,10,16]));
   let before=[6,2,10,16];let target=[6,8,11,30];
   for bad in [[6,2,0,0],[6,2,3,16],[6,2,6,0],[6,2,15,0],[6,2,10,2],[7,2,10,16],[6,14,10,16]]{
    assert!(e.inventory_flower_preview(candidate,before,bad).is_err());
    assert!(e.create_inventory_flower_variant(candidate,before,bad,1).is_err());
   }
   assert!(e.inventory_flower_preview(candidate,before,target).unwrap().1);
   let h=e.create_inventory_flower_variant(candidate,before,target,3).unwrap();
   assert!(e.change_inventory_flower_variant(h,target,[6,8,0,0]).is_err());
   e.change_inventory_flower_variant(h,target,[6,9,11,30]).unwrap();
  }
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();let rows=saved.inventory();
  assert_eq!(rows.len(),2);assert!(rows.iter().all(|r|r.quantity==3&&r.quantity_minimum==0&&r.editable));
  for row in &rows{
   assert_eq!(saved.inventory_unique_data(row.document_id),Some(U::Flower{grow_state:6,base_color:9,pattern:11,pattern_color:30}));
   saved.change_inventory_quantity(row.document_id,3,0).unwrap();
  }
  let mut saved=Editor::open(saved.export().unwrap()).unwrap();
  for row in &rows{saved.change_inventory_quantity(row.document_id,0,2).unwrap();}
  assert!(Editor::open(saved.export().unwrap()).unwrap().inventory().iter().all(|r|r.quantity==2));
 }
}

#[test]
fn flower_clothing_creation_reuses_exact_processor_and_uid_rules(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 for zipped in [false,true]{
  let mut payload=synthetic_payload("3.0.1");payload[2]=6;payload[3]=0x98;
  for (id,item,uid) in [(4,897617923,21),(5,105502901,22),(6,1482119840,23)]{
   payload.extend(doc(1,arr(vec![u(id),u(item),u(uid),u(2),plain_flower(6)])));
  }
  let raw=slot_from_payload("3.0.1",payload);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let before=[6,6,0,0];
  let crown=[6,9,12,16];let ribbon=[6,9,14,16];let bow=[6,16,0,0];
  assert!(e.inventory_flower_creation_variants(4).contains(&[6,6,12,16]));
  assert!(e.create_inventory_flower_variant(6,before,[6,6,1,16],1).is_err());
  assert!(e.create_inventory_flower_variant(4,before,[6,9,6,16],1).is_err());
  let a=e.create_inventory_flower_variant(4,before,crown,3).unwrap();
  let b=e.create_inventory_flower_variant(5,before,ribbon,4).unwrap();
  let z=e.create_inventory_flower_variant(6,before,bow,5).unwrap();
  assert!(e.create_inventory_flower_variant(4,before,crown,1).is_err());
  assert!(e.change_inventory_flower_variant(4,before,crown).is_err());
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert_eq!(restored.inventory(),e.inventory());
  assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let reopened=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory().len(),6);
  for id in 4..=6{assert_eq!(reopened.inventory_original_unique_payload(id),e.inventory_original_unique_payload(id));}
  for handle in [a,b,z]{
   let item=e.inventory().into_iter().find(|r|r.document_id==handle).unwrap();
   let added=reopened.inventory().into_iter().find(|r|r.item_id==item.item_id&&r.quantity==item.quantity).unwrap();
   assert_eq!(reopened.inventory_unique_data(added.document_id),e.inventory_unique_data(handle));
  }
  let uid:Vec<_>=reopened.inventory_unique_rows().map(|r|r.1).collect();
  assert_eq!(uid,vec![Some(21),Some(22),Some(23),Some(24),Some(25),Some(26)]);
 }
 let mut e=Editor::open(slot_from_payload("3.0.1",synthetic_payload("3.0.1"))).unwrap();
 let crown=(1u32<<31)|1120342995;let bow=(1u32<<31)|1482119840;
 assert_eq!(e.inventory_flower_creation_variants(crown),vec![[6,2,0,0],[6,5,0,0],[6,10,0,0]]);
 assert!(e.inventory_flower_creation_variants(bow).iter().all(|v|v[2]==0&&v[3]==0));
 assert!(e.inventory_flower_creation_variants((1u32<<31)|1095918548).is_empty());
 assert!(!e.inventory_flower_creation_variants((1u32<<31)|41105179).is_empty());
 assert!(e.create_inventory_flower_variant(crown,[0;4],[6,1,0,0],1).is_err());
 e.create_inventory_flower_variant(crown,[0;4],[6,2,0,0],2).unwrap();
 e.create_inventory_flower_variant(bow,[0;4],[6,5,0,0],3).unwrap();
 let reopened=Editor::open(e.export().unwrap()).unwrap();
 assert_eq!(reopened.inventory().iter().map(|r|r.item_id).collect::<Vec<_>>(),vec![1120342995,1482119840]);
}
#[test]
fn staged_flower_and_clothing_variants_edit_before_first_export(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let raw=slot_from_payload("3.0.1",synthetic_payload("3.0.1"));
 let mut e=Editor::open(raw.clone()).unwrap();let id=(1u32<<31)|43114910;
 let a=e.create_inventory_flower_variant(id,[0;4],[6,2,0,0],3).unwrap();
 let b=e.create_inventory_flower_variant(id,[0;4],[6,5,0,0],4).unwrap();
 assert!(e.inventory_flower_edit_hints().any(|i|i==a));
 assert!(e.inventory_flower_variants(a).contains(&[6,2,10,16]));
 assert!(e.change_inventory_flower_variant(a,[6,2,0,0],[6,5,0,0]).is_err());
 e.change_inventory_flower_variant(a,[6,2,0,0],[6,2,10,16]).unwrap();
 assert!(!e.inventory_flower_creation_variants(id).contains(&[6,2,0,0]));
 assert!(e.change_inventory_flower_variant(b,[6,5,0,0],[6,2,10,16]).is_err());
 let clothing=e.create_inventory_flower_variant((1u32<<31)|1120342995,[0;4],[6,2,0,0],2).unwrap();
 e.change_inventory_flower_variant(clothing,[6,2,0,0],[6,9,10,16]).unwrap();
 let checkpoint=e.history_checkpoint().unwrap();
 let mut restored=Editor::open(raw.clone()).unwrap();restored.restore_history(&checkpoint).unwrap();
 assert_eq!(restored.inventory_unique_data(a),e.inventory_unique_data(a));
 assert_eq!(restored.inventory_unique_data(clothing),e.inventory_unique_data(clothing));
 for _ in 0..5{assert!(restored.undo_scope(Inventory));}
 assert!(restored.inventory().is_empty());
 let redo=restored.history_checkpoint().unwrap();let mut recovered=Editor::open(raw).unwrap();recovered.restore_history(&redo).unwrap();
 for _ in 0..5{assert!(recovered.redo_scope(Inventory));}
 assert_eq!(recovered.inventory(),e.inventory());
 let reopened=Editor::open(recovered.export().unwrap()).unwrap();
 let rows=reopened.inventory();assert_eq!(rows.len(),3);
 assert_eq!(reopened.inventory_unique_data(rows[0].document_id),e.inventory_unique_data(a));
 assert_eq!(reopened.inventory_unique_data(rows[1].document_id),e.inventory_unique_data(b));
 assert_eq!(reopened.inventory_unique_data(rows[2].document_id),e.inventory_unique_data(clothing));
}
#[test]
fn palette_and_chef_quantity_preserves_entire_original_payload(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let palette=arr(vec![vec![6],arr(vec![arr(vec![f(0.25),f(0.5),f(-0.0),f(1.0)]);3])]);
 let cafe=arr(vec![vec![3],arr(vec![arr(vec![u(99),u(98)]),arr(vec![u(6),u(14),u(11),u(19)])])]);
 let boba=arr(vec![vec![4],arr(vec![u(14),u(6),u(11),u(19),u(99)])]);
 let make=|version:&str,rows:Vec<(u32,u32,u32,Vec<u8>)>|{
  let mut payload=synthetic_payload(version);payload[3]=0x95+rows.len() as u8;
  for (id,item,uid,p) in rows{payload.extend(doc(1,arr(vec![u(id),u(item),u(uid),u(2),p])));}
  slot_from_payload(version,payload)
 };
 for zipped in [false,true]{
  let raw=make("3.0.1",vec![(4,1835273963,21,palette.clone()),(5,203331651,22,cafe.clone()),(6,1798633565,23,boba.clone())]);
  let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
  assert!(original.iter().all(|r|r.editable&&r.quantity_limit==Some(i32::MAX)));
  assert_eq!(original.iter().map(|r|r.quantity_minimum).collect::<Vec<_>>(),vec![1,0,0]);
  assert!(e.change_inventory_quantities(&[(4,2,0),(5,2,0)]).is_err());assert!(!e.dirty());
  e.change_inventory_quantities(&[(4,2,10),(5,2,20),(6,2,30)]).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut recovered=Editor::open(input).unwrap();
  recovered.restore_history(&cp).unwrap();assert_eq!(recovered.inventory(),e.inventory());
  assert!(recovered.undo_scope(Inventory));assert_eq!(recovered.inventory(),original);
  assert!(recovered.redo_scope(Inventory));
  let reopened=Editor::open(recovered.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory().iter().map(|r|r.quantity).collect::<Vec<_>>(),vec![10,20,30]);
  for (id,p) in [(4,&palette),(5,&cafe),(6,&boba)]{assert_eq!(reopened.inventory_original_unique_payload(id),Some(p.as_slice()));}
 }
 let unknown_color=arr(vec![vec![3],arr(vec![arr(vec![u(99)]),arr(vec![u(6),u(14),u(11),u(999)])])]);
 let bad_palette=arr(vec![vec![6],arr(vec![arr(vec![f(1.5),f(0.5),f(0.0),f(1.0)]);3])]);
 for (version,rows) in [
  ("3.0.1",vec![(4,1835273963,21,palette.clone()),(5,1835273963,22,palette.clone())]),
  ("3.0.1",vec![(4,1835273963,21,palette.clone()),(5,203331651,21,cafe.clone())]),
  ("3.0.1",vec![(4,1835273963,21,bad_palette)]),
  ("3.0.1",vec![(4,203331651,21,unknown_color)]),
  ("3.0.1",vec![(4,1835273963,0,palette.clone())]),
  ("3.0.0",vec![(4,1835273963,21,palette.clone())]),
 ]{
  let valid=version=="3.0.1"&&rows[0].2>0&&rows.iter().filter(|r|r.2==rows[0].2).count()==1;
  let mut e=Editor::open(make(version,rows)).unwrap();
  if valid{assert_quantity_only_roundtrip(&mut e,4,10);}else{assert!(!e.inventory()[0].editable);assert!(e.change_inventory_quantity(4,2,10).is_err());assert!(!e.dirty());}
 }
 // All nine exact chef definitions share the source flags and tag.
 for item in [203331651,406277059,905853141,973085470,1053426049,1061947263,1237708874,1338995084,1932639321]{
  let mut e=Editor::open(make("3.0.1",vec![(4,item,21,cafe.clone())])).unwrap();
  e.change_inventory_quantity(4,2,15).unwrap();
  assert_eq!(Editor::open(e.export().unwrap()).unwrap().inventory_original_unique_payload(4),Some(cafe.as_slice()));
 }
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
  assert_quantity_only_roundtrip(&mut e,id,2);
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
  let candidates=e.inventory_creatable();assert_eq!(candidates.len(),7607);
  assert!(candidates.iter().any(|r|r.item_id==460708033));
  let apple=candidates.iter().find(|r|r.item_id==1877756618).unwrap().document_id;
  let flour=candidates.iter().find(|r|r.item_id==627013240).unwrap().document_id;
  assert!(e.change_inventory_quantities(&[(apple,0,6),(u32::MAX,0,7)]).is_err());
  assert!(e.inventory().is_empty());assert!(!e.dirty());
  e.change_inventory_quantities(&[(apple,0,6),(flour,0,9)]).unwrap();
  assert_eq!(e.inventory().len(),2);assert_eq!(e.inventory_creatable().len(),7605);
  assert!(e.change_inventory_quantity(apple,0,1).is_err());
  assert_eq!(e.inventory_unique_rows().count(),2);
  let checkpoint=e.history_checkpoint().unwrap();
  let mut restored=Editor::open(input.clone()).unwrap();restored.restore_history(&checkpoint).unwrap();
  assert_eq!(restored.inventory(),e.inventory());
  assert!(e.undo_scope(Inventory));assert!(e.inventory().is_empty());
  assert!(!e.dirty());assert!(e.redo_scope(Inventory));
  e.change_inventory_quantity(apple,6,0).unwrap();
  assert_eq!(e.inventory().len(),1);assert_eq!(e.inventory_creatable().len(),7606);
  assert!(e.undo_scope(Inventory));
  let exported=e.export().unwrap();let reopened=Editor::open(exported).unwrap();
  let rows=reopened.inventory();assert_eq!(rows.len(),2);
  assert_eq!((rows[0].document_id,rows[0].item_id,rows[0].quantity),(5,627013240,9));
  assert_eq!((rows[1].document_id,rows[1].item_id,rows[1].quantity),(6,1877756618,6));
  assert_eq!(reopened.inventory_original_unique_payload(5),Some([0xc0].as_slice()));
  assert_eq!(reopened.inventory_creatable().len(),7605);assert_eq!(reopened.achievements(),e.achievements());assert_eq!(reopened.entries(),e.entries());
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

#[test]
fn native_event_stack_membership_refill_and_first_add_do_not_duplicate_saved_rows(){
 let mut payload=synthetic_payload("3.0.1");payload[3]=0x96;
 // Existing event material has native DevInboxGiftable and no special effect.
 payload.extend(doc(1,arr(vec![u(4),u(484139114),u(0),u(6),vec![0xc0]])));
 let mut editor=Editor::open(slot_from_payload("3.0.1",payload)).unwrap();
 assert_eq!(editor.inventory()[0].quantity_minimum,0);
 editor.change_inventory_quantity(4,6,0).unwrap();
 let mut reopened=Editor::open(editor.export().unwrap()).unwrap();reopened.change_inventory_quantity(4,0,6).unwrap();
 assert!(!editor.inventory_creatable().iter().any(|r|r.item_id==484139114||r.item_id==1205887707));
}

#[test]
fn native_food_and_bait_membership_preserves_celebrations_and_quest_exclusion(){
 for zipped in [false,true]{
  let raw=slot("3.0.1");let input=if zipped{zip(&raw)}else{raw.clone()};
  let mut editor=Editor::open(input.clone()).unwrap();
  let candidates=editor.inventory_creatable();
  let food=candidates.iter().find(|r|r.item_id==567052).unwrap();
  let bait=candidates.iter().find(|r|r.item_id==30258712).unwrap();
  assert!(candidates.iter().any(|r|r.item_id==1455056332));
  assert!(editor.change_inventory_quantities(&[(food.document_id,0,12),(2147483648u32+1205887707,0,1)]).is_err());
  assert!(!editor.dirty());
  editor.change_inventory_quantities(&[(food.document_id,0,12),(bait.document_id,0,17)]).unwrap();
  let cp=editor.history_checkpoint().unwrap();let mut recovered=Editor::open(input).unwrap();
  recovered.restore_history(&cp).unwrap();assert_eq!(recovered.inventory(),editor.inventory());
  let output=editor.export().unwrap();let mut saved=Editor::open(output.clone()).unwrap();
  let rows=saved.inventory();assert_eq!((rows[0].item_id,rows[0].quantity),(567052,12));
  assert_eq!((rows[1].item_id,rows[1].quantity),(30258712,17));
  assert_eq!(saved.entries(),editor.entries());assert_eq!(saved.achievements(),editor.achievements());
  let decoded=if zipped{let z=ZipIndex::parse(&output).unwrap();z.extract(&output,z.entries.iter().position(|x|x.name==SLOT).unwrap()).unwrap()}else{output};
  let before=read_slot(&raw).unwrap();let after=read_slot(&decoded).unwrap();
  assert_eq!(after.index.celebrations.len(),before.index.celebrations.len());
  saved.change_inventory_quantities(&[(rows[0].document_id,12,0),(rows[1].document_id,17,0)]).unwrap();
  assert_eq!(Editor::open(saved.export().unwrap()).unwrap().inventory().iter().map(|r|r.quantity).collect::<Vec<_>>(),vec![0,0]);
 }
}

#[test]
fn ordinary_furniture_and_clothing_creation_preserves_other_data_and_gates_last_copy_removal(){
 for zipped in [false,true]{
  let raw=slot("3.0.1");let input=if zipped{zip(&raw)}else{raw.clone()};
  let mut editor=Editor::open(input.clone()).unwrap();
  let candidates=editor.inventory_creatable();
  assert_eq!(candidates.len(),7607);
  let furniture=candidates.iter().find(|r|r.item_id==286009791).unwrap().document_id;
  let clothing=candidates.iter().find(|r|r.item_id==315822).unwrap().document_id;
  assert!(candidates.iter().any(|r|r.item_id==517031));
  editor.change_inventory_quantities(&[(furniture,0,12),(clothing,0,3)]).unwrap();
  editor.change_inventory_quantity(clothing,3,0).unwrap();
  assert!(editor.undo_scope(hkia_save_core::collection::HistoryScope::Inventory));
  let checkpoint=editor.history_checkpoint().unwrap();let mut recovered=Editor::open(input).unwrap();
  recovered.restore_history(&checkpoint).unwrap();assert_eq!(recovered.inventory(),editor.inventory());
  let mut saved=Editor::open(recovered.export().unwrap()).unwrap();
  let rows=saved.inventory();
  assert_eq!(rows.iter().map(|r|(r.item_id,r.quantity,r.quantity_minimum)).collect::<Vec<_>>(),vec![(315822,3,1),(286009791,12,0)]);
  assert!(saved.change_inventory_quantity(rows[0].document_id,3,0).is_err());
  assert!(!saved.dirty());
  saved.change_inventory_quantity(rows[1].document_id,12,0).unwrap();
  let mut reopened=Editor::open(saved.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory()[1].quantity,0);
  assert_eq!(reopened.inventory()[1].document_id,rows[1].document_id);
  assert_eq!(reopened.inventory_original_unique_payload(rows[1].document_id),Some([0xc0].as_slice()));
  reopened.change_inventory_quantity(rows[1].document_id,0,12).unwrap();
  assert_eq!(Editor::open(reopened.export().unwrap()).unwrap().inventory(),rows);
  assert_eq!(saved.entries(),editor.entries());assert_eq!(saved.achievements(),editor.achievements());
 }
}

#[test]
fn absent_cosmetics_respect_copied_outfit_references_and_legacy_ambiguity(){
 let make=|settings:Vec<u8>|{
  let mut payload=synthetic_payload("3.0.1");payload[3]=0x96;
  payload.extend(doc(22,settings));slot_from_payload("3.0.1",payload)
 };
 let clothing=315822i32;
 let furniture=286009791i32;
 let material=1877756618i32;
 let pending=|id:i32| (1u32<<31)|id as u32;
 let equipped=arr(vec![u(4),arr(vec![]),arr(vec![arr(vec![u(clothing as u32),vec![0xc0]])])]);
 let preset=arr(vec![u(4),arr(vec![]),arr(vec![]),vec![0xc0],vec![0xc0],
  arr(vec![arr(vec![guid([1,2,3,4]),arr(vec![arr(vec![u(0),u(clothing as u32),vec![0xc0]])])])])]);
 for settings in [equipped,preset]{
  let mut e=Editor::open(make(settings)).unwrap();
  let candidates=e.inventory_creatable();
  assert!(!candidates.iter().any(|r|r.item_id==clothing));
  assert!(candidates.iter().any(|r|r.item_id==furniture));
  assert!(candidates.iter().any(|r|r.item_id==material));
  assert!(e.change_inventory_quantity(pending(clothing),0,1).is_err());
  assert!(e.change_inventory_quantities(&[(pending(furniture),0,2),(pending(clothing),0,1)]).is_err());
  assert!(!e.dirty());assert!(e.inventory().is_empty());
  e.change_inventory_quantity(pending(furniture),0,2).unwrap();
  assert_eq!(Editor::open(e.export().unwrap()).unwrap().inventory()[0].item_id,furniture);
 }
 let legacy=arr(vec![u(4),arr(vec![arr(vec![u(0),guid([1,2,3,4]),plain_flower(6)])]),arr(vec![])]);
 let mut e=Editor::open(make(legacy)).unwrap();
 assert!(e.inventory_creatable().iter().all(|r|r.item_id!=clothing&&r.item_id!=furniture));
 assert!(e.change_inventory_quantity(pending(furniture),0,1).is_err());
 // The generalized path must not bypass an unresolved copied-item reference.
 assert!(e.change_inventory_quantity(pending(material),0,2).is_err());
 assert!(!e.dirty());
}

#[test]
fn flower_clothing_uses_native_species_and_processor_pattern_rules(){
 use hkia_save_core::native::InventoryUniqueData as U;
 for zipped in [false,true]{
  let mut payload=synthetic_payload("3.0.1");payload[3]=0x9b;
  for (docid,item,uid) in [(4,897617923,21),(5,105502901,22),(6,1482119840,23),(7,1095918548,24),(8,41105179,25),(9,108363489,26)]{
   payload.extend(doc(1,arr(vec![u(docid),u(item),u(uid),u(5),plain_flower(6)])));
  }
  let raw=slot_from_payload("3.0.1",payload);let input=if zipped{zip(&raw)}else{raw.clone()};
  let mut e=Editor::open(input.clone()).unwrap();
  let original=e.inventory();let base=[6,6,0,0];
  assert!(e.inventory_flower_variants(4).iter().any(|v|v[2]==12)); // Rose
  assert!(e.inventory_flower_variants(5).iter().any(|v|v[2]==14)); // generic
  assert!(e.inventory_flower_variants(6).iter().all(|v|v[2]==0&&v[3]==0)); // HK-style
  assert!(e.inventory_flower_variants(7).is_empty()); // DLC Sunburst
  assert!(e.inventory_flower_variants(8).iter().any(|v|v[2]==14)); // native floral dress processor
  assert!(e.inventory_flower_variants(9).iter().all(|v|v[2]!=1)); // Heavy Nettle
  assert!(e.change_inventory_flower_variant(6,base,[6,6,1,16]).is_err());
  assert!(e.change_inventory_flower_variant(9,base,[6,6,1,16]).is_err());
  e.change_inventory_flower_variant(4,base,[6,9,12,16]).unwrap();
  e.change_inventory_flower_variant(5,base,[6,9,14,16]).unwrap();
  e.change_inventory_flower_variant(6,base,[6,16,0,0]).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert_eq!(restored.inventory_unique_data(4),Some(U::Flower{grow_state:6,base_color:9,pattern:12,pattern_color:16}));
  assert_eq!(restored.inventory_unique_data(5),e.inventory_unique_data(5));
  assert!(restored.undo());assert!(restored.redo());
  let reopened=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory(),original);
  for id in 4..=9{assert_eq!(reopened.inventory_unique_data(id),e.inventory_unique_data(id))}
 }
}
#[test]
fn flower_clothing_refuses_saved_outfit_and_preset_references(){
 let make=|settings:Vec<u8>|{
  let mut payload=synthetic_payload("3.0.1");payload[3]=0x98;
  for (docid,item,uid) in [(4,897617923,21),(5,105502901,22)]{
   payload.extend(doc(1,arr(vec![u(docid),u(item),u(uid),u(5),plain_flower(6)])));
  }
  payload.extend(doc(22,settings));slot_from_payload("3.0.1",payload)
 };
 let equipped=arr(vec![u(6),arr(vec![]),arr(vec![arr(vec![u(897617923),plain_flower(6)])])]);
 let preset=arr(vec![u(6),arr(vec![]),arr(vec![]),vec![0xc0],vec![0xc0],
  arr(vec![arr(vec![guid([1,2,3,4]),arr(vec![arr(vec![u(0),u(897617923),plain_flower(6)])])])])]);
 for settings in [equipped,preset]{
  let mut e=Editor::open(make(settings)).unwrap();
  assert!(e.inventory_flower_variants(4).is_empty());
  assert!(e.change_inventory_flower_variant(4,[6,6,0,0],[6,9,0,0]).is_err());
  assert_eq!(e.inventory()[0].quantity_minimum,1);assert!(e.change_inventory_quantity(4,5,0).is_err());assert_quantity_only_roundtrip(&mut e,4,10);
  assert!(!e.dirty());
  assert!(!e.inventory_flower_variants(5).is_empty());
 }
 let mermaid=arr(vec![u(6),arr(vec![arr(vec![u(0),guid([1,2,3,4]),plain_flower(6)])]),arr(vec![])]);
 let e=Editor::open(make(mermaid)).unwrap();
 assert!(e.inventory_flower_variants(4).is_empty());assert!(e.inventory_flower_variants(5).is_empty());
}

#[test]
fn saved_plucked_flower_zero_and_refill_preserve_uid_payload_and_other_rows(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 for zipped in [false,true]{
  let raw=flower_color_slot("3.0.1",Some(8));let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
  let bytes=e.inventory_original_unique_payload(4).unwrap().to_vec();
  let identity=e.inventory_unique_rows().map(|r|r.1).collect::<Vec<_>>();
  e.change_inventory_quantity(4,93,0).unwrap();
  assert_eq!(e.inventory()[0].quantity,0);assert_eq!(e.inventory()[1],original[1]);
  let cp=e.history_checkpoint().unwrap();let mut r=Editor::open(input).unwrap();r.restore_history(&cp).unwrap();
  assert_eq!(r.inventory(),e.inventory());assert!(r.undo_scope(Inventory));assert_eq!(r.inventory(),original);
  assert!(r.redo_scope(Inventory));assert_eq!(r.inventory()[0].quantity,0);
  let mut saved=Editor::open(r.export().unwrap()).unwrap();
  assert_eq!(saved.inventory()[0].quantity_minimum,0);
  assert_eq!(saved.inventory()[0].quantity,0);
  assert_eq!(saved.inventory_original_unique_payload(4),Some(bytes.as_slice()));
  assert_eq!(saved.inventory_unique_rows().map(|r|r.1).collect::<Vec<_>>(),identity);
  assert_eq!(saved.inventory()[1],original[1]);
  saved.change_inventory_quantity(4,0,7).unwrap();
  let reopened=Editor::open(saved.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory()[0].quantity,7);
  assert_eq!(reopened.inventory_original_unique_payload(4),Some(bytes.as_slice()));
  assert_eq!(reopened.inventory_unique_rows().map(|r|r.1).collect::<Vec<_>>(),identity);
 }
 let mut duplicate=Editor::open(flower_color_slot("3.0.1",Some(6))).unwrap();
 assert_quantity_only_roundtrip(&mut duplicate,4,0);
 let mut old=Editor::open(flower_color_slot("3.0.0",None)).unwrap();
 assert!(old.change_inventory_quantity(4,93,0).is_err());
 for state in [0,7]{
  let mut payload=synthetic_payload("3.0.1");payload[3]=0x96;
  let unique=arr(vec![vec![7],arr(vec![vec![state],vec![6],vec![0],vec![0]])]);
  payload.extend(doc(1,arr(vec![u(4),u(1331175279),u(11),u(3),unique.clone()])));
  let raw=slot_from_payload("3.0.1",payload);
  for zipped in [false,true]{
   let input=if zipped{zip(&raw)}else{raw.clone()};
   let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
   assert_eq!(original[0].quantity_minimum,0);
   assert!(e.change_inventory_quantity(4,2,0).is_err());
   e.change_inventory_quantity(4,3,0).unwrap();
   let cp=e.history_checkpoint().unwrap();let mut r=Editor::open(input).unwrap();r.restore_history(&cp).unwrap();
   assert_eq!(r.inventory(),e.inventory());assert!(r.undo_scope(Inventory));assert_eq!(r.inventory(),original);
   assert!(r.redo_scope(Inventory));assert_eq!(r.inventory()[0].quantity,0);
   let mut saved=Editor::open(r.export().unwrap()).unwrap();
   assert_eq!(saved.inventory()[0].quantity,0);assert_eq!(saved.inventory()[0].quantity_minimum,0);
   assert_eq!(saved.inventory_unique_rows().next().unwrap().1,Some(11));
   assert_eq!(saved.inventory_original_unique_payload(4),Some(unique.as_slice()));
   saved.change_inventory_quantity(4,0,5).unwrap();
   let reopened=Editor::open(saved.export().unwrap()).unwrap();
   assert_eq!(reopened.inventory()[0].quantity,5);
   assert_eq!(reopened.inventory_original_unique_payload(4),Some(unique.as_slice()));
  }
 }
}

#[test]
fn cafe_draft_preview_recomputes_complete_ordered_identity_and_creation(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let item=203331651u32;
 let original=[44,49,48,6,46,9];let peer=[55,49,48,25,46,9];
 let intermediate=[44,39,48,6,46,9];let target=[55,39,48,25,46,9];
 let encode=|v:[i32;6]|arr(vec![vec![3],arr(vec![arr(v[..3].iter().map(|&w|u(w as u32)).collect()),arr(v[3..].iter().map(|&w|u(w as u32)).collect())])]);
 for zipped in [false,true]{
  let mut p=synthetic_payload("3.0.1");p[2]=8;p[3]=0x97;
  for (id,v) in [(4,original),(5,peer)]{p.extend(doc(1,arr(vec![u(id),u(item),u(id+20),u(2),encode(v)])));}
  let raw=slot_from_payload("3.0.1",p);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  let (options,can)=e.inventory_cafe_preview(4,original,original).unwrap();
  assert!(!can&&options.iter().all(|r|r.0!=peer)&&options.iter().any(|r|r.0==intermediate));
  assert!(e.inventory_cafe_preview(4,original,peer).is_err());
  let (options,can)=e.inventory_cafe_preview(4,original,intermediate).unwrap();
  assert!(can&&options.iter().any(|r|r.0==target));
  assert!(e.inventory_cafe_preview(4,original,target).unwrap().1);
  assert!(!e.dirty());
  e.create_inventory_cafe_variant(4,original,target,5).unwrap();
  assert!(e.inventory_cafe_preview(4,original,target).is_err());
  assert!(e.undo_scope(Inventory));assert!(e.inventory_cafe_preview(4,original,target).unwrap().1);
  assert!(e.redo_scope(Inventory));
  let saved=Editor::open(e.export().unwrap()).unwrap();
  assert!(saved.inventory_cafe_rows().any(|(_,v,_)|v==target));
  assert_eq!(saved.inventory_original_unique_payload(4),Some(encode(original).as_slice()));
 }
}

#[test]
fn all_three_slot_cafe_outputs_reach_free_complete_recipes_after_neighbor_exhaustion(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let source=Editor::open(slot("3.0.1")).unwrap();
 let encode=|v:[i32;6]|arr(vec![vec![3],arr(vec![arr(v[..3].iter().map(|&w|u(w as u32)).collect()),arr(v[3..].iter().map(|&w|u(w as u32)).collect())])]);
 for item in [203331651,905853141,1061947263,1338995084]{
  let original=source.inventory_absent_cafe_defaults().into_iter().find(|r|r.0==item).unwrap().1;
  let candidate=0x80000000|item as u32;
  let mut variants=vec![original];
  for (v,_,_) in source.inventory_cafe_creation_variants(candidate){
   if !variants.contains(&v){variants.push(v)}
  }
  assert!(variants.len()>3);
  let base=synthetic_payload("3.0.1");let mut p=vec![0x93,0];p.extend(u(300));p.push(0xdc);
  p.extend(((5+variants.len()) as u16).to_be_bytes());p.extend(&base[4..]);
  for (i,&v) in variants.iter().enumerate(){
   p.extend(doc(1,arr(vec![u(4+i as u32),u(item as u32),u(301+i as u32),u(2),encode(v)])));
  }
  let raw=slot_from_payload("3.0.1",p);
  for zipped in [false,true]{
   let input=if zipped{zip(&raw)}else{raw.clone()};
   let mut e=Editor::open(input.clone()).unwrap();
   let (options,can)=e.inventory_cafe_preview(4,original,original).unwrap();
   assert!(!can);assert_eq!(options.len(),1,"item {item}");
   let (target,_,slot)=options[0];
   assert!(!variants.contains(&target));
   assert!((0..3).filter(|&i|(target[i],target[i+3])!=(original[i],original[i+3])).count()>=2);
   assert!((target[slot],target[slot+3])!=(original[slot],original[slot+3]));
   assert!(e.inventory_cafe_preview(4,original,target).unwrap().1);
   assert!(e.change_inventory_cafe_variant(4,original,variants[1]).is_err());
   e.change_inventory_cafe_variant(4,original,target).unwrap();
   let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
   assert!(restored.undo_scope(Inventory));assert!(!restored.dirty());assert!(restored.redo_scope(Inventory));
   let saved=Editor::open(restored.export().unwrap()).unwrap();
   assert!(saved.inventory_cafe_rows().any(|(id,v,editable)|id==4&&v==target&&editable));
   assert_eq!(saved.inventory()[0].quantity,2);
   for (i,&v) in variants.iter().enumerate().skip(1){assert_eq!(saved.inventory_original_unique_payload(4+i as u32),Some(encode(v).as_slice()));}
  }
 }
}

#[test]
fn emptied_chef_families_allow_new_source_variants_without_reusing_saved_identity(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let cafe_item=203331651u32;let boba_item=1798633565u32;
 let cafe_candidate=0x80000000|cafe_item;let boba_candidate=0x80000000|boba_item;
 let empty=Editor::open(slot("3.0.1")).unwrap();
 let cafe=empty.inventory_absent_cafe_defaults().into_iter().find(|r|r.0==cafe_item as i32).unwrap().1;
 let (_,boba)=empty.inventory_absent_boba_default().unwrap();
 let cpayload=arr(vec![vec![3],arr(vec![arr(cafe[..3].iter().map(|&v|u(v as u32)).collect()),arr(cafe[3..].iter().map(|&v|u(v as u32)).collect())])]);
 let bpayload=arr(vec![vec![4],arr(boba.into_iter().map(|v|u(v as u32)).collect())]);
 for zipped in [false,true]{
  let mut p=synthetic_payload("3.0.1");p[2]=8;p[3]=0x97;
  p.extend(doc(1,arr(vec![u(4),u(cafe_item),u(21),u(2),cpayload.clone()])));
  p.extend(doc(1,arr(vec![u(5),u(boba_item),u(22),u(3),bpayload.clone()])));
  let raw=slot_from_payload("3.0.1",p);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert!(e.inventory_absent_cafe_defaults().iter().all(|r|r.0!=cafe_item as i32));
  assert!(e.inventory_absent_boba_default().is_none());
  e.change_inventory_quantities(&[(4,2,0),(5,3,0)]).unwrap();
  let cs=e.inventory_absent_cafe_defaults().into_iter().find(|r|r.0==cafe_item as i32).unwrap().1;
  let (_,bs)=e.inventory_absent_boba_default().unwrap();
  assert_ne!(cs,cafe);assert_ne!(bs,boba);
  assert!(e.inventory_cafe_creation_variants(cafe_candidate).iter().all(|r|r.0!=cafe));
  assert!(!e.inventory_boba_creation_variants(boba_candidate).contains(&boba));
  assert!(e.create_inventory_cafe_variant(cafe_candidate,cs,cafe,1).is_err());
  assert!(e.create_inventory_boba_variant(boba_candidate,bs,boba,1).is_err());
  let ch=e.create_inventory_cafe_variant(cafe_candidate,cs,cs,5).unwrap();
  let bh=e.create_inventory_boba_variant(boba_candidate,bs,bs,6).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut recovered=Editor::open(input).unwrap();
  recovered.restore_history(&cp).unwrap();assert_eq!(recovered.inventory(),e.inventory());
  assert!(recovered.undo_scope(Inventory));assert!(recovered.redo_scope(Inventory));
  let mut saved=Editor::open(recovered.export().unwrap()).unwrap();
  assert_eq!(saved.inventory_original_unique_payload(4),Some(cpayload.as_slice()));
  assert_eq!(saved.inventory_original_unique_payload(5),Some(bpayload.as_slice()));
  for (handle,quantity) in [(ch,5),(bh,6)]{
   let row=saved.inventory().into_iter().find(|r|r.quantity==quantity).unwrap();
   assert_eq!(saved.inventory_unique_data(row.document_id),e.inventory_unique_data(handle));
   saved.change_inventory_quantity(row.document_id,quantity,0).unwrap();
  }
  saved.change_inventory_quantities(&[(4,0,2),(5,0,3)]).unwrap();
  assert!(saved.inventory_absent_cafe_defaults().iter().all(|r|r.0!=cafe_item as i32));
  assert!(saved.inventory_absent_boba_default().is_none());
 }
}

#[test]
fn saved_chef_zero_and_refill_preserve_full_payloads_and_native_identity(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let cafe=arr(vec![vec![3],arr(vec![arr(vec![u(99),u(98)]),arr(vec![u(6),u(14),u(11),u(19)])])]);
 let boba=arr(vec![vec![4],arr(vec![u(14),u(6),u(11),u(19),u(99)])]);
 let make=|version:&str,rows:Vec<(u32,u32,u32,Vec<u8>)>|{
  let mut payload=synthetic_payload(version);payload[3]=0x95+rows.len() as u8;
  for (id,item,uid,p) in rows{payload.extend(doc(1,arr(vec![u(id),u(item),u(uid),u(2),p])));}
  slot_from_payload(version,payload)
 };
 for zipped in [false,true]{
  let raw=make("3.0.1",vec![(4,203331651,21,cafe.clone()),(5,1798633565,22,boba.clone())]);
  let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
  assert!(original.iter().all(|r|r.editable&&r.quantity_minimum==0));
  assert!(e.change_inventory_quantities(&[(4,2,0),(5,1,0)]).is_err());
  assert_eq!(e.inventory(),original);assert!(!e.dirty());
  e.change_inventory_quantities(&[(4,2,0),(5,2,0)]).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut recovered=Editor::open(input).unwrap();
  recovered.restore_history(&cp).unwrap();assert_eq!(recovered.inventory(),e.inventory());
  assert!(recovered.undo_scope(Inventory));assert_eq!(recovered.inventory(),original);
  assert!(recovered.redo_scope(Inventory));
  let mut saved=Editor::open(recovered.export().unwrap()).unwrap();
  assert!(saved.inventory().iter().all(|r|r.quantity==0&&r.quantity_minimum==0&&r.editable));
  let uids=saved.inventory_unique_rows().map(|r|r.1).collect::<Vec<_>>();
  assert_eq!(uids,vec![Some(21),Some(22)]);
  for (id,p) in [(4,&cafe),(5,&boba)]{assert_eq!(saved.inventory_original_unique_payload(id),Some(p.as_slice()));}
  saved.change_inventory_quantities(&[(4,0,6),(5,0,8)]).unwrap();
  let reopened=Editor::open(saved.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory().iter().map(|r|r.quantity).collect::<Vec<_>>(),vec![6,8]);
  assert_eq!(reopened.inventory_unique_rows().map(|r|r.1).collect::<Vec<_>>(),uids);
  for (id,p) in [(4,&cafe),(5,&boba)]{assert_eq!(reopened.inventory_original_unique_payload(id),Some(p.as_slice()));}
 }
 // Duplicate item identities, legacy GUID-based wand copies, and integer
 // Item ID wand copies cannot safely authorize removal of a last stack.
 let legacy_wand=arr(vec![vec![5],arr(vec![guid([1,2,3,4]),cafe.clone(),u(104),u(125),u(1)])]);
 let wand=arr(vec![vec![9],arr(vec![u(203331651),cafe.clone(),u(104),u(125),u(1)])]);
 for (version,rows) in [
  ("3.0.1",vec![(4,203331651,21,cafe.clone()),(5,203331651,22,cafe.clone())]),
  ("3.0.1",vec![(4,203331651,21,cafe.clone()),(5,39246601,22,legacy_wand)]),
  ("3.0.1",vec![(4,203331651,21,cafe.clone()),(5,39246601,22,wand)]),
  ("3.0.0",vec![(4,203331651,21,cafe.clone())])
 ]{
  let duplicate=version=="3.0.1"&&rows.len()==2&&rows[0].1==rows[1].1;
  let mut e=Editor::open(make(version,rows)).unwrap();
  if duplicate{assert_quantity_only_roundtrip(&mut e,4,0);}else{assert!(e.change_inventory_quantity(4,2,0).is_err());assert!(!e.dirty());}
 }
}

#[test]
fn unowned_customized_furniture_uses_verified_acquisition_and_material_choices(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let item=61381969;let candidate=(1u32<<31)|item as u32;
 for zipped in [false,true]{
  let raw=slot_from_payload("3.0.1",synthetic_payload("3.0.1"));
  let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  let ids=e.inventory_absent_furniture_ids();
  assert!(ids.contains(&item));assert!(ids.len()<=621);assert!(ids.iter().all(|&id|e.inventory_creatable().iter().any(|r|r.item_id==id)));
  assert!(!ids.contains(&45426907)); // Home layout.
  let choices=e.inventory_furniture_creation_variants(candidate);
  let target=[0,2,0];assert!(choices.contains(&target));
  for bad in [[0,0,0],[503,0,0],[0,99999999,0],[0,2,3],[502,99999999,0]]{
   assert!(e.create_inventory_furniture_variant(candidate,[0;3],bad,1).is_err());
  }
  assert!(e.create_inventory_furniture_variant(candidate,[0,1,0],target,1).is_err());
  let multi=e.create_inventory_furniture_variant(candidate,[0;3],[502,2,0],1).unwrap();
  assert!(e.undo_scope(Inventory));assert!(!e.dirty());
  assert_ne!(multi,candidate);
  let handle=e.create_inventory_furniture_variant(candidate,[0;3],target,2).unwrap();
  assert_ne!(handle,candidate);
  assert!(e.create_inventory_furniture_variant(candidate,[0;3],target,1).is_err());
  e.change_inventory_furniture_variant(handle,target,[502,2,0]).unwrap();
  e.change_inventory_quantity(handle,2,4).unwrap();
  e.change_inventory_quantity(candidate,0,3).unwrap(); // Ordinary base remains independent.
  assert!(!e.inventory_absent_furniture_ids().contains(&item));
  let cp=e.history_checkpoint().unwrap();let mut r=Editor::open(input.clone()).unwrap();r.restore_history(&cp).unwrap();
  assert_eq!(r.inventory(),e.inventory());
  for _ in 0..4{assert!(r.undo_scope(Inventory));}
  let cp=r.history_checkpoint().unwrap();let mut r=Editor::open(input).unwrap();r.restore_history(&cp).unwrap();
  for _ in 0..4{assert!(r.redo_scope(Inventory));}
  let reopened=Editor::open(r.export().unwrap()).unwrap();
  let rows=reopened.inventory();assert_eq!(rows.len(),2);
  assert!(rows.iter().all(|row|row.item_id==item));
  let custom=rows.iter().find(|row|row.quantity==4).unwrap();
  let base=rows.iter().find(|row|row.quantity==3).unwrap();
  assert_eq!(reopened.inventory_unique_data(custom.document_id),e.inventory_unique_data(handle));
  assert_eq!(reopened.inventory_unique_data(base.document_id),None);
  assert!(reopened.inventory_unique_rows().any(|r|r.0==custom.document_id&&r.1==Some(1)));
  assert!(reopened.inventory_unique_rows().any(|r|r.0==base.document_id&&r.1==Some(0)));
  assert!(reopened.inventory_furniture_creation_variants(candidate).is_empty());
 }
}

#[test]
fn cancel_staged_unique_rows_preserves_history_and_never_allocates_deleted_uids(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let flower_item=43114910;let furniture_item=61381969;
 let flower_candidate=(1u32<<31)|flower_item as u32;
 let furniture_candidate=(1u32<<31)|furniture_item as u32;
 for zipped in [false,true]{
  let raw=slot_from_payload("3.0.1",synthetic_payload("3.0.1"));
  let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
  let f=e.inventory_flower_creation_variants(flower_candidate)[0];
  let a=e.create_inventory_flower_variant(flower_candidate,[0;4],f,2).unwrap();
  let b=e.create_inventory_furniture_variant(furniture_candidate,[0;3],[0,2,0],3).unwrap();
  let edited=e.inventory_flower_variants(a)[0];
  e.change_inventory_flower_variant(a,f,edited).unwrap();
  e.change_inventory_furniture_variant(b,[0,2,0],[502,2,0]).unwrap();
  assert!(e.inventory().iter().filter(|r|r.document_id==a||r.document_id==b).all(|r|r.quantity_minimum==0));
  let before=e.inventory();let appearance=e.inventory_unique_data(a);
  assert!(e.change_inventory_quantities(&[(a,2,0),(b,4,0)]).is_err());
  assert_eq!(e.inventory(),before);
  e.change_inventory_quantities(&[(a,2,0),(b,3,0)]).unwrap();
  assert_eq!(e.inventory(),original);assert!(!e.dirty());assert!(e.export().is_err());
  assert_eq!(e.inventory_unique_data(a),None);assert_eq!(e.inventory_unique_data(b),None);
  assert!(!e.inventory_flower_edit_hints().any(|id|id==a));
  assert!(!e.inventory_furniture_edit_hints().any(|id|id==b));
  assert!(!e.inventory_flowers().any(|row|row.0==a));
  assert!(e.change_inventory_quantity(a,0,1).is_err());
  assert!(e.inventory_flower_variants(a).is_empty());assert!(e.inventory_furniture_variants(b).is_empty());
  let cp=e.history_checkpoint().unwrap();let mut r=Editor::open(input.clone()).unwrap();r.restore_history(&cp).unwrap();
  assert_eq!(r.inventory(),original);assert!(!r.dirty());
  assert!(r.undo_scope(Inventory));assert_eq!(r.inventory(),before);
  assert_eq!(r.inventory_unique_data(a),appearance);
  assert!(r.redo_scope(Inventory));assert!(!r.dirty());
  // A cancelled tuple is available again, but its history handle is never reused.
  let c=r.create_inventory_flower_variant(flower_candidate,[0;4],f,5).unwrap();assert_ne!(c,a);
  let saved=Editor::open(r.export().unwrap()).unwrap();
  assert_eq!(saved.inventory().len(),original.len()+1);
  assert_eq!(saved.inventory().last().unwrap().quantity,5);
  assert_eq!(saved.inventory_unique_rows().last().unwrap().1,Some(1));
  let cp=r.history_checkpoint().unwrap();let mut recovered=Editor::open(input).unwrap();recovered.restore_history(&cp).unwrap();
  assert_eq!(recovered.inventory(),r.inventory());
 }
}

#[test]
fn chef_quantities_distinguish_complete_ordered_native_variant_keys(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let cafe=|flavors:Vec<u32>,colors:Vec<u32>|arr(vec![vec![3],arr(vec![arr(flavors.into_iter().map(u).collect()),arr(colors.into_iter().map(u).collect())])]);
 let boba=|words:[u32;5]|arr(vec![vec![4],arr(words.into_iter().map(u).collect())]);
 let a=cafe(vec![99,98],vec![6,14,11,19]);
 let b=cafe(vec![99,98],vec![6,14,11,20]); // same display prefix
 let c=cafe(vec![98,99],vec![6,14,11,19]); // same multiset, distinct native Equals
 let d=boba([14,6,11,19,99]);let e=boba([14,6,11,19,98]); // same display color
 let make=|rows:Vec<(u32,Vec<u8>)>|{
  let mut p=synthetic_payload("3.0.1");p[2]=30;p[3]=0x95+rows.len() as u8;
  for (i,(item,unique)) in rows.into_iter().enumerate(){p.extend(doc(1,arr(vec![u(4+i as u32),u(item),u(21+i as u32),u(2),unique])));}
  slot_from_payload("3.0.1",p)
 };
 let valid=vec![(203331651,a.clone()),(203331651,b.clone()),(203331651,c.clone()),(1798633565,d.clone()),(1798633565,e.clone())];
 for zipped in [false,true]{
  let raw=make(valid.clone());let input=if zipped{zip(&raw)}else{raw};
  let mut ed=Editor::open(input.clone()).unwrap();let before=ed.inventory();
  assert!(before.iter().all(|r|r.editable&&r.quantity_minimum==0));
  ed.change_inventory_quantities(&[(4,2,0),(5,2,8),(6,2,9),(7,2,0),(8,2,5)]).unwrap();
  let cp=ed.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert_eq!(restored.inventory(),ed.inventory());assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),before);
  assert!(restored.redo_scope(Inventory));
  let mut reopened=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory().iter().map(|r|r.quantity).collect::<Vec<_>>(),vec![0,8,9,0,5]);
  for (i,(_,payload)) in valid.iter().enumerate(){assert_eq!(reopened.inventory_original_unique_payload(4+i as u32),Some(payload.as_slice()));}
  reopened.change_inventory_quantities(&[(4,0,3),(7,0,4)]).unwrap();
  assert_eq!(Editor::open(reopened.export().unwrap()).unwrap().inventory().iter().map(|r|r.quantity).collect::<Vec<_>>(),vec![3,8,9,4,5]);
 }
 for (item,first,peer) in [
  (203331651,a.clone(),a.clone()),(1798633565,d.clone(),d.clone()),
  (1798633565,d.clone(),boba([14,0,11,19,99])),
  (203331651,a.clone(),vec![0xc0]),(1798633565,d.clone(),vec![0xc0])
 ]{
  let mut ed=Editor::open(make(vec![(item,first),(item,peer)])).unwrap();
  assert_quantity_only_roundtrip(&mut ed,4,3);
 }
}

#[test]
fn cafe_existing_pairs_and_complete_unsupported_peers_are_independent(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let item=1338995084u32;
 let original=[44,49,48,9,6,9];let intermediate=[44,49,48,6,6,9];let target=[44,49,48,6,46,9];
 let encode=|v:[i32;6]|arr(vec![vec![3],arr(vec![arr(v[..3].iter().map(|&w|u(w as u32)).collect()),arr(v[3..].iter().map(|&w|u(w as u32)).collect())])]);
 let unsupported=arr(vec![vec![3],arr(vec![arr(vec![u(0)]),arr(vec![u(6)])])]);
 for zipped in [false,true]{
  let mut p=synthetic_payload("3.0.1");p[2]=8;p[3]=0x97;
  p.extend(doc(1,arr(vec![u(4),u(item),u(21),u(2),encode(original)])));
  p.extend(doc(1,arr(vec![u(5),u(item),u(22),u(2),unsupported.clone()])));
  let raw=slot_from_payload("3.0.1",p);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert!(e.inventory().iter().all(|r|r.editable));assert!(!e.inventory_cafe_rows().any(|(id,_,editable)|id==5&&editable));
  assert!(e.inventory_cafe_rows().any(|(id,v,edit)|id==4&&v==original&&edit));
  let (options,creatable)=e.inventory_cafe_preview(4,original,original).unwrap();
  assert!(!creatable&&options.iter().any(|r|r.0==intermediate));
  assert!(!e.inventory_cafe_preview(4,original,intermediate).unwrap().1);
  assert!(e.create_inventory_cafe_variant(4,original,intermediate,1).is_err());
  assert!(e.inventory_cafe_preview(4,original,target).unwrap().1);
  assert!(!e.dirty());
  e.change_inventory_cafe_variant(4,original,intermediate).unwrap();
  e.change_inventory_cafe_variant(4,intermediate,target).unwrap();
  e.change_inventory_quantity(4,2,0).unwrap();
  assert!(e.undo_scope(Inventory));assert!(e.redo_scope(Inventory));
  let saved=Editor::open(e.export().unwrap()).unwrap();
  assert_eq!(saved.inventory()[0].quantity,0);assert!(saved.inventory()[0].editable);
  assert_eq!(saved.inventory_original_unique_payload(5),Some(unsupported.as_slice()));
  assert!(saved.inventory_cafe_rows().any(|(id,v,edit)|id==4&&v==target&&edit));
 }
}
#[test]
fn large_dango_family_has_no_arbitrary_variant_count_limit(){
 let item=1338995084u32;
 let pairs=[(44,6),(49,46),(48,9),(62,6),(50,46),(55,25),(39,46)];
 let mut variants=Vec::new();
 for &(a,x) in &pairs{for &(b,y) in &pairs{for &(c,z) in &pairs{variants.push([a,b,c,x,y,z]);}}}
 let original=variants[0];let target=variants[300];
 let encode=|v:[i32;6]|arr(vec![vec![3],arr(vec![arr(v[..3].iter().map(|&w|u(w as u32)).collect()),arr(v[3..].iter().map(|&w|u(w as u32)).collect())])]);
 for zipped in [false,true]{
  let base=synthetic_payload("3.0.1");let mut p=vec![0x93,0];p.extend(u(300));p.push(0xdc);p.extend(262u16.to_be_bytes());p.extend(&base[4..]);
  for (i,&v) in variants[..257].iter().enumerate(){p.extend(doc(1,arr(vec![u(4+i as u32),u(item),u(301+i as u32),u(2),encode(v)])));}
  let raw=slot_from_payload("3.0.1",p);let mut e=Editor::open(if zipped{zip(&raw)}else{raw}).unwrap();
  assert_eq!(e.inventory_cafe_rows().filter(|r|r.2).count(),257);
  assert!(e.inventory_cafe_preview(4,original,target).unwrap().1);
  e.create_inventory_cafe_variant(4,original,target,3).unwrap();
  let saved=Editor::open(e.export().unwrap()).unwrap();
  assert_eq!(saved.inventory_cafe_rows().count(),258);
  assert!(saved.inventory_cafe_rows().any(|(_,v,edit)|v==target&&edit));
 }
}

#[test]
fn staged_flower_source_can_create_other_variants_and_replay_cancellation(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 for zipped in [false,true]{
  let raw=slot_from_payload("3.0.1",synthetic_payload("3.0.1"));
  let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  let candidate=(1u32<<31)|43114910;
  let a=e.create_inventory_flower_variant(candidate,[0;4],[6,2,0,0],3).unwrap();
  let next=[6,1,0,0];assert!(e.inventory_flower_creation_variants(a).contains(&next));
  assert!(e.create_inventory_flower_variant(a,[6,5,0,0],next,2).is_err());
  assert!(e.create_inventory_flower_variant(a,[6,2,0,0],[5,1,0,0],2).is_err());
  let b=e.create_inventory_flower_variant(a,[6,2,0,0],next,2).unwrap();
  assert_ne!(a,b);assert!(!e.inventory_flower_creation_variants(a).contains(&next));
  e.change_inventory_quantity(a,3,0).unwrap();
  assert!(e.inventory_flower_creation_variants(a).is_empty());
  assert!(e.create_inventory_flower_variant(a,[6,2,0,0],[6,9,0,0],1).is_err());
  let cp=e.history_checkpoint().unwrap();let mut r=Editor::open(input.clone()).unwrap();
  r.restore_history(&cp).unwrap();assert_eq!(r.inventory(),e.inventory());
  assert!(r.undo_scope(Inventory));assert_eq!(r.inventory().len(),2);
  assert!(r.undo_scope(Inventory));assert_eq!(r.inventory().len(),1);
  let cp=r.history_checkpoint().unwrap();let mut r=Editor::open(input).unwrap();r.restore_history(&cp).unwrap();
  assert!(r.redo_scope(Inventory));assert_eq!(r.inventory().len(),2);
  assert!(r.redo_scope(Inventory));assert_eq!(r.inventory().len(),1);
  let reopened=Editor::open(r.export().unwrap()).unwrap();
  let rows=reopened.inventory();assert_eq!(rows.len(),1);assert_eq!(rows[0].quantity,2);
  assert_eq!(reopened.inventory_unique_data(rows[0].document_id),e.inventory_unique_data(b));
  assert_eq!(reopened.inventory_unique_rows().next().unwrap().1,Some(1));
 }
}

#[test]
fn ordinary_furniture_source_creates_distinct_customized_stack_without_consuming_base(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let item=61381969;let staged=(1u32<<31)|item as u32;
 for saved in [false,true]{
  for zipped in [false,true]{
   let mut payload=synthetic_payload("3.0.1");
   if saved{payload[3]=0x96;payload.extend(doc(1,arr(vec![u(4),u(item as u32),u(0),u(3),vec![0xc0]])));}
   let raw=slot_from_payload("3.0.1",payload);let input=if zipped{zip(&raw)}else{raw};
   let mut e=Editor::open(input.clone()).unwrap();
   let source=if saved{4}else{e.change_inventory_quantity(staged,0,3).unwrap();staged};
   assert!(!e.inventory_absent_furniture_ids().contains(&item));
   assert!(e.inventory_default_furniture_ids().contains(&source));
   let choices=e.inventory_furniture_creation_variants(source);
   assert!(choices.contains(&[0,2,0]));
   assert!(!choices.contains(&[0,1,0]));
   assert!(e.create_inventory_furniture_variant(source,[1,0,0],[0,2,0],1).is_err());
   let handle=e.create_inventory_furniture_variant(source,[0;3],[0,2,0],4).unwrap();
   assert_ne!(handle,source);
   assert!(!e.inventory_furniture_creation_variants(source).contains(&[0,2,0]));
   assert!(e.inventory_furniture_creation_variants(source).contains(&[0,3,0]));
   let rows=e.inventory();assert_eq!(rows.iter().find(|r|r.document_id==source).unwrap().quantity,3);
   assert_eq!(e.inventory_unique_data(source),None);
   let appearance=e.inventory_unique_data(handle);
   let cp=e.history_checkpoint().unwrap();let mut r=Editor::open(input).unwrap();r.restore_history(&cp).unwrap();
   assert_eq!(r.inventory(),rows);assert!(r.undo_scope(Inventory));
   assert_eq!(r.inventory().len(),1);assert!(r.redo_scope(Inventory));
   let reopened=Editor::open(r.export().unwrap()).unwrap();let rows=reopened.inventory();
   assert_eq!(rows.len(),2);assert!(rows.iter().all(|r|r.item_id==item));
   let ordinary=rows.iter().find(|r|r.quantity==3).unwrap();
   let custom=rows.iter().find(|r|r.quantity==4).unwrap();
   assert_eq!(reopened.inventory_unique_data(ordinary.document_id),None);
   assert_eq!(reopened.inventory_unique_data(custom.document_id),appearance);
   assert!(reopened.inventory_unique_rows().any(|r|r.0==ordinary.document_id&&r.1==Some(0)));
   assert!(reopened.inventory_unique_rows().any(|r|r.0==custom.document_id&&r.1==Some(1)));
  }
 }
 // Multiple default records are ambiguous: no creation source is offered.
 let mut payload=synthetic_payload("3.0.1");payload[2]=5;payload[3]=0x97;
 for id in [4,5]{payload.extend(doc(1,arr(vec![u(id),u(item as u32),u(0),u(3),vec![0xc0]])));}
 let mut e=Editor::open(slot_from_payload("3.0.1",payload)).unwrap();
 assert!(e.inventory_default_furniture_ids().is_empty());
 assert!(e.create_inventory_furniture_variant(4,[0;3],[0,2,0],1).is_err());
 assert!(!e.dirty());
}

#[test]
fn staged_furniture_can_create_another_variant_and_survive_source_cancellation(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 for zipped in [false,true]{
  let raw=slot_from_payload("3.0.1",synthetic_payload("3.0.1"));
  let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  let candidate=(1u32<<31)|61381969;
  let a=e.create_inventory_furniture_variant(candidate,[0;3],[0,2,0],3).unwrap();
  let next=[502,2,0];
  assert!(e.inventory_furniture_creation_variants(a).contains(&next));
  assert!(e.create_inventory_furniture_variant(a,[0;3],next,2).is_err());
  assert!(e.create_inventory_furniture_variant(a,[0,2,0],[0;3],2).is_err());
  let b=e.create_inventory_furniture_variant(a,[0,2,0],next,2).unwrap();
  assert_ne!(a,b);assert!(!e.inventory_furniture_creation_variants(a).contains(&next));
  e.change_inventory_quantity(a,3,0).unwrap();
  assert!(e.inventory_furniture_creation_variants(a).is_empty());
  assert!(e.create_inventory_furniture_variant(a,[0,2,0],[0,3,0],1).is_err());
  let cp=e.history_checkpoint().unwrap();let mut r=Editor::open(input.clone()).unwrap();
  r.restore_history(&cp).unwrap();assert_eq!(r.inventory(),e.inventory());
  assert!(r.undo_scope(Inventory));assert_eq!(r.inventory().len(),2);
  assert!(r.undo_scope(Inventory));assert_eq!(r.inventory().len(),1);
  let cp=r.history_checkpoint().unwrap();let mut r=Editor::open(input).unwrap();r.restore_history(&cp).unwrap();
  assert!(r.redo_scope(Inventory));assert_eq!(r.inventory().len(),2);
  assert!(r.redo_scope(Inventory));assert_eq!(r.inventory().len(),1);
  let reopened=Editor::open(r.export().unwrap()).unwrap();let rows=reopened.inventory();
  assert_eq!(rows.len(),1);assert_eq!(rows[0].quantity,2);
  assert_eq!(reopened.inventory_unique_data(rows[0].document_id),e.inventory_unique_data(b));
  assert_eq!(reopened.inventory_unique_rows().next().unwrap().1,Some(1));
 }
}

#[test]
fn palette_quantities_respect_native_approximate_color_equality(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let palette=|r:f32,g:f32,b:f32,a:f32|arr(vec![vec![6],arr(vec![arr(vec![f(r),f(g),f(b),f(a)]),arr(vec![f(0.),f(1.),f(0.),f(1.)]),arr(vec![f(0.),f(0.),f(1.),f(1.)])])]);
 let first=palette(0.25,0.5,-0.0,1.0);
 let different=palette(0.2501,0.5,0.0,1.0);
 let near=palette(0.250001,0.5,0.0,1.0);
 let different_alpha=palette(0.25,0.5,0.,0.9);
 let make=|rows:Vec<Vec<u8>>|{
  let mut p=synthetic_payload("3.0.1");p[3]=0x95+rows.len() as u8;
  for (i,unique) in rows.into_iter().enumerate(){p.extend(doc(1,arr(vec![u(4+i as u32),u(1835273963),u(21+i as u32),u(2),unique])));}
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make(vec![first.clone(),different.clone(),different_alpha.clone()]);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
  assert!(original.iter().all(|r|r.editable&&r.quantity_minimum==1&&r.quantity_limit==Some(i32::MAX)));
  assert!(e.change_inventory_quantity(4,2,0).is_err());assert!(!e.dirty());
  e.change_inventory_quantities(&[(4,2,3),(5,2,4),(6,2,5)]).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert_eq!(restored.inventory(),e.inventory());assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),original);
  assert!(restored.redo_scope(Inventory));let reopened=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory().iter().map(|r|r.quantity).collect::<Vec<_>>(),vec![3,4,5]);
  for (id,p) in [(4,&first),(5,&different),(6,&different_alpha)]{assert_eq!(reopened.inventory_original_unique_payload(id),Some(p.as_slice()));}
 }
 // Numerically equal signed-zero payloads and slightly different bit words
 // both collide; a genuinely distinct third peer remains editable.
 for peer in [palette(0.25,0.5,0.0,1.0),near]{
  let mut e=Editor::open(make(vec![first.clone(),peer,different.clone()])).unwrap();
  assert!(e.inventory().iter().all(|r|r.editable));
  assert_quantity_only_roundtrip(&mut e,4,3);
  e.change_inventory_quantity(6,2,3).unwrap();
 }
 for peer in [palette(1.5,0.5,0.0,1.0),vec![0xc0]]{
  let mut e=Editor::open(make(vec![first.clone(),peer])).unwrap();assert_quantity_only_roundtrip(&mut e,4,3);
 }
}

#[test]
fn existing_palette_color_edits_are_native_exact_cas_and_copy_safe(){
 use hkia_save_core::{collection::{HistoryScope::Inventory,PaletteVariant},inventory_palette_source::palette_output_color,native::InventoryUniqueData};
 let encode=|v:PaletteVariant|arr(vec![vec![6],arr(v.into_iter().map(|c|arr(c.into_iter().map(|w|f(f32::from_bits(w))).collect())).collect())]);
 let red=palette_output_color(1,0).unwrap();let white=palette_output_color(16,0).unwrap();
 let original=[red,white,[0.25f32.to_bits(),(-0.0f32).to_bits(),0.75f32.to_bits(),1.0f32.to_bits()]];
 let mut next=original;next[0]=palette_output_color(2,3).unwrap();
 let mut peer=original;peer[0]=palette_output_color(3,0).unwrap();
 let make=|version:&str,other:PaletteVariant,copy:Option<PaletteVariant>|{
  let mut p=synthetic_payload(version);p[3]=if copy.is_some(){0x98}else{0x97};
  for (id,v) in [(4,original),(5,other)]{p.extend(doc(1,arr(vec![u(id),u(1835273963),u(20+id),u(2),encode(v)])));}
  if let Some(v)=copy{
   let snapshot=arr(vec![guid([1,2,3,4]),arr(vec![]),arr(vec![]),encode(v)]);
   let preset=arr(vec![guid([2,3,4,5]),arr(vec![]),vec![0xc2],vec![0xc2],vec![0xc2],snapshot]);
   p.extend(doc(22,arr(vec![u(6),arr(vec![]),arr(vec![]),vec![0xc0],vec![0xc0],arr(vec![preset])])));
  }
  slot_from_payload(version,p)
 };
 for zipped in [false,true]{
  let raw=make("3.0.1",peer,None);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert!(e.inventory_palette_edit_hints().any(|id|id==4));
  assert!(e.inventory_palette_variants(4).contains(&next));
  assert!(!e.inventory_palette_variants(4).contains(&peer));
  let mut arbitrary=original;arbitrary[0]=[1.0f32.to_bits(),0,0,1.0f32.to_bits()];
  let mut event=original;event[0]=palette_output_color(14,0).unwrap();
  assert!(e.change_inventory_palette_variant(4,peer,next).is_err());
  assert!(e.change_inventory_palette_variant(4,original,arbitrary).is_err());
  assert!(e.change_inventory_palette_variant(4,original,event).is_err());
  assert!(e.change_inventory_palette_variant(4,original,peer).is_err());
  assert!(!e.dirty());assert!(!e.can_undo());
  e.change_inventory_palette_variant(4,original,next).unwrap();
  let mut final_color=next;final_color[1]=palette_output_color(4,4).unwrap();
  e.change_inventory_palette_variant(4,next,final_color).unwrap();
  e.change_inventory_quantity(4,2,7).unwrap();
  assert_eq!(e.inventory_palettes().next(),Some((4,final_color)));
  let cp=e.history_checkpoint().unwrap();let mut r=Editor::open(input.clone()).unwrap();r.restore_history(&cp).unwrap();
  assert_eq!(r.inventory_unique_data(4),Some(InventoryUniqueData::Palette{rgba_bits:final_color}));
  assert!(r.undo_scope(Inventory));assert!(r.undo_scope(Inventory));assert_eq!(r.inventory_palettes().next(),Some((4,next)));
  assert!(r.undo_scope(Inventory));assert_eq!(r.inventory_palettes().next(),Some((4,original)));assert!(!r.dirty());
  assert!(r.redo_scope(Inventory));assert!(r.redo_scope(Inventory));assert!(r.redo_scope(Inventory));
  let reopened=Editor::open(r.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory_unique_data(4),Some(InventoryUniqueData::Palette{rgba_bits:final_color}));
  assert_eq!(reopened.inventory_original_unique_payload(5),Some(encode(peer).as_slice()));
  assert_eq!(reopened.inventory_unique_rows().next().unwrap().1,Some(24));
  assert_eq!(reopened.inventory()[0].quantity,7);
  assert_eq!(Editor::open(input).unwrap().inventory_palettes().next(),Some((4,original)));
 }
 let mut e=Editor::open(make("3.0.1",peer,Some(original))).unwrap();
 assert!(e.inventory_palette_variants(4).is_empty());
 assert!(e.change_inventory_palette_variant(4,original,next).is_err());
 assert!(!e.inventory_palette_variants(5).is_empty());
 let mut e=Editor::open(make("3.0.1",peer,Some(next))).unwrap();
 assert!(!e.inventory_palette_variants(4).contains(&next));
 assert!(e.change_inventory_palette_variant(4,original,next).is_err());
 assert!(Editor::open(make("3.0.0",peer,None)).unwrap().inventory_palette_variants(4).is_empty());
}

#[test]
fn boba_pearls_and_sweetness_preserve_flavor_color_milk_and_uid(){
 use hkia_save_core::collection::{HistoryScope::Inventory,BobaVariant};
 let original=[6,44,76,75,73];let mut next=original;next[2]=79;next[4]=71;
 let mut peer=original;peer[4]=74;
 let encode=|v:BobaVariant|arr(vec![vec![4],arr(v.into_iter().map(|w|u(w as u32)).collect())]);
 let make=|v:BobaVariant,other:BobaVariant|{
  let mut p=synthetic_payload("3.0.1");p[3]=0x97;
  for (id,v) in [(4,v),(5,other)]{p.extend(doc(1,arr(vec![u(id),u(1798633565),u(20+id),u(2),encode(v)])));}
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make(original,peer);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();assert!(e.inventory_boba_variants(4).contains(&next));
  assert!(!e.inventory_boba_variants(4).contains(&peer));
  let mut invalid=next;invalid[1]=39;assert!(e.change_inventory_boba_variant(4,original,invalid).is_err());
  invalid=next;invalid[2]=75;assert!(e.change_inventory_boba_variant(4,original,invalid).is_err());
  assert!(e.change_inventory_boba_variant(4,peer,next).is_err());assert!(!e.dirty());
  e.change_inventory_boba_variant(4,original,next).unwrap();
  e.change_inventory_quantity(4,2,7).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut r=Editor::open(input).unwrap();r.restore_history(&cp).unwrap();
  assert_eq!(r.inventory_boba_rows().next(),Some((4,next,true)));
  assert!(r.undo_scope(Inventory));assert!(r.undo_scope(Inventory));assert_eq!(r.inventory_boba_rows().next(),Some((4,original,true)));assert!(!r.dirty());
  assert!(r.redo_scope(Inventory));assert!(r.redo_scope(Inventory));
  let reopened=Editor::open(r.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory_boba_rows().next(),Some((4,next,true)));
  assert_eq!(reopened.inventory()[0].quantity,7);
  assert_eq!(reopened.inventory_original_unique_payload(5),Some(encode(peer).as_slice()));
  assert_eq!(reopened.inventory_unique_rows().next().unwrap().1,Some(24));
 }
 let mut unknown=original;unknown[1]=99;
 let e=Editor::open(make(unknown,peer)).unwrap();assert!(e.inventory_boba_variants(4).is_empty());
}

#[test]
fn add_custom_palette_variants_from_owned_source_and_cancel_staged(){
 use hkia_save_core::{collection::{HistoryScope::Inventory,PaletteVariant},inventory_palette_source::palette_output_color as color,native::InventoryUniqueData};
 let source=[color(1,0).unwrap(),color(2,0).unwrap(),color(3,0).unwrap()];
 let mut next=source;next[0]=color(4,3).unwrap();
 let mut child=next;child[1]=color(5,4).unwrap();
 let encode=|v:PaletteVariant|arr(vec![vec![6],arr(v.into_iter().map(|c|arr(c.into_iter().map(|w|f(f32::from_bits(w))).collect())).collect())]);
 let make=|v:PaletteVariant|{
  let mut p=synthetic_payload("3.0.1");p[2]=8;p[3]=0x96;
  p.extend(doc(1,arr(vec![u(4),u(1835273963),u(21),u(2),encode(v)])));
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make(source);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert!(e.inventory_palette_creation_variants(4).contains(&next));
  assert!(e.create_inventory_palette_variant(4,next,next,2).is_err());
  assert!(e.create_inventory_palette_variant(4,source,next,0).is_err());
  assert!(!e.dirty());
  let a=e.create_inventory_palette_variant(4,source,next,3).unwrap();
  assert!(e.create_inventory_palette_variant(4,source,next,1).is_err());
  assert!(e.inventory_palette_creation_variants(a).contains(&child));
  let b=e.create_inventory_palette_variant(a,next,child,7).unwrap();
  e.change_inventory_quantity(a,3,0).unwrap();
  assert!(e.inventory_palette_creation_variants(a).is_empty());
  assert_eq!(e.inventory().len(),2);
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert_eq!(restored.inventory(),e.inventory());
  assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory().len(),3);
  assert!(restored.redo_scope(Inventory));assert_eq!(restored.inventory().len(),2);
  let reopened=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory()[0].quantity,2);
  assert_eq!(reopened.inventory_original_unique_payload(4),Some(encode(source).as_slice()));
  let row=&reopened.inventory()[1];assert_eq!(row.quantity,7);
  assert_eq!(reopened.inventory_unique_data(row.document_id),Some(InventoryUniqueData::Palette{rgba_bits:child}));
  assert_eq!(reopened.inventory_unique_rows().last().unwrap().1,Some(22));
  assert_eq!(restored.inventory_unique_data(b),Some(InventoryUniqueData::Palette{rgba_bits:child}));
 }
 let mut invalid=source;invalid[1]=[0,0,0,0x3f800000];invalid[2]=[0,0,0,0x3f800000];
 let e=Editor::open(make(invalid)).unwrap();
 assert!(e.inventory_palette_creation_variants(4).is_empty());
}

#[test]
fn existing_currency_zero_and_refill_preserve_identity_and_reject_event_or_dlc_generation(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let make=|duplicate:bool|{
  let mut payload=synthetic_payload("3.0.1");payload[2]=8;payload[3]=if duplicate{0x9a}else{0x99};
  for (id,item,qty) in [(4,348154640,6),(5,1774854033,0),(6,484139114,8),(7,615026760,3)]{
   payload.extend(doc(1,arr(vec![u(id),u(item),u(0),u(qty),vec![0xc0]])));
  }
  if duplicate{payload.extend(doc(1,arr(vec![u(8),u(348154640),u(0),u(1),vec![0xc0]])));}
  slot_from_payload("3.0.1",payload)
 };
 for zipped in [false,true]{
  let raw=make(false);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
  assert_eq!(original.iter().map(|r|r.quantity_minimum).collect::<Vec<_>>(),vec![0,0,0,0]);
  assert!(original[1].editable);
  assert!(e.inventory_creatable().iter().any(|r|r.item_id==833471261));
  assert!(!e.inventory_creatable().iter().any(|r|r.item_id==1205887707));
  assert!(e.change_inventory_quantity((1u32<<31)|1205887707,0,1).is_err());
  assert!(e.change_inventory_quantities(&[(4,6,0),(6,9,0)]).is_err());
  assert_eq!(e.inventory(),original);
  e.change_inventory_quantities(&[(4,6,0),(5,0,12),(6,8,0),(7,3,0)]).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert_eq!(restored.inventory(),e.inventory());assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),original);
  assert!(restored.redo_scope(Inventory));let mut reopened=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory(),e.inventory());assert_eq!(reopened.inventory().len(),4);
  assert!(reopened.inventory_unique_rows().all(|(_,uid,nil,_,_)|uid==Some(0)&&nil==Some(true)));
  reopened.change_inventory_quantity(4,0,50).unwrap();
  let refill=Editor::open(reopened.export().unwrap()).unwrap();assert_eq!(refill.inventory()[0].quantity,50);
 }
 let mut dup=Editor::open(make(true)).unwrap();
 assert!(dup.change_inventory_quantity(4,6,0).is_err());assert!(!dup.dirty());
}

#[test]
fn native_magic_wand_edits_quantity_and_reserves_peer_identity(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let make=|duplicate:bool,opaque:bool|{
  let mut p=synthetic_payload("3.0.1");p[2]=8;p[3]=0x97;
  let payload=|magic:u32,fleck:u32,style:u32|arr(vec![vec![9],arr(vec![u(0),vec![0xc0],u(magic),u(fleck),u(style)])]);
  p.extend(doc(1,arr(vec![u(4),u(1429161083),u(21),u(1),payload(104,125,118)])));
  p.extend(doc(1,arr(vec![u(5),u(1429161083),u(22),u(2),payload(if duplicate{104}else{105},125,if opaque{119}else{118})])));
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make(false,false);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert_eq!(e.inventory_wand_variants(4).len(),34);assert_eq!(e.inventory_wand_edit_hints().count(),2);
  assert!(e.change_inventory_wand_variant(4,[104,125],[105,125]).is_err());
  assert!(e.change_inventory_wand_variant(4,[104,125],[116,125]).is_err());
  assert!(e.change_inventory_wand_variant(4,[104,126],[106,127]).is_err());assert!(!e.dirty());
  e.change_inventory_wand_variant(4,[104,125],[106,127]).unwrap();
  e.change_inventory_quantity(4,1,3).unwrap();
  assert!(e.change_inventory_wand_variant(5,[105,125],[104,125]).is_err());
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert_eq!(restored.inventory(),e.inventory());assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory()[0].quantity,3);
  assert_eq!(saved.inventory_unique_data(4).unwrap().display_words().1,[0,106,127,118,u32::MAX,0]);
  assert_eq!(saved.inventory_unique_data(5).unwrap().display_words().1,[0,105,125,118,u32::MAX,0]);
 }
 for (dup,opaque) in [(true,false),(false,true)]{
  let e=Editor::open(make(dup,opaque)).unwrap();assert!(e.inventory_wand_variants(4).is_empty());
 }
}

#[test]
fn cafe_source_ingredient_pairs_keep_order_and_native_identity(){
 use hkia_save_core::collection::{HistoryScope::Inventory,CafeVariant};
 let original=[44,49,48,6,46,9];let next=[62,49,48,6,46,9];let peer=[55,49,48,9,46,9];
 let encode=|v:CafeVariant|arr(vec![vec![3],arr(vec![arr(v[..3].iter().map(|&w|u(w as u32)).collect()),arr(v[3..].iter().map(|&w|u(w as u32)).collect())])]);
 let make=||{let mut p=synthetic_payload("3.0.1");p[3]=0x97;
  for (id,v) in [(4,original),(5,peer)]{p.extend(doc(1,arr(vec![u(id),u(203331651),u(20+id),u(2),encode(v)])));}
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make();let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert!(e.inventory_cafe_variants(4).contains(&(next,1240730051,0)));
  assert!(!e.inventory_cafe_variants(4).iter().any(|(v,_,_)|*v==peer));
  let mut invalid=next;invalid[3]=9;
  assert!(e.change_inventory_cafe_variant(4,original,invalid).is_err());
  assert!(e.change_inventory_cafe_variant(4,peer,next).is_err());assert!(!e.dirty());
  e.change_inventory_cafe_variant(4,original,next).unwrap();e.change_inventory_quantity(4,2,7).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut r=Editor::open(input).unwrap();r.restore_history(&cp).unwrap();
  assert_eq!(r.inventory_cafe_rows().next(),Some((4,next,true)));
  assert!(r.undo_scope(Inventory));assert!(r.undo_scope(Inventory));assert_eq!(r.inventory_cafe_rows().next(),Some((4,original,true)));assert!(!r.dirty());
  assert!(r.redo_scope(Inventory));assert!(r.redo_scope(Inventory));
  let reopened=Editor::open(r.export().unwrap()).unwrap();assert_eq!(reopened.inventory_cafe_rows().next(),Some((4,next,true)));
  assert_eq!(reopened.inventory()[0].quantity,7);
  assert_eq!(reopened.inventory_original_unique_payload(5),Some(encode(peer).as_slice()));
  assert_eq!(reopened.inventory_unique_rows().next().unwrap().1,Some(24));
 }
}

#[test]
fn cafe_uses_common_unrestricted_ingredient_acquisition_without_creating_materials(){
 use hkia_save_core::collection::{HistoryScope::Inventory,CafeVariant};
 let item=203331651u32;let before=[44,49,48,6,46,9];let target=[55,39,48,25,46,9];
 let encode=|v:CafeVariant|arr(vec![vec![3],arr(vec![arr(v[..3].iter().map(|&w|u(w as u32)).collect()),arr(v[3..].iter().map(|&w|u(w as u32)).collect())])]);
 for zipped in [false,true]{
  let mut p=synthetic_payload("3.0.1");p[2]=6;p[3]=0x96;
  p.extend(doc(1,arr(vec![u(4),u(item),u(11),u(2),encode(before)])));
  let raw=slot_from_payload("3.0.1",p);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  let choices=e.inventory_cafe_variants(4);
  assert!(choices.iter().any(|&(v,id,slot)|v==[55,49,48,25,46,9]&&id==89022446&&slot==0));
  assert!(choices.iter().any(|&(v,_,slot)|v==[65,49,48,25,46,9]&&slot==0));
  assert!(choices.iter().any(|&(v,id,slot)|v==[44,39,48,6,46,9]&&id==1344087400&&slot==1));
  assert!(choices.iter().any(|&(v,_,slot)|v==[60,49,48,13,46,9]&&slot==0));
  assert!(e.create_inventory_cafe_variant(4,before,[60,49,48,142,46,9],1).is_err());
  assert!(!e.dirty());
  let added=e.create_inventory_cafe_variant(4,before,target,5).unwrap();
  assert!(e.change_inventory_cafe_variant(4,before,target).is_err());
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory().len(),2);
  assert!(saved.inventory().iter().all(|r|r.item_id==item as i32));
  assert_eq!(saved.inventory_original_unique_payload(4),Some(encode(before).as_slice()));
  let row=saved.inventory().into_iter().find(|r|r.quantity==5).unwrap();
  assert_eq!(saved.inventory_unique_data(row.document_id),e.inventory_unique_data(added));
  // New records use the writer's native signed i32 encoding, not the
  // unsigned integer encoding used by the original synthetic fixture.
  assert!(saved.inventory_cafe_rows().any(|(id,v,_)|id==row.document_id&&v==target));
 }
}

#[test]
fn dango_nigiri_and_new_cafe_stacks_roundtrip(){
 use hkia_save_core::collection::{HistoryScope::Inventory,CafeVariant};
 let dango=[44,49,48,6,46,9];let added=[62,49,48,6,46,9];let child=[62,50,48,6,46,9];
 let nigiri=[44,137,0,6,10,0];let no_side=[44,0,0,6,0,0];
 let encode=|v:CafeVariant|{let n=v[..3].iter().take_while(|&&x|x>0).count();
  arr(vec![vec![3],arr(vec![arr(v[..n].iter().map(|&w|u(w as u32)).collect()),arr(v[3..3+n].iter().map(|&w|u(w as u32)).collect())])])};
 let make=||{let mut p=synthetic_payload("3.0.1");p[2]=8;p[3]=0x98;
  for (id,item,v) in [(4,1338995084,dango),(5,1932639321,nigiri)]{p.extend(doc(1,arr(vec![u(id),u(item),u(20+id),u(2),encode(v)])));}
  p.extend(doc(1,arr(vec![u(6),u(1643431747),u(0),u(1),vec![0xc0]])));
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make();let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert!(e.inventory_cafe_creation_variants(4).iter().any(|&(v,_,_)|v==added));
  assert!(e.create_inventory_cafe_variant(4,added,added,1).is_err());
  let a=e.create_inventory_cafe_variant(4,dango,added,3).unwrap();
  assert!(e.create_inventory_cafe_variant(4,dango,added,1).is_err());
  let b=e.create_inventory_cafe_variant(a,added,child,7).unwrap();
  e.change_inventory_quantity(a,3,0).unwrap();assert!(e.inventory_cafe_creation_variants(a).is_empty());
  assert!(e.inventory_cafe_variants(5).iter().any(|&(v,_,_)|v==no_side));
  e.change_inventory_cafe_variant(5,nigiri,no_side).unwrap();
  assert!(e.inventory_cafe_variants(5).iter().any(|&(v,_,_)|v==nigiri));
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert_eq!(restored.inventory(),e.inventory());
  assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let reopened=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory()[0].quantity,2);assert_eq!(reopened.inventory_original_unique_payload(4),Some(encode(dango).as_slice()));
  assert_eq!(reopened.inventory_cafe_rows().find(|(id,_,_)|*id==5).unwrap().1,no_side);
  let row=reopened.inventory().last().unwrap().clone();assert_eq!(row.quantity,7);
  assert_eq!(reopened.inventory_cafe_rows().find(|(id,_,_)|*id==row.document_id).unwrap().1,child);
  assert_eq!(reopened.inventory_unique_rows().last().unwrap().1,Some(26));
  assert_eq!(restored.inventory_cafe_rows().find(|(id,_,_)|*id==b).unwrap().1,child);
 }
}

#[test]
fn first_chef_stacks_use_native_starters_and_full_recipe_validation(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 for zipped in [false,true]{
  let raw=slot("3.0.1");let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  let (item,before)=e.inventory_absent_boba_default().unwrap();
  let candidate=0x80000000u32|item as u32;
  let options=e.inventory_boba_creation_variants(candidate);assert_eq!(options.len(),152);
  let target=*options.last().unwrap();
  assert!(e.create_inventory_boba_variant(candidate,[0;5],target,1).is_err());
  assert!(e.create_inventory_boba_variant(candidate,before,[0;5],1).is_err());
  assert!(e.create_inventory_boba_variant(candidate,before,target,0).is_err());
  let handle=e.create_inventory_boba_variant(candidate,before,target,2).unwrap();
  assert!(e.inventory_absent_boba_default().is_none());
  assert!(e.create_inventory_boba_variant(candidate,before,target,1).is_err());
  let cafe=e.inventory_absent_cafe_defaults();assert_eq!(cafe.len(),9);
  let mut ids=vec![(item,handle,2)];
  for (item,before) in cafe{
   let candidate=0x80000000u32|item as u32;
   assert!(e.create_inventory_cafe_variant(candidate,[0;6],before,1).is_err());
   assert!(e.create_inventory_cafe_variant(candidate,before,[0;6],1).is_err());
   let target=e.inventory_cafe_creation_variants(candidate).first().map(|v|v.0).unwrap_or(before);
   let handle=e.create_inventory_cafe_variant(candidate,before,target,3).unwrap();
   assert!(e.create_inventory_cafe_variant(candidate,before,target,1).is_err());
   ids.push((item,handle,3));
  }
  assert!(e.inventory_absent_cafe_defaults().is_empty());
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();assert_eq!(restored.inventory(),e.inventory());
  assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();
  assert!(saved.inventory_absent_boba_default().is_none());assert!(saved.inventory_absent_cafe_defaults().is_empty());
  let rows=saved.inventory();assert_eq!(rows.len(),10);
  for (item,handle,quantity) in ids{
   let row=rows.iter().find(|r|r.item_id==item).unwrap();
   assert_eq!(row.quantity,quantity);assert_eq!(saved.inventory_unique_data(row.document_id),e.inventory_unique_data(handle));
   assert_eq!(row.quantity_minimum,0);saved.change_inventory_quantity(row.document_id,quantity,0).unwrap();
  }
  assert!(Editor::open(saved.export().unwrap()).unwrap().inventory().iter().all(|r|r.quantity==0));
 }
}

#[test]
fn all_authored_boba_base_choices_and_new_stacks_roundtrip(){
 use hkia_save_core::collection::{HistoryScope::Inventory,BobaVariant};
 let original=[6,44,76,75,73];let changed=[46,39,79,78,71];let added=[9,55,76,78,72];let child=[32,43,76,75,74];
 let encode=|v:BobaVariant|arr(vec![vec![4],arr(v.into_iter().map(|w|u(w as u32)).collect())]);
 let make=||{let mut p=synthetic_payload("3.0.1");p[2]=8;p[3]=0x96;
  p.extend(doc(1,arr(vec![u(4),u(1798633565),u(21),u(2),encode(original)])));
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make();let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert_eq!(e.inventory_boba_variants(4).len(),151);
  assert!(e.inventory_boba_variants(4).contains(&changed));
  let mut bad=changed;bad[0]=6;assert!(e.change_inventory_boba_variant(4,original,bad).is_err());
  e.change_inventory_boba_variant(4,original,changed).unwrap();
  assert!(e.inventory_boba_creation_variants(4).contains(&added));
  let a=e.create_inventory_boba_variant(4,changed,added,3).unwrap();
  assert!(e.create_inventory_boba_variant(4,changed,added,1).is_err());
  let b=e.create_inventory_boba_variant(a,added,child,7).unwrap();
  e.change_inventory_quantity(a,3,0).unwrap();assert!(e.inventory_boba_creation_variants(a).is_empty());
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert_eq!(restored.inventory(),e.inventory());assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let reopened=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory_boba_rows().next(),Some((4,changed,true)));
  let row=reopened.inventory().last().unwrap().clone();assert_eq!(row.quantity,7);
  assert_eq!(reopened.inventory_boba_rows().find(|(id,_,_)|*id==row.document_id).unwrap().1,child);
  assert_eq!(reopened.inventory_unique_rows().last().unwrap().1,Some(22));
  assert_eq!(restored.inventory_boba_rows().find(|(id,_,_)|*id==b).unwrap().1,child);
 }
}

#[test]
fn mixed_chef_creations_share_uid_and_document_allocator_and_replay(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let cafe=[44,49,48,6,46,9];let cafe_next=[62,49,48,6,46,9];
 let boba=[6,44,76,75,73];let boba_next=[46,39,79,78,71];
 let cafe_encode=|v:[i32;6]|arr(vec![vec![3],arr(vec![arr(v[..3].iter().map(|&w|u(w as u32)).collect()),arr(v[3..].iter().map(|&w|u(w as u32)).collect())])]);
 let boba_encode=|v:[i32;5]|arr(vec![vec![4],arr(v.into_iter().map(|w|u(w as u32)).collect())]);
 let mut payload=synthetic_payload("3.0.1");payload[2]=8;payload[3]=0x97;
 payload.extend(doc(1,arr(vec![u(4),u(203331651),u(21),u(2),cafe_encode(cafe)])));
 payload.extend(doc(1,arr(vec![u(5),u(1798633565),u(22),u(2),boba_encode(boba)])));
 let raw=slot_from_payload("3.0.1",payload);
 for zipped in [false,true]{
  let input=if zipped{zip(&raw)}else{raw.clone()};let mut e=Editor::open(input.clone()).unwrap();
  let a=e.create_inventory_cafe_variant(4,cafe,cafe_next,3).unwrap();
  let b=e.create_inventory_boba_variant(5,boba,boba_next,5).unwrap();
  assert_ne!(a,b);assert!(e.undo_scope(Inventory));assert!(e.redo_scope(Inventory));
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert_eq!(restored.inventory(),e.inventory());
  let reopened=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory().len(),4);
  assert_eq!(reopened.inventory_original_unique_payload(4),Some(cafe_encode(cafe).as_slice()));
  assert_eq!(reopened.inventory_original_unique_payload(5),Some(boba_encode(boba).as_slice()));
  let ids:std::collections::HashSet<_>=reopened.inventory_unique_rows().map(|(_,uid,_,_,_)|uid.unwrap()).collect();
  assert_eq!(ids,std::collections::HashSet::from([21,22,23,24]));
  assert!(reopened.inventory_cafe_rows().any(|(_,v,_)|v==cafe_next));
  assert!(reopened.inventory_boba_rows().any(|(_,v,_)|v==boba_next));
 }
}

#[test]
fn native_magic_wand_variant_creation_reuses_allocator_and_replays_cancelled_parent(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let mut p=synthetic_payload("3.0.1");p[2]=8;p[3]=0x96;
 let payload=arr(vec![vec![9],arr(vec![u(0),vec![0xc0],u(104),u(125),u(118)])]);
 p.extend(doc(1,arr(vec![u(4),u(1429161083),u(21),u(2),payload.clone()])));
 let raw=slot_from_payload("3.0.1",p);
 for zipped in [false,true]{
  let input=if zipped{zip(&raw)}else{raw.clone()};let mut e=Editor::open(input.clone()).unwrap();
  assert_eq!(e.inventory_wand_creation_variants(4).len(),35);
  let a=e.create_inventory_wand_variant(4,[104,125],[106,127],3).unwrap();
  assert!(e.create_inventory_wand_variant(4,[104,125],[106,127],1).is_err());
  e.change_inventory_wand_variant(a,[106,127],[108,127]).unwrap();
  let b=e.create_inventory_wand_variant(a,[108,127],[110,126],5).unwrap();assert_ne!(a,b);
  e.change_inventory_quantity(a,3,0).unwrap();assert!(e.inventory_wand_creation_variants(a).is_empty());
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert_eq!(restored.inventory(),e.inventory());assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory().len(),2);assert_eq!(saved.inventory()[0].quantity,2);assert_eq!(saved.inventory()[1].quantity,5);
  assert_eq!(saved.inventory_original_unique_payload(4),Some(payload.as_slice()));
  let id=saved.inventory()[1].document_id;
  assert_eq!(saved.inventory_unique_data(id).unwrap().display_words().1,[0,110,126,118,u32::MAX,0]);
  assert_eq!(saved.inventory_unique_rows().last().unwrap().1,Some(22));
 }
}

#[test]
fn empty_shaped_wand_and_furniture_families_allow_new_distinct_native_variants(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let wand=1429161083i32;let furniture=61381969i32;
 let wc=0x80000000|wand as u32;let fc=0x80000000|furniture as u32;
 for base in [false,true]{for zipped in [false,true]{
  let mut p=synthetic_payload("3.0.1");p[2]=8;p[3]=if base{0x98}else{0x97};
  let wp=arr(vec![vec![9],arr(vec![u(0),vec![0xc0],u(104),u(125),u(118)])]);
  let fp=furniture_payload([13,2,0]);
  p.extend(doc(1,arr(vec![u(4),u(wand as u32),u(21),u(2),wp.clone()])));
  p.extend(doc(1,arr(vec![u(5),u(furniture as u32),u(22),u(3),fp.clone()])));
  if base{p.extend(doc(1,arr(vec![u(6),u(furniture as u32),u(0),u(4),vec![0xc0]])));}
  let raw=slot_from_payload("3.0.1",p);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert!(!e.inventory_absent_wand_ids().contains(&(wand,118)));
  assert!(!e.inventory_absent_furniture_ids().contains(&furniture));
  e.change_inventory_quantities(&[(4,2,0),(5,3,0)]).unwrap();
  if base{e.change_inventory_quantity(6,4,0).unwrap();}
  assert!(e.inventory_absent_wand_ids().contains(&(wand,118)));
  assert_eq!(e.inventory_wand_creation_variants(wc).len(),35);
  assert!(!e.inventory_wand_creation_variants(wc).contains(&[104,125]));
  assert!(e.create_inventory_wand_variant(wc,[0;2],[104,125],1).is_err());
  let wh=e.create_inventory_wand_variant(wc,[0;2],[106,127],7).unwrap();
  let source=if base{
   assert!(e.inventory_default_furniture_ids().contains(&6));6
  }else{
   assert!(e.inventory_absent_furniture_ids().contains(&furniture));
   assert!(e.inventory_creatable().iter().any(|r|r.item_id==furniture));fc
  };
  assert!(e.create_inventory_furniture_variant(source,[0;3],[13,2,0],1).is_err());
  let fh=e.create_inventory_furniture_variant(source,[0;3],[0,3,0],8).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();assert_eq!(restored.inventory(),e.inventory());
  assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory_original_unique_payload(4),Some(wp.as_slice()));
  assert_eq!(saved.inventory_original_unique_payload(5),Some(fp.as_slice()));
  for (handle,qty) in [(wh,7),(fh,8)]{
   let row=saved.inventory().into_iter().find(|r|r.quantity==qty).unwrap();
   assert_eq!(saved.inventory_unique_data(row.document_id),e.inventory_unique_data(handle));
  }
  saved.change_inventory_quantities(&[(4,0,2),(5,0,3)]).unwrap();
  assert!(!saved.inventory_absent_wand_ids().contains(&(wand,118)));
 }}
}

#[test]
fn first_shaped_wands_use_native_candidates_and_shared_history(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let item=1429161083i32;let candidate=0x80000000u32|item as u32;
 for zipped in [false,true]{
  let raw=slot("3.0.1");let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert_eq!(e.inventory_absent_wand_ids().len(),7);
  assert!(e.inventory_absent_wand_ids().contains(&(item,118)));
  assert_eq!(e.inventory_wand_creation_variants(candidate).len(),36);
  assert!(e.create_inventory_wand_variant(candidate,[104,125],[106,127],1).is_err());
  assert!(e.create_inventory_wand_variant(candidate,[0,0],[116,125],1).is_err());
  assert!(e.create_inventory_wand_variant(candidate,[0,0],[104,125],0).is_err());
  assert!(!e.dirty());
  let id=e.create_inventory_wand_variant(candidate,[0,0],[104,125],2).unwrap();
  assert!(e.inventory_wand_creation_variants(candidate).is_empty());
  assert!(e.create_inventory_wand_variant(candidate,[0,0],[106,127],1).is_err());
  e.change_inventory_wand_variant(id,[104,125],[106,127]).unwrap();
  let second=e.create_inventory_wand_variant(id,[106,127],[108,126],3).unwrap();
  assert_ne!(id,second);
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();assert_eq!(restored.inventory(),e.inventory());
  assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();
  assert!(!saved.inventory_absent_wand_ids().contains(&(item,118)));
  let rows:Vec<_>=saved.inventory().into_iter().filter(|r|r.item_id==item).collect();
  assert_eq!(rows.len(),2);
  assert!(rows.iter().any(|r|r.quantity==2&&saved.inventory_unique_data(r.document_id).unwrap().display_words().1==[0,106,127,118,u32::MAX,0]));
  assert!(rows.iter().any(|r|r.quantity==3&&saved.inventory_unique_data(r.document_id).unwrap().display_words().1==[0,108,126,118,u32::MAX,0]));
  assert!(rows.iter().all(|r|r.quantity_minimum==0));
  let row=&rows[0];saved.change_inventory_quantity(row.document_id,row.quantity,0).unwrap();
  assert!(Editor::open(saved.export().unwrap()).unwrap().inventory().iter().any(|r|r.document_id==row.document_id&&r.quantity==0));
 }
}

#[test]
fn large_inventory_batch_and_full_journal_roundtrip(){
 use hkia_save_core::collection::{MAX_INVENTORY_BATCH,HISTORY_MAX_BYTES,HistoryScope::Inventory};
 assert_eq!(MAX_INVENTORY_BATCH,256);
 let pristine=Editor::open(slot("3.0.1")).unwrap();
 let ids:Vec<_>=pristine.inventory_creatable().into_iter().filter(|r|r.quantity_limit.is_some_and(|cap|cap>=2)).take(MAX_INVENTORY_BATCH).map(|r|r.item_id).collect();
 assert_eq!(ids.len(),MAX_INVENTORY_BATCH);
 let mut payload=synthetic_payload("3.0.1");
 let count=(7+ids.len()) as u16;
 payload.splice(3..4,[0xdc,(count>>8) as u8,count as u8]);
 payload.splice(2..3,u((ids.len()+6) as u32));
 for (i,item) in ids.iter().enumerate(){
  payload.extend(doc(1,arr(vec![u(i as u32+4),u(*item as u32),u(0),u(1),vec![0xc0]])));
 }
 // Include complete native avatar/general settings so the fixture can use
 // ordinary clothing as well as materials and furniture without ambiguity.
 payload.extend(doc(10,arr(vec![u((ids.len()+4) as u32),guid([1,2,3,4]),arr(vec![]),arr(vec![]),arr(vec![]),guid([1,2,3,4]),vec![0xc3],vec![0xc0]])));
 payload.extend(doc(22,arr(vec![u((ids.len()+5) as u32),arr(vec![]),arr(vec![]),vec![0xc0],vec![0xc0],arr(vec![])])));
 let input=slot_from_payload("3.0.1",payload);
 let mut editor=Editor::open(input.clone()).unwrap();
 let original=editor.inventory();
 assert_eq!(original.len(),MAX_INVENTORY_BATCH);
 assert!(original.iter().all(|r|r.editable&&r.quantity_minimum==0));
 let requests:Vec<_>=original.iter().map(|r|(r.document_id,1,2)).collect();
 let mut invalid=requests.clone();invalid.push((999999,1,2));
 assert!(editor.change_inventory_quantities(&invalid).is_err());assert_eq!(editor.revision(),0);
 let mut before=1;
 for step in 0..256{
  let after=if step==255{0}else if before==1{2}else{1};
  let requests:Vec<_>=original.iter().map(|r|(r.document_id,before,after)).collect();
  editor.change_inventory_quantities(&requests).unwrap();
  before=after;
 }
 assert_eq!(editor.history().len(),256);
 assert!(editor.inventory().iter().all(|r|r.quantity==0));
 let cp=editor.history_checkpoint().unwrap();
 assert_eq!(cp.len(),16+256*(5+256*12));
 assert!(cp.len()>128*1024&&cp.len()<=HISTORY_MAX_BYTES);
 let mut recovered=Editor::open(input).unwrap();recovered.restore_history(&cp).unwrap();
 assert_eq!(recovered.inventory(),editor.inventory());assert_eq!(recovered.history_checkpoint().unwrap(),cp);
 assert!(recovered.undo_scope(Inventory));assert!(recovered.inventory().iter().all(|r|r.quantity==2));
 assert!(recovered.redo_scope(Inventory));assert_eq!(recovered.inventory(),editor.inventory());
 let reopened=Editor::open(recovered.export().unwrap()).unwrap();
 assert_eq!(reopened.inventory(),editor.inventory());
}

#[test]
fn ordinary_furniture_zero_distinguishes_independent_placement_from_defaults_legacy_guid_and_opaque_layout(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let item=427689u32; // Original nil Rug; native Hash128 source verified.
 let other=3202680u32;
 let native_guid=[0x17fc7530,0x48eebd45,0x68b373b0,0xa7812c9b];
 let home=|legacy:Vec<Vec<u8>>,objects:Vec<Vec<u8>>,wall:u32,floor:u32,plan:u32|{
  arr(vec![guid([41,42,43,44]),arr(legacy),u(wall),u(floor),guid([0;4]),l(0),
   vec![0xc0],vec![0xc2],vec![0xc0],arr(objects),vec![0xc0],vec![0xc0],u(plan),u(0),arr(vec![])])
 };
 let old_object=|g:[u32;4]|arr(vec![guid(g),guid([1,2,3,4]),u(0),u(0),u(0),u(0),u(0),u(0),
  vec![0xc0],vec![0xc0],vec![0xc0],u(0),arr(vec![]),arr(vec![]),u(0)]);
 let object=|placed:u32,table:u32|arr(vec![u(placed),u(table),u(0),u(0),u(0),u(0),
  vec![0xc0],vec![0xc0],arr(vec![]),arr(vec![]),u(0),arr(vec![]),u(0)]);
 let make=|h:Option<Vec<u8>>,celebrate:bool|{
  let mut payload=synthetic_payload("3.0.1");
  payload[3]=0x97+u8::from(h.is_some())+u8::from(celebrate);
  for (id,it) in [(4,item),(5,other)]{payload.extend(doc(1,arr(vec![u(id),u(it),u(0),u(6),vec![0xc0]])))}
  if let Some(h)=h{payload.extend(doc(32,arr(vec![u(6),guid([7,0,0,0]),u(0),
   arr(vec![doc(8,arr(vec![arr(vec![h])]))])])));}
  if celebrate{payload.extend(doc(8,arr(vec![u(7),arr(vec![guid(native_guid)])])));}
  slot_from_payload("3.0.1",payload)
 };
 // A historical celebration is not a placement reference and never blocks removal.
 let original=make(None,true);
 for zipped in [false,true]{
  let input=if zipped{zip(&original)}else{original.clone()};
  let mut e=Editor::open(input.clone()).unwrap();
  assert!(e.inventory().iter().all(|r|r.quantity_minimum==0));
  e.change_inventory_quantities(&[(4,6,0),(5,6,0)]).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut recovered=Editor::open(input).unwrap();
  recovered.restore_history(&cp).unwrap();assert!(recovered.undo_scope(Inventory));assert!(recovered.redo_scope(Inventory));
  let mut saved=Editor::open(recovered.export().unwrap()).unwrap();
  assert_eq!(saved.inventory(),e.inventory());saved.change_inventory_quantity(4,0,3).unwrap();
  assert_eq!(Editor::open(saved.export().unwrap()).unwrap().inventory()[0].quantity,3);
 }
 for h in [
  home(vec![],vec![object(item,0)],0,0,0),
  home(vec![],vec![object(0,item)],0,0,0),
 ]{
  let raw=make(Some(h.clone()),false);let mut e=Editor::open(raw).unwrap();
  assert!(e.inventory().iter().all(|r|r.quantity_minimum==0&&e.inventory_entry_removable(r.document_id)));
  e.change_inventory_quantity(4,6,0).unwrap();e.remove_inventory_entries(&[(4,0)]).unwrap();
  let output=e.export().unwrap();let checked=read_slot(&output).unwrap();
  assert!(checked.envelope.decoded.windows(h.len()).any(|w|w==h.as_slice()));
  let saved=Editor::open(output).unwrap();assert_eq!(saved.inventory().len(),1);assert_eq!(saved.inventory()[0].item_id,other as i32);
 }
 let nonnil=arr(vec![u(item),u(0),u(0),u(0),u(0),u(0),vec![0xc0],furniture_payload([1,0,0]),arr(vec![]),arr(vec![]),u(0),arr(vec![]),u(0)]);
 for h in [
  home(vec![],vec![nonnil],0,0,0),
  home(vec![],vec![],item,0,0),
  home(vec![],vec![],0,item,0),
  home(vec![],vec![],0,0,item),
  home(vec![old_object(native_guid)],vec![],0,0,0),
 ]{
  let mut e=Editor::open(make(Some(h),false)).unwrap();
  assert_eq!(e.inventory()[0].quantity_minimum,1);
  assert_eq!(e.inventory()[1].quantity_minimum,0);
  assert!(e.change_inventory_quantity(4,6,0).is_err());
  assert!(e.change_inventory_quantities(&[(5,6,0),(4,6,0)]).is_err());assert!(!e.dirty());
  e.change_inventory_quantity(5,6,0).unwrap();
  assert_eq!(Editor::open(e.export().unwrap()).unwrap().inventory()[0].quantity,6);
 }
 // Present item/table identities remain protected. Omitted HomeObject
 // tail fields have native empty defaults, not unknown references.
 let incomplete=home(vec![],vec![arr(vec![u(item),u(0)])],0,0,0);
 let mut e=Editor::open(make(Some(incomplete),false)).unwrap();
 assert_eq!(e.inventory().iter().map(|r|r.quantity_minimum).collect::<Vec<_>>(),vec![1,0]);
 assert!(e.change_inventory_quantity(4,6,0).is_err());assert!(!e.dirty());
 e.change_inventory_quantity(5,6,0).unwrap();
 assert_eq!(Editor::open(e.export().unwrap()).unwrap().inventory()[1].quantity,0);
 let unresolved=home(vec![],vec![arr(vec![u(item)])],0,0,0);
 let mut e=Editor::open(make(Some(unresolved),false)).unwrap();
 assert!(e.inventory().iter().all(|r|r.quantity_minimum==1));
 assert!(e.change_inventory_quantity(5,6,0).is_err());assert!(!e.dirty());
}

#[test]
fn expanded_customized_furniture_add_edit_delete_and_reference_protection(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let item=32709745u32;
 let make=|reference:bool|{
  let mut p=synthetic_payload("3.0.1");p[3]=0x96+u8::from(reference);
  p.extend(doc(1,arr(vec![u(4),u(item),u(11),u(6),furniture_payload([208,0,0])])));
  if reference{
   let home=arr(vec![guid([41,42,43,44]),arr(vec![]),u(item),u(0),guid([0;4]),l(0),
    vec![0xc0],vec![0xc2],vec![0xc0],arr(vec![]),vec![0xc0],vec![0xc0],u(0),u(0),arr(vec![])]);
   p.extend(doc(32,arr(vec![u(6),guid([7,0,0,0]),u(0),arr(vec![doc(8,arr(vec![arr(vec![home])]))])])));
  }
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make(false);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert_eq!(e.inventory()[0].quantity_minimum,0);
  assert!(e.inventory_furniture_variants(4).contains(&[209,0,0]));
  e.change_inventory_furniture_variant(4,[208,0,0],[209,0,0]).unwrap();
  let handle=e.create_inventory_furniture_variant(4,[209,0,0],[210,0,0],2).unwrap();
  e.change_inventory_quantity(4,6,0).unwrap();
  let checkpoint=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&checkpoint).unwrap();assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory()[0].quantity,0);assert_eq!(saved.inventory()[0].quantity_minimum,0);
  assert_eq!(saved.inventory_unique_data(4),Some(U::Furniture{materials:[209,0,0]}));
  assert_eq!(saved.inventory_unique_data(saved.inventory()[1].document_id),e.inventory_unique_data(handle));
  saved.change_inventory_quantity(4,0,4).unwrap();
  let reopened=Editor::open(saved.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory()[0].quantity,4);
  assert_eq!(reopened.inventory_unique_data(4),Some(U::Furniture{materials:[209,0,0]}));
 }
 let mut referenced=Editor::open(make(true)).unwrap();
 assert_eq!(referenced.inventory()[0].quantity_minimum,1);
 assert!(referenced.change_inventory_quantity(4,6,0).is_err());
}
#[test]
fn saved_customized_furniture_zero_refill_and_reference_protection(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let item=61381969u32;
 for zipped in [false,true]{
  let raw=furniture_edit_slot(Some(furniture_payload([502,2,0])));let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
  let first=e.inventory_original_unique_payload(4).unwrap().to_vec();
  let second=e.inventory_original_unique_payload(5).unwrap().to_vec();
  let identities=e.inventory_unique_rows().map(|r|r.1).collect::<Vec<_>>();
  assert!(e.inventory().iter().all(|r|r.quantity_minimum==0));
  e.change_inventory_quantities(&[(4,93,0),(5,2,0)]).unwrap();
  assert!(e.inventory_furniture_creation_variants(4).is_empty());
  assert!(e.inventory_furniture_creation_variants(5).is_empty());
  assert!(e.create_inventory_furniture_variant(4,[13,2,0],[13,3,0],1).is_err());
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();
  assert_eq!(restored.inventory(),e.inventory());assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),original);
  assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory(),e.inventory());
  assert_eq!(saved.inventory_unique_rows().map(|r|r.1).collect::<Vec<_>>(),identities);
  assert_eq!(saved.inventory_original_unique_payload(4),Some(first.as_slice()));
  assert_eq!(saved.inventory_original_unique_payload(5),Some(second.as_slice()));
  assert!(saved.inventory_furniture_creation_variants(4).is_empty());
  saved.change_inventory_quantities(&[(4,0,93),(5,0,2)]).unwrap();
  let reopened=Editor::open(saved.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory(),original);
  assert_eq!(reopened.inventory_original_unique_payload(4),Some(first.as_slice()));
  assert_eq!(reopened.inventory_original_unique_payload(5),Some(second.as_slice()));
 }
 // A reference to a different UID of the same Item ID must still block
 // zeroing this sibling. The ordinary positive quantity gate is unchanged.
 let make=|wall:u32,placed:Vec<Vec<u8>>|{
  let mut p=synthetic_payload("3.0.1");p[3]=0x97;
  p.extend(doc(1,arr(vec![u(4),u(item),u(11),u(93),furniture_payload([13,2,0])])));
  let home=arr(vec![guid([41,42,43,44]),arr(vec![]),u(wall),u(0),guid([0;4]),l(0),
   vec![0xc0],vec![0xc2],vec![0xc0],arr(placed),vec![0xc0],vec![0xc0],u(0),u(0),arr(vec![])]);
  p.extend(doc(32,arr(vec![u(6),guid([7,0,0,0]),u(0),arr(vec![doc(8,arr(vec![arr(vec![home])]))])])));
  slot_from_payload("3.0.1",p)
 };
 let placed=arr(vec![u(item),u(0),u(0),u(0),u(0),u(0),furniture_payload([502,2,0]),vec![0xc0],arr(vec![]),arr(vec![]),u(0),arr(vec![]),u(0)]);
 for raw in [make(item,vec![]),make(0,vec![placed]),make(0,vec![arr(vec![u(item),u(0)])])]{
  let mut e=Editor::open(raw).unwrap();assert_eq!(e.inventory()[0].quantity_minimum,1);
  assert!(e.change_inventory_quantity(4,93,0).is_err());assert!(!e.dirty());
 }
}

#[test]
fn ordinary_clothing_zero_requires_complete_avatar_models_and_no_known_or_unresolved_reference(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let first=315822u32;let other=1392669u32;
 let outfit=[0xc0fb08c4,0x4a3b1847,0x87dc1dad,0x177dbe7e];
 let piece=[0x6ae79913,0x4dfd99ac,0xe020e4be,0x0f6869ef];
 let item_guid=[0xcee4c4b9,0x4e24e182,0xace9279e,0x455eeb37];
 let avatar=|pieces:Vec<Vec<u8>>,presets:Vec<Vec<u8>>,outfits:Vec<Vec<u8>>|
  arr(vec![u(6),guid([1,2,3,4]),arr(pieces),arr(presets),arr(outfits),guid([1,2,3,4]),vec![0xc3],vec![0xc0]]);
 let general=|mermaid:Vec<Vec<u8>>,equipped:Vec<Vec<u8>>,presets:Vec<Vec<u8>>|
  arr(vec![u(7),arr(mermaid),arr(equipped),vec![0xc0],vec![0xc0],arr(presets)]);
 let make=|a:Option<Vec<u8>>,g:Option<Vec<u8>>|{
  let mut p=synthetic_payload("3.0.1");p[3]=0x97+u8::from(a.is_some())+u8::from(g.is_some());
  for (id,it) in [(4,first),(5,other)]{p.extend(doc(1,arr(vec![u(id),u(it),u(0),u(6),vec![0xc0]])))}
  if let Some(a)=a{p.extend(doc(10,a));}if let Some(g)=g{p.extend(doc(22,g));}
  slot_from_payload("3.0.1",p)
 };
 let clear=||avatar(vec![],vec![],vec![]);
 let empty=||general(vec![],vec![],vec![]);
 for zipped in [false,true]{
  let raw=make(Some(clear()),Some(empty()));let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
  assert!(original.iter().all(|r|r.quantity_minimum==0));
  e.change_inventory_quantities(&[(4,6,0),(5,6,0)]).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),original);assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();assert_eq!(saved.inventory(),e.inventory());
  saved.change_inventory_quantities(&[(4,0,6),(5,0,6)]).unwrap();
  assert_eq!(Editor::open(saved.export().unwrap()).unwrap().inventory(),original);
 }
 for raw in [
  make(Some(avatar(vec![guid(piece)],vec![],vec![])),Some(empty())),
  make(Some(avatar(vec![],vec![],vec![guid(outfit)])),Some(empty())),
  make(Some(clear()),Some(general(vec![arr(vec![u(0),guid(item_guid),vec![0xc0]])],vec![],vec![]))),
  make(Some(clear()),Some(general(vec![],vec![arr(vec![u(first),vec![0xc0]])],vec![]))),
 ]{
  let mut e=Editor::open(raw).unwrap();assert_eq!(e.inventory()[0].quantity_minimum,1);
  assert_eq!(e.inventory()[1].quantity_minimum,0);assert!(e.change_inventory_quantity(4,6,0).is_err());assert!(!e.dirty());
 }
 for raw in [
  make(None,Some(empty())),
  make(Some(clear()),None),
  make(Some(avatar(vec![],vec![guid([11,22,33,44])],vec![])),Some(empty())),
  make(Some(arr(vec![u(6),guid([1,2,3,4]),arr(vec![])])),Some(empty())),
 ]{
  let mut e=Editor::open(raw).unwrap();assert!(e.inventory().iter().all(|r|r.quantity_minimum==1));
  assert!(e.change_inventory_quantity(4,6,0).is_err());assert!(!e.dirty());
 }
}

#[test]
fn event_tradeable_clothing_zero_refill_uses_exact_outfit_and_piece_references(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let item=517031u32;
 let outfit=[0xf19cbde5,0x482caed7,0x2797ac8b,0xe22f46e9];
 let piece=[0xb2cb0da6,0x436a94b5,0x2ff5088b,0x58380995];
 let make=|pieces:Vec<Vec<u8>>,outfits:Vec<Vec<u8>>|{
  let mut p=synthetic_payload("3.0.1");p[3]=0x98;
  p.extend(doc(1,arr(vec![u(4),u(item),u(0),u(6),vec![0xc0]])));
  p.extend(doc(10,arr(vec![u(6),guid([1,2,3,4]),arr(pieces),arr(vec![]),arr(outfits),guid([1,2,3,4]),vec![0xc3],vec![0xc0]])));
  p.extend(doc(22,arr(vec![u(7),arr(vec![]),arr(vec![]),vec![0xc0],vec![0xc0],arr(vec![])])));
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make(vec![],vec![]);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let before=e.inventory();
  assert_eq!(before[0].quantity_minimum,0);
  e.change_inventory_quantity(4,6,0).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory()[0].quantity_minimum,0);
  assert_eq!(saved.inventory_original_unique_payload(4),Some([0xc0].as_slice()));
  saved.change_inventory_quantity(4,0,6).unwrap();
  assert_eq!(Editor::open(saved.export().unwrap()).unwrap().inventory(),before);
 }
 for raw in [make(vec![],vec![guid(outfit)]),make(vec![guid(piece)],vec![])]{
  let mut e=Editor::open(raw).unwrap();
  assert_eq!(e.inventory()[0].quantity_minimum,1);
  assert!(e.change_inventory_quantity(4,6,0).is_err());assert!(!e.dirty());
 }
}

#[test]
fn saved_flower_clothing_zero_refill_preserves_native_variant_and_protects_equipment(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let crown=897617923u32;let ribbon=105502901u32;
 let piece=[0x7f2bd4e4,0x4c45f5cf,0x7f4ec1b4,0xa1107995];
 let outfit=[0x55e524f7,0x4275ebcb,0x4d4fa5bd,0x236f2213];
 let original=plain_flower(6);
 let make=|pieces:Vec<Vec<u8>>,outfits:Vec<Vec<u8>>,equipped:Vec<Vec<u8>>|{
  let mut p=synthetic_payload("3.0.1");p[3]=0x99;
  for (id,it) in [(4,crown),(5,ribbon)]{p.extend(doc(1,arr(vec![u(id),u(it),u(20+id),u(2),original.clone()])))}
  p.extend(doc(10,arr(vec![u(6),guid([1,2,3,4]),arr(pieces),arr(vec![]),arr(outfits),guid([1,2,3,4]),vec![0xc3],vec![0xc0]])));
  p.extend(doc(22,arr(vec![u(7),arr(vec![]),arr(equipped),vec![0xc0],vec![0xc0],arr(vec![])])));
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make(vec![],vec![],vec![]);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let before=e.inventory();
  assert!(before.iter().all(|r|r.editable&&r.quantity_minimum==0));
  e.change_inventory_quantities(&[(4,2,0),(5,2,0)]).unwrap();
  assert!(e.inventory_flower_creation_variants(4).is_empty());
  let current=e.inventory_unique_data(4).unwrap().display_words().1;
  let expected:[i32;4]=current.into_iter().map(|x|x as i32).collect::<Vec<_>>().try_into().unwrap();
  let mut next=expected;next[1]=2;
  assert!(e.create_inventory_flower_variant(4,expected,next,1).is_err());
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert_eq!(restored.inventory(),e.inventory());assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),before);
  assert!(restored.redo_scope(Inventory));let mut saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory(),e.inventory());assert_eq!(saved.inventory_original_unique_payload(4),Some(original.as_slice()));
  assert_eq!(saved.inventory_unique_rows().next().unwrap().1,Some(24));
  saved.change_inventory_quantities(&[(4,0,2),(5,0,2)]).unwrap();
  assert_eq!(Editor::open(saved.export().unwrap()).unwrap().inventory(),before);
 }
 for raw in [make(vec![guid(piece)],vec![],vec![]),make(vec![],vec![guid(outfit)],vec![]),
  make(vec![],vec![],vec![arr(vec![u(crown),original.clone()])])]{
  let mut e=Editor::open(raw).unwrap();assert_eq!(e.inventory()[0].quantity_minimum,1);
  assert_eq!(e.inventory()[1].quantity_minimum,0);
  assert!(e.change_inventory_quantities(&[(5,2,0),(4,2,0)]).is_err());assert!(!e.dirty());
  e.change_inventory_quantity(5,2,0).unwrap();
  assert_eq!(Editor::open(e.export().unwrap()).unwrap().inventory()[1].quantity,0);
 }
}


#[test]
fn saved_palette_zero_refill_requires_complete_unreferenced_avatar_context(){
 use hkia_save_core::collection::{HistoryScope::Inventory,PaletteVariant};
 let color=|r:f32|[r.to_bits(),0.5f32.to_bits(),(-0.0f32).to_bits(),1.0f32.to_bits()];
 let a=[color(0.25);3];let b=[color(0.75);3];let near=[color(0.250001);3];
 let encode=|v:PaletteVariant|arr(vec![vec![6],arr(v.into_iter().map(|c|arr(c.into_iter().map(|w|f(f32::from_bits(w))).collect())).collect())]);
 let avatar=|copy:Option<PaletteVariant>|arr(vec![u(6),guid([1,2,3,4]),arr(vec![]),arr(vec![]),arr(vec![]),guid([1,2,3,4]),vec![0xc3],copy.map(encode).unwrap_or(vec![0xc0])]);
 let general=|copy:Option<PaletteVariant>|{
  let presets=copy.map(|v|arr(vec![arr(vec![guid([2,3,4,5]),arr(vec![]),vec![0xc2],vec![0xc2],vec![0xc2],arr(vec![guid([1,2,3,4]),arr(vec![]),arr(vec![]),encode(v)])])])).unwrap_or(arr(vec![]));
  arr(vec![u(7),arr(vec![]),arr(vec![]),vec![0xc0],vec![0xc0],presets])
 };
 let make=|av:Option<Vec<u8>>,ge:Option<Vec<u8>>|{
  let mut p=synthetic_payload("3.0.1");p[3]=0x97+u8::from(av.is_some())+u8::from(ge.is_some());
  for (id,v) in [(4,a),(5,b)]{p.extend(doc(1,arr(vec![u(id),u(1835273963),u(20+id),u(2),encode(v)])))}
  if let Some(av)=av{p.extend(doc(10,av));}if let Some(ge)=ge{p.extend(doc(22,ge));}
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make(Some(avatar(None)),Some(general(None)));let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
  assert!(original.iter().all(|r|r.editable&&r.quantity_minimum==0));
  e.change_inventory_quantities(&[(4,2,0),(5,2,0)]).unwrap();
  assert!(e.inventory_palette_creation_variants(4).is_empty());
  let cp=e.history_checkpoint().unwrap();let mut recovered=Editor::open(input).unwrap();recovered.restore_history(&cp).unwrap();
  assert_eq!(recovered.inventory(),e.inventory());assert!(recovered.undo_scope(Inventory));assert_eq!(recovered.inventory(),original);
  assert!(recovered.redo_scope(Inventory));let mut saved=Editor::open(recovered.export().unwrap()).unwrap();
  assert_eq!(saved.inventory(),e.inventory());assert_eq!(saved.inventory_original_unique_payload(4),Some(encode(a).as_slice()));
  assert_eq!(saved.inventory_original_unique_payload(5),Some(encode(b).as_slice()));
  assert_eq!(saved.inventory_unique_rows().next().unwrap().1,Some(24));
  saved.change_inventory_quantities(&[(4,0,2),(5,0,2)]).unwrap();
  assert_eq!(Editor::open(saved.export().unwrap()).unwrap().inventory(),original);
 }
 for raw in [make(Some(avatar(Some(near))),Some(general(None))),make(Some(avatar(None)),Some(general(Some(a))))]{
  let mut e=Editor::open(raw).unwrap();
  assert_eq!(e.inventory().iter().map(|r|r.quantity_minimum).collect::<Vec<_>>(),vec![1,0]);
  assert!(e.change_inventory_quantities(&[(5,2,0),(4,2,0)]).is_err());assert!(!e.dirty());
  e.change_inventory_quantity(5,2,0).unwrap();
  assert_eq!(Editor::open(e.export().unwrap()).unwrap().inventory()[1].quantity,0);
 }
 for raw in [make(None,Some(general(None))),make(Some(avatar(None)),None),
  make(Some(arr(vec![u(6),guid([1,2,3,4]),arr(vec![]),arr(vec![]),arr(vec![])])),Some(general(None)))]{
  let mut e=Editor::open(raw).unwrap();assert!(e.inventory().iter().all(|r|r.quantity_minimum==1));
  assert!(e.change_inventory_quantity(4,2,0).is_err());assert!(!e.dirty());
 }
}

#[test]
fn existing_shaped_wand_zero_refill_preserves_identity_and_denies_copies(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let item=1429161083u32;
 let encode=|magic:u32,fleck:u32|arr(vec![vec![9],arr(vec![u(0),vec![0xc0],u(magic),u(fleck),u(118)])]);
 let first=encode(104,125);let second=encode(105,126);
 let make=|extra:Option<Vec<u8>>|{
  let mut p=synthetic_payload("3.0.1");p[2]=9;p[3]=0x97+u8::from(extra.is_some());
  p.extend(doc(1,arr(vec![u(4),u(item),u(21),u(2),first.clone()])));
  p.extend(doc(1,arr(vec![u(5),u(item),u(22),u(3),second.clone()])));
  if let Some(extra)=extra{p.extend(extra);}
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make(None);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let before=e.inventory();
  assert!(before.iter().all(|r|r.editable&&r.quantity_minimum==0));
  assert!(e.change_inventory_quantities(&[(4,2,0),(5,99,0)]).is_err());assert!(!e.dirty());
  e.change_inventory_quantities(&[(4,2,0),(5,3,0)]).unwrap();
  assert!(e.inventory_wand_creation_variants(4).is_empty());
  assert!(e.create_inventory_wand_variant(4,[104,125],[106,127],1).is_err());
  let cp=e.history_checkpoint().unwrap();let mut r=Editor::open(input).unwrap();r.restore_history(&cp).unwrap();
  assert_eq!(r.inventory(),e.inventory());assert!(r.undo_scope(Inventory));assert_eq!(r.inventory(),before);assert!(r.redo_scope(Inventory));
  let mut saved=Editor::open(r.export().unwrap()).unwrap();assert_eq!(saved.inventory(),e.inventory());
  assert_eq!(saved.inventory_original_unique_payload(4),Some(first.as_slice()));
  assert_eq!(saved.inventory_original_unique_payload(5),Some(second.as_slice()));
  assert_eq!(saved.inventory_unique_rows().map(|r|r.1).collect::<Vec<_>>(),vec![Some(21),Some(22)]);
  saved.change_inventory_quantities(&[(4,0,2),(5,0,3)]).unwrap();
  assert_eq!(Editor::open(saved.export().unwrap()).unwrap().inventory(),before);
 }
 // An unrelated original legacy furniture GUID no longer denies these wands.
 let legacy_home=|g:[u32;4]|{
  let old=arr(vec![guid(g),guid([1,2,3,4]),u(0),u(0),u(0),u(0),u(0),u(0),
   vec![0xc0],vec![0xc0],vec![0xc0],u(0),arr(vec![]),arr(vec![]),u(0)]);
  let home=arr(vec![guid([41,42,43,44]),arr(vec![old]),u(0),u(0),guid([0;4]),l(0),
   vec![0xc0],vec![0xc2],vec![0xc0],arr(vec![]),vec![0xc0],vec![0xc0],u(0),u(0),arr(vec![])]);
  doc(32,arr(vec![u(6),guid([7,0,0,0]),u(0),arr(vec![doc(8,arr(vec![arr(vec![home])]))])]))
 };
 let mut unrelated=Editor::open(make(Some(legacy_home([0x17fc7530,0x48eebd45,0x68b373b0,0xa7812c9b])))).unwrap();
 assert!(unrelated.inventory().iter().all(|r|r.quantity_minimum==0));
 unrelated.change_inventory_quantities(&[(4,2,0),(5,3,0)]).unwrap();
 assert!(Editor::open(unrelated.export().unwrap()).unwrap().inventory().iter().all(|r|r.quantity==0));
 let mut matching=Editor::open(make(Some(legacy_home([0x52e59d2c,0x9342db09,0x587aacab,0x3ac17e48])))).unwrap();
 assert!(matching.inventory().iter().all(|r|r.quantity_minimum==1));
 assert!(matching.change_inventory_quantities(&[(4,2,0),(5,3,0)]).is_err());assert!(!matching.dirty());
 // Copied current payload, unresolved legacy source GUID and truncated outfit context.
 let general=|equipped:Vec<Vec<u8>>|doc(22,arr(vec![u(6),arr(vec![]),arr(equipped),vec![0xc0],vec![0xc0],arr(vec![])]));
 let legacy=arr(vec![vec![5],arr(vec![guid([1,2,3,4]),vec![0xc0],u(104),u(125),u(118)])]);
 for extra in [general(vec![arr(vec![u(item),first.clone()])]),
  doc(1,arr(vec![u(6),u(39246601),u(23),u(1),legacy])),
  doc(22,arr(vec![u(6),arr(vec![])]))]{
  let mut e=Editor::open(make(Some(extra))).unwrap();
  assert!(e.inventory().iter().filter(|r|r.item_id==item as i32).all(|r|r.quantity_minimum!=0));
  assert!(e.change_inventory_quantities(&[(4,2,0),(5,3,0)]).is_err());assert!(!e.dirty());
 }
}

#[test]
fn flower_uncommitted_preview_is_native_and_multifield_creation_is_atomic(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 for zipped in [false,true]{
  let raw=flower_color_slot("3.0.1",None);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  let before=[6,6,0,0];let patterned=[6,6,10,16];let target=[6,8,10,30];
  let (choices,can_create)=e.inventory_flower_preview(4,before,patterned).unwrap();
  assert!(can_create&&choices.contains(&[6,6,10,30]));
  let (choices,can_create)=e.inventory_flower_preview(4,before,[6,6,10,30]).unwrap();
  assert!(can_create&&choices.contains(&target));
  assert!(e.inventory_flower_preview(4,before,[5,8,10,30]).is_err());
  assert!(e.inventory_flower_preview(4,patterned,target).is_err());
  assert!(!e.dirty());assert!(!e.can_undo());
  let handle=e.create_inventory_flower_variant(4,before,target,3).unwrap();
  assert_eq!(e.history().len(),1);
  assert_eq!(e.inventory_unique_data(handle),Some(U::Flower{grow_state:6,base_color:8,pattern:10,pattern_color:30}));
  assert!(e.inventory_flower_preview(4,before,target).is_err());
  let cp=e.history_checkpoint().unwrap();let mut r=Editor::open(input).unwrap();r.restore_history(&cp).unwrap();
  assert!(r.undo_scope(Inventory));assert!(!r.dirty());assert!(r.redo_scope(Inventory));
  let reopened=Editor::open(r.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory_unique_data(4),Some(U::Flower{grow_state:6,base_color:6,pattern:0,pattern_color:0}));
  let row=&reopened.inventory()[1];assert_eq!(row.quantity,3);assert_eq!(reopened.inventory_unique_data(row.document_id),e.inventory_unique_data(handle));
 }
}

#[test]
fn furniture_multislot_creation_and_edit_are_atomic(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let before=[13,2,0];let target=[502,3,0];
 for zipped in [false,true]{
  let raw=furniture_edit_slot(None);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  let options=e.inventory_furniture_creation_variants(4);
  assert!(options.contains(&[502,2,0])&&options.contains(&[13,3,0])&&!options.contains(&target));
  assert!(e.create_inventory_furniture_variant(4,before,[502,3,3],2).is_err());assert!(!e.dirty());
  let id=e.create_inventory_furniture_variant(4,before,target,2).unwrap();
  assert_eq!(e.history().len(),1);assert_eq!(e.inventory_unique_data(id),Some(U::Furniture{materials:target}));
  assert!(e.create_inventory_furniture_variant(4,before,target,1).is_err());
  assert!(e.change_inventory_furniture_variant(4,before,target).is_err());
  let cp=e.history_checkpoint().unwrap();let mut r=Editor::open(input).unwrap();r.restore_history(&cp).unwrap();
  assert!(r.undo_scope(Inventory));assert!(!r.dirty());assert!(r.redo_scope(Inventory));
  let saved=Editor::open(r.export().unwrap()).unwrap();assert_eq!(saved.inventory_unique_data(4),Some(U::Furniture{materials:before}));
  let added=&saved.inventory()[1];assert_eq!(added.quantity,2);assert_eq!(saved.inventory_unique_data(added.document_id),Some(U::Furniture{materials:target}));
 }
 let mut collision=Editor::open(furniture_edit_slot(Some(furniture_payload([502,3,0])))).unwrap();
 assert!(collision.create_inventory_furniture_variant(4,before,target,2).is_err());assert!(!collision.dirty());
}

#[test]
fn furniture_all_native_slots_can_reach_a_free_combination_when_single_slot_neighbors_are_reserved(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let item=61381969u32;let candidate=0x80000000|item;
 let raw=slot("3.0.1");
 let mut seed=Editor::open(raw).unwrap();
 let choices=seed.inventory_furniture_creation_variants(candidate);
 assert!(!choices.is_empty());
 // Occupy each distinct normalized single-slot key, not each spelling.
 let mut count=0;
 for v in choices{
  if seed.create_inventory_furniture_variant(candidate,[0;3],v,1).is_ok(){count+=1;}
 }
 let saved=Editor::open(seed.export().unwrap()).unwrap();
 assert!(count>1);
 let ids=saved.inventory().iter().map(|r|r.document_id).collect::<Vec<_>>();
 let mut saved=saved;
 let zero:Vec<_>=ids.iter().map(|&id|(id,1,0)).collect();
 saved.change_inventory_quantities(&zero).unwrap();
 let raw=saved.export().unwrap();
 for zipped in [false,true]{
  let input=if zipped{zip(&raw)}else{raw.clone()};
  let mut e=Editor::open(input.clone()).unwrap();let before=e.inventory();
  assert!(e.inventory_absent_furniture_ids().contains(&(item as i32)));
  let variants=e.inventory_furniture_creation_variants(candidate);
  assert_eq!(variants.len(),1);
  let target=variants[0];assert!(target.iter().filter(|&&v|v!=0).count()>=2);
  assert!(e.inventory_furniture_preview(candidate,[0;3],[0;3]).unwrap().0.contains(&target));
  assert!(e.inventory_furniture_preview(candidate,[0;3],target).unwrap().1);
  e.create_inventory_furniture_variant(candidate,[0;3],target,3).unwrap();
  assert!(e.create_inventory_furniture_variant(candidate,[0;3],target,3).is_err());
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),before);assert!(restored.redo_scope(Inventory));
  let reopened=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory().len(),count+1);
  assert_eq!(reopened.inventory().iter().filter(|r|r.quantity==0).count(),count);
 }
}

#[test]
fn furniture_draft_preview_recomputes_material_choices_against_complete_identity(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let before:[i32;3]=[13,2,0];let peer:[i32;3]=[502,2,0];let intermediate=[13,3,0];let target=[502,3,0];
 for zipped in [false,true]{
  // Reserve both persisted document IDs before requesting a new one.
  let mut payload=synthetic_payload("3.0.1");payload[2]=5;payload[3]=0x97;
  for (id,uid,quantity,variant) in [(4,11,93,before),(5,12,2,peer)]{
   payload.extend(doc(1,arr(vec![u(id),u(61381969),u(uid),u(quantity),furniture_payload(variant.map(|n|n as u32))])));
  }
  let raw=slot_from_payload("3.0.1",payload);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  let (options,creatable)=e.inventory_furniture_preview(4,before,before).unwrap();
  assert!(!creatable);assert!(!options.contains(&peer));assert!(options.contains(&intermediate));
  assert!(e.inventory_furniture_preview(4,before,peer).is_err());
  let (options,creatable)=e.inventory_furniture_preview(4,before,intermediate).unwrap();
  assert!(creatable&&options.contains(&target));
  assert!(e.inventory_furniture_preview(4,before,target).unwrap().1);
  assert!(!e.dirty());
  let id=e.create_inventory_furniture_variant(4,before,target,2).unwrap();
  assert_eq!(e.inventory_unique_data(id),Some(U::Furniture{materials:target}));
  assert!(e.inventory_furniture_preview(4,before,target).is_err());
  assert!(e.undo_scope(Inventory));assert!(e.inventory_furniture_preview(4,before,target).unwrap().1);
  assert!(e.redo_scope(Inventory));
  let saved=Editor::open(e.export().unwrap()).unwrap();
  assert_eq!(saved.inventory_unique_data(4),Some(U::Furniture{materials:before}));
  assert_eq!(saved.inventory_unique_data(5),Some(U::Furniture{materials:peer}));
  assert!(saved.inventory().iter().any(|r|r.quantity==2&&saved.inventory_unique_data(r.document_id)==Some(U::Furniture{materials:target})));
 }
}

#[test]
fn cafe_multiple_ingredient_pairs_create_one_independent_stack(){
 use hkia_save_core::collection::{HistoryScope::Inventory,CafeVariant};
 let original=[44,49,48,6,46,9];let target=[62,50,48,6,46,9];
 let encode=|v:CafeVariant|arr(vec![vec![3],arr(vec![arr(v[..3].iter().map(|&w|u(w as u32)).collect()),arr(v[3..].iter().map(|&w|u(w as u32)).collect())])]);
 let make=|peer:bool|{let mut p=synthetic_payload("3.0.1");p[2]=8;p[3]=if peer{0x97}else{0x96};
  p.extend(doc(1,arr(vec![u(4),u(1338995084),u(21),u(2),encode(original)])));
  if peer{p.extend(doc(1,arr(vec![u(5),u(1338995084),u(22),u(1),encode(target)])))}
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make(false);let input=if zipped{zip(&raw)}else{raw};let mut e=Editor::open(input.clone()).unwrap();
  let options=e.inventory_cafe_creation_variants(4);
  assert!(options.iter().any(|&(v,_,_)|v==[62,49,48,6,46,9]));
  assert!(options.iter().any(|&(v,_,_)|v==[44,50,48,6,46,9]));
  assert!(!options.iter().any(|&(v,_,_)|v==target));
  let mut bad=target;bad[4]=999;
  assert!(e.create_inventory_cafe_variant(4,original,bad,3).is_err());assert!(!e.dirty());
  let id=e.create_inventory_cafe_variant(4,original,target,3).unwrap();
  assert_eq!(e.history().len(),1);assert!(e.create_inventory_cafe_variant(4,original,target,1).is_err());
  assert!(e.change_inventory_cafe_variant(4,original,target).is_err());
  let cp=e.history_checkpoint().unwrap();let mut r=Editor::open(input).unwrap();r.restore_history(&cp).unwrap();
  assert!(r.undo_scope(Inventory));assert!(!r.dirty());assert!(r.redo_scope(Inventory));
  let saved=Editor::open(r.export().unwrap()).unwrap();
  assert_eq!(saved.inventory_original_unique_payload(4),Some(encode(original).as_slice()));
  assert_eq!(saved.inventory()[1].quantity,3);
  assert!(saved.inventory_cafe_rows().any(|(_,v,_)|v==target));
  assert!(e.inventory_cafe_rows().any(|(doc,v,_)|doc==id&&v==target));
 }
 let mut collision=Editor::open(make(true)).unwrap();
 assert!(collision.create_inventory_cafe_variant(4,original,target,1).is_err());assert!(!collision.dirty());
}

#[test]
fn palette_multichannel_creation_is_one_native_transaction(){
 use hkia_save_core::{collection::{HistoryScope::Inventory,PaletteVariant},inventory_palette_source::palette_output_color as color,native::InventoryUniqueData};
 let original=[color(1,0).unwrap(),color(2,0).unwrap(),color(3,0).unwrap()];
 let target=[color(4,3).unwrap(),color(5,4).unwrap(),color(6,0).unwrap()];
 let encode=|v:PaletteVariant|arr(vec![vec![6],arr(v.into_iter().map(|c|arr(c.into_iter().map(|w|f(f32::from_bits(w))).collect())).collect())]);
 let make=|v:PaletteVariant|{
  let mut p=synthetic_payload("3.0.1");p[2]=8;p[3]=0x96;
  p.extend(doc(1,arr(vec![u(4),u(1835273963),u(21),u(2),encode(v)])));
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make(original);let input=if zipped{zip(&raw)}else{raw};let mut e=Editor::open(input.clone()).unwrap();
  assert!(!e.inventory_palette_creation_variants(4).contains(&target));
  let mut forbidden=target;forbidden[1]=[0,0,0,0x3f800000];
  assert!(e.create_inventory_palette_variant(4,original,forbidden,3).is_err());assert!(!e.dirty());
  let id=e.create_inventory_palette_variant(4,original,target,3).unwrap();
  assert_eq!(e.history().len(),1);assert_eq!(e.inventory_unique_data(id),Some(InventoryUniqueData::Palette{rgba_bits:target}));
  assert!(e.create_inventory_palette_variant(4,original,target,3).is_err());
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert!(restored.undo_scope(Inventory));assert!(!restored.dirty());assert!(restored.redo_scope(Inventory));
  let saved=Editor::open(restored.export().unwrap()).unwrap();assert_eq!(saved.inventory_original_unique_payload(4),Some(encode(original).as_slice()));
  let new_id=saved.inventory()[1].document_id;assert_eq!(saved.inventory()[1].quantity,3);
  assert_eq!(saved.inventory_unique_data(new_id),Some(InventoryUniqueData::Palette{rgba_bits:target}));
 }
}

#[test]
fn unowned_flower_customized_first_stack_uses_verified_default_witness(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let raw=slot_from_payload("3.0.1",synthetic_payload("3.0.1"));
 for zipped in [false,true]{
  let input=if zipped{zip(&raw)}else{raw.clone()};
  let mut e=Editor::open(input.clone()).unwrap();
  let id=(1u32<<31)|43114910;let crown=(1u32<<31)|1120342995;let witness=[6,2,0,0];let target=[6,5,10,16];
  assert!(e.inventory_flower_creation_variants(id).contains(&witness));
  assert!(e.inventory_flower_preview(id,witness,[6,2,10,16]).unwrap().0.contains(&target));
  for bad in [[5,5,10,16],[6,14,10,16],[6,5,10,5],[6,5,0,16]]{
   assert!(e.create_inventory_flower_variant(id,witness,bad,1).is_err());
  }
  assert!(e.create_inventory_flower_variant(id,[6,1,0,0],target,1).is_err());
  assert!(e.create_inventory_flower_variant(id,[0;4],target,1).is_err());
  assert!(e.create_inventory_flower_variant((1u32<<31)|312661096,[6,3,0,0],[6,3,0,0],1).is_err());
  assert!(!e.dirty());
  let f=e.create_inventory_flower_variant(id,witness,target,3).unwrap();
  assert_eq!(e.history().len(),1);
  assert!(e.create_inventory_flower_variant(id,witness,target,1).is_err());
  let c=e.create_inventory_flower_variant(crown,witness,target,2).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut r=Editor::open(input).unwrap();r.restore_history(&cp).unwrap();
  assert!(r.undo_scope(Inventory));assert!(r.undo_scope(Inventory));assert!(!r.dirty());
  assert!(r.redo_scope(Inventory));assert!(r.redo_scope(Inventory));
  let saved=Editor::open(r.export().unwrap()).unwrap();assert_eq!(saved.inventory().len(),2);
  for (i,h) in [f,c].into_iter().enumerate(){let row=&saved.inventory()[i];assert_eq!(saved.inventory_unique_data(row.document_id),e.inventory_unique_data(h));}
 }
}

#[test]
fn palette_preview_composes_source_colors_before_one_atomic_add(){
 use hkia_save_core::{collection::{HistoryScope::Inventory,PaletteVariant},inventory_palette_source::palette_output_color as color,native::InventoryUniqueData};
 let original=[[0,0,0,0x3f800000];3];
 let target=[color(4,3).unwrap(),color(5,4).unwrap(),color(6,0).unwrap()];
 let encode=|v:PaletteVariant|arr(vec![vec![6],arr(v.into_iter().map(|c|arr(c.into_iter().map(|w|f(f32::from_bits(w))).collect())).collect())]);
 for zipped in [false,true]{
  let mut p=synthetic_payload("3.0.1");p[2]=8;p[3]=0x96;
  p.extend(doc(1,arr(vec![u(4),u(1835273963),u(21),u(2),encode(original)])));
  let raw=slot_from_payload("3.0.1",p);let input=if zipped{zip(&raw)}else{raw};let mut e=Editor::open(input.clone()).unwrap();
  assert!(e.inventory_palette_creation_variants(4).is_empty());
  let one=[target[0],original[1],original[2]];let two=[target[0],target[1],original[2]];
  let (options,can)=e.inventory_palette_preview(4,original,original).unwrap();assert!(!can&&options.contains(&one));
  let (options,can)=e.inventory_palette_preview(4,original,one).unwrap();assert!(!can&&options.contains(&two));
  let (options,can)=e.inventory_palette_preview(4,original,two).unwrap();assert!(!can&&options.contains(&target));
  assert!(e.inventory_palette_preview(4,original,target).unwrap().1);
  assert!(e.inventory_palette_preview(4,one,target).is_err());
  assert!(!e.dirty());assert!(!e.can_undo());
  let id=e.create_inventory_palette_variant(4,original,target,3).unwrap();
  assert_eq!(e.history().len(),1);assert!(e.inventory_palette_preview(4,original,target).is_err());
  assert_eq!(e.inventory_unique_data(id),Some(InventoryUniqueData::Palette{rgba_bits:target}));
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert!(restored.undo_scope(Inventory));assert!(!restored.dirty());assert!(restored.redo_scope(Inventory));
  let saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory_original_unique_payload(4),Some(encode(original).as_slice()));
  assert_eq!(saved.inventory_unique_data(saved.inventory()[1].document_id),e.inventory_unique_data(id));
 }
}

#[test]
fn new_flower_variants_refuse_unresolved_copied_payloads(){
 let mut p=synthetic_payload("3.0.1");p[3]=0x97;
 p.extend(doc(1,arr(vec![u(4),u(1331175279),u(11),u(93),plain_flower(6)])));
 p.extend(doc(22,arr(vec![u(6),arr(vec![arr(vec![u(0),guid([1,2,3,4]),plain_flower(6)])]),arr(vec![])])));
 let raw=slot_from_payload("3.0.1",p);
 for zipped in [false,true]{
  let mut e=Editor::open(if zipped{zip(&raw)}else{raw.clone()}).unwrap();
  let before=[6,6,0,0];let next=[6,8,0,0];
  assert!(!e.inventory_flower_variants(4).is_empty());
  assert!(e.inventory_flower_creation_variants(4).is_empty());
  assert!(!e.inventory_flower_preview(4,before,next).unwrap().1);
  assert!(e.create_inventory_flower_variant(4,before,next,1).is_err());
  assert!(e.inventory_absent_flower_ids().is_empty());
  for item in [43114910u32,1120342995]{
   let candidate=(1u32<<31)|item;
   assert!(e.inventory_flower_creation_variants(candidate).is_empty());
   assert!(e.inventory_flower_preview(candidate,[6,2,0,0],[6,5,0,0]).is_err());
   assert!(e.create_inventory_flower_variant(candidate,[0;4],[6,2,0,0],1).is_err());
   assert!(e.create_inventory_flower_variant(candidate,[6,2,0,0],[6,5,0,0],1).is_err());
  }
  assert!(!e.dirty());assert!(!e.can_undo());
  // The existing source-backed ordinary flower appearance edit remains independent.
  e.change_inventory_flower_variant(4,before,next).unwrap();
  assert_eq!(Editor::open(e.export().unwrap()).unwrap().inventory_unique_data(4),e.inventory_unique_data(4));
 }
}

#[test]
fn ordinary_furniture_source_remains_available_after_custom_stack_export(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let item=61381969;let staged=(1u32<<31)|item as u32;
 for saved_base in [false,true]{for zipped in [false,true]{
  let mut p=synthetic_payload("3.0.1");p[2]=8;p[3]=if saved_base{0x97}else{0x96};
  p.extend(doc(1,arr(vec![u(4),u(item),u(11),u(2),furniture_payload([0,2,0])])));
  if saved_base{p.extend(doc(1,arr(vec![u(5),u(item),u(0),u(3),vec![0xc0]])))}
  let raw=slot_from_payload("3.0.1",p);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  let base=if saved_base{5}else{e.change_inventory_quantity(staged,0,3).unwrap();staged};
  assert!(e.inventory_default_furniture_ids().contains(&base));
  assert!(!e.inventory_furniture_creation_variants(base).contains(&[0,2,0]));
  assert!(e.inventory_furniture_creation_variants(base).contains(&[0,3,0]));
  assert!(e.create_inventory_furniture_variant(base,[0;3],[0,2,0],1).is_err());
  let child=e.create_inventory_furniture_variant(base,[0;3],[0,3,0],4).unwrap();
  assert_eq!(e.inventory_unique_data(child),Some(U::Furniture{materials:[0,3,0]}));
  assert_eq!(e.inventory().iter().find(|r|r.document_id==base).unwrap().quantity,3);
  assert!(e.create_inventory_furniture_variant(base,[0;3],[0,3,0],1).is_err());
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let reopened=Editor::open(restored.export().unwrap()).unwrap();
  let base=reopened.inventory().into_iter().find(|r|r.quantity==3).unwrap().document_id;
  assert!(reopened.inventory_default_furniture_ids().contains(&base));
  assert!(!reopened.inventory_furniture_creation_variants(base).contains(&[0,2,0]));
  assert!(!reopened.inventory_furniture_creation_variants(base).contains(&[0,3,0]));
  assert_eq!(reopened.inventory_unique_data(base),None);
 }}
}

#[test]
fn expanded_nonclothing_tradeable_zero_refill_and_reference_guards(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let item=13938575u32;let other=21295337u32;
 let native_guid=[0xea8e0484,0x4ff95a6a,0xf2e7d4b6,0xb50963dd];
 let legacy=arr(vec![guid(native_guid),guid([1,2,3,4]),u(0),u(0),u(0),u(0),u(0),u(0),
  vec![0xc0],vec![0xc0],vec![0xc0],u(0),arr(vec![]),arr(vec![]),u(0)]);
 let home=|legacy:Vec<Vec<u8>>,wall:u32|{
  arr(vec![guid([41,42,43,44]),arr(legacy),u(wall),u(0),guid([0;4]),l(0),
   vec![0xc0],vec![0xc2],vec![0xc0],arr(vec![]),vec![0xc0],vec![0xc0],u(0),u(0),arr(vec![])])
 };
 let make=|h:Option<Vec<u8>>|{
  let mut payload=synthetic_payload("3.0.1");payload[3]=0x97+u8::from(h.is_some());
  for (id,it) in [(4,item),(5,other)]{payload.extend(doc(1,arr(vec![u(id),u(it),u(0),u(6),vec![0xc0]])))}
  if let Some(h)=h{payload.extend(doc(32,arr(vec![u(6),guid([7,0,0,0]),u(0),
   arr(vec![doc(8,arr(vec![arr(vec![h])]))])])));}
  slot_from_payload("3.0.1",payload)
 };
 for zipped in [false,true]{
  let raw=make(None);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert!(e.inventory().iter().all(|r|r.quantity_minimum==0));
  e.change_inventory_quantities(&[(4,6,0),(5,6,0)]).unwrap();
  assert_eq!(e.history().len(),1);
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();
  assert!(saved.inventory().iter().all(|r|r.quantity==0&&r.quantity_minimum==0));
  saved.change_inventory_quantity(4,0,3).unwrap();
  let reopened=Editor::open(saved.export().unwrap()).unwrap();assert_eq!(reopened.inventory()[0].quantity,3);
  assert_eq!(reopened.inventory_original_unique_payload(4),Some([0xc0].as_slice()));
 }
 for h in [home(vec![legacy],0),home(vec![],item)]{
  let mut e=Editor::open(make(Some(h))).unwrap();
  assert_eq!(e.inventory()[0].quantity_minimum,1);assert_eq!(e.inventory()[1].quantity_minimum,0);
  assert!(e.change_inventory_quantities(&[(4,6,0),(5,6,0)]).is_err());assert!(!e.dirty());
 }
}
#[test]
fn ordinary_tradeable_event_comic_music_and_material_addition_uses_native_membership(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let ids=[517031,13938575,21295337,40179426,362307007];
 for zipped in [false,true]{
  let raw=slot("3.0.1");let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let candidates=e.inventory_creatable();
  let req:Vec<_>=ids.iter().map(|id|(candidates.iter().find(|r|r.item_id==*id).unwrap().document_id,0,4)).collect();
  for id in [2773515,3445697,1798633565,1900000001,1205887707]{assert!(!candidates.iter().any(|r|r.item_id==id));}
  e.change_inventory_quantities(&req).unwrap();assert_eq!(e.history().len(),1);
  let checkpoint=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&checkpoint).unwrap();
  assert!(restored.undo_scope(Inventory));assert!(restored.inventory().is_empty());assert!(restored.redo_scope(Inventory));
  let saved=Editor::open(restored.export().unwrap()).unwrap();assert_eq!(saved.inventory().len(),ids.len());
  assert!(saved.inventory().iter().all(|r|ids.contains(&r.item_id)&&r.quantity==4&&saved.inventory_original_unique_payload(r.document_id)==Some([0xc0].as_slice())));
  assert_eq!(saved.entries(),e.entries());assert_eq!(saved.achievements(),e.achievements());
 }
}

#[test]
fn first_seed_and_uprooted_plant_use_verified_species_and_full_tuple(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 for zipped in [false,true]{
  let raw=slot_from_payload("3.0.1",synthetic_payload("3.0.1"));let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let id=(1u32<<31)|43114910;let witness=[6,2,0,0];
  let (choices,can)=e.inventory_flower_preview(id,witness,witness).unwrap();assert!(can&&choices.contains(&[0,2,0,0])&&choices.contains(&[7,2,0,0]));
  assert!(e.inventory_flower_preview(id,witness,[0,2,0,0]).unwrap().1);
  assert!(e.inventory_flower_preview(id,witness,[7,5,10,16]).unwrap().1);
  assert!(e.inventory_flower_preview(id,witness,[5,2,0,0]).is_err());
  let crown=(1u32<<31)|1120342995;
  assert!(e.inventory_flower_preview(crown,witness,[0,2,0,0]).is_err());
  assert!(e.create_inventory_flower_variant(crown,witness,[7,2,0,0],1).is_err());
  assert!(!e.dirty());
  let a=e.create_inventory_flower_variant(id,witness,[0,2,0,0],3).unwrap();
  let b=e.create_inventory_flower_variant(id,witness,[7,5,10,16],4).unwrap();
  assert_ne!(a,b);assert!(e.create_inventory_flower_variant(id,witness,[0,2,0,0],1).is_err());
  let checkpoint=e.history_checkpoint().unwrap();let mut recovered=Editor::open(input).unwrap();recovered.restore_history(&checkpoint).unwrap();
  assert!(recovered.undo_scope(Inventory));assert!(recovered.redo_scope(Inventory));
  let saved=Editor::open(recovered.export().unwrap()).unwrap();assert_eq!(saved.inventory().len(),2);
  for (i,h) in [a,b].into_iter().enumerate(){assert_eq!(saved.inventory_unique_data(saved.inventory()[i].document_id),e.inventory_unique_data(h));}
  assert!(matches!(saved.inventory_unique_data(saved.inventory()[0].document_id),Some(U::Flower{grow_state:0,..})));
  assert!(matches!(saved.inventory_unique_data(saved.inventory()[1].document_id),Some(U::Flower{grow_state:7,..})));
 }
}


#[test]
fn item_and_critter_wands_preserve_source_identity_through_edit_add_delete_and_recovery(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let item=384749651u32;let critter=1304219546u32;
 let stick=1185152302u32;let outfit=315822u32;let bug=7285157u32;
 let payload=|source:u32,magic:u32,fleck:u32,style:u32,nested:Vec<u8>|arr(vec![vec![9],arr(vec![u(source),nested,u(magic),u(fleck),u(style)])]);
 let make=|other:Vec<u8>,extra:Option<Vec<u8>>|{
  let mut p=synthetic_payload("3.0.1");p[2]=12;p[3]=0x98+u8::from(extra.is_some());
  for (id,it,uid,pay) in [(4,item,21,payload(stick,115,125,0,vec![0xc0])),(5,item,22,other),(6,critter,23,payload(bug,104,126,0,vec![0xc0]))]{
   p.extend(doc(1,arr(vec![u(id),u(it),u(uid),u(2),pay])));
  }
  if let Some(x)=extra{p.extend(x);}
  slot_from_payload("3.0.1",p)
 };
 let peer=payload(outfit,115,125,0,vec![0xc0]);
 for zipped in [false,true]{
  let raw=make(peer.clone(),None);let input=if zipped{zip(&raw)}else{raw};let mut e=Editor::open(input.clone()).unwrap();
  assert!(e.inventory().iter().all(|r|r.editable&&r.quantity_minimum==0));
  assert!(e.inventory_wand_variants(4).contains(&[104,125]));
  assert!(e.inventory_wand_variants(5).contains(&[104,125]));
  assert!(e.inventory_wand_variants(6).contains(&[115,127]));
  e.change_inventory_wand_variant(4,[115,125],[104,125]).unwrap();
  let child=e.create_inventory_wand_variant(4,[104,125],[105,127],3).unwrap();
  let critter_child=e.create_inventory_wand_variant(6,[104,126],[115,127],1).unwrap();
  assert!(matches!(e.inventory_unique_data(child),Some(U::WandAppearance{source_item_id:1185152302,style:0,magic:105,fleck:127,source_tag:-1,..})));
  assert!(matches!(e.inventory_unique_data(critter_child),Some(U::WandAppearance{source_item_id:7285157,style:0,magic:115,fleck:127,..})));
  assert!(e.create_inventory_wand_variant(4,[104,125],[105,127],1).is_err());
  e.change_inventory_quantity(4,2,0).unwrap();
  assert!(e.inventory_wand_creation_variants(4).is_empty());
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory()[0].quantity,0);
  assert_eq!(saved.inventory_original_unique_payload(5),Some(peer.as_slice()));
  assert!(saved.inventory().iter().any(|r|r.quantity==3&&saved.inventory_unique_data(r.document_id)==e.inventory_unique_data(child)));
  assert!(saved.inventory().iter().any(|r|r.quantity==1&&saved.inventory_unique_data(r.document_id)==e.inventory_unique_data(critter_child)));
  saved.change_inventory_quantity(4,0,2).unwrap();
  assert_eq!(Editor::open(saved.export().unwrap()).unwrap().inventory()[0].quantity,2);
 }
 for invalid in [payload(stick,115,125,0,vec![0xc0]),payload(1900000001,115,125,0,vec![0xc0]),payload(outfit,115,125,1,vec![0xc0]),payload(outfit,115,125,0,plain_flower(6))]{
  let mut e=Editor::open(make(invalid,None)).unwrap();
  assert!(e.inventory_wand_creation_variants(4).is_empty());
  assert_quantity_only_roundtrip(&mut e,4,3);
 }
 let copied=doc(22,arr(vec![u(7),arr(vec![]),arr(vec![arr(vec![u(item),peer.clone()])]),vec![0xc0],vec![0xc0],arr(vec![])]));
 let mut e=Editor::open(make(peer,Some(copied))).unwrap();
 assert!(e.change_inventory_quantity(4,2,0).is_err());assert!(!e.dirty());
 let mut empty=Editor::open(slot("3.0.1")).unwrap();
 assert!(empty.inventory_absent_wand_ids().contains(&(item as i32,0)));
 assert!(!empty.inventory_absent_wand_ids().contains(&(critter as i32,0)));
 assert!(empty.create_inventory_wand_variant(0x80000000|item,[0;2],[104,125],1).is_err());
}


#[test]
fn first_source_wands_require_explicit_source_witness_and_replay_it(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let item=384749651u32;let critter=1304219546u32;let stick=1185152302i32;let bug=7285157i32;
 let item_candidate=0x80000000|item;let critter_candidate=0x80000000|critter;
 let make=||{
  let mut p=synthetic_payload("3.0.1");p[2]=8;p[3]=0x96;
  p.extend(doc(1,arr(vec![u(4),u(bug as u32),u(0),u(2),vec![0xc0]])));
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make();let input=if zipped{zip(&raw)}else{raw};let mut e=Editor::open(input.clone()).unwrap();
  assert!(e.inventory_absent_wand_ids().contains(&(item as i32,0)));
  assert!(e.inventory_absent_wand_ids().contains(&(critter as i32,0)));
  let sources=e.inventory_absent_wand_sources(item_candidate);
  assert!(sources.contains(&stick)&&sources.windows(2).all(|w|w[0]<w[1]));
  assert!(sources.contains(&15761463)); // unrestricted native bag definition outside the old creation slice
  assert_eq!(e.inventory_absent_wand_sources(critter_candidate),vec![bug]);
  assert_eq!(e.inventory_wand_creation_variants(item_candidate).len(),36);
  for bad in [[0,0],[stick,1],[1900000001,0]]{
   assert!(e.create_inventory_wand_variant(item_candidate,bad,[104,125],1).is_err());
  }
  assert!(e.create_inventory_wand_variant(critter_candidate,[stick,0],[104,125],1).is_err());
  assert!(!e.dirty());
  let first=e.create_inventory_wand_variant(item_candidate,[stick,0],[104,125],3).unwrap();
  let second=e.create_inventory_wand_variant(critter_candidate,[bug,0],[105,126],1).unwrap();
  assert!(matches!(e.inventory_unique_data(first),Some(U::WandAppearance{source_item_id:1185152302,style:0,magic:104,fleck:125,source_tag:-1,..})));
  assert!(matches!(e.inventory_unique_data(second),Some(U::WandAppearance{source_item_id:7285157,style:0,magic:105,fleck:126,source_tag:-1,..})));
  assert!(e.inventory_absent_wand_sources(item_candidate).contains(&stick));
  assert_eq!(e.inventory_wand_source_creation_variants(item_candidate,stick).len(),35);
  assert!(!e.inventory_wand_source_creation_variants(item_candidate,stick).contains(&[104,125]));
  assert!(e.create_inventory_wand_variant(item_candidate,[stick,0],[104,125],1).is_err());
  let alternate=e.create_inventory_wand_variant(item_candidate,[315822,0],[104,125],4).unwrap();
  assert!(matches!(e.inventory_unique_data(alternate),Some(U::WandAppearance{source_item_id:315822,style:0,magic:104,fleck:125,..})));
  let common=e.create_inventory_wand_variant(item_candidate,[15761463,0],[104,125],5).unwrap();
  assert!(matches!(e.inventory_unique_data(common),Some(U::WandAppearance{source_item_id:15761463,style:0,magic:104,fleck:125,source_tag:-1,..})));
  e.change_inventory_wand_variant(first,[104,125],[106,125]).unwrap();
  assert!(!e.inventory_wand_source_creation_variants(item_candidate,stick).contains(&[104,125]));
  assert!(!e.inventory_wand_source_creation_variants(item_candidate,stick).contains(&[106,125]));
  assert!(e.create_inventory_wand_variant(item_candidate,[stick,0],[106,125],1).is_err());
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory()[0].quantity,2);
  assert!(saved.inventory().iter().any(|r|r.quantity==3&&saved.inventory_unique_data(r.document_id)==e.inventory_unique_data(first)));
  assert!(saved.inventory().iter().any(|r|r.quantity==1&&saved.inventory_unique_data(r.document_id)==e.inventory_unique_data(second)));
  assert!(saved.inventory().iter().any(|r|r.quantity==4&&saved.inventory_unique_data(r.document_id)==e.inventory_unique_data(alternate)));
  assert!(saved.inventory().iter().any(|r|r.quantity==5&&saved.inventory_unique_data(r.document_id)==e.inventory_unique_data(common)));
  assert!(!saved.inventory().iter().any(|r|r.item_id==15761463));
  assert!(!saved.inventory_wand_source_creation_variants(item_candidate,stick).contains(&[106,125]));
  assert!(saved.inventory_wand_source_creation_variants(item_candidate,stick).contains(&[104,125]));
 }
 let mut empty=Editor::open(slot("3.0.1")).unwrap();
 assert!(empty.inventory_absent_wand_sources(critter_candidate).is_empty());
 assert!(empty.create_inventory_wand_variant(critter_candidate,[bug,0],[104,125],1).is_err());
}

#[test]
fn remaining_custom_furniture_zero_refill_preserves_native_payload_and_protects_references(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let item=102286319u32;
 let native_guid=[0xc2961421,0x4fdf4f88,0x988e1cb7,0x7f57b563];
 let make=|payload:Vec<u8>,reference:Option<Vec<u8>>|{
  let mut p=synthetic_payload("3.0.1");p[3]=0x96+u8::from(reference.is_some());
  p.extend(doc(1,arr(vec![u(4),u(item),u(11),u(6),payload])));
  if let Some(h)=reference{p.extend(doc(32,arr(vec![u(6),guid([7,0,0,0]),u(0),arr(vec![doc(8,arr(vec![arr(vec![h])]))])])));}
  slot_from_payload("3.0.1",p)
 };
 let home=|wall,legacy:Vec<Vec<u8>>|arr(vec![guid([41,42,43,44]),arr(legacy),u(wall),u(0),guid([0;4]),l(0),
  vec![0xc0],vec![0xc2],vec![0xc0],arr(vec![]),vec![0xc0],vec![0xc0],u(0),u(0),arr(vec![])]);
 let legacy=arr(vec![guid(native_guid),guid([1,2,3,4]),u(0),u(0),u(0),u(0),u(0),u(0),
  vec![0xc0],vec![0xc0],vec![0xc0],u(0),arr(vec![]),arr(vec![]),u(0)]);
 let payload=furniture_payload([102,0,0]);
 for zipped in [false,true]{
  let raw=make(payload.clone(),None);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert_eq!(e.inventory()[0].quantity_minimum,0);
  e.change_inventory_quantity(4,6,0).unwrap();
  assert!(e.inventory_furniture_creation_variants(4).is_empty());
  let cp=e.history_checkpoint().unwrap();let mut recovered=Editor::open(input).unwrap();
  recovered.restore_history(&cp).unwrap();assert!(recovered.undo_scope(Inventory));assert!(recovered.redo_scope(Inventory));
  let mut saved=Editor::open(recovered.export().unwrap()).unwrap();
  assert_eq!(saved.inventory()[0].quantity_minimum,0);assert_eq!(saved.inventory()[0].quantity,0);
  assert_eq!(saved.inventory_original_unique_payload(4),Some(payload.as_slice()));
  saved.change_inventory_quantity(4,0,6).unwrap();
  let restored=Editor::open(saved.export().unwrap()).unwrap();
  assert_eq!(restored.inventory()[0].quantity,6);
  assert_eq!(restored.inventory_original_unique_payload(4),Some(payload.as_slice()));
 }
 for h in [home(item,vec![]),home(0,vec![legacy])]{
  let mut e=Editor::open(make(payload.clone(),Some(h))).unwrap();
  assert_eq!(e.inventory()[0].quantity_minimum,1);
  assert!(e.change_inventory_quantity(4,6,0).is_err());assert!(!e.dirty());
 }
 let mut nil=Editor::open(make(vec![0xc0],None)).unwrap();
 assert!(nil.change_inventory_quantity(4,6,0).is_err());
 assert!(!Editor::open(slot("3.0.1")).unwrap().inventory_creatable().iter().any(|r|r.item_id==item as i32));
}


#[test]
fn ordinary_furniture_base_zero_refill_keeps_distinct_custom_peers(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let item=61381969u32;
 let make=|peers:Vec<Vec<u8>>|{
  let mut p=synthetic_payload("3.0.1");p[2]=12;p[3]=0x96+peers.len() as u8;
  p.extend(doc(1,arr(vec![u(4),u(item),u(0),u(3),vec![0xc0]])));
  for peer in peers{p.extend(peer);}
  slot_from_payload("3.0.1",p)
 };
 let custom=|id,uid,materials|doc(1,arr(vec![u(id),u(item),u(uid),u(2),furniture_payload(materials)]));
 for zipped in [false,true]{
  let raw=make(vec![custom(5,11,[0,2,0]),custom(6,12,[0,3,0])]);
  let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert_eq!(e.inventory()[0].quantity_minimum,0);
  let before=e.inventory_original_unique_payload(5).unwrap().to_vec();
  e.change_inventory_quantity(4,3,0).unwrap();
  assert!(e.inventory_furniture_creation_variants(4).is_empty());
  assert_eq!(e.inventory_unique_data(5),Some(U::Furniture{materials:[0,2,0]}));
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let mut reopened=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory()[0].quantity,0);assert_eq!(reopened.inventory()[0].quantity_minimum,0);
  assert_eq!(reopened.inventory()[1].quantity,2);assert_eq!(reopened.inventory()[2].quantity,2);
  assert_eq!(reopened.inventory_original_unique_payload(5),Some(before.as_slice()));
  reopened.change_inventory_quantity(4,0,7).unwrap();
  let final_save=Editor::open(reopened.export().unwrap()).unwrap();
  assert_eq!(final_save.inventory()[0].quantity,7);
  assert_eq!(final_save.inventory_original_unique_payload(4),Some([0xc0].as_slice()));
  assert_eq!(final_save.inventory_original_unique_payload(5),Some(before.as_slice()));
 }
 for peers in [
  vec![doc(1,arr(vec![u(5),u(item),u(0),u(2),vec![0xc0]]))],
  vec![custom(5,11,[0,1,0])],
  vec![custom(5,11,[0,2,0]),custom(6,12,[0,2,0])],
  vec![custom(5,11,[0,2,0]),custom(6,11,[0,3,0])],
 ]{
  let mut e=Editor::open(make(peers)).unwrap();
  assert_eq!(e.inventory()[0].quantity_minimum,1);
  assert!(e.change_inventory_quantity(4,3,0).is_err());assert!(!e.dirty());
 }
}


#[test]
fn new_palette_can_be_created_after_all_existing_stacks_are_emptied(){
 use hkia_save_core::{collection::{HistoryScope::Inventory,PaletteVariant},inventory_palette_source::palette_output_color as color};
 let item=1835273963u32;let candidate=(1u32<<31)|item;
 let original=[color(1,0).unwrap();3];let target=[color(4,3).unwrap(),color(5,4).unwrap(),color(6,0).unwrap()];
 let encode=|v:PaletteVariant|arr(vec![vec![6],arr(v.into_iter().map(|c|arr(c.into_iter().map(|w|f(f32::from_bits(w))).collect())).collect())]);
 for zipped in [false,true]{
  let mut p=synthetic_payload("3.0.1");p[2]=8;p[3]=0x98;
  p.extend(doc(1,arr(vec![u(4),u(item),u(21),u(2),encode(original)])));
  p.extend(doc(10,arr(vec![u(5),guid([1,2,3,4]),arr(vec![]),arr(vec![]),arr(vec![]),guid([1,2,3,4]),vec![0xc3],vec![0xc0]])));
  p.extend(doc(22,arr(vec![u(6),arr(vec![]),arr(vec![]),vec![0xc0],vec![0xc0],arr(vec![])])));
  let raw=slot_from_payload("3.0.1",p);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert!(e.inventory_absent_palette_default().is_none());
  e.change_inventory_quantity(4,2,0).unwrap();
  assert!(e.inventory_palette_creation_variants(4).is_empty());
  let (_,starter)=e.inventory_absent_palette_default().unwrap();
  assert_ne!(starter,original);
  assert!(e.inventory_palette_preview(candidate,starter,original).is_err());
  assert!(e.create_inventory_palette_variant(candidate,starter,original,1).is_err());
  let handle=e.create_inventory_palette_variant(candidate,starter,target,5).unwrap();
  assert!(e.inventory_absent_palette_default().is_none());
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert_eq!(restored.inventory(),e.inventory());assert!(restored.undo_scope(Inventory));
  assert_eq!(restored.inventory_absent_palette_default(),Some((item as i32,starter)));
  assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory_original_unique_payload(4),Some(encode(original).as_slice()));
  let added=saved.inventory().into_iter().find(|r|r.quantity==5).unwrap();
  assert_eq!(saved.inventory_unique_data(added.document_id),e.inventory_unique_data(handle));
  saved.change_inventory_quantity(added.document_id,5,0).unwrap();
  let (_,second)=saved.inventory_absent_palette_default().unwrap();
  assert!(saved.create_inventory_palette_variant(candidate,second,target,1).is_err());
  saved.change_inventory_quantity(4,0,2).unwrap();
  assert!(saved.inventory_absent_palette_default().is_none());
 }
}

#[test]
fn first_custom_palette_uses_exact_native_output_words_and_replays(){
 use hkia_save_core::{collection::HistoryScope::Inventory,inventory_palette_source::palette_output_color};
 let item=1835273963i32;let candidate=0x80000000u32|item as u32;
 for zipped in [false,true]{
  let raw=slot("3.0.1");let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  let (id,default)=e.inventory_absent_palette_default().unwrap();assert_eq!(id,item);
  let target=[palette_output_color(1,0).unwrap(),palette_output_color(2,3).unwrap(),palette_output_color(3,4).unwrap()];
  assert!(e.inventory_palette_preview(candidate,default,default).unwrap().1);
  assert!(e.inventory_palette_preview(candidate,default,target).unwrap().1);
  assert!(e.create_inventory_palette_variant(candidate,[[0;4];3],target,1).is_err());
  assert!(e.create_inventory_palette_variant(candidate,default,[[0;4];3],1).is_err());
  assert!(e.create_inventory_palette_variant(candidate,default,target,0).is_err());assert!(!e.dirty());
  let handle=e.create_inventory_palette_variant(candidate,default,target,2).unwrap();
  assert!(e.inventory_absent_palette_default().is_none());
  assert!(e.create_inventory_palette_variant(candidate,default,target,1).is_err());
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();assert_eq!(restored.inventory(),e.inventory());
  assert!(restored.undo_scope(Inventory));assert!(restored.inventory_absent_palette_default().is_some());
  assert!(restored.redo_scope(Inventory));
  let saved=Editor::open(restored.export().unwrap()).unwrap();assert!(saved.inventory_absent_palette_default().is_none());
  let row=&saved.inventory()[0];assert_eq!((row.item_id,row.quantity),(item,2));
  assert_eq!(saved.inventory_unique_data(row.document_id),e.inventory_unique_data(handle));
  assert_eq!(saved.inventory_unique_data(row.document_id).unwrap().display_words().1,target.into_iter().flatten().collect::<Vec<_>>());
 }
}


#[test]
fn item_wand_source_replacement_keeps_uid_and_reserves_original_and_effective_identity(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let item=384749651u32;let candidate=0x80000000|item;
 let stick=1185152302i32;let outfit=315822i32;
 let make=||{
  let mut p=synthetic_payload("3.0.1");p[2]=9;p[3]=0x97;
  for (id,uid,source,magic) in [(4,21,stick,104),(5,22,outfit,105)]{
   let pay=arr(vec![vec![9],arr(vec![u(source as u32),vec![0xc0],u(magic),u(125),u(0)])]);
   p.extend(doc(1,arr(vec![u(id),u(item),u(uid),u(2),pay])));
  }
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make();let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  let original=e.inventory_unique_data(4);
  assert!(e.inventory_wand_edit_sources(4).contains(&outfit));
  assert!(!e.inventory_wand_edit_source_variants(4,outfit).contains(&[105,125]));
  assert!(e.change_inventory_wand_identity(4,[stick,104,125],[outfit,105,125]).is_err());
  assert!(e.change_inventory_wand_identity(4,[stick,104,125],[1900000001,104,125]).is_err());assert!(!e.dirty());
  e.change_inventory_wand_identity(4,[stick,104,125],[outfit,104,125]).unwrap();
  assert_eq!(e.inventory()[0].quantity,2);
  assert!(matches!(e.inventory_unique_data(4),Some(U::WandAppearance{source_item_id:315822,magic:104,fleck:125,style:0,..})));
  assert!(!e.inventory_wand_source_creation_variants(candidate,stick).contains(&[104,125]));
  assert!(!e.inventory_wand_source_creation_variants(candidate,outfit).contains(&[104,125]));
  e.change_inventory_wand_variant(4,[104,125],[106,127]).unwrap();
  assert!(e.undo_scope(Inventory));assert!(e.undo_scope(Inventory));assert_eq!(e.inventory_unique_data(4),original);
  assert!(e.redo_scope(Inventory));assert!(e.redo_scope(Inventory));
  let checkpoint=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&checkpoint).unwrap();
  let saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory_unique_data(4),e.inventory_unique_data(4));
  assert_eq!(saved.inventory_unique_rows().map(|r|r.1).collect::<Vec<_>>(),vec![Some(21),Some(22)]);
  assert_eq!(saved.inventory()[0].quantity,2);
  assert!(saved.inventory_wand_source_creation_variants(candidate,stick).contains(&[104,125]));
 }
}

#[test]
fn first_unowned_currency_creation_roundtrip_and_atomic_rejection(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let ids=[348154640,391038680,460708033,483381991,646065996,833471261,1486918074,1763799360,1774854033,1956968187,2079616823];
 for zipped in [false,true]{
  let raw=slot("3.0.1");let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  let candidates=e.inventory_creatable();
  let changes:Vec<_>=ids.iter().map(|id|(candidates.iter().find(|r|r.item_id==*id).unwrap().document_id,0,15)).collect();
  for denied in [1205887707u32,615026760,709633628,1610049001]{
   let mut bad=changes.clone();bad.push((0x80000000|denied,0,1));
   assert!(e.change_inventory_quantities(&bad).is_err());assert!(!e.dirty());
  }
  e.change_inventory_quantities(&changes).unwrap();assert_eq!(e.history().len(),1);
  assert_eq!(e.inventory().len(),11);
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();assert_eq!(restored.inventory(),e.inventory());
  assert!(restored.undo_scope(Inventory));assert!(restored.inventory().is_empty());assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();let rows=saved.inventory();
  assert_eq!(rows.len(),11);assert!(rows.iter().all(|r|ids.contains(&r.item_id)&&r.quantity==15&&r.quantity_minimum==0));
  assert!(saved.inventory_unique_rows().all(|(_,uid,nil,_,_)|uid==Some(0)&&nil==Some(true)));
  assert_eq!(saved.entries(),e.entries());assert_eq!(saved.achievements(),e.achievements());
  let deletion:Vec<_>=rows.iter().map(|r|(r.document_id,15,0)).collect();
  saved.change_inventory_quantities(&deletion).unwrap();
  let mut reopened=Editor::open(saved.export().unwrap()).unwrap();
  assert!(reopened.inventory().iter().all(|r|r.quantity==0&&r.quantity_minimum==0));
  reopened.change_inventory_quantity(rows[0].document_id,0,2).unwrap();
  assert_eq!(Editor::open(reopened.export().unwrap()).unwrap().inventory()[0].quantity,2);
 }
}

#[test]
fn floral_outfits_first_add_edit_clone_zero_and_refill(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let ids=[41105179,313677564,528401863,809985659,811189976,965037291,1646153125];
 for zipped in [false,true]{
  let mut p=synthetic_payload("3.0.1");p[3]=0x97;
  p.extend(doc(10,arr(vec![u(4),guid([1,2,3,4]),arr(vec![]),arr(vec![]),arr(vec![]),guid([1,2,3,4]),vec![0xc3],vec![0xc0]])));
  p.extend(doc(22,arr(vec![u(5),arr(vec![]),arr(vec![]),vec![0xc0],vec![0xc0],arr(vec![])])));
  p[2]=6;
  let raw=slot_from_payload("3.0.1",p);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert!(ids.iter().all(|id|e.inventory_absent_flower_ids().contains(id)));
  for item in ids{
   let candidate=(1u32<<31)|item as u32;
   let base=e.inventory_flower_creation_variants(candidate)[0];
   let handle=e.create_inventory_flower_variant(candidate,[0;4],base,2).unwrap();
   let next=e.inventory_flower_variants(handle).into_iter().find(|v|v[2]==14).unwrap();
   e.change_inventory_flower_variant(handle,base,next).unwrap();
   assert!(e.create_inventory_flower_variant(handle,next,base,1).is_err());
   let clone=e.inventory_flower_creation_variants(handle)[0];
   e.create_inventory_flower_variant(handle,next,clone,3).unwrap();
  }
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();assert_eq!(restored.inventory(),e.inventory());
  assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();let rows=saved.inventory();
  assert_eq!(rows.len(),14);assert!(rows.iter().all(|r|ids.contains(&r.item_id)&&r.editable&&r.quantity_minimum==0));
  let clear:Vec<_>=rows.iter().map(|r|(r.document_id,r.quantity,0)).collect();
  saved.change_inventory_quantities(&clear).unwrap();
  let mut reopened=Editor::open(saved.export().unwrap()).unwrap();
  assert!(reopened.inventory().iter().all(|r|r.quantity==0));
  reopened.change_inventory_quantity(rows[0].document_id,0,4).unwrap();
  assert_eq!(Editor::open(reopened.export().unwrap()).unwrap().inventory()[0].quantity,4);
 }
}


#[test]
fn nested_furniture_wand_reaches_free_combination_when_all_single_slot_neighbors_are_reserved(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let item=384749651u32;let source=61381969i32;let before=[source,104,125,13,2,0];
 let payload=arr(vec![vec![9],arr(vec![u(source as u32),furniture_payload([13,2,0]),u(104),u(125),u(0)])]);
 let mut p=synthetic_payload("3.0.1");p[2]=5;p[3]=0x96;
 p.extend(doc(1,arr(vec![u(4),u(item),u(21),u(3),payload])));
 let raw=slot_from_payload("3.0.1",p);let mut seed=Editor::open(raw).unwrap();
 let single=seed.inventory_wand_nested_creation_material_variants(4);
 assert!(single.len()>1);
 let mut peers=Vec::new();
 for material in single{
  let next=[source,104,125,material[0],material[1],material[2]];
  if let Ok(id)=seed.create_inventory_wand_nested(4,before,next,1){peers.push(id);}
 }
 assert!(peers.len()>1);
 // Export once to establish unique native keys, including material aliases.
 let mut seed=Editor::open(seed.export().unwrap()).unwrap();
 let zero:Vec<_>=seed.inventory().iter().filter(|r|r.document_id!=4).map(|r|(r.document_id,1,0)).collect();
 seed.change_inventory_quantities(&zero).unwrap();let raw=seed.export().unwrap();
 for zipped in [false,true]{
  let input=if zipped{zip(&raw)}else{raw.clone()};
  let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
  let options=e.inventory_wand_nested_material_variants(4);
  assert_eq!(options.len(),1);let material=options[0];
  assert!((0..3).filter(|&i|material[i]!=before[i+3]).count()>=2);
  assert!(e.inventory_wand_nested_creation_material_variants(4).contains(&material));
  let target=[source,104,125,material[0],material[1],material[2]];
  let id=e.create_inventory_wand_nested(4,before,target,2).unwrap();
  assert!(e.change_inventory_wand_nested(4,before,target).is_err());
  assert!(e.undo_scope(Inventory));assert_eq!(e.inventory(),original);
  e.change_inventory_wand_nested(4,before,target).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert_eq!(restored.inventory_unique_data(4),e.inventory_unique_data(4));
  assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),original);
  assert!(restored.redo_scope(Inventory));let saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory_unique_data(4),e.inventory_unique_data(4));
  assert_eq!(saved.inventory().iter().filter(|r|r.quantity==0).count(),peers.len());
  assert_eq!(saved.inventory()[0].quantity,3);
  assert!(e.inventory_unique_data(id).is_none());
 }
}

#[test]
fn furniture_source_wand_edits_and_additions_preserve_exact_nested_identity(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let item=384749651u32;let source=61381969i32;let candidate=0x80000000|item;
 let wand=|source:i32,magic:u32,materials:Option<[u32;3]>|arr(vec![vec![9],arr(vec![u(source as u32),materials.map(furniture_payload).unwrap_or_else(||vec![0xc0]),u(magic),u(125),u(0)])]);
 let make=|peer:Vec<u8>|{
  let mut p=synthetic_payload("3.0.1");p[2]=12;p[3]=0x98;
  for (id,uid,pay) in [(4,21,wand(source,104,Some([13,2,0]))),(5,22,peer),(6,23,wand(source,104,None))]{
   p.extend(doc(1,arr(vec![u(id),u(item),u(uid),u(2),pay])));
  }
  slot_from_payload("3.0.1",p)
 };
 let peer=wand(source,104,Some([502,2,0]));
 for zipped in [false,true]{
  let raw=make(peer.clone());let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  let before=[source,104,125,13,2,0];let after=[source,104,125,13,3,0];
  assert!(e.inventory().iter().all(|r|r.editable&&r.quantity_minimum==0));
  assert!(e.inventory_wand_edit_sources(4).is_empty());
  assert!(e.inventory_wand_nested_material_variants(4).contains(&[13,3,0]));
  assert!(e.inventory_wand_nested_creation_material_variants(4).contains(&[13,3,0]));
  assert!(!e.inventory_wand_nested_material_variants(4).contains(&[502,2,0]));
  assert!(e.inventory_wand_nested_pairs(4,true).contains(&[106,127]));
  let combined=e.inventory_wand_nested_materials_for_pair(4,[106,127],true);
  assert!(combined.contains(&[13,2,0])&&combined.contains(&[502,2,0]));
  let draft=e.inventory_wand_nested_material_draft(4,[106,127],[502,2,0],true);
  assert!(draft.contains(&[502,3,0])&&draft.contains(&[502,2,0]));
  assert!(e.inventory_wand_nested_material_draft(4,[104,125],[502,2,0],false).is_empty());
  assert!(e.inventory_wand_nested_material_draft(4,[106,127],[285,2,0],true).is_empty());
  assert!(!e.dirty());
  assert!(e.inventory_wand_nested_materials_for_pair(4,[999,127],false).is_empty());
  assert!(!e.inventory_wand_source_creation_variants(candidate,source).contains(&[104,125]));
  assert!(e.change_inventory_wand_nested(4,before,[source,104,125,502,2,0]).is_err());
  assert!(e.change_inventory_wand_nested(4,before,[source,104,125,285,2,0]).is_err());
  assert!(e.change_inventory_wand_nested(4,before,[source,104,125,0,0,0]).is_err());
  assert!(e.change_inventory_wand_identity(4,[source,104,125],[315822,104,125]).is_err());
  assert!(e.create_inventory_wand_variant(4,[104,125],[106,125],1).is_err());
  assert!(!e.dirty());
  e.change_inventory_wand_nested(4,before,after).unwrap();
  assert!(e.inventory_wand_nested_material_variants(4).contains(&[13,2,0]));
  assert!(!e.inventory_wand_nested_creation_material_variants(4).contains(&[13,2,0]));
  let material=e.inventory_wand_nested_creation_material_variants(4).into_iter().next().expect("distinct furniture material");
  let material_target=[source,104,125,material[0],material[1],material[2]];
  let material_child=e.create_inventory_wand_nested(4,after,material_target,4).unwrap();
  assert!(!e.inventory_wand_nested_creation_material_variants(4).contains(&material));
  let child=e.create_inventory_wand_nested(4,after,[source,106,125,13,3,0],3).unwrap();
  let combination=[source,106,127,502,3,0];
  assert!(e.inventory_wand_nested_materials_for_pair(4,[106,127],true).contains(&[502,3,0]));
  let combined_child=e.create_inventory_wand_nested(4,after,combination,5).unwrap();
  assert!(!e.inventory_wand_nested_materials_for_pair(4,[106,127],true).contains(&[502,3,0]));
  assert!(matches!(e.inventory_unique_data(child),Some(U::WandAppearance{source_item_id:61381969,magic:106,fleck:125,source_tag:8,source_count:3,..})));
  assert_eq!(e.inventory_unique_data(child).unwrap().display_words().1,vec![61381969,106,125,0,8,3,13,3,0]);
  assert!(e.create_inventory_wand_nested(4,after,[source,106,125,13,3,0],1).is_err());
  assert!(e.create_inventory_wand_nested(4,after,before,1).is_err());
  e.change_inventory_quantity(4,2,0).unwrap();
  assert!(e.inventory_wand_nested_creation_material_variants(4).is_empty());
  let checkpoint=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&checkpoint).unwrap();assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory()[0].quantity,0);assert_eq!(saved.inventory_unique_rows().next().unwrap().1,Some(21));
  assert_eq!(saved.inventory_original_unique_payload(5),Some(peer.as_slice()));
  assert!(saved.inventory().iter().any(|r|r.quantity==3&&saved.inventory_unique_data(r.document_id)==e.inventory_unique_data(child)));
  assert!(saved.inventory().iter().any(|r|r.quantity==4&&saved.inventory_unique_data(r.document_id)==e.inventory_unique_data(material_child)));
  assert!(saved.inventory().iter().any(|r|r.quantity==5&&saved.inventory_unique_data(r.document_id)==e.inventory_unique_data(combined_child)));
  saved.change_inventory_quantity(4,0,2).unwrap();assert!(Editor::open(saved.export().unwrap()).is_ok());
 }
 for peer in [wand(source,104,Some([13,2,0])),wand(source,104,Some([285,2,0])),wand(source,104,Some([0,0,0])),wand(315822,104,Some([13,2,0]))]{
  let mut e=Editor::open(make(peer)).unwrap();
  assert!(e.inventory_wand_nested_material_variants(4).is_empty());
  assert_quantity_only_roundtrip(&mut e,4,3);
 }
}

#[test]
fn existing_generic_magic_wand_zero_style_is_editable_but_not_an_absent_candidate(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let item=1020402601u32;let candidate=(1u32<<31)|item;
 let payload=|source:u32,style:u32,magic:u32,fleck:u32|arr(vec![vec![9],arr(vec![u(source),vec![0xc0],u(magic),u(fleck),u(style)])]);
 let make=|source:u32,style:u32,extra:Option<Vec<u8>>|{
  let mut p=synthetic_payload("3.0.1");p[2]=6;p[3]=0x96+u8::from(extra.is_some());
  p.extend(doc(1,arr(vec![u(4),u(item),u(21),u(3),payload(source,style,104,125)])));
  if let Some(extra)=extra{p.extend(extra);}
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make(0,0,None);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert!(e.inventory()[0].editable&&e.inventory()[0].quantity_minimum==0);
  assert_eq!(e.inventory_wand_variants(4).len(),35);
  assert!(e.inventory_wand_creation_variants(candidate).is_empty());
  assert!(e.create_inventory_wand_variant(candidate,[0,0],[106,127],1).is_err());
  assert!(e.inventory_wand_edit_sources(4).is_empty());
  assert!(e.change_inventory_wand_variant(4,[104,125],[132,125]).is_err());
  e.change_inventory_wand_variant(4,[104,125],[106,127]).unwrap();
  let child=e.create_inventory_wand_variant(4,[106,127],[108,126],2).unwrap();
  assert!(e.create_inventory_wand_variant(4,[106,127],[108,126],1).is_err());
  e.change_inventory_quantity(4,3,0).unwrap();
  assert!(e.inventory_wand_creation_variants(4).is_empty());
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();assert_eq!(restored.inventory(),e.inventory());assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory()[0].quantity,0);
  assert!(matches!(saved.inventory_unique_data(4),Some(U::WandAppearance{source_item_id:0,magic:106,fleck:127,style:0,source_tag:-1,..})));
  let added=saved.inventory().into_iter().find(|r|r.quantity==2).unwrap();
  assert_eq!(saved.inventory_unique_data(added.document_id),e.inventory_unique_data(child));
  saved.change_inventory_quantity(4,0,3).unwrap();
  assert!(Editor::open(saved.export().unwrap()).is_ok());
 }
 let mut empty=Editor::open(slot("3.0.1")).unwrap();
 assert!(!empty.inventory_absent_wand_ids().iter().any(|r|r.0==item as i32));
 assert!(empty.create_inventory_wand_variant(candidate,[0,0],[104,125],1).is_err());
 // Existing zero-GUID legacy output is exercised in the cross-format regression.
 for (source,style) in [(315822,0),(0,118),(0,116),(0,124)]{
  let mut e=Editor::open(make(source,style,None)).unwrap();
  assert!(e.inventory()[0].editable);
  assert!(e.change_inventory_wand_variant(4,[104,125],[106,127]).is_err());
 }
 let equipped=doc(22,arr(vec![u(5),arr(vec![]),arr(vec![arr(vec![u(item),payload(0,0,104,125)])]),vec![0xc0],vec![0xc0],arr(vec![])]));
 let mut e=Editor::open(make(0,0,Some(equipped))).unwrap();
 assert!(e.inventory_wand_variants(4).is_empty());
 assert!(e.change_inventory_quantity(4,3,0).is_err());
}

#[test]
fn rare_candle_effect_only_patterns_roundtrip_and_preserve_native_identity(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 for zipped in [false,true]{
  let raw=slot("3.0.1");let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  let effects=[3,4,5,7,8,9];
  for item in [22657460,1858821696]{
   let candidate=(1u32<<31)|item as u32;let starter=[6,2,10,16];
   for pattern in effects{
    let target=[6,2,pattern,0];
    assert!(e.inventory_flower_preview(candidate,starter,target).unwrap().1);
    assert!(e.inventory_flower_preview(candidate,starter,[6,2,pattern,16]).is_err());
    e.create_inventory_flower_variant(candidate,starter,target,3).unwrap();
    assert!(e.create_inventory_flower_variant(candidate,starter,target,3).is_err());
   }
  }
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert_eq!(restored.inventory(),e.inventory());assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();let rows=saved.inventory();
  assert_eq!(rows.len(),12);assert!(rows.iter().all(|r|r.quantity_minimum==0&&r.editable&&r.quantity==3));
  for row in &rows{
   let Some(U::Flower{grow_state:6,base_color:2,pattern,pattern_color:0})=saved.inventory_unique_data(row.document_id)else{panic!("wrong effect payload")};
   assert!(effects.contains(&pattern));
   let before=[6,2,pattern,0];let next=[6,9,pattern,0];
   assert!(saved.inventory_flower_variants(row.document_id).contains(&next));
   saved.change_inventory_flower_variant(row.document_id,before,next).unwrap();
  }
  let clear:Vec<_>=rows.iter().map(|r|(r.document_id,3,0)).collect();
  saved.change_inventory_quantities(&clear).unwrap();
  let mut reopened=Editor::open(saved.export().unwrap()).unwrap();
  for row in &rows{
   assert!(matches!(reopened.inventory_unique_data(row.document_id),Some(U::Flower{grow_state:6,base_color:9,pattern,pattern_color:0}) if effects.contains(&pattern)));
   reopened.change_inventory_quantity(row.document_id,0,2).unwrap();
  }
  assert!(Editor::open(reopened.export().unwrap()).unwrap().inventory().iter().all(|r|r.quantity==2));
 }
}


#[test]
fn owned_dlc_flower_outputs_use_native_variants_and_reject_absent_generation(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let items=[385493558u32,1205053551,1377029192,2062954152,1095918548,1716283922,401804031,1776250358,1797473773];
 for (i,item) in items.into_iter().enumerate(){
  for zipped in [false,true]{
   let mut p=synthetic_payload("3.0.1");p[2]=6;p[3]=0x98;
   p.extend(doc(1,arr(vec![u(4),u(item),u(11),u(3),plain_flower(2)])));
   p.extend(doc(10,arr(vec![u(5),guid([1,2,3,4]),arr(vec![]),arr(vec![]),arr(vec![]),guid([1,2,3,4]),vec![0xc3],vec![0xc0]])));
   p.extend(doc(22,arr(vec![u(6),arr(vec![]),arr(vec![]),vec![0xc0],vec![0xc0],arr(vec![])])));
   let raw=slot_from_payload("3.0.1",p);let input=if zipped{zip(&raw)}else{raw};
   let mut e=Editor::open(input.clone()).unwrap();
   let before=[6,2,0,0];let changed=if i<4{[6,8,0,0]}else{[6,8,10,16]};
   let clone=if i<4{[6,9,0,0]}else{[6,9,3,0]};
   let candidate=(1u32<<31)|item;
   assert!(e.inventory()[0].editable&&e.inventory()[0].quantity_minimum==0);
   assert!(e.inventory_flower_creation_variants(candidate).is_empty());
   assert!(e.create_inventory_flower_variant(candidate,[0;4],before,1).is_err());
   assert!(e.inventory_flower_preview(4,before,changed).unwrap().1);
   assert!(e.change_inventory_flower_variant(4,before,[7,8,0,0]).is_err());
   assert!(e.change_inventory_flower_variant(4,before,[6,8,6,0]).is_err());
   if i<4{assert!(e.change_inventory_flower_variant(4,before,[6,8,10,16]).is_err());}
   e.change_inventory_flower_variant(4,before,changed).unwrap();
   let h=e.create_inventory_flower_variant(4,changed,clone,2).unwrap();
   assert!(e.create_inventory_flower_variant(4,changed,clone,1).is_err());
   e.change_inventory_quantity(4,3,0).unwrap();
   assert!(e.inventory_flower_creation_variants(4).is_empty());
   assert!(e.create_inventory_flower_variant(4,changed,[6,10,0,0],1).is_err());
   let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
   restored.restore_history(&cp).unwrap();assert_eq!(restored.inventory(),e.inventory());
   assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
   let mut saved=Editor::open(restored.export().unwrap()).unwrap();
   assert_eq!(saved.inventory()[0].quantity,0);
   assert_eq!(saved.inventory_unique_data(4),Some(U::Flower{grow_state:6,base_color:changed[1],pattern:changed[2],pattern_color:changed[3]}));
   let child=saved.inventory().into_iter().find(|r|r.quantity==2).unwrap();
   assert_eq!(saved.inventory_unique_data(child.document_id),e.inventory_unique_data(h));
   saved.change_inventory_quantity(4,0,3).unwrap();
   assert!(Editor::open(saved.export().unwrap()).is_ok());
  }
 }
 let mut absent=Editor::open(slot("3.0.1")).unwrap();
 for item in items{
  let id=(1u32<<31)|item;
  assert!(absent.inventory_flower_creation_variants(id).is_empty());
  assert!(absent.create_inventory_flower_variant(id,[0;4],[6,2,0,0],1).is_err());
 }
 assert!(!absent.dirty());
}

#[test]
fn owned_dlc_flower_clothing_preserves_equipped_guid_reference(){
 for (item,key) in [(401804031u32,[0xd87940fa,0x40db97d7,0x939846ab,0xd68541e2]),(1095918548,[0x66a869c3,0x47f650a0,0x9f65d9be,0x3fa962de]),(1716283922,[0x5d831c09,0x456edfc0,0xc94943b6,0x61bb833d]),(1776250358,[0x97f85ae3,0x4e8d255f,0x76cfb1a6,0xb3a80d28]),(1797473773,[0xd05f3a8d,0x43c47fb8,0xd5978795,0xe640c12a])]{
  let mut p=synthetic_payload("3.0.1");p[2]=6;p[3]=0x98;
  p.extend(doc(1,arr(vec![u(4),u(item),u(11),u(3),plain_flower(2)])));
  p.extend(doc(10,arr(vec![u(5),guid([1,2,3,4]),arr(vec![guid(key)]),arr(vec![]),arr(vec![]),guid([1,2,3,4]),vec![0xc3],vec![0xc0]])));
  p.extend(doc(22,arr(vec![u(6),arr(vec![]),arr(vec![]),vec![0xc0],vec![0xc0],arr(vec![])])));
  let mut e=Editor::open(slot_from_payload("3.0.1",p)).unwrap();
  assert!(e.inventory()[0].editable);assert_eq!(e.inventory()[0].quantity_minimum,1);
  assert!(e.inventory_flower_variants(4).is_empty());
  assert!(e.create_inventory_flower_variant(4,[6,2,0,0],[6,8,0,0],1).is_err());
  assert!(e.change_inventory_quantity(4,3,0).is_err());assert!(!e.dirty());
 }
}


#[test]
fn original_dlc_flower_effect_can_be_retained_but_not_granted_or_cloned(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let species=1331175279;
 let make=|effect:u8,accent:u8|{
  let mut p=synthetic_payload("3.0.1");p[2]=6;p[3]=0x97;
  p.extend(doc(1,arr(vec![u(4),u(species),u(11),u(93),arr(vec![vec![7],arr(vec![vec![6],vec![6],vec![effect],vec![accent]])])])));
  p.extend(doc(1,arr(vec![u(5),u(species),u(12),u(2),plain_flower(9)])));
  slot_from_payload("3.0.1",p)
 };
 for effect in [6,15]{
  let other=if effect==6{15}else{6};
  for zipped in [false,true]{
   let raw=make(effect,0);let input=if zipped{zip(&raw)}else{raw};
   let mut e=Editor::open(input.clone()).unwrap();let before=[6,6,i32::from(effect),0];
   let changed=[6,8,i32::from(effect),0];let plain=[6,8,0,0];
   assert!(e.inventory().iter().find(|r|r.document_id==4).unwrap().editable);
   assert!(e.inventory_flower_variants(4).contains(&changed));
   assert!(!e.inventory_flower_variants(4).iter().any(|v|v[2]==other));
   assert!(!e.inventory_flower_variants(5).iter().any(|v|[6,15].contains(&v[2])));
   assert!(!e.inventory_flower_creation_variants(4).iter().any(|v|[6,15].contains(&v[2])));
   assert!(!e.inventory_flower_preview(4,before,changed).unwrap().1);
   assert!(e.create_inventory_flower_variant(4,before,changed,1).is_err());
   assert!(e.change_inventory_flower_variant(4,before,[6,8,other,0]).is_err());
   assert!(e.change_inventory_flower_variant(4,before,[6,8,i32::from(effect),16]).is_err());
   assert!(e.change_inventory_flower_variant(5,[6,9,0,0],[6,9,i32::from(effect),0]).is_err());
   assert!(!e.dirty());
   e.change_inventory_flower_variant(4,before,changed).unwrap();
   e.change_inventory_flower_variant(4,changed,plain).unwrap();
   assert!(e.inventory_flower_variants(4).contains(&changed));
   e.change_inventory_flower_variant(4,plain,changed).unwrap();
   let child=e.create_inventory_flower_variant(4,changed,[6,8,3,0],2).unwrap();
   assert!(e.change_inventory_flower_variant(child,[6,8,3,0],changed).is_err());
   let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
   restored.restore_history(&cp).unwrap();assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
   let mut saved=Editor::open(restored.export().unwrap()).unwrap();
   assert_eq!(saved.inventory_unique_data(4),Some(U::Flower{grow_state:6,base_color:8,pattern:i32::from(effect),pattern_color:0}));
   saved.change_inventory_quantity(4,93,0).unwrap();
   let mut zero=Editor::open(saved.export().unwrap()).unwrap();
   zero.change_inventory_quantity(4,0,3).unwrap();
   assert_eq!(zero.inventory_unique_data(4),saved.inventory_unique_data(4));
   zero.change_inventory_flower_variant(4,changed,plain).unwrap();
   let reopened=Editor::open(zero.export().unwrap()).unwrap();
   assert!(!reopened.inventory_flower_variants(4).iter().any(|v|[6,15].contains(&v[2])));
  }
  let e=Editor::open(make(effect,16)).unwrap();assert!(e.inventory_flower_variants(4).is_empty());
 }
}


#[test]
fn first_item_wand_copies_verified_owned_furniture_without_touching_source(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let item=384749651i32;let source=61381969i32;let candidate=0x80000000|item as u32;
 let witness=[source,0,0,13,2,0];let first=[source,104,125,13,2,0];let second=[source,106,127,13,2,0];
 for zipped in [false,true]{
  let raw=furniture_edit_slot(None);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory()[0].clone();
  let payload=e.inventory_original_unique_payload(4).unwrap().to_vec();
  assert_eq!(original.item_id,source);assert_eq!(e.inventory_owned_furniture_wand_sources(candidate),vec![4]);
  assert!(e.inventory_owned_furniture_wand_pairs(4).contains(&[104,125]));
  assert!(e.inventory_owned_furniture_wand_sources(0x80000000|1304219546).is_empty());
  for bad in [[source,104,125,502,2,0],[source,104,125,0,0,0],[source,999,125,13,2,0],[315822,104,125,13,2,0]]{
   assert!(e.create_inventory_wand_nested(4,witness,bad,1).is_err());assert!(!e.dirty());
  }
  assert!(e.create_inventory_wand_nested(4,[source,0,0,13,3,0],first,1).is_err());
  let h=e.create_inventory_wand_nested(4,witness,first,3).unwrap();
  assert!(!e.inventory_owned_furniture_wand_pairs(4).contains(&[104,125]));
  assert!(e.create_inventory_wand_nested(4,witness,first,1).is_err());
  assert!(e.inventory_wand_source_creation_variants(candidate,source).contains(&[104,125]));
  let h2=e.create_inventory_wand_nested(4,witness,second,4).unwrap();
  assert_eq!(e.inventory()[0],original);
  let cp=e.history_checkpoint().unwrap();let mut recovered=Editor::open(input).unwrap();recovered.restore_history(&cp).unwrap();
  assert_eq!(recovered.inventory(),e.inventory());assert!(recovered.undo_scope(Inventory));assert!(recovered.redo_scope(Inventory));
  let mut saved=Editor::open(recovered.export().unwrap()).unwrap();
  let source_row=saved.inventory().into_iter().find(|r|r.document_id==4).unwrap();
  assert_eq!((source_row.item_id,source_row.quantity),(original.item_id,original.quantity));
  assert_eq!(saved.inventory_original_unique_payload(4),Some(payload.as_slice()));
  // A complete recognized native furniture wand contains an independent
  // copied tuple. It is not an ItemId/UID reference to the bag furniture.
  assert!(source_row.editable&&source_row.quantity_minimum==0);
  let original_wands:Vec<_>=saved.inventory().into_iter().filter(|r|r.item_id==item).map(|r|(r.document_id,saved.inventory_unique_data(r.document_id))).collect();
  saved.change_inventory_furniture_variant(4,[13,2,0],[13,3,0]).unwrap();
  saved.change_inventory_quantity(4,original.quantity,0).unwrap();
  let independently_edited=Editor::open(saved.export().unwrap()).unwrap();
  assert_eq!(independently_edited.inventory().into_iter().find(|r|r.document_id==4).unwrap().quantity,0);
  for (id,expected) in original_wands{assert_eq!(independently_edited.inventory_unique_data(id),expected);}
  saved.change_inventory_quantity(4,0,original.quantity).unwrap();
  assert_eq!(saved.inventory_unique_rows().find(|r|r.0==4).unwrap().1,Some(11));
  for id in [h,h2]{
   let row=e.inventory().into_iter().find(|r|r.document_id==id).unwrap();
   let actual=saved.inventory().into_iter().find(|r|r.item_id==item&&r.quantity==row.quantity).unwrap();
   assert_eq!(saved.inventory_unique_data(actual.document_id),e.inventory_unique_data(id));
   assert!(matches!(saved.inventory_unique_data(actual.document_id),Some(U::WandAppearance{source_item_id:61381969,source_tag:8,source_count:3,..})));
   saved.change_inventory_quantity(actual.document_id,row.quantity,0).unwrap();
  }
  assert!(Editor::open(saved.export().unwrap()).unwrap().inventory().iter().filter(|r|r.item_id==item).all(|r|r.quantity==0));
 }
 let mut e=Editor::open(furniture_edit_slot(None)).unwrap();
 e.change_inventory_furniture_variant(4,[13,2,0],[13,3,0]).unwrap();
 assert!(e.create_inventory_wand_nested(4,witness,first,1).is_err());
 let changed=[source,0,0,13,3,0];let target=[source,104,125,13,3,0];
 e.create_inventory_wand_nested(4,changed,target,1).unwrap();
 let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(furniture_edit_slot(None)).unwrap();restored.restore_history(&cp).unwrap();
 assert_eq!(restored.inventory(),e.inventory());
}


#[test]
fn staged_furniture_is_a_wand_source_without_intermediate_export(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let source=61381969i32;let item=384749651i32;let candidate=0x80000000|item as u32;
 let witness=[source,0,0,13,3,0];let target=[source,104,125,13,3,0];
 for zipped in [false,true]{
  let raw=furniture_edit_slot(None);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  let original=e.inventory()[0].clone();
  let staged=e.create_inventory_furniture_variant(4,[13,2,0],[13,3,0],2).unwrap();
  assert!(e.inventory_owned_furniture_wand_sources(candidate).contains(&staged));
  assert!(e.inventory_owned_furniture_wand_pairs(staged).contains(&[104,125]));
  assert!(e.create_inventory_wand_nested(staged,[source,0,0,13,2,0],target,1).is_err());
  let wand=e.create_inventory_wand_nested(staged,witness,target,3).unwrap();
  assert_eq!(e.inventory()[0],original);
  assert!(matches!(e.inventory_unique_data(wand),Some(U::WandAppearance{source_item_id:61381969,source_tag:8,..})));
  assert!(!e.inventory_owned_furniture_wand_pairs(staged).contains(&[104,125]));
  e.change_inventory_furniture_variant(staged,[13,3,0],[13,4,0]).unwrap();
  assert!(e.create_inventory_wand_nested(staged,witness,[source,105,125,13,3,0],1).is_err());
  e.change_inventory_quantity(staged,2,0).unwrap();
  assert!(!e.inventory_owned_furniture_wand_sources(candidate).contains(&staged));
  assert!(e.inventory_owned_furniture_wand_pairs(staged).is_empty());
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert_eq!(restored.inventory(),e.inventory());
  assert!(restored.undo_scope(Inventory));assert!(restored.inventory_owned_furniture_wand_sources(candidate).contains(&staged));
  assert!(restored.redo_scope(Inventory));assert!(!restored.inventory_owned_furniture_wand_sources(candidate).contains(&staged));
  let saved=Editor::open(restored.export().unwrap()).unwrap();
  let rows=saved.inventory();
  assert_eq!(rows.len(),2);
  let output=rows.iter().find(|r|r.item_id==item).unwrap();assert_eq!(output.quantity,3);
  assert_eq!(saved.inventory_unique_data(output.document_id),e.inventory_unique_data(wand));
  assert_eq!(rows.iter().find(|r|r.item_id==source).unwrap(),&original);
 }
}

#[test]
fn only_complete_verified_bag_furniture_wand_copies_release_source_reference(){
 let item=384749651u32;let source=61381969u32;
 let make=|wand_item:u32,materials:Vec<u8>,style:u32|{
  let mut p=synthetic_payload("3.0.1");p[2]=6;p[3]=0x97;
  p.extend(doc(1,arr(vec![u(4),u(source),u(11),u(93),furniture_payload([13,2,0])])));
  p.extend(doc(1,arr(vec![u(5),u(wand_item),u(12),u(1),arr(vec![vec![9],arr(vec![u(source),materials,u(104),u(125),u(style)])])])));
  slot_from_payload("3.0.1",p)
 };
 let raw=make(item,furniture_payload([13,2,0]),0);
 let mut e=Editor::open(raw).unwrap();
 let copy=e.inventory_original_unique_payload(5).unwrap().to_vec();
 e.change_inventory_furniture_variant(4,[13,2,0],[13,3,0]).unwrap();
 e.change_inventory_quantity(4,93,0).unwrap();
 let mut reopened=Editor::open(e.export().unwrap()).unwrap();
 assert_eq!(reopened.inventory_original_unique_payload(5),Some(copy.as_slice()));
 assert_eq!(reopened.inventory()[0].quantity,0);
 reopened.change_inventory_quantity(4,0,2).unwrap();
 for (id,materials,style) in [(item,vec![0xc0],0),(item,furniture_payload([0,0,0]),0),(item,furniture_payload([285,2,0]),0),(item,furniture_payload([13,2,0]),1),(1304219546,furniture_payload([13,2,0]),0)]{
  let mut e=Editor::open(make(id,materials,style)).unwrap();
  assert!(e.inventory()[0].editable);assert_eq!(e.inventory()[0].quantity_minimum,1);
  assert!(e.change_inventory_quantity(4,93,0).is_err());
  assert!(e.inventory_furniture_creation_variants(4).is_empty());
 }
}


#[test]
fn saved_event_flower_colors_are_editable_per_original_channel_without_new_restricted_rows(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let item=43114910u32;
 let make=|original:[u32;4]|{
  let mut p=synthetic_payload("3.0.1");p[2]=6;p[3]=0x97;
  p.extend(doc(1,arr(vec![u(4),u(item),u(11),u(6),arr(vec![vec![7],arr(original.into_iter().map(u).collect())])])));
  p.extend(doc(1,arr(vec![u(5),u(item),u(12),u(2),plain_flower(9)])));
  slot_from_payload("3.0.1",p)
 };
 for (original,ordinary) in [
  ([6,14,0,0],[6,8,0,0]),
  ([6,15,1,16],[6,8,1,16]),
  ([6,8,1,14],[6,8,1,16]),
  ([6,14,1,15],[6,8,1,16]),
 ]{
  let original:[i32;4]=original;let ordinary:[i32;4]=ordinary;
  for zipped in [false,true]{
   let raw=make(original.map(|v|v as u32));let input=if zipped{zip(&raw)}else{raw};
   let mut e=Editor::open(input.clone()).unwrap();
   assert!(e.inventory().iter().find(|r|r.document_id==4).unwrap().editable);
   assert!(e.inventory_flower_preview(4,original,ordinary).is_ok());
   assert!(e.inventory_flower_creation_variants(4).iter().all(|v|![14,15].contains(&v[1])&&![14,15].contains(&v[3])));
   assert!(e.inventory_flower_variants(5).iter().all(|v|![14,15].contains(&v[1])&&![14,15].contains(&v[3])));
   let mut forbidden=original;forbidden[1]=if original[1]==14{15}else{14};
   assert!(e.change_inventory_flower_variant(4,original,forbidden).is_err());
   assert!(e.change_inventory_flower_variant(5,[6,9,0,0],[6,14,0,0]).is_err());
   e.change_inventory_quantity(4,6,3).unwrap();
   e.change_inventory_flower_variant(4,original,ordinary).unwrap();
   assert!(e.inventory_flower_preview(4,ordinary,original).is_ok());
   assert!(!e.inventory_flower_preview(4,ordinary,original).unwrap().1);
   assert!(e.create_inventory_flower_variant(4,ordinary,original,1).is_err());
   e.change_inventory_flower_variant(4,ordinary,original).unwrap();
   let cp=e.history_checkpoint().unwrap();let mut recovered=Editor::open(input).unwrap();
   recovered.restore_history(&cp).unwrap();assert!(recovered.undo_scope(Inventory));assert!(recovered.redo_scope(Inventory));
   let mut saved=Editor::open(recovered.export().unwrap()).unwrap();
   assert_eq!(saved.inventory_unique_data(4),Some(U::Flower{grow_state:6,base_color:original[1],pattern:original[2],pattern_color:original[3]}));
   saved.change_inventory_quantity(4,3,0).unwrap();
   let mut zero=Editor::open(saved.export().unwrap()).unwrap();
   zero.change_inventory_quantity(4,0,5).unwrap();
   zero.change_inventory_flower_variant(4,original,ordinary).unwrap();
   let reopened=Editor::open(zero.export().unwrap()).unwrap();
   assert!(reopened.inventory_flower_variants(4).iter().all(|v|![14,15].contains(&v[1])&&![14,15].contains(&v[3])));
  }
 }
}


#[test]
fn remaining_owned_ordinary_furniture_can_create_native_custom_variants_without_absent_authority(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let item=102286319u32;let candidate=0x80000000|item;
 let target=[102,0,0];let other=[104,0,0];
 let make=|quantity:u32,peers:Vec<Vec<u8>>,reference:Option<Vec<u8>>|{
  let mut p=synthetic_payload("3.0.1");p[2]=12;p[3]=0x96+peers.len() as u8+u8::from(reference.is_some());
  p.extend(doc(1,arr(vec![u(4),u(item),u(0),u(quantity),vec![0xc0]])));
  for peer in peers{p.extend(peer);}
  if let Some(h)=reference{p.extend(doc(32,arr(vec![u(9),guid([7,0,0,0]),u(0),arr(vec![doc(8,arr(vec![arr(vec![h])]))])])));}
  slot_from_payload("3.0.1",p)
 };
 let custom=|id,uid,materials:[i32;3]|doc(1,arr(vec![u(id),u(item),u(uid),u(2),furniture_payload(materials.map(|v|v as u32))]));
 let home=|wall,legacy:Vec<Vec<u8>>|arr(vec![guid([41,42,43,44]),arr(legacy),u(wall),u(0),guid([0;4]),l(0),
  vec![0xc0],vec![0xc2],vec![0xc0],arr(vec![]),vec![0xc0],vec![0xc0],u(0),u(0),arr(vec![])]);
 let legacy=arr(vec![guid([0xc2961421,0x4fdf4f88,0x988e1cb7,0x7f57b563]),guid([1,2,3,4]),u(0),u(0),u(0),u(0),u(0),u(0),
  vec![0xc0],vec![0xc0],vec![0xc0],u(0),arr(vec![]),arr(vec![]),u(0)]);
 for zipped in [false,true]{
  for with_peer in [false,true]{
   let raw=make(6,if with_peer{vec![custom(5,11,other)]}else{vec![]},None);
   let input=if zipped{zip(&raw)}else{raw};
   let mut e=Editor::open(input.clone()).unwrap();
   assert!(e.inventory_default_furniture_ids().contains(&4));
   assert!(e.inventory_furniture_creation_variants(4).contains(&target));
   assert!(!e.inventory_furniture_creation_variants(4).contains(&[103,0,0]));
   if with_peer{assert!(!e.inventory_furniture_creation_variants(4).contains(&other));}
   assert!(e.inventory_furniture_creation_variants(candidate).is_empty());
   assert!(e.create_inventory_furniture_variant(candidate,[0;3],target,1).is_err());
   assert!(e.create_inventory_furniture_variant(4,[102,0,0],other,1).is_err());
   let id=e.create_inventory_furniture_variant(4,[0;3],target,3).unwrap();
   assert_eq!(e.inventory_unique_data(id),Some(U::Furniture{materials:target}));
   assert!(e.create_inventory_furniture_variant(4,[0;3],target,1).is_err());
   let cp=e.history_checkpoint().unwrap();let mut recovered=Editor::open(input).unwrap();
   recovered.restore_history(&cp).unwrap();assert!(recovered.undo_scope(Inventory));assert!(recovered.redo_scope(Inventory));
   let saved=Editor::open(recovered.export().unwrap()).unwrap();
   assert_eq!(saved.inventory()[0].quantity,6);
   assert_eq!(saved.inventory_original_unique_payload(4),Some([0xc0].as_slice()));
   let row=saved.inventory().into_iter().find(|r|r.quantity==3).unwrap();
   assert_eq!(saved.inventory_unique_data(row.document_id),Some(U::Furniture{materials:target}));
   assert!(saved.inventory_unique_rows().any(|r|r.0==row.document_id&&r.1.is_some_and(|uid|uid>0)));
   if with_peer{assert_eq!(saved.inventory_unique_data(5),Some(U::Furniture{materials:other}));}
  }
 }
 for raw in [
  make(0,vec![],None),
  make(6,vec![],Some(home(item,vec![]))),
  make(6,vec![],Some(home(0,vec![legacy]))),
  make(6,vec![doc(1,arr(vec![u(5),u(item),u(0),u(2),vec![0xc0]]))],None),
  make(6,vec![custom(5,11,[0,0,0])],None),
  make(6,vec![custom(5,11,other),custom(6,12,other)],None),
 ]{
  let mut e=Editor::open(raw).unwrap();
  assert!(!e.inventory_default_furniture_ids().contains(&4));
  assert!(e.create_inventory_furniture_variant(4,[0;3],target,1).is_err());
  assert!(!e.dirty());
 }
 let mut absent=Editor::open(slot("3.0.1")).unwrap();
 assert!(!absent.inventory_absent_furniture_ids().contains(&(item as i32)));
 assert!(absent.create_inventory_furniture_variant(candidate,[0;3],target,1).is_err());
 assert!(absent.change_inventory_quantity(candidate,0,1).is_err());
}



#[test]
fn remaining_custom_furniture_ordinary_base_zero_refill_with_reference_and_peer_guards(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let item=102286319u32;
 let native_guid=[0xc2961421,0x4fdf4f88,0x988e1cb7,0x7f57b563];
 let make=|uid:u32,peers:Vec<Vec<u8>>,reference:Option<Vec<u8>>|{
  let mut p=synthetic_payload("3.0.1");p[2]=12;p[3]=0x96+peers.len() as u8+u8::from(reference.is_some());
  p.extend(doc(1,arr(vec![u(4),u(item),u(uid),u(6),vec![0xc0]])));
  for peer in peers{p.extend(peer);}
  if let Some(h)=reference{p.extend(doc(32,arr(vec![u(9),guid([7,0,0,0]),u(0),arr(vec![doc(8,arr(vec![arr(vec![h])]))])])));}
  slot_from_payload("3.0.1",p)
 };
 let custom=|id,uid,materials|doc(1,arr(vec![u(id),u(item),u(uid),u(2),furniture_payload(materials)]));
 let home=|wall,legacy:Vec<Vec<u8>>|arr(vec![guid([41,42,43,44]),arr(legacy),u(wall),u(0),guid([0;4]),l(0),
  vec![0xc0],vec![0xc2],vec![0xc0],arr(vec![]),vec![0xc0],vec![0xc0],u(0),u(0),arr(vec![])]);
 let legacy=arr(vec![guid(native_guid),guid([1,2,3,4]),u(0),u(0),u(0),u(0),u(0),u(0),
  vec![0xc0],vec![0xc0],vec![0xc0],u(0),arr(vec![]),arr(vec![]),u(0)]);
 for zipped in [false,true]{
  for with_peer in [false,true]{
   let raw=make(0,if with_peer{vec![custom(5,11,[102,0,0])]}else{vec![]},None);
   let input=if zipped{zip(&raw)}else{raw};
   let mut e=Editor::open(input.clone()).unwrap();
   assert_eq!(e.inventory()[0].quantity_minimum,0);
   let peer=e.inventory_original_unique_payload(5).map(|p|p.to_vec());
   e.change_inventory_quantity(4,6,0).unwrap();
   let cp=e.history_checkpoint().unwrap();let mut recovered=Editor::open(input).unwrap();
   recovered.restore_history(&cp).unwrap();assert!(recovered.undo_scope(Inventory));assert!(recovered.redo_scope(Inventory));
   let mut saved=Editor::open(recovered.export().unwrap()).unwrap();
   assert_eq!(saved.inventory()[0].quantity_minimum,0);assert_eq!(saved.inventory()[0].quantity,0);
   assert_eq!(saved.inventory_original_unique_payload(4),Some([0xc0].as_slice()));
   if with_peer{assert_eq!(saved.inventory()[1].quantity,2);assert_eq!(saved.inventory_original_unique_payload(5),peer.as_deref());}
   saved.change_inventory_quantity(4,0,6).unwrap();
   let restored=Editor::open(saved.export().unwrap()).unwrap();
   assert_eq!(restored.inventory()[0].quantity,6);
   assert_eq!(restored.inventory_original_unique_payload(4),Some([0xc0].as_slice()));
   if with_peer{assert_eq!(restored.inventory()[1].quantity,2);assert_eq!(restored.inventory_original_unique_payload(5),peer.as_deref());}
  }
 }
 for h in [home(item,vec![]),home(0,vec![legacy])]{
  let mut e=Editor::open(make(0,vec![],Some(h))).unwrap();
  assert!(e.change_inventory_quantity(4,6,0).is_err());assert!(!e.dirty());
 }
 for (uid,peers) in [
  (11,vec![]),
  (0,vec![doc(1,arr(vec![u(5),u(item),u(0),u(2),vec![0xc0]]))]),
  (0,vec![custom(5,11,[0,0,0])]),
  (0,vec![custom(5,11,[102,0,0]),custom(6,12,[102,0,0])]),
  (0,vec![custom(5,11,[102,0,0]),custom(6,11,[102,0,0])]),
 ]{
  let mut e=Editor::open(make(uid,peers,None)).unwrap();
  assert!(e.change_inventory_quantity(4,6,0).is_err());assert!(!e.dirty());
 }
 assert!(!Editor::open(slot("3.0.1")).unwrap().inventory_creatable().iter().any(|r|r.item_id==item as i32));
}


#[test]
fn legacy_wand_nil_source_payload_quantity_and_refill_preserve_exact_guid_union(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let stick=[0x92872ce0,0x48d378f7,0x78fb30ab,0x3d491cdd];let critter=[0xf5db61cd,0x4d948560,0x5d7b78a1,0x4f2b0984];
 let legacy=|g:[u32;4],style:u32,nested:Vec<u8>|arr(vec![vec![5],arr(vec![guid(g),nested,u(104),u(125),u(style)])]);
 let make=|item:u32,payload:Vec<u8>,peers:Vec<Vec<u8>>|{
  let mut p=synthetic_payload("3.0.1");p[2]=12;p[3]=0x96+peers.len() as u8;
  p.extend(doc(1,arr(vec![u(4),u(item),u(11),u(6),payload])));
  for peer in peers{p.extend(peer);}
  slot_from_payload("3.0.1",p)
 };
 for (item,g,style) in [(39246601,[0;4],120),(384749651,stick,0),(1304219546,critter,0)]{
  let payload=legacy(g,style,vec![0xc0]);
  for zipped in [false,true]{
   let raw=make(item,payload.clone(),vec![]);let input=if zipped{zip(&raw)}else{raw};
   let mut e=Editor::open(input.clone()).unwrap();
   assert!(matches!(e.inventory_unique_data(4),Some(U::WandAppearance{magic:104,fleck:125,source_tag:-1,..})));
   assert_eq!(e.inventory()[0].quantity_minimum,0);
   e.change_inventory_quantity(4,6,0).unwrap();
   let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
   restored.restore_history(&cp).unwrap();assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
   let mut saved=Editor::open(restored.export().unwrap()).unwrap();
   assert_eq!(saved.inventory()[0].quantity,0);assert_eq!(saved.inventory()[0].quantity_minimum,0);
   assert_eq!(saved.inventory_original_unique_payload(4),Some(payload.as_slice()));
   saved.change_inventory_quantity(4,0,9).unwrap();
   let reopened=Editor::open(saved.export().unwrap()).unwrap();
   assert_eq!(reopened.inventory()[0].quantity,9);
   assert_eq!(reopened.inventory_original_unique_payload(4),Some(payload.as_slice()));
  }
 }
 for raw in [
  make(384749651,legacy([0;4],0,vec![0xc0]),vec![]),
  make(384749651,legacy([u32::MAX;4],0,vec![0xc0]),vec![]),
  make(384749651,legacy(stick,120,vec![0xc0]),vec![]),
  make(384749651,legacy(stick,0,furniture_payload([0,2,0])),vec![]),
  make(384749651,legacy(stick,0,vec![0xc0]),vec![doc(1,arr(vec![u(5),u(384749651),u(12),u(2),legacy(stick,0,vec![0xc0])]))]),
 ]{
  let mut e=Editor::open(raw).unwrap();
  assert_quantity_only_roundtrip(&mut e,4,3);
 }
}


#[test]
fn legacy_furniture_guid_quantity_zero_refill_preserves_original_tag_and_payload(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let item=61381969u32;
 let material=[0xd3ce93fd,0x4a105e00,0x3e1e60b9,0x5af6b600];
 let payload=|g:[u32;4]|arr(vec![vec![1],arr(vec![guid([0;4]),guid(g),guid([0;4])])]);
 let make=|g:[u32;4],peers:Vec<Vec<u8>>|{
  let mut p=synthetic_payload("3.0.1");p[2]=12;p[3]=0x96+peers.len() as u8;
  p.extend(doc(1,arr(vec![u(4),u(item),u(11),u(6),payload(g)])));
  for peer in peers{p.extend(peer);}
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make(material,vec![]);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert_eq!(e.inventory_unique_data(4),Some(U::Furniture{materials:[0,2,0]}));
  assert_eq!(e.inventory()[0].quantity_minimum,0);
  assert!(e.inventory_furniture_variants(4).contains(&[0,3,0]));
  let before=e.inventory_original_unique_payload(4).unwrap().to_vec();
  e.change_inventory_quantity(4,6,0).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory()[0].quantity,0);assert_eq!(saved.inventory()[0].quantity_minimum,0);
  assert_eq!(saved.inventory_original_unique_payload(4),Some(before.as_slice()));
  saved.change_inventory_quantity(4,0,9).unwrap();
  let reopened=Editor::open(saved.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory()[0].quantity,9);
  assert_eq!(reopened.inventory_original_unique_payload(4),Some(before.as_slice()));
  assert_eq!(reopened.inventory_unique_data(4),Some(U::Furniture{materials:[0,2,0]}));
 }
 for raw in [
  make([0;4],vec![]),
  make([0xffffffff;4],vec![]),
  make(material,vec![doc(1,arr(vec![u(5),u(item),u(12),u(2),furniture_payload([0,2,0])]))]),
  make(material,vec![doc(1,arr(vec![u(5),u(item),u(12),u(2),payload(material)]))]),
 ]{
  let mut e=Editor::open(raw).unwrap();
  assert_quantity_only_roundtrip(&mut e,4,3);
 }
}


#[test]
fn legacy_furniture_material_cas_retains_guid_union_and_untouched_spans(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let item=61381969u32;
 let material2=[0xd3ce93fd,0x4a105e00,0x3e1e60b9,0x5af6b600];
 let payload=arr(vec![vec![1],arr(vec![guid([0;4]),guid(material2),guid([0;4])])]);
 let mut p=synthetic_payload("3.0.1");p[2]=12;p[3]=0x96;
 p.extend(doc(1,arr(vec![u(4),u(item),u(11),u(6),payload.clone()])));
 let raw=slot_from_payload("3.0.1",p);
 for zipped in [false,true]{
  let input=if zipped{zip(&raw)}else{raw.clone()};
  let mut e=Editor::open(input.clone()).unwrap();
  assert!(e.inventory_furniture_edit_hints().any(|id|id==4));
  assert!(e.inventory_furniture_variants(4).contains(&[0,3,0]));
  assert!(e.inventory_furniture_creation_variants(4).contains(&[0,3,0]));
  assert!(e.change_inventory_furniture_variant(4,[0,2,0],[0,1,0]).is_err());
  assert!(e.change_inventory_furniture_variant(4,[0,3,0],[0,4,0]).is_err());
  assert!(e.change_inventory_furniture_variant(4,[0,2,0],[0,99999,0]).is_err());
  assert!(!e.dirty());
  e.change_inventory_furniture_variant(4,[0,2,0],[0,3,0]).unwrap();
  e.change_inventory_quantity(4,6,5).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();assert!(restored.undo_scope(Inventory));assert!(restored.undo_scope(Inventory));
  assert_eq!(restored.inventory_unique_data(4),Some(U::Furniture{materials:[0,2,0]}));
  assert!(restored.redo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory()[0].quantity,5);
  assert_eq!(saved.inventory_unique_data(4),Some(U::Furniture{materials:[0,3,0]}));
  let exported=saved.inventory_original_unique_payload(4).unwrap();
  assert_eq!(&exported[..3],&payload[..3]);assert_ne!(exported,payload.as_slice());
  saved.change_inventory_furniture_variant(4,[0,3,0],[0,2,0]).unwrap();
  let reopened=Editor::open(saved.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory_unique_data(4),Some(U::Furniture{materials:[0,2,0]}));
  assert_eq!(&reopened.inventory_original_unique_payload(4).unwrap()[..3],&payload[..3]);
 }
}


#[test]
fn nested_furniture_wands_edit_all_four_outer_and_inner_wire_formats(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let item=384749651u32;let source=61381969i32;
 let source_guid=[0x6c8af25a,0x4fc04e89,0x901068ae,0x512dc0c2];
 let material2=[0xd3ce93fd,0x4a105e00,0x3e1e60b9,0x5af6b600];
 let material3=[0xe4335dad,0x4b4cf657,0x4fc9c79f,0xa9c89c6f];
 let legacy_material=|g:[u32;4]|arr(vec![vec![1],arr(vec![guid([0;4]),guid(g),guid([0;4])])]);
 let legacy=|nested:Vec<u8>|arr(vec![vec![5],arr(vec![guid(source_guid),nested,u(104),u(125),u(0)])]);
 let modern=|magic:u32,nested:Vec<u8>|arr(vec![vec![9],arr(vec![u(source as u32),nested,u(magic),u(125),u(0)])]);
 let make=|outer_legacy:bool,nested:Vec<u8>,peer:Vec<u8>|{
  let mut p=synthetic_payload("3.0.1");p[2]=12;p[3]=0x97;
  let first=if outer_legacy{legacy(nested)}else{modern(104,nested)};
  p.extend(doc(1,arr(vec![u(4),u(item),u(11),u(6),first])));
  p.extend(doc(1,arr(vec![u(5),u(item),u(12),u(2),peer])));
  slot_from_payload("3.0.1",p)
 };
 for outer_legacy in [false,true]{
 for historical in [false,true]{
  let nested=if historical{legacy_material(material2)}else{furniture_payload([0,2,0])};
  let expected_nested=if historical{legacy_material(material3)}else{furniture_payload([0,3,0])};
  let peer=modern(105,furniture_payload([0,2,0]));
  for zipped in [false,true]{
   let raw=make(outer_legacy,nested.clone(),peer.clone());let input=if zipped{zip(&raw)}else{raw};
   let mut e=Editor::open(input.clone()).unwrap();
   let before=[source,104,125,0,2,0];let after=[source,104,125,0,3,0];
   assert!(e.inventory().iter().all(|r|r.editable&&r.quantity_minimum==0));
   assert!(matches!(e.inventory_unique_data(4),Some(U::WandAppearance{source_item_id:61381969,source_tag:8,..})));
   assert!(e.inventory_wand_nested_material_variants(4).contains(&[0,3,0]));
   assert!(e.change_inventory_wand_nested(4,before,[source,105,125,0,2,0]).is_err());
   assert!(e.change_inventory_wand_nested(4,before,[source,104,125,0,285,0]).is_err());
   assert!(!e.dirty());
   e.change_inventory_wand_nested(4,before,after).unwrap();
   let added=e.create_inventory_wand_nested(4,after,[source,106,125,0,3,0],4).unwrap();
   assert!(matches!(e.inventory_unique_data(added),Some(U::WandAppearance{magic:106,source_tag:8,..})));
   e.change_inventory_quantity(4,6,0).unwrap();
   let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
   restored.restore_history(&cp).unwrap();assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
   let mut saved=Editor::open(restored.export().unwrap()).unwrap();
   let exported=saved.inventory_original_unique_payload(4).unwrap();
   let original=if outer_legacy{legacy(nested.clone())}else{modern(104,nested.clone())};
   assert_eq!(&exported[..3],&original[..3]);
   // Changed material tokens may use a different integer width; compare decoded
   // identity and retain the original nested union header, source and style.
   assert!(exported.windows(3).any(|w|w==&expected_nested[..3]));
   assert_eq!(saved.inventory_original_unique_payload(5),Some(peer.as_slice()));
   assert_eq!(saved.inventory_unique_data(4),e.inventory_unique_data(4));
   assert!(saved.inventory().iter().all(|r|r.editable&&r.quantity_minimum==0));
   saved.change_inventory_quantity(4,0,6).unwrap();
   assert!(Editor::open(saved.export().unwrap()).unwrap().inventory().iter().any(|r|r.quantity==4));
  }
  let mut duplicate=Editor::open(make(outer_legacy,nested.clone(),modern(104,furniture_payload([0,2,0])))).unwrap();
  assert!(duplicate.inventory().iter().all(|r|r.editable));
  assert_quantity_only_roundtrip(&mut duplicate,4,3);
 }
 let invalid=legacy_material([u32::MAX;4]);
 let mut rejected=Editor::open(make(outer_legacy,invalid,modern(105,furniture_payload([0,2,0])))).unwrap();
 assert_quantity_only_roundtrip(&mut rejected,4,3);
 }
}

#[test]
fn existing_generic_legacy_wands_use_the_same_source_zero_style_zero_contract(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let item=1020402601u32;let candidate=(1u32<<31)|item;
 let legacy=|source:[u32;4],magic:u32,style:u32|arr(vec![vec![5],arr(vec![guid(source),vec![0xc0],u(magic),u(125),u(style)])]);
 let modern=|magic:u32|arr(vec![vec![9],arr(vec![u(0),vec![0xc0],u(magic),u(125),u(0)])]);
 let make=|first:Vec<u8>,peer:Vec<u8>|{
  let mut p=synthetic_payload("3.0.1");p[2]=12;p[3]=0x97;
  p.extend(doc(1,arr(vec![u(4),u(item),u(11),u(6),first])));
  p.extend(doc(1,arr(vec![u(5),u(item),u(12),u(2),peer])));
  slot_from_payload("3.0.1",p)
 };
 let original=legacy([0;4],104,0);let peer=modern(105);
 for zipped in [false,true]{
  let raw=make(original.clone(),peer.clone());let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert!(e.inventory().iter().all(|r|r.editable&&r.quantity_minimum==0));
  assert!(!e.inventory_absent_wand_ids().iter().any(|&(id,_)|id==item as i32));
  assert!(e.inventory_wand_creation_variants(candidate).is_empty());
  assert!(e.inventory_wand_edit_sources(4).is_empty());
  assert!(e.change_inventory_wand_variant(4,[104,125],[105,125]).is_err());
  e.change_inventory_wand_variant(4,[104,125],[106,126]).unwrap();
  let added=e.create_inventory_wand_variant(4,[106,126],[107,127],3).unwrap();
  e.change_inventory_quantities(&[(4,6,0),(5,2,0)]).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();
  assert!(matches!(saved.inventory_unique_data(4),Some(U::WandAppearance{source_item_id:0,style:0,magic:106,fleck:126,..})));
  assert_eq!(&saved.inventory_original_unique_payload(4).unwrap()[..3],&original[..3]);
  assert_eq!(saved.inventory_original_unique_payload(5),Some(peer.as_slice()));
  let row=saved.inventory().into_iter().find(|r|r.quantity==3).unwrap();
  assert_eq!(saved.inventory_unique_data(row.document_id),e.inventory_unique_data(added));
  saved.change_inventory_quantity(4,0,6).unwrap();
  assert_eq!(Editor::open(saved.export().unwrap()).unwrap().inventory()[0].quantity,6);
 }
 for first in [legacy([0;4],105,0),legacy([0;4],104,118),legacy([1,2,3,4],104,0),legacy([0;4],132,0)]{
  let mut rejected=Editor::open(make(first,peer.clone())).unwrap();
  assert_quantity_only_roundtrip(&mut rejected,4,3);
  assert!(!rejected.dirty());
 }
}

#[test]
fn mixed_legacy_and_current_wands_share_identity_and_keep_native_wire_tags(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let item=384749651u32;let source=1185152302u32;
 let stick=[0x92872ce0,0x48d378f7,0x78fb30ab,0x3d491cdd];
 let legacy=|magic:u32|arr(vec![vec![5],arr(vec![guid(stick),vec![0xc0],u(magic),u(125),u(0)])]);
 let modern=|magic:u32|arr(vec![vec![9],arr(vec![u(source),vec![0xc0],u(magic),u(125),u(0)])]);
 let make=|peer:Vec<u8>|{
  let mut p=synthetic_payload("3.0.1");p[2]=12;p[3]=0x98;
  p.extend(doc(1,arr(vec![u(4),u(item),u(11),u(6),legacy(104)])));
  p.extend(doc(1,arr(vec![u(5),u(item),u(12),u(2),peer])));
  p.extend(doc(1,arr(vec![u(6),u(item),u(13),u(3),legacy(106)])));
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make(modern(105));let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert!(e.inventory().iter().all(|r|r.editable&&r.quantity_minimum==0));
  assert!(!e.inventory_wand_variants(4).contains(&[105,125]));
  assert!(!e.inventory_wand_creation_variants(4).contains(&[106,125]));
  assert!(e.change_inventory_wand_variant(4,[104,125],[105,125]).is_err());
  e.change_inventory_wand_variant(4,[104,125],[107,125]).unwrap();
  let added=e.create_inventory_wand_variant(4,[107,125],[108,125],5).unwrap();
  assert!(matches!(e.inventory_unique_data(added),Some(U::WandAppearance{magic:108,source_tag:-1,..})));
  assert!(e.create_inventory_wand_variant(5,[105,125],[104,125],1).is_err());
  e.change_inventory_quantities(&[(4,6,0),(5,2,0),(6,3,0)]).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory_original_unique_payload(5),Some(modern(105).as_slice()));
  assert_eq!(saved.inventory_original_unique_payload(6),Some(legacy(106).as_slice()));
  assert_eq!(&saved.inventory_original_unique_payload(4).unwrap()[..3],&legacy(104)[..3]);
  assert!(matches!(saved.inventory_unique_data(4),Some(U::WandAppearance{magic:107,..})));
  assert!(saved.inventory().iter().all(|r|r.editable&&r.quantity_minimum==0));
  saved.change_inventory_quantities(&[(4,0,6),(5,0,2),(6,0,3)]).unwrap();
  assert!(Editor::open(saved.export().unwrap()).unwrap().inventory().iter().any(|r|r.quantity==5));
 }
 for peer in [modern(104),legacy(104)]{
  let mut e=Editor::open(make(peer)).unwrap();
  assert!(e.inventory().iter().all(|r|r.editable));
  assert_quantity_only_roundtrip(&mut e,4,3);
 }
}

#[test]
fn legacy_wand_guid_and_pair_edit_cas_preserves_tag5_and_other_fields(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let stick=[0x92872ce0,0x48d378f7,0x78fb30ab,0x3d491cdd];
 let payload=arr(vec![vec![5],arr(vec![guid(stick),vec![0xc0],u(104),u(125),u(0)])]);
 let mut p=synthetic_payload("3.0.1");p[2]=12;p[3]=0x96;
 p.extend(doc(1,arr(vec![u(4),u(384749651),u(11),u(6),payload.clone()])));
 let raw=slot_from_payload("3.0.1",p);
 for zipped in [false,true]{
  let input=if zipped{zip(&raw)}else{raw.clone()};
  let mut e=Editor::open(input.clone()).unwrap();
  let original=1185152302;
  let replacement=315822;
  assert!(e.inventory_wand_edit_hints().any(|id|id==4));
  assert!(e.inventory_wand_variants(4).contains(&[105,126]));
  assert!(e.inventory_wand_edit_sources(4).contains(&replacement));
  assert!(e.inventory_wand_creation_variants(4).contains(&[105,126]));
  assert!(e.create_inventory_wand_variant(4,[104,125],[104,125],1).is_err());
  assert!(e.change_inventory_wand_identity(4,[original,104,125],[0,105,126]).is_err());
  assert!(e.change_inventory_wand_identity(4,[original,104,125],[replacement,999,126]).is_err());
  assert!(e.change_inventory_wand_identity(4,[original,105,125],[replacement,105,126]).is_err());
  assert!(!e.dirty());
  e.change_inventory_wand_variant(4,[104,125],[105,126]).unwrap();
  e.change_inventory_wand_identity(4,[original,105,126],[replacement,106,127]).unwrap();
  e.change_inventory_quantity(4,6,4).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();
  for _ in 0..3{assert!(restored.undo_scope(Inventory));}
  assert_eq!(restored.inventory_unique_data(4),e.inventory_unique_data(4).map(|_|U::WandAppearance{source_item_id:original,magic:104,fleck:125,style:0,source_tag:-1,source_count:0,source_words:[0;12]}));
  for _ in 0..3{assert!(restored.redo_scope(Inventory));}
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory()[0].quantity,4);
  assert!(matches!(saved.inventory_unique_data(4),Some(U::WandAppearance{source_item_id:315822,magic:106,fleck:127,style:0,source_tag:-1,..})));
  let exported=saved.inventory_original_unique_payload(4).unwrap();
  assert_eq!(&exported[..3],&payload[..3]);assert_ne!(exported,payload.as_slice());
  saved.change_inventory_wand_identity(4,[replacement,106,127],[original,104,125]).unwrap();
  let reopened=Editor::open(saved.export().unwrap()).unwrap();
  assert!(matches!(reopened.inventory_unique_data(4),Some(U::WandAppearance{source_item_id:1185152302,magic:104,fleck:125,source_tag:-1,..})));
 }
}


#[test]
fn legacy_flower_guid_quantity_and_appearance_preserve_tag2(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let coral=[0x43687091,0x4d69b05b,0x475ed195,0xaec32728];
 let red=[0x2aae4095,0xe54cbe9d,0xe64129a2,0xf14c84e7];
 let legacy=|g:[u32;4]|arr(vec![vec![2],arr(vec![u(6),guid(g),guid([0;4]),guid([0;4])])]);
 let make=|g:[u32;4],peer:bool|{
  let mut p=synthetic_payload("3.0.1");p[2]=12;p[3]=if peer{0x97}else{0x96};
  p.extend(doc(1,arr(vec![u(4),u(43114910),u(11),u(6),legacy(g)])));
  if peer{p.extend(doc(1,arr(vec![u(5),u(43114910),u(12),u(2),plain_flower(2)])));}
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make(coral,false);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert_eq!(e.inventory()[0].quantity_minimum,0);
  assert_eq!(e.inventory_unique_data(4),Some(U::Flower{grow_state:6,base_color:2,pattern:0,pattern_color:0}));
  assert!(e.inventory_flower_variants(4).contains(&[6,1,0,0]));
  assert!(e.inventory_flower_creation_variants(4).contains(&[6,1,0,0]));
  assert!(e.create_inventory_flower_variant(4,[6,2,0,0],[6,2,0,0],1).is_err());
  assert!(e.change_inventory_flower_variant(4,[6,2,0,0],[6,14,0,0]).is_err());
  e.change_inventory_flower_variant(4,[6,2,0,0],[6,1,0,0]).unwrap();
  e.change_inventory_quantity(4,6,0).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();assert!(restored.undo_scope(Inventory));assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory()[0].quantity,0);assert_eq!(saved.inventory()[0].quantity_minimum,0);
  assert_eq!(saved.inventory_unique_data(4),Some(U::Flower{grow_state:6,base_color:1,pattern:0,pattern_color:0}));
  assert_eq!(&saved.inventory_original_unique_payload(4).unwrap()[..3],&legacy(red)[..3]);
  saved.change_inventory_quantity(4,0,8).unwrap();
  saved.change_inventory_flower_variant(4,[6,1,0,0],[6,2,10,16]).unwrap();
  let reopened=Editor::open(saved.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory()[0].quantity,8);
  assert_eq!(reopened.inventory_unique_data(4),Some(U::Flower{grow_state:6,base_color:2,pattern:10,pattern_color:16}));
  assert_eq!(&reopened.inventory_original_unique_payload(4).unwrap()[..3],&legacy(coral)[..3]);
 }
 for raw in [make([u32::MAX;4],false),make(coral,true)]{
  let mut e=Editor::open(raw).unwrap();assert_quantity_only_roundtrip(&mut e,4,3);
 }
}


#[test]
fn legacy_and_modern_flower_peers_allow_distinct_new_variants_and_reserve_both_formats(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let coral=[0x43687091,0x4d69b05b,0x475ed195,0xaec32728];
 let legacy=arr(vec![vec![2],arr(vec![u(6),guid(coral),guid([0;4]),guid([0;4])])]);
 let mut p=synthetic_payload("3.0.1");p[2]=12;p[3]=0x97;
 p.extend(doc(1,arr(vec![u(4),u(43114910),u(11),u(6),legacy.clone()])));
 p.extend(doc(1,arr(vec![u(5),u(43114910),u(12),u(2),plain_flower(9)])));
 let raw=slot_from_payload("3.0.1",p);
 for zipped in [false,true]{
  let input=if zipped{zip(&raw)}else{raw.clone()};
  let mut e=Editor::open(input.clone()).unwrap();
  assert!(e.inventory().iter().all(|r|r.editable&&r.quantity_minimum==0));
  assert!(e.inventory_flower_creation_variants(4).contains(&[6,1,0,0]));
  assert!(!e.inventory_flower_creation_variants(4).contains(&[6,9,0,0]));
  assert!(e.change_inventory_flower_variant(4,[6,2,0,0],[6,9,0,0]).is_err());
  assert!(e.change_inventory_flower_variant(5,[6,9,0,0],[6,2,0,0]).is_err());
  assert!(e.create_inventory_flower_variant(4,[6,2,0,0],[6,9,0,0],1).is_err());
  assert!(!e.dirty());
  let handle=e.create_inventory_flower_variant(4,[6,2,0,0],[6,1,0,0],3).unwrap();
  assert!(e.change_inventory_flower_variant(5,[6,9,0,0],[6,1,0,0]).is_err());
  e.change_inventory_flower_variant(4,[6,2,0,0],[6,3,0,0]).unwrap();
  assert!(e.change_inventory_flower_variant(5,[6,9,0,0],[6,2,0,0]).is_err());
  e.change_inventory_quantity(4,6,0).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();
  for _ in 0..3{assert!(restored.undo_scope(Inventory));}
  for _ in 0..3{assert!(restored.redo_scope(Inventory));}
  assert_eq!(restored.inventory_unique_data(handle),Some(U::Flower{grow_state:6,base_color:1,pattern:0,pattern_color:0}));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory().len(),3);assert!(saved.inventory().iter().all(|r|r.editable&&r.quantity_minimum==0));
  assert_eq!(&saved.inventory_original_unique_payload(4).unwrap()[..3],&legacy[..3]);
  assert_eq!(saved.inventory_original_unique_payload(5),Some(plain_flower(9).as_slice()));
  let new=saved.inventory().iter().find(|r|r.document_id!=4&&r.document_id!=5).unwrap().document_id;
  assert_eq!(saved.inventory_unique_data(new),Some(U::Flower{grow_state:6,base_color:1,pattern:0,pattern_color:0}));
  saved.change_inventory_quantity(4,0,4).unwrap();
  assert!(Editor::open(saved.export().unwrap()).is_ok());
 }
}


#[test]
fn mixed_legacy_modern_and_nil_furniture_create_distinct_current_variant(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let item=61381969u32;
 let material2=[0xd3ce93fd,0x4a105e00,0x3e1e60b9,0x5af6b600];
 let payload=arr(vec![vec![1],arr(vec![guid([0;4]),guid(material2),guid([0;4])])]);
 let mut p=synthetic_payload("3.0.1");p[2]=12;p[3]=0x98;
 p.extend(doc(1,arr(vec![u(4),u(item),u(11),u(6),payload.clone()])));
 p.extend(doc(1,arr(vec![u(5),u(item),u(12),u(2),furniture_payload([0,3,0])])));
 p.extend(doc(1,arr(vec![u(6),u(item),u(0),u(1),vec![0xc0]])));
 let raw=slot_from_payload("3.0.1",p);
 for zipped in [false,true]{
  let input=if zipped{zip(&raw)}else{raw.clone()};
  let mut e=Editor::open(input.clone()).unwrap();
  assert!(e.inventory().iter().all(|r|r.editable&&r.quantity_minimum==0));
  assert!(e.inventory_furniture_creation_variants(4).contains(&[0,4,0]));
  assert!(!e.inventory_furniture_creation_variants(4).contains(&[0,3,0]));
  assert!(e.create_inventory_furniture_variant(4,[0,2,0],[0,3,0],1).is_err());
  assert!(e.change_inventory_furniture_variant(5,[0,3,0],[0,2,0]).is_err());
  assert!(!e.dirty());
  let handle=e.create_inventory_furniture_variant(4,[0,2,0],[0,4,0],3).unwrap();
  assert!(e.change_inventory_furniture_variant(5,[0,3,0],[0,4,0]).is_err());
  e.change_inventory_quantity(4,6,0).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();
  for _ in 0..2{assert!(restored.undo_scope(Inventory));}
  for _ in 0..2{assert!(restored.redo_scope(Inventory));}
  assert_eq!(restored.inventory_unique_data(handle),Some(U::Furniture{materials:[0,4,0]}));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory().len(),4);
  assert_eq!(saved.inventory_original_unique_payload(4),Some(payload.as_slice()));
  assert_eq!(saved.inventory_original_unique_payload(5),Some(furniture_payload([0,3,0]).as_slice()));
  assert_eq!(saved.inventory_original_unique_payload(6),Some([0xc0].as_slice()));
  let new=saved.inventory().iter().find(|r|r.document_id!=4&&r.document_id!=5&&r.document_id!=6).unwrap().document_id;
  assert_eq!(saved.inventory_unique_data(new),Some(U::Furniture{materials:[0,4,0]}));
  saved.change_inventory_quantity(4,0,4).unwrap();
  assert!(Editor::open(saved.export().unwrap()).is_ok());
 }
}

#[test]
fn definition_driven_bag_operations_cross_category_and_ownership_boundaries(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let ids=[4881112u32,7285157,2773515,12679893];
 let make=|equipped:bool|{
  let mut p=synthetic_payload("3.0.1");p[2]=9;p[3]=0x9b;
  for (i,item) in ids.into_iter().enumerate(){p.extend(doc(1,arr(vec![u(i as u32+4),u(item),u(0),u(6),vec![0xc0]])));}
  let outfits=if equipped{vec![guid([0x12057e64,0x4baaf70f,0x6f2ac58f,0x57c73148])]}else{vec![]};
  p.extend(doc(10,arr(vec![u(8),guid([1,2,3,4]),arr(vec![]),arr(vec![]),arr(outfits),guid([1,2,3,4]),vec![0xc3],vec![0xc0]])));
  p.extend(doc(22,arr(vec![u(9),arr(vec![]),arr(vec![]),vec![0xc0],vec![0xc0],arr(vec![])])));
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make(false);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let before=e.inventory();
  assert!(before.iter().all(|r|r.editable&&r.quantity_minimum==0));
  for item in ids{assert!(!e.inventory_creatable().iter().any(|r|r.item_id==item as i32))}
  let a=(1u32<<31)|216433;let b=(1u32<<31)|15761463;
  assert!(e.inventory_creatable().iter().any(|r|r.document_id==a));
  e.change_inventory_quantities(&[(4,6,0),(5,6,0),(6,6,0),(7,6,0),(a,0,3),(b,0,4)]).unwrap();
  assert_eq!(e.history().len(),1);let cp=e.history_checkpoint().unwrap();
  let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),before);assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory().len(),6);
  assert!(saved.inventory()[..4].iter().all(|r|r.quantity==0&&r.quantity_minimum==0));
  assert!(saved.inventory().iter().all(|r|saved.inventory_original_unique_payload(r.document_id)==Some([0xc0].as_slice())));
  saved.change_inventory_quantities(&[(4,0,5),(5,0,7),(6,0,2),(7,0,3)]).unwrap();
  let reopened=Editor::open(saved.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory()[..4].iter().map(|r|r.quantity).collect::<Vec<_>>(),vec![5,7,2,3]);
  assert_eq!(reopened.entries(),e.entries());assert_eq!(reopened.achievements(),e.achievements());
 }
 let mut e=Editor::open(make(true)).unwrap();assert_eq!(e.inventory()[2].quantity_minimum,1);
 assert!(e.change_inventory_quantities(&[(4,6,0),(6,6,0)]).is_err());assert!(!e.dirty());
 let mut empty=Editor::open(slot("3.0.1")).unwrap();
 for item in ids{assert!(empty.change_inventory_quantity((1u32<<31)|item,0,1).is_err())}
}

#[test]
fn ordinary_cosmetic_quest_rarity_and_capped_effect_items_share_native_bag_rules(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let outfit=2742209u32;let station=31896958u32;
 let restricted=1144225647u32;let reset=1093982586u32;let quest_food=1455056332u32;
 let make=|referenced:bool|{
  let mut p=synthetic_payload("3.0.1");p[2]=9;p[3]=0x9b;
  for (i,item,qty) in [(4,outfit,3),(5,station,3),(6,restricted,2),(7,quest_food,2)]{
   p.extend(doc(1,arr(vec![u(i),u(item),u(0),u(qty),vec![0xc0]])));
  }
  p.extend(doc(10,arr(vec![u(8),guid([1,2,3,4]),arr(vec![]),arr(vec![]),arr(vec![]),guid([1,2,3,4]),vec![0xc3],vec![0xc0]])));
  let mermaid=if referenced{vec![arr(vec![u(0),guid([0x30b3df0f,0x4ed4c26a,0x70121d87,0x047e87f8]),vec![0xc0]])]}else{vec![]};
  p.extend(doc(22,arr(vec![u(9),arr(mermaid),arr(vec![]),vec![0xc0],vec![0xc0],arr(vec![])])));
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make(false);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let before=e.inventory();
  assert_eq!(before.iter().map(|r|r.quantity_minimum).collect::<Vec<_>>(),vec![0,0,0,0]);
  assert_eq!(before[2].quantity_limit,Some(10));
  let candidate=e.inventory_creatable().into_iter().find(|r|r.item_id==reset as i32).unwrap();
  assert_eq!(candidate.quantity_limit,Some(3));
  assert!(e.change_inventory_quantities(&[(4,3,0),(candidate.document_id,0,4)]).is_err());assert!(!e.dirty());
  e.change_inventory_quantities(&[(4,3,0),(5,3,0),(6,2,0),(candidate.document_id,0,3)]).unwrap();
  assert!(e.change_inventory_quantity(candidate.document_id,3,4).is_err());
  assert_eq!(e.inventory().iter().find(|r|r.document_id==candidate.document_id).unwrap().quantity_limit,Some(3));
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),before);assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory()[..3].iter().map(|r|r.quantity).collect::<Vec<_>>(),vec![0,0,0]);
  assert_eq!(saved.inventory()[3],before[3]);
  assert_eq!(saved.inventory().last().unwrap().quantity_limit,Some(3));
  saved.change_inventory_quantities(&[(4,0,2),(5,0,2),(6,0,10)]).unwrap();
  let reopened=Editor::open(saved.export().unwrap()).unwrap();
  assert_eq!(reopened.inventory()[..3].iter().map(|r|r.quantity).collect::<Vec<_>>(),vec![2,2,10]);
  assert_eq!(reopened.entries(),e.entries());assert_eq!(reopened.achievements(),e.achievements());
 }
 let mut e=Editor::open(make(true)).unwrap();
 assert_eq!(e.inventory()[0].quantity_minimum,1);
 assert!(e.change_inventory_quantity(4,3,0).is_err());assert!(!e.dirty());
 let mut empty=Editor::open(slot("3.0.1")).unwrap();
 for item in [restricted,1610049001]{
  assert!(empty.change_inventory_quantity((1u32<<31)|item,0,1).is_err())
 }
 // New unrestricted cosmetic rows follow the same common membership path.
 empty.change_inventory_quantities(&[((1u32<<31)|outfit,0,2),((1u32<<31)|station,0,3)]).unwrap();
 let reopened=Editor::open(empty.export().unwrap()).unwrap();
 assert_eq!(reopened.inventory().len(),2);
 assert!(reopened.inventory().iter().any(|r|r.item_id==outfit as i32&&r.quantity==2));
 assert!(reopened.inventory().iter().any(|r|r.item_id==station as i32&&r.quantity==3));
}

#[test]
fn distributable_native_stack_classes_edit_and_create_atomically(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let ids=[484139114u32,1455056332,22088469,197197205,8914355];
 let mut p=synthetic_payload("3.0.1");p[2]=10;p[3]=0x9c;
 for (i,id) in ids.into_iter().enumerate(){p.extend(doc(1,arr(vec![u(i as u32+4),u(id),u(0),u(5),vec![0xc0]])));}
 p.extend(doc(10,arr(vec![u(9),guid([1,2,3,4]),arr(vec![]),arr(vec![]),arr(vec![]),guid([1,2,3,4]),vec![0xc3],vec![0xc0]])));
 p.extend(doc(22,arr(vec![u(10),arr(vec![]),arr(vec![]),vec![0xc0],vec![0xc0],arr(vec![])])));
 let raw=slot_from_payload("3.0.1",p);
 for zipped in [false,true]{
  let input=if zipped{zip(&raw)}else{raw.clone()};let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
  assert!(original.iter().all(|r|r.editable&&r.quantity_minimum==0));
  let deltas:Vec<_>=(4..9).map(|id|(id,5,0)).collect();e.change_inventory_quantities(&deltas).unwrap();
  assert_eq!(e.history().len(),1);let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),original);assert!(restored.redo_scope(Inventory));
  let mut reopened=Editor::open(restored.export().unwrap()).unwrap();assert!(reopened.inventory().iter().all(|r|r.quantity==0&&r.editable));
  let refill:Vec<_>=(4..9).map(|id|(id,0,8)).collect();reopened.change_inventory_quantities(&refill).unwrap();
  let saved=Editor::open(reopened.export().unwrap()).unwrap();assert!(saved.inventory().iter().all(|r|r.quantity==8));
  assert_eq!(saved.entries(),e.entries());assert_eq!(saved.achievements(),e.achievements());
 }
 let mut empty=Editor::open(slot("3.0.1")).unwrap();for id in ids{empty.change_inventory_quantity((1u32<<31)|id,0,1).unwrap();}
 assert_eq!(Editor::open(empty.export().unwrap()).unwrap().inventory().len(),ids.len());
}

#[test]
fn saved_restricted_furniture_material_is_a_row_local_witness_not_an_unlock(){
 use hkia_save_core::{collection::HistoryScope::Inventory,native::InventoryUniqueData as U};
 let item=77485988u32;let make=|value:u32,peer:bool|{
  let mut p=synthetic_payload("3.0.1");p[3]=if peer{0x97}else{0x96};p[2]=if peer{6}else{5};
  p.extend(doc(1,arr(vec![u(4),u(item),u(11),u(1),furniture_payload([value,0,0])])));
  if peer{p.extend(doc(1,arr(vec![u(5),u(item),u(0),u(1),vec![0xc0]])));}
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make(287,false);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let before=[287,0,0];let next=[286,0,0];
  assert_eq!(e.inventory_unique_data(4),Some(U::Furniture{materials:before}));
  assert!(e.inventory_furniture_variants(4).contains(&next));
  for bad in [[288,0,0],[289,0,0],[287,287,0]]{assert!(e.change_inventory_furniture_variant(4,before,bad).is_err());}
  assert!(e.create_inventory_furniture_variant(4,before,[288,0,0],1).is_err());assert!(!e.dirty());
  e.change_inventory_furniture_variant(4,before,next).unwrap();
  assert!(e.inventory_furniture_variants(4).contains(&before));
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory_unique_data(4),Some(U::Furniture{materials:before}));
  assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory_unique_data(4),Some(U::Furniture{materials:next}));
  assert!(saved.change_inventory_furniture_variant(4,next,before).is_err());
  assert_eq!(saved.entries(),e.entries());assert_eq!(saved.achievements(),e.achievements());
 }
 let mut collision=Editor::open(make(287,true)).unwrap();
 assert!(collision.change_inventory_furniture_variant(4,[287,0,0],[286,0,0]).is_err());assert!(!collision.dirty());
}

#[test]
fn exact_legacy_copy_reference_protects_only_its_native_item(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let cafe=arr(vec![vec![3],arr(vec![arr(vec![u(44),u(49),u(48)]),arr(vec![u(6),u(46),u(9)])])]);
 let other=cafe.clone();
 let make=|g:[u32;4]|{
  let mut p=synthetic_payload("3.0.1");p[2]=10;p[3]=0x99;
  let copied=arr(vec![vec![5],arr(vec![guid(g),cafe.clone(),u(104),u(125),u(0)])]);
  for (id,item,uid,payload) in [(4,1338995084,21,cafe.clone()),(5,203331651,22,other.clone()),(6,71754032,0,vec![0xc0]),(7,384749651,23,copied)]{
   p.extend(doc(1,arr(vec![u(id),u(item),u(uid),u(2),payload])));
  }
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make([0xd1bdb50,0x4b608a09,0x370054af,0x6c3eb0fb]);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
  assert!(original[0].editable&&original[0].quantity_minimum==1);
  assert!(original[1].editable&&original[1].quantity_minimum==0);
  assert!(original[2].editable&&original[2].quantity_minimum==0);
  assert!(e.change_inventory_quantity(4,2,0).is_err());
  e.change_inventory_quantities(&[(5,2,0),(6,2,0)]).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),original);assert!(restored.redo_scope(Inventory));
  let saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory()[0].quantity,2);assert_eq!(saved.inventory()[1].quantity,0);assert_eq!(saved.inventory()[2].quantity,0);
  assert_eq!(saved.inventory_original_unique_payload(4),Some(cafe.as_slice()));
  assert_eq!(saved.inventory_original_unique_payload(5),Some(other.as_slice()));
 }
 for zipped in [false,true]{
  let raw=make([u32::MAX;4]);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
  assert!(original[1].editable&&original[1].quantity_minimum==1);
  assert_eq!(original[2].quantity_minimum,0);assert!(e.inventory_entry_removable(6));
  assert!(!e.inventory_entry_removable(5));assert!(e.change_inventory_quantity(5,2,0).is_err());
  assert!(e.inventory_creatable().is_empty());
  e.change_inventory_quantity(6,2,0).unwrap();e.remove_inventory_entries(&[(6,0)]).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut recovered=Editor::open(input).unwrap();recovered.restore_history(&cp).unwrap();
  assert!(recovered.undo_scope(Inventory));assert!(recovered.undo_scope(Inventory));assert_eq!(recovered.inventory(),original);
  assert!(recovered.redo_scope(Inventory));assert!(recovered.redo_scope(Inventory));
  let saved=Editor::open(recovered.export().unwrap()).unwrap();assert_eq!(saved.inventory().len(),3);
  for id in [4,5,7]{assert_eq!(saved.inventory_original_unique_payload(id),e.inventory_original_unique_payload(id));}
  let raw=make([0;4]);let mut blocked=Editor::open(if zipped{zip(&raw)}else{raw}).unwrap();
  assert_eq!(blocked.inventory()[2].quantity_minimum,1);assert!(blocked.remove_inventory_entries(&[(6,2)]).is_err());assert!(!blocked.dirty());
 }
}

#[test]
fn large_critter_wand_family_preserves_distinct_native_source_and_pair_keys(){
 let item=1304219546u32;
 let sources=[7285157,79024873,112622136,702286800,711665739,767798085,897162761,1112156413,1327542038,2011076305];
 let mut variants=Vec::new();for source in sources{for magic in 104..=115{for fleck in 125..=127{variants.push((source,magic,fleck));}}}
 for zipped in [false,true]{
  let base=synthetic_payload("3.0.1");let mut p=vec![0x93,0];p.extend(u(300));p.push(0xdc);p.extend(262u16.to_be_bytes());p.extend(&base[4..]);
  for (i,&(source,magic,fleck)) in variants[..257].iter().enumerate(){
   let payload=arr(vec![vec![9],arr(vec![u(source),vec![0xc0],u(magic),u(fleck),u(0)])]);
   p.extend(doc(1,arr(vec![u(4+i as u32),u(item),u(301+i as u32),u(2),payload])));
  }
  let raw=slot_from_payload("3.0.1",p);let mut e=Editor::open(if zipped{zip(&raw)}else{raw}).unwrap();
  assert_eq!(e.inventory().iter().filter(|r|r.editable&&r.quantity_minimum==0).count(),257);
  assert_eq!(e.inventory_wand_edit_hints().count(),257);
  let (_,magic,fleck)=variants[256];let old=[magic as i32,fleck as i32];let next=[105,127];
  assert!(e.inventory_wand_creation_variants(260).contains(&next));
  e.create_inventory_wand_variant(260,old,next,3).unwrap();
  e.change_inventory_quantity(4,2,0).unwrap();
  let saved=Editor::open(e.export().unwrap()).unwrap();
  assert_eq!(saved.inventory().len(),258);assert_eq!(saved.inventory()[0].quantity,0);
  assert!(saved.inventory().iter().all(|r|r.editable&&r.quantity_minimum==0));
 }
}

#[test]
fn mermaidifier_flower_copy_protects_exact_item_without_blocking_unrelated_inventory(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let flower=plain_flower(6);
 let make=|g:[u32;4]|{
  let mut p=synthetic_payload("3.0.1");p[2]=9;p[3]=0x9a;
  for (id,item,uid,payload) in [(4,897617923,21,flower.clone()),(5,105502901,22,flower.clone()),(6,71754032,0,vec![0xc0])]{
   p.extend(doc(1,arr(vec![u(id),u(item),u(uid),u(2),payload])));
  }
  p.extend(doc(10,arr(vec![u(7),guid([1,2,3,4]),arr(vec![]),arr(vec![]),arr(vec![]),guid([1,2,3,4]),vec![0xc3],vec![0xc0]])));
  p.extend(doc(22,arr(vec![u(8),arr(vec![arr(vec![u(0),guid(g),flower.clone()])]),arr(vec![]),vec![0xc0],vec![0xc0],arr(vec![])])));
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make([0x81356be7,0x4ffb6b6d,0xf71135bc,0x6bc8ed69]);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
  assert!(original[0].editable&&original[0].quantity_minimum==1);
  assert!(original[1].editable&&original[1].quantity_minimum==0);
  assert!(original[2].editable&&original[2].quantity_minimum==0);
  assert!(e.change_inventory_quantity(4,2,0).is_err());assert!(!e.dirty());
  e.change_inventory_quantities(&[(5,2,0),(6,2,0)]).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),original);assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory()[0].quantity,2);assert_eq!(saved.inventory()[1].quantity,0);assert_eq!(saved.inventory()[2].quantity,0);
  assert_eq!(saved.inventory_original_unique_payload(4),Some(flower.as_slice()));
  assert_eq!(saved.inventory_original_unique_payload(5),Some(flower.as_slice()));
  saved.change_inventory_quantities(&[(5,0,2),(6,0,2)]).unwrap();
  assert_eq!(Editor::open(saved.export().unwrap()).unwrap().inventory(),original);
 }
 for zipped in [false,true]{
  let raw=make([u32::MAX;4]);let mut e=Editor::open(if zipped{zip(&raw)}else{raw}).unwrap();
  assert_eq!(e.inventory()[2].quantity_minimum,0);assert!(e.inventory_entry_removable(6));
  assert!(!e.inventory_entry_removable(4));assert!(!e.inventory_entry_removable(5));
  assert!(e.inventory_flower_variants(4).is_empty());assert!(e.inventory_flower_creation_variants(5).is_empty());
  e.remove_inventory_entries(&[(6,2)]).unwrap();
  let saved=Editor::open(e.export().unwrap()).unwrap();assert_eq!(saved.inventory().len(),2);
  for id in [4,5]{assert_eq!(saved.inventory_original_unique_payload(id),Some(flower.as_slice()));}
  let raw=make([0;4]);let mut blocked=Editor::open(if zipped{zip(&raw)}else{raw}).unwrap();
  assert_eq!(blocked.inventory()[2].quantity_minimum,1);assert!(blocked.remove_inventory_entries(&[(6,2)]).is_err());assert!(!blocked.dirty());
 }
}

#[allow(dead_code)]
#[path="../src/inventory_source_data.rs"]
mod complete_quantity_source;
#[allow(dead_code)]
#[path="../src/inventory_bag_data.rs"]
mod complete_bag_source;

#[test]
fn all_source_ordinary_bag_definitions_share_native_zero_refill_and_reference_scope(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let defs:Vec<_>=complete_quantity_source::RULES.iter().zip(complete_bag_source::BAG_FLAGS)
  .filter_map(|(&(item,_),&flags)|(flags&1!=0).then_some((item,flags&2!=0))).collect();
 assert_eq!(defs.len(),9920);
 assert_eq!(defs.iter().filter(|(_,outfit)|*outfit).count(),6057);
 let make=|batch:&[(i32,bool)],context:u8|{
  let n=(7+batch.len()) as u16;
  let mut p=vec![0x93,0];p.extend(u(7+batch.len() as u32));p.push(0xdc);p.extend(n.to_be_bytes());
  p.extend_from_slice(&synthetic_payload("3.0.1")[4..]);
  for (i,&(item,_)) in batch.iter().enumerate(){
   p.extend(doc(1,arr(vec![u(4+i as u32),u(item as u32),u(0),u(1),vec![0xc0]])));
  }
  let av=if context==1{arr(vec![u(4+batch.len() as u32),guid([0;4]),arr(vec![])])}
   else{arr(vec![u(4+batch.len() as u32),guid([0;4]),arr(vec![]),arr(vec![]),arr(vec![]),guid([0;4]),vec![0xc3],vec![0xc0]])};
  let ge=if context==2{arr(vec![u(5+batch.len() as u32)])}
   else{arr(vec![u(5+batch.len() as u32),arr(vec![]),arr(vec![]),vec![0xc0],vec![0xc0],arr(vec![])])};
  p.extend(doc(10,av));p.extend(doc(22,ge));slot_from_payload("3.0.1",p)
 };
 for batch in defs.chunks(200){
  let raw=make(batch,0);let mut e=Editor::open(raw).unwrap();let original=e.inventory();
  assert_eq!(original.len(),batch.len());
  assert!(original.iter().all(|row|row.editable&&row.quantity_minimum==0));
  let zero:Vec<_>=original.iter().map(|r|(r.document_id,1,0)).collect();
  let refill:Vec<_>=original.iter().map(|r|(r.document_id,0,1)).collect();
  e.change_inventory_quantities(&zero).unwrap();
  assert!(e.undo_scope(Inventory));assert_eq!(e.inventory(),original);assert!(e.redo_scope(Inventory));
  let mut saved=Editor::open(e.export().unwrap()).unwrap();
  assert!(saved.inventory().iter().all(|row|row.quantity==0&&row.editable));
  saved.change_inventory_quantities(&refill).unwrap();
  assert_eq!(Editor::open(saved.export().unwrap()).unwrap().inventory(),original);
  let scoped=Editor::open(make(batch,1)).unwrap();
  for (row,&(_,outfit)) in scoped.inventory().iter().zip(batch){
   assert_eq!(row.quantity_minimum,if outfit{1}else{0},"Item ID {}",row.item_id);
  }
  // Native AvatarGeneralSettingsModel.Deserialize leaves omitted trailing
  // lists at their constructor's empty defaults. No serialized reference is
  // hidden. Exercise the complete ordinary catalog with that saved shape.
  let mut defaulted=Editor::open(make(batch,2)).unwrap();
  assert!(defaulted.inventory().iter().all(|row|row.quantity_minimum==0));
  defaulted.change_inventory_quantities(&zero).unwrap();
  assert!(Editor::open(defaulted.export().unwrap()).unwrap().inventory().iter().all(|r|r.quantity==0));
 }
}

#[test]
fn complete_definition_catalog_uses_one_quantity_field_and_all_ordinary_additions(){
 let defs:Vec<_>=complete_quantity_source::RULES.iter().zip(complete_bag_source::BAG_FLAGS)
  .map(|(&(id,rule),&flags)|(id,rule,flags)).collect();
 assert_eq!(defs.len(),12163);
 // This deliberately tests only the common outer record contract and native
 // definition bounds. The opaque schematic-shaped span is a synthetic
 // placeholder, not a claim about the actual payload associated with an ID.
 let opaque=arr(vec![vec![0],arr(vec![guid([11,22,33,44])])]);
 for chunk in defs.chunks(200){
  let mut p=vec![0x93,0];p.extend(u(4+chunk.len() as u32));p.push(0xdc);p.extend(((5+chunk.len()) as u16).to_be_bytes());p.extend_from_slice(&synthetic_payload("3.0.1")[4..]);
  for (i,&(id,rule,_)) in chunk.iter().enumerate(){
   let (uid,data)=if rule&2!=0{(1000+i as u32,opaque.clone())}else{(0,vec![0xc0])};
   p.extend(doc(1,arr(vec![u(4+i as u32),u(id as u32),u(uid),u(0),data])));
  }
  let mut e=Editor::open(slot_from_payload("3.0.1",p)).unwrap();
  let rows=e.inventory();assert_eq!(rows.len(),chunk.len());
  let mut edits=Vec::new();
  for (row,&(id,rule,_)) in rows.iter().zip(chunk){
   let cap=if rule&1==0{1}else if rule&4==0{i32::MAX}else{complete_quantity_source::CUSTOM_CAPS.iter().find(|r|r.0==id).unwrap().1};
   assert!(row.editable,"definition {id}");assert_eq!(row.quantity_limit,Some(cap));
   edits.push((row.document_id,0,cap.min(2)));
  }
  e.change_inventory_quantities(&edits).unwrap();
  let saved=Editor::open(e.export().unwrap()).unwrap();
  assert_eq!(saved.inventory(),e.inventory());
  for row in &rows{assert_eq!(saved.inventory_original_unique_payload(row.document_id),e.inventory_original_unique_payload(row.document_id));}
 }
 let raw=slot("3.0.1");let e=Editor::open(raw.clone()).unwrap();
 let all=e.inventory_creatable();assert_eq!(all.len(),7607);
 let expected:std::collections::HashSet<_>=defs.iter().filter(|r|r.2&4!=0).map(|r|r.0).collect();
 assert_eq!(all.iter().map(|r|r.item_id).collect::<std::collections::HashSet<_>>(),expected);
 for chunk in all.chunks(200){
  let mut e=Editor::open(raw.clone()).unwrap();
  let edits:Vec<_>=chunk.iter().map(|r|(r.document_id,0,1)).collect();
  e.change_inventory_quantities(&edits).unwrap();
  let saved=Editor::open(e.export().unwrap()).unwrap();
  assert_eq!(saved.inventory().iter().map(|r|r.item_id).collect::<std::collections::HashSet<_>>(),chunk.iter().map(|r|r.item_id).collect());
  assert!(saved.inventory_unique_rows().all(|(_,uid,nil,_,_)|uid==Some(0)&&nil==Some(true)));
 }
}

#[test]
fn ordinary_zero_refill_is_independent_of_last_copy_removal_authority(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 for zipped in [false,true]{
  let mut p=synthetic_payload("3.0.1");p[2]=5;p[3]=0x96;
  // A known clothing row, with no complete avatar context for removal.
  p.extend(doc(1,arr(vec![u(4),u(315822),u(0),u(0),vec![0xc0]])));
  let raw=slot_from_payload("3.0.1",p);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
  assert!(original[0].editable);assert_eq!(original[0].quantity_minimum,1);
  e.change_inventory_quantity(4,0,2).unwrap();assert!(e.change_inventory_quantity(4,2,0).is_err());
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),original);assert!(restored.redo_scope(Inventory));
  let reopened=Editor::open(restored.export().unwrap()).unwrap();assert_eq!(reopened.inventory()[0].quantity,2);
  assert_eq!(reopened.inventory()[0].quantity_minimum,1);
 }
}

#[test]
fn referenced_empty_nil_furniture_base_refills_beside_distinct_custom_peers(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let item=61381969u32;
 let custom=|id,uid,materials|doc(1,arr(vec![u(id),u(item),u(uid),u(2),furniture_payload(materials)]));
 let make=|peers:Vec<Vec<u8>>|{
  let mut p=synthetic_payload("3.0.1");p[2]=12;p[3]=0x97+peers.len() as u8;
  p.extend(doc(1,arr(vec![u(4),u(item),u(0),u(0),vec![0xc0]])));
  for peer in peers{p.extend(peer);}
  let home=arr(vec![guid([41,42,43,44]),arr(vec![]),u(item),u(0),guid([0;4]),l(0),
   vec![0xc0],vec![0xc2],vec![0xc0],arr(vec![]),vec![0xc0],vec![0xc0],u(0),u(0),arr(vec![])]);
  p.extend(doc(32,arr(vec![u(9),guid([7,0,0,0]),u(0),arr(vec![doc(8,arr(vec![arr(vec![home])]))])])));
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make(vec![custom(5,11,[0,2,0]),custom(6,12,[0,3,0])]);
  let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
  assert_eq!(original[0].quantity,0);assert!(original[0].editable);assert_eq!(original[0].quantity_minimum,1);
  let peer=e.inventory_original_unique_payload(5).unwrap().to_vec();
  e.change_inventory_quantity(4,0,4).unwrap();
  assert!(e.change_inventory_quantity(4,4,0).is_err());
  assert!(e.undo_scope(Inventory));assert_eq!(e.inventory(),original);assert!(e.redo_scope(Inventory));
  let cp=e.history_checkpoint().unwrap();let mut recovered=Editor::open(input).unwrap();recovered.restore_history(&cp).unwrap();
  let mut saved=Editor::open(recovered.export().unwrap()).unwrap();
  assert_eq!(saved.inventory()[0].quantity,4);assert_eq!(saved.inventory()[0].quantity_minimum,1);
  assert_eq!(saved.inventory_original_unique_payload(4),Some([0xc0].as_slice()));
  assert_eq!(saved.inventory_original_unique_payload(5),Some(peer.as_slice()));
  assert_eq!(saved.inventory()[1..],original[1..]);assert!(saved.change_inventory_quantity(4,4,0).is_err());
 }
 for peers in [
  vec![doc(1,arr(vec![u(5),u(item),u(0),u(2),vec![0xc0]]))],
  vec![custom(5,11,[0,1,0])],
  vec![custom(5,11,[0,2,0]),custom(6,12,[0,2,0])],
  vec![custom(5,11,[0,2,0]),custom(6,11,[0,3,0])],
 ]{
  let mut e=Editor::open(make(peers)).unwrap();
  assert_quantity_only_roundtrip(&mut e,4,4);
 }
}

#[test]
fn exact_partial_item_reference_does_not_disable_other_unique_appearance_families(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let palette=arr(vec![vec![6],arr(vec![arr(vec![f(0.25),f(0.5),f(0.0),f(1.0)]);3])]);
 let cafe=arr(vec![vec![3],arr(vec![arr(vec![u(44),u(49),u(48)]),arr(vec![u(6),u(46),u(9)])])]);
 let boba=arr(vec![vec![4],arr(vec![u(6),u(44),u(76),u(75),u(73)])]);
 let legacy_furniture=arr(vec![vec![1],arr(vec![guid([0;4]),guid([0xd3ce93fd,0x4a105e00,0x3e1e60b9,0x5af6b600]),guid([0;4])])]);
 let legacy_flower=arr(vec![vec![2],arr(vec![u(6),guid([0x43687091,0x4d69b05b,0x475ed195,0xaec32728]),guid([0;4]),guid([0;4])])]);
 let legacy_wand=arr(vec![vec![5],arr(vec![guid([0;4]),vec![0xc0],u(104),u(125),u(120)])]);
 let wand=arr(vec![vec![9],arr(vec![u(0),vec![0xc0],u(104),u(125),u(118)])]);
 let rows=[(1331175279u32,plain_flower(6)),(61381969,furniture_payload([13,2,0])),
  (1835273963,palette),(203331651,cafe),(1798633565,boba),(1429161083,wand),
  (61381969,legacy_furniture),(43114910,legacy_flower),(39246601,legacy_wand)];
 let make=|reference:Vec<u8>|{
  let mut p=vec![0x93,0];p.extend(u(40));p.push(0xdc);p.extend(((8+rows.len()) as u16).to_be_bytes());
  p.extend_from_slice(&synthetic_payload("3.0.1")[4..]);
  for (i,(item,payload)) in rows.iter().enumerate(){
   p.extend(doc(1,arr(vec![u(4+i as u32),u(*item),u(21+i as u32),u(2),payload.clone()])));
  }
  p.extend(doc(10,arr(vec![u(30),guid([1,2,3,4]),arr(vec![]),arr(vec![]),arr(vec![]),guid([1,2,3,4]),vec![0xc3],vec![0xc0]])));
  p.extend(doc(22,arr(vec![u(31),arr(vec![]),arr(vec![]),vec![0xc0],vec![0xc0],arr(vec![])])));
  let cafe=arr(vec![vec![0xc2],vec![0x80],u(0),u(0),guid([0;4]),arr(vec![reference]),u(0),u(0),u(0),l(0)]);
  p.extend(doc(32,arr(vec![u(32),guid([7,0,0,0]),u(0),arr(vec![doc(38,cafe)])])));
  slot_from_payload("3.0.1",p)
 };
 // A native typed partial Item ID does not conceal the identity of
 // another family, but the absent UID cannot be used for allocation.
 let has_options=|e:&Editor,id:u32|->bool{match id{
  4|11=>!e.inventory_flower_variants(id).is_empty(),
  5|10=>!e.inventory_furniture_variants(id).is_empty(),
  6=>!e.inventory_palette_variants(id).is_empty(),
  7=>!e.inventory_cafe_variants(id).is_empty(),
  8=>!e.inventory_boba_variants(id).is_empty(),
  9|12=>!e.inventory_wand_variants(id).is_empty(),
  _=>false
 }};
 for zipped in [false,true]{
  for target in rows.iter().map(|r|r.0).chain(std::iter::once(427689)){
   let raw=make(arr(vec![u(target)]));let input=if zipped{zip(&raw)}else{raw};
   let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
   assert_eq!(original.len(),rows.len());
   let mut zero=Vec::new();
   for row in &original{
    if row.item_id==target as i32{
     assert!(!has_options(&e,row.document_id),"protected {}",row.item_id);
     assert_eq!(row.quantity_minimum,1);
     assert!(e.change_inventory_quantity(row.document_id,2,0).is_err());
    }else{
     assert!(row.editable&&row.quantity_minimum==0,"item {}",row.item_id);
     assert!(has_options(&e,row.document_id),"appearance {}",row.item_id);
     zero.push((row.document_id,2,0));
    }
   }
   assert!(e.inventory_flower_creation_variants(4).is_empty());
   assert!(e.inventory_absent_flower_ids().is_empty());
   e.change_inventory_quantities(&zero).unwrap();
   let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
   assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),original);assert!(restored.redo_scope(Inventory));
   let mut saved=Editor::open(restored.export().unwrap()).unwrap();
   let refill:Vec<_>=zero.iter().map(|&(id,_,_)|(id,0,2)).collect();
   for (i,(_,payload)) in rows.iter().enumerate(){assert_eq!(saved.inventory_original_unique_payload(4+i as u32),Some(payload.as_slice()));}
   saved.change_inventory_quantities(&refill).unwrap();
   assert_eq!(Editor::open(saved.export().unwrap()).unwrap().inventory(),original);
  }
 }
 for reference in [arr(vec![]),arr(vec![u(0)])]{
  let mut e=Editor::open(make(reference)).unwrap();
  assert!(e.inventory().iter().all(|row|row.quantity_minimum==1&&!has_options(&e,row.document_id)));
  assert!(e.change_inventory_quantity(4,2,0).is_err());assert!(!e.dirty());
 }
 let mut e=Editor::open(make(arr(vec![u(427689)]))).unwrap();
 e.change_inventory_flower_color(4,6,8).unwrap();
 assert!(e.inventory_flower_creation_variants(4).is_empty());
 let saved=Editor::open(e.export().unwrap()).unwrap();
 assert_eq!(saved.inventory_unique_data(4),e.inventory_unique_data(4));
}

#[test]
fn partial_native_item_reference_scopes_nil_removal_and_creation_to_exact_item(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let target=427689u32;let critter=7285157u32;let outfit=315822u32;let absent=1877756618u32;
 let make=|reference:Vec<u8>,owned:bool|{
  let mut p=synthetic_payload("3.0.1");p[2]=16;p[3]=0x9a+u8::from(owned);
  for (id,it) in [(4,critter),(5,outfit)]{p.extend(doc(1,arr(vec![u(id),u(it),u(0),u(2),vec![0xc0]])))}
  if owned{p.extend(doc(1,arr(vec![u(6),u(target),u(0),u(2),vec![0xc0]])))}
  p.extend(doc(10,arr(vec![u(7),guid([1,2,3,4]),arr(vec![]),arr(vec![]),arr(vec![]),guid([1,2,3,4]),vec![0xc3],vec![0xc0]])));
  p.extend(doc(22,arr(vec![u(8),arr(vec![]),arr(vec![]),vec![0xc0],vec![0xc0],arr(vec![])])));
  let cafe=arr(vec![vec![0xc2],vec![0x80],u(0),u(0),guid([0;4]),arr(vec![reference]),u(0),u(0),u(0),l(0)]);
  p.extend(doc(32,arr(vec![u(9),guid([7,0,0,0]),u(0),arr(vec![doc(38,cafe)])])));
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  for owned in [false,true]{
   let raw=make(arr(vec![u(target)]),owned);let input=if zipped{zip(&raw)}else{raw};
   let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
   assert_eq!(original[0].quantity_minimum,0);assert_eq!(original[1].quantity_minimum,0);
   if owned{assert_eq!(original[2].quantity_minimum,1);assert!(e.change_inventory_quantity(6,2,0).is_err());}
   let add=e.inventory_creatable();assert!(!add.iter().any(|r|r.item_id==target as i32));
   let candidate=add.iter().find(|r|r.item_id==absent as i32).unwrap().document_id;
   assert!(e.change_inventory_quantity(0x80000000|target,0,1).is_err());
   e.change_inventory_quantities(&[(4,2,0),(5,2,0),(candidate,0,3)]).unwrap();
   let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
   assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),original);assert!(restored.redo_scope(Inventory));
   let saved=Editor::open(restored.export().unwrap()).unwrap();
   assert_eq!(saved.inventory()[0].quantity,0);assert_eq!(saved.inventory()[1].quantity,0);
   assert!(saved.inventory().iter().any(|r|r.item_id==absent as i32&&r.quantity==3));
   assert!(!saved.inventory_creatable().iter().any(|r|r.item_id==target as i32));
  }
 }
 for reference in [arr(vec![]),arr(vec![u(0)])]{
  let mut e=Editor::open(make(reference,true)).unwrap();
  assert!(e.inventory().iter().all(|r|r.quantity_minimum==1));
  assert!(e.inventory_creatable().is_empty());assert!(e.change_inventory_quantity(4,2,0).is_err());assert!(!e.dirty());
 }
}

#[test]
fn complete_event_pickup_ingredient_class_roundtrip_without_other_state(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let ids=[178678442,283387361,310452029,316767677,334775099,368740424,380277523,429979185,460642821,484139114,528107118,540475330,562915086,603541674,676157992,688635250,724221866,848632964,873454670,959457536,1061892525,1141761080,1158972544,1163912623,1167025404,1172734296,1269266427,1328976634,1336374038,1362190915,1366882580,1430368973,1435708535,1509703694,1530846294,1654424621,1711237421,1739535279,1764168271,1787189193,1802723396,1871755168,1881815580,1936444843,1955127414,1968253357,2005997203,2011995290,2072048253,2092387705];
 for zipped in [false,true]{
  let raw=slot("3.0.1");let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let candidates=e.inventory_creatable();
  let edits:Vec<_>=ids.iter().map(|id|(candidates.iter().find(|r|r.item_id==*id).unwrap().document_id,0,25)).collect();
  let mut invalid=edits.clone();invalid.push((0x80000000|615026760,0,1));
  assert!(e.change_inventory_quantities(&invalid).is_err());assert!(!e.dirty());
  e.change_inventory_quantities(&edits).unwrap();assert_eq!(e.history().len(),1);
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert!(restored.undo_scope(Inventory));assert!(restored.inventory().is_empty());assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();let rows=saved.inventory();assert_eq!(rows.len(),50);
  assert!(rows.iter().all(|r|ids.contains(&r.item_id)&&r.quantity==25&&r.quantity_minimum==0));
  assert!(saved.inventory_unique_rows().all(|(_,uid,nil,_,_)|uid==Some(0)&&nil==Some(true)));
  assert_eq!(saved.entries(),e.entries());assert_eq!(saved.achievements(),e.achievements());
  let zero:Vec<_>=rows.iter().map(|r|(r.document_id,25,0)).collect();saved.change_inventory_quantities(&zero).unwrap();
  let reopened=Editor::open(saved.export().unwrap()).unwrap();assert!(reopened.inventory().iter().all(|r|r.quantity==0&&r.editable));
 }
}

#[test]
fn all_unrestricted_finite_reset_consumables_share_bag_creation_and_cap(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let ids=[413462588,1254892985,1434684945,1459854039,1810077468,2131984752,1093982586,1763678003];
 for zipped in [false,true]{
  let raw=slot("3.0.1");let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  let candidates=e.inventory_creatable();
  let edits:Vec<_>=ids.iter().map(|id|{let row=candidates.iter().find(|r|r.item_id==*id).unwrap();assert_eq!(row.quantity_limit,Some(3));(row.document_id,0,3)}).collect();
  let mut invalid=edits.clone();invalid[0].2=4;
  assert!(e.change_inventory_quantities(&invalid).is_err());assert!(!e.dirty());
  for id in [65594842,1144225647,1375142756,120261453,1610049001,615026760]{
   let mut invalid=edits.clone();invalid.push((0x80000000|id,0,1));
   assert!(e.change_inventory_quantities(&invalid).is_err());assert!(!e.dirty());
  }
  e.change_inventory_quantities(&edits).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert!(restored.undo_scope(Inventory));assert!(restored.inventory().is_empty());assert!(restored.redo_scope(Inventory));
  let mut saved=Editor::open(restored.export().unwrap()).unwrap();let rows=saved.inventory();
  assert_eq!(rows.len(),ids.len());assert!(rows.iter().all(|r|ids.contains(&r.item_id)&&r.quantity==3&&r.quantity_minimum==0&&r.quantity_limit==Some(3)));
  assert_eq!(saved.entries(),e.entries());assert_eq!(saved.achievements(),e.achievements());
  let zero:Vec<_>=rows.iter().map(|r|(r.document_id,3,0)).collect();saved.change_inventory_quantities(&zero).unwrap();
  let mut reopened=Editor::open(saved.export().unwrap()).unwrap();
  let refill:Vec<_>=reopened.inventory().iter().map(|r|(r.document_id,0,3)).collect();reopened.change_inventory_quantities(&refill).unwrap();
  assert_eq!(Editor::open(reopened.export().unwrap()).unwrap().inventory(),rows);
 }
}

#[test]
fn native_defaulted_reference_tails_do_not_disable_unrelated_ordinary_bag_deletion(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let defs:Vec<_>=complete_quantity_source::RULES.iter().zip(complete_bag_source::BAG_FLAGS)
  .filter_map(|(&(id,_),&flags)|(flags&1!=0).then_some(id)).collect();
 assert_eq!(defs.len(),9920);
 let target=427689i32;
 let make=|batch:&[i32]|{
  let mut p=vec![0x93,0];p.extend(u(12+batch.len() as u32));p.push(0xdc);p.extend(((8+batch.len()) as u16).to_be_bytes());
  p.extend_from_slice(&synthetic_payload("3.0.1")[4..]);
  for (i,&item) in batch.iter().enumerate(){
   p.extend(doc(1,arr(vec![u(4+i as u32),u(item as u32),u(0),u(1),vec![0xc0]])));
  }
  let id=4+batch.len() as u32;
  p.extend(doc(10,arr(vec![u(id),guid([1,2,3,4]),arr(vec![]),arr(vec![]),arr(vec![]),guid([1,2,3,4]),vec![0xc3],vec![0xc0]])));
  p.extend(doc(22,arr(vec![u(id+1)])));
  let home=arr(vec![guid([41,42,43,44]),arr(vec![]),u(target as u32)]);
  p.extend(doc(32,arr(vec![u(id+2),guid([7,0,0,0]),u(0),arr(vec![doc(8,arr(vec![arr(vec![home])]))])])));
  slot_from_payload("3.0.1",p)
 };
 for batch in defs.chunks(200){
  let raw=make(batch);let mut e=Editor::open(raw).unwrap();let before=e.inventory();
  assert_eq!(before.len(),batch.len());
  for row in &before{assert_eq!(row.quantity_minimum,if row.item_id==target{1}else{0},"Item ID {}",row.item_id);}
  let zero:Vec<_>=before.iter().filter(|r|r.item_id!=target).map(|r|(r.document_id,1,0)).collect();
  e.change_inventory_quantities(&zero).unwrap();
  assert!(e.undo_scope(Inventory));assert_eq!(e.inventory(),before);assert!(e.redo_scope(Inventory));
  let mut saved=Editor::open(e.export().unwrap()).unwrap();
  assert!(saved.inventory().iter().all(|r|r.quantity==if r.item_id==target{1}else{0}));
  let refill:Vec<_>=before.iter().filter(|r|r.item_id!=target).map(|r|(r.document_id,0,1)).collect();
  saved.change_inventory_quantities(&refill).unwrap();
  assert_eq!(Editor::open(saved.export().unwrap()).unwrap().inventory(),before);
 }
}

#[test]
fn physical_removal_uses_document_identity_not_appearance_editability(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let unknown=arr(vec![vec![3],arr(vec![arr(vec![u(99)]),arr(vec![u(6),u(14),u(11),u(999)])])]);
 let make=|duplicate_uid:bool,reference:bool|{
  let mut p=synthetic_payload("3.0.1");p[2]=20;p[3]=0x98+u8::from(reference);
  p.extend(doc(1,arr(vec![u(4),u(203331651),u(21),u(2),unknown.clone()])));
  p.extend(doc(1,arr(vec![u(5),u(406277059),u(if duplicate_uid{21}else{22}),u(0),unknown.clone()])));
  p.extend(doc(1,arr(vec![u(6),u(7285157),u(0),u(3),vec![0xc0]])));
  if reference{
   let cafe=arr(vec![vec![0xc2],vec![0x80],u(0),u(0),guid([0;4]),arr(vec![arr(vec![u(203331651),u(21)])]),u(0),u(0),u(0),l(0)]);
   p.extend(doc(32,arr(vec![u(9),guid([7,0,0,0]),u(0),arr(vec![doc(38,cafe)])])));
  }
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make(false,false);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
  assert!(original[0].editable&&original[1].editable);assert!(e.inventory_entry_removable(4));assert!(e.inventory_entry_removable(5));
  assert!(e.remove_inventory_entries(&[(4,2),(5,1)]).is_err());assert_eq!(e.inventory(),original);assert!(!e.dirty());
  e.remove_inventory_entries(&[(4,2),(5,0)]).unwrap();
  assert_eq!(e.inventory().len(),1);assert!(!e.inventory_entry_removable(4));assert!(e.change_inventory_quantity(4,2,3).is_err());
  e.change_inventory_quantity(6,3,7).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert_eq!(restored.inventory(),e.inventory());
  assert!(restored.undo_scope(Inventory));assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),original);
  assert_eq!(restored.inventory_original_unique_payload(4),Some(unknown.as_slice()));
  assert!(restored.redo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory().len(),1);assert_eq!(saved.inventory()[0].document_id,6);assert_eq!(saved.inventory()[0].quantity,7);
  assert_eq!(saved.inventory_original_unique_payload(6),Some([0xc0].as_slice()));
  assert!(saved.inventory_original_unique_payload(4).is_none());assert!(saved.inventory_original_unique_payload(5).is_none());
 }
 for raw in [make(true,false),make(false,true)]{
  let mut e=Editor::open(raw).unwrap();let original=e.inventory();
  assert!(!e.inventory_entry_removable(4));assert!(e.remove_inventory_entries(&[(6,3),(4,2)]).is_err());
  assert_eq!(e.inventory(),original);assert!(!e.dirty());
 }
}

#[allow(dead_code)]
#[path="../src/inventory_legacy_wand_guid_data.rs"]
mod complete_ordinary_guid_source;
fn ordinary_independent_store_fixture(batch:&[(i32,[u32;4])])->(Vec<u8>,Vec<u8>){
 let big_arr=|rows:Vec<Vec<u8>>|{let mut bytes=vec![0xdc];bytes.extend((rows.len() as u16).to_be_bytes());for row in rows{bytes.extend(row)}bytes};
 let n=8+batch.len();
 let mut p=vec![0x93,0];p.extend(u(n as u32+1));p.push(0xdc);p.extend((n as u16).to_be_bytes());
 p.extend_from_slice(&synthetic_payload("3.0.1")[4..]);
 for (i,&(item,_)) in batch.iter().enumerate(){p.extend(doc(1,arr(vec![u(4+i as u32),u(item as u32),u(0),u(1),vec![0xc0]])));}
 let tail=4+batch.len() as u32;
 p.extend(doc(10,arr(vec![u(tail),guid([0;4]),arr(vec![]),arr(vec![]),arr(vec![]),guid([0;4]),vec![0xc3],vec![0xc0]])));
 p.extend(doc(22,arr(vec![u(tail+1),arr(vec![]),arr(vec![]),vec![0xc0],vec![0xc0],arr(vec![])])));
 let box_items=big_arr(batch.iter().map(|&(_,key)|arr(vec![guid(key),u(7),l(638000000000000001)])).collect());
 let slots=big_arr(batch.iter().map(|&(item,_)|arr(vec![u(item as u32),u(8),vec![0xc0]])).collect());
 let independent=doc(32,arr(vec![u(tail+2),guid([7,0,0,1]),u(0),arr(vec![
  doc(24,arr(vec![box_items,l(638000000000000002)])),
  doc(47,arr(vec![map(vec![(guid([9,0,0,1]),arr(vec![slots]))]),l(638000000000000003),map(vec![])]))
 ])]));
 p.extend(&independent);
 (slot_from_payload("3.0.1",p),independent)
}

#[test]
fn complete_ordinary_bag_class_supports_physical_document_removal(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let guid_by_item:std::collections::HashMap<_,_>=complete_ordinary_guid_source::LEGACY_WAND_SOURCE_GUIDS.iter()
  .chain(complete_ordinary_guid_source::OTHER_NATIVE_ITEM_GUIDS).map(|&(g,id)|(id,g)).collect();
 let defs:Vec<_>=complete_quantity_source::RULES.iter().zip(complete_bag_source::BAG_FLAGS)
  .filter_map(|(&(item,_),&flags)|(flags&1!=0).then(||(item,guid_by_item[&item],flags))).collect();
 assert_eq!(defs.len(),9920);
 let mut additions=0;
 for chunk in defs.chunks(200){
  let batch:Vec<_>=chunk.iter().map(|&(id,g,_)|(id,g)).collect();
  let (raw,independent)=ordinary_independent_store_fixture(&batch);
  let mut e=Editor::open(raw).unwrap();let original=e.inventory();
  assert_eq!(original.len(),batch.len());
  assert!(original.iter().all(|row|row.editable&&row.quantity_minimum==0&&e.inventory_entry_removable(row.document_id)));
  e.change_inventory_quantities(&original.iter().map(|r|(r.document_id,1,0)).collect::<Vec<_>>()).unwrap();
  e.remove_inventory_entries(&original.iter().map(|r|(r.document_id,0)).collect::<Vec<_>>()).unwrap();
  assert!(e.inventory().is_empty());
  assert!(e.undo_scope(Inventory));assert!(e.inventory().iter().all(|r|r.quantity==0));assert!(e.redo_scope(Inventory));
  let candidates=e.inventory_creatable();
  let expected:std::collections::HashSet<_>=chunk.iter().filter(|r|r.2&4!=0).map(|r|r.0).collect();
  let requests:Vec<_>=candidates.iter().filter(|r|expected.contains(&r.item_id)).map(|r|(r.document_id,0,1)).collect();
  assert_eq!(requests.len(),expected.len());additions+=requests.len();
  if !requests.is_empty(){e.change_inventory_quantities(&requests).unwrap();}
  let output=e.export().unwrap();let checked=read_slot(&output).unwrap();
  assert!(checked.envelope.decoded.windows(independent.len()).any(|w|w==independent.as_slice()));
  let saved=Editor::open(output).unwrap();
  assert_eq!(saved.inventory().iter().map(|r|r.item_id).collect::<std::collections::HashSet<_>>(),expected);
  assert_eq!(saved.entries(),e.entries());assert_eq!(saved.achievements(),e.achievements());
 }
 assert_eq!(additions,7607);
}
#[test]
fn reported_fish_and_critters_with_independent_stores_roundtrip(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let batch=[
  (1614767621,[0x8a7afbb3,0x4f184c65,0x49f63abe,0xf8c1c80f]),
  (929880853,[0x76bd0d56,0x43bb2e8a,0xdf0f71be,0x6bb146cd]),
  (692732629,[0x0d378442,0x4deadb69,0x440a359c,0x2f5b074f]),
  (1078556752,[0x426f8fd8,0x2e4bd9e7,0xb998f291,0xb5c948ef]),
 ];
 for zipped in [false,true]{
  let (raw,_)=ordinary_independent_store_fixture(&batch);
  let input=if zipped{zip(&raw)}else{raw};let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
  assert_eq!(original.len(),4);assert!(original.iter().all(|r|r.editable&&r.quantity_minimum==0&&e.inventory_entry_removable(r.document_id)));
  e.change_inventory_quantity(4,1,0).unwrap();e.remove_inventory_entries(&[(4,0),(5,1),(6,1),(7,1)]).unwrap();
  let checkpoint=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&checkpoint).unwrap();
  assert_eq!(restored.inventory(),e.inventory());assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let output=restored.export().unwrap();let reopened=Editor::open(output).unwrap();assert!(reopened.inventory().is_empty());
 }
}

#[test]
fn complete_unique_union_records_use_structural_quantity_authority(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let cases=vec![
  (61381969,arr(vec![vec![1],arr(vec![guid([1,2,3,4]),guid([0;4]),guid([0;4])])])),
  (43114910,arr(vec![vec![2],arr(vec![u(6),guid([1,2,3,4]),guid([0;4]),guid([0;4])])])),
  (203331651,arr(vec![vec![3],arr(vec![arr(vec![u(99)]),arr(vec![u(999)])])])),
  (1798633565,arr(vec![vec![4],arr(vec![u(999),u(6),u(11),u(19),u(99)])])),
  (39246601,arr(vec![vec![5],arr(vec![guid([0;4]),vec![0xc0],u(999),u(125),u(120)])])),
  (1835273963,arr(vec![vec![6],arr(vec![arr(vec![f(0.25),f(0.5),f(0.),f(1.)]);3])])),
  (43114910,arr(vec![vec![7],arr(vec![u(6),u(999),u(0),u(0)])])),
  (61381969,arr(vec![vec![8],arr(vec![u(999),u(2),u(0)])])),
  (1429161083,arr(vec![vec![9],arr(vec![u(0),vec![0xc0],u(999),u(125),u(118)])]))
 ];
 for (item,payload) in cases{
  for zipped in [false,true]{
   let mut p=synthetic_payload("3.0.1");p[2]=12;p[3]=0x99;
   for (id,uid,qty) in [(4,21,2),(5,22,0)]{
    p.extend(doc(1,arr(vec![u(id),u(item),u(uid),u(qty),payload.clone()])));
   }
   p.extend(doc(10,arr(vec![u(6),guid([0;4]),arr(vec![]),arr(vec![]),arr(vec![]),guid([0;4]),vec![0xc3],vec![0xc0]])));
   p.extend(doc(22,arr(vec![u(7),arr(vec![]),arr(vec![]),vec![0xc0],vec![0xc0],arr(vec![])])));
   let raw=slot_from_payload("3.0.1",p);let input=if zipped{zip(&raw)}else{raw};
   let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
   assert!(original.iter().all(|r|r.editable), "item {item}: {original:?}");
   assert!(e.change_inventory_quantities(&[(4,2,8),(5,1,9)]).is_err());assert!(!e.dirty());
   e.change_inventory_quantities(&[(4,2,8),(5,0,9)]).unwrap();
   let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
   assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),original);assert!(restored.redo_scope(Inventory));
   let saved=Editor::open(restored.export().unwrap()).unwrap();
   assert_eq!(saved.inventory().iter().map(|r|r.quantity).collect::<Vec<_>>(),vec![8,9]);
   for id in [4,5]{assert_eq!(saved.inventory_original_unique_payload(id),Some(payload.as_slice()));}
  }
 }
}

#[test]
fn structural_quantity_aggregate_cap_is_atomic_for_uninterpreted_peers(){
 let unknown=arr(vec![vec![3],arr(vec![arr(vec![u(99)]),arr(vec![u(999)])])]);
 let mut p=synthetic_payload("3.0.1");p[2]=12;p[3]=0x97;
 for (id,uid,qty) in [(4,21,i32::MAX-2),(5,22,1)]{
  p.extend(doc(1,arr(vec![u(id),u(203331651),u(uid),u(qty as u32),unknown.clone()])));
 }
 let mut e=Editor::open(slot_from_payload("3.0.1",p)).unwrap();let original=e.inventory();
 assert!(original.iter().all(|r|r.editable));
 assert!(e.change_inventory_quantity(5,1,3).is_err());assert_eq!(e.inventory(),original);assert!(!e.dirty());
 e.change_inventory_quantities(&[(4,i32::MAX-2,i32::MAX-3),(5,1,3)]).unwrap();
 let saved=Editor::open(e.export().unwrap()).unwrap();
 assert_eq!(saved.inventory().iter().map(|r|r.quantity).collect::<Vec<_>>(),vec![i32::MAX-3,3]);
 for id in [4,5]{assert_eq!(saved.inventory_original_unique_payload(id),Some(unknown.as_slice()));}
 assert!(!saved.inventory_cafe_rows().any(|(_,_,editable)|editable));
}

#[path="../src/inventory_custom_furniture_reference_data.rs"]
mod extra_nil_furniture_source;

#[test]
fn all_verified_extra_nil_furniture_can_refill_without_removal_authority(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let ids:Vec<_>=extra_nil_furniture_source::CUSTOM_FURNITURE_EXTRA_REFERENCE_KEYS.iter()
  .filter_map(|&(id,_)|{
   let i=complete_quantity_source::RULES.binary_search_by_key(&id,|r|r.0).unwrap();
   (complete_bag_source::BAG_FLAGS[i]&1==0).then_some(id)
  }).collect();
 assert_eq!(ids.len(),42);
 let n=(7+ids.len()) as u16;
 let mut p=vec![0x93,0];p.extend(u(7+ids.len() as u32));p.push(0xdc);p.extend(n.to_be_bytes());
 p.extend_from_slice(&synthetic_payload("3.0.1")[4..]);
 for (i,&item) in ids.iter().enumerate(){
  p.extend(doc(1,arr(vec![u(4+i as u32),u(item as u32),u(0),u(0),vec![0xc0]])));
 }
 // An unresolved native reference context prevents last-copy removal,
 // but the already persisted complete nil rows can be replenished.
 p.extend(doc(10,arr(vec![u(4+ids.len() as u32),guid([0;4]),arr(vec![]),arr(vec![]),arr(vec![]),guid([0;4]),vec![0xc3],vec![0xc0]])));
 // A present but truncated Mermaidifier record lacks its source identity;
 // unlike an omitted general-settings tail it is genuinely unresolved.
 p.extend(doc(22,arr(vec![u(5+ids.len() as u32),arr(vec![arr(vec![u(0)])]),arr(vec![]),vec![0xc0],vec![0xc0],arr(vec![])])));
 let raw=slot_from_payload("3.0.1",p);
 for zipped in [false,true]{
  let input=if zipped{zip(&raw)}else{raw.clone()};
  let mut e=Editor::open(input.clone()).unwrap();
  let original=e.inventory();assert_eq!(original.len(),ids.len());
  assert!(original.iter().all(|r|r.editable&&r.quantity==0&&r.quantity_minimum==1&&r.quantity_limit==Some(i32::MAX)));
  let refill:Vec<_>=original.iter().map(|r|(r.document_id,0,2)).collect();
  e.change_inventory_quantities(&refill).unwrap();
  for r in &original{assert!(e.change_inventory_quantity(r.document_id,2,0).is_err());}
  let cp=e.history_checkpoint().unwrap();
  let mut recovered=Editor::open(input).unwrap();recovered.restore_history(&cp).unwrap();
  assert!(recovered.undo_scope(Inventory));assert_eq!(recovered.inventory(),original);
  assert!(recovered.redo_scope(Inventory));
  let saved=Editor::open(recovered.export().unwrap()).unwrap();
  assert_eq!(saved.inventory(),recovered.inventory());
  assert!(saved.inventory().iter().all(|r|r.quantity==2&&r.quantity_minimum==1));
  for r in &original{assert_eq!(saved.inventory_original_unique_payload(r.document_id),Some([0xc0].as_slice()));}
 }
 let absent=Editor::open(slot("3.0.1")).unwrap();
 assert!(absent.inventory_creatable().iter().all(|r|!ids.contains(&r.item_id)));
}


#[test]
fn all_ordinary_creation_definitions_can_be_readded_after_physical_deletion(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let defs:std::collections::HashMap<_,_>=complete_quantity_source::RULES.iter().zip(complete_bag_source::BAG_FLAGS)
  .filter_map(|(&(id,_),&flags)|(flags&1!=0).then_some((id,flags))).collect();
 let mut ids:Vec<_>=defs.keys().copied().collect();ids.sort_unstable();
 let mut covered=0;
 for batch in ids.chunks(200){
  let mut p=vec![0x93,0];p.extend(u(7+batch.len() as u32));p.push(0xdc);p.extend(((7+batch.len()) as u16).to_be_bytes());
  p.extend_from_slice(&synthetic_payload("3.0.1")[4..]);
  for (i,&item) in batch.iter().enumerate(){
   p.extend(doc(1,arr(vec![u(4+i as u32),u(item as u32),u(0),u((i%2) as u32),vec![0xc0]])));
  }
  p.extend(doc(10,arr(vec![u(4+batch.len() as u32),guid([0;4]),arr(vec![]),arr(vec![]),arr(vec![]),guid([0;4]),vec![0xc3],vec![0xc0]])));
  p.extend(doc(22,arr(vec![u(5+batch.len() as u32),arr(vec![]),arr(vec![]),vec![0xc0],vec![0xc0],arr(vec![])])));
  let input=slot_from_payload("3.0.1",p);
  let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
  let before=e.inventory_creatable();assert!(before.iter().all(|r|!batch.contains(&r.item_id)));
  e.remove_inventory_entries(&original.iter().map(|r|(r.document_id,r.quantity)).collect::<Vec<_>>()).unwrap();
  let candidates=e.inventory_creatable();
  let additions:Vec<_>=candidates.iter().filter(|r|batch.contains(&r.item_id)).map(|r|(r.document_id,0,1)).collect();
  let expected:std::collections::HashSet<_>=batch.iter().copied().filter(|id|defs[id]&4!=0).collect();
  assert_eq!(additions.iter().map(|r|(r.0&0x7fffffff) as i32).collect::<std::collections::HashSet<_>>(),expected);
  covered+=expected.len();
  if additions.is_empty(){continue}
  let mut stale=additions.clone();stale.last_mut().unwrap().1=1;
  assert!(e.change_inventory_quantities(&stale).is_err());assert!(e.inventory().is_empty());
  e.change_inventory_quantities(&additions).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut recovered=Editor::open(input).unwrap();recovered.restore_history(&cp).unwrap();
  assert_eq!(recovered.inventory(),e.inventory());assert!(recovered.undo_scope(Inventory));assert!(recovered.inventory().is_empty());
  assert!(recovered.undo_scope(Inventory));assert_eq!(recovered.inventory(),original);
  assert!(recovered.redo_scope(Inventory));assert!(recovered.redo_scope(Inventory));
  let saved=Editor::open(recovered.export().unwrap()).unwrap();
  assert_eq!(saved.inventory().iter().map(|r|r.item_id).collect::<std::collections::HashSet<_>>(),expected);
  assert!(saved.inventory().iter().all(|r|r.quantity==1&&r.document_id>=7+batch.len() as u32));
  assert!(saved.inventory_unique_rows().all(|(_,uid,nil,_,_)|uid==Some(0)&&nil==Some(true)));
 }
 assert_eq!(covered,7607);
}

#[test]
fn removed_unique_rows_release_effective_variant_keys_without_reusing_native_ids(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let mut p=synthetic_payload("3.0.1");p[2]=6;p[3]=0x97;
 p.extend(doc(10,arr(vec![u(4),guid([0;4]),arr(vec![]),arr(vec![]),arr(vec![]),guid([0;4]),vec![0xc3],vec![0xc0]])));
 p.extend(doc(22,arr(vec![u(5),arr(vec![]),arr(vec![]),vec![0xc0],vec![0xc0],arr(vec![])])));
 let raw=slot_from_payload("3.0.1",p);
 let populate=|e:&mut Editor|{
  let candidate=|item:i32|0x80000000|item as u32;
  e.create_inventory_flower_variant(candidate(43114910),[6,2,0,0],[6,5,10,16],2).unwrap();
  e.create_inventory_furniture_variant(candidate(61381969),[0;3],[0,2,0],2).unwrap();
  let (item,v)=e.inventory_absent_palette_default().unwrap();
  e.create_inventory_palette_variant(candidate(item),v,v,2).unwrap();
  let (item,v)=e.inventory_absent_boba_default().unwrap();
  e.create_inventory_boba_variant(candidate(item),v,v,2).unwrap();
  for (item,v) in e.inventory_absent_cafe_defaults(){
   e.create_inventory_cafe_variant(candidate(item),v,v,2).unwrap();
  }
  e.create_inventory_wand_variant(candidate(1429161083),[0,0],[104,125],2).unwrap();
 };
 for zipped in [false,true]{
  let input=if zipped{zip(&raw)}else{raw.clone()};
  let mut seed=Editor::open(input).unwrap();populate(&mut seed);
  let original_file=seed.export().unwrap();
  let mut e=Editor::open(original_file.clone()).unwrap();let original=e.inventory();
  assert_eq!(original.len(),14);
  let expected:std::collections::HashMap<_,_>=original.iter().map(|r|(r.item_id,e.inventory_original_unique_payload(r.document_id).unwrap().to_vec())).collect();
  let original_uids:std::collections::HashSet<_>=e.inventory_unique_rows().filter_map(|r|r.1).collect();
  assert!(original.iter().all(|r|e.inventory_entry_removable(r.document_id)));
  e.remove_inventory_entries(&original.iter().map(|r|(r.document_id,r.quantity)).collect::<Vec<_>>()).unwrap();
  assert!(e.inventory().is_empty());populate(&mut e);
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(original_file).unwrap();restored.restore_history(&cp).unwrap();
  assert_eq!(restored.inventory(),e.inventory());
  for _ in 0..14{assert!(restored.undo_scope(Inventory));}
  assert!(restored.inventory().is_empty());assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),original);
  for _ in 0..15{assert!(restored.redo_scope(Inventory));}
  let saved=Editor::open(restored.export().unwrap()).unwrap();assert_eq!(saved.inventory().len(),14);
  for row in saved.inventory(){
   assert_eq!(saved.inventory_original_unique_payload(row.document_id),Some(expected[&row.item_id].as_slice()));
   assert!(!original.iter().any(|r|r.document_id==row.document_id));
  }
  assert!(saved.inventory_unique_rows().all(|r|r.1.is_some_and(|uid|!original_uids.contains(&uid))));
 }
}

#[test]
fn ordinary_staged_and_saved_removal_is_one_atomic_replayable_transaction(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let original_item=7285157u32;
 let added_item=427689u32;
 let added=0x80000000|added_item;
 for zipped in [false,true]{
  let mut p=synthetic_payload("3.0.1");p[2]=5;p[3]=0x96;
  p.extend(doc(1,arr(vec![u(4),u(original_item),u(0),u(7),vec![0xc0]])));
  let raw=slot_from_payload("3.0.1",p);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  let original=e.inventory();
  e.change_inventory_quantity(added,0,3).unwrap();
  let both=e.inventory();
  assert!(e.inventory_entry_removable(4)&&e.inventory_entry_removable(added));
  assert!(e.inventory_removable_ids().contains(&added));
  let history=e.history().len();
  assert!(e.remove_inventory_entries(&[(4,7),(added,2)]).is_err());
  assert!(e.remove_inventory_entries(&[(4,7),(added,3),(added,3)]).is_err());
  assert_eq!(e.inventory(),both);assert_eq!(e.history().len(),history);
  e.remove_inventory_entries(&[(4,7),(added,3)]).unwrap();
  assert_eq!(e.history().len(),history+1);assert!(e.inventory().is_empty());
  assert!(!e.inventory_entry_removable(added));assert!(!e.inventory_entry_removable(4));
  assert!(e.inventory_creatable().iter().any(|r|r.document_id==added));
  let checkpoint=e.history_checkpoint().unwrap();
  let mut restored=Editor::open(input.clone()).unwrap();restored.restore_history(&checkpoint).unwrap();
  assert!(restored.inventory().is_empty());
  assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),both);
  assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),original);
  assert!(restored.redo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  assert!(restored.inventory().is_empty());
  let saved=Editor::open(restored.export().unwrap()).unwrap();
  assert!(saved.inventory().is_empty());assert_eq!(saved.entries(),restored.entries());assert_eq!(saved.achievements(),restored.achievements());
  // The cancelled ordinary handle can be staged again, independently of the old transaction.
  restored.change_inventory_quantity(added,0,4).unwrap();
  let saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory().len(),1);assert_eq!(saved.inventory()[0].item_id,added_item as i32);assert_eq!(saved.inventory()[0].quantity,4);
 }
}

#[test]
fn all_ordinary_duplicate_families_recompute_membership_after_exact_deletion(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let defs:Vec<_>=complete_quantity_source::RULES.iter().zip(complete_bag_source::BAG_FLAGS)
  .filter_map(|(&(item,rule),&flags)|{
   if flags&1==0{return None}
   let cap=if rule&1==0{1}else if rule&4==0{i32::MAX}else{complete_quantity_source::CUSTOM_CAPS.iter().find(|r|r.0==item).unwrap().1};
   Some((item,cap))
  }).collect();
 assert_eq!(defs.len(),9920);
 assert_eq!(defs.iter().filter(|(_,cap)|*cap<i32::MAX).count(),81);
 for batch in defs.chunks(100){
  let n=7+2*batch.len();
  let mut p=vec![0x93,0];p.extend(u(n as u32+1));p.push(0xdc);p.extend((n as u16).to_be_bytes());
  p.extend_from_slice(&synthetic_payload("3.0.1")[4..]);
  for (i,&(item,_)) in batch.iter().enumerate(){
   for id in [4+2*i as u32,5+2*i as u32]{p.extend(doc(1,arr(vec![u(id),u(item as u32),u(0),u(1),vec![0xc0]])));}
  }
  let tail=4+2*batch.len() as u32;
  p.extend(doc(10,arr(vec![u(tail),guid([0;4]),arr(vec![]),arr(vec![]),arr(vec![]),guid([0;4]),vec![0xc3],vec![0xc0]])));
  p.extend(doc(22,arr(vec![u(tail+1),arr(vec![]),arr(vec![]),vec![0xc0],vec![0xc0],arr(vec![])])));
  let input=slot_from_payload("3.0.1",p);
  let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
  assert_eq!(original.len(),2*batch.len());
  for (pair,&(_,cap)) in original.chunks_exact(2).zip(batch){
   assert!(pair.iter().all(|r|r.quantity_minimum==1&&r.editable==(cap==i32::MAX)));
  }
  let remove:Vec<_>=batch.iter().enumerate().map(|(i,_)|(5+2*i as u32,1)).collect();
  e.remove_inventory_entries(&remove).unwrap();
  let survivors=e.inventory();
  assert!(survivors.iter().all(|r|r.editable&&r.quantity_minimum==0));
  assert!(e.undo_scope(Inventory));assert_eq!(e.inventory(),original);
  assert!(e.redo_scope(Inventory));assert_eq!(e.inventory(),survivors);
  e.change_inventory_quantities(&survivors.iter().map(|r|(r.document_id,1,0)).collect::<Vec<_>>()).unwrap();
  e.change_inventory_quantities(&survivors.iter().map(|r|(r.document_id,0,r.quantity_limit.unwrap().min(2))).collect::<Vec<_>>()).unwrap();
  let checkpoint=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&checkpoint).unwrap();
  assert_eq!(restored.inventory(),e.inventory());
  let saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory(),restored.inventory());
  assert_eq!(saved.entries(),restored.entries());assert_eq!(saved.achievements(),restored.achievements());
 }
}

#[test]
fn ordinary_bag_fish_critter_and_furniture_survive_independent_modern_remote_placements(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let items=[1614767621u32,929880853,692732629,1078556752,427689,3202680];
 for nonnil in [false,true]{
  let remote=|item,table|arr(vec![u(item),u(table),vec![0xc0],if nonnil{furniture_payload([1,0,0])}else{vec![0xc0]},arr(vec![]),arr(vec![]),u(0),arr(vec![])]);
  let objects=arr(items.chunks_exact(2).map(|pair|remote(pair[0],pair[1])).collect());
  let home=arr(vec![guid([5,6,7,8]),l(0),arr(vec![]),u(0),u(0),guid([0;4]),objects,vec![0xc0],vec![0xc0],u(0)]);
  let cabin=arr(vec![guid([9,10,11,12]),arr(vec![home.clone()])]);
  let mut p=synthetic_payload("3.0.1");p[2]=12;p[3]=0x9c;
  for (i,item) in items.iter().enumerate(){p.extend(doc(1,arr(vec![u(4+i as u32),u(*item),u(0),u(7),vec![0xc0]])));}
  p.extend(doc(19,arr(vec![u(0),arr(vec![cabin]),arr(vec![])])));
  let raw=slot_from_payload("3.0.1",p);
  for zipped in [false,true]{
   let input=if zipped{zip(&raw)}else{raw.clone()};let mut e=Editor::open(input.clone()).unwrap();
   let original=e.inventory();assert_eq!(original.len(),items.len());
   assert!(original.iter().all(|r|r.editable&&r.quantity_minimum==if nonnil{1}else{0}));
   let requests:Vec<_>=original.iter().map(|r|(r.document_id,7)).collect();
   if nonnil{assert!(e.remove_inventory_entries(&requests).is_err());assert!(!e.dirty());continue}
   assert!(original.iter().all(|r|e.inventory_entry_removable(r.document_id)));
   e.remove_inventory_entries(&requests).unwrap();
   let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
   assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),original);assert!(restored.redo_scope(Inventory));
   let output=restored.export().unwrap();
   let slot=if zipped{let z=ZipIndex::parse(&output).unwrap();z.extract(&output,z.entries.iter().position(|x|x.name==SLOT).unwrap()).unwrap()}else{output.clone()};
   let checked=read_slot(&slot).unwrap();assert!(checked.envelope.decoded.windows(home.len()).any(|w|w==home.as_slice()));
   let saved=Editor::open(output).unwrap();assert!(saved.inventory().is_empty());assert_eq!(saved.entries(),restored.entries());assert_eq!(saved.achievements(),restored.achievements());
   assert!(items.iter().all(|id|saved.inventory_creatable().iter().any(|r|r.item_id==*id as i32)));
  }
 }
}

#[test]
fn macos_v301_platform_reference_preserved_through_inventory_roundtrip(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let mut p=synthetic_payload("3.0.1");p[2]=5;p[3]=0x96;
 p.extend(doc(1,arr(vec![u(4),u(7285157),u(0),u(7),vec![0xc0]])));
 let mut raw=slot_from_payload("3.0.1",p);
 let marker=read_slot(&raw).unwrap().envelope.marker;
 assert_eq!(&raw[marker-2..marker],&[0x91,9]);
 raw[marker-1]=7;
 for zipped in [false,true]{
  let input=if zipped{zip(&raw)}else{raw.clone()};
  let mut e=Editor::open(input.clone()).unwrap();
  let original=e.inventory();assert_eq!(original.len(),1);assert!(e.inventory_entry_removable(4));
  e.change_inventory_quantity(4,7,12).unwrap();
  e.remove_inventory_entries(&[(4,12)]).unwrap();
  let checkpoint=e.history_checkpoint().unwrap();
  let mut restored=Editor::open(input).unwrap();restored.restore_history(&checkpoint).unwrap();
  assert!(restored.inventory().is_empty());assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory()[0].quantity,12);assert!(restored.redo_scope(Inventory));
  let output=restored.export().unwrap();
  let reopened=Editor::open(output.clone()).unwrap();assert!(reopened.inventory().is_empty());
  let slot=if zipped{let z=ZipIndex::parse(&output).unwrap();z.extract(&output,z.entries.iter().position(|x|x.name==SLOT).unwrap()).unwrap()}else{output};
  let checked=read_slot(&slot).unwrap();assert_eq!(&slot[..checked.envelope.marker],&raw[..marker]);
  assert_eq!(reopened.entries(),restored.entries());assert_eq!(reopened.achievements(),restored.achievements());
 }
 for platform in [0,6,8,10,14,255]{
  let mut rejected=raw.clone();rejected[marker-1]=platform;assert!(Editor::open(rejected).is_err());
 }
 let mut older=slot("3.0.0");let marker=read_slot(&older).unwrap().envelope.marker;older[marker-1]=7;
 assert!(Editor::open(older).is_err());
}

#[test]
fn physical_removal_protects_exact_referenced_uid_not_independent_ordinary_base(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let item=61381969u32;
 let make=|uid:u32,duplicate:bool,bare:bool|{
  let mut p=synthetic_payload("3.0.1");p[2]=20;p[3]=0x99+u8::from(duplicate)+u8::from(bare);
  p.extend(doc(1,arr(vec![u(4),u(item),u(0),u(5),vec![0xc0]])));
  p.extend(doc(1,arr(vec![u(5),u(item),u(21),u(2),furniture_payload([0,2,0])])));
  p.extend(doc(1,arr(vec![u(6),u(item),u(22),u(3),furniture_payload([502,2,0])])));
  if duplicate{p.extend(doc(1,arr(vec![u(7),u(427689),u(21),u(2),furniture_payload([0,2,0])])));}
  let cafe=arr(vec![vec![0xc2],vec![0x80],u(0),u(0),guid([0;4]),arr(vec![arr(vec![u(item),u(uid)])]),u(0),u(0),u(0),l(0)]);
  p.extend(doc(32,arr(vec![u(9),guid([7,0,0,0]),u(0),arr(vec![doc(38,cafe)])])));
  if bare{
   let home=arr(vec![guid([41,42,43,44]),arr(vec![]),u(item),u(0),guid([0;4]),l(0),
    vec![0xc0],vec![0xc2],vec![0xc0],arr(vec![]),vec![0xc0],vec![0xc0],u(0),u(0),arr(vec![])]);
   p.extend(doc(32,arr(vec![u(10),guid([8,0,0,0]),u(0),arr(vec![doc(8,arr(vec![arr(vec![home])]))])])));}
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make(21,false,false);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();let original=e.inventory();
  assert!(e.inventory_entry_removable(4));assert!(!e.inventory_entry_removable(5));assert!(!e.inventory_entry_removable(6));
  assert!(e.remove_inventory_entries(&[(4,5),(5,2)]).is_err());assert!(!e.dirty());
  e.remove_inventory_entries(&[(4,5)]).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),original);assert!(restored.redo_scope(Inventory));
  let saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory().len(),2);assert_eq!(saved.inventory()[0].document_id,5);
  assert_eq!(saved.inventory_original_unique_payload(5),e.inventory_original_unique_payload(5));
  assert!(!saved.inventory_entry_removable(5));
 }
 for raw in [make(0,false,false),make(99,false,false),make(21,true,false),make(21,false,true)]{
  let mut e=Editor::open(raw).unwrap();let original=e.inventory();
  assert!(!e.inventory_entry_removable(4));assert!(!e.inventory_entry_removable(6));
  assert!(e.remove_inventory_entries(&[(4,5),(6,3)]).is_err());assert_eq!(e.inventory(),original);assert!(!e.dirty());
 }
}





#[test]
fn empty_flower_families_offer_distinct_source_defined_starters(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let item=43114910i32;let candidate=0x80000000|item as u32;
 let make=|duplicate:bool|{
  let mut p=synthetic_payload("3.0.1");p[2]=5;p[3]=0x97;
  for (id,uid,color) in [(4,21,2),(5,22,if duplicate{2}else{5})]{
   p.extend(doc(1,arr(vec![u(id),u(item as u32),u(uid),u(2),plain_flower(color)])));
  }
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make(false);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert!(!e.inventory_absent_flower_ids().contains(&item));
  e.change_inventory_quantity(4,2,0).unwrap();
  assert!(!e.inventory_absent_flower_ids().contains(&item));
  e.change_inventory_quantity(5,2,0).unwrap();
  assert!(e.inventory_absent_flower_ids().contains(&item));
  assert_eq!(e.inventory_flower_creation_variants(candidate),vec![[6,10,0,0]]);
  assert!(e.create_inventory_flower_variant(candidate,[0;4],[6,2,0,0],1).is_err());
  let witness=[6,10,0,0];let target=[6,8,10,16];
  assert!(e.inventory_flower_preview(candidate,witness,[6,5,0,0]).is_err());
  assert!(e.inventory_flower_preview(candidate,witness,target).unwrap().1);
  let id=e.create_inventory_flower_variant(candidate,witness,target,3).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();assert_eq!(restored.inventory(),e.inventory());
  assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let saved=Editor::open(restored.export().unwrap()).unwrap();
  assert_eq!(saved.inventory()[0].quantity,0);assert_eq!(saved.inventory()[1].quantity,0);
  assert_eq!(saved.inventory_original_unique_payload(4),Some(plain_flower(2).as_slice()));
  assert_eq!(saved.inventory_original_unique_payload(5),Some(plain_flower(5).as_slice()));
  assert!(saved.inventory().iter().any(|r|r.quantity==3&&saved.inventory_unique_data(r.document_id)==e.inventory_unique_data(id)));
 }
 let duplicate=Editor::open(make(true)).unwrap();
 assert!(!duplicate.inventory_absent_flower_ids().contains(&item));
}

#[test]
fn large_palette_families_use_native_approximate_equality_not_row_count(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let item=1835273963u32;
 let rgba=|r:f32|{let mut a=vec![0x94];for x in [r,0.5f32,0.25f32,1.0f32]{a.push(0xca);a.extend(x.to_bits().to_be_bytes());}a};
 let encode=|r:f32|arr(vec![vec![6],arr(vec![rgba(r),rgba(0.5),rgba(0.25)])]);
 let make=|duplicate:bool|{
  let base=synthetic_payload("3.0.1");let mut p=vec![0x93,0];p.extend(u(300));p.push(0xdc);p.extend(262u16.to_be_bytes());p.extend(&base[4..]);
  for i in 0..257u32{
   let r=if duplicate&&i==256{0.0}else{i as f32/512.0};
   p.extend(doc(1,arr(vec![u(4+i),u(item),u(301+i),u(2),encode(r)])));
  }
  slot_from_payload("3.0.1",p)
 };
 for zipped in [false,true]{
  let raw=make(false);let input=if zipped{zip(&raw)}else{raw};let mut e=Editor::open(input.clone()).unwrap();let before=e.inventory();
  assert_eq!(before.iter().filter(|r|r.editable).count(),257);
  assert_eq!(e.inventory_palette_edit_hints().count(),257);
  let original=e.inventory_palette_variants(4);assert!(!original.is_empty());
  e.change_inventory_quantity(4,2,9).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),before);assert!(restored.redo_scope(Inventory));
  let saved=Editor::open(restored.export().unwrap()).unwrap();assert_eq!(saved.inventory()[0].quantity,9);assert_eq!(saved.inventory_original_unique_payload(4),Some(encode(0.0).as_slice()));
  let mut collision=Editor::open(make(true)).unwrap();assert_eq!(collision.inventory_palette_edit_hints().count(),255);
  assert!(collision.inventory_palette_variants(4).is_empty());assert!(collision.inventory_palette_variants(260).is_empty());
  assert!(!collision.inventory_palette_variants(5).is_empty());assert!(!collision.dirty());
  collision.change_inventory_quantity(5,2,9).unwrap();
 }
}


#[test]
fn large_boba_families_keep_verified_variant_edit_and_creation(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let encode=|v:[u32;5]|arr(vec![vec![4],arr(v.into_iter().map(u).collect())]);
 let first=[6,44,76,75,73];let target=[6,44,79,75,71];
 let mut variants=vec![first];
 // The other complete saved identities are unsupported recipe values;
 // preserve their bytes, never offer them for creation or editing.
 for i in 0..256u32{variants.push([6,44,76,75,1000+i]);}
 for zipped in [false,true]{
  let base=synthetic_payload("3.0.1");let mut p=vec![0x93,0];p.extend(u(300));p.push(0xdc);p.extend(262u16.to_be_bytes());p.extend(&base[4..]);
  for (i,&v) in variants.iter().enumerate(){p.extend(doc(1,arr(vec![u(4+i as u32),u(1798633565),u(301+i as u32),u(2),encode(v)])));}
  let raw=slot_from_payload("3.0.1",p);let input=if zipped{zip(&raw)}else{raw};let mut e=Editor::open(input.clone()).unwrap();
  let before=e.inventory();assert_eq!(e.inventory_boba_rows().filter(|(_,_,editable)|*editable).count(),1);
  assert!(e.inventory_boba_variants(5).is_empty());
  assert!(e.inventory_boba_creation_variants(4).contains(&target.map(|x|x as i32)));
  e.create_inventory_boba_variant(4,first.map(|x|x as i32),target.map(|x|x as i32),3).unwrap();
  e.change_inventory_quantity(4,2,0).unwrap();
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
  assert!(restored.undo_scope(Inventory));assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),before);
  assert!(restored.redo_scope(Inventory));assert!(restored.redo_scope(Inventory));
  let saved=Editor::open(restored.export().unwrap()).unwrap();assert_eq!(saved.inventory().len(),258);
  for (i,&v) in variants.iter().enumerate().skip(1){assert_eq!(saved.inventory_original_unique_payload(4+i as u32),Some(encode(v).as_slice()));}
  assert!(saved.inventory_boba_rows().any(|(_,v,editable)|v==target.map(|x|x as i32)&&editable));
 }
}


#[test]
fn all_unrestricted_flower_species_can_replace_a_stack_atomically(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let species=[43114910,183701770,203856820,228573412,252458237,261557677,274491259,275816250,462608550,668399845,1223758923,1299466625,1331175279,1386186941,1554283135,1561432864,1583118562,1669522060,1695731578,1804880447,1934826268,1968535430,2105820233];
 let before=[6,6,0,0];let after=[7,8,0,0];
 for (i,&item) in species.iter().enumerate(){
  let target=species[(i+1)%species.len()];
  let mut p=synthetic_payload("3.0.1");p[2]=6;p[3]=0x97;
  p.extend(doc(1,arr(vec![u(4),u(item as u32),u(21),u(3),plain_flower(6)])));
  p.extend(doc(1,arr(vec![u(5),u(target as u32),u(22),u(2),plain_flower(6)])));
  let raw=slot_from_payload("3.0.1",p);
  for zipped in [false,true]{
   let input=if zipped{zip(&raw)}else{raw.clone()};let mut e=Editor::open(input.clone()).unwrap();
   let original=e.inventory();
   let choices=e.inventory_flower_species_options(4,before,before);
   assert!(!choices.contains(&target));assert_eq!(choices.len(),21,"source {item}");
   assert!(e.inventory_flower_species_options(4,before,after).contains(&target));
   assert!(e.replace_inventory_flower_species(4,item,before,target,before,3).is_err());
   assert!(e.replace_inventory_flower_species(4,item,before,target,after,2).is_err());
   assert!(e.replace_inventory_flower_species(4,target,before,target,after,3).is_err());assert!(!e.dirty());
   let id=e.replace_inventory_flower_species(4,item,before,target,after,3).unwrap();
   assert_eq!(e.history().len(),1);assert!(e.inventory().iter().any(|r|r.document_id==id&&r.item_id==target&&r.quantity==3));
   assert!(e.inventory().iter().all(|r|r.document_id!=4));
   let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();restored.restore_history(&cp).unwrap();
   assert_eq!(restored.inventory(),e.inventory());assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory(),original);
   assert!(restored.redo_scope(Inventory));
   let saved=Editor::open(restored.export().unwrap()).unwrap();
   assert_eq!(saved.inventory().len(),2);assert!(saved.inventory().iter().all(|r|r.document_id!=4));
   assert_eq!(saved.inventory_original_unique_payload(5),Some(plain_flower(6).as_slice()));
   assert!(saved.inventory().iter().any(|r|r.item_id==target&&r.quantity==3&&saved.inventory_unique_data(r.document_id)==restored.inventory_unique_data(id)));
   let next=species[(i+2)%species.len()];
   let id2=restored.replace_inventory_flower_species(id,target,after,next,after,3).unwrap();
   assert!(restored.undo_scope(Inventory));assert!(restored.redo_scope(Inventory));
   assert!(restored.inventory().iter().any(|r|r.document_id==id2&&r.item_id==next));
  }
 }
}

#[test]
fn flower_species_preview_uses_destination_pattern_and_reserves_target_peers(){
 let item=43114910;let target=183701770;let before=[6,6,0,0];let draft=[6,6,12,16];
 let mut p=synthetic_payload("3.0.1");p[2]=5;p[3]=0x96;
 p.extend(doc(1,arr(vec![u(4),u(item as u32),u(21),u(3),plain_flower(6)])));
 let raw=slot_from_payload("3.0.1",p);
 for zipped in [false,true]{
  let mut e=Editor::open(if zipped{zip(&raw)}else{raw.clone()}).unwrap();
  assert!(e.inventory_flower_preview(4,before,draft).is_err());
  let options=e.inventory_flower_species_preview(4,before,target,before).unwrap();
  assert!(options.contains(&draft));
  assert!(e.inventory_flower_species_preview(4,before,target,draft).is_ok());
  assert!(e.inventory_flower_species_preview(4,before,item,draft).is_err());
  assert!(!e.dirty());
  let id=e.replace_inventory_flower_species(4,item,before,target,draft,3).unwrap();
  assert_eq!(e.inventory()[0].document_id,id);
  let saved=Editor::open(e.export().unwrap()).unwrap();
  assert_eq!(saved.inventory()[0].item_id,target);
  assert_eq!(saved.inventory_unique_data(saved.inventory()[0].document_id),e.inventory_unique_data(id));
 }
}

#[test]
fn exhausted_flower_defaults_keep_verified_free_starters_after_zero_and_creation(){
 use hkia_save_core::collection::HistoryScope::Inventory;
 let item=43114910u32;let candidate=0x80000000|item;
 for zipped in [false,true]{
  let mut p=synthetic_payload("3.0.1");p[2]=6;p[3]=0x98;
  for (id,uid,color) in [(4,21,2),(5,22,5),(6,23,10)]{
   p.extend(doc(1,arr(vec![u(id),u(item),u(uid),u(2),plain_flower(color)])));
  }
  let raw=slot_from_payload("3.0.1",p);let input=if zipped{zip(&raw)}else{raw};
  let mut e=Editor::open(input.clone()).unwrap();
  assert!(!e.inventory_absent_flower_ids().contains(&(item as i32)));
  e.change_inventory_quantities(&[(4,2,0),(5,2,0),(6,2,0)]).unwrap();
  assert!(e.inventory_absent_flower_ids().contains(&(item as i32)));
  let options=e.inventory_flower_creation_variants(candidate);
  assert_eq!(options.len(),1);let starter=options[0];
  assert!(![[6,2,0,0],[6,5,0,0],[6,10,0,0]].contains(&starter));
  assert!(e.inventory_flower_preview(candidate,starter,starter).unwrap().1);
  assert!(e.create_inventory_flower_variant(candidate,starter,[6,14,0,0],1).is_err());
  let id=e.create_inventory_flower_variant(candidate,starter,starter,3).unwrap();
  let next=e.inventory_flower_creation_variants(candidate);
  assert_eq!(next.len(),1);assert_ne!(next[0],starter);
  let cp=e.history_checkpoint().unwrap();let mut restored=Editor::open(input).unwrap();
  restored.restore_history(&cp).unwrap();assert_eq!(restored.inventory(),e.inventory());
  assert!(restored.undo_scope(Inventory));assert_eq!(restored.inventory_flower_creation_variants(candidate),options);
  assert!(restored.redo_scope(Inventory));
  let saved=Editor::open(restored.export().unwrap()).unwrap();
  for (id,color) in [(4,2),(5,5),(6,10)]{
   assert_eq!(saved.inventory_original_unique_payload(id),Some(plain_flower(color).as_slice()));
  }
  assert!(saved.inventory().iter().any(|r|r.quantity==3&&saved.inventory_unique_data(r.document_id)==e.inventory_unique_data(id)));
 }
 let mut e=Editor::open(slot_from_payload("3.0.1",synthetic_payload("3.0.1"))).unwrap();
 for color in [2,5,10]{e.create_inventory_flower_variant(candidate,[0;4],[6,color,0,0],1).unwrap();}
 let options=e.inventory_flower_creation_variants(candidate);assert_eq!(options.len(),1);
 assert!(e.inventory_flower_preview(candidate,options[0],options[0]).unwrap().1);
}


#[test]
fn all_source_verified_flower_add_families_keep_a_free_starter_after_defaults(){
 let raw=slot_from_payload("3.0.1",synthetic_payload("3.0.1"));
 let source=Editor::open(raw.clone()).unwrap();
 let ids=source.inventory_absent_flower_ids();assert_eq!(ids.len(),105);
 for item in ids{
  let candidate=0x80000000|item as u32;
  let mut e=Editor::open(raw.clone()).unwrap();
  let defaults=e.inventory_flower_creation_variants(candidate);
  assert!(!defaults.is_empty(),"item {item}");
  for &v in &defaults{e.create_inventory_flower_variant(candidate,[0;4],v,1).unwrap();}
  let options=e.inventory_flower_creation_variants(candidate);
  assert_eq!(options.len(),1,"item {item}");
  let starter=options[0];
  assert!(!defaults.contains(&starter),"item {item}");
  assert!(e.inventory_flower_preview(candidate,starter,starter).unwrap().1,"item {item}");
  assert!(e.create_inventory_flower_variant(candidate,starter,starter,1).is_ok(),"item {item}");
 }
}

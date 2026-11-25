//! Internal, schema-directed root document membership splice.
//! This is structural machinery only. It is NOT an inventory operation,
//! allocation policy, entitlement check, or authorization to remove an item.
use crate::{Error,MAX_DECODED,achievement::splice,envelope::Version,native::{NativeIndex,index_native},wire::Cursor};
use std::collections::HashSet;
type Key=(i32,u32);
type Insert=(Key,Vec<u8>);
const MAX_DOCUMENTS:usize=1_000_000;
fn array_header(n:usize,out:&mut Vec<u8>)->Result<(),Error>{
 if n==0||n>MAX_DOCUMENTS{return Err(Error::Budget)}
 if n<16{out.push(0x90|n as u8)}
 else if n<=u16::MAX as usize{out.push(0xdc);out.extend((n as u16).to_be_bytes());}
 else{out.push(0xdd);out.extend((n as u32).to_be_bytes());}
 Ok(())
}
/// Switch 3.0.1 Insert<T>/Upsert<T> allocate an Id==0 entity by
/// preincrementing DbRoot.NextId and assigning the resulting value.
/// Never guess from the largest ID of one document type. Reject a candidate
/// collision with any original document rather than advancing by inference.
pub(crate) fn allocate_ids(index:&NativeIndex,count:usize)->Result<Vec<u32>,Error>{
 if count==0||index.documents.checked_add(count).is_none_or(|n|n>MAX_DOCUMENTS){return Err(Error::Budget)}
 let (next_id,_)=index.root_next_id.as_ref().ok_or(Error::Schema)?;
 if *next_id<0{return Err(Error::Schema)}
 let last=next_id.checked_add(i32::try_from(count).map_err(|_|Error::Overflow)?).ok_or(Error::Overflow)?;
 let first=next_id.checked_add(1).ok_or(Error::Overflow)?;
 if index.document_spans.iter().any(|doc|(first as u32..=last as u32).contains(&doc.key.1)){return Err(Error::Duplicate)}
 Ok((first as u32..=last as u32).collect())
}
/// Native Inventory hydration uses signed Max(saved UniqueId), seeded with
/// zero. AddItems allocates a new UID by incrementing largestUniqueId for
/// a non-null unmatched payload. This counter is not DbRoot.NextId.
/// Reject unknown identities and reference collisions instead of skipping
/// numbers or assuming a missing referenced row is free.
pub(crate) fn allocate_inventory_unique_ids(index:&NativeIndex,version:Version,count:usize)->Result<Vec<i32>,Error>{
 if version!=Version::V301||index.inventory_item_refs_incomplete||index.inventory_payload_refs_incomplete{return Err(Error::Schema)}
 if count==0||count>MAX_DOCUMENTS{return Err(Error::Budget)}
 let mut used=HashSet::new();let mut largest=0i32;
 for row in &index.inventory{
  if row.item_id.is_none_or(|id|id<=0)||row.unique_is_nil.is_none()||row.quantity.is_none_or(|q|q<0)||!row.fields.iter().all(Option::is_some){return Err(Error::Schema)}
  let uid=row.unique_id.ok_or(Error::Schema)?;
  if uid<0||uid==0&&row.unique_is_nil!=Some(true)||uid>0&&row.unique_is_nil!=Some(false){return Err(Error::Schema)}
  if uid>0&&!used.insert(uid){return Err(Error::Duplicate)}
  largest=largest.max(uid);
 }
 let first=largest.checked_add(1).ok_or(Error::Overflow)?;
 let last=largest.checked_add(i32::try_from(count).map_err(|_|Error::Overflow)?).ok_or(Error::Overflow)?;
 if index.inventory_item_refs.iter().any(|&(_,uid)|(first..=last).contains(&uid))||
  index.inventory_legacy_uid_refs.iter().any(|uid|(first..=last).contains(uid)){return Err(Error::Duplicate)}
 Ok((first..=last).collect())
}
/// The caller must authorize every domain edit and construct every new
/// record in Rust. Only complete previously schema-walked document spans
/// can be removed; insertion is at an exact existing identity boundary.
/// All surviving record bytes and their relative order are preserved.
pub(crate) fn rewrite(raw:&[u8],version:Version,index:&NativeIndex,remove:&[Key],insert:Option<(Key,&[Insert])>)->Result<(Vec<u8>,usize),Error>{
 let root=index.root_documents_span.clone().ok_or(Error::Schema)?;
 let mut cursor=Cursor::new(raw.get(root.clone()).ok_or(Error::Schema)?);
 let count=cursor.array()?;
 if count!=index.documents||count!=index.document_spans.len(){return Err(Error::Schema)}
 let removed:HashSet<_>=remove.iter().copied().collect();
 if removed.len()!=remove.len(){return Err(Error::Duplicate)}
 let add_count=insert.map_or(0,|(_,rows)|rows.len());
 if removed.is_empty()&&add_count==0{return Err(Error::Schema)}
 if insert.is_some_and(|(anchor,rows)|rows.is_empty()||removed.contains(&anchor)){return Err(Error::Schema)}
 let next_count=count.checked_sub(removed.len()).and_then(|n|n.checked_add(add_count)).ok_or(Error::Budget)?;
 let (old_next_id,old_next_span)=index.root_next_id.as_ref().ok_or(Error::Schema)?;
 if old_next_span.end>root.start||old_next_span.start>=old_next_span.end{return Err(Error::Schema)}
 let mut next_cursor=Cursor::new(raw.get(old_next_span.clone()).ok_or(Error::Schema)?);
 if next_cursor.int(i32::MIN as i128,i32::MAX as i128)?!=i128::from(*old_next_id)||next_cursor.pos!=old_next_span.len(){return Err(Error::Schema)}
 let next_id=if let Some((_,rows))=insert{
  let ids=allocate_ids(index,rows.len())?;
  if !rows.iter().zip(&ids).all(|(((_,id),_),allocated)|id==allocated){return Err(Error::Schema)}
  *ids.last().ok_or(Error::Schema)? as i32
 }else{*old_next_id};
 let mut replacement=Vec::new();array_header(next_count,&mut replacement)?;
 let mut expected=Vec::with_capacity(next_count);
 let mut keys=HashSet::new();
 let mut all_keys=HashSet::new();
 let mut at=root.start.checked_add(cursor.pos).ok_or(Error::Overflow)?;
 let mut removals_found=0;let mut inserted=false;
 let retained_size=raw.len().checked_sub(root.len()).ok_or(Error::Overflow)?;
 let max_replacement=MAX_DECODED.checked_sub(retained_size).ok_or(Error::Budget)?;
 let append=|out:&mut Vec<u8>,bytes:&[u8]|->Result<(),Error>{
  if bytes.is_empty()||out.len().checked_add(bytes.len()).is_none_or(|n|n>max_replacement){return Err(Error::Budget)}
  out.extend_from_slice(bytes);Ok(())
 };
 for doc in &index.document_spans{
  if doc.bytes.start!=at||doc.bytes.end<=at||doc.bytes.end>root.end||!all_keys.insert(doc.key){return Err(Error::Schema)}
  at=doc.bytes.end;
  if removed.contains(&doc.key){removals_found+=1;continue}
  let bytes=raw.get(doc.bytes.clone()).ok_or(Error::Schema)?;
  if !keys.insert(doc.key){return Err(Error::Duplicate)}
  append(&mut replacement,bytes)?;expected.push((doc.key,bytes));
  if let Some((anchor,rows))=insert{
   if doc.key==anchor{
    if inserted{return Err(Error::Duplicate)}
    for (key,bytes) in rows{
     if !keys.insert(*key){return Err(Error::Duplicate)}
     append(&mut replacement,bytes)?;expected.push((*key,bytes.as_slice()));
    }
    inserted=true;
   }
  }
 }
 if at!=root.end||removals_found!=removed.len()||insert.is_some()!=inserted||expected.len()!=next_count{return Err(Error::Schema)}
 // Do not replace a removed record with a different payload under its old
 // identity. Such edits must use the domain CAS writer and exact field spans.
 if let Some((_,rows))=insert{if rows.iter().any(|(key,_)|all_keys.contains(key)){return Err(Error::Duplicate)}}
 let mut patches=vec![(root.clone(),replacement)];
 if add_count>0{
  let mut encoded=vec![0xd2];encoded.extend(next_id.to_be_bytes());
  patches.push((old_next_span.clone(),encoded));
 }
 let (out,first)=splice(raw,patches)?;
 let checked=index_native(&out,version)?;
 if checked.documents!=next_count||checked.document_spans.len()!=expected.len(){return Err(Error::Schema)}
 for (actual,(key,bytes)) in checked.document_spans.iter().zip(expected){
  if actual.key!=key||out.get(actual.bytes.clone())!=Some(bytes){return Err(Error::Schema)}
 }
 let new_root=checked.root_documents_span.ok_or(Error::Schema)?;
 let (actual_next_id,next_span)=checked.root_next_id.ok_or(Error::Schema)?;
 if actual_next_id!=next_id||next_span.end>new_root.start||
  out[..next_span.start]!=raw[..old_next_span.start]||
  out[next_span.end..new_root.start]!=raw[old_next_span.end..root.start]||
  out[new_root.end..]!=raw[root.end..]||
  (add_count==0&&out[next_span]!=raw[old_next_span.clone()]){return Err(Error::Schema)}
 Ok((out,first))
}

#[cfg(test)]
mod tests{
 use super::*;
 fn u(n:u32)->Vec<u8>{let mut r=vec![0xce];r.extend(n.to_be_bytes());r}
 fn arr(a:Vec<Vec<u8>>)->Vec<u8>{assert!(a.len()<16);let mut b=vec![0x90|a.len() as u8];for x in a{b.extend(x)}b}
 fn doc(tag:u8,fields:Vec<Vec<u8>>)->Vec<u8>{arr(vec![vec![tag],arr(fields)])}
 fn guid(words:[u32;4])->Vec<u8>{words.into_iter().flat_map(u).collect()}
 fn f(n:f32)->Vec<u8>{let mut r=vec![0xca];r.extend(n.to_bits().to_be_bytes());r}
 fn item(id:u32,item_id:u32,qty:u32)->Vec<u8>{doc(1,vec![u(id),u(item_id),u(0),u(qty),vec![0xc0]])}
 fn payload(n:usize)->Vec<u8>{
  let mut rows=vec![
   doc(18,vec![vec![0],u(87),vec![0xa5,b'3',b'.',b'0',b'.',b'1']]),
   doc(16,vec![vec![1],guid([1,0,0,1]),arr(vec![vec![0xc2],f(1.0),vec![0xc0]])]),
   doc(17,vec![vec![1],guid([1,0,0,2]),arr(vec![f(1.0),vec![0xc0],vec![0x90]])]),
   doc(32,vec![vec![3],guid([0,0,0,3]),vec![0],arr(vec![doc(39,vec![vec![0x80],vec![0x80]])])])
  ];
  for i in 0..n{rows.push(item((i+4) as u32,315822+i as u32,6))}
  let mut root=vec![0x93,0,20];array_header(rows.len(),&mut root).unwrap();for row in rows{root.extend(row)}root
 }
 #[test]
 fn unique_inventory_allocator_uses_native_hydrated_max_and_rejects_collisions(){
  let raw=payload(2);let mut index=index_native(&raw,Version::V301).unwrap();
  assert_eq!(allocate_inventory_unique_ids(&index,Version::V301,2).unwrap(),vec![1,2]);
  index.inventory[0].unique_id=Some(41);index.inventory[0].unique_is_nil=Some(false);
  assert_eq!(allocate_inventory_unique_ids(&index,Version::V301,2).unwrap(),vec![42,43]);
  index.inventory_item_refs.insert((315822,43));
  assert_eq!(allocate_inventory_unique_ids(&index,Version::V301,2),Err(Error::Duplicate));
  index.inventory_item_refs.clear();index.inventory_legacy_uid_refs.insert(42);
  assert_eq!(allocate_inventory_unique_ids(&index,Version::V301,1),Err(Error::Duplicate));
  index.inventory_legacy_uid_refs.clear();index.inventory_payload_refs_incomplete=true;
  assert_eq!(allocate_inventory_unique_ids(&index,Version::V301,1),Err(Error::Schema));
  index.inventory_payload_refs_incomplete=false;
  index.inventory[1].unique_id=Some(41);index.inventory[1].unique_is_nil=Some(false);
  assert_eq!(allocate_inventory_unique_ids(&index,Version::V301,1),Err(Error::Duplicate));
  index.inventory[1].unique_id=Some(i32::MAX);
  assert_eq!(allocate_inventory_unique_ids(&index,Version::V301,1),Err(Error::Overflow));
  assert_eq!(allocate_inventory_unique_ids(&index,Version::V300,1),Err(Error::Schema));
 }
 #[test]
 fn root_membership_preserves_exact_records_and_crosses_array_header_boundary(){
  let raw=payload(11);let old=index_native(&raw,Version::V301).unwrap();
  assert_eq!(old.documents,15);
  assert_eq!(allocate_ids(&old,2).unwrap(),vec![21,22]);
  let add=vec![((1,21),item(21,517031,8))];
  let (next,_)=rewrite(&raw,Version::V301,&old,&[],Some(((1,14),&add))).unwrap();
  let read=index_native(&next,Version::V301).unwrap();
  assert_eq!(read.documents,16);assert_eq!(next[read.root_documents_span.as_ref().unwrap().start],0xdc);
  assert_eq!(read.root_next_id.as_ref().unwrap().0,21);
  assert_eq!(read.inventory.last().unwrap().id,21);
  assert_eq!(read.inventory.last().unwrap().quantity,Some(8));
  let (restored,_)=rewrite(&next,Version::V301,&read,&[(1,21)],None).unwrap();
  let reread=index_native(&restored,Version::V301).unwrap();
  assert_eq!(reread.root_next_id.as_ref().unwrap().0,21,"deletion never rewinds allocation counter");
  let old_span=old.root_documents_span.as_ref().unwrap();
  let restored_span=reread.root_documents_span.as_ref().unwrap();
  assert_eq!(&restored[restored_span.clone()],&raw[old_span.clone()]);
  assert_eq!(allocate_ids(&reread,1).unwrap(),vec![22]);
  // Same numeric ID in a different tag remains untouched.
  let (deleted,_)=rewrite(&raw,Version::V301,&old,&[(1,4)],None).unwrap();
  let checked=index_native(&deleted,Version::V301).unwrap();
  assert_eq!(checked.inventory.len(),10);assert_eq!(checked.achievements,old.achievements);
  assert_eq!(checked.counters,old.counters);
 }
 #[test]
 fn rejects_missing_duplicate_stale_or_mismatched_membership(){
  let raw=payload(2);let index=index_native(&raw,Version::V301).unwrap();
  let add=vec![((1,21),item(21,517031,8))];
  assert!(rewrite(&raw,Version::V301,&index,&[],None).is_err());
  assert!(rewrite(&raw,Version::V301,&index,&[(1,99)],None).is_err());
  assert!(rewrite(&raw,Version::V301,&index,&[(1,4),(1,4)],None).is_err());
  assert!(rewrite(&raw,Version::V301,&index,&[(1,4)],Some(((1,4),&add))).is_err());
  assert!(rewrite(&raw,Version::V301,&index,&[],Some(((1,99),&add))).is_err());
  let duplicate=vec![((1,4),item(4,517031,8))];
  assert!(rewrite(&raw,Version::V301,&index,&[],Some(((1,5),&duplicate))).is_err());
  assert!(rewrite(&raw,Version::V301,&index,&[(1,4)],Some(((1,5),&duplicate))).is_err());
  let wrong=vec![((1,21),item(22,517031,8))];
  assert!(rewrite(&raw,Version::V301,&index,&[],Some(((1,5),&wrong))).is_err());
  assert!(rewrite(&raw[..raw.len()-1],Version::V301,&index,&[(1,4)],None).is_err());
  let mut collision=raw.clone();collision[2]=3;
  let idx=index_native(&collision,Version::V301).unwrap();
  assert_eq!(allocate_ids(&idx,1),Err(Error::Duplicate));
  let mut overflow=raw.clone();overflow.splice(2..3,[0xd2,0x7f,0xff,0xff,0xff]);
  let idx=index_native(&overflow,Version::V301).unwrap();
  assert_eq!(allocate_ids(&idx,1),Err(Error::Overflow));
 }
}

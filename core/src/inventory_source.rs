//! Source-defined v3.0.1 item quantity semantics. No entitlement inference.
use crate::inventory_source_data::{RULES,CUSTOM_CAPS};
/// Maximum from InventoryItemExtensions.MaxCount(IInventoryItemData):
/// !Stackable -> 1; HasCustomMaxCount -> CustomMaxCount; otherwise Int32.MaxValue.
/// None means no verified definition or a payload is required for this ID.
pub(crate) fn ordinary_quantity_limit(item_id:i32)->Option<i32>{
 let flags=RULES[RULES.binary_search_by_key(&item_id,|row|row.0).ok()?].1;
 if flags&2!=0{return None}
 if flags&1==0{return Some(1)}
 if flags&4==0{return Some(i32::MAX)}
 CUSTOM_CAPS.binary_search_by_key(&item_id,|row|row.0).ok().map(|i|CUSTOM_CAPS[i].1).filter(|&cap|cap>0)
}
#[cfg(test)]
mod tests{
 use super::*;
 fn hex(bytes:&[u8])->String{bytes.iter().map(|b|format!("{b:02x}")).collect()}
 #[test]fn complete_source_identity_and_definition_flags(){
  assert_eq!(RULES.len(),12163);
  assert!(RULES.windows(2).all(|x|x[0].0<x[1].0)&&RULES[0].0>0);
  assert!(RULES.iter().all(|&(_,f)|f<=15));
  let ids:Vec<u8>=RULES.iter().flat_map(|&(id,_)|id.to_le_bytes()).collect();
  let flags:Vec<u8>=RULES.iter().map(|&(_,f)|f).collect();
  assert_eq!(hex(&crate::digest::sha256(&ids)),"8a55e11da2b28b30bb212424159657d3d9e7b47baf6a21ed94fd8615d1ef4702");
  assert_eq!(hex(&crate::digest::sha256(&flags)),"7f217f6e4d73de38591ab8975a3f1c0c322baec8b3dcf0aecda3f6a322157da8");
  assert_eq!([1,2,4,8].map(|mask|flags.iter().filter(|&&f|f&mask!=0).count()),[10293,138,13,38]);
  assert_eq!(CUSTOM_CAPS.len(),13);
  assert_eq!(RULES.iter().filter(|&&(_,f)|f&4!=0).map(|&(id,_)|id).collect::<Vec<_>>(),CUSTOM_CAPS.iter().map(|&(id,_)|id).collect::<Vec<_>>());
  assert!(CUSTOM_CAPS.iter().all(|&(_,cap)|cap>0));
 }
 #[test]fn limits_and_required_unique_are_not_guessed(){
  assert_eq!(ordinary_quantity_limit(315822),Some(i32::MAX));
  assert_eq!(ordinary_quantity_limit(413462588),Some(3));
  assert_eq!(ordinary_quantity_limit(1375142756),Some(10));
  assert_eq!(ordinary_quantity_limit(1900000001),None);
  assert_eq!(ordinary_quantity_limit(1900000002),None);
  assert_eq!(ordinary_quantity_limit(i32::MAX-1),None);
  assert_eq!(ordinary_quantity_limit(i32::MAX),Some(1)); // Bubble Wand is an actual definition.
  let id=RULES.iter().find(|&&(_,f)|f&3==0).unwrap().0;
  assert_eq!(ordinary_quantity_limit(id),Some(1));
 }
}

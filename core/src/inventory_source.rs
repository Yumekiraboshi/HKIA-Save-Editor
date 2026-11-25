//! Source-defined v3.0.1 item quantity semantics. No entitlement inference.
use crate::inventory_source_data::{RULES,CUSTOM_CAPS};
use crate::inventory_gathered_data::{GATHERED_IDS,FOOD_BAIT_IDS};
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
/// Source-bounded ordinary ingredients, fish, critters, food and bait. Definition
/// evidence only: the editor separately validates version, identity and references.
pub(crate) fn ordinary_membership_item(item_id:i32)->bool{
 RULES.binary_search_by_key(&item_id,|row|row.0).ok().is_some_and(|i|RULES[i].1&8!=0)
  ||GATHERED_IDS.binary_search(&item_id).is_ok()||FOOD_BAIT_IDS.binary_search(&item_id).is_ok()
}
pub(crate) fn ordinary_membership_ids()->impl Iterator<Item=i32>{
 RULES.iter().filter_map(|&(id,flags)|(flags&8!=0).then_some(id)).chain(GATHERED_IDS.iter().copied()).chain(FOOD_BAIT_IDS.iter().copied())
}
/// Creation is independent of removing the last saved copy: cosmetic
/// definitions may be added but persisted cosmetic zero remains gated
/// until equip/placement references have been verified.
pub(crate) fn ordinary_creation_item(item_id:i32)->bool{
 ordinary_membership_item(item_id)||RULES.binary_search_by_key(&item_id,|row|row.0).ok().is_some_and(|i|RULES[i].1&16!=0)
}
pub(crate) fn ordinary_creation_ids()->impl Iterator<Item=i32>{
 ordinary_membership_ids().chain(RULES.iter().filter_map(|&(id,flags)|(flags&16!=0).then_some(id)))
}
#[cfg(test)]
mod tests{
 use super::*;
 fn hex(bytes:&[u8])->String{bytes.iter().map(|b|format!("{b:02x}")).collect()}
 #[test]fn complete_source_identity_and_definition_flags(){
  assert_eq!(RULES.len(),12163);
  assert!(RULES.windows(2).all(|x|x[0].0<x[1].0)&&RULES[0].0>0);
  assert!(RULES.iter().all(|&(_,f)|f<=31));
  let ids:Vec<u8>=RULES.iter().flat_map(|&(id,_)|id.to_le_bytes()).collect();
  let flags:Vec<u8>=RULES.iter().map(|&(_,f)|f).collect();
  assert_eq!(hex(&crate::digest::sha256(&ids)),"8a55e11da2b28b30bb212424159657d3d9e7b47baf6a21ed94fd8615d1ef4702");
  assert_eq!(hex(&crate::digest::sha256(&flags)),"8beb988d3c808a937efe06de80c159855c23f8e0ceba0c4de5b2730d6fc5c109");
  assert_eq!([1,2,4,8,16].map(|mask|flags.iter().filter(|&&f|f&mask!=0).count()),[10293,138,13,37,3549]);
  assert_eq!(CUSTOM_CAPS.len(),13);
  assert_eq!(RULES.iter().filter(|&&(_,f)|f&4!=0).map(|&(id,_)|id).collect::<Vec<_>>(),CUSTOM_CAPS.iter().map(|&(id,_)|id).collect::<Vec<_>>());
  assert!(CUSTOM_CAPS.iter().all(|&(_,cap)|cap>0));
 }
 #[test]fn gathered_source_fingerprint_and_ordinary_bounds(){
  assert_eq!(GATHERED_IDS.len(),224);
  assert!(GATHERED_IDS.windows(2).all(|x|x[0]<x[1]));
  let bytes:Vec<u8>=GATHERED_IDS.iter().flat_map(|&id|id.to_le_bytes()).collect();
  assert_eq!(hex(&crate::digest::sha256(&bytes)),"8cb0a2929cf109bbc768239f5bcede17ecdd97e913db861f83349a8fd7c7e60d");
  assert!(GATHERED_IDS.iter().all(|&id|ordinary_quantity_limit(id)==Some(i32::MAX)&&
   RULES.binary_search_by_key(&id,|row|row.0).ok().is_some_and(|i|RULES[i].1==1)));
  assert_eq!(ordinary_membership_ids().collect::<std::collections::HashSet<_>>().len(),497);
  assert!(ordinary_membership_item(29960328)&&ordinary_membership_item(71754032));
  assert!(!ordinary_membership_item(315822));
 }
 #[test]fn food_bait_source_fingerprint_and_ordinary_bounds(){
  assert_eq!(FOOD_BAIT_IDS.len(),236);
  assert!(FOOD_BAIT_IDS.windows(2).all(|x|x[0]<x[1]));
  let bytes:Vec<u8>=FOOD_BAIT_IDS.iter().flat_map(|&id|id.to_le_bytes()).collect();
  assert_eq!(hex(&crate::digest::sha256(&bytes)),"abaf644ea95b721a2d21109647304fda13366723ba3ac425903cededb1fde39a");
  assert!(FOOD_BAIT_IDS.iter().all(|&id|ordinary_quantity_limit(id)==Some(i32::MAX)&&
   RULES.binary_search_by_key(&id,|row|row.0).ok().is_some_and(|i|RULES[i].1==1)));
  assert!(ordinary_membership_item(567052)&&ordinary_membership_item(30258712));
  assert!(!ordinary_membership_item(1455056332)); // Quest-rarity birthday cake.
 }
 #[test]fn cosmetic_source_candidates_only_authorize_creation(){
  let ids:Vec<_>=RULES.iter().filter_map(|&(id,flags)|(flags&16!=0).then_some(id)).collect();
  assert_eq!(ids.len(),3549);
  let bytes:Vec<u8>=ids.iter().flat_map(|&id|id.to_le_bytes()).collect();
  assert_eq!(hex(&crate::digest::sha256(&bytes)),"6f6b3ed9f29aeb462dcc5b6c1d75b46988df50ab8530cfa46e177efa981e4a95");
  assert!(ids.iter().all(|&id|ordinary_quantity_limit(id)==Some(i32::MAX)&&!ordinary_membership_item(id)));
  assert_eq!(ordinary_creation_ids().collect::<std::collections::HashSet<_>>().len(),4046);
  assert!(ordinary_creation_item(315822)&&ordinary_creation_item(286009791));
  assert!(!ordinary_creation_item(517031)); // Event-year clothing.
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

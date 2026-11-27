//! Source-defined v3.0.1 item quantity semantics. No entitlement inference.
use crate::inventory_source_data::{RULES,CUSTOM_CAPS};
use crate::inventory_bag_data::{BAG_FLAGS,ITEM_GUID_DENIAL_KEYS};
use crate::inventory_tradeable_data::TRADEABLE_CREATION_BITS;
use crate::inventory_wand_ingredient_data::WAND_ITEM_SOURCE_BITS;
use crate::inventory_tradeable_reference_data::TRADEABLE_NONCLOTHING_REFERENCE_KEYS;
use crate::inventory_custom_furniture_reference_data::CUSTOM_FURNITURE_EXTRA_REFERENCE_KEYS;
use crate::inventory_furniture_reference_data::FURNITURE_REFERENCE_KEYS;
use crate::inventory_clothing_reference_data::{CLOTHING_REFERENCE_ROWS,CLOTHING_REFERENCE_GROUPS,FLOWER_CLOTHING_REFERENCE_KEYS};
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
/// Original MaxCount uses Stackable and HasCustomMaxCount independently
/// of unique payload requirements. Only the typed flower gate uses this.
pub(crate) fn is_uncapped_required_unique_stack(item_id:i32)->bool{
 RULES.binary_search_by_key(&item_id,|row|row.0).ok().is_some_and(|i|RULES[i].1==3)
}
/// Exact Item IDs from the pinned v3.0.1 palette and chef runtime
/// source manifests. This maps source families, not color/flavor edit rights.
pub(crate) const CUSTOM_PALETTE_ID:i32=1835273963;
pub(crate) const CAFE_IDS:&[i32]=&[203331651,406277059,905853141,973085470,1053426049,1061947263,1237708874,1338995084,1932639321];
pub(crate) const BOBA_ID:i32=1798633565;
pub(crate) fn is_chef_color(id:i32)->bool{matches!(id,6..=34|46|47|140..=142)}
/// Source-bounded ordinary ingredients, fish, critters, food and bait. Definition
/// evidence only: the editor separately validates version, identity and references.
pub(crate) fn ordinary_membership_item(item_id:i32)->bool{
 RULES.binary_search_by_key(&item_id,|row|row.0).ok().is_some_and(|i|RULES[i].1&8!=0)
  ||GATHERED_IDS.binary_search(&item_id).is_ok()||FOOD_BAIT_IDS.binary_search(&item_id).is_ok()
}
pub(crate) fn ordinary_membership_ids()->impl Iterator<Item=i32>{
 RULES.iter().filter_map(|&(id,flags)|(flags&8!=0).then_some(id)).chain(GATHERED_IDS.iter().copied()).chain(FOOD_BAIT_IDS.iter().copied())
}
/// The 12 Currency-rarity source definitions with native ownership flags
/// Tradable|DevInboxGiftable, Stackable, no required payload/custom cap.
/// Existing-row zero/refill includes the DLC-bearing Jemmies definition.
/// Absent generation uses the narrower independently verified source set below.
const EXISTING_CURRENCY_IDS:&[i32]=&[
 348154640,391038680,460708033,483381991,646065996,833471261,
 1205887707,1486918074,1763799360,1774854033,1956968187,2079616823,
];
pub(crate) fn existing_currency_item(item_id:i32)->bool{
 EXISTING_CURRENCY_IDS.binary_search(&item_id).is_ok()&&ordinary_quantity_limit(item_id)==Some(i32::MAX)
}
// Original Switch v3.0.1 typed definitions: exact unrestricted currency slice.
// Jemmies (1205887707) has non-null RequiredDlcContent and is not included.
const CURRENCY_CREATION_IDS:&[i32]=&[
 348154640,391038680,460708033,483381991,646065996,833471261,
 1486918074,1763799360,1774854033,1956968187,2079616823,
];
/// One generated definition projection over the complete native catalog.
 /// Existing bag membership and absent acquisition are independent facts.
 pub(crate) fn ordinary_bag_definition(item_id:i32)->Option<(bool,u32)>{
  let i=RULES.binary_search_by_key(&item_id,|r|r.0).ok()?;
  let flags=*BAG_FLAGS.get(i)?;
  if flags&1==0{return None}
  ordinary_quantity_limit(item_id)?;
  Some((flags&2!=0,*ITEM_GUID_DENIAL_KEYS.get(i)?))
 }
 pub(crate) fn ordinary_bag_creation_item(item_id:i32)->bool{
  RULES.binary_search_by_key(&item_id,|r|r.0).ok().is_some_and(|i|
   BAG_FLAGS.get(i).is_some_and(|&f|f&5==5)&&ordinary_quantity_limit(item_id).is_some())
 }
 pub(crate) fn ordinary_bag_creation_ids()->impl Iterator<Item=i32>{
  RULES.iter().filter_map(|&(id,_)|ordinary_bag_creation_item(id).then_some(id))
 }
 #[cfg(test)]
 mod bag_definition_tests{
  use super::*;
  #[test]fn complete_catalog_bag_policy_and_reference_fingerprints(){
   assert_eq!(BAG_FLAGS.len(),RULES.len());assert_eq!(ITEM_GUID_DENIAL_KEYS.len(),RULES.len());
   let hex=|b:&[u8]|crate::digest::sha256(b).iter().map(|x|format!("{x:02x}")).collect::<String>();
   assert_eq!(hex(BAG_FLAGS),"1c3a7b5308c92fffc88c698ebc066f2ab4ac9d0bbab9b1e93c757e0e5d630bd6");
   let bytes:Vec<_>=ITEM_GUID_DENIAL_KEYS.iter().flat_map(|k|k.to_le_bytes()).collect();
   assert_eq!(hex(&bytes),"0bd8235b2a3bad5263ec8a2144a0a84fa27d8bab4e27e60034190abc6d7a8396");
   assert_eq!(ITEM_GUID_DENIAL_KEYS.iter().collect::<std::collections::HashSet<_>>().len(),12163);
   let mut total=0;let mut outfits=0;let mut absent=0;
   for (i,&(id,rule)) in RULES.iter().enumerate(){
    let f=BAG_FLAGS[i];assert!(matches!(f,0|1|3|5|7));
    assert_eq!(ordinary_bag_definition(id).is_some(),f&1!=0);
    assert_eq!(ordinary_bag_creation_item(id),f&5==5);
    if f&1!=0{
     assert_eq!(rule&2,0);total+=1;
     let (outfit,key)=ordinary_bag_definition(id).unwrap();assert_eq!(key,ITEM_GUID_DENIAL_KEYS[i]);
     assert_eq!(outfit,ordinary_clothing_reference_keys(id).is_some());
     if outfit{outfits+=1;assert_eq!(ordinary_clothing_reference_keys(id).unwrap().0,key);}
    }
    if f&4!=0{absent+=1;assert!(ordinary_quantity_limit(id).is_some())}
   }
   assert_eq!((total,outfits,absent),(9880,6057,7484));
   assert!(ordinary_creation_ids().all(ordinary_bag_creation_item));
   assert!(ordinary_bag_creation_item(216433));assert!(ordinary_bag_creation_item(15761463));
   for id in [12136138,20514331,15467283,47306696]{assert!(ordinary_bag_definition(id).is_some()&&ordinary_bag_creation_item(id));}
   assert!(!ordinary_bag_creation_item(120261453));
   assert!(ordinary_bag_definition(4881112).is_some()&&!ordinary_bag_creation_item(4881112));
   assert!(ordinary_bag_definition(2773515).unwrap().0&&!ordinary_bag_creation_item(2773515));
   assert!(ordinary_bag_definition(1900000001).is_none());
   assert!(ordinary_bag_definition(1835273963).is_none());
   assert!(ordinary_bag_definition(2742209).unwrap().0&&ordinary_bag_creation_item(2742209));
   assert!(ordinary_bag_definition(31896958).is_some()&&ordinary_bag_creation_item(31896958));
   assert!(ordinary_bag_creation_item(1093982586)&&ordinary_quantity_limit(1093982586)==Some(3));
   assert!(ordinary_bag_creation_item(1763678003)&&ordinary_quantity_limit(1763678003)==Some(3));
   assert!(ordinary_bag_definition(1144225647).is_some()&&!ordinary_bag_creation_item(1144225647));
   assert!(ordinary_bag_definition(1455056332).is_some()&&ordinary_bag_creation_item(1455056332));
   assert!(ordinary_bag_definition(484139114).is_some()&&!ordinary_bag_creation_item(484139114));
   assert!(ordinary_bag_definition(197197205).unwrap().0&&ordinary_bag_creation_item(197197205));
  }
 }
#[cfg(test)]
mod currency_source_tests{
 use super::*;
 #[test]fn existing_currency_and_unrestricted_creation_allowlists_are_separate(){
  assert_eq!(EXISTING_CURRENCY_IDS.len(),12);
  assert!(EXISTING_CURRENCY_IDS.windows(2).all(|w|w[0]<w[1]));
  let bytes:Vec<_>=EXISTING_CURRENCY_IDS.iter().flat_map(|id|id.to_le_bytes()).collect();
  let hash:String=crate::digest::sha256(&bytes).iter().map(|b|format!("{b:02x}")).collect();
  assert_eq!(hash,"c8a8cb3f726e288d4662d8c90b53b8f60b14a58ec35bca22fc8c8797aabf4b3a");
  assert!(EXISTING_CURRENCY_IDS.iter().all(|&id|existing_currency_item(id)&&!ordinary_creation_item(id)));
  assert_eq!(CURRENCY_CREATION_IDS.len(),11);
  let bytes:Vec<_>=CURRENCY_CREATION_IDS.iter().flat_map(|id|id.to_le_bytes()).collect();
  let hash:String=crate::digest::sha256(&bytes).iter().map(|b|format!("{b:02x}")).collect();
  assert_eq!(hash,"e7448e16aec60a8ffdd27a48b948b669d6b2dc364a821e86c56aae5e3b716634");
  assert!(CURRENCY_CREATION_IDS.iter().all(|&id|ordinary_bag_creation_item(id)&&!ordinary_creation_item(id)));
  assert_eq!(ordinary_bag_creation_ids().collect::<std::collections::HashSet<_>>().len(),7484);
  assert!(existing_currency_item(1205887707)&&!ordinary_bag_creation_item(1205887707));
  for id in [484139114,2092387705,615026760,1141761080]{assert!(!existing_currency_item(id)&&!ordinary_bag_creation_item(id));}
  assert!(!ordinary_bag_creation_item(709633628));
 }
}
/// FNV-1a of the four native little-endian Hash128 words. Only a denial key:
/// collisions conservatively refuse deletion; they never identify or create items.
pub(crate) fn furniture_guid_fingerprint(words:[u32;4])->u32{
 words.into_iter().flat_map(u32::to_le_bytes).fold(2166136261u32,|h,b|(h^u32::from(b)).wrapping_mul(16777619))
}
pub(crate) fn ordinary_furniture_guid_fingerprint(item_id:i32)->Option<u32>{
 FURNITURE_REFERENCE_KEYS.binary_search_by_key(&item_id,|r|r.0).ok().map(|i|FURNITURE_REFERENCE_KEYS[i].1)
}
#[cfg(test)]
mod furniture_reference_tests{
 use super::*;
 #[test]fn exact_original_furniture_subset_and_denial_fingerprints(){
  assert_eq!(FURNITURE_REFERENCE_KEYS.len(),1114);
  assert!(FURNITURE_REFERENCE_KEYS.windows(2).all(|w|w[0].0<w[1].0));
  let ids:Vec<_>=FURNITURE_REFERENCE_KEYS.iter().flat_map(|r|r.0.to_le_bytes()).collect();
  let keys:Vec<_>=FURNITURE_REFERENCE_KEYS.iter().flat_map(|r|r.1.to_le_bytes()).collect();
  let hex=|b:&[u8]|crate::digest::sha256(b).iter().map(|x|format!("{x:02x}")).collect::<String>();
  assert_eq!(hex(&ids),"8fbdf8f0b216c3513b9526cf9ce0f201cab30ce97ada1b2b6d4137f4edc4715b");
  assert_eq!(hex(&keys),"703d7d7a46cf57bad14b9f6212a3a72ee9e25af8a6d8f5ad1f67b95de50e6235");
  assert_eq!(FURNITURE_REFERENCE_KEYS.iter().map(|r|r.1).collect::<std::collections::HashSet<_>>().len(),1114);
  assert!(FURNITURE_REFERENCE_KEYS.iter().all(|&(id,_)|ordinary_creation_item(id)&&ordinary_quantity_limit(id)==Some(i32::MAX)));
  assert_eq!(ordinary_furniture_guid_fingerprint(427689),Some(furniture_guid_fingerprint([0x17fc7530,0x48eebd45,0x68b373b0,0xa7812c9b])));
  assert!(ordinary_furniture_guid_fingerprint(286009791).is_some());
  assert_eq!(ordinary_furniture_guid_fingerprint(315822),None);
 }
}
/// Creation is independent of removing the last saved copy: cosmetic
/// definitions may be added; persisted zero is separately gated in the editor
/// by its source family and original placement/equipment reference index.
fn ordinary_tradeable_creation_index(i:usize)->bool{
 TRADEABLE_CREATION_BITS.get(i/8).is_some_and(|&byte|byte&(1u8<<(i%8))!=0)
}
pub(crate) fn ordinary_creation_item(item_id:i32)->bool{
 RULES.binary_search_by_key(&item_id,|row|row.0).ok().is_some_and(ordinary_tradeable_creation_index)
}
/// Exact source Item ID/GUID join. Non-clothing only: outfit/piece GUID
/// references require the independently verified clothing crosswalk.
pub(crate) fn ordinary_tradeable_nonclothing_reference(item_id:i32)->Option<u32>{
 TRADEABLE_NONCLOTHING_REFERENCE_KEYS.binary_search_by_key(&item_id,|row|row.0).ok()
  .map(|i|TRADEABLE_NONCLOTHING_REFERENCE_KEYS[i].1)
  .filter(|_|ordinary_creation_item(item_id))
}
/// Existing tag-8 rows only; never authorizes a new ordinary item or entitlement.
pub(crate) fn custom_furniture_extra_reference(item:i32)->Option<u32>{
 if ordinary_quantity_limit(item)!=Some(i32::MAX)||!crate::furniture_source::item(item).is_some_and(|s|!s.is_home_layout){return None}
 CUSTOM_FURNITURE_EXTRA_REFERENCE_KEYS.binary_search_by_key(&item,|r|r.0).ok().map(|i|CUSTOM_FURNITURE_EXTRA_REFERENCE_KEYS[i].1)
}
pub(crate) fn ordinary_creation_ids()->impl Iterator<Item=i32>{
 ordinary_membership_ids().chain(RULES.iter().enumerate().filter_map(|(i,&(id,_))|(ordinary_tradeable_creation_index(i)&&!ordinary_membership_item(id)).then_some(id)))
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
  assert_eq!(ordinary_creation_ids().collect::<std::collections::HashSet<_>>().len(),6521);
  assert!(ordinary_creation_item(315822)&&ordinary_creation_item(286009791));
  assert!(ordinary_creation_item(517031)); // Tradeable event-year clothing; bag only.
 }
 #[test]fn full_tradeable_creation_mask_is_pinned_and_preserves_original_candidates(){
  assert_eq!(TRADEABLE_CREATION_BITS.len(),1521);
  assert_eq!(hex(&crate::digest::sha256(TRADEABLE_CREATION_BITS)),"3a9e06f1b2385881ebcd3db406a39120913b798902cdf4482876a44f7b206824");
  let mut ids:Vec<_>=ordinary_creation_ids().collect();ids.sort_unstable();
  assert_eq!(ids.len(),6521);assert!(ids.windows(2).all(|p|p[0]<p[1]));
  let bytes:Vec<_>=ids.iter().flat_map(|&id|id.to_le_bytes()).collect();
  assert_eq!(hex(&crate::digest::sha256(&bytes)),"4dc7ed5ce734e90cf6777d4310c55352f5cd04c5759df3b47d860be4f6973d5b");
  assert!(ids.iter().all(|&id|ordinary_quantity_limit(id)==Some(i32::MAX)));
  assert!(ordinary_membership_ids().all(ordinary_creation_item));
  assert!(RULES.iter().filter(|&&(_,f)|f&16!=0).all(|&(id,_)|ordinary_creation_item(id)));
  for id in [517031,13938575,21295337,40179426,362307007]{assert!(ordinary_creation_item(id));}
  for id in [2773515,3445697,3919283,4881112,1835273963,1798633565,1900000001,460708033]{assert!(!ordinary_creation_item(id));}
 }
 #[test]fn tradeable_nonclothing_reference_crosswalk_is_complete_and_denial_only(){
  let rows=TRADEABLE_NONCLOTHING_REFERENCE_KEYS;
  assert_eq!(rows.len(),2575);
  assert!(rows.windows(2).all(|r|r[0].0<r[1].0));
  assert_eq!(rows.iter().map(|r|r.1).collect::<std::collections::HashSet<_>>().len(),2575);
  assert!(rows.iter().all(|&(id,key)|ordinary_creation_item(id)&&ordinary_tradeable_nonclothing_reference(id)==Some(key)&&ordinary_quantity_limit(id)==Some(i32::MAX)));
  assert!(FURNITURE_REFERENCE_KEYS.iter().all(|&(id,key)|ordinary_tradeable_nonclothing_reference(id)==Some(key)));
  for (id,key) in [(13938575,1491140200),(21295337,3885305771),(40179426,735223230),(362307007,3217519292)]{
   assert_eq!(ordinary_tradeable_nonclothing_reference(id),Some(key));
  }
  for id in [517031,315822,460708033,1900000001]{assert_eq!(ordinary_tradeable_nonclothing_reference(id),None);}
 }
 #[test]fn expanded_customized_furniture_zero_uses_verified_nonlayout_intersection(){
  let candidates=crate::furniture_source::ITEMS.iter().filter(|s|!s.is_home_layout);
  assert_eq!(candidates.clone().filter(|s|ordinary_furniture_guid_fingerprint(s.item_id).is_some()).count(),295);
  assert_eq!(candidates.filter(|s|ordinary_tradeable_nonclothing_reference(s.item_id).is_some()).count(),456);
  assert!(ordinary_furniture_guid_fingerprint(32709745).is_none());
  assert!(ordinary_tradeable_nonclothing_reference(32709745).is_some());
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

/// Source witness (ingredient Item ID, flavor characteristic, color characteristic).
/// Direct chef recipes only, exact original one-flavor/one-color ingredients.
/// Excludes tag_imagination; the existing ordinary-membership gate further
/// excludes unverified/restricted acquisition witnesses from NEW choices.
pub(crate) const CAFE_INGREDIENT_WITNESSES:&[(i32,i32,i32)]=&[
 (26301889,99,9),
 (45140131,58,30),
 (51054568,134,47),
 (57154195,56,8),
 (89022446,55,25),
 (128965606,135,21),
 (162437313,100,10),
 (263034389,100,17),
 (319731107,99,8),
 (347244458,55,8),
 (350967404,64,47),
 (384578569,101,18),
 (449040119,55,9),
 (479562317,43,32),
 (497197619,135,9),
 (518638500,61,9),
 (590790304,87,34),
 (590978630,53,6),
 (611226733,138,141),
 (619719355,65,25),
 (627013240,42,21),
 (688186817,99,10),
 (818900842,100,24),
 (1002666914,54,25),
 (1008037320,134,140),
 (1090244985,52,9),
 (1104825533,59,16),
 (1141761080,60,13),
 (1240730051,62,6),
 (1254065963,50,46),
 (1300515229,139,23),
 (1342146402,136,7),
 (1344087400,39,46),
 (1350635557,63,25),
 (1445971409,55,26),
 (1528707951,57,33),
 (1552697168,134,6),
 (1622861092,48,9),
 (1643431747,137,10),
 (1663245734,101,6),
 (1743974962,65,25),
 (1875946375,41,21),
 (1877756618,44,6),
 (1954718636,100,16),
 (1992279429,135,23),
 (2044981506,135,142),
 (2077967286,49,46),
 (2094826872,41,33),
];
pub(crate) fn cafe_slot_count(item:i32)->Option<usize>{
 match item{203331651|905853141|1061947263|1338995084=>Some(3),
  406277059|973085470|1053426049|1237708874|1932639321=>Some(1),_=>None}
}
pub(crate) fn cafe_pair_allowed(item:i32,flavor:i32,color:i32)->bool{
 cafe_slot_count(item).is_some()&&is_chef_color(color)&&
 (!matches!(item,203331651|406277059|973085470|1237708874|1338995084)||!matches!(flavor,134..=136))&&
 (item!=1932639321||!matches!(flavor,137..=139))&&
 CAFE_INGREDIENT_WITNESSES.iter().any(|&(_,f,c)|f==flavor&&c==color)
}
pub(crate) fn cafe_ingredient_choices(item:i32)->impl Iterator<Item=(i32,i32,i32)>{
 CAFE_INGREDIENT_WITNESSES.iter().copied().filter(move |&(ingredient,flavor,color)|
  ordinary_membership_item(ingredient)&&cafe_pair_allowed(item,flavor,color))
}
#[cfg(test)]
mod cafe_source_tests{
 use super::*;
 #[test]fn direct_recipe_source_pairs(){
  assert_eq!(CAFE_INGREDIENT_WITNESSES.len(),48);
  assert_eq!(cafe_slot_count(203331651),Some(3));assert_eq!(cafe_slot_count(1237708874),Some(1));
  assert_eq!(cafe_slot_count(1338995084),Some(3));assert_eq!(cafe_slot_count(1932639321),Some(1));
  assert!(!cafe_pair_allowed(1338995084,134,47));assert!(!cafe_pair_allowed(1932639321,137,10));
  assert!(NIGIRI_SIDES.contains(&(1643431747,137,10)));
  assert!(cafe_pair_allowed(203331651,44,6));assert!(!cafe_pair_allowed(203331651,44,9));
  assert!(!cafe_pair_allowed(203331651,134,47));assert!(cafe_pair_allowed(1061947263,134,47));
  assert!(cafe_ingredient_choices(1237708874).any(|v|v==(1877756618,44,6)));
  assert!(!cafe_ingredient_choices(1237708874).any(|v|v.0==1141761080));
 }
}

/// Exact optional nigiri side slot, from its explicit AnyItemCondition.
pub(crate) const NIGIRI_ID:i32=1932639321;
pub(crate) const DANGO_ID:i32=1338995084;
pub(crate) const NIGIRI_SIDES:&[(i32,i32,i32)]=&[(1643431747,137,10),(611226733,138,141),(1300515229,139,23)];
pub(crate) fn cafe_count_allowed(item:i32,count:usize)->bool{
 cafe_slot_count(item)==Some(count)||(item==NIGIRI_ID&&count==2)
}

/// Exact (color, flavor, milk) triples of the 23 native Boba
/// definition assets in the pinned Switch v3.0.1 definitions CAB.
/// Some authoring names disagree with their flags; use serialized IDs.
pub(crate) const BOBA_SOURCE_TRIPLES:&[[i32;3]]=&[
 [6,44,75],[6,44,78],[6,53,75],[6,53,78],[6,62,75],[6,62,78],
 [9,55,78],[9,61,78],[16,59,78],[24,100,78],[25,63,78],[30,58,78],
 [32,43,75],[34,87,75],[46,39,75],[46,39,78],[46,50,75],[46,50,78],[47,64,78],
];
// CharacteristicsDatabase named source fields, confirmed in BobaTeaProcessor.
pub(crate) const BOBA_PEARLS:[i32;2]=[79,76]; // no / yes
pub(crate) const BOBA_SWEETNESS:[i32;4]=[71,72,73,74];
pub(crate) fn supported_boba_base(v:[i32;5])->bool{
 BOBA_SOURCE_TRIPLES.binary_search(&[v[0],v[1],v[3]]).is_ok()&&
 BOBA_PEARLS.contains(&v[2])&&BOBA_SWEETNESS.contains(&v[4])
}

/// Original magic-wand instruction 815177131, paired style keys and output PPtrs.
pub(crate) const MAGIC_WAND_STYLES:&[(i32,i32)]=&[
 (39246601,120),(671373939,119),(1233735197,123),(1429161083,118),(1853305820,122),(2096979038,121),
];
pub(crate) const WAND_MAGIC:&[(i32,i32)]=&[
 (104,1500751315),(105,1878586865),(106,28996718),(107,216828669),
 (108,167866479),(109,1944158148),(110,1549110704),(111,698751747),
 (112,1864047568),(113,1334678426),(114,558340471),(115,392876538),
];
pub(crate) const WAND_FLECK:&[(i32,i32)]=&[(125,494126928),(126,119953162),(127,1435772717)];
const MAGIC_WAND_REFERENCE_KEYS:&[(i32,u32)]=&[
 (39246601,0x5e3f906d),(671373939,0x85b5d9d5),(1233735197,0xc0d01880),
 (1429161083,0x02024636),(1853305820,0x291e374e),(2096979038,0xa59e6996),
];
pub(crate) const GENERIC_MAGIC_WAND_ID:i32=1020402601;
pub(crate) fn magic_wand_reference_key(item:i32)->Option<u32>{
 if item==GENERIC_MAGIC_WAND_ID{return Some(0xedd0420e)}
 MAGIC_WAND_REFERENCE_KEYS.binary_search_by_key(&item,|&(id,_)|id).ok().map(|i|MAGIC_WAND_REFERENCE_KEYS[i].1)
}
pub(crate) fn magic_wand_style(item:i32)->Option<i32>{
 if item==GENERIC_MAGIC_WAND_ID{return Some(0)}
 MAGIC_WAND_STYLES.binary_search_by_key(&item,|&(id,_)|id).ok().map(|i|MAGIC_WAND_STYLES[i].1)
}
/// Exact WandStationItemWandProcessor output IDs and native ingredient predicates.
/// The nonzero-source slice accepts only nil payloads and style zero; it does
/// not authorize creation of an unowned source item or absent wand family.
pub(crate) const ITEM_WAND_ID:i32=384749651;
pub(crate) const CRITTER_WAND_ID:i32=1304219546;
const CRITTER_WAND_SOURCES:&[i32]=&[7285157,79024873,112622136,702286800,711665739,767798085,897162761,1112156413,1327542038,2011076305];
pub(crate) fn legacy_wand_source_guid(item:i32)->Option<[u32;4]>{
 if item==0{return Some([0;4])}
 crate::inventory_legacy_wand_guid_data::LEGACY_WAND_SOURCE_GUIDS.iter().find(|r|r.1==item).map(|r|r.0)
}
pub(crate) fn legacy_wand_source_id(guid:[u32;4])->Option<i32>{
 if guid==[0;4]{return Some(0)}
 use crate::inventory_legacy_wand_guid_data::LEGACY_WAND_SOURCE_GUIDS as ROWS;
 ROWS.binary_search_by_key(&guid,|r|r.0).ok().map(|i|ROWS[i].1)
}
/// Resolve complete historical item GUID references, not acquisition rights.
pub(crate) fn native_item_reference_id(guid:[u32;4])->Option<i32>{
 if guid==[0;4]{return None}
 use crate::inventory_legacy_wand_guid_data::OTHER_NATIVE_ITEM_GUIDS as ROWS;
 legacy_wand_source_id(guid).or_else(||ROWS.binary_search_by_key(&guid,|r|r.0).ok().map(|i|ROWS[i].1))
}
pub(crate) fn wand_source_style(item:i32,source:i32)->Option<i32>{
 if source==0{return magic_wand_style(item)}
 if item==CRITTER_WAND_ID{return CRITTER_WAND_SOURCES.binary_search(&source).ok().map(|_|0)}
 if item!=ITEM_WAND_ID{return None}
 let i=RULES.binary_search_by_key(&source,|r|r.0).ok()?;
 (WAND_ITEM_SOURCE_BITS[i/8]&(1<<(i%8))!=0).then_some(0)
}
pub(crate) fn wand_reference_key(item:i32)->Option<u32>{
 match item{ITEM_WAND_ID=>Some(0x785e7587),CRITTER_WAND_ID=>Some(0x6f5bd589),_=>magic_wand_reference_key(item)}
}
pub(crate) fn wand_output_item(item:i32)->bool{
 matches!(item,ITEM_WAND_ID|CRITTER_WAND_ID)||magic_wand_style(item).is_some()
}
pub(crate) fn magic_wand_choices(v:[i32;2])->bool{
 WAND_MAGIC.iter().any(|&(id,_)|id==v[0])&&WAND_FLECK.iter().any(|&(id,_)|id==v[1])
}
#[cfg(test)]mod wand_source_tests{
 use super::*;
 #[test]fn source_magic_wand_shapes_and_ingredients(){
  assert!(MAGIC_WAND_STYLES.windows(2).all(|w|w[0].0<w[1].0));
  assert!(MAGIC_WAND_STYLES.iter().all(|&(id,_)|is_uncapped_required_unique_stack(id)));
  assert_eq!(MAGIC_WAND_REFERENCE_KEYS.iter().map(|r|r.0).collect::<Vec<_>>(),MAGIC_WAND_STYLES.iter().map(|r|r.0).collect::<Vec<_>>());
  assert_eq!(magic_wand_reference_key(1429161083),Some(furniture_guid_fingerprint([0x52e59d2c,0x9342db09,0x587aacab,0x3ac17e48])));
  assert_eq!(magic_wand_reference_key(GENERIC_MAGIC_WAND_ID),Some(furniture_guid_fingerprint([0xa179da22,0x4445a5c7,0xa341f6a9,0x23c685e7])));
  assert_eq!(WAND_MAGIC.len()*WAND_FLECK.len(),36);
  assert!(WAND_MAGIC.iter().chain(WAND_FLECK).all(|&(_,id)|ordinary_quantity_limit(id)==Some(i32::MAX)));
  assert_eq!(magic_wand_style(GENERIC_MAGIC_WAND_ID),Some(0));
  assert!(is_uncapped_required_unique_stack(GENERIC_MAGIC_WAND_ID));
  assert_eq!(wand_source_style(GENERIC_MAGIC_WAND_ID,315822),None);
  assert_eq!(WAND_ITEM_SOURCE_BITS.len(),1521);
  assert_eq!(WAND_ITEM_SOURCE_BITS.iter().map(|b|b.count_ones()).sum::<u32>(),8601);
  let hash=crate::digest::sha256(WAND_ITEM_SOURCE_BITS).iter().map(|b|format!("{b:02x}")).collect::<String>();
  assert_eq!(hash,"433ec9faa61477cfc61bb069222522f2daa82f3c89d9c9474223a59e6e5afcca");
  assert!(CRITTER_WAND_SOURCES.windows(2).all(|w|w[0]<w[1]));
  assert_eq!(wand_source_style(ITEM_WAND_ID,1185152302),Some(0));
  assert_eq!(wand_source_style(CRITTER_WAND_ID,7285157),Some(0));
  assert_eq!(wand_source_style(ITEM_WAND_ID,0),None);
  assert_eq!(wand_source_style(CRITTER_WAND_ID,1185152302),None);
  assert_eq!(wand_reference_key(ITEM_WAND_ID),Some(furniture_guid_fingerprint([0xb5dabef9,0x0047a0d5,0xe98cd284,0xe52e9f97])));
  assert_eq!(wand_reference_key(CRITTER_WAND_ID),Some(furniture_guid_fingerprint([0x91a1c067,0x9a4626f9,0xeca0a6af,0x2e2f1909])));
  assert!(is_uncapped_required_unique_stack(ITEM_WAND_ID)&&is_uncapped_required_unique_stack(CRITTER_WAND_ID));
 }
}

/// Display examples only: exact (ingredient ID, flavor, color) from the
/// original item definitions for all fourteen authored Boba color/flavor pairs.
pub(crate) const BOBA_WITNESSES:&[(i32,i32,i32)]=&[
 (1877756618,44,6),(590978630,53,6),(1240730051,62,6),(449040119,55,9),
 (518638500,61,9),(1104825533,59,16),(818900842,100,24),(1350635557,63,25),
 (45140131,58,30),(479562317,43,32),(590790304,87,34),(1344087400,39,46),
 (1254065963,50,46),(350967404,64,47),
];
#[cfg(test)]mod boba_source_tests{
 use super::*;
 #[test]fn authored_base_combinations_and_display_witnesses(){
  assert_eq!(BOBA_SOURCE_TRIPLES.len(),19);
  assert!(BOBA_SOURCE_TRIPLES.windows(2).all(|x|x[0]<x[1]));
  assert!(BOBA_SOURCE_TRIPLES.iter().all(|&[c,f,_]|BOBA_WITNESSES.iter().any(|&(_,flavor,color)|(flavor,color)==(f,c))));
  assert_eq!(BOBA_SOURCE_TRIPLES.len()*BOBA_PEARLS.len()*BOBA_SWEETNESS.len(),152);
 }
}

/// Denial-only keys: the exact ordinary item GUID and the source outfit's
/// shared normal/water avatar piece GUIDs and outfit GUID.
pub(crate) fn ordinary_clothing_reference_keys(item:i32)->Option<(u32,&'static [u32])>{
 let (_,parent,key)=CLOTHING_REFERENCE_ROWS[CLOTHING_REFERENCE_ROWS.binary_search_by_key(&item,|r|r.0).ok()?];
 let (_,keys)=CLOTHING_REFERENCE_GROUPS[CLOTHING_REFERENCE_GROUPS.binary_search_by_key(&parent,|r|r.0).ok()?];
 Some((key,keys))
}
// Original Switch v3.0.1: item, outfit, normal and alternate-water avatar pieces.
// Five distinct denial fingerprints per floral outfit; not identity authority.
const FLORAL_CLOTHING_REFERENCE_KEYS:&[(i32,&[u32])]=&[
 (41105179,&[0x0be3f2e1,0x347ed351,0x7b7c52c7,0xb628f99d,0xe9eb22bd]),
 (313677564,&[0x1ad81341,0x1b4bfa47,0x43d0eb61,0xd95ce939,0xf1479e6e]),
 (528401863,&[0x0b71af78,0x0bb754d9,0x266e3003,0xc978c8ef,0xd9c8dedf]),
 (809985659,&[0x40b47e54,0x86a7a3d5,0xbe86782c,0xcdad1c54,0xd66fdd16]),
 (811189976,&[0x026c913a,0x0483fd3e,0xa39d70ef,0xc793d87b,0xdc6ab50a]),
 (965037291,&[0x05cfbc17,0x400ec7dd,0x67872060,0xac3de037,0xd88bac13]),
 (1646153125,&[0x5a42f3cb,0x9045cbfc,0x9a4535a3,0xb8920df8,0xd8da5eea]),
];
// Exact item/outfit/normal and alternate-water piece fingerprints from
// Switch v3.0.1. These are denial keys, not evidence of DLC rights.
const OWNED_DLC_FLOWER_CLOTHING_REFERENCE_KEYS:&[(i32,&[u32])]=&[
 (401804031,&[0x40038ae8,0xa65c589d,0xe6988039]),
 (1095918548,&[0x42b06f44,0x5bb50645,0xba86ea4b]),
 (1716283922,&[0x4859abad,0xc57e16e9,0xcc268acd]),
 (1776250358,&[0x32734a3f,0x70acf18b,0x880fe67e,0xb4c5fc8e,0xd14ee2f4]),
 (1797473773,&[0x1996d2bb,0x4240566e,0x6f08b35a]),
];
pub(crate) fn flower_clothing_reference_keys(item:i32)->Option<&'static [u32]>{
 FLOWER_CLOTHING_REFERENCE_KEYS.binary_search_by_key(&item,|r|r.0).ok().map(|i|FLOWER_CLOTHING_REFERENCE_KEYS[i].1)
 .or_else(||FLORAL_CLOTHING_REFERENCE_KEYS.binary_search_by_key(&item,|r|r.0).ok().map(|i|FLORAL_CLOTHING_REFERENCE_KEYS[i].1))
 .or_else(||OWNED_DLC_FLOWER_CLOTHING_REFERENCE_KEYS.binary_search_by_key(&item,|r|r.0).ok().map(|i|OWNED_DLC_FLOWER_CLOTHING_REFERENCE_KEYS[i].1))
}
#[cfg(test)]
mod clothing_reference_tests{
 use super::*;
 #[test]fn exact_floral_clothing_reference_crosswalk(){
  assert_eq!(FLORAL_CLOTHING_REFERENCE_KEYS.len(),7);
  assert!(FLORAL_CLOTHING_REFERENCE_KEYS.windows(2).all(|w|w[0].0<w[1].0));
  let mut bytes=Vec::new();
  for &(id,keys) in FLORAL_CLOTHING_REFERENCE_KEYS{
   assert!(is_uncapped_required_unique_stack(id));
   assert!(!ordinary_creation_item(id));
   assert_eq!(keys.len(),5);
   assert!(keys.windows(2).all(|w|w[0]<w[1]));
   assert_eq!(flower_clothing_reference_keys(id),Some(keys));
   bytes.extend(id.to_le_bytes());bytes.push(keys.len() as u8);
   for key in keys{bytes.extend(key.to_le_bytes());}
  }
  let hash=crate::digest::sha256(&bytes).iter().map(|x|format!("{x:02x}")).collect::<String>();
  assert_eq!(hash,"8f303e60d27b8dcc69cac8161315f77a642d0aedc1b56be476d54a623e1d270c");
 }
 #[test]fn exact_source_clothing_crosswalk(){
  assert_eq!(CLOTHING_REFERENCE_ROWS.len(),6057);
  assert_eq!(FLOWER_CLOTHING_REFERENCE_KEYS.len(),27);
  assert!(FLOWER_CLOTHING_REFERENCE_KEYS.windows(2).all(|w|w[0].0<w[1].0));
  let mut flower=Vec::new();
  for &(id,keys) in FLOWER_CLOTHING_REFERENCE_KEYS{
   assert_eq!(keys.len(),3);
   assert!(keys.windows(2).all(|w|w[0]<w[1]));
   assert!(is_uncapped_required_unique_stack(id));
   flower.extend(id.to_le_bytes());flower.push(keys.len() as u8);
   for key in keys{flower.extend(key.to_le_bytes());}
  }
  let flower_hash=crate::digest::sha256(&flower).iter().map(|x|format!("{x:02x}")).collect::<String>();
  assert_eq!(flower_hash,"80aa4103198c492cb9e670b21c397e7f94dba77730b99cdf257d8bf46abfc16a");
  assert_eq!(CLOTHING_REFERENCE_GROUPS.len(),1043);
  assert!(CLOTHING_REFERENCE_ROWS.windows(2).all(|w|w[0].0<w[1].0));
  assert!(CLOTHING_REFERENCE_GROUPS.windows(2).all(|w|w[0].0<w[1].0));
  let mut rows=Vec::new();let mut groups=Vec::new();
  for &(id,parent,k) in CLOTHING_REFERENCE_ROWS{
   assert!(ordinary_bag_definition(id).is_some_and(|(outfit,_)|outfit));assert_eq!(ordinary_furniture_guid_fingerprint(id),None);
   assert!(ordinary_clothing_reference_keys(id).is_some());rows.extend(id.to_le_bytes());rows.extend(parent.to_le_bytes());rows.extend(k.to_le_bytes());
  }
  for &(p,keys) in CLOTHING_REFERENCE_GROUPS{
   assert!(keys.len()>=2&&keys.windows(2).all(|w|w[0]<w[1]));
   groups.extend(p.to_le_bytes());groups.push(keys.len() as u8);for k in keys{groups.extend(k.to_le_bytes());}
  }
  let hex=|b:&[u8]|crate::digest::sha256(b).iter().map(|x|format!("{x:02x}")).collect::<String>();
  assert_eq!(hex(&rows),"688eb46fc205fc9d47678a78b4d0786ca5b4f2690dfb7be173b6964832edd2de");
  assert_eq!(hex(&groups),"ca67710930262c2fdeb745a64034add939e17d0571140355487e51c1ada47a84");
  let (event_own,event_keys)=ordinary_clothing_reference_keys(517031).unwrap();
  assert_eq!(event_own,2305082351);assert!(event_keys.contains(&furniture_guid_fingerprint([0xf19cbde5,0x482caed7,0x2797ac8b,0xe22f46e9])));
  assert_eq!(CLOTHING_REFERENCE_ROWS.iter().filter(|&&(id,_,_)|ordinary_creation_item(id)).count()+TRADEABLE_NONCLOTHING_REFERENCE_KEYS.len(),ordinary_creation_ids().count());
  let (own,keys)=ordinary_clothing_reference_keys(315822).unwrap();
  assert_eq!(own,1481090328);assert!(keys.contains(&furniture_guid_fingerprint([0xc0fb08c4,0x4a3b1847,0x87dc1dad,0x177dbe7e])));
  assert!(keys.contains(&furniture_guid_fingerprint([0x6ae79913,0x4dfd99ac,0xe020e4be,0x0f6869ef])));
 }
}

#[cfg(test)]mod custom_furniture_reference_tests{
 use super::*;
 #[test]fn complete_existing_custom_furniture_reference_coverage(){
  let rows=CUSTOM_FURNITURE_EXTRA_REFERENCE_KEYS;
  assert_eq!(rows.len(),165);
  assert!(rows.windows(2).all(|w|w[0].0<w[1].0));
  assert_eq!(rows.iter().map(|r|r.1).collect::<std::collections::HashSet<_>>().len(),165);
  assert!(rows.iter().all(|&(id,key)|custom_furniture_extra_reference(id)==Some(key)&&ordinary_tradeable_nonclothing_reference(id).is_none()));
  assert_eq!(crate::furniture_source::ITEMS.iter().filter(|s|!s.is_home_layout&&ordinary_quantity_limit(s.item_id)==Some(i32::MAX)&&
   (ordinary_tradeable_nonclothing_reference(s.item_id).is_some()||custom_furniture_extra_reference(s.item_id).is_some())).count(),621);
  assert_eq!(custom_furniture_extra_reference(102286319),Some(furniture_guid_fingerprint([0xc2961421,0x4fdf4f88,0x988e1cb7,0x7f57b563])));
  assert_eq!(custom_furniture_extra_reference(1900000001),None);
 }
}

#[cfg(test)]mod legacy_wand_source_tests{
 use super::*;
 #[test]fn complete_native_item_guid_reference_crosswalk(){
  use crate::inventory_legacy_wand_guid_data::{LEGACY_WAND_SOURCE_GUIDS,OTHER_NATIVE_ITEM_GUIDS};
  assert_eq!(OTHER_NATIVE_ITEM_GUIDS.len(),3552);
  assert!(OTHER_NATIVE_ITEM_GUIDS.windows(2).all(|w|w[0].0<w[1].0));
  let mut ids=std::collections::HashSet::new();
  let mut guids=std::collections::HashSet::new();
  for &(guid,id) in LEGACY_WAND_SOURCE_GUIDS.iter().chain(OTHER_NATIVE_ITEM_GUIDS){
   assert!(ids.insert(id)&&guids.insert(guid));
   let i=RULES.binary_search_by_key(&id,|r|r.0).unwrap();
   assert_eq!(furniture_guid_fingerprint(guid),ITEM_GUID_DENIAL_KEYS[i]);
   assert_eq!(native_item_reference_id(guid),Some(id));
  }
  assert_eq!(ids.len(),RULES.len());
  assert_eq!(native_item_reference_id([0;4]),None);
  assert_eq!(native_item_reference_id([u32::MAX;4]),None);
 }
 #[test]fn complete_legacy_recipe_guid_crosswalk(){
  use crate::inventory_legacy_wand_guid_data::LEGACY_WAND_SOURCE_GUIDS as ROWS;
  assert_eq!(ROWS.len(),8611);
  assert!(ROWS.windows(2).all(|w|w[0].0<w[1].0));
  assert_eq!(ROWS.iter().map(|r|r.1).collect::<std::collections::HashSet<_>>().len(),ROWS.len());
  assert_eq!(ROWS.iter().filter(|r|wand_source_style(ITEM_WAND_ID,r.1)==Some(0)).count(),8601);
  assert_eq!(ROWS.iter().filter(|r|wand_source_style(CRITTER_WAND_ID,r.1)==Some(0)).count(),10);
  assert_eq!(legacy_wand_source_id([0;4]),Some(0));
  assert_eq!(legacy_wand_source_id([u32::MAX;4]),None);
 }
}

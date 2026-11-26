//! Source-defined v3.0.1 item quantity semantics. No entitlement inference.
use crate::inventory_source_data::{RULES,CUSTOM_CAPS};
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
/// Authorizes only existing-row zero/refill, not absent-item generation.
const EXISTING_CURRENCY_IDS:&[i32]=&[
 348154640,391038680,460708033,483381991,646065996,833471261,
 1205887707,1486918074,1763799360,1774854033,1956968187,2079616823,
];
pub(crate) fn existing_currency_item(item_id:i32)->bool{
 EXISTING_CURRENCY_IDS.binary_search(&item_id).is_ok()&&ordinary_quantity_limit(item_id)==Some(i32::MAX)
}
#[cfg(test)]
mod currency_source_tests{
 use super::*;
 #[test]fn existing_currency_allowlist_is_pinned_and_does_not_authorize_absent_creation(){
  assert_eq!(EXISTING_CURRENCY_IDS.len(),12);
  assert!(EXISTING_CURRENCY_IDS.windows(2).all(|w|w[0]<w[1]));
  let bytes:Vec<_>=EXISTING_CURRENCY_IDS.iter().flat_map(|id|id.to_le_bytes()).collect();
  let hash:String=crate::digest::sha256(&bytes).iter().map(|b|format!("{b:02x}")).collect();
  assert_eq!(hash,"c8a8cb3f726e288d4662d8c90b53b8f60b14a58ec35bca22fc8c8797aabf4b3a");
  assert!(EXISTING_CURRENCY_IDS.iter().all(|&id|existing_currency_item(id)&&!ordinary_creation_item(id)));
  for id in [484139114,2092387705,615026760,709633628,1141761080]{assert!(!existing_currency_item(id));}
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
pub(crate) fn magic_wand_style(item:i32)->Option<i32>{
 MAGIC_WAND_STYLES.binary_search_by_key(&item,|&(id,_)|id).ok().map(|i|MAGIC_WAND_STYLES[i].1)
}
pub(crate) fn magic_wand_choices(v:[i32;2])->bool{
 WAND_MAGIC.iter().any(|&(id,_)|id==v[0])&&WAND_FLECK.iter().any(|&(id,_)|id==v[1])
}
#[cfg(test)]mod wand_source_tests{
 use super::*;
 #[test]fn source_magic_wand_shapes_and_ingredients(){
  assert!(MAGIC_WAND_STYLES.windows(2).all(|w|w[0].0<w[1].0));
  assert!(MAGIC_WAND_STYLES.iter().all(|&(id,_)|is_uncapped_required_unique_stack(id)));
  assert_eq!(WAND_MAGIC.len()*WAND_FLECK.len(),36);
  assert!(WAND_MAGIC.iter().chain(WAND_FLECK).all(|&(_,id)|ordinary_quantity_limit(id)==Some(i32::MAX)));
  assert_eq!(magic_wand_style(1020402601),None);
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
pub(crate) fn flower_clothing_reference_keys(item:i32)->Option<&'static [u32]>{
 FLOWER_CLOTHING_REFERENCE_KEYS.binary_search_by_key(&item,|r|r.0).ok().map(|i|FLOWER_CLOTHING_REFERENCE_KEYS[i].1)
}
#[cfg(test)]
mod clothing_reference_tests{
 use super::*;
 #[test]fn exact_source_clothing_crosswalk(){
  assert_eq!(CLOTHING_REFERENCE_ROWS.len(),2435);
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
  assert_eq!(CLOTHING_REFERENCE_GROUPS.len(),225);
  assert!(CLOTHING_REFERENCE_ROWS.windows(2).all(|w|w[0].0<w[1].0));
  assert!(CLOTHING_REFERENCE_GROUPS.windows(2).all(|w|w[0].0<w[1].0));
  let mut rows=Vec::new();let mut groups=Vec::new();
  for &(id,parent,k) in CLOTHING_REFERENCE_ROWS{
   assert!(ordinary_creation_item(id));assert_eq!(ordinary_furniture_guid_fingerprint(id),None);
   assert!(ordinary_clothing_reference_keys(id).is_some());rows.extend(id.to_le_bytes());rows.extend(parent.to_le_bytes());rows.extend(k.to_le_bytes());
  }
  for &(p,keys) in CLOTHING_REFERENCE_GROUPS{
   assert!(keys.len()>=2&&keys.windows(2).all(|w|w[0]<w[1]));
   groups.extend(p.to_le_bytes());groups.push(keys.len() as u8);for k in keys{groups.extend(k.to_le_bytes());}
  }
  let hex=|b:&[u8]|crate::digest::sha256(b).iter().map(|x|format!("{x:02x}")).collect::<String>();
  assert_eq!(hex(&rows),"0fc9bc9ac3d87997801ac7e62127d30a32aebd64843338d7022458c42fa091e6");
  assert_eq!(hex(&groups),"024dc49b7b93e3187e28e25bcee72d510274f0c712625681a055d6a86b062ce5");
  let (own,keys)=ordinary_clothing_reference_keys(315822).unwrap();
  assert_eq!(own,1481090328);assert!(keys.contains(&furniture_guid_fingerprint([0xc0fb08c4,0x4a3b1847,0x87dc1dad,0x177dbe7e])));
  assert!(keys.contains(&furniture_guid_fingerprint([0x6ae79913,0x4dfd99ac,0xe020e4be,0x0f6869ef])));
 }
}

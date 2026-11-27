use crate::{archive::{ZipIndex,SLOT,ACCOUNT,MAX_ARCHIVE,crc32},envelope::Version,read_slot,ReadSlot,Error,MAX_INPUT,MAX_DECODED,MAX_BLOCK,MAX_BLOCKS,decode_block};
use crate::wire::{Cursor,Token};
use crate::achievement::{self,AchievementValue,AchievementEntry};
use crate::native::{ModelState,InventoryUniqueData};
use crate::furniture_source::{self,FurnitureItemSource};
use std::{collections::{HashMap,HashSet},ops::Range};

const MAX_TICKS:i64=3_155_378_975_999_999_999;
const MAX_UNDO:usize=256;
// The compile-time journal capacity assertion below covers every maximum-size batch.
pub const MAX_INVENTORY_BATCH:usize=256;
// Session-only handle for an absent ordinary ingredient. Never a saved document ID.
const PENDING_ITEM:u32=1<<31;
// Steam 3.0.1 FlowerSettings.AvailableColors (30 entries) minus the
// two event-restricted entries in FlowerColorToEventMap (Black, Gray).
// Native pattern choices: species default + CrosstypePatterns, excluding
// definitions requiring DLC. No inference from rendered masks or names.
const FLOWER_COLORS:&[i32]=&[1,2,3,4,5,6,7,8,9,10,11,12,13,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30];
const FLOWER_EFFECTS:&[i32]=&[3,4,5,6,7,8,9,15];
const RESTRICTED_FLOWER_EFFECTS:&[i32]=&[6,15];
const RESTRICTED_FLOWER_COLORS:&[i32]=&[14,15];
fn restricted_flower_appearance(v:FlowerVariant)->bool{
 RESTRICTED_FLOWER_EFFECTS.contains(&v[2])||RESTRICTED_FLOWER_COLORS.contains(&v[1])||RESTRICTED_FLOWER_COLORS.contains(&v[3])
}
const FLOWER_SPECIES:&[(i32,&[i32])]=&[
 (43114910,&[1,2,3,4,5,7,8,9,10,11,13,16]),
 (183701770,&[2,3,4,5,7,8,9,10,11,12,13,14,16]),
 (203856820,&[3,4,5,7,8,9,10,16]),
 (228573412,&[1,2,3,4,5,7,8,9,10,11,12,13,14,16]),
 (252458237,&[3,4,5,7,8,9,10,12,14]),
 (261557677,&[2,3,4,5,7,8,9,10,11,12,13,14,16]),
 (274491259,&[1,2,3,4,5,7,8,9,10,11,12,13,14,16]),
 (275816250,&[3,4,5,7,8,9,10]),
 (312661096,&[1,2,3,4,5,7,8,9,10,11,12,13,14,16]),
 (462608550,&[1,2,3,4,5,7,8,9,10,11,12,13,14,16]),
 (668399845,&[3,4,5,7,8,9,10]),
 (1223758923,&[3,4,5,7,8,9,10,16]),
 (1299466625,&[3,4,5,7,8,9,10]),
 (1331175279,&[1,2,3,4,5,7,8,9,10,11,12,13,14,16]),
 (1386186941,&[2,3,4,5,7,8,9,10,11,12,13,14]),
 (1466319046,&[1,2,3,4,5,7,8,9,10,11,12,13,14,16]),
 (1554283135,&[2,3,4,5,7,8,9,10,12,13,14,16]),
 (1561432864,&[1,2,3,4,5,7,8,9,10,11,12,13,14,16]),
 (1583118562,&[3,4,5,7,8,9,10,13,16]),
 (1669522060,&[1,2,3,4,5,7,8,9,10,11,12,13,14,16]),
 (1695731578,&[3,4,5,7,8,9,10]),
 (1804880447,&[3,4,5,7,8,9,10,11,12,13,16]),
 (1934826268,&[1,2,3,4,5,7,8,9,10,11,12,13,14,16]),
 (1968535430,&[2,3,4,5,7,8,9,10,11,12,13,14,16]),
 (2105820233,&[2,3,4,5,7,8,9,10,11,12,14,16]),
];
// Steam v3.0.1 item_instruction_clothing_flowercrown (2140092170)
// FlowerToCrownDictionary: exact PPtr key/value pairing, restricted to the
// 23 output + source definitions without DLC/event-year gates.
// Original short/tall unpatterned candle recipes: output, source flower, denial GUID fingerprint.
const FLOWER_CANDLE_SPECIES:&[(i32,i32,u32)]=&[
 (1873326,1223758923,0x8df55774),
 (30197386,1554283135,0x1eb0e2be),
 (52086842,183701770,0xff67a541),
 (55132619,1299466625,0x8bc24c20),
 (65427158,43114910,0xc45636f6),
 (145970187,1583118562,0xad7a7af9),
 (155538483,668399845,0x131bb787),
 (195708471,462608550,0xd0364295),
 (236135446,275816250,0x4713f49a),
 (282150062,1554283135,0x9e5df1d5),
 (302852764,274491259,0xca25c0af),
 (371833720,203856820,0x3c73ca70),
 (385493558,1466319046,0x96bb2942),
 (469825649,261557677,0x20986e93),
 (510997667,1561432864,0xdfbd6e75),
 (571502700,1968535430,0xcbeb8781),
 (641105964,252458237,0x49f4e7c9),
 (646834705,1331175279,0xd51e8a0a),
 (713218636,1669522060,0xa1c8e7d2),
 (821446423,1968535430,0x14c37578),
 (826626504,1804880447,0xe7b2dbf7),
 (877491806,2105820233,0xc9f16c6c),
 (879044439,228573412,0x55fa6405),
 (892074831,228573412,0x645e4049),
 (894640834,252458237,0x90a39f38),
 (1124067577,43114910,0x1adbe13e),
 (1137627495,203856820,0xcc0b5c0c),
 (1170993638,668399845,0xd9f7e275),
 (1205053551,312661096,0xd363949b),
 (1221419078,1331175279,0x059a5d37),
 (1221620580,261557677,0xb722e11f),
 (1257505968,1223758923,0xfc1a4f58),
 (1283860765,1299466625,0x2f4a57eb),
 (1348991543,1583118562,0x5973d51a),
 (1367911683,462608550,0x5fcc113d),
 (1377029192,312661096,0xb57cc893),
 (1395596528,1695731578,0x8effa38a),
 (1396910324,1386186941,0xed35296b),
 (1417320481,1695731578,0xf14ffd6b),
 (1417459756,2105820233,0xa601ba44),
 (1449320177,1386186941,0x262ec654),
 (1682411201,275816250,0x765cd8d1),
 (1685968411,1934826268,0x47d47576),
 (1860644541,274491259,0x4eb22aad),
 (1894513639,1669522060,0x3be8d683),
 (1924806266,183701770,0x12e0bd1f),
 (2056044876,1561432864,0xdec24cd8),
 (2057109142,1934826268,0x51cfe130),
 (2062954152,1466319046,0xe0995427),
 (2103772766,1804880447,0x5ec8feff),
];
fn flower_candle_source(item:i32)->Option<&'static (i32,i32,u32)>{
 FLOWER_CANDLE_SPECIES.binary_search_by_key(&item,|r|r.0).ok().map(|i|&FLOWER_CANDLE_SPECIES[i])
}
const FLOWER_CROWN_SPECIES:&[(i32,i32)]=&[
 (108363489,2105820233),
 (475585922,1695731578),
 (638410399,1804880447),
 (644209106,668399845),
 (790136191,462608550),
 (810330134,252458237),
 (833950358,1331175279),
 (881399767,261557677),
 (894396852,1561432864),
 (897617923,1554283135),
 (1001954252,275816250),
 (1021906725,203856820),
 (1048380205,183701770),
 (1095918548,312661096),
 (1101281143,1299466625),
 (1120342995,43114910),
 (1177909060,1386186941),
 (1423101683,1669522060),
 (1560032168,1223758923),
 (1607110454,1583118562),
 (1693955310,1934826268),
 (1716283922,1466319046),
 (1783185900,228573412),
 (1861587997,1968535430),
 (1876646873,274491259),
];
// Exact source flower definitions paired to the 23 unrestricted crown
// outputs above. DefaultColors are from the pinned Steam FlowerItemDetails.
// Unowned creation is deliberately narrower than editing existing colors.
const ABSENT_FLOWER_DEFAULTS:&[(i32,&[i32])]=&[
 (43114910,&[2,5,10]),
 (183701770,&[13]),
 (203856820,&[3]),
 (228573412,&[10,29]),
 (252458237,&[7,21,29]),
 (261557677,&[12]),
 (274491259,&[1,4,11]),
 (275816250,&[4,8,12]),
 (462608550,&[1,4,16]),
 (668399845,&[5,13]),
 (1223758923,&[11]),
 (1299466625,&[22,24,26,28]),
 (1331175279,&[6,8,16]),
 (1386186941,&[17,23,27]),
 (1554283135,&[1,4,16,29]),
 (1561432864,&[1,16]),
 (1583118562,&[25]),
 (1669522060,&[4,12]),
 (1695731578,&[16]),
 (1804880447,&[2,18,19,20]),
 (1934826268,&[8,16]),
 (1968535430,&[4,9,16]),
 (2105820233,&[3]),
];
// Original generic processors accept any flower; the HK-style bow explicitly
// clears both pattern fields (IgnorePatternOnOutputItem=true).
// Includes seven event-year floral outfits with unrestricted native tradable outputs.
const FLOWER_CLOTHING_GENERIC:&[i32]=&[41105179,105502901,313677564,528401863,809985659,811189976,965037291,1110255162,1227385139,1646153125];
const FLOWER_CLOTHING_NO_PATTERN:i32=1482119840;
// Switch v3.0.1: DLC output rows require an original owned witness.
const OWNED_DLC_FLOWER_GENERIC:&[i32]=&[401804031,1776250358,1797473773];
fn owned_dlc_flower_output(item:i32)->bool{
 matches!(item,385493558|1205053551|1377029192|2062954152|1095918548|1716283922|401804031|1776250358|1797473773)
}
const ALL_UNRESTRICTED_FLOWER_PATTERNS:&[i32]=&[1,2,3,4,5,7,8,9,10,11,12,13,14,16];
pub type BobaVariant=[i32;5];
pub type WandVariant=[i32;2];
pub type WandIdentity=[i32;3]; // source Item ID, magic, fleck
pub type WandData=[i32;6]; // source, magic, fleck, three material indices; -1 tail denotes nil
const WAND_NIL_MATERIALS:[i32;3]=[-1;3];
pub type CafeVariant=[i32;6]; // three ordered flavor words, then three color words; unused slots zero
pub type PaletteVariant=[[u32;4];3]; // exact IEEE-754 bits
pub type FurnitureVariant=[i32;3];
fn furniture_variant(data:InventoryUniqueData)->Option<FurnitureVariant>{
 if let InventoryUniqueData::Furniture{materials}=data{Some(materials)}else{None}
}
// For collision detection only, resolve omitted/default slots to the source
// default. This is deliberately stricter than comparing raw saved indices.
fn furniture_key(source:&FurnitureItemSource,v:FurnitureVariant)->Option<FurnitureVariant>{
 let mut key=v;
 for (i,n) in v.into_iter().enumerate(){
  match source.slots.iter().find(|s|s.slot as usize==i){
   Some(slot)=>{
    if n!=0&&n!=slot.default_index&&!slot.allowed.contains(&n){return None}
    if n==0{key[i]=slot.default_index}
   }
   None=>if n!=0{return None}
  }
 }
 Some(key)
}
// Exact native GUIDs from Steam v3.0.1 definitions, ColorIndex/PatternIndex.
const LEGACY_FLOWER_COLOR_GUIDS:&[[u32;4]]=&[
 [0;4],
 [0x2aae4095,0xe54cbe9d,0xe64129a2,0xf14c84e7],
 [0x43687091,0x4d69b05b,0x475ed195,0xaec32728],
 [0x62a43541,0x0645c55d,0x0e8e6ea9,0x465fe205],
 [0x4d814281,0x5e4847f4,0xb439c38b,0xa483c246],
 [0x81464f73,0x4b59150e,0x3c46dfa9,0xa8d2c35e],
 [0xd998ac55,0xe54d5896,0x8d5dcc85,0x6cb36c18],
 [0xf6c8a17b,0x480e81f6,0xfe7c8d83,0x9946704f],
 [0x9a7335f2,0xc243128f,0xca5d6687,0xec44cf22],
 [0xee6eb4b2,0x4ea61a44,0x81fd9788,0x9590ccac],
 [0xe3707ec4,0x7c44482f,0x752d6398,0xf11c464d],
 [0x5d06c260,0x1e476e92,0x5ba9c6bc,0x4ee7ed68],
 [0x89df9070,0x45c0ca7e,0xe145e0a0,0x9c3bcb08],
 [0x31991a8e,0x472088f3,0x407834b3,0x76fe1cc6],
 [0x5d45e04e,0x44a9fa7c,0xaeb7e49e,0x9cca4877],
 [0x1713a79a,0x45ff6585,0x489d928b,0xde2f8f7d],
 [0x832da5d2,0x604d792f,0x2f37b0a0,0x0cacdf5a],
 [0xb14d9d6a,0xc940746d,0xa058779c,0xaa6d28d7],
 [0x60ed4e3f,0x4e61318b,0x841c7cb2,0x0d25e3ba],
 [0x9c480443,0x4b0c03aa,0x2b145393,0x0f2011ad],
 [0x8c644c29,0x5d4a194d,0xbb947c8c,0x509cda0f],
 [0xbb1d2f3c,0xc54d1cba,0x028905bf,0x2bc04abf],
 [0x36d6b74e,0x4a37c521,0x80873598,0xad147865],
 [0x70734385,0x4c4ba1d7,0x6b2691b1,0xc08bd375],
 [0x31119dac,0x465fa1e8,0x66d233b0,0x9d34a090],
 [0xc04dbc15,0x420873d3,0xc0a8dcaf,0xa292daa2],
 [0xb26def2a,0x4d22bf1d,0xca98b8ad,0x4c79a0dd],
 [0xb8ebf612,0x4b786472,0x469175b8,0x7d334482],
 [0xc69de6b5,0x46a1d2a9,0x6b6613be,0x6f7cd311],
 [0x8516d356,0x440a530c,0x44955594,0x340de234],
 [0xf2971566,0x4629db4c,0xb2f104a6,0xed309b34],
];
const LEGACY_FLOWER_PATTERN_GUIDS:&[[u32;4]]=&[
 [0;4],
 [0xfd26bba7,0x4fee7263,0x1dca7fa1,0x044b5807],
 [0x13b92a2a,0x4eef210a,0xda0896a5,0x69b5343d],
 [0x5d665c5a,0x43a8a11b,0x36747a99,0x2822a8bd],
 [0x8364aeaf,0xa64cc4bb,0x90ba20af,0x59f32225],
 [0x6cd2e965,0x1a4aaf18,0x579518ab,0xe93cb415],
 [0xcafa07b4,0x431df4bd,0x03a87daf,0x5d3e229c],
 [0x7ebf4097,0x442955f6,0x3f289484,0xcaaa17bf],
 [0x364c7a22,0x1f42d6f6,0xce5dcf93,0x003eba81],
 [0x48b5b507,0x49aeafca,0xe455b0b0,0xe87bd522],
 [0x58530eb2,0x734363bc,0x010eeca1,0xf010336b],
 [0x22d4ac2c,0x430bf4e4,0x6d6d42ba,0x8a18b212],
 [0x655172c0,0x40129b3b,0x642054b1,0xab938037],
 [0xa6c5f0cb,0x4e98fa29,0x8b205db3,0x2c11fa7f],
 [0xdd1a5089,0x42619fec,0xbd6ca4bf,0xf32d7ed8],
 [0x478b828b,0x43501e6d,0x85f4f4a2,0x1a67e1c2],
 [0xdf6f0098,0x00492b78,0x804df28a,0xfb9dbe61],
];
pub type FlowerVariant=[i32;4]; // grow state, base color, pattern, pattern color
fn flower_variant(data:InventoryUniqueData)->Option<FlowerVariant>{
 if let InventoryUniqueData::Flower{grow_state,base_color,pattern,pattern_color}=data{
  Some([i32::from(grow_state),base_color,pattern,pattern_color])
 }else{None}
}
fn flower_unique(v:FlowerVariant)->InventoryUniqueData{
 InventoryUniqueData::Flower{grow_state:v[0] as u8,base_color:v[1],pattern:v[2],pattern_color:v[3]}
}
// One source mapping for both existing and newly staged tag-7 records.
const RARE_CANDLE_KEYS:&[(i32,u32)]=&[(22657460,0x3801512e),(1858821696,0xdf4cea79)];
// Native IsPatterned compares the pattern definition GUID, not its accent or IsEffect.
const RARE_CANDLE_PATTERNS:&[i32]=ALL_UNRESTRICTED_FLOWER_PATTERNS;
fn rare_candle_key(item:i32)->Option<u32>{RARE_CANDLE_KEYS.iter().find(|&&(id,_)|id==item).map(|&(_,key)|key)}
#[derive(Clone,Copy)]
struct FlowerPolicy{patterns:&'static [i32],require_pattern:bool,retained_effect:Option<i32>,retained_colors:[Option<i32>;2]}
impl FlowerPolicy{
 fn ordinary(patterns:&'static [i32])->Self{Self{patterns,require_pattern:false,retained_effect:None,retained_colors:[None;2]}}
}
fn flower_item_patterns(item:i32,grow:i32)->Option<FlowerPolicy>{
 if let Some((_,patterns))=FLOWER_SPECIES.iter().find(|(id,_)|*id==item){return Some(FlowerPolicy::ordinary(patterns))}
 if grow!=6{return None}
 if let Ok(i)=FLOWER_CROWN_SPECIES.binary_search_by_key(&item,|&(id,_)|id){
  let species=FLOWER_CROWN_SPECIES[i].1;
  return FLOWER_SPECIES.iter().find(|(id,_)|*id==species).map(|&(_,p)|FlowerPolicy::ordinary(p))
 }
 if rare_candle_key(item).is_some(){Some(FlowerPolicy{patterns:RARE_CANDLE_PATTERNS,require_pattern:true,retained_effect:None,retained_colors:[None;2]})}
 else if FLOWER_CLOTHING_GENERIC.contains(&item)||OWNED_DLC_FLOWER_GENERIC.contains(&item){Some(FlowerPolicy::ordinary(ALL_UNRESTRICTED_FLOWER_PATTERNS))}
 else if item==FLOWER_CLOTHING_NO_PATTERN||flower_candle_source(item).is_some(){Some(FlowerPolicy::ordinary(&[]))}else{None}
}
fn valid_flower_variant(policy:FlowerPolicy,v:FlowerVariant)->bool{
 (!policy.require_pattern||(v[0]==6&&policy.patterns.contains(&v[2])))&&
 matches!(v[0],0|6|7)&&(FLOWER_COLORS.contains(&v[1])||policy.retained_colors[0]==Some(v[1]))&&
 if v[2]==0{v[3]==0}
 else if !policy.patterns.contains(&v[2])&&policy.retained_effect!=Some(v[2]){false}
 else if FLOWER_EFFECTS.contains(&v[2]){v[3]==0}
 else{(FLOWER_COLORS.contains(&v[3])||policy.retained_colors[1]==Some(v[3]))&&v[3]!=v[1]}
}
// FlowerSettings.GetPatternColor: White unless the main color is White,
// then WarmPink. Do not choose a random value for an explicit editor action.
fn default_flower_accent(base:i32)->i32{if base==16{17}else{16}}

#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub struct Entry {pub id:i32,pub ticks:i64}
#[derive(Clone,Copy,Debug,PartialEq)]
pub struct CounterEntry {pub guid:[u32;4],pub current:f32,pub counted_values:Option<usize>,pub counted_guids:usize}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub struct InventoryEntry {pub document_id:u32,pub item_id:i32,pub quantity:i32,pub editable:bool,pub quantity_limit:Option<i32>,pub quantity_minimum:i32}
#[derive(Clone,Copy,Debug)]
struct InventoryQuantityDelta{document_id:u32,before:Option<i32>,after:Option<i32>}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
struct PendingFlower {item_id:i32,variant:FlowerVariant}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
struct PendingFurniture {item_id:i32,variant:FurnitureVariant}
#[derive(Clone,Debug)]
enum Change {
 Collection{id:i32,before:Option<Option<i64>>,after:Option<Option<i64>>},
 Inventory{document_id:u32,before:Option<i32>,after:Option<i32>},
 InventoryBatch{deltas:Vec<InventoryQuantityDelta>},
 FlowerVariant{document_id:u32,before:Option<FlowerVariant>,after:Option<FlowerVariant>},
 FlowerCreated{document_id:u32,source_id:u32,expected:FlowerVariant,flower:PendingFlower,quantity:i32},
 FurnitureVariant{document_id:u32,before:Option<FurnitureVariant>,after:Option<FurnitureVariant>},
 PaletteVariant{document_id:u32,before:Option<PaletteVariant>,after:Option<PaletteVariant>},
 WandVariant{document_id:u32,before:Option<WandData>,after:Option<WandData>},
 WandCreated{document_id:u32,source_id:u32,item_id:i32,expected:WandVariant,expected_nested:Option<WandData>,identity:WandData,quantity:i32},
 BobaVariant{document_id:u32,before:Option<BobaVariant>,after:Option<BobaVariant>},
 CafeVariant{document_id:u32,before:Option<CafeVariant>,after:Option<CafeVariant>},
 CafeCreated{document_id:u32,source_id:u32,item_id:i32,expected:CafeVariant,variant:CafeVariant,quantity:i32},
 BobaCreated{document_id:u32,source_id:u32,expected:BobaVariant,variant:BobaVariant,quantity:i32},
 PaletteCreated{document_id:u32,source_id:u32,expected:PaletteVariant,variant:PaletteVariant,quantity:i32},
 FurnitureCreated{document_id:u32,source_id:u32,expected:FurnitureVariant,furniture:PendingFurniture,quantity:i32},
 Achievement{guid:[u32;4],before:Option<AchievementValue>,after:Option<AchievementValue>},
 AchievementCreated{guid:[u32;4],before:Option<AchievementValue>,after:Option<AchievementValue>},
 AchievementCreatedPair{guid:[u32;4],value:AchievementValue,parent:([u32;4],Option<AchievementValue>,Option<AchievementValue>)},
 AchievementParentNew{child:([u32;4],bool,Option<AchievementValue>,Option<AchievementValue>),parent:([u32;4],AchievementValue)},
 AchievementPair{first:([u32;4],bool,Option<AchievementValue>,Option<AchievementValue>),
                 second:([u32;4],bool,Option<AchievementValue>,Option<AchievementValue>)},
}


#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum HistoryScope { Collections, Achievements, Inventory }
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub struct HistoryRecord {
 pub scope:HistoryScope,
 pub applied:bool,
 pub paired:bool,
 pub item_id:i32,
 pub guid:[u32;4],
}
impl Change {
 fn scope(&self)->HistoryScope{
  match self {Self::Collection{..}=>HistoryScope::Collections,Self::Inventory{..}|Self::InventoryBatch{..}|Self::FlowerVariant{..}|Self::FlowerCreated{..}|Self::FurnitureCreated{..}|Self::FurnitureVariant{..}|Self::PaletteVariant{..}|Self::PaletteCreated{..}|Self::BobaVariant{..}|Self::BobaCreated{..}|Self::CafeVariant{..}|Self::CafeCreated{..}|Self::WandVariant{..}|Self::WandCreated{..}=>HistoryScope::Inventory,_=>HistoryScope::Achievements}
 }
 fn history_record(&self,applied:bool)->HistoryRecord{
  let (item_id,guid,paired)=match self {
   Self::Collection{id,..}=>(*id,[0;4],false),
   Self::Inventory{document_id,..}|Self::FlowerVariant{document_id,..}|Self::FurnitureVariant{document_id,..}|Self::PaletteVariant{document_id,..}|Self::BobaVariant{document_id,..}|Self::CafeVariant{document_id,..}|Self::WandVariant{document_id,..}=>(*document_id as i32,[0;4],false),
   Self::InventoryBatch{deltas}=>(deltas[0].document_id as i32,[0;4],false),
   Self::FlowerCreated{source_id,..}|Self::FurnitureCreated{source_id,..}|Self::PaletteCreated{source_id,..}|Self::BobaCreated{source_id,..}|Self::CafeCreated{source_id,..}|Self::WandCreated{source_id,..}=>(*source_id as i32,[0;4],false),
   Self::Achievement{guid,..}|Self::AchievementCreated{guid,..}=>(0,*guid,false),
   Self::AchievementCreatedPair{guid,..}|Self::AchievementParentNew{child:(guid,..),..}=>(0,*guid,true),
   Self::AchievementPair{first:(guid,..),..}=>(0,*guid,true),
  };
  HistoryRecord{scope:self.scope(),applied,paired,item_id,guid}
 }
}

pub struct Editor {
 original:Vec<u8>,
 zip:Option<ZipIndex>,
 slot_raw:Vec<u8>,
 slot:ReadSlot,
 base:HashMap<i32,i64>,
 entries:Vec<Entry>,
 changes:HashMap<i32,Option<i64>>,
 inventory_changes:HashMap<u32,i32>,
 pending_flowers:HashMap<u32,PendingFlower>,
 pending_furniture:HashMap<u32,PendingFurniture>,
 pending_palettes:HashMap<u32,PaletteVariant>,
 pending_cafes:HashMap<u32,(i32,CafeVariant)>,
 pending_wands:HashMap<u32,(i32,WandData)>,
 pending_bobas:HashMap<u32,BobaVariant>,
 inventory_item_rows:HashMap<i32,usize>,
 unique_quantity_ids:HashSet<u32>,
 legacy_wand_sources_resolved:bool,
 flower_variant_changes:HashMap<u32,FlowerVariant>,
 furniture_variant_changes:HashMap<u32,FurnitureVariant>,
 palette_variant_changes:HashMap<u32,PaletteVariant>,
 cafe_variant_changes:HashMap<u32,CafeVariant>,
 wand_variant_changes:HashMap<u32,WandData>,
 boba_variant_changes:HashMap<u32,BobaVariant>,
 achievement_changes:HashMap<[u32;4],AchievementValue>,
 achievement_created:HashMap<[u32;4],AchievementValue>,
 undo:Vec<Change>,
 redo:Vec<Change>,
 revision:u32,
}

impl Editor {
 pub fn open(original:Vec<u8>)->Result<Self,Error>{
  if original.is_empty() || original.len()>MAX_ARCHIVE {return Err(Error::Budget)}
  let (zip,slot_raw)=if original.starts_with(b"PK\x03\x04") {
   let z=ZipIndex::parse(&original)?;
   if !z.entries.iter().any(|x|x.name==SLOT) || !z.entries.iter().any(|x|x.name==ACCOUNT){return Err(Error::Schema)}
   let (s,_)=z.targets(&original)?;
   (Some(z),s.ok_or(Error::Schema)?)
  } else {
   if original.len()>MAX_INPUT{return Err(Error::Budget)}
   (None,original.clone())
  };
  let slot=read_slot(&slot_raw)?;
  if !Self::compatible(&slot) {return Err(Error::Version)}
  let mut base=HashMap::new();let mut entries=Vec::with_capacity(slot.index.collections.len());
  for row in &slot.index.collections {
   if base.insert(row.id,row.ticks).is_some(){return Err(Error::Duplicate)}
   entries.push(Entry{id:row.id,ticks:row.ticks});
  }
  let mut inventory_item_rows=HashMap::new();
  for row in &slot.index.inventory{
   if let Some(id)=row.item_id{*inventory_item_rows.entry(id).or_insert(0usize)+=1;}
  }
  // Original slot bytes and native index are immutable for the session.
  let legacy_wand_sources_resolved=slot.index.inventory.iter().filter(|r|matches!(r.unique_data,Some(InventoryUniqueData::Opaque{tag:5}))).all(|r|
   r.id>0&&r.id<PENDING_ITEM&&r.unique_id.is_some_and(|uid|uid>0)&&r.quantity.is_some_and(|q|q>=0)&&
   r.fields.iter().all(Option::is_some)&&Self::legacy_wand_identity_in(&slot.envelope.decoded,r).is_some());
  let mut editor=Self{original,zip,slot_raw,slot,base,entries,changes:HashMap::new(),inventory_changes:HashMap::new(),pending_flowers:HashMap::new(),pending_furniture:HashMap::new(),pending_palettes:HashMap::new(),pending_bobas:HashMap::new(),pending_cafes:HashMap::new(),pending_wands:HashMap::new(),inventory_item_rows,unique_quantity_ids:HashSet::new(),legacy_wand_sources_resolved,flower_variant_changes:HashMap::new(),furniture_variant_changes:HashMap::new(),palette_variant_changes:HashMap::new(),boba_variant_changes:HashMap::new(),wand_variant_changes:HashMap::new(),cafe_variant_changes:HashMap::new(),achievement_changes:HashMap::new(),achievement_created:HashMap::new(),undo:Vec::new(),redo:Vec::new(),revision:0};
  editor.unique_quantity_ids=editor.index_unique_quantity_ids();
  Ok(editor)
 }
 fn compatible(slot:&ReadSlot)->bool{
  let n=slot.index.collection_version.as_ref().map(|v|v.number);
  let compatible_version=match slot.envelope.version{
   Version::V300=>n==Some(83),
   Version::V301=>n==Some(87),
   // Future content revisions may change the collection revision number
   // even while all target field layouts remain byte-compatible.
   // read_slot() already enforces the complete typed native schema walk.
   Version::Forward{..}=>n.is_some_and(|v|v>=87)
  };
  compatible_version&&slot.index.collection_map.is_some()
 }
 pub fn version(&self)->String {self.slot.envelope.version.as_str()}
 pub fn source_bytes(&self)->usize {self.original.len()}
 fn next_edit_revision(&self)->Result<u32,Error>{
  // A staged unique creation must remain replayable. Never evict its
  // creation record or prerequisites from the bounded native journal.
  if (self.pending_unique_count()>0||self.redo.iter().any(|c|matches!(c,Change::FlowerCreated{..}|Change::FurnitureCreated{..}|Change::PaletteCreated{..}|Change::BobaCreated{..}|Change::CafeCreated{..}|Change::WandCreated{..})))&&self.undo.len()+self.redo.len()>=MAX_UNDO{return Err(Error::Budget)}
  self.revision.checked_add(1).ok_or(Error::Overflow)
 }
 pub fn revision(&self)->u32 {self.revision}
 pub fn is_zip(&self)->bool {self.zip.is_some()}
 pub fn entries(&self)->Vec<Entry>{
  let mut result=Vec::with_capacity(self.entries.len()+self.changes.len());
  for x in &self.entries {
   if let Some(ticks)=self.value(x.id) {result.push(Entry{id:x.id,ticks})}
  }
  let mut appended:Vec<_>=self.changes.iter().filter_map(|(&id,&v)|{
   if self.base.contains_key(&id){None}else{v.map(|ticks|Entry{id,ticks})}
  }).collect();
  appended.sort_by_key(|x|x.id);result.extend(appended);result
 }
 pub fn value(&self,id:i32)->Option<i64>{
  match self.changes.get(&id){Some(v)=>*v,None=>self.base.get(&id).copied()}
 }
 pub fn achievements(&self)->Vec<AchievementEntry>{
  let mut rows:Vec<AchievementEntry>=self.slot.index.achievements.iter().filter_map(|model|{
   let value=self.achievement_changes.get(&model.guid).copied().or_else(||achievement::value(model).ok())?;
   Some(AchievementEntry{guid:model.guid,value})
  }).collect();
  let mut added:Vec<_>=self.achievement_created.iter()
   .map(|(&guid,&value)|AchievementEntry{guid,value}).collect();
  added.sort_by_key(|r|r.guid);
  rows.extend(added);rows
 }
 /// Original native inventory records; positive ordinary stack quantity bounds
 /// are source-defined and never inferred from a display category.
 pub fn inventory(&self)->Vec<InventoryEntry>{
  let mut rows:Vec<_>=self.slot.index.inventory.iter().filter_map(|r|{
   let quantity_limit=self.inventory_quantity_limit(r);
   let quantity_minimum=if self.inventory_can_empty(r){0}else{1};
   Some(InventoryEntry{document_id:r.id,item_id:r.item_id?,quantity:
    self.inventory_changes.get(&r.id).copied().or(r.quantity)?,
    editable:quantity_limit.is_some(),quantity_limit,quantity_minimum})
  }).collect();
  rows.extend(self.pending_inventory_rows());rows
 }
 /// Read-only lookup by document identity, never by Item ID alone.
 pub fn inventory_unique_data(&self,id:u32)->Option<crate::native::InventoryUniqueData>{
  if self.pending_flowers.contains_key(&id)&&!self.inventory_changes.contains_key(&id){return None}
  if self.pending_furniture.contains_key(&id)&&!self.inventory_changes.contains_key(&id){return None}
  if let Some(v)=self.pending_palettes.get(&id){return self.inventory_changes.contains_key(&id).then(||InventoryUniqueData::Palette{rgba_bits:self.palette_variant_changes.get(&id).copied().unwrap_or(*v)})}
  if let Some(&(item,identity))=self.pending_wands.get(&id){
   return self.inventory_changes.contains_key(&id).then(||Self::wand_appearance(item,self.wand_variant_changes.get(&id).copied().unwrap_or(identity))).flatten()
  }
  if let Some((_,v))=self.pending_cafes.get(&id){return self.inventory_changes.contains_key(&id).then(||Self::cafe_appearance(self.cafe_variant_changes.get(&id).copied().unwrap_or(*v)))}
  if let Some(v)=self.pending_bobas.get(&id){return self.inventory_changes.contains_key(&id).then(||InventoryUniqueData::BobaAppearance{color_id:self.boba_variant_changes.get(&id).copied().unwrap_or(*v)[0]})}
  if let Some(f)=self.pending_flowers.get(&id){return Some(flower_unique(self.flower_variant_changes.get(&id).copied().unwrap_or(f.variant)))}
  if let Some(f)=self.pending_furniture.get(&id){return Some(InventoryUniqueData::Furniture{materials:self.furniture_variant_changes.get(&id).copied().unwrap_or(f.variant)})}
  let row=self.slot.index.inventory.iter().find(|row|row.id==id)?;
  self.effective_unique(row)
 }
 /// Original, complete schema-validated payload; no caller-supplied parsing or mutation.
 /// Includes historical, nested wand, layout and kit types without flattening.
 pub fn inventory_original_unique_payload(&self,id:u32)->Option<&[u8]>{
  let row=self.slot.index.inventory.iter().find(|r|r.id==id)?;
  self.slot.envelope.decoded.get(row.fields[3].clone()?)
 }
 fn effective_unique(&self,row:&crate::native::InventoryRow)->Option<InventoryUniqueData>{
  if let Some(&identity)=self.wand_variant_changes.get(&row.id){
   return Self::wand_appearance(row.item_id?,identity)
  }
  // For verified legacy rows expose the resolved appearance, not a tag conversion.
  if matches!(row.unique_data,Some(InventoryUniqueData::Opaque{tag:1}))&&self.unique_quantity_ids.contains(&row.id){
   let materials=self.furniture_variant_changes.get(&row.id).copied().or_else(||Self::legacy_furniture_materials(&self.slot.envelope.decoded,row))?;
   return Some(InventoryUniqueData::Furniture{materials})
  }
  if matches!(row.unique_data,Some(InventoryUniqueData::Opaque{tag:5}))&&self.unique_quantity_ids.contains(&row.id){
   return Self::wand_appearance(row.item_id?,self.legacy_wand_identity(row)?)
  }
  if matches!(row.unique_data,Some(InventoryUniqueData::Opaque{tag:2}))&&self.unique_quantity_ids.contains(&row.id){
   return self.flower_variant_changes.get(&row.id).copied().or_else(||Self::legacy_flower_variant(&self.slot.envelope.decoded,row)).map(flower_unique)
  }
  self.flower_variant_changes.get(&row.id).copied().map(flower_unique)
   .or_else(||self.furniture_variant_changes.get(&row.id).copied().map(|materials|InventoryUniqueData::Furniture{materials}))
   .or_else(||self.palette_variant_changes.get(&row.id).copied().map(|rgba_bits|InventoryUniqueData::Palette{rgba_bits}))
   .or_else(||self.boba_variant_changes.get(&row.id).map(|v|InventoryUniqueData::BobaAppearance{color_id:v[0]}))
   .or_else(||self.cafe_variant_changes.get(&row.id).copied().map(Self::cafe_appearance)).or(row.unique_data)
 }
 /// Presentation only. A denied edit does not imply an unknown appearance.
 /// Never use this projection for eligibility, CAS, identity, or writing.
 fn displayed_unique(&self,row:&crate::native::InventoryRow)->Option<InventoryUniqueData>{
  let effective=self.effective_unique(row);
  if self.slot.envelope.version!=Version::V301{return effective}
  if !matches!(effective,None|Some(InventoryUniqueData::Opaque{..})){return effective}
  let decoded=&self.slot.envelope.decoded;
  let display=match row.unique_data{
   Some(InventoryUniqueData::Opaque{tag:1})=>Self::legacy_furniture_materials(decoded,row).map(|materials|InventoryUniqueData::Furniture{materials}),
   Some(InventoryUniqueData::Opaque{tag:2})=>Self::legacy_flower_variant(decoded,row).map(flower_unique),
   Some(InventoryUniqueData::Opaque{tag:5})=>Self::legacy_wand_display(decoded,row),
   _=>None
  };
  display.or(effective)
 }
 fn legacy_wand_display(decoded:&[u8],row:&crate::native::InventoryRow)->Option<InventoryUniqueData>{
  if !matches!(row.unique_data,Some(InventoryUniqueData::Opaque{tag:5}))||row.unique_fields.len()!=5{return None}
  let mut c=Cursor::new(decoded.get(row.unique_fields[0].clone())?);
  let mut guid=[0;4];for word in &mut guid{*word=c.int(0,u32::MAX as i128).ok()? as u32;}
  if c.pos!=c.bytes.len(){return None}
  let source_item_id=if guid==[0;4]{0}else{crate::inventory_source::native_item_reference_id(guid)?};
  let raw=decoded.get(row.unique_fields[1].clone())?;
  let source_tag=if raw==[0xc0]{-1}else{
   // Nested payload was already schema-walked. Native sub-icon selection
   // ignores nested appearance, so retain only the original union tag.
   let mut c=Cursor::new(raw);if c.array().ok()?!=2{return None}
   c.int(0,11).ok()? as i32
  };
  let mut values=[0;3];
  for (v,span) in values.iter_mut().zip(&row.unique_fields[2..]){
   let mut c=Cursor::new(decoded.get(span.clone())?);
   *v=c.int(i32::MIN as i128,i32::MAX as i128).ok()? as i32;
   if c.pos!=c.bytes.len(){return None}
  }
  Some(InventoryUniqueData::WandAppearance{source_item_id,magic:values[0],fleck:values[1],style:values[2],source_tag,source_count:0,source_words:[0;12]})
 }
 pub fn inventory_unique_rows(&self)->impl Iterator<Item=(u32,Option<i32>,Option<bool>,Option<InventoryUniqueData>,usize)>+'_{
  self.slot.index.inventory.iter().filter(|r|r.item_id.is_some()&&r.quantity.is_some()).map(|r|(r.id,r.unique_id,r.unique_is_nil,self.displayed_unique(r),r.unique_fields.len()))
   .chain(self.pending_inventory_rows().into_iter().map(|r|if self.pending_palettes.contains_key(&r.document_id){(r.document_id,None,Some(false),self.inventory_unique_data(r.document_id),3)}else if self.pending_bobas.contains_key(&r.document_id){(r.document_id,None,Some(false),self.inventory_unique_data(r.document_id),5)}else if self.pending_cafes.contains_key(&r.document_id){(r.document_id,None,Some(false),self.inventory_unique_data(r.document_id),2)}else if self.pending_wands.contains_key(&r.document_id){(r.document_id,None,Some(false),self.inventory_unique_data(r.document_id),5)}else{match self.pending_flowers.get(&r.document_id){
    Some(f)=>(r.document_id,None,Some(false),Some(flower_unique(self.flower_variant_changes.get(&r.document_id).copied().unwrap_or(f.variant))),4),
    None=>match self.pending_furniture.get(&r.document_id){Some(f)=>(r.document_id,None,Some(false),Some(InventoryUniqueData::Furniture{materials:self.furniture_variant_changes.get(&r.document_id).copied().unwrap_or(f.variant)}),3),None=>(r.document_id,Some(0),Some(true),None,0)}
   }}))
 }
 fn unique_row_source(&self,row:&crate::native::InventoryRow,fields:usize)->Option<i32>{
  if self.slot.envelope.version!=Version::V301||row.id==0||row.id>i32::MAX as u32||row.quantity?<0||
   (row.quantity==Some(0)&&!self.is_emptyable_unique_family(row)&&!self.palette_zero_reference_safe(row))||
   row.unique_is_nil!=Some(false)||row.unique_fields.len()!=fields||self.slot.index.inventory_item_refs_incomplete{return None}
  let item=row.item_id?;let uid=row.unique_id?;
  if item<=0||uid<=0||self.slot.index.inventory_item_refs.contains(&(item,uid))||self.slot.index.inventory_legacy_uid_refs.contains(&uid){return None}
  Some(item)
 }
 fn legacy_flower_variant(decoded:&[u8],row:&crate::native::InventoryRow)->Option<FlowerVariant>{
  if !matches!(row.unique_data,Some(InventoryUniqueData::Opaque{tag:2}))||row.unique_fields.len()!=4{return None}
  let mut result=[0;4];
  for (i,span) in row.unique_fields.iter().enumerate(){
   let mut c=Cursor::new(decoded.get(span.clone())?);
   result[i]=if i==0{c.int(0,7).ok()? as i32}else{
    let mut guid=[0;4];for word in &mut guid{*word=c.int(0,u32::MAX as i128).ok()? as u32;}
    let table=if i==2{LEGACY_FLOWER_PATTERN_GUIDS}else{LEGACY_FLOWER_COLOR_GUIDS};
    table.iter().position(|&g|g==guid)? as i32
   };
   if c.pos!=c.bytes.len(){return None}
  }
  Some(result)
 }
 fn legacy_flower_source(&self,row:&crate::native::InventoryRow)->Option<FlowerPolicy>{
  let item=row.item_id?;
  if !FLOWER_SPECIES.iter().any(|&(id,_)|id==item)||
   !crate::inventory_source::is_uncapped_required_unique_stack(item)||
   !self.inventory_creation_payload_safe(item)||self.slot.index.inventory_payload_item_refs.contains(&item)||
   self.slot.index.inventory_item_refs.iter().any(|&(id,_)|id==item){return None}
  let v=Self::legacy_flower_variant(&self.slot.envelope.decoded,row)?;
  let mut policy=flower_item_patterns(item,v[0])?;
  if RESTRICTED_FLOWER_EFFECTS.contains(&v[2]){policy.retained_effect=Some(v[2]);}
  for (slot,color) in [v[1],v[3]].into_iter().enumerate(){
   if RESTRICTED_FLOWER_COLORS.contains(&color){policy.retained_colors[slot]=Some(color);}
  }
  valid_flower_variant(policy,v).then_some(policy)
 }
 fn flower_source(&self,row:&crate::native::InventoryRow)->Option<FlowerPolicy>{
  let item=self.unique_row_source(row,4)?;
  if matches!(row.unique_data,Some(InventoryUniqueData::Opaque{tag:2})){
   return self.unique_quantity_ids.contains(&row.id).then(||self.legacy_flower_source(row)).flatten()
  }
  let original=flower_variant(row.unique_data?)?;
  // Copied outfit/placement payload references also block clothing.
  if !FLOWER_SPECIES.iter().any(|&(id,_)|id==item)&&
   (self.slot.index.inventory_payload_refs_incomplete||self.slot.index.inventory_payload_item_refs.contains(&item)){return None}
  if owned_dlc_flower_output(item)&&!self.is_emptyable_unique_family(row){return None}
  let mut patterns=flower_item_patterns(item,original[0])?;
  // Both DLC effect definitions occur in all 25 verified species CrosstypePatterns.
  // A saved original effect is a row-local witness, not proof of a DLC right.
  if FLOWER_SPECIES.iter().any(|&(id,_)|id==item)&&RESTRICTED_FLOWER_EFFECTS.contains(&original[2]){
   patterns.retained_effect=Some(original[2]);
  }
  // Exact original color in the same channel is a local witness only.
  for (slot,color) in [original[1],original[3]].into_iter().enumerate(){
   if RESTRICTED_FLOWER_COLORS.contains(&color){patterns.retained_colors[slot]=Some(color);}
  }
  if !valid_flower_variant(patterns,original){return None}
  Some(patterns)
 }
 fn furniture_source(&self,row:&crate::native::InventoryRow)->Option<&'static FurnitureItemSource>{
  let source=furniture_source::item(self.unique_row_source(row,3)?)?;
  // Existing inventory furniture only. Home layout/exterior edits and
  // pattern unlock grants remain outside this operation.
  if source.is_home_layout{return None}
  let original=if matches!(row.unique_data,Some(InventoryUniqueData::Opaque{tag:1})){
   if !self.unique_quantity_ids.contains(&row.id){return None}
   Self::legacy_furniture_materials(&self.slot.envelope.decoded,row)?
  }else{furniture_variant(row.unique_data?)?};
  // A source-valid restricted material already present in this exact row
  // is a local witness, not a transferable material unlock.
  if original==[0;3]{return None}
  furniture_key(source,original)?;
  Some(source)
 }
 pub fn inventory_furniture_edit_hints(&self)->impl Iterator<Item=u32>+'_ {
  self.slot.index.inventory.iter().filter_map(|r|self.furniture_source(r).map(|_|r.id)).chain(self.pending_furniture.keys().copied().filter(|id|self.inventory_changes.contains_key(id)))
 }
 fn original_furniture_variant(&self,id:u32)->Option<FurnitureVariant>{
  self.pending_furniture.get(&id).map(|f|f.variant)
   .or_else(||self.slot.index.inventory.iter().find(|r|r.id==id).and_then(|r|
    r.unique_data.and_then(furniture_variant).or_else(||Self::legacy_furniture_materials(&self.slot.envelope.decoded,r))))
 }
 fn furniture_context(&self,id:u32)->Option<(&'static FurnitureItemSource,FurnitureVariant,FurnitureVariant,HashSet<FurnitureVariant>)>{
  let (item,uid,source)=if let Some(f)=self.pending_furniture.get(&id){
   (f.item_id,None,furniture_source::item(f.item_id)?)
  }else{
   let row=self.slot.index.inventory.iter().find(|r|r.id==id)?;
   (row.item_id?,row.unique_id,self.furniture_source(row)?)
  };
  let original=self.original_furniture_variant(id)?;
  let current=self.inventory_unique_data(id).and_then(furniture_variant)?;
  let mut reserved=HashSet::new();
  for other in &self.slot.index.inventory{
   if other.id==id{continue}
   if uid.is_some()&&other.unique_id==uid{return None}
   if other.item_id!=Some(item){continue}
   if other.unique_is_nil==Some(true){reserved.insert(furniture_key(source,[0;3])?);}
   else{
    let before=other.unique_data.and_then(furniture_variant)
     .or_else(||Self::legacy_furniture_materials(&self.slot.envelope.decoded,other))?;
    let after=self.furniture_variant_changes.get(&other.id).copied().unwrap_or(before);
    for v in [before,after]{reserved.insert(furniture_key(source,v)?);}
   }
  }
  for (&other,f) in &self.pending_furniture{
   if other==id||f.item_id!=item||!self.inventory_changes.contains_key(&other){continue}
   reserved.insert(furniture_key(source,f.variant)?);
   reserved.insert(furniture_key(source,self.furniture_variant_changes.get(&other).copied().unwrap_or(f.variant))?);
  }
  if self.inventory_changes.contains_key(&(PENDING_ITEM|item as u32)){reserved.insert(furniture_key(source,[0;3])?);}
  if reserved.contains(&furniture_key(source,current)?)||reserved.contains(&furniture_key(source,original)?){return None}
  Some((source,original,current,reserved))
 }
 fn valid_furniture_target(source:&FurnitureItemSource,original:FurnitureVariant,target:FurnitureVariant)->bool{
  target!=[0;3]&&furniture_key(source,target).is_some()&&
   target.iter().enumerate().all(|(i,&n)|n==0||(
    (furniture_source::material_unlock_item(n).is_none()||original[i]==n)&&
    source.slots.iter().find(|s|s.slot as usize==i).is_some_and(|s|s.allowed.contains(&n)||original[i]==n)))
 }
 fn furniture_edit_target(&self,id:u32,source:&FurnitureItemSource,original:FurnitureVariant,target:FurnitureVariant,reserved:&HashSet<FurnitureVariant>)->bool{
  let legacy=self.slot.index.inventory.iter().any(|r|r.id==id&&matches!(r.unique_data,Some(InventoryUniqueData::Opaque{tag:1})));
  Self::valid_furniture_target(source,original,target)&&furniture_key(source,target).is_some_and(|key|
   !reserved.contains(&key)&&((!legacy&&!self.pending_furniture.contains_key(&id))||Some(key)!=furniture_key(source,[0;3])))
 }
 fn furniture_draft_choices(source:&FurnitureItemSource,draft:FurnitureVariant,mut allowed:impl FnMut(FurnitureVariant)->bool)->Vec<FurnitureVariant>{
  let draft_key=furniture_key(source,draft);
  let mut out=Vec::new();
  for slot in source.slots{
   let i=slot.slot as usize;
   for n in std::iter::once(0).chain(slot.allowed.iter().copied()){
    let mut v=draft;v[i]=n;
    if v!=draft&&furniture_key(source,v)!=draft_key&&allowed(v)&&!out.contains(&v){out.push(v)}
   }
  }
  out
 }
 pub fn inventory_furniture_variants(&self,id:u32)->Vec<FurnitureVariant>{
  let Some((source,original,current,reserved))=self.furniture_context(id)else{return Vec::new()};
  Self::furniture_draft_choices(source,current,|v|self.furniture_edit_target(id,source,original,v,&reserved))
 }
 // Only the intersection of verified ordinary acquisition definitions and
 // original non-layout customizable furniture. No inferred ownership.
 // An empty verified saved family does not need to supply a positive
 // ownership witness when the definition independently allows acquisition.
 fn saved_item_family_empty(&self,item:i32)->bool{
  !self.inventory_item_rows.contains_key(&item)||self.slot.index.inventory.iter().filter(|r|r.item_id==Some(item)).all(|r|
   self.inventory_can_empty(r)&&self.inventory_changes.get(&r.id).copied().or(r.quantity)==Some(0))
 }
 fn absent_furniture_choices(&self,item_id:i32)->Vec<FurnitureVariant>{
  if !self.can_create_inventory_item(item_id)||!self.saved_item_family_empty(item_id){return Vec::new()}
  self.default_furniture_choices(item_id)
 }
 // A single source-verified ordinary saved stack is sufficient evidence
 // for its default variant. Do not convert it or consume its quantity.
 fn saved_default_furniture_source(&self,row:&crate::native::InventoryRow)->Option<i32>{
  let item=row.item_id?;
  if row.id==0||row.id>=PENDING_ITEM||row.unique_id!=Some(0)||row.unique_is_nil!=Some(true)||
   !self.inventory_changes.get(&row.id).copied().or(row.quantity).is_some_and(|q|
    q>0||(q==0&&crate::inventory_source::ordinary_bag_creation_item(item)&&self.saved_item_family_empty(item)))||
   !row.fields.iter().all(Option::is_some)||
   !(crate::inventory_source::ordinary_creation_item(item)||self.extra_custom_furniture_zero_reference_safe(item))||
   !self.inventory_creation_payload_safe(item)||
   self.slot.index.inventory_item_refs.iter().any(|&(id,_)|id==item){return None}
  let source=furniture_source::item(item)?;
  if source.is_home_layout||crate::inventory_source::ordinary_quantity_limit(item)!=Some(i32::MAX){return None}
  if self.inventory_item_rows.get(&item)!=Some(&1)&&self.slot.index.inventory.iter().filter(|r|r.item_id==Some(item)&&r.id!=row.id).any(|r|!self.permits_separate_ordinary_base(r)){return None}
  Some(item)
 }
 fn default_furniture_choices(&self,item_id:i32)->Vec<FurnitureVariant>{
  if crate::inventory_source::ordinary_quantity_limit(item_id)!=Some(i32::MAX){return Vec::new()}
  let Some(source)=furniture_source::item(item_id)else{return Vec::new()};
  if source.is_home_layout{return Vec::new()}
  let Some(default)=furniture_key(source,[0;3])else{return Vec::new()};
  let Some(reserved)=self.default_furniture_reserved(source)else{return Vec::new()};
  let mut out=Vec::new();
  for slot in source.slots{
   for &n in slot.allowed{
    let mut v=[0;3];v[slot.slot as usize]=n;
    if !Self::valid_furniture_target(source,[0;3],v){continue}
    let Some(key)=furniture_key(source,v)else{continue};
    if key!=default&&!reserved.contains(&key)&&!out.contains(&v){out.push(v)}
   }
  }
  out
 }
 // Both original and effective identities remain reserved across history.
 fn default_furniture_reserved(&self,source:&FurnitureItemSource)->Option<HashSet<FurnitureVariant>>{
  let mut reserved=HashSet::new();
  if self.inventory_item_rows.contains_key(&source.item_id){
  for row in self.slot.index.inventory.iter().filter(|r|r.item_id==Some(source.item_id)){
   if row.unique_is_nil==Some(true){reserved.insert(furniture_key(source,[0;3])?);continue}
   if !self.permits_separate_ordinary_base(row){return None}
   let original=self.original_furniture_variant(row.id)?;
   let effective=self.furniture_variant_changes.get(&row.id).copied().unwrap_or(original);
   for value in [original,effective]{reserved.insert(furniture_key(source,value)?);}
  }
  }
  for (&id,f) in &self.pending_furniture{
   if f.item_id!=source.item_id||!self.inventory_changes.contains_key(&id){continue}
   for v in [f.variant,self.furniture_variant_changes.get(&id).copied().unwrap_or(f.variant)]{
    reserved.insert(furniture_key(source,v)?);
   }
  }
  Some(reserved)
 }
 pub fn inventory_absent_furniture_ids(&self)->Vec<i32>{
  if !self.absent_flower_budget_available(){return Vec::new()}
  furniture_source::ITEMS.iter().filter_map(|s|(
   !self.inventory_changes.contains_key(&(PENDING_ITEM|s.item_id as u32))&&
   !self.absent_furniture_choices(s.item_id).is_empty()).then_some(s.item_id)).collect()
 }
 pub fn inventory_default_furniture_ids(&self)->Vec<u32>{
  if !self.absent_flower_budget_available(){return Vec::new()}
  self.slot.index.inventory.iter().filter_map(|r|{
   let item=self.saved_default_furniture_source(r)?;
   (!self.default_furniture_choices(item).is_empty()).then_some(r.id)
  }).chain(self.inventory_changes.iter().filter_map(|(&id,&qty)|{
   if id&PENDING_ITEM==0||qty<=0||self.pending_flowers.contains_key(&id)||self.pending_furniture.contains_key(&id)||self.pending_palettes.contains_key(&id)||self.pending_bobas.contains_key(&id)||self.pending_cafes.contains_key(&id)||self.pending_wands.contains_key(&id){return None}
   let item=(id&!PENDING_ITEM) as i32;
   (self.can_create_inventory_item(item)&&!self.default_furniture_choices(item).is_empty()).then_some(id)
  })).collect()
 }
 fn furniture_creation_context(&self,id:u32)->Option<(&'static FurnitureItemSource,FurnitureVariant,FurnitureVariant,HashSet<FurnitureVariant>,bool)>{
  if !self.absent_flower_budget_available(){return None}
  if let Some(row)=self.slot.index.inventory.iter().find(|r|r.id==id&&matches!(r.unique_data,Some(InventoryUniqueData::Opaque{tag:1}))){
   if !row.item_id.is_some_and(|item|self.legacy_furniture_zero_reference_safe(item)&&self.inventory_creation_payload_safe(item)){return None}
  }
  let default_item=if self.pending_furniture.contains_key(&id){
   if !self.inventory_changes.contains_key(&id){return None}
   None
  }else if id&PENDING_ITEM!=0{
   let item=(id&!PENDING_ITEM) as i32;
   if !(self.inventory_changes.get(&id).is_some_and(|&q|q>0)&&self.can_create_inventory_item(item))&&self.absent_furniture_choices(item).is_empty(){return None}
   Some(item)
  }else{
   let row=self.slot.index.inventory.iter().find(|r|r.id==id)?;
   let item=self.saved_default_furniture_source(row);
   if item.is_none()&&!self.inventory_changes.get(&id).copied().or(row.quantity).is_some_and(|q|q>0){return None}
   item
  };
  if let Some(item)=default_item{
   let source=furniture_source::item(item)?;
   if source.is_home_layout||crate::inventory_source::ordinary_quantity_limit(item)!=Some(i32::MAX){return None}
   return Some((source,[0;3],[0;3],self.default_furniture_reserved(source)?,true))
  }
  if !self.pending_furniture.contains_key(&id)&&!self.unique_quantity_ids.contains(&id){return None}
  let (source,original,current,reserved)=self.furniture_context(id)?;
  if self.slot.index.inventory_payload_item_refs.contains(&source.item_id){return None}
  Some((source,original,current,reserved,false))
 }
 fn furniture_creation_target(source:&FurnitureItemSource,original:FurnitureVariant,current:FurnitureVariant,target:FurnitureVariant,reserved:&HashSet<FurnitureVariant>)->bool{
  Self::valid_furniture_target(source,[0;3],target)&&furniture_key(source,target).is_some_and(|key|
   Some(key)!=furniture_key(source,[0;3])&&Some(key)!=furniture_key(source,original)&&Some(key)!=furniture_key(source,current)&&!reserved.contains(&key))
 }
 fn furniture_creation_item(&self,id:u32,expected:FurnitureVariant,next:FurnitureVariant)->Option<i32>{
  let (source,original,current,reserved,_)=self.furniture_creation_context(id)?;
  (expected==current&&Self::furniture_creation_target(source,original,current,next,&reserved)).then_some(source.item_id)
 }
 pub fn inventory_furniture_creation_variants(&self,id:u32)->Vec<FurnitureVariant>{
  let Some((source,original,current,reserved,_))=self.furniture_creation_context(id)else{return Vec::new()};
  Self::furniture_draft_choices(source,current,|v|Self::furniture_creation_target(source,original,current,v,&reserved))
 }
 /// Read-only complete material tuple preview; commit shares the same predicates.
 pub fn inventory_furniture_preview(&self,id:u32,expected:FurnitureVariant,draft:FurnitureVariant)->Result<(Vec<FurnitureVariant>,bool),Error>{
  if let Some((source,original,current,reserved))=self.furniture_context(id){
   if current!=expected||(draft!=current&&!self.furniture_edit_target(id,source,original,draft,&reserved)){return Err(Error::Schema)}
   return Ok((Self::furniture_draft_choices(source,draft,|v|self.furniture_edit_target(id,source,original,v,&reserved)),self.furniture_creation_item(id,expected,draft).is_some()))
  }
  let (source,original,current,reserved,default_only)=self.furniture_creation_context(id).ok_or(Error::Schema)?;
  if !default_only||expected!=current||(draft!=current&&!Self::furniture_creation_target(source,original,current,draft,&reserved)){return Err(Error::Schema)}
  Ok((Self::furniture_draft_choices(source,draft,|v|Self::furniture_creation_target(source,original,current,v,&reserved)),draft!=current))
 }
 pub fn create_inventory_furniture_variant(&mut self,source_id:u32,expected:FurnitureVariant,next:FurnitureVariant,quantity:i32)->Result<u32,Error>{
  if quantity<=0{return Err(Error::Schema)}
  let item_id=self.furniture_creation_item(source_id,expected,next).ok_or(Error::Schema)?;
  let document_id=self.allocate_staged_unique_handle()?;
  let revision=self.next_edit_revision()?;
  let change=Change::FurnitureCreated{document_id,source_id,expected,furniture:PendingFurniture{item_id,variant:next},quantity};
  self.restore_change(&change,false);self.undo.push(change);self.redo.retain(|c|c.scope()!=HistoryScope::Inventory);self.revision=revision;
  Ok(document_id)
 }
 pub fn change_inventory_furniture_variant(&mut self,id:u32,expected:FurnitureVariant,next:FurnitureVariant)->Result<(),Error>{
  let (source,original,current,reserved)=self.furniture_context(id).ok_or(Error::Schema)?;
  if current!=expected||current==next||!self.furniture_edit_target(id,source,original,next,&reserved){return Err(Error::Schema)}
  let revision=self.next_edit_revision()?;
  let before=self.furniture_variant_changes.get(&id).copied();
  let after=if original==next{None}else{Some(next)};
  match after{Some(v)=>{self.furniture_variant_changes.insert(id,v);},None=>{self.furniture_variant_changes.remove(&id);}}
  self.undo.push(Change::FurnitureVariant{document_id:id,before,after});
  if self.undo.len()>MAX_UNDO{self.undo.remove(0);}
  self.redo.retain(|c|c.scope()!=HistoryScope::Inventory);self.revision=revision;Ok(())
 }
 /// Cheap presentation hint. Actual source/collision check happens on demand,
 /// never an O(inventory squared) scan in the complete inventory snapshot.
 pub fn inventory_flower_edit_hints(&self)->impl Iterator<Item=u32>+'_ {
  self.slot.index.inventory.iter().filter_map(|r|self.flower_source(r).map(|_|r.id)).chain(self.pending_flowers.keys().copied().filter(|id|self.inventory_changes.contains_key(id)))
 }
 fn original_flower_variant(&self,id:u32)->Option<FlowerVariant>{
  self.pending_flowers.get(&id).map(|f|f.variant)
   .or_else(||self.slot.index.inventory.iter().find(|r|r.id==id).and_then(|r|r.unique_data.and_then(flower_variant).or_else(||Self::legacy_flower_variant(&self.slot.envelope.decoded,r))))
 }
 fn flower_context(&self,id:u32)->Option<(FlowerPolicy,FlowerVariant,HashSet<FlowerVariant>)>{
  let (item,uid,patterns)=if let Some(f)=self.pending_flowers.get(&id){
   (f.item_id,None,flower_item_patterns(f.item_id,f.variant[0])?)
  }else{
   let row=self.slot.index.inventory.iter().find(|r|r.id==id)?;
   (row.item_id?,row.unique_id,self.flower_source(row)?)
  };
  let original=self.original_flower_variant(id)?;
  let current=self.inventory_unique_data(id).and_then(flower_variant)?;
  let mut reserved=HashSet::new();
  for other in &self.slot.index.inventory{
   if other.id==id{continue}
   if uid.is_some()&&other.unique_id==uid{return None}
   if other.item_id!=Some(item){continue}
   // Both original wire formats share the native FlowerUniqueData properties.
   // Reserve every resolved peer, even when the peer is not editable.
   let before=other.unique_data.and_then(flower_variant)
    .or_else(||Self::legacy_flower_variant(&self.slot.envelope.decoded,other))?;
   let after=self.flower_variant_changes.get(&other.id).copied().unwrap_or(before);
   for v in [before,after]{if !(0..=7).contains(&v[0])||!(1..=30).contains(&v[1])||!(0..=16).contains(&v[2])||!(0..=30).contains(&v[3]){return None}}
   reserved.insert(before);reserved.insert(after);
  }
  for (&other,f) in &self.pending_flowers{
   if other==id||f.item_id!=item||!self.inventory_changes.contains_key(&other){continue}
   reserved.insert(f.variant);
   reserved.insert(self.flower_variant_changes.get(&other).copied().unwrap_or(f.variant));
  }
  if reserved.contains(&current)||reserved.contains(&original){return None}
  Some((patterns,current,reserved))
 }
 // Growth changes are inventory-only, for the same unrestricted species
 // already supported by the first-stack native state selection. A copied
 // payload could refer to the original growth state, so do not edit it.
 fn flower_growth_change_allowed(&self,id:u32)->bool{
  let item=self.pending_flowers.get(&id).map(|f|f.item_id)
   .or_else(||self.slot.index.inventory.iter().find(|r|r.id==id).and_then(|r|r.item_id));
  item.is_some_and(|item|Self::absent_flower_growth_supported(item,0)&&
   self.inventory_creation_payload_safe(item)&&
   !self.slot.index.inventory_item_refs.iter().any(|&(i,_)|i==item))
 }
 fn flower_growth_options(current:FlowerVariant,reserved:&HashSet<FlowerVariant>,out:&mut Vec<FlowerVariant>){
  for grow in [0,6,7]{let mut next=current;next[0]=grow;
   if next!=current&&!reserved.contains(&next){out.push(next)}
  }
 }
 /// On-demand choices preserve native identity. Pattern changes
 /// include the corresponding secondary-color change in the same candidate.
 pub fn inventory_flower_variants(&self,id:u32)->Vec<FlowerVariant>{
  let Some((patterns,current,reserved))=self.flower_context(id)else{return Vec::new()};
  let mut choices=Self::flower_choices(patterns,current,&reserved);
  if self.flower_growth_change_allowed(id){Self::flower_growth_options(current,&reserved,&mut choices);}
  choices
 }
 fn flower_choices(patterns:FlowerPolicy,current:FlowerVariant,reserved:&HashSet<FlowerVariant>)->Vec<FlowerVariant>{
  let mut out=Vec::new();
  let mut add=|v:FlowerVariant|{if v!=current&&valid_flower_variant(patterns,v)&&!reserved.contains(&v)&&!out.contains(&v){out.push(v)}};
  for color in FLOWER_COLORS.iter().copied().chain(patterns.retained_colors[0]){
   let mut v=current;v[1]=color;
   if v[2]!=0&&!FLOWER_EFFECTS.contains(&v[2])&&v[1]==v[3]{v[3]=default_flower_accent(color)}
   add(v);
  }
  for pattern in std::iter::once(0).chain(patterns.patterns.iter().copied()).chain(patterns.retained_effect){
   if pattern==current[2]{continue}
   let mut v=current;v[2]=pattern;
   v[3]=if pattern==0||FLOWER_EFFECTS.contains(&pattern){0}else{default_flower_accent(v[1])};
   add(v);
  }
  if current[2]!=0&&!FLOWER_EFFECTS.contains(&current[2]){
   for color in FLOWER_COLORS.iter().copied().chain(patterns.retained_colors[1]){let mut v=current;v[3]=color;add(v);}
  }
  out
 }
 /// On-demand creation choices. Rust alone checks the source species,
 /// allocation budget, identity/reference guards, and original tuple.
 pub fn inventory_flower_creation_variants(&self,id:u32)->Vec<FlowerVariant>{
  if let Some(f)=self.pending_flowers.get(&id){
   if !self.inventory_changes.contains_key(&id)||!self.absent_flower_budget_available()||!self.inventory_creation_payload_safe(f.item_id){return Vec::new()}
   return self.inventory_flower_variants(id).into_iter().filter(|&v|v!=f.variant&&!restricted_flower_appearance(v)).collect()
  }
  if id&PENDING_ITEM!=0{return self.absent_flower_options((id&!PENDING_ITEM) as i32)}
  if !self.inventory_creation_source_valid()||!self.unique_quantity_ids.contains(&id)||self.undo.len()+self.redo.len()>=MAX_UNDO||
   crate::document_membership::allocate_inventory_unique_ids(&self.slot.index,self.slot.envelope.version,self.pending_unique_count()+1).is_err()||
   crate::document_membership::allocate_ids(&self.slot.index,self.pending_inventory_rows().len()+self.reserved_achievement_count()+1).is_err(){return Vec::new()}
  let Some(row)=self.slot.index.inventory.iter().find(|r|r.id==id)else{return Vec::new()};
  let Some(item)=row.item_id else{return Vec::new()};
  if (crate::inventory_source::flower_clothing_reference_keys(item).is_some()||owned_dlc_flower_output(item))&&
   !self.inventory_changes.get(&id).copied().or(row.quantity).is_some_and(|q|q>0){return Vec::new()}
  if !self.inventory_creation_payload_safe(item){return Vec::new()}
  let Some(original)=self.original_flower_variant(id)else{return Vec::new()};
  self.inventory_flower_variants(id).into_iter().filter(|&v|v!=original&&!restricted_flower_appearance(v)).collect()
 }
 /// Stage an explicitly chosen, different native flower tuple from an
 /// existing validated species row. No persisted UID is assigned until
 /// export. Multiple variants of one species use independent handles.
 pub fn create_inventory_flower_variant(&mut self,source_id:u32,expected:FlowerVariant,next:FlowerVariant,quantity:i32)->Result<u32,Error>{
  if quantity<=0{return Err(Error::Schema)}
  let item_id=self.flower_creation_item(source_id,expected,next).ok_or(Error::Schema)?;
  self.stage_new_flower(source_id,item_id,expected,next,quantity)
 }
 fn flower_creation_item(&self,id:u32,expected:FlowerVariant,next:FlowerVariant)->Option<i32>{
  if restricted_flower_appearance(next)||!self.absent_flower_budget_available(){return None}
  if let Some(f)=self.pending_flowers.get(&id){
   if !self.inventory_changes.contains_key(&id)||!self.inventory_creation_payload_safe(f.item_id){return None}
   let (patterns,current,reserved)=self.flower_context(id)?;
   return (expected==current&&next!=current&&next!=f.variant&&(next[0]==current[0]||self.flower_growth_change_allowed(id))&&
    valid_flower_variant(patterns,next)&&!reserved.contains(&next)).then_some(f.item_id)
  }
  if id&PENDING_ITEM!=0{
   let item=(id&!PENDING_ITEM) as i32;
   // Preserve legacy default-only requests; customized first stacks
   // require an exact, currently offered original default witness.
   if expected==[0;4]{return self.absent_flower_options(item).contains(&next).then_some(item)}
   let (patterns,reserved)=self.absent_flower_preview_context(item,expected)?;
   return ((next[0]==6||Self::absent_flower_growth_supported(item,next[0]))&&valid_flower_variant(patterns,next)&&!reserved.contains(&next)).then_some(item)
  }
  if !self.unique_quantity_ids.contains(&id){return None}
  let row=self.slot.index.inventory.iter().find(|r|r.id==id)?;
  let item=row.item_id?;
  if (crate::inventory_source::flower_clothing_reference_keys(item).is_some()||owned_dlc_flower_output(item))&&
   !self.inventory_changes.get(&id).copied().or(row.quantity).is_some_and(|q|q>0){return None}
  if !self.inventory_creation_payload_safe(item){return None}
  let (patterns,current,reserved)=self.flower_context(id)?;
  let original=self.original_flower_variant(id)?;
  (expected==current&&next!=current&&next!=original&&(next[0]==current[0]||self.flower_growth_change_allowed(id))&&valid_flower_variant(patterns,next)&&!reserved.contains(&next)).then_some(item)
 }
 /// Read-only dialog planning from an uncommitted full tuple.
 pub fn inventory_flower_preview(&self,id:u32,expected:FlowerVariant,draft:FlowerVariant)->Result<(Vec<FlowerVariant>,bool),Error>{
  let (patterns,current,reserved)=if id&PENDING_ITEM!=0&&!self.pending_flowers.contains_key(&id){
   let (patterns,reserved)=self.absent_flower_preview_context((id&!PENDING_ITEM) as i32,expected).ok_or(Error::Schema)?;
   (patterns,expected,reserved)
  }else{self.flower_context(id).ok_or(Error::Schema)?};
  let absent=id&PENDING_ITEM!=0&&!self.pending_flowers.contains_key(&id);
  let item=(id&!PENDING_ITEM) as i32;
  let growth=if absent{Self::absent_flower_growth_supported(item,0)}else{self.flower_growth_change_allowed(id)};
  if expected!=current||(draft[0]!=current[0]&&!growth)||
   !valid_flower_variant(patterns,draft)||reserved.contains(&draft){return Err(Error::Schema)}
  let mut choices=Self::flower_choices(patterns,draft,&reserved);
  if growth{Self::flower_growth_options(draft,&reserved,&mut choices);}
  let creatable=self.flower_creation_item(id,expected,draft).is_some();
  Ok((choices,creatable))
 }
 // Equivalent to staging a source default then editing the new row,
 // without creating an intermediate identity.
 fn absent_flower_preview_context(&self,item:i32,witness:FlowerVariant)->Option<(FlowerPolicy,HashSet<FlowerVariant>)>{
  if !self.absent_flower_options(item).contains(&witness){return None}
  let patterns=flower_item_patterns(item,6)?;
  let mut reserved=HashSet::new();
  for (&id,f) in &self.pending_flowers{
   if f.item_id!=item||!self.inventory_changes.contains_key(&id){continue}
   reserved.insert(f.variant);
   reserved.insert(self.flower_variant_changes.get(&id).copied().unwrap_or(f.variant));
  }
  Some((patterns,reserved))
 }
 fn absent_flower_budget_available(&self)->bool{
  self.inventory_creation_source_valid()&&self.undo.len()+self.redo.len()<MAX_UNDO&&
   crate::document_membership::allocate_inventory_unique_ids(&self.slot.index,self.slot.envelope.version,self.pending_unique_count()+1).is_ok()&&
   crate::document_membership::allocate_ids(&self.slot.index,self.pending_inventory_rows().len()+self.reserved_achievement_count()+1).is_ok()
 }
 fn absent_flower_options(&self,item_id:i32)->Vec<FlowerVariant>{
  if !self.absent_flower_budget_available(){return Vec::new()}
  self.absent_flower_choices(item_id)
 }
 // The 23 unrestricted source species have native Seed and GrownTroweled
 // inventory art bindings as well as plucked definitions. Clothing is excluded.
 fn absent_flower_growth_supported(item:i32,grow:i32)->bool{
  matches!(grow,0|7)&&ABSENT_FLOWER_DEFAULTS.iter().any(|&(id,_)|id==item)
 }
 fn absent_flower_choices(&self,item_id:i32)->Vec<FlowerVariant>{
  if owned_dlc_flower_output(item_id)||self.inventory_item_rows.contains_key(&item_id)||
   !self.inventory_creation_payload_safe(item_id)||
   self.slot.index.inventory_item_refs.iter().any(|&(id,_)|id==item_id){return Vec::new()}
  if !crate::inventory_source::is_uncapped_required_unique_stack(item_id){return Vec::new()}
  // Missing crowns use only their exact source species' original default
  // colors. Generic processors can use any of the unrestricted source
  // species; only their actual default colors are offered here.
  if rare_candle_key(item_id).is_some(){
   let policy=flower_item_patterns(item_id,6).expect("verified rare candle");
   return ABSENT_FLOWER_DEFAULTS.iter().flat_map(|&(species,colors)|{
    let eligible=FLOWER_SPECIES.iter().any(|&(id,p)|id==species&&p.contains(&10));
    colors.iter().copied().filter(move |_|eligible).map(|color|[6,color,10,default_flower_accent(color)])
   }).collect::<std::collections::BTreeSet<_>>().into_iter().filter(|v|valid_flower_variant(policy,*v)&&
    !self.pending_flowers.iter().any(|(&id,f)|self.inventory_changes.contains_key(&id)&&f.item_id==item_id&&(f.variant==*v||self.flower_variant_changes.get(&id)==Some(v)))).collect()
  }
  let species=flower_candle_source(item_id).map(|r|r.1).or_else(||FLOWER_CROWN_SPECIES.iter().find(|&&(id,_)|id==item_id).map(|&(_,species)|species)).unwrap_or(item_id);
  let colors:Vec<i32>=if let Some((_,colors))=ABSENT_FLOWER_DEFAULTS.iter().find(|&&(id,_)|id==species){
   colors.to_vec()
  }else if FLOWER_CLOTHING_GENERIC.contains(&item_id)||item_id==FLOWER_CLOTHING_NO_PATTERN{
   let mut colors:Vec<i32>=ABSENT_FLOWER_DEFAULTS.iter().flat_map(|&(_,colors)|colors.iter().copied()).collect();
   colors.sort_unstable();colors.dedup();colors
  }else{return Vec::new()};
  let Some(patterns)=flower_item_patterns(item_id,6)else{return Vec::new()};
  colors.into_iter().map(|color|[6,color,0,0]).filter(|v|valid_flower_variant(patterns,*v)&&!self.pending_flowers.iter().any(|(&id,f)|self.inventory_changes.contains_key(&id)&&f.item_id==item_id&&(f.variant==*v||self.flower_variant_changes.get(&id)==Some(v)))).collect()
 }
 pub fn inventory_absent_flower_ids(&self)->Vec<i32>{
  if !self.absent_flower_budget_available(){return Vec::new()}
  ABSENT_FLOWER_DEFAULTS.iter().map(|&(id,_)|id)
   .chain(FLOWER_CROWN_SPECIES.iter().map(|&(id,_)|id))
   .chain(FLOWER_CANDLE_SPECIES.iter().map(|r|r.0))
   .chain(RARE_CANDLE_KEYS.iter().map(|r|r.0))
   .chain(FLOWER_CLOTHING_GENERIC.iter().copied())
   .chain(std::iter::once(FLOWER_CLOTHING_NO_PATTERN))
   .filter(|&id|!self.absent_flower_choices(id).is_empty()).collect()
 }
 // Retain inactive staged identities for history replay; only active rows are exported.
 fn pending_unique_count(&self)->usize{self.pending_flowers.len()+self.pending_furniture.len()+self.pending_palettes.len()+self.pending_bobas.len()+self.pending_cafes.len()+self.pending_wands.len()}
 fn active_pending_unique_count(&self)->usize{self.pending_flowers.keys().chain(self.pending_furniture.keys()).chain(self.pending_palettes.keys()).chain(self.pending_bobas.keys()).chain(self.pending_cafes.keys()).chain(self.pending_wands.keys()).filter(|id|self.inventory_changes.contains_key(*id)).count()}
 fn allocate_staged_unique_handle(&self)->Result<u32,Error>{
  if self.undo.len()+self.redo.len()>=MAX_UNDO{return Err(Error::Budget)}
  crate::document_membership::allocate_inventory_unique_ids(&self.slot.index,self.slot.envelope.version,self.pending_unique_count()+1)?;
  crate::document_membership::allocate_ids(&self.slot.index,self.pending_inventory_rows().len()+self.reserved_achievement_count()+1)?;
  (1..=MAX_UNDO as u32+4096).map(|n|PENDING_ITEM|n).find(|id|
   !self.inventory_changes.contains_key(id)&&!self.pending_flowers.contains_key(id)&&!self.pending_furniture.contains_key(id)&&!self.pending_palettes.contains_key(id)&&!self.pending_bobas.contains_key(id)&&!self.pending_cafes.contains_key(id)&&!self.pending_wands.contains_key(id)&&
   !crate::inventory_source::ordinary_bag_creation_item((id&!PENDING_ITEM) as i32)&&flower_item_patterns((id&!PENDING_ITEM) as i32,6).is_none()).ok_or(Error::Budget)
 }
 fn stage_new_flower(&mut self,source_id:u32,item_id:i32,expected:FlowerVariant,next:FlowerVariant,quantity:i32)->Result<u32,Error>{
  let document_id=self.allocate_staged_unique_handle()?;
  let revision=self.next_edit_revision()?;
  let change=Change::FlowerCreated{document_id,source_id,expected,flower:PendingFlower{item_id,variant:next},quantity};
  self.restore_change(&change,false);self.undo.push(change);
  self.redo.retain(|c|c.scope()!=HistoryScope::Inventory);self.revision=revision;Ok(document_id)
 }
 pub fn inventory_flower_color_options(&self,id:u32)->Vec<i32>{
  let Some((patterns,current,reserved))=self.flower_context(id)else{return Vec::new()};
  FLOWER_COLORS.iter().copied().filter(|color|{
   let mut v=current;v[1]=*color;valid_flower_variant(patterns,v)&&!reserved.contains(&v)
  }).collect()
 }
 /// One authoritative variant CAS, including compound pattern/secondary edits.
 /// Native field spans only; no creation, ownership, quantity or placement changes.
 pub fn change_inventory_flower_variant(&mut self,id:u32,expected:FlowerVariant,next:FlowerVariant)->Result<(),Error>{
  let (patterns,current,reserved)=self.flower_context(id).ok_or(Error::Schema)?;
  if current!=expected||current==next||(current[0]!=next[0]&&!self.flower_growth_change_allowed(id))||!valid_flower_variant(patterns,next)||reserved.contains(&next){return Err(Error::Schema)}
  let original=self.original_flower_variant(id).ok_or(Error::Schema)?;
  let revision=self.next_edit_revision()?;
  let before=self.flower_variant_changes.get(&id).copied();
  let after=if original==next{None}else{Some(next)};
  match after{Some(v)=>{self.flower_variant_changes.insert(id,v);},None=>{self.flower_variant_changes.remove(&id);}}
  self.undo.push(Change::FlowerVariant{document_id:id,before,after});
  if self.undo.len()>MAX_UNDO{self.undo.remove(0);}
  self.redo.retain(|c|c.scope()!=HistoryScope::Inventory);self.revision=revision;Ok(())
 }
 pub fn change_inventory_flower_color(&mut self,id:u32,expected:i32,next:i32)->Result<(),Error>{
  let current=self.inventory_unique_data(id).and_then(flower_variant).ok_or(Error::Schema)?;
  if current[1]!=expected{return Err(Error::Schema)}
  let mut target=current;target[1]=next;self.change_inventory_flower_variant(id,current,target)
 }
 /// Display-only v3.0.1 flower rows, keyed by native document identity.
 pub fn inventory_flowers(&self)->impl Iterator<Item=(u32,u8,i32,i32,i32)>+'_{
  self.slot.index.inventory.iter().filter_map(move |row|{
   if self.slot.envelope.version!=Version::V301||row.item_id.is_none()||row.quantity.is_none(){return None}
   match self.displayed_unique(row){
    Some(crate::native::InventoryUniqueData::Flower{grow_state,base_color,pattern,pattern_color})=>Some((row.id,grow_state,base_color,pattern,pattern_color)),
    _=>None
   }
  }).chain(self.pending_flowers.iter().filter(|(id,_)|self.inventory_changes.contains_key(*id)).map(|(&id,f)|{let v=self.flower_variant_changes.get(&id).copied().unwrap_or(f.variant);(id,v[0] as u8,v[1],v[2],v[3])}))
 }
 /// Effective palette colors, retaining exact original binary32 words unless explicitly changed.
 pub fn inventory_palettes(&self)->impl Iterator<Item=(u32,[[u32;4];3])>+'_{
  self.slot.index.inventory.iter().filter_map(move |row|{
   if self.slot.envelope.version!=Version::V301||row.item_id.is_none()||row.quantity.is_none(){return None}
   match self.effective_unique(row){
    Some(crate::native::InventoryUniqueData::Palette{rgba_bits})=>Some((row.id,rgba_bits)),
    _=>None
   }
  }).chain(self.pending_palettes.iter().filter(|(id,_)|self.inventory_changes.contains_key(*id)).map(|(&id,v)|(id,self.palette_variant_changes.get(&id).copied().unwrap_or(*v))))
 }
 // Only verified bag states (seed, plucked, uprooted) of source flower
 // species; exclude planted states, crafted outfits and copied payloads.
 fn is_emptyable_flower_species(r:&crate::native::InventoryRow)->bool{
  r.item_id.is_some_and(|item|FLOWER_SPECIES.iter().any(|&(id,_)|id==item))&&
   r.unique_data.and_then(flower_variant).is_some_and(|v|matches!(v[0],0|6|7))
 }
 // Source-bounded furniture removal checks every original placement/copy
 // reference by Item ID, regardless of material tuple or UID. This is
 // deliberately conservative: a reference to a sibling also denies zero.
 fn furniture_zero_reference_safe(&self,item:i32)->bool{
  crate::inventory_source::ordinary_furniture_guid_fingerprint(item).is_some_and(|key|
   !self.slot.index.inventory_furniture_refs_incomplete&&
   !self.slot.index.inventory_item_refs_incomplete&&
   !self.slot.index.inventory_payload_refs_incomplete&&
   !self.slot.index.inventory_furniture_item_refs.contains(&item)&&
   !self.slot.index.inventory_payload_item_refs.contains(&item)&&
   !self.slot.index.inventory_furniture_guid_refs.contains(&key))
 }
 // Family eligibility only; full UID, source tuple and peer validation
 // is still required in index_unique_quantity_ids before zero/refill.
 fn legacy_furniture_quantity_source(&self,r:&crate::native::InventoryRow)->Option<i32>{
  if !matches!(r.unique_data,Some(InventoryUniqueData::Opaque{tag:1}))||r.unique_fields.len()!=3{return None}
  let item=r.item_id?;let source=furniture_source::item(item)?;
  if source.is_home_layout||crate::inventory_source::ordinary_quantity_limit(item)!=Some(i32::MAX){return None}
  let materials=Self::legacy_furniture_materials(&self.slot.envelope.decoded,r)?;
  if materials==[0;3]||furniture_key(source,materials)?==furniture_key(source,[0;3])?{return None}
  Some(item)
 }
 fn legacy_furniture_materials(decoded:&[u8],r:&crate::native::InventoryRow)->Option<FurnitureVariant>{
  if !matches!(r.unique_data,Some(InventoryUniqueData::Opaque{tag:1}))||r.unique_fields.len()!=3{return None}
  let mut materials=[0;3];
  for (slot,span) in materials.iter_mut().zip(&r.unique_fields){
   let raw=decoded.get(span.clone())?;
   let mut c=Cursor::new(raw);let mut words=[0;4];
   for word in &mut words{*word=c.int(0,u32::MAX as i128).ok()? as u32;}
   if c.pos!=raw.len(){return None}
   *slot=furniture_source::material_index_for_guid(words)?;
  }
  Some(materials)
 }
 fn legacy_furniture_zero_reference_safe(&self,item:i32)->bool{
  self.ordinary_tradeable_nonclothing_zero_reference_safe(item)||self.extra_custom_furniture_zero_reference_safe(item)
 }
 fn is_emptyable_unique_family(&self,r:&crate::native::InventoryRow)->bool{
  use crate::inventory_source::{CAFE_IDS,BOBA_ID};
  Self::is_emptyable_flower_species(r)||match (r.item_id,r.unique_data){
   (Some(item),Some(InventoryUniqueData::CafeAppearance{..}))=>CAFE_IDS.binary_search(&item).is_ok(),
   (Some(item),Some(InventoryUniqueData::BobaAppearance{..}))=>item==BOBA_ID,
   (Some(_),Some(InventoryUniqueData::WandAppearance{..}))=>self.wand_zero_reference_safe(r),
   (Some(_),Some(InventoryUniqueData::Opaque{tag:2}))=>self.legacy_flower_source(r).is_some(),
   (Some(_),Some(InventoryUniqueData::Opaque{tag:5}))=>self.legacy_wand_zero_reference_safe(r),
   (Some(item),Some(InventoryUniqueData::Opaque{tag:1}))=>self.legacy_furniture_zero_reference_safe(item),
   (Some(item),Some(InventoryUniqueData::Furniture{..}))=>self.furniture_zero_reference_safe(item)||
    (furniture_source::item(item).is_some_and(|s|!s.is_home_layout)&&self.ordinary_tradeable_nonclothing_zero_reference_safe(item))||
    self.extra_custom_furniture_zero_reference_safe(item),
   (Some(item),Some(InventoryUniqueData::Flower{grow_state:6,..}))=>crate::inventory_source::flower_clothing_reference_keys(item).is_some_and(|keys|self.clothing_zero_reference_safe(item,keys.iter()))||flower_candle_source(item).map(|r|r.2).or_else(||rare_candle_key(item)).is_some_and(|key|self.flower_candle_zero_reference_safe(item,key)),
   _=>false
  }
 }
 fn flower_candle_zero_reference_safe(&self,item:i32,key:u32)->bool{
  let index=&self.slot.index;
  !index.inventory_furniture_refs_incomplete&&!index.inventory_item_refs_incomplete&&!index.inventory_payload_refs_incomplete&&
   !index.inventory_furniture_item_refs.contains(&item)&&!index.inventory_payload_item_refs.contains(&item)&&
   !index.inventory_furniture_guid_refs.contains(&key)&&!index.inventory_clothing_guid_refs.contains(&key)
 }
 // New non-clothing slice: the exact original item GUID is a denial key,
 // never an identity or permission to change a referenced object.
 fn ordinary_tradeable_nonclothing_zero_reference_safe(&self,item:i32)->bool{
  let Some(key)=crate::inventory_source::ordinary_tradeable_nonclothing_reference(item)else{return false};
  self.ordinary_nonclothing_reference_safe(item,key)
 }
 // Source-driven normal bag policy, independent of the display category.
 fn ordinary_bag_zero_reference_safe(&self,item:i32)->bool{
  let Some((outfit,key))=crate::inventory_source::ordinary_bag_definition(item)else{
   // Preserve previously verified optional furniture base rows outside the
   // ordinary bag class; the material definition has its own source proof.
   return crate::inventory_source::custom_furniture_extra_reference(item).is_some_and(|key|
    self.ordinary_item_reference_scope_safe(item)&&self.nonclothing_reference_context_safe(item,key))
  };
  if outfit{
   return self.ordinary_clothing_zero_reference_safe(item)&&
    !self.slot.index.inventory_item_refs.iter().any(|&(i,_)|i==item)
  }
  self.ordinary_item_reference_scope_safe(item)&&self.nonclothing_reference_context_safe(item,key)
 }
 fn ordinary_item_reference_scope_safe(&self,item:i32)->bool{
  !self.slot.index.inventory_item_refs_unscoped&&!self.slot.index.inventory_partial_item_refs.contains(&item)
 }
 fn ordinary_nonclothing_reference_safe(&self,item:i32,key:u32)->bool{
  !self.slot.index.inventory_item_refs_incomplete&&self.nonclothing_reference_context_safe(item,key)
 }
 fn nonclothing_reference_context_safe(&self,item:i32,key:u32)->bool{
  let index=&self.slot.index;
  !index.inventory_payload_refs_incomplete&&
   !index.inventory_furniture_refs_incomplete&&!index.inventory_clothing_item_refs_incomplete&&
   !index.inventory_furniture_item_refs.contains(&item)&&!index.inventory_payload_item_refs.contains(&item)&&
   !index.inventory_furniture_guid_refs.contains(&key)&&!index.inventory_clothing_guid_refs.contains(&key)&&
   !index.inventory_item_refs.iter().any(|&(i,_)|i==item)
 }
 // Saved typed customized furniture outside the ordinary creation slice.
 // The exact original GUID is used only to reject referenced rows.
 fn extra_custom_furniture_zero_reference_safe(&self,item:i32)->bool{
  let Some(key)=crate::inventory_source::custom_furniture_extra_reference(item)else{return false};
  self.ordinary_nonclothing_reference_safe(item,key)
 }
 fn ordinary_clothing_zero_reference_safe(&self,item:i32)->bool{
  let Some((own,group))=crate::inventory_source::ordinary_clothing_reference_keys(item)else{return false};
  self.ordinary_item_reference_scope_safe(item)&&self.clothing_reference_context_safe(item,std::iter::once(&own).chain(group.iter()))
 }
 fn clothing_zero_reference_safe<'a>(&self,item:i32,keys:impl Iterator<Item=&'a u32>)->bool{
  !self.slot.index.inventory_item_refs_incomplete&&self.clothing_reference_context_safe(item,keys)
 }
 fn clothing_reference_context_safe<'a>(&self,item:i32,mut keys:impl Iterator<Item=&'a u32>)->bool{
  let index=&self.slot.index;
  index.inventory_clothing_avatar_models>0&&index.inventory_clothing_general_models==1&&
   !index.inventory_clothing_refs_incomplete&&!index.inventory_clothing_unknown_preset&&
   !index.inventory_furniture_refs_incomplete&&!index.inventory_payload_refs_incomplete&&
   !index.inventory_furniture_item_refs.contains(&item)&&!index.inventory_payload_item_refs.contains(&item)&&
   keys.all(|k|
    !index.inventory_clothing_guid_refs.contains(k)&&!index.inventory_furniture_guid_refs.contains(k))
 }
 /// Native subtraction clamps to zero without deleting the saved record.
 /// Existing consumables must pass the full original unique quantity
 /// identity/reference index, including copied payloads.
 fn inventory_can_empty(&self,r:&crate::native::InventoryRow)->bool{
  if (self.is_emptyable_unique_family(r)||self.palette_zero_reference_safe(r))&&self.unique_quantity_ids.contains(&r.id){return true}
  let Some(item_id)=r.item_id else{return false};
  self.slot.envelope.version==Version::V301&&r.id>0&&r.id<=i32::MAX as u32&&
   self.ordinary_bag_zero_reference_safe(item_id)&&
   r.unique_id==Some(0)&&r.unique_is_nil==Some(true)&&r.quantity.is_some_and(|q|q>=0)&&
   r.fields.iter().all(Option::is_some)&&(self.inventory_item_rows.get(&item_id)==Some(&1)||
    self.ordinary_furniture_base_zero_with_peers(r,item_id))&&
   self.ordinary_item_reference_scope_safe(item_id)&&
   !self.slot.index.inventory_item_refs.contains(&(item_id,0))
 }
 // Index the original unique identities once, rather than scanning all
 // peers per visible row or per complete Worker snapshot. Variant changes
 // already reserve original and effective peer identities in their contexts.
 fn is_flower_quantity_definition(item:i32)->bool{
  FLOWER_SPECIES.iter().any(|(id,_)|*id==item)||
   FLOWER_CROWN_SPECIES.binary_search_by_key(&item,|&(id,_)|id).is_ok()||flower_candle_source(item).is_some()||rare_candle_key(item).is_some()||
   FLOWER_CLOTHING_GENERIC.contains(&item)||OWNED_DLC_FLOWER_GENERIC.contains(&item)||item==FLOWER_CLOTHING_NO_PATTERN
 }
 // Full ordered source keys for native Cafe/Boba Equals. Read every
 // original field, never the truncated display projection. No new flavor
 // or appearance is inferred, and no payload is reconstructed.
 fn chef_identity(&self,row:&crate::native::InventoryRow)->Option<(Vec<i32>,Vec<i32>)>{
  use crate::inventory_source::{CAFE_IDS,BOBA_ID,is_chef_color,is_uncapped_required_unique_stack};
  let item=row.item_id?;
  if !is_uncapped_required_unique_stack(item){return None}
  let decoded=&self.slot.envelope.decoded;
  let read_list=|index:usize|->Option<Vec<i32>>{
   let data=decoded.get(row.unique_fields.get(index)?.clone())?;
   let mut cursor=Cursor::new(data);let n=cursor.array().ok()?;
   if n==0||n>64{return None}
   let mut values=Vec::with_capacity(n);
   for _ in 0..n{values.push(cursor.int(i32::MIN as i128,i32::MAX as i128).ok()? as i32);}
   (cursor.pos==data.len()).then_some(values)
  };
  match row.unique_data?{
   InventoryUniqueData::CafeAppearance{..} if CAFE_IDS.binary_search(&item).is_ok()&&row.unique_fields.len()==2=>{
    let flavors=read_list(0)?;let colors=read_list(1)?;
    // Exact ordered equality is independent of recipe or color validity.
    // A fully decoded unsupported peer reserves its own key, not the family.
    Some((flavors,colors))
   }
   InventoryUniqueData::BobaAppearance{..} if item==BOBA_ID&&row.unique_fields.len()==5=>{
    let mut words=Vec::with_capacity(5);
    for field in &row.unique_fields{
     let data=decoded.get(field.clone())?;let mut cursor=Cursor::new(data);
     words.push(cursor.int(i32::MIN as i128,i32::MAX as i128).ok()? as i32);
     if cursor.pos!=data.len(){return None}
    }
    if !is_chef_color(words[0])||words[1]<=0||words[4]<=0{return None}
    Some((words,Vec::new()))
   }
   _=>None
  }
 }
 // Full native Boba payload, separate from the existing appearance-only
 // display words. Never infer a flavor or normalize an untouched field.
 // Only source-free, shaped magic wands are authorized.
 fn wand_material_source(item:i32,source:i32)->Option<&'static FurnitureItemSource>{
  if item!=crate::inventory_source::ITEM_WAND_ID||crate::inventory_source::wand_source_style(item,source)!=Some(0){return None}
  furniture_source::item(source).filter(|s|!s.is_home_layout)
 }
 fn wand_pair(v:WandData)->WandVariant{[v[1],v[2]]}
 fn wand_materials(v:WandData)->FurnitureVariant{[v[3],v[4],v[5]]}
 fn wand_nil(source:i32,[magic,fleck]:WandVariant)->WandData{[source,magic,fleck,-1,-1,-1]}
 // Use the existing conservative furniture material normalization. A
 // nil source payload is a separate identity from a nondefault tag-8.
 fn wand_key(item:i32,v:WandData)->Option<WandData>{
  let [source,magic,fleck,_,_,_]=v;
  crate::inventory_source::wand_source_style(item,source)?;
  if !crate::inventory_source::magic_wand_choices([magic,fleck]){return None}
  let materials=Self::wand_materials(v);
  if materials==WAND_NIL_MATERIALS{return Some(v)}
  let s=Self::wand_material_source(item,source)?;
  if materials.iter().any(|&m|m<0||furniture_source::material_unlock_item(m).is_some()){return None}
  let [a,b,c]=furniture_key(s,materials)?;
  if Some([a,b,c])==furniture_key(s,[0;3]){return None}
  Some([source,magic,fleck,a,b,c])
 }
 fn wand_identity(row:&crate::native::InventoryRow)->Option<WandData>{
  let item=row.item_id?;
  let InventoryUniqueData::WandAppearance{source_item_id,magic,fleck,style,source_tag,source_count,source_words}=row.unique_data? else{return None};
  if row.unique_fields.len()!=5||crate::inventory_source::wand_source_style(item,source_item_id)!=Some(style){return None}
  let v=match (source_tag,source_count){
   (-1,0)=>Self::wand_nil(source_item_id,[magic,fleck]),
   (8,3)=>[source_item_id,magic,fleck,source_words[0] as i32,source_words[1] as i32,source_words[2] as i32],
   _=>return None,
  };
  Self::wand_key(item,v)?;Some(v)
 }
 // SourceItemId identifies a definition, not an inventory UID. Native
 // Copy/IsValid/TryGetSubIcon use the copied tuple or nil, independently
 // of possession. Reuse the same full identity validator for both recipes.
 pub(crate) fn verified_bag_wand_copy(row:&crate::native::InventoryRow)->bool{
  matches!(row.item_id,Some(crate::inventory_source::ITEM_WAND_ID|crate::inventory_source::CRITTER_WAND_ID))&&
   row.id>0&&row.id<PENDING_ITEM&&row.unique_id.is_some_and(|uid|uid>0)&&
   row.quantity.is_some_and(|q|q>=0)&&row.fields.iter().all(Option::is_some)&&
   Self::wand_identity(row).is_some_and(|v|v[0]>0)
 }
 // Decode complete nested furniture tuples in either native wire format.
 // The tag and token spans are retained for exact, format-preserving patches.
 fn wand_material_fields(raw:&[u8])->Result<(i32,FurnitureVariant,Vec<std::ops::Range<usize>>),Error>{
  let mut cursor=Cursor::new(raw);
  if cursor.array()?!=2{return Err(Error::Schema)}
  let tag=cursor.int(1,8)? as i32;
  if !matches!(tag,1|8)||cursor.array()?!=3{return Err(Error::Schema)}
  let mut spans=Vec::with_capacity(3);let mut materials=[0;3];
  for material in &mut materials{
   let start=cursor.pos;
   *material=if tag==1{
    let mut words=[0;4];
    for word in &mut words{*word=cursor.int(0,u32::MAX as i128)? as u32;}
    furniture_source::material_index_for_guid(words).ok_or(Error::Schema)?
   }else{cursor.int(0,i32::MAX as i128)? as i32};
   spans.push(start..cursor.pos);
  }
  if cursor.pos!=raw.len(){return Err(Error::Schema)}
  Ok((tag,materials,spans))
 }
 fn wand_material_spans(raw:&[u8],materials:FurnitureVariant)->Result<Vec<std::ops::Range<usize>>,Error>{
  let (_,decoded,spans)=Self::wand_material_fields(raw)?;
  if decoded!=materials{return Err(Error::Schema)}
  Ok(spans)
 }
 // Resolve legacy source GUIDs without changing their native representation.
 fn legacy_wand_identity(&self,row:&crate::native::InventoryRow)->Option<WandData>{
  Self::legacy_wand_identity_in(&self.slot.envelope.decoded,row)
 }
 fn legacy_wand_identity_in(decoded:&[u8],row:&crate::native::InventoryRow)->Option<WandData>{
  if !matches!(row.unique_data,Some(InventoryUniqueData::Opaque{tag:5}))||row.unique_fields.len()!=5{return None}
  let mut c=Cursor::new(decoded.get(row.unique_fields[0].clone())?);
  let mut guid=[0;4];for word in &mut guid{*word=c.int(0,u32::MAX as i128).ok()? as u32;}
  if c.pos!=c.bytes.len(){return None}
  let source=crate::inventory_source::legacy_wand_source_id(guid)?;
  let nested=decoded.get(row.unique_fields[1].clone())?;
  let materials=if nested==[0xc0]{WAND_NIL_MATERIALS}else{Self::wand_material_fields(nested).ok()?.1};
  let mut values=[0;3];
  for (v,span) in values.iter_mut().zip(&row.unique_fields[2..]){
   let mut c=Cursor::new(decoded.get(span.clone())?);*v=c.int(0,i32::MAX as i128).ok()? as i32;
   if c.pos!=c.bytes.len(){return None}
  }
  let item=row.item_id?;
  if crate::inventory_source::wand_source_style(item,source)!=Some(values[2]){return None}
  let [a,b,c]=materials;
  let identity=[source,values[0],values[1],a,b,c];
  Self::wand_key(item,identity)?;Some(identity)
 }
 fn saved_wand_identity(&self,row:&crate::native::InventoryRow)->Option<WandData>{
  Self::wand_identity(row).or_else(||self.legacy_wand_identity(row))
 }
 fn legacy_wand_zero_reference_safe(&self,row:&crate::native::InventoryRow)->bool{
  row.item_id.is_some_and(|item|self.wand_reference_safe(item))&&
   self.legacy_wand_identity(row).is_some()&&self.legacy_wand_sources_resolved
 }
 fn wand_reference_safe(&self,item:i32)->bool{
  let index=&self.slot.index;
  let Some(key)=crate::inventory_source::wand_reference_key(item)else{return false};
  !index.inventory_wand_copies&&
   !index.inventory_item_refs_incomplete&&!index.inventory_payload_refs_incomplete&&
   !index.inventory_furniture_refs_incomplete&&!index.inventory_clothing_refs_incomplete&&
   !index.inventory_palette_context_incomplete&&!index.inventory_palette_copies_incomplete&&
   !index.inventory_furniture_guid_refs.contains(&key)&&!index.inventory_clothing_guid_refs.contains(&key)&&
   !index.inventory_furniture_item_refs.contains(&item)&&!index.inventory_payload_item_refs.contains(&item)&&
   !index.inventory_item_refs.iter().any(|&(id,_)|id==item)
 }
 fn wand_zero_reference_safe(&self,row:&crate::native::InventoryRow)->bool{
  row.item_id.is_some_and(|item|self.wand_reference_safe(item))&&self.saved_wand_identity(row).is_some()&&
   self.legacy_wand_sources_resolved
 }
 fn wand_appearance(item:i32,v:WandData)->Option<InventoryUniqueData>{
  Self::wand_key(item,v)?;
  let [source_item_id,magic,fleck,a,b,c]=v;
  let style=crate::inventory_source::wand_source_style(item,source_item_id)?;
  let (source_tag,source_count,source_words)=if [a,b,c]==WAND_NIL_MATERIALS{(-1,0,[0;12])}else{
   let mut words=[0;12];words[..3].copy_from_slice(&[a as u32,b as u32,c as u32]);(8,3,words)
  };
  Some(InventoryUniqueData::WandAppearance{source_item_id,magic,fleck,style,source_tag,source_count,source_words})
 }
 fn original_wand_identity(&self,id:u32)->Option<WandData>{
  self.pending_wands.get(&id).map(|&(_,v)|v).or_else(||{
   let row=self.slot.index.inventory.iter().find(|r|r.id==id)?;
   Self::wand_identity(row).or_else(||self.legacy_wand_identity(row))
  })
 }
 fn wand_full_context(&self,id:u32)->Option<(i32,WandData,WandData,HashSet<WandData>)>{
  if self.slot.index.inventory_wand_copies{return None}
  let item=if let Some(&(item,_))=self.pending_wands.get(&id){
   if !self.inventory_changes.contains_key(&id){return None}
   item
  }else{
   if !self.unique_quantity_ids.contains(&id){return None}
   self.slot.index.inventory.iter().find(|r|r.id==id)?.item_id?
  };
  let original=self.original_wand_identity(id)?;
  let current=self.wand_variant_changes.get(&id).copied().unwrap_or(original);
  let mut reserved=HashSet::new();
  for peer in &self.slot.index.inventory{
   if peer.id==id||peer.item_id!=Some(item){continue}
   let v=self.saved_wand_identity(peer)?;
   reserved.insert(Self::wand_key(item,v)?);
   reserved.insert(Self::wand_key(item,self.wand_variant_changes.get(&peer.id).copied().unwrap_or(v))?);
  }
  for (&other,&(other_item,v)) in &self.pending_wands{
   if other==id||other_item!=item||!self.inventory_changes.contains_key(&other){continue}
   reserved.insert(Self::wand_key(item,v)?);
   reserved.insert(Self::wand_key(item,self.wand_variant_changes.get(&other).copied().unwrap_or(v))?);
  }
  if reserved.contains(&Self::wand_key(item,original)?)||reserved.contains(&Self::wand_key(item,current)?){return None}
  Some((item,original,current,reserved))
 }
 fn wand_context(&self,id:u32)->Option<(i32,i32,WandVariant,WandVariant,HashSet<WandVariant>)>{
  let (item,original,current,reserved)=self.wand_full_context(id)?;
  let key=Self::wand_key(item,current)?;
  Some((item,current[0],Self::wand_pair(original),Self::wand_pair(current),reserved.into_iter().filter_map(|v|
   (v[0]==key[0]&&v[3..]==key[3..]).then_some(Self::wand_pair(v))).collect()))
 }
 pub fn inventory_wand_edit_hints(&self)->impl Iterator<Item=u32>+'_{
  self.slot.index.inventory.iter().filter_map(move |r|{
   let item=r.item_id?;
   let identity=Self::wand_identity(r).or_else(||self.legacy_wand_identity(r))?;
   (self.unique_quantity_ids.contains(&r.id)&&!self.slot.index.inventory_wand_copies&&
    (Self::wand_materials(identity)==WAND_NIL_MATERIALS||self.wand_source_edit_safe(r.id,item))).then_some(r.id)
  }).chain(self.pending_wands.keys().copied().filter(|id|self.inventory_changes.contains_key(id)))
 }
 pub fn inventory_wand_variants(&self,id:u32)->Vec<WandVariant>{
  let Some((item,_,identity,_))=self.wand_full_context(id)else{return Vec::new()};
  if Self::wand_materials(identity)!=WAND_NIL_MATERIALS&&!self.wand_source_edit_safe(id,item){return Vec::new()}
  let Some((_,_,_,current,reserved))=self.wand_context(id)else{return Vec::new()};
  let mut out=Vec::new();
  for &(magic,_) in crate::inventory_source::WAND_MAGIC{
   for &(fleck,_) in crate::inventory_source::WAND_FLECK{
    let v=[magic,fleck];if v!=current&&!reserved.contains(&v){out.push(v)}
   }
  }
  out
 }
 fn absent_wand_source_gate(&self,item:i32)->bool{
  item!=crate::inventory_source::GENERIC_MAGIC_WAND_ID&&crate::inventory_source::wand_output_item(item)&&
   crate::inventory_source::is_uncapped_required_unique_stack(item)&&
   (if crate::inventory_source::magic_wand_style(item).is_some(){
    self.saved_item_family_empty(item)&&self.wand_source_reservations(item).is_some()&&
    !self.pending_wands.iter().any(|(&id,&(i,_))|i==item&&self.inventory_changes.contains_key(&id))
   }else{self.wand_source_reservations(item).is_some()})&&
   !self.slot.index.inventory_wand_copies&&self.inventory_creation_payload_safe(item)&&
   !self.slot.index.inventory_item_refs.iter().any(|&(i,_)|i==item)&&self.absent_flower_budget_available()
 }
 // Existing positive original ordinary source rows are witnesses only:
 // neither their quantity nor any acquisition/entitlement data is written.
 fn has_owned_wand_source(&self,source:i32)->bool{
  self.inventory_item_rows.get(&source)==Some(&1)&&self.slot.index.inventory.iter().any(|r|
   r.item_id==Some(source)&&r.id>0&&r.id<PENDING_ITEM&&r.unique_id==Some(0)&&r.unique_is_nil==Some(true)&&
   r.fields.iter().all(Option::is_some)&&r.quantity.is_some_and(|q|q>0)&&
   self.inventory_changes.get(&r.id).copied().or(r.quantity).is_some_and(|q|q>0))
 }
 fn absent_wand_source_allowed(&self,item:i32,source:i32)->bool{
  source>0&&crate::inventory_source::wand_source_style(item,source)==Some(0)&&
   (crate::inventory_source::ordinary_bag_creation_item(source)||self.has_owned_wand_source(source))
 }
 // Reserve both original and effective identities, including original zero rows.
 // Any unverified original peer makes the whole source family unsafe to extend.
 fn wand_source_reservations(&self,item:i32)->Option<HashMap<i32,HashSet<WandVariant>>>{
  let mut reservations:HashMap<i32,HashSet<WandVariant>>=HashMap::new();
  let mut reserve=|id,v:WandData|->Option<()>{
   for key in [v,self.wand_variant_changes.get(&id).copied().unwrap_or(v)]{
    let key=Self::wand_key(item,key)?;
    if Self::wand_materials(key)==WAND_NIL_MATERIALS{reservations.entry(key[0]).or_default().insert(Self::wand_pair(key));}
   }
   Some(())
  };
  for row in self.slot.index.inventory.iter().filter(|r|r.item_id==Some(item)){
   if !self.unique_quantity_ids.contains(&row.id){return None}
   reserve(row.id,self.saved_wand_identity(row)?)?;
  }
  for (&id,&(other,v)) in &self.pending_wands{
   if other!=item||!self.inventory_changes.contains_key(&id){continue}
   reserve(id,v)?;
  }
  Some(reservations)
 }
 pub fn inventory_wand_source_creation_variants(&self,id:u32,source:i32)->Vec<WandVariant>{
  if id&PENDING_ITEM==0||self.pending_wands.contains_key(&id){return Vec::new()}
  let item=(id&!PENDING_ITEM) as i32;
  if !matches!(item,crate::inventory_source::ITEM_WAND_ID|crate::inventory_source::CRITTER_WAND_ID)||
   !self.absent_wand_source_gate(item)||!self.absent_wand_source_allowed(item,source){return Vec::new()}
  let Some(reserved)=self.wand_source_reservations(item)else{return Vec::new()};
  crate::inventory_source::WAND_MAGIC.iter().flat_map(|&(magic,_)|
   crate::inventory_source::WAND_FLECK.iter().map(move |&(fleck,_)|[magic,fleck]))
   .filter(|v|!reserved.get(&source).is_some_and(|keys|keys.contains(v))).collect()
 }
 pub fn inventory_absent_wand_sources(&self,id:u32)->Vec<i32>{
  if id&PENDING_ITEM==0||self.pending_wands.contains_key(&id){return Vec::new()}
  let item=(id&!PENDING_ITEM) as i32;
  if !matches!(item,crate::inventory_source::ITEM_WAND_ID|crate::inventory_source::CRITTER_WAND_ID)||!self.absent_wand_source_gate(item){return Vec::new()}
  let mut sources=self.wand_source_candidates(item);
  let Some(reserved)=self.wand_source_reservations(item)else{return Vec::new()};
  sources.retain(|source|reserved.get(source).map_or(true,|keys|keys.len()<36));
  sources
 }
 // Native ItemWandProcessor copies the selected InventoryItem's unique data.
 // A positive verified saved or active staged furniture row is an exact
 // witness; never synthesize a nested tuple from a bare Item ID.
 fn owned_furniture_wand_witness(&self,id:u32)->Option<WandData>{
  let item=if let Some(furniture)=self.pending_furniture.get(&id){
   if !self.inventory_changes.get(&id).is_some_and(|&q|q>0){return None}
   furniture.item_id
  }else{
   let row=self.slot.index.inventory.iter().find(|r|r.id==id)?;
   if !self.unique_quantity_ids.contains(&id)||!row.quantity.is_some_and(|q|q>0)||
    !self.inventory_changes.get(&id).copied().or(row.quantity).is_some_and(|q|q>0){return None}
   row.item_id?
  };
  let (source,original,current,_)=self.furniture_context(id)?;
  Self::wand_material_source(crate::inventory_source::ITEM_WAND_ID,item)?;
  if !Self::valid_furniture_target(source,original,current){return None}
  let [a,b,c]=current;
  if current.iter().any(|&n|furniture_source::material_unlock_item(n).is_some()){return None}
  Self::wand_key(crate::inventory_source::ITEM_WAND_ID,[item,104,125,a,b,c])?;
  Some([item,0,0,a,b,c])
 }
 fn nested_wand_output_reservations(&self)->Option<HashSet<WandData>>{
  let item=crate::inventory_source::ITEM_WAND_ID;
  let mut keys=HashSet::new();
  for r in self.slot.index.inventory.iter().filter(|r|r.item_id==Some(item)){
   if !self.unique_quantity_ids.contains(&r.id){return None}
   let original=self.saved_wand_identity(r)?;
   for v in [original,self.wand_variant_changes.get(&r.id).copied().unwrap_or(original)]{keys.insert(Self::wand_key(item,v)?);}
  }
  for (&id,&(i,original)) in &self.pending_wands{
   if i!=item||!self.inventory_changes.contains_key(&id){continue}
   for v in [original,self.wand_variant_changes.get(&id).copied().unwrap_or(original)]{keys.insert(Self::wand_key(item,v)?);}
  }
  Some(keys)
 }
 fn furniture_wand_pairs(witness:WandData,keys:&HashSet<WandData>)->Vec<WandVariant>{
  let item=crate::inventory_source::ITEM_WAND_ID;
  crate::inventory_source::WAND_MAGIC.iter().flat_map(|&(m,_)|
   crate::inventory_source::WAND_FLECK.iter().map(move |&(f,_)|[m,f]))
   .filter(|&[m,f]|{
    let mut target=witness;target[1]=m;target[2]=f;
    Self::wand_key(item,target).is_some_and(|key|!keys.contains(&key))
   }).collect()
 }
 pub fn inventory_owned_furniture_wand_sources(&self,candidate:u32)->Vec<u32>{
  let item=crate::inventory_source::ITEM_WAND_ID;
  if candidate!=(PENDING_ITEM|item as u32)||!self.absent_wand_source_gate(item){return Vec::new()}
  let Some(keys)=self.nested_wand_output_reservations()else{return Vec::new()};
  let mut rows:Vec<_>=self.slot.index.inventory.iter().map(|r|r.id).chain(self.pending_furniture.keys().copied()).filter_map(|id|{
   let witness=self.owned_furniture_wand_witness(id)?;
   (!Self::furniture_wand_pairs(witness,&keys).is_empty()).then_some(id)
  }).collect();
  rows.sort_unstable();rows.dedup();rows
 }
 pub fn inventory_owned_furniture_wand_pairs(&self,id:u32)->Vec<WandVariant>{
  if !self.absent_wand_source_gate(crate::inventory_source::ITEM_WAND_ID){return Vec::new()}
  let Some(witness)=self.owned_furniture_wand_witness(id)else{return Vec::new()};
  let Some(keys)=self.nested_wand_output_reservations()else{return Vec::new()};
  Self::furniture_wand_pairs(witness,&keys)
 }
 fn wand_source_candidates(&self,item:i32)->Vec<i32>{
  let mut sources=crate::inventory_source::ordinary_bag_creation_ids().filter(|&source|
   crate::inventory_source::wand_source_style(item,source)==Some(0)).collect::<Vec<_>>();
  sources.extend(self.slot.index.inventory.iter().filter_map(|r|{
   let source=r.item_id?;
   (crate::inventory_source::wand_source_style(item,source)==Some(0)&&self.inventory_item_rows.get(&source)==Some(&1)&&
    r.id>0&&r.id<PENDING_ITEM&&r.unique_id==Some(0)&&r.unique_is_nil==Some(true)&&r.fields.iter().all(Option::is_some)&&
    r.quantity.is_some_and(|q|q>0)&&self.inventory_changes.get(&r.id).copied().or(r.quantity).is_some_and(|q|q>0)).then_some(source)
  }));
  sources.sort_unstable();sources.dedup();sources
 }
 fn absent_wand_choices(&self,item:i32)->Vec<WandVariant>{
  if !self.absent_wand_source_gate(item){return Vec::new()}
  if crate::inventory_source::magic_wand_style(item).is_none()&&
   self.inventory_absent_wand_sources(PENDING_ITEM|item as u32).is_empty()&&
   self.inventory_owned_furniture_wand_sources(PENDING_ITEM|item as u32).is_empty(){return Vec::new()}
  let reserved=if crate::inventory_source::magic_wand_style(item).is_some(){
   let Some(mut keys)=self.wand_source_reservations(item)else{return Vec::new()};
   keys.remove(&0).unwrap_or_default()
  }else{HashSet::new()};
  crate::inventory_source::WAND_MAGIC.iter().flat_map(|&(magic,_)|
   crate::inventory_source::WAND_FLECK.iter().map(move |&(fleck,_)|[magic,fleck]))
   .filter(|pair|!reserved.contains(pair)).collect()
 }
 pub fn inventory_absent_wand_ids(&self)->Vec<(i32,i32)>{
  crate::inventory_source::MAGIC_WAND_STYLES.iter().copied().chain([
   (crate::inventory_source::ITEM_WAND_ID,0),(crate::inventory_source::CRITTER_WAND_ID,0)])
   .filter(|&(item,_)|!self.absent_wand_choices(item).is_empty()).collect()
 }
 fn wand_creation_gate(&self,id:u32,item:i32)->bool{
  if self.slot.index.inventory.iter().any(|r|r.id==id&&matches!(r.unique_data,Some(InventoryUniqueData::Opaque{tag:5}))&&
   !self.legacy_wand_zero_reference_safe(r)){return false}
  let qty=self.inventory_changes.get(&id).copied().or_else(||self.slot.index.inventory.iter().find(|r|r.id==id).and_then(|r|r.quantity));
  qty.is_some_and(|q|q>0)&&self.absent_flower_budget_available()&&
   self.inventory_creation_payload_safe(item)&&!self.slot.index.inventory_item_refs.iter().any(|&(i,_)|i==item)
 }
 pub fn inventory_wand_creation_variants(&self,id:u32)->Vec<WandVariant>{
  if id&PENDING_ITEM!=0&&!self.pending_wands.contains_key(&id){return self.absent_wand_choices((id&!PENDING_ITEM) as i32)}
  let Some((item,original,current,_))=self.wand_full_context(id)else{return Vec::new()};
  if !self.wand_creation_gate(id,item){return Vec::new()}
  self.inventory_wand_variants(id).into_iter().filter(|&v|{
   let mut target=current;target[1..3].copy_from_slice(&v);
   Self::wand_key(item,target)!=Self::wand_key(item,original)
  }).collect()
 }
 fn stage_wand(&mut self,source_id:u32,item_id:i32,expected:WandVariant,expected_nested:Option<WandData>,identity:WandData,quantity:i32)->Result<u32,Error>{
  let document_id=self.allocate_staged_unique_handle()?;let revision=self.next_edit_revision()?;
  let change=Change::WandCreated{document_id,source_id,item_id,expected,expected_nested,identity,quantity};
  self.restore_change(&change,false);self.undo.push(change);
  self.redo.retain(|c|c.scope()!=HistoryScope::Inventory);self.revision=revision;Ok(document_id)
 }
 pub fn create_inventory_wand_variant(&mut self,source_id:u32,expected:WandVariant,next:WandVariant,quantity:i32)->Result<u32,Error>{
  if quantity<=0||!self.inventory_wand_creation_variants(source_id).contains(&next){return Err(Error::Schema)}
  let (item,source_item_id)=if source_id&PENDING_ITEM!=0&&!self.pending_wands.contains_key(&source_id){
   let item=(source_id&!PENDING_ITEM) as i32;
   if crate::inventory_source::magic_wand_style(item).is_some(){
    if expected!=[0;2]{return Err(Error::Schema)}
    (item,0)
   }else{
    if expected[1]!=0||!self.inventory_wand_source_creation_variants(source_id,expected[0]).contains(&next){return Err(Error::Schema)}
    (item,expected[0])
   }
  }else{
   let (item,_,current,_)=self.wand_full_context(source_id).ok_or(Error::Schema)?;
   if Self::wand_materials(current)!=WAND_NIL_MATERIALS||expected!=Self::wand_pair(current){return Err(Error::Schema)}
   (item,current[0])
  };
  self.stage_wand(source_id,item,expected,None,Self::wand_nil(source_item_id,next),quantity)
 }
 // Source replacement uses the stronger original zero/reference gate.
 fn wand_source_edit_safe(&self,id:u32,item:i32)->bool{
  if !matches!(item,crate::inventory_source::ITEM_WAND_ID|crate::inventory_source::CRITTER_WAND_ID){return false}
  if let Some(row)=self.slot.index.inventory.iter().find(|r|r.id==id&&matches!(r.unique_data,Some(InventoryUniqueData::Opaque{tag:5}))){
   return self.unique_quantity_ids.contains(&id)&&self.legacy_wand_zero_reference_safe(row)
  }
  if self.wand_source_reservations(item).is_none(){return false}
  if id&PENDING_ITEM!=0{return self.pending_wands.contains_key(&id)&&self.inventory_changes.contains_key(&id)&&
   self.inventory_creation_payload_safe(item)&&!self.slot.index.inventory_item_refs.iter().any(|&(i,_)|i==item)}
  self.slot.index.inventory.iter().find(|r|r.id==id).is_some_and(|r|self.wand_zero_reference_safe(r))
 }
 pub fn inventory_wand_edit_sources(&self,id:u32)->Vec<i32>{
  let Some((item,original,current,reserved))=self.wand_full_context(id)else{return Vec::new()};
  if Self::wand_materials(current)!=WAND_NIL_MATERIALS||!self.wand_source_edit_safe(id,item){return Vec::new()}
  let mut sources=self.wand_source_candidates(item);
  sources.extend([original[0],current[0]]);sources.sort_unstable();sources.dedup();
  sources.retain(|&source|crate::inventory_source::WAND_MAGIC.iter().any(|&(m,_)|
   crate::inventory_source::WAND_FLECK.iter().any(|&(f,_)|{
    let target=Self::wand_nil(source,[m,f]);target!=current&&!reserved.contains(&target)
   })));
  sources
 }
 pub fn inventory_wand_edit_source_variants(&self,id:u32,source:i32)->Vec<WandVariant>{
  let Some((item,original,current,reserved))=self.wand_full_context(id)else{return Vec::new()};
  if source!=current[0]&&(Self::wand_materials(current)!=WAND_NIL_MATERIALS||!self.wand_source_edit_safe(id,item)||
   (source!=original[0]&&!self.absent_wand_source_allowed(item,source))){return Vec::new()}
  crate::inventory_source::WAND_MAGIC.iter().flat_map(|&(magic,_)|
   crate::inventory_source::WAND_FLECK.iter().map(move |&(fleck,_)|[magic,fleck]))
   .filter(|&[magic,fleck]|{
    let mut target=current;target[..3].copy_from_slice(&[source,magic,fleck]);
    target!=current&&Self::wand_key(item,target).is_some_and(|key|!reserved.contains(&key))
   }).collect()
 }
 fn apply_wand_change(&mut self,id:u32,original:WandData,next:WandData)->Result<(),Error>{
  let revision=self.next_edit_revision()?;
  let before=self.wand_variant_changes.get(&id).copied();let after=(next!=original).then_some(next);
  if let Some(v)=after{self.wand_variant_changes.insert(id,v);}else{self.wand_variant_changes.remove(&id);}
  self.undo.push(Change::WandVariant{document_id:id,before,after});
  if self.undo.len()>MAX_UNDO{self.undo.remove(0);}
  self.redo.retain(|c|c.scope()!=HistoryScope::Inventory);self.revision=revision;Ok(())
 }
 pub fn change_inventory_wand_variant(&mut self,id:u32,expected:WandVariant,next:WandVariant)->Result<(),Error>{
  let (_,_,current,_)=self.wand_full_context(id).ok_or(Error::Schema)?;
  self.change_inventory_wand_identity(id,[current[0],expected[0],expected[1]],[current[0],next[0],next[1]])
 }
 pub fn change_inventory_wand_identity(&mut self,id:u32,expected:WandIdentity,next:WandIdentity)->Result<(),Error>{
  let (_,original,current,_)=self.wand_full_context(id).ok_or(Error::Schema)?;
  if current!=Self::wand_nil(expected[0],[expected[1],expected[2]])||
   !self.inventory_wand_edit_source_variants(id,next[0]).contains(&[next[1],next[2]]){return Err(Error::Schema)}
  self.apply_wand_change(id,original,Self::wand_nil(next[0],[next[1],next[2]]))
 }
 // Only existing verified nondefault tag-8 payloads witness this slice.
 // Do not infer a nested payload from a plain item or an unrelated row.
 fn valid_wand_nested_target(&self,id:u32,item:i32,original:WandData,current:WandData,next:WandData)->bool{
  if Self::wand_materials(current)==WAND_NIL_MATERIALS||next[0]!=current[0]||!self.wand_source_edit_safe(id,item){return false}
  let Some(source)=Self::wand_material_source(item,current[0])else{return false};
  Self::valid_furniture_target(source,Self::wand_materials(original),Self::wand_materials(next))&&
   Self::wand_key(item,next).is_some()
 }
 pub fn inventory_wand_nested_material_variants(&self,id:u32)->Vec<FurnitureVariant>{
  self.wand_full_context(id).map_or_else(Vec::new,|(_,_,current,_)|
   self.inventory_wand_nested_materials_for_pair(id,Self::wand_pair(current),false))
 }
 pub fn inventory_wand_nested_materials_for_pair(&self,id:u32,pair:WandVariant,creation:bool)->Vec<FurnitureVariant>{
  let Some((item,original,current,reserved))=self.wand_full_context(id)else{return Vec::new()};
  if Self::wand_materials(current)==WAND_NIL_MATERIALS||!self.wand_source_edit_safe(id,item)||
   !crate::inventory_source::magic_wand_choices(pair)||(creation&&!self.wand_creation_gate(id,item)){return Vec::new()}
  Self::wand_nested_material_options(item,original,current,&reserved,pair,creation)
 }
 fn wand_nested_material_options(item:i32,original:WandData,current:WandData,reserved:&HashSet<WandData>,pair:WandVariant,creation:bool)->Vec<FurnitureVariant>{
  let Some(source)=Self::wand_material_source(item,current[0])else{return Vec::new()};
  let mut out=Vec::new();let mut seen=HashSet::new();let old=Self::wand_key(item,current);
  let original_key=Self::wand_key(item,original);
  let mut target=current;target[1..3].copy_from_slice(&pair);
  let mut offer=|target:WandData|{
   let key=Self::wand_key(item,target);
   if key!=old&&(!creation||key!=original_key)&&key.is_some_and(|k|!reserved.contains(&k))&&
    Self::valid_furniture_target(source,Self::wand_materials(original),Self::wand_materials(target)){
    let v=Self::wand_materials(target);if seen.insert(v){out.push(v)}
   }
  };
  offer(target);
  for slot in source.slots{
   let i=slot.slot as usize+3;
   for n in std::iter::once(0).chain(slot.allowed.iter().copied()){
    let mut next=target;next[i]=n;offer(next);
   }
  }
  out
 }
 pub fn inventory_wand_nested_creation_material_variants(&self,id:u32)->Vec<FurnitureVariant>{
  self.wand_full_context(id).map_or_else(Vec::new,|(_,_,current,_)|
   self.inventory_wand_nested_materials_for_pair(id,Self::wand_pair(current),true))
 }
 pub fn inventory_wand_nested_pairs(&self,id:u32,creation:bool)->Vec<WandVariant>{
  let Some((item,original,current,reserved))=self.wand_full_context(id)else{return Vec::new()};
  if Self::wand_materials(current)==WAND_NIL_MATERIALS||!self.wand_source_edit_safe(id,item)||
   (creation&&!self.wand_creation_gate(id,item)){return Vec::new()}
  crate::inventory_source::WAND_MAGIC.iter().flat_map(|&(magic,_)|
   crate::inventory_source::WAND_FLECK.iter().map(move |&(fleck,_)|[magic,fleck]))
   .filter(|&pair|pair!=Self::wand_pair(current)&&!Self::wand_nested_material_options(item,original,current,&reserved,pair,creation).is_empty()).collect()
 }
 pub fn change_inventory_wand_nested(&mut self,id:u32,expected:WandData,next:WandData)->Result<(),Error>{
  let (item,original,current,reserved)=self.wand_full_context(id).ok_or(Error::Schema)?;
  let key=Self::wand_key(item,next).ok_or(Error::Schema)?;
  if current!=expected||Self::wand_key(item,current)==Some(key)||reserved.contains(&key)||
   !self.valid_wand_nested_target(id,item,original,current,next){return Err(Error::Schema)}
  self.apply_wand_change(id,original,next)
 }
 pub fn create_inventory_wand_nested(&mut self,id:u32,expected:WandData,next:WandData,quantity:i32)->Result<u32,Error>{
  if expected[1..3]==[0,0]{
   let item=crate::inventory_source::ITEM_WAND_ID;
   if quantity<=0||self.owned_furniture_wand_witness(id)!=Some(expected)||
    next[0]!=expected[0]||next[3..]!=expected[3..]||
    !self.inventory_owned_furniture_wand_pairs(id).contains(&Self::wand_pair(next)){return Err(Error::Schema)}
   return self.stage_wand(id,item,[0;2],Some(expected),next,quantity)
  }
  let (item,original,current,reserved)=self.wand_full_context(id).ok_or(Error::Schema)?;
  let key=Self::wand_key(item,next).ok_or(Error::Schema)?;
  if quantity<=0||current!=expected||Self::wand_key(item,current)==Some(key)||Self::wand_key(item,original)==Some(key)||reserved.contains(&key)||
   !self.wand_creation_gate(id,item)||!self.valid_wand_nested_target(id,item,original,current,next){return Err(Error::Schema)}
  self.stage_wand(id,item,Self::wand_pair(expected),Some(expected),next,quantity)
 }
 fn boba_words(raw:&[u8],row:&crate::native::InventoryRow)->Option<BobaVariant>{
  if row.item_id!=Some(crate::inventory_source::BOBA_ID)||!matches!(row.unique_data,Some(InventoryUniqueData::BobaAppearance{..}))||row.unique_fields.len()!=5{return None}
  let mut words=[0;5];
  for (word,span) in words.iter_mut().zip(&row.unique_fields){
   let data=raw.get(span.clone())?;let mut cursor=Cursor::new(data);
   *word=cursor.int(i32::MIN as i128,i32::MAX as i128).ok()? as i32;
   if cursor.pos!=data.len(){return None}
  }
  Some(words)
 }
 fn original_boba_variant(&self,id:u32)->Option<BobaVariant>{
  self.pending_bobas.get(&id).copied().or_else(||Self::boba_words(&self.slot.envelope.decoded,self.slot.index.inventory.iter().find(|r|r.id==id)?))
 }
 pub fn inventory_boba_witnesses(&self)->&'static [(i32,i32,i32)]{
  if self.slot.envelope.version==Version::V301{crate::inventory_source::BOBA_WITNESSES}else{&[]}
 }
 fn boba_family_count(&self)->usize{
  self.inventory_item_rows.get(&crate::inventory_source::BOBA_ID).copied().unwrap_or(0)+self.pending_bobas.len()
 }
 pub fn inventory_boba_rows(&self)->impl Iterator<Item=(u32,BobaVariant,bool)>+'_{
  let family_count=self.boba_family_count();
  self.slot.index.inventory.iter().filter_map(move |r|{
   if self.slot.envelope.version!=Version::V301{return None}
   let original=Self::boba_words(&self.slot.envelope.decoded,r)?;
   let editable=family_count<=256&&self.unique_quantity_ids.contains(&r.id)&&crate::inventory_source::supported_boba_base(original);
   Some((r.id,self.boba_variant_changes.get(&r.id).copied().unwrap_or(original),editable))
  }).chain(self.pending_bobas.iter().filter(|(id,_)|self.inventory_changes.contains_key(*id)).map(|(&id,&v)|
   (id,self.boba_variant_changes.get(&id).copied().unwrap_or(v),true)))
 }
 fn boba_context(&self,id:u32)->Option<(BobaVariant,BobaVariant,HashSet<BobaVariant>)>{
  if self.boba_family_count()>256{return None}
  if self.pending_bobas.contains_key(&id){
   if !self.inventory_changes.contains_key(&id){return None}
  }else if !self.unique_quantity_ids.contains(&id){return None}
  let original=self.original_boba_variant(id)?;
  if !crate::inventory_source::supported_boba_base(original){return None}
  let current=self.boba_variant_changes.get(&id).copied().unwrap_or(original);
  let mut reserved=HashSet::new();
  for other in &self.slot.index.inventory{
   if other.id==id||other.item_id!=Some(crate::inventory_source::BOBA_ID){continue}
   let v=Self::boba_words(&self.slot.envelope.decoded,other)?;
   reserved.insert(v);reserved.insert(self.boba_variant_changes.get(&other.id).copied().unwrap_or(v));
  }
  for (&other,&v) in &self.pending_bobas{
   if other==id||!self.inventory_changes.contains_key(&other){continue}
   reserved.insert(v);reserved.insert(self.boba_variant_changes.get(&other).copied().unwrap_or(v));
  }
  if reserved.contains(&original)||reserved.contains(&current){return None}
  Some((original,current,reserved))
 }
 fn valid_boba_target(next:BobaVariant)->bool{
  crate::inventory_source::supported_boba_base(next)
 }
 pub fn inventory_boba_variants(&self,id:u32)->Vec<BobaVariant>{
  let Some((_,current,reserved))=self.boba_context(id)else{return Vec::new()};
  let mut out=Vec::new();
  for &[color,flavor,milk] in crate::inventory_source::BOBA_SOURCE_TRIPLES{
   for pearls in crate::inventory_source::BOBA_PEARLS{
    for sweet in crate::inventory_source::BOBA_SWEETNESS{
     let next=[color,flavor,pearls,milk,sweet];
     if next!=current&&!reserved.contains(&next){out.push(next)}
    }
   }
  }
  out
 }
 // Missing chef stacks share the same source/identity gates as additional
 // variants, but have no existing player payload to copy.
 fn absent_chef_allowed(&self,item:i32)->bool{
  crate::inventory_source::is_uncapped_required_unique_stack(item)&&
   (item!=crate::inventory_source::BOBA_ID||self.inventory_item_rows.get(&item).copied().unwrap_or(0)<256)&&
   self.slot.index.inventory.iter().filter(|r|r.item_id==Some(item)).all(|r|
    self.unique_quantity_ids.contains(&r.id)&&self.inventory_can_empty(r)&&
    self.inventory_changes.get(&r.id).copied().or(r.quantity)==Some(0))&&
   self.absent_flower_budget_available()&&self.inventory_creation_payload_safe(item)&&
   !self.slot.index.inventory_item_refs.iter().any(|&(i,_)|i==item)
 }
 fn boba_starter_choices(&self)->Vec<BobaVariant>{
  use crate::inventory_source as src;
  if !self.absent_chef_allowed(src::BOBA_ID)||self.boba_family_count()>=256||
   self.pending_bobas.keys().any(|id|self.inventory_changes.contains_key(id)){return Vec::new()}
  let mut reserved=HashSet::new();
  for row in self.slot.index.inventory.iter().filter(|r|r.item_id==Some(src::BOBA_ID)){
   let Some(v)=Self::boba_words(&self.slot.envelope.decoded,row)else{return Vec::new()};
   reserved.insert(v);reserved.insert(self.boba_variant_changes.get(&row.id).copied().unwrap_or(v));
  }
  let mut out=Vec::new();
  for &[color,flavor,milk] in src::BOBA_SOURCE_TRIPLES{
   for pearls in src::BOBA_PEARLS{
    for sweet in src::BOBA_SWEETNESS{
     let next=[color,flavor,pearls,milk,sweet];
     if !reserved.contains(&next){out.push(next)}
    }
   }
  }
  out
 }
 pub fn inventory_absent_boba_default(&self)->Option<(i32,BobaVariant)>{
  use crate::inventory_source as src;
  Some((src::BOBA_ID,*self.boba_starter_choices().first()?))
 }
 fn absent_boba_default(&self,id:u32)->Option<BobaVariant>{
  let (item,v)=self.inventory_absent_boba_default()?;
  (id==(PENDING_ITEM|item as u32)&&!self.pending_bobas.contains_key(&id)).then_some(v)
 }
 pub fn inventory_boba_creation_variants(&self,id:u32)->Vec<BobaVariant>{
  if id==(PENDING_ITEM|crate::inventory_source::BOBA_ID as u32)&&!self.pending_bobas.contains_key(&id){
   return self.boba_starter_choices()
  }
  let Some((original,_,_))=self.boba_context(id)else{return Vec::new()};
  let item=crate::inventory_source::BOBA_ID;
  let quantity=self.inventory_changes.get(&id).copied().or_else(||self.slot.index.inventory.iter().find(|r|r.id==id).and_then(|r|r.quantity));
  if !quantity.is_some_and(|q|q>0)||self.boba_family_count()>=256||!self.absent_flower_budget_available()||
   !self.inventory_creation_payload_safe(item)||self.slot.index.inventory_item_refs.iter().any(|&(i,_)|i==item){return Vec::new()}
  self.inventory_boba_variants(id).into_iter().filter(|&v|v!=original).collect()
 }
 pub fn create_inventory_boba_variant(&mut self,source_id:u32,expected:BobaVariant,next:BobaVariant,quantity:i32)->Result<u32,Error>{
  if quantity<=0||!self.inventory_boba_creation_variants(source_id).contains(&next){return Err(Error::Schema)}
  if let Some(default)=self.absent_boba_default(source_id){
   if expected!=default{return Err(Error::Schema)}
  }else{
   let (_,current,_)=self.boba_context(source_id).ok_or(Error::Schema)?;
   if current!=expected{return Err(Error::Schema)}
  }
  let document_id=self.allocate_staged_unique_handle()?;let revision=self.next_edit_revision()?;
  let change=Change::BobaCreated{document_id,source_id,expected,variant:next,quantity};
  self.restore_change(&change,false);self.undo.push(change);
  self.redo.retain(|c|c.scope()!=HistoryScope::Inventory);self.revision=revision;Ok(document_id)
 }
 pub fn change_inventory_boba_variant(&mut self,id:u32,expected:BobaVariant,next:BobaVariant)->Result<(),Error>{
  let (original,current,reserved)=self.boba_context(id).ok_or(Error::Schema)?;
  if expected!=current||next==current||!Self::valid_boba_target(next)||reserved.contains(&next){return Err(Error::Schema)}
  let revision=self.next_edit_revision()?;
  let before=self.boba_variant_changes.get(&id).copied();let after=(next!=original).then_some(next);
  if let Some(v)=after{self.boba_variant_changes.insert(id,v);}else{self.boba_variant_changes.remove(&id);}
  self.undo.push(Change::BobaVariant{document_id:id,before,after});
  if self.undo.len()>MAX_UNDO{self.undo.remove(0);}
  self.redo.retain(|c|c.scope()!=HistoryScope::Inventory);self.revision=revision;Ok(())
 }
 fn cafe_count(v:CafeVariant)->usize{v[..3].iter().take_while(|&&n|n>0).count()}
 fn cafe_appearance(v:CafeVariant)->InventoryUniqueData{
  InventoryUniqueData::CafeAppearance{count:Self::cafe_count(v) as u8,colors:[v[3],v[4],v[5]]}
 }
 fn cafe_words(raw:&[u8],row:&crate::native::InventoryRow)->Option<CafeVariant>{
  let item=row.item_id?;
  if !matches!(row.unique_data,Some(InventoryUniqueData::CafeAppearance{..}))||row.unique_fields.len()!=2{return None}
  let mut words=[0;6];let mut count=0;
  for (i,span) in row.unique_fields.iter().enumerate(){
   let data=raw.get(span.clone())?;let mut cursor=Cursor::new(data);
   let n=cursor.array().ok()?;
   if i==0{count=n}
   if n!=count||!crate::inventory_source::cafe_count_allowed(item,n){return None}
   for j in 0..n{words[i*3+j]=cursor.int(1,i32::MAX as i128).ok()? as i32;}
   if cursor.pos!=data.len(){return None}
  }
  Some(words)
 }
 fn original_cafe_variant(&self,id:u32)->Option<CafeVariant>{
  self.pending_cafes.get(&id).map(|&(_,v)|v).or_else(||Self::cafe_words(&self.slot.envelope.decoded,self.slot.index.inventory.iter().find(|r|r.id==id)?))
 }
 fn valid_cafe_saved(item:i32,v:CafeVariant)->bool{
  let n=Self::cafe_count(v);
  crate::inventory_source::cafe_count_allowed(item,n)&&(0..3).all(|i|
   if i<n{v[i]>0&&crate::inventory_source::is_chef_color(v[i+3])}else{v[i]==0&&v[i+3]==0})
 }
 fn valid_cafe_original(item:i32,v:CafeVariant)->bool{
  let n=Self::cafe_count(v);
  if !Self::valid_cafe_saved(item,v){return false}
  (0..3).all(|i|if i>=n{v[i]==0&&v[i+3]==0}
   else if item==crate::inventory_source::NIGIRI_ID&&i==1{
    crate::inventory_source::NIGIRI_SIDES.iter().any(|&(_,f,c)|(f,c)==(v[i],v[i+3]))
   }else{crate::inventory_source::cafe_pair_allowed(item,v[i],v[i+3])})
 }
 // A source-defined ordinary ingredient with a complete, positive, original
 // bag row is an additional witness for the existing player's edit context.
 // Original ownership, not transient quantity, keeps undo/replay deterministic.
 fn owned_cafe_ingredient(&self,item:i32)->bool{
  self.ordinary_quantity_limit_for_cafe(item)&&self.slot.index.inventory.iter().any(|r|
   r.item_id==Some(item)&&r.quantity.is_some_and(|q|q>0)&&r.unique_id==Some(0)&&r.unique_is_nil==Some(true)&&
   r.fields.iter().all(Option::is_some))
 }
 fn ordinary_quantity_limit_for_cafe(&self,item:i32)->bool{
  self.slot.envelope.version==Version::V301&&crate::inventory_source::ordinary_quantity_limit(item).is_some()&&
   self.inventory_item_rows.get(&item)==Some(&1)&&!self.slot.index.inventory_item_refs_incomplete&&
   !self.slot.index.inventory_item_refs.contains(&(item,0))
 }
 fn cafe_slot_choices(&self,item:i32,slot:usize)->Vec<(i32,i32,i32)>{
  use crate::inventory_source as src;
  if item==src::NIGIRI_ID&&slot==1{
   let mut out=vec![(0,0,0)];
   out.extend(src::NIGIRI_SIDES.iter().copied().filter(|&(id,_,_)|self.owned_cafe_ingredient(id)));
   return out
  }
  src::CAFE_INGREDIENT_WITNESSES.iter().copied().filter(|&(id,f,c)|
   src::cafe_pair_allowed(item,f,c)&&(src::ordinary_membership_item(id)||src::ordinary_bag_creation_item(id)||self.owned_cafe_ingredient(id))).collect()
 }
 pub fn inventory_cafe_witnesses(&self)->&'static [(i32,i32,i32)]{
  if self.slot.envelope.version==Version::V301{crate::inventory_source::CAFE_INGREDIENT_WITNESSES}else{&[]}
 }
 pub fn inventory_cafe_rows(&self)->impl Iterator<Item=(u32,CafeVariant,bool)>+'_{
  self.slot.index.inventory.iter().filter_map(move |r|{
   if self.slot.envelope.version!=Version::V301{return None}
   let item=r.item_id?;let original=Self::cafe_words(&self.slot.envelope.decoded,r)?;
   let editable=self.unique_quantity_ids.contains(&r.id)&&Self::valid_cafe_saved(item,original);
   Some((r.id,self.cafe_variant_changes.get(&r.id).copied().unwrap_or(original),editable))
  }).chain(self.pending_cafes.iter().filter(|(id,_)|self.inventory_changes.contains_key(*id)).map(|(&id,&(_,v))|
   (id,self.cafe_variant_changes.get(&id).copied().unwrap_or(v),true)))
 }
 fn cafe_context(&self,id:u32)->Option<(i32,CafeVariant,CafeVariant,HashSet<CafeVariant>)>{
  let item=if let Some(&(item,_))=self.pending_cafes.get(&id){
   if !self.inventory_changes.contains_key(&id){return None}
   item
  }else{
   if !self.unique_quantity_ids.contains(&id){return None}
   self.slot.index.inventory.iter().find(|r|r.id==id)?.item_id?
  };
  let original=self.original_cafe_variant(id)?;
  if !Self::valid_cafe_saved(item,original){return None}
  let current=self.cafe_variant_changes.get(&id).copied().unwrap_or(original);
  let mut reserved=HashSet::new();
  for other in &self.slot.index.inventory{
   if other.id==id||other.item_id!=Some(item){continue}
   let (flavors,colors)=self.chef_identity(other)?;
   if flavors.len()!=colors.len()||!crate::inventory_source::cafe_count_allowed(item,flavors.len()){continue}
   // Complete keys that cannot be represented by the positive paired editor
   // cannot collide with its targets. Preserve their original bytes.
   let Some(v)=Self::cafe_words(&self.slot.envelope.decoded,other)else{continue};
   reserved.insert(v);reserved.insert(self.cafe_variant_changes.get(&other.id).copied().unwrap_or(v));
  }
  for (&other,&(other_item,v)) in &self.pending_cafes{
   if other==id||other_item!=item||!self.inventory_changes.contains_key(&other){continue}
   reserved.insert(v);reserved.insert(self.cafe_variant_changes.get(&other).copied().unwrap_or(v));
  }
  if reserved.contains(&original)||reserved.contains(&current){return None}
  Some((item,original,current,reserved))
 }
 fn valid_cafe_target(&self,item:i32,original:CafeVariant,next:CafeVariant)->bool{
  if !Self::valid_cafe_saved(item,next){return false}
  let n=Self::cafe_count(next);
  (0..n).all(|i|(next[i],next[i+3])==(original[i],original[i+3])||
   self.cafe_slot_choices(item,i).iter().any(|&(_,f,c)|(f,c)==(next[i],next[i+3])))
 }
 fn valid_cafe_creation(&self,item:i32,next:CafeVariant)->bool{
  Self::valid_cafe_original(item,next)&&(0..Self::cafe_count(next)).all(|i|
   self.cafe_slot_choices(item,i).iter().any(|&(_,f,c)|(f,c)==(next[i],next[i+3])))
 }
 /// Native-authorized choices, including the optional nigiri side. A zero
 /// pair in its final slot represents removal, not a serialized zero entry.
 pub fn inventory_cafe_variants(&self,id:u32)->Vec<(CafeVariant,i32,usize)>{
  let Some((item,original,current,reserved))=self.cafe_context(id)else{return Vec::new()};
  self.cafe_choices(item,original,current,&reserved)
 }
 fn cafe_choices(&self,item:i32,original:CafeVariant,current:CafeVariant,reserved:&HashSet<CafeVariant>)->Vec<(CafeVariant,i32,usize)>{
  // The current draft is already CAS-validated; each candidate changes one
  // slot to an issued source pair or that slot's exact original pair.
  let mut out=Vec::new();let mut seen=HashSet::new();
  let slots=if item==crate::inventory_source::NIGIRI_ID{2}else{crate::inventory_source::cafe_slot_count(item).unwrap_or(0)};
  for i in 0..slots{
   for (ingredient,flavor,color) in self.cafe_slot_choices(item,i){
    let mut next=current;next[i]=flavor;next[i+3]=color;
    if next!=current&&Self::valid_cafe_saved(item,next)&&!reserved.contains(&next)&&seen.insert(next){out.push((next,ingredient,i))}
   }
   let mut next=current;next[i]=original[i];next[i+3]=original[i+3];
   if next!=current&&Self::valid_cafe_saved(item,next)&&!reserved.contains(&next)&&seen.insert(next){out.push((next,0,i))}
  }
  out
 }
 fn cafe_creation_context(&self,id:u32)->Option<(i32,CafeVariant,CafeVariant,HashSet<CafeVariant>)>{
  let context=self.cafe_context(id)?;
  let item=context.0;
  let quantity=self.inventory_changes.get(&id).copied().or_else(||self.slot.index.inventory.iter().find(|r|r.id==id).and_then(|r|r.quantity));
  if !quantity.is_some_and(|q|q>0)||!self.absent_flower_budget_available()||!self.inventory_creation_payload_safe(item)||
   self.slot.index.inventory_item_refs.iter().any(|&(i,_)|i==item){return None}
  Some(context)
 }
 fn cafe_starter_reservations(&self,item:i32)->Option<HashSet<CafeVariant>>{
  if !self.absent_chef_allowed(item)||
   self.pending_cafes.iter().any(|(&id,&(i,_))|i==item&&self.inventory_changes.contains_key(&id)){return None}
  let mut reserved=HashSet::new();
  for row in self.slot.index.inventory.iter().filter(|r|r.item_id==Some(item)){
   // Exact complete unequal-length keys cannot collide with generated tuples.
   let (flavors,colors)=self.chef_identity(row)?;
   if flavors.len()!=colors.len()||!crate::inventory_source::cafe_count_allowed(item,flavors.len()){continue}
   let Some(v)=Self::cafe_words(&self.slot.envelope.decoded,row)else{continue};
   reserved.insert(v);reserved.insert(self.cafe_variant_changes.get(&row.id).copied().unwrap_or(v));
  }
  Some(reserved)
 }
 fn cafe_starter(&self,item:i32,reserved:&HashSet<CafeVariant>)->Option<CafeVariant>{
  let count=crate::inventory_source::cafe_slot_count(item)?;
  let slots=if item==crate::inventory_source::NIGIRI_ID{2}else{count};
  let choices:Vec<Vec<(i32,i32)>>=(0..3).map(|i|{
   if i>=slots{return vec![(0,0)]}
   let mut seen=HashSet::new();
   self.cafe_slot_choices(item,i).into_iter().filter_map(|(_,f,c)|seen.insert((f,c)).then_some((f,c))).collect()
  }).collect();
  // With deduplicated source pairs, every candidate is distinct. At most
  // the bounded reservation count can collide before an unused tuple.
  for &(a,x) in &choices[0]{for &(b,y) in &choices[1]{for &(c,z) in &choices[2]{
   let v=[a,b,c,x,y,z];
   if !reserved.contains(&v)&&self.valid_cafe_creation(item,v){return Some(v)}
  }}}
  None
 }
 fn absent_cafe_starter(&self,item:i32)->Option<CafeVariant>{
  self.cafe_starter(item,&self.cafe_starter_reservations(item)?)
 }
 pub fn inventory_absent_cafe_defaults(&self)->Vec<(i32,CafeVariant)>{
  crate::inventory_source::CAFE_IDS.iter().filter_map(|&item|
   self.absent_cafe_starter(item).map(|v|(item,v))).collect()
 }
 fn absent_cafe_context(&self,id:u32)->Option<(i32,CafeVariant,HashSet<CafeVariant>)>{
  if id&PENDING_ITEM==0||self.pending_cafes.contains_key(&id){return None}
  let item=(id&!PENDING_ITEM) as i32;
  let reserved=self.cafe_starter_reservations(item)?;
  Some((item,self.cafe_starter(item,&reserved)?,reserved))
 }
 pub fn inventory_cafe_creation_variants(&self,id:u32)->Vec<(CafeVariant,i32,usize)>{
  if let Some((item,starter,reserved))=self.absent_cafe_context(id){
   return self.cafe_choices(item,starter,starter,&reserved).into_iter()
    .filter(|&(v,_,_)|self.valid_cafe_creation(item,v)).collect()
  }
  let Some((item,original,current,_))=self.cafe_creation_context(id)else{return Vec::new()};
  self.inventory_cafe_variants(id).into_iter().filter(|&(v,_,_)|
   v!=original&&v!=current&&self.valid_cafe_creation(item,v)).collect()
 }
 fn cafe_creation_item(&self,id:u32,expected:CafeVariant,next:CafeVariant)->Option<i32>{
  if let Some((item,starter,reserved))=self.absent_cafe_context(id){
   return (expected==starter&&!reserved.contains(&next)&&self.valid_cafe_creation(item,next)).then_some(item)
  }
  let (item,original,current,reserved)=self.cafe_creation_context(id)?;
  (current==expected&&next!=current&&next!=original&&!reserved.contains(&next)&&self.valid_cafe_creation(item,next)).then_some(item)
 }
 /// Recompute full-tuple choices from a read-only dialog draft.
 pub fn inventory_cafe_preview(&self,id:u32,expected:CafeVariant,draft:CafeVariant)->Result<(Vec<(CafeVariant,i32,usize)>,bool),Error>{
  if let Some((item,starter,reserved))=self.absent_cafe_context(id){
   if expected!=starter||reserved.contains(&draft)||!self.valid_cafe_creation(item,draft){return Err(Error::Schema)}
   return Ok((self.cafe_choices(item,starter,draft,&reserved).into_iter()
    .filter(|&(v,_,_)|self.valid_cafe_creation(item,v)).collect(),true))
  }
  let (item,original,current,reserved)=self.cafe_context(id).ok_or(Error::Schema)?;
  if expected!=current||reserved.contains(&draft)||!self.valid_cafe_target(item,original,draft){return Err(Error::Schema)}
  let creatable=self.cafe_creation_item(id,expected,draft).is_some();
  Ok((self.cafe_choices(item,original,draft,&reserved),creatable))
 }
 pub fn create_inventory_cafe_variant(&mut self,source_id:u32,expected:CafeVariant,next:CafeVariant,quantity:i32)->Result<u32,Error>{
  if quantity<=0{return Err(Error::Schema)}
  let item=self.cafe_creation_item(source_id,expected,next).ok_or(Error::Schema)?;
  let document_id=self.allocate_staged_unique_handle()?;let revision=self.next_edit_revision()?;
  let change=Change::CafeCreated{document_id,source_id,item_id:item,expected,variant:next,quantity};
  self.restore_change(&change,false);self.undo.push(change);
  self.redo.retain(|c|c.scope()!=HistoryScope::Inventory);self.revision=revision;Ok(document_id)
 }
 pub fn change_inventory_cafe_variant(&mut self,id:u32,expected:CafeVariant,next:CafeVariant)->Result<(),Error>{
  let (item,original,current,reserved)=self.cafe_context(id).ok_or(Error::Schema)?;
  if expected!=current||next==current||!self.valid_cafe_target(item,original,next)||reserved.contains(&next){return Err(Error::Schema)}
  let revision=self.next_edit_revision()?;
  let before=self.cafe_variant_changes.get(&id).copied();let after=(next!=original).then_some(next);
  if let Some(v)=after{self.cafe_variant_changes.insert(id,v);}else{self.cafe_variant_changes.remove(&id);}
  self.undo.push(Change::CafeVariant{document_id:id,before,after});
  if self.undo.len()>MAX_UNDO{self.undo.remove(0);}
  self.redo.retain(|c|c.scope()!=HistoryScope::Inventory);self.revision=revision;Ok(())
 }
 // Native Palette.Equals compares each of three RGBA colors using
 // binary32 squared distance < 0x2edbe6fe, not bit equality. A
 // malformed peer must block the family; keep all source words intact.
 fn palette_identity(row:&crate::native::InventoryRow)->Option<[[u32;4];3]>{
  use crate::inventory_source::{CUSTOM_PALETTE_ID,is_uncapped_required_unique_stack};
  if row.item_id!=Some(CUSTOM_PALETTE_ID)||!is_uncapped_required_unique_stack(CUSTOM_PALETTE_ID)||row.unique_fields.len()!=3{return None}
  let InventoryUniqueData::Palette{rgba_bits}=row.unique_data? else{return None};
  rgba_bits.iter().flatten().all(|&bits|(0.0..=1.0).contains(&f32::from_bits(bits))).then_some(rgba_bits)
 }
 // A palette may be copied into an avatar snapshot or wand instead of
 // referenced by Item ID/UID. Compare the original full RGBA tuple using
 // native approximate equality, with a complete original context only.
 fn palette_zero_reference_safe(&self,row:&crate::native::InventoryRow)->bool{
  let Some(original)=Self::palette_identity(row)else{return false};
  let index=&self.slot.index;
  index.inventory_palette_avatar_models>0&&index.inventory_palette_general_models==1&&
   !index.inventory_palette_context_incomplete&&!index.inventory_palette_copies_incomplete&&
   !index.inventory_payload_refs_incomplete&&!index.inventory_item_refs_incomplete&&
   !index.inventory_palette_copies.iter().any(|&copy|Self::palette_equal(copy,original))
 }
 fn palette_equal(a:[[u32;4];3],b:[[u32;4];3])->bool{
  a.iter().zip(b).all(|(a,b)|{
   let square=|i:usize|{let d=f32::from_bits(a[i])-f32::from_bits(b[i]);d*d};
   ((square(0)+square(1))+square(2))+square(3)<f32::from_bits(0x2edbe6fe)
  })
 }
 // Source-limited initial endpoint: ordinary base flower colors and white
 // additives only. Black/Gray are event-restricted in FlowerSettings.
 fn palette_output_choices()->impl Iterator<Item=[u32;4]>{
  FLOWER_COLORS.iter().copied().flat_map(|color|[0,3,4].into_iter()
   .filter_map(move |slot|crate::inventory_palette_source::palette_output_color(color,slot)))
 }
 fn original_palette_variant(&self,id:u32)->Option<PaletteVariant>{
  self.pending_palettes.get(&id).copied().or_else(||Self::palette_identity(self.slot.index.inventory.iter().find(|r|r.id==id)?))
 }
 fn palette_context(&self,id:u32)->Option<(PaletteVariant,PaletteVariant,Vec<PaletteVariant>)>{
  if self.slot.index.inventory_palette_copies_incomplete{return None}
  if self.pending_palettes.contains_key(&id){
   if !self.inventory_changes.contains_key(&id){return None}
  }else if !self.unique_quantity_ids.contains(&id){return None}
  let original=self.original_palette_variant(id)?;
  let current=self.palette_variant_changes.get(&id).copied().unwrap_or(original);
  let mut reserved=self.slot.index.inventory_palette_copies.clone();
  for other in &self.slot.index.inventory{
   if other.id==id||other.item_id!=Some(crate::inventory_source::CUSTOM_PALETTE_ID){continue}
   let original=Self::palette_identity(other)?;
   reserved.push(original);
   reserved.push(self.palette_variant_changes.get(&other.id).copied().unwrap_or(original));
  }
  for (&other,&v) in &self.pending_palettes{
   if other==id||!self.inventory_changes.contains_key(&other){continue}
   reserved.push(v);reserved.push(self.palette_variant_changes.get(&other).copied().unwrap_or(v));
  }
  if reserved.iter().any(|&peer|Self::palette_equal(peer,original)||Self::palette_equal(peer,current)){return None}
  Some((original,current,reserved))
 }
 fn valid_palette_target(original:PaletteVariant,target:PaletteVariant)->bool{
  target.iter().enumerate().all(|(i,&color)|color==original[i]||Self::palette_output_choices().any(|c|c==color))
 }
 pub fn inventory_palette_edit_hints(&self)->impl Iterator<Item=u32>+'_{
  self.slot.index.inventory.iter().filter_map(move |r|{
   if !self.unique_quantity_ids.contains(&r.id)||self.slot.index.inventory_palette_copies_incomplete{return None}
   let original=Self::palette_identity(r)?;
   (!self.slot.index.inventory_palette_copies.iter().any(|&p|Self::palette_equal(p,original))).then_some(r.id)
  }).chain(self.pending_palettes.keys().copied().filter(|id|self.inventory_changes.contains_key(id)))
 }
 /// Native one-color choices; complete targets also support atomic net replay.
 pub fn inventory_palette_variants(&self,id:u32)->Vec<PaletteVariant>{
  let Some((original,current,reserved))=self.palette_context(id)else{return Vec::new()};
  Self::palette_choices(original,current,&reserved)
 }
 fn palette_choices(original:PaletteVariant,current:PaletteVariant,reserved:&[PaletteVariant])->Vec<PaletteVariant>{
  let mut out=Vec::new();
  for i in 0..3{
   for color in std::iter::once(original[i]).chain(Self::palette_output_choices()){
    let mut next=current;next[i]=color;
    if Self::palette_equal(current,next)||reserved.iter().any(|&p|Self::palette_equal(p,next))||out.contains(&next){continue}
    out.push(next);
   }
  }
  out
 }
 // Additional palettes only from already owned, eligible source rows.
 // Every new channel must be a permitted native output, not an inherited
 // arbitrary or event-only color. No acquisition or outfit data is written.
 fn palette_creation_context(&self,id:u32)->Option<(PaletteVariant,PaletteVariant,Vec<PaletteVariant>)>{
  let quantity=self.inventory_changes.get(&id).copied().or_else(||self.slot.index.inventory.iter().find(|r|r.id==id).and_then(|r|r.quantity));
  if !quantity.is_some_and(|q|q>0){return None}
  let item=crate::inventory_source::CUSTOM_PALETTE_ID;
  if !self.absent_flower_budget_available()||!self.inventory_creation_payload_safe(item)||
   self.slot.index.inventory_item_refs.iter().any(|&(i,_)|i==item)||
   self.inventory_item_rows.get(&item).copied().unwrap_or(0)+self.pending_palettes.len()>=256{return None}
  self.palette_context(id)
 }
 // A native source-defined starter is independent of a positive saved
 // witness. Retain zero documents and reserve both their native identities.
 fn palette_starter_reservations(&self)->Option<Vec<PaletteVariant>>{
  let item=crate::inventory_source::CUSTOM_PALETTE_ID;
  let index=&self.slot.index;
  if !crate::inventory_source::is_uncapped_required_unique_stack(item)||
   self.inventory_item_rows.get(&item).copied().unwrap_or(0)+self.pending_palettes.len()>=256||
   self.pending_palettes.keys().any(|id|self.inventory_changes.contains_key(id))||
   index.inventory_palette_context_incomplete||index.inventory_palette_copies_incomplete||
   !self.absent_flower_budget_available()||!self.inventory_creation_payload_safe(item)||
   index.inventory_item_refs.iter().any(|&(i,_)|i==item){return None}
  let mut reserved=index.inventory_palette_copies.clone();
  for row in index.inventory.iter().filter(|r|r.item_id==Some(item)){
   if !self.unique_quantity_ids.contains(&row.id)||!self.palette_zero_reference_safe(row)||
    self.inventory_changes.get(&row.id).copied().or(row.quantity)!=Some(0){return None}
   let original=Self::palette_identity(row)?;
   reserved.push(original);
   reserved.push(self.palette_variant_changes.get(&row.id).copied().unwrap_or(original));
  }
  Some(reserved)
 }
 fn palette_starter(reserved:&[PaletteVariant])->Option<PaletteVariant>{
  Self::palette_output_choices().map(|color|[color;3])
   .find(|&v|!reserved.iter().any(|&p|Self::palette_equal(p,v)))
 }
 /// Offer a source-defined starter when no positive palette remains.
 pub fn inventory_absent_palette_default(&self)->Option<(i32,PaletteVariant)>{
  let reserved=self.palette_starter_reservations()?;
  Some((crate::inventory_source::CUSTOM_PALETTE_ID,Self::palette_starter(&reserved)?))
 }
 fn absent_palette_context(&self,id:u32)->Option<(PaletteVariant,Vec<PaletteVariant>)>{
  if id!=PENDING_ITEM|crate::inventory_source::CUSTOM_PALETTE_ID as u32||self.pending_palettes.contains_key(&id){return None}
  let reserved=self.palette_starter_reservations()?;
  Some((Self::palette_starter(&reserved)?,reserved))
 }
 fn absent_palette_target(reserved:&[PaletteVariant],next:PaletteVariant)->bool{
  !reserved.iter().any(|&p|Self::palette_equal(p,next))&&
   next.iter().all(|&c|Self::palette_output_choices().any(|x|x==c))
 }
 pub fn inventory_palette_creation_variants(&self,id:u32)->Vec<PaletteVariant>{
  if let Some((default,reserved))=self.absent_palette_context(id){
   return Self::palette_choices(default,default,&reserved)
  }
  let Some((original,current,_))=self.palette_creation_context(id)else{return Vec::new()};
  self.inventory_palette_variants(id).into_iter().filter(|v|
   !Self::palette_equal(*v,original)&&!Self::palette_equal(*v,current)&&
   v.iter().all(|&c|Self::palette_output_choices().any(|x|x==c))).collect()
 }
 fn palette_creation_target(original:PaletteVariant,current:PaletteVariant,reserved:&[PaletteVariant],next:PaletteVariant)->bool{
  !Self::palette_equal(next,original)&&!Self::palette_equal(next,current)&&
   !reserved.iter().any(|&p|Self::palette_equal(p,next))&&
   next.iter().all(|&c|Self::palette_output_choices().any(|x|x==c))
 }
 /// Read-only native draft planning; identical final eligibility to creation CAS.
 pub fn inventory_palette_preview(&self,id:u32,expected:PaletteVariant,draft:PaletteVariant)->Result<(Vec<PaletteVariant>,bool),Error>{
  if let Some((default,reserved))=self.absent_palette_context(id){
   if expected!=default||!Self::absent_palette_target(&reserved,draft){return Err(Error::Schema)}
   return Ok((Self::palette_choices(default,draft,&reserved),true))
  }
  let (original,current,reserved)=self.palette_context(id).ok_or(Error::Schema)?;
  if expected!=current||!Self::valid_palette_target(original,draft)||reserved.iter().any(|&p|Self::palette_equal(p,draft)){return Err(Error::Schema)}
  let creatable=self.palette_creation_context(id).is_some()&&Self::palette_creation_target(original,current,&reserved,draft);
  Ok((Self::palette_choices(original,draft,&reserved),creatable))
 }
 pub fn create_inventory_palette_variant(&mut self,source_id:u32,expected:PaletteVariant,next:PaletteVariant,quantity:i32)->Result<u32,Error>{
  if quantity<=0{return Err(Error::Schema)}
  if let Some((default,reserved))=self.absent_palette_context(source_id){
   if expected!=default||!Self::absent_palette_target(&reserved,next){return Err(Error::Schema)}
  }else{
   let (original,current,reserved)=self.palette_creation_context(source_id).ok_or(Error::Schema)?;
   if expected!=current||!Self::palette_creation_target(original,current,&reserved,next){return Err(Error::Schema)}
  }
  let document_id=self.allocate_staged_unique_handle()?;
  let revision=self.next_edit_revision()?;
  let change=Change::PaletteCreated{document_id,source_id,expected,variant:next,quantity};
  self.restore_change(&change,false);self.undo.push(change);
  self.redo.retain(|c|c.scope()!=HistoryScope::Inventory);self.revision=revision;Ok(document_id)
 }
 pub fn change_inventory_palette_variant(&mut self,id:u32,expected:PaletteVariant,next:PaletteVariant)->Result<(),Error>{
  let (original,current,reserved)=self.palette_context(id).ok_or(Error::Schema)?;
  if current!=expected||Self::palette_equal(current,next)||!Self::valid_palette_target(original,next)||
   reserved.iter().any(|&p|Self::palette_equal(p,next)){return Err(Error::Schema)}
  let revision=self.next_edit_revision()?;
  let before=self.palette_variant_changes.get(&id).copied();
  let after=(next!=original).then_some(next);
  if let Some(v)=after{self.palette_variant_changes.insert(id,v);}else{self.palette_variant_changes.remove(&id);}
  self.undo.push(Change::PaletteVariant{document_id:id,before,after});
  if self.undo.len()>MAX_UNDO{self.undo.remove(0);}
  self.redo.retain(|c|c.scope()!=HistoryScope::Inventory);self.revision=revision;Ok(())
 }
 fn index_unique_quantity_ids(&self)->HashSet<u32>{
  if self.slot.envelope.version!=Version::V301||self.slot.index.inventory_payload_refs_incomplete{return HashSet::new()}
  let mut uid_counts=HashMap::<i32,usize>::new();
  let mut variant_counts=HashMap::<(i32,FlowerVariant),usize>::new();
  let mut furniture_counts=HashMap::<(i32,FurnitureVariant),usize>::new();
  let mut chef_counts=HashMap::<(i32,Vec<i32>,Vec<i32>),usize>::new();
  let mut wand_counts=HashMap::<(i32,WandData),usize>::new();
  let mut palette_peers=Vec::new();
  let mut palette_conflicts=HashSet::new();
  let mut ambiguous=HashSet::new();
  for row in &self.slot.index.inventory{
   if let Some(uid)=row.unique_id{*uid_counts.entry(uid).or_default()+=1}
   let Some(item)=row.item_id else{return HashSet::new()};
   if let Some(source)=furniture_source::item(item).filter(|s|!s.is_home_layout){
    let key=if row.unique_is_nil==Some(true){furniture_key(source,[0;3])}
     else{row.unique_data.and_then(furniture_variant)
     .or_else(||Self::legacy_furniture_materials(&self.slot.envelope.decoded,row)).and_then(|v|furniture_key(source,v))};
    match key{Some(v)=>{*furniture_counts.entry((item,v)).or_default()+=1;},None=>{ambiguous.insert(item);}}
   }
   if item==crate::inventory_source::CUSTOM_PALETTE_ID{
    // Approximate equality is not transitive and cannot use a hash key.
    // Bound pairwise work even for hostile or unusually large save files.
    if palette_peers.len()>=256{ambiguous.insert(item);}
    else if let Some(key)=Self::palette_identity(row){
     for &(other,peer) in &palette_peers{if Self::palette_equal(key,peer){palette_conflicts.insert(other);palette_conflicts.insert(row.id);}}
     palette_peers.push((row.id,key));
    }else{ambiguous.insert(item);}
   }
   if crate::inventory_source::CAFE_IDS.binary_search(&item).is_ok()||item==crate::inventory_source::BOBA_ID{
    match self.chef_identity(row){Some((a,b))=>{*chef_counts.entry((item,a,b)).or_default()+=1;},None=>{ambiguous.insert(item);}}
   }
   if crate::inventory_source::wand_output_item(item){
    match self.saved_wand_identity(row).and_then(|v|Self::wand_key(item,v)){Some(v)=>{*wand_counts.entry((item,v)).or_default()+=1;},None=>{ambiguous.insert(item);}}
   }
   if !Self::is_flower_quantity_definition(item){continue}
   let Some(v)=row.unique_data.and_then(flower_variant)
    .or_else(||Self::legacy_flower_variant(&self.slot.envelope.decoded,row))else{ambiguous.insert(item);continue};
   if !(0..=7).contains(&v[0])||!(1..=30).contains(&v[1])||!(0..=16).contains(&v[2])||!(0..=30).contains(&v[3]){
    ambiguous.insert(item);continue
   }
   *variant_counts.entry((item,v)).or_default()+=1;
  }
  self.slot.index.inventory.iter().filter_map(|row|{
   let item=row.item_id?;let uid=row.unique_id?;
   if uid_counts.get(&uid)!=Some(&1)||self.slot.index.inventory_payload_item_refs.contains(&item)||
    !row.fields.iter().all(Option::is_some){return None}
   // Distinct legacy/modern/nil peers are compared by the same source-normalized key.
   if matches!(row.unique_data,Some(InventoryUniqueData::Opaque{tag:1})){
    self.unique_row_source(row,3)?;
    self.legacy_furniture_quantity_source(row)?;
    let source=furniture_source::item(item)?;
    let key=furniture_key(source,Self::legacy_furniture_materials(&self.slot.envelope.decoded,row)?)?;
    return (!ambiguous.contains(&item)&&furniture_counts.get(&(item,key))==Some(&1)&&
     self.legacy_furniture_zero_reference_safe(item)).then_some(row.id)
   }
   if matches!(row.unique_data,Some(InventoryUniqueData::Opaque{tag:5})){
    self.unique_row_source(row,5)?;
    let key=Self::wand_key(item,self.legacy_wand_identity(row)?)?;
    return (!ambiguous.contains(&item)&&wand_counts.get(&(item,key))==Some(&1)&&
     crate::inventory_source::is_uncapped_required_unique_stack(item)&&self.legacy_wand_zero_reference_safe(row)).then_some(row.id)
   }
   if ambiguous.contains(&item){return None}
   if matches!(row.unique_data,Some(InventoryUniqueData::Opaque{tag:2})){
    self.unique_row_source(row,4)?;
    self.legacy_flower_source(row)?;
    let v=Self::legacy_flower_variant(&self.slot.envelope.decoded,row)?;
    return (variant_counts.get(&(item,v))==Some(&1)).then_some(row.id)
   }
   if Self::palette_identity(row).is_some(){
    self.unique_row_source(row,3)?;
    return (!palette_conflicts.contains(&row.id)).then_some(row.id)
   }
   if let Some(v)=Self::wand_identity(row).and_then(|v|Self::wand_key(item,v)){
    self.unique_row_source(row,5)?;
    return (!self.slot.index.inventory_wand_copies&&wand_counts.get(&(item,v))==Some(&1)&&
     crate::inventory_source::is_uncapped_required_unique_stack(item)).then_some(row.id)
   }
   if let Some((a,b))=self.chef_identity(row){
    self.unique_row_source(row,if item==crate::inventory_source::BOBA_ID{5}else{2})?;
    if item!=crate::inventory_source::BOBA_ID&&
     (!a.iter().all(|&n|n>0)||!b.iter().all(|&n|crate::inventory_source::is_chef_color(n))){return None}
    return (chef_counts.get(&(item,a,b))==Some(&1)).then_some(row.id)
   }
   if let Some(source)=self.furniture_source(row){
    if crate::inventory_source::ordinary_quantity_limit(item)!=Some(i32::MAX){return None}
    let key=furniture_key(source,furniture_variant(row.unique_data?)?)?;
    return (furniture_counts.get(&(item,key))==Some(&1)).then_some(row.id)
   }
   if !Self::is_flower_quantity_definition(item)||!crate::inventory_source::is_uncapped_required_unique_stack(item){return None}
   self.flower_source(row)?;
   let v=flower_variant(row.unique_data?)?;
   // flower_source already validates state 0/6/7 for species, and
   // state 6 only for the source-verified crafted clothing outputs.
   if variant_counts.get(&(item,v))!=Some(&1){return None}
   Some(row.id)
  }).collect()
 }
 fn inventory_quantity_limit(&self,r:&crate::native::InventoryRow)->Option<i32>{
  // Existing source-verified unique variants; minimum is independently gated.
  if self.unique_quantity_ids.contains(&r.id){return Some(i32::MAX)}
  if self.slot.envelope.version!=Version::V301||r.id==0||r.id>i32::MAX as u32||
   r.quantity?<0||r.unique_is_nil!=Some(true)||r.fields[2].is_none()||
   (r.quantity==Some(0)&&!self.inventory_can_empty(r)&&
    !(crate::inventory_source::ordinary_bag_definition(r.item_id?).is_some()&&r.unique_id==Some(0)&&
      r.fields.iter().all(Option::is_some)&&(self.inventory_item_rows.get(&r.item_id?)==Some(&1)||
      self.ordinary_furniture_base_distinct(r,r.item_id?)))){return None}
  let item_id=r.item_id?;
  let cap=crate::inventory_source::ordinary_quantity_limit(item_id)?;
  // A finite definition limit must not be treated as an independent cap for
  // every ambiguous saved row with the same item identity. Preserve those rows.
  if cap<i32::MAX&&self.inventory_item_rows.get(&item_id)!=Some(&1){return None}
  Some(cap)
 }
 fn inventory_creation_source_valid(&self)->bool{
  !self.slot.index.inventory_item_refs_incomplete&&self.inventory_creation_rows_valid()
 }
 fn inventory_creation_rows_valid(&self)->bool{
  self.slot.envelope.version==Version::V301&&self.slot.index.inventory.iter().all(|r|r.item_id.is_some()&&r.id<PENDING_ITEM)
 }
 fn ordinary_inventory_creation_source_valid(&self)->bool{
  !self.slot.index.inventory_item_refs_unscoped&&self.inventory_creation_rows_valid()
 }
 // Ordinary cosmetic definitions can also occur as copied outfit or placement
 // payloads without a UID reference. An absent row is not proof of absence.
 fn inventory_creation_payload_safe(&self,item_id:i32)->bool{
  !self.slot.index.inventory_payload_refs_incomplete&&
   !self.slot.index.inventory_payload_item_refs.contains(&item_id)
 }
 // The ordinary base variant is distinct from a verified nondefault tag-8
 // stack. Reuse the original identity/reference index; check both original
 // and effective materials so Undo/Redo never creates a default collision.
 fn permits_separate_ordinary_base(&self,row:&crate::native::InventoryRow)->bool{
  if !self.unique_quantity_ids.contains(&row.id){return false}
  let Some(source)=self.furniture_source(row)else{return false};
  let Some(default)=furniture_key(source,[0;3])else{return false};
  let Some(original)=self.original_furniture_variant(row.id)else{return false};
  let effective=self.furniture_variant_changes.get(&row.id).copied().unwrap_or(original);
  [original,effective].into_iter().all(|value|furniture_key(source,value).is_some_and(|key|key!=default))
 }
 // A single UID-zero nil base can coexist with distinct verified tag-8 peers.
 // Require the stricter complete item-wide reference gate for this extension.
 fn ordinary_furniture_base_zero_with_peers(&self,row:&crate::native::InventoryRow,item:i32)->bool{
  self.ordinary_bag_zero_reference_safe(item)&&self.ordinary_furniture_base_distinct(row,item)
 }
 // Identity proof is independent of last-copy removal permission. A saved
 // empty nil base can be refilled beside distinct verified nondefault peers.
 fn ordinary_furniture_base_distinct(&self,row:&crate::native::InventoryRow,item:i32)->bool{
  crate::inventory_source::ordinary_quantity_limit(item)==Some(i32::MAX)&&
   furniture_source::item(item).is_some_and(|s|!s.is_home_layout)&&
   self.slot.index.inventory.iter().filter(|r|r.item_id==Some(item)&&r.id!=row.id)
    .all(|r|self.permits_separate_ordinary_base(r))
 }
 fn can_create_inventory_item(&self,item_id:i32)->bool{
  self.ordinary_inventory_creation_source_valid()&&self.ordinary_item_reference_scope_safe(item_id)&&crate::inventory_source::ordinary_bag_creation_item(item_id)&&
   (!self.inventory_item_rows.contains_key(&item_id)||
    self.slot.index.inventory.iter().filter(|r|r.item_id==Some(item_id)).all(|r|self.permits_separate_ordinary_base(r)))&&
   self.inventory_creation_payload_safe(item_id)&&
   !self.slot.index.inventory_item_refs.iter().any(|&(item,_)|item==item_id)
 }
 fn pending_inventory_rows(&self)->Vec<InventoryEntry>{
  let mut rows:Vec<_>=self.inventory_changes.iter().filter(|(&id,_)|id&PENDING_ITEM!=0)
   .map(|(&document_id,&quantity)|{
    let item_id=self.pending_flowers.get(&document_id).map(|f|f.item_id).or_else(||self.pending_furniture.get(&document_id).map(|f|f.item_id)).or_else(||self.pending_palettes.contains_key(&document_id).then_some(crate::inventory_source::CUSTOM_PALETTE_ID)).or_else(||self.pending_bobas.contains_key(&document_id).then_some(crate::inventory_source::BOBA_ID)).or_else(||self.pending_cafes.get(&document_id).map(|&(item,_)|item)).or_else(||self.pending_wands.get(&document_id).map(|&(item,_)|item)).unwrap_or((document_id&!PENDING_ITEM) as i32);
    InventoryEntry{document_id,item_id,quantity,editable:true,
     quantity_limit:Some(crate::inventory_source::ordinary_quantity_limit(item_id).unwrap_or(i32::MAX)),quantity_minimum:0}
   }).collect();
  rows.sort_by_key(|r|(r.item_id,r.document_id));rows
 }
 // Include the other scope's redo future in the shared native ID reservation.
 fn reserved_inventory_count(&self)->usize{
  let mut handles:HashSet<u32>=self.inventory_changes.keys().filter(|&&id|id&PENDING_ITEM!=0).copied().collect();
  handles.extend(self.pending_flowers.keys().copied());
  handles.extend(self.pending_furniture.keys().copied());
  handles.extend(self.pending_palettes.keys().copied());handles.extend(self.pending_bobas.keys().copied());handles.extend(self.pending_cafes.keys().copied());handles.extend(self.pending_wands.keys().copied());
  for change in &self.redo{
   match change{
    Change::Inventory{document_id,after:Some(_),..} if document_id&PENDING_ITEM!=0=>{handles.insert(*document_id);}
    Change::InventoryBatch{deltas}=>for d in deltas{if d.document_id&PENDING_ITEM!=0&&d.after.is_some(){handles.insert(d.document_id);}},
    Change::FlowerCreated{document_id,..}|Change::FurnitureCreated{document_id,..}|Change::PaletteCreated{document_id,..}|Change::BobaCreated{document_id,..}|Change::CafeCreated{document_id,..}|Change::WandCreated{document_id,..}=>{handles.insert(*document_id);},
    _=>{}
   }
  }
  handles.len()
 }
 fn reserved_achievement_count(&self)->usize{
  self.achievement_created.len()+self.redo.iter().map(|change|match change{
   Change::AchievementCreated{before:None,after:Some(_),..}|Change::AchievementCreatedPair{..}=>1,
   Change::AchievementParentNew{child,..}=>1+usize::from(child.1&&child.2.is_none()),
   _=>0
  }).sum::<usize>()
 }
 fn preflight_inventory_membership(&self,deltas:&[InventoryQuantityDelta])->Result<(),Error>{
  if !deltas.iter().any(|d|d.document_id&PENDING_ITEM!=0){return Ok(())}
  let mut handles:HashSet<u32>=self.inventory_changes.keys().filter(|&&id|id&PENDING_ITEM!=0).copied().collect();
  for d in deltas{
   if d.document_id&PENDING_ITEM!=0{
    if d.after.is_some(){handles.insert(d.document_id);}else{handles.remove(&d.document_id);}
   }
  }
  let count=handles.len()+self.reserved_achievement_count();
  if count>0{crate::document_membership::allocate_ids(&self.slot.index,count)?;}
  Ok(())
 }
 /// Candidate rows are source-checked and absent, not persisted inventory records.
 pub fn inventory_creatable(&self)->Vec<InventoryEntry>{
  if !self.ordinary_inventory_creation_source_valid()||crate::document_membership::allocate_ids(&self.slot.index,self.pending_inventory_rows().len()+self.reserved_achievement_count()+1).is_err(){return Vec::new()}
  let referenced:HashSet<i32>=self.slot.index.inventory_item_refs.iter().map(|&(item,_)|item).collect();
  // One pass over saved rows; ordinary/opaque/default rows block their Item
  // ID, while verified nondefault customizable variants do not.
  let blocked:HashSet<i32>=self.slot.index.inventory.iter().filter_map(|r|
   (!self.permits_separate_ordinary_base(r)).then_some(r.item_id?)).collect();
  crate::inventory_source::ordinary_bag_creation_ids().filter_map(|item_id|{
   let document_id=PENDING_ITEM|item_id as u32;
   if blocked.contains(&item_id)||referenced.contains(&item_id)||!self.ordinary_item_reference_scope_safe(item_id)||self.inventory_changes.contains_key(&document_id)||!self.inventory_creation_payload_safe(item_id){return None}
   Some(InventoryEntry{document_id,item_id,quantity:0,editable:true,quantity_limit:Some(crate::inventory_source::ordinary_quantity_limit(item_id)?),quantity_minimum:1})
  }).collect()
 }
 fn plan_inventory_quantity(&self,id:u32,expected:i32,next:i32)->Result<InventoryQuantityDelta,Error>{
  if id&PENDING_ITEM!=0{
   if self.pending_flowers.contains_key(&id)||self.pending_furniture.contains_key(&id)||self.pending_palettes.contains_key(&id)||self.pending_bobas.contains_key(&id)||self.pending_cafes.contains_key(&id)||self.pending_wands.contains_key(&id){
    let before=self.inventory_changes.get(&id).copied();
    if next<0||expected<=0||before!=Some(expected){return Err(Error::Schema)}
    return Ok(InventoryQuantityDelta{document_id:id,before,after:(next>0).then_some(next)})
   }
   let item_id=(id&!PENDING_ITEM) as i32;
   let before=self.inventory_changes.get(&id).copied();
   let cap=crate::inventory_source::ordinary_quantity_limit(item_id).ok_or(Error::Schema)?;
   if !self.can_create_inventory_item(item_id)||next<0||next>cap||before.unwrap_or(0)!=expected{return Err(Error::Schema)}
   return Ok(InventoryQuantityDelta{document_id:id,before,after:(next>0).then_some(next)})
  }
  let row=self.slot.index.inventory.iter().find(|r|r.id==id).ok_or(Error::Schema)?;
  let cap=self.inventory_quantity_limit(row).ok_or(Error::Schema)?;
  let minimum=if self.inventory_can_empty(row){0}else{1};
  if next<minimum||next>cap||
   self.inventory_changes.get(&id).copied().or(row.quantity)!=Some(expected){return Err(Error::Schema)}
  let before=self.inventory_changes.get(&id).copied();
  let after=if row.quantity==Some(next){None}else{Some(next)};
  Ok(InventoryQuantityDelta{document_id:id,before,after})
 }
 /// CAS changes ordinary quantities or stages a source-verified absent ordinary item.
 /// Persisted document IDs are assigned only by the shared export allocator.
 pub fn change_inventory_quantity(&mut self,id:u32,expected:i32,next:i32)->Result<(),Error>{
  if expected==next{return Err(Error::Schema)}
  let delta=self.plan_inventory_quantity(id,expected,next)?;
  self.preflight_inventory_membership(&[delta])?;
  let InventoryQuantityDelta{document_id,before,after}=delta;
  let revision=self.next_edit_revision()?;
  let change=Change::Inventory{document_id,before,after};
  self.restore_change(&change,false);
  self.undo.push(change);
  if self.undo.len()>MAX_UNDO{self.undo.remove(0);}
  self.redo.retain(|c|c.scope()!=HistoryScope::Inventory);self.revision=revision;Ok(())
 }
 /// Validate every existing ordinary stack against the current revision before
 /// changing anything. One native history step covers all selected rows.
 pub fn change_inventory_quantities(&mut self,requests:&[(u32,i32,i32)])->Result<(),Error>{
  if requests.is_empty()||requests.len()>MAX_INVENTORY_BATCH{return Err(Error::Budget)}
  let revision=self.next_edit_revision()?;
  let mut seen=HashSet::new();
  let mut deltas=Vec::with_capacity(requests.len());
  for &(id,expected,next) in requests{
   if !seen.insert(id){return Err(Error::Duplicate)}
   let delta=self.plan_inventory_quantity(id,expected,next)?;
   if expected!=next{deltas.push(delta);}
  }
  if deltas.is_empty(){return Err(Error::Schema)}
  self.preflight_inventory_membership(&deltas)?;
  let change=Change::InventoryBatch{deltas};
  self.restore_change(&change,false);
  self.undo.push(change);
  if self.undo.len()>MAX_UNDO{self.undo.remove(0);}
  self.redo.retain(|c|c.scope()!=HistoryScope::Inventory);
  self.revision=revision;Ok(())
 }
 pub fn counters(&self)->Vec<CounterEntry>{
  self.slot.index.counters.iter().filter_map(|model|match &model.state{
   ModelState::Counter{current,counted_values,counted_guids}=>Some(CounterEntry{
    guid:model.guid,current:*current,counted_values:*counted_values,counted_guids:*counted_guids,
   }),
   _=>None,
  }).collect()
 }
 /// Read-only native source metadata for progress footers.
 /// Unknown and old-format versions never inherit an unverified v3.0.1 goal.
 pub fn source_achievement_progress_goals(&self)->Vec<([u32;4],f32)>{
  if self.slot.envelope.version!=Version::V301{return Vec::new()}
  crate::achievement_keys::source_progress_goals_v301().collect()
 }
 pub fn achievement_value(&self,guid:[u32;4])->Option<AchievementValue>{
  self.achievement_created.get(&guid).copied().or_else(||self.achievement_changes.get(&guid).copied())
   .or_else(||self.slot.index.achievements.iter().find(|m|m.guid==guid).and_then(|m|achievement::value(m).ok()))
 }
 pub fn dirty(&self)->bool {!self.changes.is_empty()||!self.inventory_changes.is_empty()||self.flower_variant_changes.keys().chain(self.furniture_variant_changes.keys()).any(|id|*id&PENDING_ITEM==0||self.inventory_changes.contains_key(id))||self.palette_variant_changes.keys().any(|id|*id&PENDING_ITEM==0||self.inventory_changes.contains_key(id))||self.boba_variant_changes.keys().any(|id|*id&PENDING_ITEM==0||self.inventory_changes.contains_key(id))||self.cafe_variant_changes.keys().any(|id|*id&PENDING_ITEM==0||self.inventory_changes.contains_key(id))||self.wand_variant_changes.keys().any(|id|*id&PENDING_ITEM==0||self.inventory_changes.contains_key(id))||!self.achievement_changes.is_empty()||!self.achievement_created.is_empty()}
 pub fn can_undo(&self)->bool {!self.undo.is_empty()}
 pub fn can_redo(&self)->bool {!self.redo.is_empty()}
 pub fn history(&self)->Vec<HistoryRecord>{
  self.undo.iter().map(|change|change.history_record(true))
   .chain(self.redo.iter().rev().map(|change|change.history_record(false))).collect()
 }
 fn scope_counts(&self,scope:HistoryScope)->(usize,usize){
  (self.undo.iter().filter(|change|change.scope()==scope).count(),
   self.redo.iter().filter(|change|change.scope()==scope).count())
 }
 pub fn undo_scope(&mut self,scope:HistoryScope)->bool{
  let Some(index)=self.undo.iter().rposition(|change|change.scope()==scope) else{return false};
  let change=self.undo.remove(index);
  self.restore_change(&change,true);self.redo.push(change);
  self.revision=self.revision.wrapping_add(1);true
 }
 pub fn redo_scope(&mut self,scope:HistoryScope)->bool{
  let Some(index)=self.redo.iter().rposition(|change|change.scope()==scope) else{return false};
  let change=self.redo.remove(index);
  self.restore_change(&change,false);self.undo.push(change);
  self.revision=self.revision.wrapping_add(1);true
 }
 /// Jump to an absolute applied-edit cursor in one tab; the other tab is unchanged.
 /// Validate the entire requested distance before modifying any state.
 pub fn jump_history(&mut self,scope:HistoryScope,target:usize)->bool{
  let (applied,undone)=self.scope_counts(scope);
  if target>applied+undone{return false}
  if target<applied{
   for _ in target..applied{if !self.undo_scope(scope){return false}}
  }else{
   for _ in applied..target{if !self.redo_scope(scope){return false}}
  }
  true
 }
 pub fn can_change_membership(&self)->bool {self.slot.index.deprecated_map.is_some() && self.slot.index.deprecated_count==0 && self.slot.index.deprecated.is_empty()}
 /// Read-only native source eligibility for the currently opened save.
 /// The exact same game-source IDs and compatibility gates used by
 /// change(None, Some(ticks)) determine which missing records are offered.
 /// No inventory, DLC ownership or progress is modified by this query.
 pub fn creatable_collection_history_ids(&self)->Vec<i32>{
  if self.slot.envelope.version!=Version::V301||!self.can_change_membership(){
   return Vec::new()
  }
  let mut ids:Vec<i32>=crate::catalog::eligible_history_ids()
   .filter(|&id|id>0&&id!=i32::MAX&&self.value(id).is_none())
   .collect();
  ids.sort_unstable();
  ids.dedup();
  ids
 }
 pub fn change(&mut self,id:i32,expected:Option<i64>,next:Option<i64>)->Result<(),Error>{
  if id<=0 || id==i32::MAX || self.value(id)!=expected || next==expected {return Err(Error::Schema)}
  if (expected.is_none() || next.is_none()) && !self.can_change_membership(){return Err(Error::Schema)}
  if expected.is_none() && next.is_some() && (self.slot.envelope.version!=Version::V301 || !crate::catalog::eligible_for_new_history(id)){return Err(Error::Schema)}
  if let Some(t)=next {if !(1..=MAX_TICKS).contains(&t){return Err(Error::Schema)}}
  if expected.is_none() && self.entries.len()+self.changes.len()>=1_000_000 {return Err(Error::Budget)}
  // Finish every fallible precondition before changing native data or history.
  let revision=self.next_edit_revision()?;
  let before=self.changes.get(&id).copied();
  let after=if self.base.get(&id).copied()==next {None}else{Some(next)};
  match after {Some(t)=>{self.changes.insert(id,t);},None=>{self.changes.remove(&id);}}
  self.undo.push(Change::Collection{id,before,after});if self.undo.len()>MAX_UNDO{self.undo.remove(0);}
  self.redo.retain(|change|change.scope()!=HistoryScope::Collections);self.revision=revision;
  Ok(())
 }
 /// Create a v3.0.1 source-defined, previously absent achievement document.
 /// The IDocument tag 16 model is materialized on export. No read/open mutation.
 pub fn create_achievement(&mut self,guid:[u32;4],value:AchievementValue)->Result<(),Error>{
  if self.slot.envelope.version!=Version::V301||
   !crate::achievement_keys::known_v301(guid)||!achievement::valid(value)||
   self.achievement_value(guid).is_some()||value.complete!=value.completed.is_some()||
   self.slot.index.documents+self.achievement_created.len()>=1_000_000{return Err(Error::Schema)}
  crate::document_membership::allocate_ids(&self.slot.index,self.achievement_created.len()+self.reserved_inventory_count()+1)?;
  let revision=self.next_edit_revision()?;
  self.achievement_created.insert(guid,value);
  self.undo.push(Change::AchievementCreated{guid,before:None,after:Some(value)});
  if self.undo.len()>MAX_UNDO{self.undo.remove(0);}
  self.redo.retain(|change|change.scope()!=HistoryScope::Achievements);self.revision=revision;Ok(())
 }
 /// Missing last child plus an existing parent must not be a partial mutation.
 pub fn create_achievement_with_parent(
  &mut self,guid:[u32;4],value:AchievementValue,
  parent:[u32;4],expected:AchievementValue,next:AchievementValue
 )->Result<(),Error>{
  if guid==parent||crate::achievement_keys::parent_of_v301(guid)!=Some(parent)||self.slot.envelope.version!=Version::V301||
   !crate::achievement_keys::known_v301(guid)||!achievement::valid(value)||
   self.achievement_value(guid).is_some()||!value.complete||value.completed.is_none()||
   !achievement::valid(expected)||!achievement::valid(next)||expected==next||
   self.achievement_value(parent)!=Some(expected)||
   self.slot.index.documents+self.achievement_created.len()>=1_000_000{return Err(Error::Schema)}
  crate::document_membership::allocate_ids(&self.slot.index,self.achievement_created.len()+self.reserved_inventory_count()+1)?;
  let model=self.slot.index.achievements.iter().find(|m|m.guid==parent).ok_or(Error::Schema)?;
  let original=achievement::value(model)?;
  let before=self.achievement_changes.get(&parent).copied();
  let after=if next==original{None}else{Some(next)};
  let revision=self.next_edit_revision()?;
  self.achievement_created.insert(guid,value);
  match after{Some(v)=>{self.achievement_changes.insert(parent,v);},None=>{self.achievement_changes.remove(&parent);}}
  self.undo.push(Change::AchievementCreatedPair{guid,value,parent:(parent,before,after)});
  if self.undo.len()>MAX_UNDO{self.undo.remove(0);}
  self.redo.retain(|change|change.scope()!=HistoryScope::Achievements);self.revision=revision;Ok(())
 }
 /// Complete the last child (existing or absent) and create a missing
 /// source-defined parent. Preflight both before any write; one Undo covers both.
 pub fn complete_child_and_create_parent(
  &mut self,child:[u32;4],expected:Option<AchievementValue>,next:AchievementValue,
  parent:[u32;4],parent_next:AchievementValue
 )->Result<(),Error>{
  if self.slot.envelope.version!=Version::V301||
   crate::achievement_keys::parent_of_v301(child)!=Some(parent)||
   self.achievement_value(parent).is_some()||
   self.achievement_value(child)!=expected||
   expected==Some(next)||!achievement::valid(next)||!next.complete||
   !achievement::valid(parent_next)||!parent_next.complete||
   self.slot.index.documents+self.achievement_created.len()+usize::from(expected.is_none())+1>1_000_000
   {return Err(Error::Schema)}
  crate::document_membership::allocate_ids(&self.slot.index,self.achievement_created.len()+self.reserved_inventory_count()+usize::from(expected.is_none())+1)?;
  let total=crate::achievement_keys::parent_size_v301(parent).ok_or(Error::Schema)?;
  if parent_next.current!=total as f32{return Err(Error::Schema)}
  let mut seen=0usize;
  let mut latest:Option<(i64,u32)>=None;
  let mut all_dated=true;
  for row in self.achievements(){
   if crate::achievement_keys::parent_of_v301(row.guid)!=Some(parent){continue}
   let state=if row.guid==child{next}else{row.value};
   if !state.complete{return Err(Error::Schema)}
   seen+=1;
   if let Some(d)=state.completed{
    if latest.is_none_or(|v|d>v){latest=Some(d)}
   }else{all_dated=false}
  }
  if expected.is_none(){
   seen+=1;
   if let Some(d)=next.completed{
    if latest.is_none_or(|v|d>v){latest=Some(d)}
   }else{all_dated=false}
  }
  let expected_date=if all_dated{latest}else{None};
  if seen!=total||parent_next.completed!=expected_date{return Err(Error::Schema)}
  let created=expected.is_none()||self.achievement_created.contains_key(&child);
  let (before,after)=if created{
   (self.achievement_created.get(&child).copied(),Some(next))
  }else{
   let original=achievement::value(self.slot.index.achievements.iter().find(|m|m.guid==child).ok_or(Error::Schema)?)?;
   (self.achievement_changes.get(&child).copied(),if next==original{None}else{Some(next)})
  };
  let revision=self.next_edit_revision()?;
  let values=if created{&mut self.achievement_created}else{&mut self.achievement_changes};
  match after{Some(v)=>{values.insert(child,v);},None=>{values.remove(&child);}}
  self.achievement_created.insert(parent,parent_next);
  self.undo.push(Change::AchievementParentNew{child:(child,created,before,after),parent:(parent,parent_next)});
  if self.undo.len()>MAX_UNDO{self.undo.remove(0);}
  self.redo.retain(|change|change.scope()!=HistoryScope::Achievements);self.revision=revision;Ok(())
 }
 /// Update a leaf and its completed parent atomically, with exactly one undo entry.
 /// Every compare-and-swap precondition is checked before modifying either record.
 pub fn change_achievement_pair(
  &mut self,
  first:([u32;4],AchievementValue,AchievementValue),
  second:([u32;4],AchievementValue,AchievementValue)
 )->Result<(),Error>{
  if first.0==second.0{return Err(Error::Duplicate)}
  let mut replacements=[([0u32;4],false,None,None);2];
  for (i,(guid,expected,next)) in [first,second].into_iter().enumerate(){
   if !achievement::valid(expected)||!achievement::valid(next)||
    expected==next||self.achievement_value(guid)!=Some(expected){return Err(Error::Schema)}
   let created=self.achievement_created.contains_key(&guid);
   let (before,after)=if created{
    (self.achievement_created.get(&guid).copied(),Some(next))
   }else{
    let model=self.slot.index.achievements.iter().find(|m|m.guid==guid).ok_or(Error::Schema)?;
    let original=achievement::value(model)?;
    (self.achievement_changes.get(&guid).copied(),if next==original{None}else{Some(next)})
   };
   replacements[i]=(guid,created,before,after);
  }
  let next_revision=self.next_edit_revision()?;
  for (guid,created,_,after) in replacements{
   let values=if created{&mut self.achievement_created}else{&mut self.achievement_changes};
   match after{
    Some(value)=>{values.insert(guid,value);},
    None=>{values.remove(&guid);}
   }
  }
  self.undo.push(Change::AchievementPair{first:replacements[0],second:replacements[1]});
  if self.undo.len()>MAX_UNDO{self.undo.remove(0);}
  self.redo.retain(|change|change.scope()!=HistoryScope::Achievements);self.revision=next_revision;
  Ok(())
 }

 /// Source-gated, single-transaction native achievement edit. The UI submits
 /// only the child GUID, the exact CAS expectation (or absence), and new state.
 /// Rust alone decides whether a source-defined category must be completed,
 /// created, revoked or timestamp-synchronized. No reward/counter mutation.
 pub fn edit_achievement_auto(
  &mut self,guid:[u32;4],expected:Option<AchievementValue>,next:AchievementValue
 )->Result<(),Error>{
  if self.achievement_value(guid)!=expected||expected==Some(next)||
   !achievement::valid(next)||expected.is_some_and(|v|!achievement::valid(v)){
   return Err(Error::Schema)
  }
  if expected.is_none()&&(self.slot.envelope.version!=Version::V301||
    !crate::achievement_keys::known_v301(guid)){return Err(Error::Version)}
  if self.slot.envelope.version==Version::V301 {
   if let Some(parent_guid)=crate::achievement_keys::parent_of_v301(guid){
    let total=crate::achievement_keys::parent_size_v301(parent_guid).ok_or(Error::Schema)?;
    let parent=self.achievement_value(parent_guid);
    let saved=self.achievements();
    // A complete category may be inferred only when every genuine, direct
    // source child is present and complete. Dates are compared at 100 ns.
    if next.complete&&parent.is_none_or(|v|!v.complete){
     let mut seen=0usize;
     let mut all_complete=true;
     let mut all_dated=true;
     let mut latest:Option<(i64,u32)>=None;
     for row in &saved{
      if crate::achievement_keys::parent_of_v301(row.guid)!=Some(parent_guid){continue}
      seen+=1;
      let v=if row.guid==guid{next}else{row.value};
      if !achievement::valid(v){return Err(Error::Schema)}
      if !v.complete{all_complete=false}
      match v.completed{
       Some(date)=>{if latest.is_none_or(|t|date>t){latest=Some(date)}},
       None=>all_dated=false
      }
     }
     if expected.is_none(){
      seen+=1;
      if let Some(date)=next.completed{
       if latest.is_none_or(|t|date>t){latest=Some(date)}
      }else{all_dated=false}
     }
     if seen==total&&all_complete {
      let parent_next=AchievementValue{complete:true,current:total as f32,
       completed:if all_dated{latest}else{None}};
      return match (expected,parent){
       (Some(before),Some(parent_before))=>self.change_achievement_pair(
        (guid,before,next),(parent_guid,parent_before,parent_next)),
       (None,Some(parent_before))=>self.create_achievement_with_parent(
        guid,next,parent_guid,parent_before,parent_next),
       (_,None)=>self.complete_child_and_create_parent(
        guid,expected,next,parent_guid,parent_next)
      }
     }
    }
    if let (Some(before),Some(parent_before))=(expected,parent){
     // Revoke a completed native category together with its child. Never
     // increase stale progress or delete any other child's timestamp.
     if before.complete&&!next.complete&&parent_before.complete{
      let remaining=saved.iter().filter(|row|row.guid!=guid&&row.value.complete&&
       crate::achievement_keys::parent_of_v301(row.guid)==Some(parent_guid)).count();
      let parent_next=AchievementValue{complete:false,
       current:parent_before.current.min(remaining as f32),completed:None};
      return self.change_achievement_pair(
       (guid,before,next),(parent_guid,parent_before,parent_next))
     }
     // Only synchronize a date when the old parent timestamp is provably
     // source-derived (the exact maximum timestamp of all completed children).
     // Independently recorded parent dates remain unchanged.
     if before.complete&&next.complete&&
      before.current.to_bits()==next.current.to_bits()&&
      before.completed.is_some()&&next.completed.is_some()&&
      before.completed!=next.completed&&parent_before.complete&&
      parent_before.current==total as f32&&parent_before.completed.is_some(){
      let mut seen=0usize;
      let mut old_latest:Option<(i64,u32)>=None;
      let mut new_latest:Option<(i64,u32)>=None;
      let mut eligible=true;
      for row in &saved{
       if crate::achievement_keys::parent_of_v301(row.guid)!=Some(parent_guid){continue}
       seen+=1;
       if !row.value.complete||!achievement::valid(row.value){eligible=false;break}
       let Some(old_date)=row.value.completed else{eligible=false;break};
       let new_date=if row.guid==guid{next.completed.unwrap()}else{old_date};
       if old_latest.is_none_or(|d|old_date>d){old_latest=Some(old_date)}
       if new_latest.is_none_or(|d|new_date>d){new_latest=Some(new_date)}
      }
      if eligible&&seen==total&&parent_before.completed==old_latest&&
       new_latest!=old_latest{
       let parent_next=AchievementValue{completed:new_latest,..parent_before};
       return self.change_achievement_pair(
        (guid,before,next),(parent_guid,parent_before,parent_next))
      }
     }
    }
   }
  }
  match expected{
   Some(before)=>self.change_achievement(guid,before,next),
   None=>self.create_achievement(guid,next)
  }
 }
 pub fn change_achievement(&mut self,guid:[u32;4],expected:AchievementValue,next:AchievementValue)->Result<(),Error>{
  if !achievement::valid(next) || expected==next || self.achievement_value(guid)!=Some(expected){return Err(Error::Schema)}
  if let Some(&before)=self.achievement_created.get(&guid){
   let revision=self.next_edit_revision()?;
   self.achievement_created.insert(guid,next);
   self.undo.push(Change::AchievementCreated{guid,before:Some(before),after:Some(next)});
   if self.undo.len()>MAX_UNDO{self.undo.remove(0);}
   self.redo.retain(|change|change.scope()!=HistoryScope::Achievements);self.revision=revision;
   return Ok(())
  }
  let model=self.slot.index.achievements.iter().find(|m|m.guid==guid).ok_or(Error::Schema)?;
  let original=achievement::value(model)?;
  // Revision exhaustion must not leave a partially applied CAS transaction.
  let revision=self.next_edit_revision()?;
  let before=self.achievement_changes.get(&guid).copied();
  let after=if next==original{None}else{Some(next)};
  match after {Some(v)=>{self.achievement_changes.insert(guid,v);},None=>{self.achievement_changes.remove(&guid);}}
  self.undo.push(Change::Achievement{guid,before,after});
  if self.undo.len()>MAX_UNDO{self.undo.remove(0);}
  self.redo.retain(|change|change.scope()!=HistoryScope::Achievements);self.revision=revision;
  Ok(())
 }
 fn restore_change(&mut self,change:&Change,reverse:bool){
  match *change {
   Change::Collection{id,before,after}=>{
    match if reverse{before}else{after}{
     Some(v)=>{self.changes.insert(id,v);},None=>{self.changes.remove(&id);}
    }
   },
   Change::Inventory{document_id,before,after}=>{
    match if reverse{before}else{after}{
     Some(v)=>{self.inventory_changes.insert(document_id,v);},
     None=>{self.inventory_changes.remove(&document_id);}
    }
   }
   Change::InventoryBatch{ref deltas}=>{
    for &InventoryQuantityDelta{document_id,before,after} in deltas{
     match if reverse{before}else{after}{
      Some(v)=>{self.inventory_changes.insert(document_id,v);},
      None=>{self.inventory_changes.remove(&document_id);}
     }
    }
   }
   Change::FlowerCreated{document_id,flower,quantity,..}=>{
    if reverse{self.pending_flowers.remove(&document_id);self.inventory_changes.remove(&document_id);}
    else{self.pending_flowers.insert(document_id,flower);self.inventory_changes.insert(document_id,quantity);}
   }
   Change::FlowerVariant{document_id,before,after}=>{
    match if reverse{before}else{after}{
     Some(v)=>{self.flower_variant_changes.insert(document_id,v);},
     None=>{self.flower_variant_changes.remove(&document_id);}
    }
   }
   Change::FurnitureCreated{document_id,furniture,quantity,..}=>{
    if reverse{self.pending_furniture.remove(&document_id);self.inventory_changes.remove(&document_id);}
    else{self.pending_furniture.insert(document_id,furniture);self.inventory_changes.insert(document_id,quantity);}
   }
   Change::FurnitureVariant{document_id,before,after}=>{
    match if reverse{before}else{after}{
     Some(v)=>{self.furniture_variant_changes.insert(document_id,v);},
     None=>{self.furniture_variant_changes.remove(&document_id);}
    }
   }
   Change::PaletteCreated{document_id,variant,quantity,..}=>{
    if reverse{self.pending_palettes.remove(&document_id);self.inventory_changes.remove(&document_id);}
    else{self.pending_palettes.insert(document_id,variant);self.inventory_changes.insert(document_id,quantity);}
   }
   Change::CafeCreated{document_id,item_id,variant,quantity,..}=>{
    if reverse{self.pending_cafes.remove(&document_id);self.inventory_changes.remove(&document_id);}
    else{self.pending_cafes.insert(document_id,(item_id,variant));self.inventory_changes.insert(document_id,quantity);}
   }
   Change::CafeVariant{document_id,before,after}=>{
    match if reverse{before}else{after}{
     Some(v)=>{self.cafe_variant_changes.insert(document_id,v);},
     None=>{self.cafe_variant_changes.remove(&document_id);}
    }
   }
   Change::WandCreated{document_id,item_id,identity,quantity,..}=>{
    if reverse{self.pending_wands.remove(&document_id);self.inventory_changes.remove(&document_id);}
    else{self.pending_wands.insert(document_id,(item_id,identity));self.inventory_changes.insert(document_id,quantity);}
   }
   Change::WandVariant{document_id,before,after}=>{
    match if reverse{before}else{after}{Some(v)=>{self.wand_variant_changes.insert(document_id,v);},None=>{self.wand_variant_changes.remove(&document_id);}}
   }
   Change::BobaCreated{document_id,variant,quantity,..}=>{
    if reverse{self.pending_bobas.remove(&document_id);self.inventory_changes.remove(&document_id);}
    else{self.pending_bobas.insert(document_id,variant);self.inventory_changes.insert(document_id,quantity);}
   }
   Change::BobaVariant{document_id,before,after}=>{
    match if reverse{before}else{after}{
     Some(v)=>{self.boba_variant_changes.insert(document_id,v);},
     None=>{self.boba_variant_changes.remove(&document_id);}
    }
   }
   Change::PaletteVariant{document_id,before,after}=>{
    match if reverse{before}else{after}{
     Some(v)=>{self.palette_variant_changes.insert(document_id,v);},
     None=>{self.palette_variant_changes.remove(&document_id);}
    }
   }
   Change::Achievement{guid,before,after}=>{
    match if reverse{before}else{after}{
     Some(v)=>{self.achievement_changes.insert(guid,v);},None=>{self.achievement_changes.remove(&guid);}
    }
   }
   Change::AchievementCreated{guid,before,after}=>{
    match if reverse{before}else{after}{
     Some(v)=>{self.achievement_created.insert(guid,v);},None=>{self.achievement_created.remove(&guid);}
    }
   }
   Change::AchievementCreatedPair{guid,value,parent:(pg,before,after)}=>{
    if reverse{self.achievement_created.remove(&guid);}else{self.achievement_created.insert(guid,value);}
    match if reverse{before}else{after}{
     Some(v)=>{self.achievement_changes.insert(pg,v);},None=>{self.achievement_changes.remove(&pg);}
    }
   }
   Change::AchievementParentNew{child:(guid,created,before,after),parent:(pg,value)}=>{
    let map=if created{&mut self.achievement_created}else{&mut self.achievement_changes};
    match if reverse{before}else{after}{
     Some(v)=>{map.insert(guid,v);},None=>{map.remove(&guid);}
    }
    if reverse{self.achievement_created.remove(&pg);}else{self.achievement_created.insert(pg,value);}
   }
   Change::AchievementPair{first,second}=>{
    for (guid,created,before,after) in [first,second]{
     let values=if created{&mut self.achievement_created}else{&mut self.achievement_changes};
     match if reverse{before}else{after}{
      Some(v)=>{values.insert(guid,v);},None=>{values.remove(&guid);}
     }
    }
   }
  }
 }
 pub fn undo(&mut self)->bool {
  let Some(change)=self.undo.pop() else{return false};
  self.restore_change(&change,true);self.redo.push(change);
  self.revision=self.revision.wrapping_add(1);true
 }
 pub fn redo(&mut self)->bool {
  let Some(change)=self.redo.pop() else{return false};
  self.restore_change(&change,false);self.undo.push(change);
  self.revision=self.revision.wrapping_add(1);true
 }
 pub fn reset(&mut self){self.changes.clear();self.inventory_changes.clear();self.pending_flowers.clear();self.pending_furniture.clear();self.pending_palettes.clear();self.pending_bobas.clear();self.pending_cafes.clear();self.pending_wands.clear();self.flower_variant_changes.clear();self.furniture_variant_changes.clear();self.palette_variant_changes.clear();self.boba_variant_changes.clear();self.wand_variant_changes.clear();self.cafe_variant_changes.clear();self.achievement_changes.clear();self.achievement_created.clear();self.undo.clear();self.redo.clear();self.revision=self.revision.wrapping_add(1)}
 pub fn export(&self)->Result<Vec<u8>,Error>{
  if !self.dirty(){return Err(Error::Schema)}
  let original_payload=&self.slot.envelope.decoded;
  let mut patches:Vec<achievement::Replacement>=Vec::new();
  if !self.changes.is_empty(){
   let map=self.slot.index.collection_map.clone().ok_or(Error::Schema)?;
   let updated=replace_map(original_payload,map.clone(),&self.slot.index.collections,&self.entries())?;
   let inserted=updated.len().checked_sub(original_payload.len()-map.len()).ok_or(Error::Overflow)?;
   if updated[..map.start]!=original_payload[..map.start]||updated[map.start+inserted..]!=original_payload[map.end..]{return Err(Error::Schema)}
   patches.push((map.clone(),updated[map.start..map.start+inserted].to_vec()));
  }
  for row in &self.slot.index.inventory {
   if let Some(v)=self.inventory_changes.get(&row.id){
    let minimum=if self.inventory_can_empty(row){0}else{1};
    if self.inventory_quantity_limit(row).is_none_or(|cap|*v<minimum||*v>cap){return Err(Error::Schema)}
    let span=row.fields[2].clone().ok_or(Error::Schema)?;
    let mut encoded=vec![0xd2];encoded.extend(v.to_be_bytes());
    patches.push((span,encoded));
   }
  }
  for row in &self.slot.index.inventory {
   if let Some(v)=self.flower_variant_changes.get(&row.id){
    let (patterns,current,reserved)=self.flower_context(row.id).ok_or(Error::Schema)?;
    if current!=*v||!valid_flower_variant(patterns,*v)||reserved.contains(v){return Err(Error::Schema)}
    let original=self.original_flower_variant(row.id).ok_or(Error::Schema)?;
    if original[0]!=v[0]&&!self.flower_growth_change_allowed(row.id){return Err(Error::Schema)}
    for i in 0..4{
     if original[i]==v[i]{continue}
     let span=row.unique_fields.get(i).cloned().ok_or(Error::Schema)?;
     let encoded=if i==0{vec![v[i] as u8]}else if matches!(row.unique_data,Some(InventoryUniqueData::Opaque{tag:2})){
      let table=if i==2{LEGACY_FLOWER_PATTERN_GUIDS}else{LEGACY_FLOWER_COLOR_GUIDS};
      let guid=table.get(v[i] as usize).ok_or(Error::Schema)?;
      let mut bytes=Vec::with_capacity(20);for word in guid{bytes.push(0xce);bytes.extend(word.to_be_bytes());}bytes
     }else{let mut bytes=vec![0xd2];bytes.extend(v[i].to_be_bytes());bytes};
     patches.push((span,encoded));
    }
   }
  }
  for row in &self.slot.index.inventory{
   if let Some(v)=self.furniture_variant_changes.get(&row.id){
    let (source,original,current,reserved)=self.furniture_context(row.id).ok_or(Error::Schema)?;
    if current!=*v||!Self::valid_furniture_target(source,original,*v)||
     reserved.contains(&furniture_key(source,*v).ok_or(Error::Schema)?){return Err(Error::Schema)}
    for i in 0..3{
     if original[i]==v[i]{continue}
     let span=row.unique_fields.get(i).cloned().ok_or(Error::Schema)?;
     let encoded=if matches!(row.unique_data,Some(InventoryUniqueData::Opaque{tag:1})){
      let words=if v[i]==0{[0;4]}else{furniture_source::MATERIAL_GUID_INDEX.iter().find(|(_,index)|*index==v[i]).ok_or(Error::Schema)?.0};
      let mut bytes=Vec::with_capacity(20);
      for word in words{bytes.push(0xce);bytes.extend(word.to_be_bytes());}
      bytes
     }else{let mut bytes=vec![0xd2];bytes.extend(v[i].to_be_bytes());bytes};
     patches.push((span,encoded));
    }
   }
  }
  for row in &self.slot.index.inventory{
   if let Some(v)=self.palette_variant_changes.get(&row.id){
    let (original,current,reserved)=self.palette_context(row.id).ok_or(Error::Schema)?;
    if current!=*v||!Self::valid_palette_target(original,*v)||reserved.iter().any(|&p|Self::palette_equal(p,*v)){return Err(Error::Schema)}
    for i in 0..3{
     if original[i]==v[i]{continue}
     let span=row.unique_fields.get(i).cloned().ok_or(Error::Schema)?;
     let mut encoded=vec![0x94];
     for bits in v[i]{encoded.push(0xca);encoded.extend(bits.to_be_bytes());}
     patches.push((span,encoded));
    }
   }
  }
  for row in &self.slot.index.inventory{
   if let Some(v)=self.wand_variant_changes.get(&row.id){
    let (item,original,current,reserved)=self.wand_full_context(row.id).ok_or(Error::Schema)?;
    let key=Self::wand_key(item,*v).ok_or(Error::Schema)?;
    if current!=*v||reserved.contains(&key){return Err(Error::Schema)}
    if v[0]!=original[0]&&!self.wand_source_edit_safe(row.id,item){return Err(Error::Schema)}
    for (i,field) in [0usize,2,3].into_iter().enumerate(){
     if original[i]==v[i]{continue}
     let span=row.unique_fields.get(field).cloned().ok_or(Error::Schema)?;
     let encoded=if field==0&&matches!(row.unique_data,Some(InventoryUniqueData::Opaque{tag:5})){
      let words=crate::inventory_source::legacy_wand_source_guid(v[0]).ok_or(Error::Schema)?;
      let mut bytes=Vec::with_capacity(20);for word in words{bytes.push(0xce);bytes.extend(word.to_be_bytes());}bytes
     }else{let mut bytes=vec![0xd2];bytes.extend(v[i].to_be_bytes());bytes};
     patches.push((span,encoded));
    }
    if original[3..]!=v[3..]{
     if !self.valid_wand_nested_target(row.id,item,original,original,*v){return Err(Error::Schema)}
     let span=row.unique_fields.get(1).cloned().ok_or(Error::Schema)?;
     let raw=original_payload.get(span.clone()).ok_or(Error::Schema)?;
     let (tag,materials,spans)=Self::wand_material_fields(raw)?;
     if materials!=Self::wand_materials(original){return Err(Error::Schema)}
     for (i,token) in spans.into_iter().enumerate(){
      if original[i+3]==v[i+3]{continue}
      let encoded=if tag==1{
       let words=if v[i+3]==0{[0;4]}else{furniture_source::MATERIAL_GUID_INDEX.iter().find(|(_,index)|*index==v[i+3]).ok_or(Error::Schema)?.0};
       let mut bytes=Vec::with_capacity(20);
       for word in words{bytes.push(0xce);bytes.extend(word.to_be_bytes());}
       bytes
      }else{let mut bytes=vec![0xd2];bytes.extend(v[i+3].to_be_bytes());bytes};
      patches.push((span.start+token.start..span.start+token.end,encoded));
     }
    }
   }
   if let Some(v)=self.boba_variant_changes.get(&row.id){
    let (original,current,reserved)=self.boba_context(row.id).ok_or(Error::Schema)?;
    if current!=*v||!Self::valid_boba_target(*v)||reserved.contains(v){return Err(Error::Schema)}
    for i in 0..5{
     if original[i]==v[i]{continue}
     let span=row.unique_fields.get(i).cloned().ok_or(Error::Schema)?;
     let mut encoded=vec![0xd2];encoded.extend(v[i].to_be_bytes());patches.push((span,encoded));
    }
   }
  }
  for row in &self.slot.index.inventory{
   if let Some(v)=self.cafe_variant_changes.get(&row.id){
    let (item,original,current,reserved)=self.cafe_context(row.id).ok_or(Error::Schema)?;
    if current!=*v||!self.valid_cafe_target(item,original,*v)||reserved.contains(v){return Err(Error::Schema)}
    let count=Self::cafe_count(original);let next_count=Self::cafe_count(*v);
    for (i,span) in row.unique_fields.iter().enumerate(){
     let raw=original_payload.get(span.clone()).ok_or(Error::Schema)?;
     let mut cursor=Cursor::new(raw);
     if cursor.array()?!=count{return Err(Error::Schema)}
     let mut tokens=Vec::with_capacity(count);
     for j in 0..count{
      let start=cursor.pos;let value=cursor.int(1,i32::MAX as i128)? as i32;
      if value!=original[i*3+j]{return Err(Error::Schema)}
      tokens.push(start..cursor.pos);
     }
     if cursor.pos!=span.len(){return Err(Error::Schema)}
     if count==next_count{
      for (j,token) in tokens.into_iter().enumerate(){
       let word=i*3+j;
       if original[word]!=v[word]{let mut encoded=vec![0xd2];encoded.extend(v[word].to_be_bytes());patches.push((span.start+token.start..span.start+token.end,encoded));}
      }
     }else{
      let mut encoded=vec![0x90|next_count as u8];
      for j in 0..next_count{
       let word=i*3+j;
       if j<count&&original[word]==v[word]{encoded.extend(&raw[tokens[j].clone()]);}
       else{encoded.push(0xd2);encoded.extend(v[word].to_be_bytes());}
      }
      patches.push((span.clone(),encoded));
     }
    }
   }
  }
  for model in &self.slot.index.achievements {
   if let Some(value)=self.achievement_changes.get(&model.guid){
    patches.extend(achievement::replacements(model,*value)?);
   }
  }
  // First patch existing token spans, then use a fresh schema walk to insert
  // new IDocuments into DbRoot's original documents array. The array header
  // and byte offsets can shift when existing timestamps change width.
  let (intermediate,first)=if patches.is_empty(){
   (original_payload.clone(),original_payload.len())
  }else{achievement::splice(original_payload,patches)?};
  let (next_payload,first)=if self.achievement_created.is_empty(){
   (intermediate,first)
  }else{
   let index=crate::native::index_native(&intermediate,self.slot.envelope.version)?;
   let last=index.achievements.last().ok_or(Error::Schema)?.id;
   let mut added:Vec<_>=self.achievement_created.iter().collect();
   added.sort_by_key(|(&guid,_)|guid);
   let ids=crate::document_membership::allocate_ids(&index,added.len())?;
   let mut records=Vec::with_capacity(added.len());
   for ((&guid,&value),id) in added.into_iter().zip(ids){
    records.push(((16,id),encode_achievement_document(id,guid,value)?));
   }
   let (result,created_at)=crate::document_membership::rewrite(
    &intermediate,self.slot.envelope.version,&index,&[],Some(((16,last),&records)))?;
   (result,first.min(created_at))
  };
  let pending=self.pending_inventory_rows();
  let mut new_inventory=Vec::with_capacity(pending.len());
  let mut new_cafe_variants=HashMap::new();
  let mut new_boba_variants=HashMap::new();
  let (next_payload,first)=if pending.is_empty(){(next_payload,first)}else{
   let index=crate::native::index_native(&next_payload,self.slot.envelope.version)?;
   let anchor=index.document_spans.last().ok_or(Error::Schema)?.key;
   let ids=crate::document_membership::allocate_ids(&index,pending.len())?;
   let active_unique=self.active_pending_unique_count();
   let mut unique_ids=if active_unique==0{Vec::new()}else{
    crate::document_membership::allocate_inventory_unique_ids(&index,self.slot.envelope.version,active_unique)?
   }.into_iter();
   let mut records=Vec::with_capacity(pending.len());
   for (row,id) in pending.iter().zip(ids){
    if row.quantity<=0{return Err(Error::Schema)}
    let mut bytes=vec![0x92,1,0x95];mp_u32(id,&mut bytes);mp_u32(row.item_id as u32,&mut bytes);
    let (uid,variant)=if let Some(f)=self.pending_flowers.get(&row.document_id){
     let (patterns,variant,reserved)=self.flower_context(row.document_id).ok_or(Error::Schema)?;
     if row.item_id!=f.item_id||!valid_flower_variant(patterns,variant)||reserved.contains(&variant){return Err(Error::Schema)}
     let uid=unique_ids.next().ok_or(Error::Schema)?;mp_u32(uid as u32,&mut bytes);mp_u32(row.quantity as u32,&mut bytes);
     bytes.extend([0x92,7,0x94,variant[0] as u8]);
     for n in &variant[1..]{bytes.push(0xd2);bytes.extend(n.to_be_bytes());}
     (uid,Some(flower_unique(variant)))
    }else if let Some(f)=self.pending_furniture.get(&row.document_id){
     let (source,original,variant,reserved)=self.furniture_context(row.document_id).ok_or(Error::Schema)?;
     let key=furniture_key(source,variant).ok_or(Error::Schema)?;
     if row.item_id!=f.item_id||!Self::valid_furniture_target(source,original,variant)||Some(key)==furniture_key(source,[0;3])||reserved.contains(&key){return Err(Error::Schema)}
     let uid=unique_ids.next().ok_or(Error::Schema)?;mp_u32(uid as u32,&mut bytes);mp_u32(row.quantity as u32,&mut bytes);
     bytes.extend([0x92,8,0x93]);for n in variant{bytes.push(0xd2);bytes.extend(n.to_be_bytes());}
     (uid,Some(InventoryUniqueData::Furniture{materials:variant}))
    }else if self.pending_wands.contains_key(&row.document_id){
     let (item,_,identity,_)=self.wand_full_context(row.document_id).ok_or(Error::Schema)?;
     let [source,magic,fleck,a,b,c]=identity;
     let style=crate::inventory_source::wand_source_style(item,source).ok_or(Error::Schema)?;
     if item!=row.item_id||Self::wand_key(item,identity).is_none(){return Err(Error::Schema)}
     let uid=unique_ids.next().ok_or(Error::Schema)?;mp_u32(uid as u32,&mut bytes);mp_u32(row.quantity as u32,&mut bytes);
     bytes.extend([0x92,9,0x95]);mp_u32(source as u32,&mut bytes);
     if [a,b,c]==WAND_NIL_MATERIALS{bytes.push(0xc0)}else{
      bytes.extend([0x92,8,0x93]);for word in [a,b,c]{bytes.push(0xd2);bytes.extend(word.to_be_bytes());}
     }
     for word in [magic,fleck,style]{bytes.push(0xd2);bytes.extend(word.to_be_bytes());}
     (uid,Self::wand_appearance(item,identity))
    }else if self.pending_cafes.contains_key(&row.document_id){
     let (item,_,variant,_)=self.cafe_context(row.document_id).ok_or(Error::Schema)?;
     if item!=row.item_id||!self.valid_cafe_creation(item,variant){return Err(Error::Schema)}
     let uid=unique_ids.next().ok_or(Error::Schema)?;mp_u32(uid as u32,&mut bytes);mp_u32(row.quantity as u32,&mut bytes);
     bytes.extend([0x92,3,0x92]);let count=Self::cafe_count(variant);
     for i in 0..2{bytes.push(0x90|count as u8);for n in &variant[i*3..i*3+count]{bytes.push(0xd2);bytes.extend(n.to_be_bytes());}}
     new_cafe_variants.insert(id,variant);
     (uid,Some(Self::cafe_appearance(variant)))
    }else if self.pending_bobas.contains_key(&row.document_id){
     let (_,variant,_)=self.boba_context(row.document_id).ok_or(Error::Schema)?;
     if row.item_id!=crate::inventory_source::BOBA_ID||!Self::valid_boba_target(variant){return Err(Error::Schema)}
     let uid=unique_ids.next().ok_or(Error::Schema)?;mp_u32(uid as u32,&mut bytes);mp_u32(row.quantity as u32,&mut bytes);
     bytes.extend([0x92,4,0x95]);for n in variant{bytes.push(0xd2);bytes.extend(n.to_be_bytes());}
     new_boba_variants.insert(id,variant);
     (uid,Some(InventoryUniqueData::BobaAppearance{color_id:variant[0]}))
    }else if self.pending_palettes.contains_key(&row.document_id){
     let (_,variant,_)=self.palette_context(row.document_id).ok_or(Error::Schema)?;
     if row.item_id!=crate::inventory_source::CUSTOM_PALETTE_ID||!variant.iter().all(|&c|Self::palette_output_choices().any(|x|x==c)){return Err(Error::Schema)}
     let uid=unique_ids.next().ok_or(Error::Schema)?;mp_u32(uid as u32,&mut bytes);mp_u32(row.quantity as u32,&mut bytes);
     bytes.extend([0x92,6,0x93]);for color in variant{bytes.push(0x94);for bits in color{bytes.push(0xca);bytes.extend(bits.to_be_bytes());}}
     (uid,Some(InventoryUniqueData::Palette{rgba_bits:variant}))
    }else{
     if !self.can_create_inventory_item(row.item_id)||!crate::inventory_source::ordinary_quantity_limit(row.item_id).is_some_and(|cap|row.quantity<=cap){return Err(Error::Schema)}
     bytes.push(0);mp_u32(row.quantity as u32,&mut bytes);bytes.push(0xc0);
     (0,None)
    };
    records.push(((1,id),bytes));new_inventory.push((id,row.item_id,row.quantity,uid,variant));
   }
   if unique_ids.next().is_some(){return Err(Error::Schema)}
   let (result,created_at)=crate::document_membership::rewrite(&next_payload,self.slot.envelope.version,&index,&[],Some((anchor,&records)))?;
   (result,first.min(created_at))
  };
  if next_payload==*original_payload{return Err(Error::Schema)}
  let new_slot=encode_slot(&self.slot_raw,&self.slot,&next_payload,first)?;
  let reread=read_slot(&new_slot)?;
  if !Self::compatible(&reread)||reread.envelope.version!=self.slot.envelope.version{return Err(Error::Schema)}
  let expected=self.entries();
  if reread.index.collections.len()!=expected.len() ||
   !reread.index.collections.iter().zip(&expected).all(|(r,e)|r.id==e.id&&r.ticks==e.ticks) {return Err(Error::Schema)}
  if reread.index.inventory.len()!=self.slot.index.inventory.len()+new_inventory.len(){return Err(Error::Schema)}
  for (row,&(id,item,qty,uid,variant)) in reread.index.inventory.iter().skip(self.slot.index.inventory.len()).zip(&new_inventory){
   if row.id!=id||row.item_id!=Some(item)||row.unique_id!=Some(uid)||row.quantity!=Some(qty)||
    row.unique_is_nil!=Some(variant.is_none())||row.unique_data!=variant||!row.fields.iter().all(Option::is_some){return Err(Error::Schema)}
   if let Some(&expected)=new_cafe_variants.get(&id){if Self::cafe_words(&reread.envelope.decoded,row)!=Some(expected){return Err(Error::Schema)}}
   if let Some(&expected)=new_boba_variants.get(&id){if Self::boba_words(&reread.envelope.decoded,row)!=Some(expected){return Err(Error::Schema)}}
  }
  if reread.index.inventory.iter().zip(&self.slot.index.inventory).any(|(a,b)|{
   a.id!=b.id||a.item_id!=b.item_id||a.unique_id!=b.unique_id||
   a.unique_is_nil!=b.unique_is_nil||
   a.quantity!=self.inventory_changes.get(&b.id).copied().or(b.quantity)||
   (if matches!(b.unique_data,Some(InventoryUniqueData::Opaque{tag:1})){
    a.unique_data!=b.unique_data||
     (self.unique_quantity_ids.contains(&b.id)&&Self::legacy_furniture_materials(&reread.envelope.decoded,a)!=self.effective_unique(b).and_then(furniture_variant))
   }else if matches!(b.unique_data,Some(InventoryUniqueData::Opaque{tag:5})){
    a.unique_data!=b.unique_data||
     (self.unique_quantity_ids.contains(&b.id)&&Self::legacy_wand_identity_in(&reread.envelope.decoded,a)!=
      self.wand_variant_changes.get(&b.id).copied().or_else(||self.legacy_wand_identity(b)))
   }else if matches!(b.unique_data,Some(InventoryUniqueData::Opaque{tag:2})){
    a.unique_data!=b.unique_data||
     (self.unique_quantity_ids.contains(&b.id)&&Self::legacy_flower_variant(&reread.envelope.decoded,a)!=self.effective_unique(b).and_then(flower_variant))
   }else{a.unique_data!=self.effective_unique(b)})||
   if self.flower_variant_changes.contains_key(&b.id){
    a.unique_fields.len()!=4||b.unique_fields.len()!=4||
    (0..4).any(|i|{
     let original=self.original_flower_variant(b.id).unwrap();
     let next=self.flower_variant_changes[&b.id];
     original[i]==next[i]&&reread.envelope.decoded[a.unique_fields[i].clone()]!=original_payload[b.unique_fields[i].clone()]
    })
   }else if let Some(next)=self.furniture_variant_changes.get(&b.id){
    a.unique_fields.len()!=3||b.unique_fields.len()!=3||
    self.original_furniture_variant(b.id).is_none_or(|original|(0..3).any(|i|
     original[i]==next[i]&&reread.envelope.decoded[a.unique_fields[i].clone()]!=original_payload[b.unique_fields[i].clone()]))
   }else if let Some(next)=self.wand_variant_changes.get(&b.id){
    Self::wand_identity(a).or_else(||Self::legacy_wand_identity_in(&reread.envelope.decoded,a))!=Some(*next)||
    Self::wand_identity(b).or_else(||self.legacy_wand_identity(b)).is_none_or(|original|{
     if a.unique_fields.len()!=5||b.unique_fields.len()!=5{return true}
     if (0usize..5).any(|i|{
      let unchanged=match i{0=>original[0]==next[0],1=>original[3..]==next[3..],2=>original[1]==next[1],3=>original[2]==next[2],_=>true};
      unchanged&&reread.envelope.decoded[a.unique_fields[i].clone()]!=original_payload[b.unique_fields[i].clone()]
     }){return true}
     if original[3..]==next[3..]{return false}
     let old=&original_payload[b.unique_fields[1].clone()];let new=&reread.envelope.decoded[a.unique_fields[1].clone()];
     let (Ok(olds),Ok(news))=(Self::wand_material_spans(old,Self::wand_materials(original)),Self::wand_material_spans(new,Self::wand_materials(*next)))else{return true};
     old[..olds[0].start]!=new[..news[0].start]||(0..3).any(|i|original[i+3]==next[i+3]&&old[olds[i].clone()]!=new[news[i].clone()])
    })
   }else if let Some(next)=self.cafe_variant_changes.get(&b.id){
    Self::cafe_words(&reread.envelope.decoded,a)!=Some(*next)||
    Self::cafe_words(original_payload,b).is_none_or(|original|{
     let n=Self::cafe_count(original);let m=Self::cafe_count(*next);
     (0..2).any(|i|{
      let mut old=Cursor::new(&original_payload[b.unique_fields[i].clone()]);
      let mut new=Cursor::new(&reread.envelope.decoded[a.unique_fields[i].clone()]);
      if old.array().ok()!=Some(n)||new.array().ok()!=Some(m)||(n==m&&old.bytes[..old.pos]!=new.bytes[..new.pos]){return true}
      (0..n.min(m)).any(|j|{
       let x=old.pos;let y=new.pos;
       if old.int(1,i32::MAX as i128).is_err()||new.int(1,i32::MAX as i128).is_err(){return true}
       original[i*3+j]==next[i*3+j]&&old.bytes[x..old.pos]!=new.bytes[y..new.pos]
      })
     })
    })
   }else if let Some(next)=self.boba_variant_changes.get(&b.id){
    Self::boba_words(&reread.envelope.decoded,a)!=Some(*next)||
    Self::boba_words(original_payload,b).is_none_or(|original|(0..5).any(|i|
     original[i]==next[i]&&reread.envelope.decoded[a.unique_fields[i].clone()]!=original_payload[b.unique_fields[i].clone()]))
   }else if let Some(next)=self.palette_variant_changes.get(&b.id){
    a.unique_fields.len()!=3||b.unique_fields.len()!=3||
    Self::palette_identity(b).is_none_or(|original|(0..3).any(|i|
     original[i]==next[i]&&reread.envelope.decoded[a.unique_fields[i].clone()]!=original_payload[b.unique_fields[i].clone()]))
   }else{match (&a.fields[3],&b.fields[3]){
    (Some(a_span),Some(b_span))=>reread.envelope.decoded[a_span.clone()]!=
     self.slot.envelope.decoded[b_span.clone()],
    (None,None)=>false,_=>true
   }}
  }){return Err(Error::Schema)}
  let expected_achievements=self.achievements();
  if reread.index.achievements.len()!=expected_achievements.len() ||
   !reread.index.achievements.iter().zip(&expected_achievements).all(|(r,e)|r.guid==e.guid&&achievement::value(r).ok()==Some(e.value)){return Err(Error::Schema)}
  if reread.index.counters.len()!=self.slot.index.counters.len() ||
   !reread.index.counters.iter().zip(&self.slot.index.counters).all(|(a,b)|a.guid==b.guid&&a.state==b.state){return Err(Error::Schema)}
  if self.zip.is_none(){return Ok(new_slot)}
  let zip=self.zip.as_ref().unwrap();
  let candidate=replace_zip(&self.original,zip,&new_slot)?;
  let newzip=ZipIndex::parse(&candidate)?;
  if newzip.entries.len()!=zip.entries.len(){return Err(Error::Schema)}
  for (i,e) in zip.entries.iter().enumerate(){
   let f=&newzip.entries[i];
   if e.name!=f.name {return Err(Error::Schema)}
   if e.name==SLOT {
    if newzip.extract(&candidate,i)?!=new_slot{return Err(Error::Schema)}
   }else{
    if self.original[e.local.clone()]!=candidate[f.local.clone()] ||
      zip.extract(&self.original,i)?!=newzip.extract(&candidate,i)?{return Err(Error::Schema)}
   }
  }
  Ok(candidate)
 }

}

fn mp_u32(n:u32,out:&mut Vec<u8>){out.push(0xce);out.extend(n.to_be_bytes());}
fn encode_achievement_document(id:u32,guid:[u32;4],value:AchievementValue)->Result<Vec<u8>,Error>{
 if id>i32::MAX as u32||!achievement::valid(value){return Err(Error::Schema)}
 let mut out=vec![0x92,0x10,0x93]; // IDocument Union(16) -> AchievementModel[Id,Hash128,AchievementData]
 mp_u32(id,&mut out);
 // Hash128 is FOUR consecutively encoded UInt32 tokens, not a nested array.
 for word in guid{mp_u32(word,&mut out);}
 out.push(0x93);out.push(if value.complete{0xc3}else{0xc2});
 out.push(0xca);out.extend(value.current.to_bits().to_be_bytes());
 if let Some((seconds,nanos))=value.completed{
  out.extend([0xc7,12,0xff]);out.extend(nanos.to_be_bytes());out.extend(seconds.to_be_bytes());
 }else{out.push(0xc0)}
 Ok(out)
}

fn mp_map_len(n:usize)->Result<Vec<u8>,Error>{
 if n>1_000_000{return Err(Error::Budget)}
 if n<16{return Ok(vec![0x80|n as u8])}
 if n<=65535{let mut v=vec![0xde];v.extend((n as u16).to_be_bytes());return Ok(v)}
 let mut v=vec![0xdf];v.extend((n as u32).to_be_bytes());Ok(v)
}
fn encode_pair(id:i32,ticks:i64)->[u8;14]{
 let mut v=[0u8;14];v[0]=0xd2;v[1..5].copy_from_slice(&id.to_be_bytes());v[5]=0xd3;v[6..14].copy_from_slice(&ticks.to_be_bytes());v
}
fn replace_map(raw:&[u8],map:Range<usize>,before:&[crate::native::CollectionEntry],after:&[Entry])->Result<Vec<u8>,Error>{
 if map.start>=map.end||map.end>raw.len(){return Err(Error::Schema)}
 let mut cursor=Cursor::new(&raw[map.clone()]);
 if cursor.map()?!=before.len(){return Err(Error::Schema)}
 let body_start=map.start+cursor.pos;
 let mut at=body_start;
 let mut old=HashMap::new();
 for r in before{
  if r.pair.start!=at||r.pair.end>map.end||r.pair.end<=r.pair.start||r.value.start<r.pair.start||r.value.end!=r.pair.end{return Err(Error::Schema)}
  old.insert(r.id,r);at=r.pair.end;
 }
 if at!=map.end||old.len()!=before.len(){return Err(Error::Schema)}
 let mut seen=HashSet::new();
 for x in after{
  if !seen.insert(x.id){return Err(Error::Schema)}
  if !old.contains_key(&x.id)&&!(1..=MAX_TICKS).contains(&x.ticks){return Err(Error::Schema)}
 }
 let mut out=Vec::with_capacity(raw.len().saturating_add(after.len().saturating_mul(14)));
 out.extend_from_slice(&raw[..map.start]);out.extend(mp_map_len(after.len())?);
 for x in after{
  if let Some(b)=old.get(&x.id){
   if x.ticks==b.ticks{out.extend_from_slice(&raw[b.pair.clone()])}
   else{
    out.extend_from_slice(&raw[b.pair.start..b.value.start]);
    out.push(0xd3);out.extend(x.ticks.to_be_bytes());
   }
  }else{out.extend(encode_pair(x.id,x.ticks));}
  if out.len()>MAX_DECODED{return Err(Error::Budget)}
 }
 out.extend_from_slice(&raw[map.end..]);
 if out.len()>MAX_DECODED{return Err(Error::Budget)}
 Ok(out)
}

fn push_lz4_length(dst:&mut Vec<u8>,mut len:usize){while len>=255 {dst.push(255);len-=255;}dst.push(len as u8)}
fn literal_block(s:&[u8],start:usize)->Vec<u8>{
 let n=s.len()-start;
 let mut out=vec![(n.min(15)as u8)<<4];
 if n>=15{push_lz4_length(&mut out,n-15)}
 out.extend(&s[start..]);out
}
fn compress(s:&[u8])->Result<Vec<u8>,Error>{
 if s.is_empty()||s.len()>MAX_BLOCK{return Err(Error::Budget)}
 let literal=literal_block(s,0);
 if s.len()<13{return Ok(literal)}
 let mut hist=vec![usize::MAX;65536];
 let hash=|p:usize|->usize{(u32::from_le_bytes(s[p..p+4].try_into().unwrap()).wrapping_mul(0x9e3779b1)>>16)as usize};
 let mut out=Vec::new();let (mut anchor,mut p)=(0,0);
 let last=s.len()-12;let limit=s.len()-5;
 while p<=last{
  let h=hash(p);let prev=hist[h];hist[h]=p;
  if prev==usize::MAX||p-prev>65535||s[prev..prev+4]!=s[p..p+4]{p+=1;continue}
  let mut m=4;while p+m<limit&&s[prev+m]==s[p+m]{m+=1}
  let n=p-anchor;out.push(((n.min(15)as u8)<<4)|((m-4).min(15)as u8));
  if n>=15{push_lz4_length(&mut out,n-15)}
  out.extend(&s[anchor..p]);out.extend(((p-prev)as u16).to_le_bytes());
  if m-4>=15{push_lz4_length(&mut out,m-19)}
  let end=p+m;for k in p+1..end.min(last+1){hist[hash(k)]=k}
  anchor=end;p=end;
 }
 out.extend(literal_block(s,anchor));
 if out.len()>=literal.len(){out=literal}
 if decode_block(&out,s.len())?!=s{return Err(Error::Schema)}
 Ok(out)
}
fn mp_bin(bytes:&[u8],out:&mut Vec<u8>)->Result<(),Error>{
 out.push(0xc6);out.extend(u32::try_from(bytes.len()).map_err(|_|Error::Budget)?.to_be_bytes());out.extend(bytes);Ok(())
}
fn encode_slot(original:&[u8],parsed:&ReadSlot,decoded:&[u8],first_change:usize)->Result<Vec<u8>,Error>{
 let e=&parsed.envelope;
 let first=e.blocks.iter().position(|b|b.decoded.end>first_change).ok_or(Error::Schema)?;
 let prefix=e.blocks[first].decoded.start;
 if decoded.len()<prefix||decoded[..prefix]!=e.decoded[..prefix]{return Err(Error::Schema)}
 let mut encoded=Vec::new();let mut lengths=Vec::new();
 for b in &e.blocks[..first]{
  encoded.push(original[b.compressed.clone()].to_vec());
  lengths.push(b.decoded.len());
 }
 let limit=if e.blocks.iter().any(|b|b.decoded.len()>32768){65536}else{32768};
 for block in decoded[prefix..].chunks(limit){
  encoded.push(compress(block)?);lengths.push(block.len());
 }
 if lengths.len()>MAX_BLOCKS||lengths.is_empty(){return Err(Error::Budget)}
 let start=e.marker.checked_add(32).ok_or(Error::Overflow)?;
 let mut out=original[..start].to_vec();
 let count=lengths.len()+1;
 if count<16{out.push(0x90|count as u8)}
 else{out.push(0xdc);out.extend((count as u16).to_be_bytes())}
 let mut ext=Vec::new();
 for &n in &lengths{
  if n==0||n>MAX_BLOCK{return Err(Error::Budget)}
  if n<=65535 {ext.push(0xcd);ext.extend((n as u16).to_be_bytes())}
  else{ext.push(0xce);ext.extend((n as u32).to_be_bytes())}
 }
 out.push(0xc8);out.extend((ext.len() as u16).to_be_bytes());out.push(98);out.extend(ext);
 for block in &encoded{mp_bin(block,&mut out)?;if out.len()>MAX_INPUT{return Err(Error::Budget)}}
 let reread=read_slot(&out)?;
 if reread.envelope.decoded!=decoded||reread.envelope.version!=e.version{return Err(Error::Schema)}
 Ok(out)
}
fn put16(x:&mut[u8],p:usize,n:u16){x[p..p+2].copy_from_slice(&n.to_le_bytes())}
fn put32(x:&mut[u8],p:usize,n:u32){x[p..p+4].copy_from_slice(&n.to_le_bytes())}
fn replace_zip(raw:&[u8],z:&ZipIndex,replacement:&[u8])->Result<Vec<u8>,Error>{
 let target=z.entries.iter().position(|e|e.name==SLOT).ok_or(Error::Schema)?;
 let mut order:Vec<_>=(0..z.entries.len()).collect();order.sort_by_key(|&i|z.entries[i].local.start);
 let mut at=0;
 for &i in &order{if z.entries[i].local.start!=at{return Err(Error::Schema)}at=z.entries[i].local.end}
 if at!=z.central.start{return Err(Error::Schema)}
 let n=u32::try_from(replacement.len()).map_err(|_|Error::Budget)?;let crc=crc32(replacement);
 let mut out=Vec::new();let mut offsets=HashMap::new();
 for i in order{
  let e=&z.entries[i];offsets.insert(i,u32::try_from(out.len()).map_err(|_|Error::Budget)?);
  if i!=target {out.extend_from_slice(&raw[e.local.clone()]);continue}
  let mut head=raw[e.local.start..e.compressed.start].to_vec();
  put16(&mut head,8,0);
  if e.flags&8!=0{put32(&mut head,14,0);put32(&mut head,18,0);put32(&mut head,22,0)}
  else{put32(&mut head,14,crc);put32(&mut head,18,n);put32(&mut head,22,n)}
  out.extend(head);out.extend(replacement);
  if e.flags&8!=0{
   if e.local.end-e.compressed.end==16{out.extend(0x08074b50u32.to_le_bytes())}
   else if e.local.end-e.compressed.end!=12{return Err(Error::Schema)}
   out.extend(crc.to_le_bytes());out.extend(n.to_le_bytes());out.extend(n.to_le_bytes());
  }
 }
 let central=out.len();
 for (i,e) in z.entries.iter().enumerate(){
  let mut data=raw[e.central.clone()].to_vec();
  put32(&mut data,42,*offsets.get(&i).ok_or(Error::Schema)?);
  if i==target{put16(&mut data,10,0);put32(&mut data,16,crc);put32(&mut data,20,n);put32(&mut data,24,n)}
  out.extend(data);
 }
 let size=out.len()-central;
 let mut footer=raw[z.eocd.clone()].to_vec();
 put32(&mut footer,12,size as u32);put32(&mut footer,16,central as u32);out.extend(footer);
 if out.len()>MAX_ARCHIVE{return Err(Error::Budget)}
 Ok(out)
}

#[cfg(test)]
mod tests {
 #[test]
 fn required_unique_source_catalog_has_no_unclassified_bag_family(){
  use crate::inventory_source as source;
  let mut counts=[0;4];
  for &(item,flags) in crate::inventory_source_data::RULES{
   if flags!=3{continue}
   let classes=[super::Editor::is_flower_quantity_definition(item),
    source::CAFE_IDS.binary_search(&item).is_ok()||item==source::BOBA_ID,
    item==source::CUSTOM_PALETTE_ID,source::wand_output_item(item)];
   assert_eq!(classes.iter().filter(|&&v|v).count(),1,"required-unique Item ID {item}");
   for (i,found) in classes.into_iter().enumerate(){if found{counts[i]+=1;}}
  }
  assert_eq!(counts.iter().sum::<usize>(),136);
 }

 use super::*;
 #[test]
 fn reencode_and_decode_lz4_roundtrip(){
  for size in [1,12,100,32768,65536]{
   let src=(0..size).map(|i|(i%47)as u8).collect::<Vec<_>>();
   let c=compress(&src).unwrap();assert_eq!(decode_block(&c,src.len()).unwrap(),src);
  }
 }
 #[test]
 fn map_header_works(){
  assert_eq!(mp_map_len(1).unwrap(),[0x81]);
  assert_eq!(mp_map_len(16).unwrap(),[0xde,0,16]);
 }

 // Small *synthetic* HKIA v3.0.1 source-shaped slot. No player save data.
 // An in-module test is needed to put revision at the u32 boundary without
 // changing the public API or introducing a test-only production backdoor.
 fn revision_test_slot()->Vec<u8>{
  fn u(n:u32)->Vec<u8>{let mut b=vec![0xce];b.extend(n.to_be_bytes());b}
  fn f(n:f32)->Vec<u8>{let mut b=vec![0xca];b.extend(n.to_be_bytes());b}
  fn i(n:i64)->Vec<u8>{let mut b=vec![0xd3];b.extend(n.to_be_bytes());b}
  fn array(parts:Vec<Vec<u8>>)->Vec<u8>{
   assert!(parts.len()<16);
   let mut out=vec![0x90|parts.len() as u8];
   for part in parts{out.extend(part)}out
  }
  fn map(pairs:Vec<(Vec<u8>,Vec<u8>)>)->Vec<u8>{
   assert!(pairs.len()<16);
   let mut out=vec![0x80|pairs.len() as u8];
   for (k,v) in pairs{out.extend(k);out.extend(v)}out
  }
  fn guid(words:[u32;4])->Vec<u8>{words.into_iter().flat_map(u).collect()}
  fn document(tag:u8,body:Vec<u8>)->Vec<u8>{array(vec![vec![tag],body])}
  let mut name=vec![0xa5];name.extend(b"3.0.1");
  let version=document(18,array(vec![vec![0],u(87),name]));
  let achievement_a=document(16,array(vec![vec![1],guid([1,0,0,1]),
   array(vec![vec![0xc2],f(1.0),vec![0xc0]])]));
  let achievement_b=document(16,array(vec![vec![2],guid([2,0,0,1]),
   array(vec![vec![0xc2],f(2.0),vec![0xc0]])]));
  let counter=document(17,array(vec![vec![1],guid([1,0,0,2]),
   array(vec![f(2.0),vec![0xc0],vec![0x90]])]));
  let collection=document(39,array(vec![map(vec![]),
   map(vec![(vec![2],i(638000000000000001)),(vec![3],i(9))])]));
  let object=document(32,array(vec![vec![3],guid([0,0,0,3]),
   vec![0],array(vec![collection])]));
  let payload=array(vec![vec![0],vec![4],array(vec![
   version,achievement_a,achievement_b,counter,object
  ])]);
  let mut compressed=vec![0xf0];let mut left=payload.len()-15;
  while left>=255{compressed.push(255);left-=255}
  compressed.push(left as u8);compressed.extend(&payload);
  let prefix=[0x13,0x5b,0x4a,0xa4,0xf7,0x02,0xa4,0x5d,0x1c,0xc5,0x62,0xae,0xb5,0xa3,0x86,0xed,
   0x5d,0x17,0xe1,0xfd,0x58,0x8f,0x42,0x4d,0xcf,0xc5,0x9d,0x2e,0x14,0x0c,0xf5,0x97];
  let magic=[0xa1,0xa2,0xf8,0x33,0x3c,0x66,0xec,0x45,0x5b,0xaa,0x2d,0xfc,0x63,0x25,0xc2,0x43,
   0x7a,0x77,0x9c,0x99,0x06,0xee,0xcf,0xf0,0xc0,0x22,0xe5,0xf6,0xb6,0xca,0x73,0xb8];
  let mut slot=prefix.to_vec();slot.push(0x98);
  for _ in 0..4{slot.extend(u(0))}
  slot.push(0xa5);slot.extend(b"3.0.1");slot.extend(u(30001));
  slot.extend([0x92,0xd6,0xff]);slot.extend(1_750_000_000u32.to_be_bytes());
  slot.extend([0,0,0x80,0x90,0x91,9]);slot.extend(magic);
  slot.extend([0x92,0xc8,0,3,98,0xcd]);slot.extend((payload.len() as u16).to_be_bytes());
  slot.push(0xc6);slot.extend((compressed.len() as u32).to_be_bytes());slot.extend(compressed);
  slot
 }

 #[test]
 fn historical_display_is_independent_of_mutation_eligibility(){
  let original=revision_test_slot();
  let mut editor=Editor::open(original.clone()).unwrap();
  fn uint(n:u32)->Vec<u8>{let mut b=vec![0xce];b.extend(n.to_be_bytes());b}
  fn guid(g:[u32;4])->Vec<u8>{g.into_iter().flat_map(uint).collect()}
  fn row(editor:&mut Editor,id:u32,item:i32,tag:i32,parts:Vec<Vec<u8>>)->crate::native::InventoryRow{
   let mut spans=Vec::new();
   for part in parts{
    let start=editor.slot.envelope.decoded.len();
    editor.slot.envelope.decoded.extend(part);
    spans.push(start..editor.slot.envelope.decoded.len());
   }
   crate::native::InventoryRow{id,item_id:Some(item),unique_id:Some(id as i32),quantity:Some(1),
    fields:[None,None,None,None],unique_is_nil:Some(false),unique_data:Some(InventoryUniqueData::Opaque{tag}),unique_fields:spans}
  }
  let flower=row(&mut editor,100,43114910,2,vec![vec![6],guid(LEGACY_FLOWER_COLOR_GUIDS[1]),guid(LEGACY_FLOWER_PATTERN_GUIDS[0]),guid(LEGACY_FLOWER_COLOR_GUIDS[0])]);
  let furniture=row(&mut editor,101,61381969,1,vec![guid([0;4]),guid([0;4]),guid([0;4])]);
  let (source_guid,source_id)=crate::inventory_legacy_wand_guid_data::OTHER_NATIVE_ITEM_GUIDS[0];
  assert!(crate::inventory_source::legacy_wand_source_id(source_guid).is_none());
  let wand=row(&mut editor,102,384749651,5,vec![guid(source_guid),vec![0xc0],uint(104),uint(125),uint(0)]);
  let unknown=row(&mut editor,103,384749651,5,vec![guid([u32::MAX;4]),vec![0xc0],uint(104),uint(125),uint(0)]);
  let magic=row(&mut editor,104,1429161083,5,vec![guid([0;4]),vec![0xc0],uint(104),uint(125),uint(118)]);
  let nested=row(&mut editor,105,384749651,5,vec![guid(source_guid),vec![0x92,0x04,0x95,6,1,2,3,4],uint(104),uint(125),uint(0)]);
  assert_eq!(editor.displayed_unique(&flower).unwrap().display_words(),(7,vec![6,1,0,0]));
  assert_eq!(editor.displayed_unique(&furniture).unwrap().display_words(),(8,vec![0,0,0]));
  assert_eq!(editor.displayed_unique(&wand).unwrap().display_words(),(9,vec![source_id as u32,104,125,0,u32::MAX,0]));
  assert_eq!(editor.displayed_unique(&magic).unwrap().display_words(),(9,vec![0,104,125,118,u32::MAX,0]));
  assert_eq!(editor.displayed_unique(&nested).unwrap().display_words(),(9,vec![source_id as u32,104,125,0,4,0]));
  assert_eq!(editor.displayed_unique(&unknown),unknown.unique_data);
  for r in [&flower,&furniture,&wand,&magic,&nested,&unknown]{
   assert_eq!(editor.effective_unique(r),r.unique_data);
   assert!(!editor.unique_quantity_ids.contains(&r.id));
  }
  editor.slot.index.inventory.extend([flower,furniture,wand,unknown,magic,nested]);
  assert_eq!(editor.inventory_flowers().collect::<Vec<_>>(),vec![(100,6,1,0,0)]);
  assert_eq!(editor.inventory_unique_rows().find(|r|r.0==102).unwrap().3.unwrap().display_words().1[0],source_id as u32);
  assert_eq!(editor.inventory_flower_edit_hints().count(),0);
  assert_eq!(editor.inventory_furniture_edit_hints().count(),0);
  assert_eq!(editor.inventory_wand_edit_hints().count(),0);
  assert_eq!(editor.inventory_unique_data(102),Some(InventoryUniqueData::Opaque{tag:5}));
  assert_eq!(editor.revision(),0);
 }

 #[test]
 fn revision_overflow_rejects_both_edits_without_changing_native_data_or_history(){
  let original=revision_test_slot();
  let mut editor=Editor::open(original.clone()).expect("synthetic source must parse");
  let guid=[1,0,0,1];
  let before=editor.achievement_value(guid).unwrap();
  let done=AchievementValue{complete:true,current:2.0,
   completed:Some((1_750_000_000,123_456_700))};
  // Populate a redo branch: a rejected edit must not truncate it.
  editor.change_achievement(guid,before,done).unwrap();
  assert!(editor.undo());
  assert!(editor.can_redo());
  let expected_history=editor.history();
  let expected_achievements=editor.achievements();
  let expected_entries=editor.entries();
  editor.revision=u32::MAX;
  assert_eq!(editor.change(2,Some(638000000000000001),
   Some(638000000000010001)),Err(Error::Overflow));
  assert_eq!(editor.change_achievement(guid,before,done),Err(Error::Overflow));
  assert_eq!(editor.revision(),u32::MAX);
  assert_eq!(editor.history(),expected_history,"failed CAS removed redo or added undo");
  assert_eq!(editor.achievements(),expected_achievements);
  assert_eq!(editor.entries(),expected_entries);
  assert!(!editor.dirty(),"failed mutations must not become exportable");
  assert!(editor.can_redo());
  // A prior successful transaction is still redoable, exportable, and reparsed.
  assert!(editor.redo());
  let saved=editor.export().unwrap();
  let reread=Editor::open(saved).unwrap();
  assert_eq!(reread.achievement_value(guid),Some(done));
  assert_eq!(reread.value(2),Some(638000000000000001));
  assert_eq!(Editor::open(original).unwrap().achievement_value(guid),Some(before));
 }
}


/// A bounded, local-only transaction checkpoint. This is NOT a save format.
/// Every edit is reconstructed from the original source using the regular
/// source-validated CAS APIs before any recovered history is committed.
const HISTORY_MAGIC:&[u8;8]=b"HKIAHS01";
// The entire 256-step journal fits even when every step has 256 quantity deltas.
pub const HISTORY_MAX_BYTES:usize=1024*1024;
const _:()=assert!(16+MAX_UNDO*(5+MAX_INVENTORY_BATCH*12)<=HISTORY_MAX_BYTES);

struct HistoryCursor<'a>{bytes:&'a [u8],pos:usize}
impl<'a> HistoryCursor<'a>{
 fn take(&mut self,n:usize)->Result<&'a [u8],Error>{
  let end=self.pos.checked_add(n).ok_or(Error::Overflow)?;
  let bytes=self.bytes.get(self.pos..end).ok_or(Error::Truncated)?;
  self.pos=end;Ok(bytes)
 }
 fn byte(&mut self)->Result<u8,Error>{Ok(self.take(1)?[0])}
 fn u32(&mut self)->Result<u32,Error>{Ok(u32::from_le_bytes(self.take(4)?.try_into().map_err(|_|Error::Schema)?))}
 fn i32(&mut self)->Result<i32,Error>{Ok(i32::from_le_bytes(self.take(4)?.try_into().map_err(|_|Error::Schema)?))}
 fn i64(&mut self)->Result<i64,Error>{Ok(i64::from_le_bytes(self.take(8)?.try_into().map_err(|_|Error::Schema)?))}
 fn guid(&mut self)->Result<[u32;4],Error>{Ok([self.u32()?,self.u32()?,self.u32()?,self.u32()?])}
 fn ticks(&mut self)->Result<Option<i64>,Error>{
  let present=self.byte()?;let value=self.i64()?;
  if present>1||(present==0&&value!=0){return Err(Error::Schema)}
  Ok(if present==1{Some(value)}else{None})
 }
 fn value(&mut self)->Result<AchievementValue,Error>{
  let complete=self.byte()?;let current=f32::from_bits(self.u32()?);
  let dated=self.byte()?;let seconds=self.i64()?;let nanos=self.u32()?;
  if complete>1||dated>1||(dated==0&&(seconds!=0||nanos!=0)){return Err(Error::Schema)}
  let value=AchievementValue{complete:complete==1,current,completed:if dated==1{Some((seconds,nanos))}else{None}};
  if !achievement::valid(value){return Err(Error::Schema)}Ok(value)
 }
 fn optional_value(&mut self)->Result<Option<AchievementValue>,Error>{
  match self.byte()?{0=>{let bytes=self.take(18)?;if bytes.iter().any(|&b|b!=0){return Err(Error::Schema)}Ok(None)},
   1=>Ok(Some(self.value()?)),_=>Err(Error::Schema)}
 }
}
fn history_write_guid(out:&mut Vec<u8>,guid:[u32;4]){for word in guid{out.extend(word.to_le_bytes())}}
fn history_write_ticks(out:&mut Vec<u8>,ticks:Option<i64>){
 out.push(u8::from(ticks.is_some()));out.extend(ticks.unwrap_or(0).to_le_bytes());
}
fn history_write_value(out:&mut Vec<u8>,v:AchievementValue){
 out.push(u8::from(v.complete));out.extend(v.current.to_bits().to_le_bytes());
 out.push(u8::from(v.completed.is_some()));
 let (sec,nano)=v.completed.unwrap_or((0,0));
 out.extend(sec.to_le_bytes());out.extend(nano.to_le_bytes());
}
fn history_write_optional_value(out:&mut Vec<u8>,v:Option<AchievementValue>){
 out.push(u8::from(v.is_some()));
 if let Some(v)=v{history_write_value(out,v)}else{out.extend([0u8;18]);}
}
impl Editor {
 fn history_original_achievement(&self,guid:[u32;4])->Result<AchievementValue,Error>{
  let model=self.slot.index.achievements.iter().find(|m|m.guid==guid).ok_or(Error::Schema)?;
  achievement::value(model)
 }
 fn history_effective_achievement(&self,guid:[u32;4],created:bool,override_value:Option<AchievementValue>)->Result<AchievementValue,Error>{
  if created{override_value.ok_or(Error::Schema)}
  else{match override_value{Some(v)=>Ok(v),None=>self.history_original_achievement(guid)}}
 }
 /// Export exact native transactions, including paired achievement operations,
 /// plus the positions of both scoped undo and redo stacks.
 pub fn history_checkpoint(&self)->Result<Vec<u8>,Error>{
  if self.undo.len()+self.redo.len()>MAX_UNDO{return Err(Error::Budget)}
  let mut out=Vec::with_capacity(16+self.undo.len()*96+self.redo.len()*96);
  out.extend(HISTORY_MAGIC);
  out.extend(u32::try_from(self.undo.len()+self.redo.len()).map_err(|_|Error::Budget)?.to_le_bytes());
  out.extend(u32::try_from(self.undo.len()).map_err(|_|Error::Budget)?.to_le_bytes());
  for change in self.undo.iter().chain(self.redo.iter().rev()){
   match *change {
    Change::Collection{id,before,after}=>{
     out.push(0);out.extend(id.to_le_bytes());
     history_write_ticks(&mut out,before.unwrap_or_else(||self.base.get(&id).copied()));
     history_write_ticks(&mut out,after.unwrap_or_else(||self.base.get(&id).copied()));
    }
    Change::Inventory{document_id,before,after}=>{
     out.push(6);out.extend(document_id.to_le_bytes());
     let original=if document_id&PENDING_ITEM!=0{0}else{self.slot.index.inventory.iter().find(|r|r.id==document_id)
      .and_then(|r|r.quantity).ok_or(Error::Schema)?};
     out.extend(before.unwrap_or(original).to_le_bytes());
     out.extend(after.unwrap_or(original).to_le_bytes());
    }
    Change::InventoryBatch{ref deltas}=>{
     out.push(10);out.extend((deltas.len() as u32).to_le_bytes());
     for &InventoryQuantityDelta{document_id,before,after} in deltas{
      let original=if document_id&PENDING_ITEM!=0{0}else{self.slot.index.inventory.iter().find(|r|r.id==document_id)
       .and_then(|r|r.quantity).ok_or(Error::Schema)?};
      out.extend(document_id.to_le_bytes());
      out.extend(before.unwrap_or(original).to_le_bytes());
      out.extend(after.unwrap_or(original).to_le_bytes());
     }
    }
    Change::FlowerCreated{document_id,source_id,expected,flower,quantity}=>{
     out.push(11);out.extend(document_id.to_le_bytes());out.extend(source_id.to_le_bytes());out.extend(flower.item_id.to_le_bytes());
     for n in expected.into_iter().chain(flower.variant){out.extend(n.to_le_bytes());}
     out.extend(quantity.to_le_bytes());
    }
    Change::FlowerVariant{document_id,before,after}=>{
     out.push(8);out.extend(document_id.to_le_bytes());
     let original=self.original_flower_variant(document_id).or_else(||self.undo.iter().chain(&self.redo).find_map(|c|match c{Change::FlowerCreated{document_id:id,flower,..} if *id==document_id=>Some(flower.variant),_=>None})).ok_or(Error::Schema)?;
     for word in before.unwrap_or(original){out.extend(word.to_le_bytes());}
     for word in after.unwrap_or(original){out.extend(word.to_le_bytes());}
    }
    Change::FurnitureCreated{document_id,source_id,expected,furniture,quantity}=>{
     out.push(12);out.extend(document_id.to_le_bytes());out.extend(source_id.to_le_bytes());out.extend(furniture.item_id.to_le_bytes());
     for n in expected.into_iter().chain(furniture.variant){out.extend(n.to_le_bytes());}out.extend(quantity.to_le_bytes());
    }
    Change::FurnitureVariant{document_id,before,after}=>{
     out.push(9);out.extend(document_id.to_le_bytes());
     let original=self.original_furniture_variant(document_id).or_else(||self.undo.iter().chain(&self.redo).find_map(|c|match c{Change::FurnitureCreated{document_id:id,furniture,..} if *id==document_id=>Some(furniture.variant),_=>None})).ok_or(Error::Schema)?;
     for word in before.unwrap_or(original){out.extend(word.to_le_bytes());}
     for word in after.unwrap_or(original){out.extend(word.to_le_bytes());}
    }
    Change::PaletteCreated{document_id,source_id,expected,variant,quantity}=>{
     out.push(14);out.extend(document_id.to_le_bytes());out.extend(source_id.to_le_bytes());
     for bits in expected.into_iter().flatten().chain(variant.into_iter().flatten()){out.extend(bits.to_le_bytes());}
     out.extend(quantity.to_le_bytes());
    }
    Change::CafeCreated{document_id,source_id,item_id,expected,variant,quantity}=>{
     out.push(17);out.extend(document_id.to_le_bytes());out.extend(source_id.to_le_bytes());out.extend(item_id.to_le_bytes());
     for word in expected.into_iter().chain(variant){out.extend(word.to_le_bytes());}out.extend(quantity.to_le_bytes());
    }
    Change::CafeVariant{document_id,before,after}=>{
     out.push(16);out.extend(document_id.to_le_bytes());
     let original=self.original_cafe_variant(document_id).or_else(||self.undo.iter().chain(&self.redo).find_map(|c|match c{Change::CafeCreated{document_id:id,variant,..} if *id==document_id=>Some(*variant),_=>None})).ok_or(Error::Schema)?;
     for word in before.unwrap_or(original).into_iter().chain(after.unwrap_or(original)){out.extend(word.to_le_bytes());}
    }
    Change::WandCreated{document_id,source_id,item_id,expected,expected_nested,identity,quantity}=>{
     out.push(if expected_nested.is_some(){23}else{20});out.extend(document_id.to_le_bytes());out.extend(source_id.to_le_bytes());out.extend(item_id.to_le_bytes());
     if let Some(before)=expected_nested{
      for word in before.into_iter().chain(identity){out.extend(word.to_le_bytes());}
     }else{
      for word in expected.into_iter().chain(Self::wand_pair(identity)){out.extend(word.to_le_bytes());}
     }
     out.extend(quantity.to_le_bytes());
    }
    Change::WandVariant{document_id,before,after}=>{
     let original=self.original_wand_identity(document_id).or_else(||self.undo.iter().chain(&self.redo).find_map(|c|match c{Change::WandCreated{document_id:id,identity,..} if *id==document_id=>Some(*identity),_=>None})).ok_or(Error::Schema)?;
     let before=before.unwrap_or(original);let after=after.unwrap_or(original);
     if Self::wand_materials(before)!=WAND_NIL_MATERIALS{
      out.push(22);out.extend(document_id.to_le_bytes());
      for word in before.into_iter().chain(after){out.extend(word.to_le_bytes());}
     }else if before[0]==after[0]{
      out.push(19);out.extend(document_id.to_le_bytes());
      for word in before[1..3].iter().chain(&after[1..3]){out.extend(word.to_le_bytes());}
     }else{
      out.push(21);out.extend(document_id.to_le_bytes());
      for word in before[..3].iter().chain(&after[..3]){out.extend(word.to_le_bytes());}
     }
    }
    Change::BobaCreated{document_id,source_id,expected,variant,quantity}=>{
     out.push(18);out.extend(document_id.to_le_bytes());out.extend(source_id.to_le_bytes());
     for word in expected.into_iter().chain(variant){out.extend(word.to_le_bytes());}out.extend(quantity.to_le_bytes());
    }
    Change::BobaVariant{document_id,before,after}=>{
     out.push(15);out.extend(document_id.to_le_bytes());
     let original=self.original_boba_variant(document_id).or_else(||self.undo.iter().chain(&self.redo).find_map(|c|match c{Change::BobaCreated{document_id:id,variant,..} if *id==document_id=>Some(*variant),_=>None})).ok_or(Error::Schema)?;
     for word in before.unwrap_or(original).into_iter().chain(after.unwrap_or(original)){out.extend(word.to_le_bytes());}
    }
    Change::PaletteVariant{document_id,before,after}=>{
     out.push(13);out.extend(document_id.to_le_bytes());
     let original=self.original_palette_variant(document_id).or_else(||self.undo.iter().chain(&self.redo).find_map(|c|match c{Change::PaletteCreated{document_id:id,variant,..} if *id==document_id=>Some(*variant),_=>None})).ok_or(Error::Schema)?;
     for bits in before.unwrap_or(original).into_iter().flatten().chain(after.unwrap_or(original).into_iter().flatten()){out.extend(bits.to_le_bytes());}
    }
    Change::Achievement{guid,before,after}=>{
     out.push(1);history_write_guid(&mut out,guid);
     history_write_value(&mut out,self.history_effective_achievement(guid,false,before)?);
     history_write_value(&mut out,self.history_effective_achievement(guid,false,after)?);
    }
    Change::AchievementCreated{guid,before,after}=>{
     if let Some(value)=before{
      out.push(1);history_write_guid(&mut out,guid);
      history_write_value(&mut out,value);
      history_write_value(&mut out,after.ok_or(Error::Schema)?);
     }else{
      out.push(2);history_write_guid(&mut out,guid);
      history_write_value(&mut out,after.ok_or(Error::Schema)?);
     }
    }
    Change::AchievementCreatedPair{guid,value,parent:(pg,before,after)}=>{
     out.push(3);history_write_guid(&mut out,guid);history_write_value(&mut out,value);
     history_write_guid(&mut out,pg);
     history_write_value(&mut out,self.history_effective_achievement(pg,false,before)?);
     history_write_value(&mut out,self.history_effective_achievement(pg,false,after)?);
    }
    Change::AchievementParentNew{child:(guid,created,before,after),parent:(pg,value)}=>{
     out.push(4);history_write_guid(&mut out,guid);
     let old=if created{before}else{Some(self.history_effective_achievement(guid,false,before)?)};
     history_write_optional_value(&mut out,old);
     history_write_value(&mut out,self.history_effective_achievement(guid,created,after)?);
     history_write_guid(&mut out,pg);history_write_value(&mut out,value);
    }
    Change::AchievementPair{first,second}=>{
     out.push(5);
     for (guid,created,before,after) in [first,second]{
      history_write_guid(&mut out,guid);
      history_write_value(&mut out,self.history_effective_achievement(guid,created,before)?);
      history_write_value(&mut out,self.history_effective_achievement(guid,created,after)?);
     }
    }
   }
  }
  if out.len()>HISTORY_MAX_BYTES{return Err(Error::Budget)}
  Ok(out)
 }
 /// Atomic restore: the existing editor is unchanged on any parsing, source,
 /// CAS, version, grouping, or timeline disagreement. The recovered operation
 /// trail is roundtrip-compared byte-for-byte against the canonical native log.
 pub fn restore_history(&mut self,checkpoint:&[u8])->Result<(),Error>{
  if checkpoint.len()<16||checkpoint.len()>HISTORY_MAX_BYTES||self.dirty()||
   self.can_undo()||self.can_redo(){return Err(Error::Schema)}
  let mut r=HistoryCursor{bytes:checkpoint,pos:0};
  if r.take(HISTORY_MAGIC.len())?!=HISTORY_MAGIC{return Err(Error::Schema)}
  let count=r.u32()? as usize;
  let active=r.u32()? as usize;
  if count>MAX_UNDO||active>count{return Err(Error::Budget)}
  let mut candidate=Self::open(self.original.clone())?;
  let mut scopes=Vec::with_capacity(count);
  for _ in 0..count{
   let kind=r.byte()?;
   match kind {
    0=>{
     let id=r.i32()?;let before=r.ticks()?;let after=r.ticks()?;
     candidate.change(id,before,after)?;
     scopes.push(HistoryScope::Collections);
    }
    6=>{
     let id=r.u32()?;let before=r.i32()?;let after=r.i32()?;
     candidate.change_inventory_quantity(id,before,after)?;
     scopes.push(HistoryScope::Inventory);
    }
    10=>{
     let n=r.u32()? as usize;
     if n==0||n>MAX_INVENTORY_BATCH{return Err(Error::Budget)}
     let mut requests=Vec::with_capacity(n);
     for _ in 0..n{requests.push((r.u32()?,r.i32()?,r.i32()?));}
     candidate.change_inventory_quantities(&requests)?;
     scopes.push(HistoryScope::Inventory);
    }
    11=>{
     let handle=r.u32()?;let source=r.u32()?;let item=r.i32()?;
     let before=[r.i32()?,r.i32()?,r.i32()?,r.i32()?];let after=[r.i32()?,r.i32()?,r.i32()?,r.i32()?];
     let quantity=r.i32()?;
     if candidate.create_inventory_flower_variant(source,before,after,quantity)?!=handle||
      candidate.pending_flowers.get(&handle).map(|f|f.item_id)!=Some(item){return Err(Error::Schema)}
     scopes.push(HistoryScope::Inventory);
    }
    8=>{
     let id=r.u32()?;
     let before=[r.i32()?,r.i32()?,r.i32()?,r.i32()?];
     let after=[r.i32()?,r.i32()?,r.i32()?,r.i32()?];
     candidate.change_inventory_flower_variant(id,before,after)?;
     scopes.push(HistoryScope::Inventory);
    }
    12=>{
     let handle=r.u32()?;let source=r.u32()?;let item=r.i32()?;
     let before=[r.i32()?,r.i32()?,r.i32()?];let after=[r.i32()?,r.i32()?,r.i32()?];let quantity=r.i32()?;
     if candidate.create_inventory_furniture_variant(source,before,after,quantity)?!=handle||candidate.pending_furniture.get(&handle).map(|f|f.item_id)!=Some(item){return Err(Error::Schema)}
     scopes.push(HistoryScope::Inventory);
    }
    9=>{
     let id=r.u32()?;
     let before=[r.i32()?,r.i32()?,r.i32()?];
     let after=[r.i32()?,r.i32()?,r.i32()?];
     candidate.change_inventory_furniture_variant(id,before,after)?;
     scopes.push(HistoryScope::Inventory);
    }
    14=>{
     let handle=r.u32()?;let source=r.u32()?;let mut before=[[0u32;4];3];let mut after=[[0u32;4];3];
     for word in before.iter_mut().flatten().chain(after.iter_mut().flatten()){*word=r.u32()?;}
     let quantity=r.i32()?;
     if candidate.create_inventory_palette_variant(source,before,after,quantity)?!=handle{return Err(Error::Schema)}
     scopes.push(HistoryScope::Inventory);
    }
    17=>{
     let handle=r.u32()?;let source=r.u32()?;let item=r.i32()?;let mut before=[0i32;6];let mut after=[0i32;6];
     for word in before.iter_mut().chain(after.iter_mut()){*word=r.i32()?;}
     let quantity=r.i32()?;
     if candidate.create_inventory_cafe_variant(source,before,after,quantity)?!=handle||candidate.pending_cafes.get(&handle).map(|&(i,_)|i)!=Some(item){return Err(Error::Schema)}
     scopes.push(HistoryScope::Inventory);
    }
    16=>{
     let id=r.u32()?;let mut before=[0i32;6];let mut after=[0i32;6];
     for word in before.iter_mut().chain(after.iter_mut()){*word=r.i32()?;}
     candidate.change_inventory_cafe_variant(id,before,after)?;
     scopes.push(HistoryScope::Inventory);
    }
    23=>{
     let handle=r.u32()?;let source=r.u32()?;let item=r.i32()?;let mut before=[0;6];let mut after=[0;6];
     for word in before.iter_mut().chain(after.iter_mut()){*word=r.i32()?;}
     let quantity=r.i32()?;
     if candidate.create_inventory_wand_nested(source,before,after,quantity)?!=handle||candidate.pending_wands.get(&handle).map(|&(i,_)|i)!=Some(item){return Err(Error::Schema)}
     scopes.push(HistoryScope::Inventory);
    }
    22=>{
     let id=r.u32()?;let mut before=[0;6];let mut after=[0;6];
     for word in before.iter_mut().chain(after.iter_mut()){*word=r.i32()?;}
     candidate.change_inventory_wand_nested(id,before,after)?;scopes.push(HistoryScope::Inventory);
    }
    20=>{
     let handle=r.u32()?;let source=r.u32()?;let item=r.i32()?;let before=[r.i32()?,r.i32()?];let after=[r.i32()?,r.i32()?];let quantity=r.i32()?;
     if candidate.create_inventory_wand_variant(source,before,after,quantity)?!=handle||candidate.pending_wands.get(&handle).map(|&(i,_)|i)!=Some(item){return Err(Error::Schema)}
     scopes.push(HistoryScope::Inventory);
    }
    21=>{
     let id=r.u32()?;let before=[r.i32()?,r.i32()?,r.i32()?];let after=[r.i32()?,r.i32()?,r.i32()?];
     candidate.change_inventory_wand_identity(id,before,after)?;scopes.push(HistoryScope::Inventory);
    }
    19=>{
     let id=r.u32()?;let before=[r.i32()?,r.i32()?];let after=[r.i32()?,r.i32()?];
     candidate.change_inventory_wand_variant(id,before,after)?;scopes.push(HistoryScope::Inventory);
    }
    18=>{
     let handle=r.u32()?;let source=r.u32()?;let mut before=[0i32;5];let mut after=[0i32;5];
     for word in before.iter_mut().chain(after.iter_mut()){*word=r.i32()?;}
     let quantity=r.i32()?;
     if candidate.create_inventory_boba_variant(source,before,after,quantity)?!=handle{return Err(Error::Schema)}
     scopes.push(HistoryScope::Inventory);
    }
    15=>{
     let id=r.u32()?;let mut before=[0i32;5];let mut after=[0i32;5];
     for word in before.iter_mut().chain(after.iter_mut()){*word=r.i32()?;}
     candidate.change_inventory_boba_variant(id,before,after)?;
     scopes.push(HistoryScope::Inventory);
    }
    13=>{
     let id=r.u32()?;let mut before=[[0u32;4];3];let mut after=[[0u32;4];3];
     for word in before.iter_mut().flatten().chain(after.iter_mut().flatten()){*word=r.u32()?;}
     candidate.change_inventory_palette_variant(id,before,after)?;
     scopes.push(HistoryScope::Inventory);
    }
    1=>{
     let guid=r.guid()?;let before=r.value()?;let after=r.value()?;
     candidate.change_achievement(guid,before,after)?;
     scopes.push(HistoryScope::Achievements);
    }
    2=>{
     let guid=r.guid()?;let value=r.value()?;
     candidate.create_achievement(guid,value)?;
     scopes.push(HistoryScope::Achievements);
    }
    3=>{
     let guid=r.guid()?;let child=r.value()?;let pg=r.guid()?;
     let before=r.value()?;let after=r.value()?;
     candidate.create_achievement_with_parent(guid,child,pg,before,after)?;
     scopes.push(HistoryScope::Achievements);
    }
    4=>{
     let guid=r.guid()?;let before=r.optional_value()?;let after=r.value()?;
     let pg=r.guid()?;let parent=r.value()?;
     candidate.complete_child_and_create_parent(guid,before,after,pg,parent)?;
     scopes.push(HistoryScope::Achievements);
    }
    5=>{
     let aguid=r.guid()?;let abefore=r.value()?;let anext=r.value()?;
     let bguid=r.guid()?;let bbefore=r.value()?;let bnext=r.value()?;
     candidate.change_achievement_pair((aguid,abefore,anext),(bguid,bbefore,bnext))?;
     scopes.push(HistoryScope::Achievements);
    }
    _=>return Err(Error::Schema)
   }
  }
  if r.pos!=checkpoint.len(){return Err(Error::Trailing)}
  // Replay all edits, then undo exactly the saved global redo tail in reverse.
  // This preserves both per-tab cursors AND the original redo ordering.
  for scope in scopes[active..].iter().rev(){
   if !candidate.undo_scope(*scope){return Err(Error::Schema)}
  }
  if candidate.history_checkpoint()?.as_slice()!=checkpoint{return Err(Error::Schema)}
  *self=candidate;
  Ok(())
 }
}

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
const FLOWER_EFFECTS:&[i32]=&[3,4,5,7,8,9];
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
 (1101281143,1299466625),
 (1120342995,43114910),
 (1177909060,1386186941),
 (1423101683,1669522060),
 (1560032168,1223758923),
 (1607110454,1583118562),
 (1693955310,1934826268),
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
const FLOWER_CLOTHING_GENERIC:&[i32]=&[105502901,1110255162,1227385139];
const FLOWER_CLOTHING_NO_PATTERN:i32=1482119840;
const ALL_UNRESTRICTED_FLOWER_PATTERNS:&[i32]=&[1,2,3,4,5,7,8,9,10,11,12,13,14,16];
pub type BobaVariant=[i32;5];
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
fn flower_item_patterns(item:i32,grow:i32)->Option<&'static [i32]>{
 if let Some((_,patterns))=FLOWER_SPECIES.iter().find(|(id,_)|*id==item){return Some(*patterns)}
 if grow!=6{return None}
 if let Ok(i)=FLOWER_CROWN_SPECIES.binary_search_by_key(&item,|&(id,_)|id){
  let species=FLOWER_CROWN_SPECIES[i].1;
  return FLOWER_SPECIES.iter().find(|(id,_)|*id==species).map(|&(_,p)|p)
 }
 if FLOWER_CLOTHING_GENERIC.contains(&item){Some(ALL_UNRESTRICTED_FLOWER_PATTERNS)}
 else if item==FLOWER_CLOTHING_NO_PATTERN{Some(&[])}else{None}
}
fn valid_flower_variant(patterns:&[i32],v:FlowerVariant)->bool{
 matches!(v[0],0|6|7)&&FLOWER_COLORS.contains(&v[1])&&
 if v[2]==0{v[3]==0}
 else if !patterns.contains(&v[2]){false}
 else if FLOWER_EFFECTS.contains(&v[2]){v[3]==0}
 else{FLOWER_COLORS.contains(&v[3])&&v[3]!=v[1]}
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
  match self {Self::Collection{..}=>HistoryScope::Collections,Self::Inventory{..}|Self::InventoryBatch{..}|Self::FlowerVariant{..}|Self::FlowerCreated{..}|Self::FurnitureCreated{..}|Self::FurnitureVariant{..}|Self::PaletteVariant{..}|Self::PaletteCreated{..}|Self::BobaVariant{..}|Self::BobaCreated{..}|Self::CafeVariant{..}|Self::CafeCreated{..}=>HistoryScope::Inventory,_=>HistoryScope::Achievements}
 }
 fn history_record(&self,applied:bool)->HistoryRecord{
  let (item_id,guid,paired)=match self {
   Self::Collection{id,..}=>(*id,[0;4],false),
   Self::Inventory{document_id,..}|Self::FlowerVariant{document_id,..}|Self::FurnitureVariant{document_id,..}|Self::PaletteVariant{document_id,..}|Self::BobaVariant{document_id,..}|Self::CafeVariant{document_id,..}=>(*document_id as i32,[0;4],false),
   Self::InventoryBatch{deltas}=>(deltas[0].document_id as i32,[0;4],false),
   Self::FlowerCreated{source_id,..}|Self::FurnitureCreated{source_id,..}|Self::PaletteCreated{source_id,..}|Self::BobaCreated{source_id,..}|Self::CafeCreated{source_id,..}=>(*source_id as i32,[0;4],false),
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
 pending_bobas:HashMap<u32,BobaVariant>,
 inventory_item_rows:HashMap<i32,usize>,
 unique_quantity_ids:HashSet<u32>,
 flower_variant_changes:HashMap<u32,FlowerVariant>,
 furniture_variant_changes:HashMap<u32,FurnitureVariant>,
 palette_variant_changes:HashMap<u32,PaletteVariant>,
 cafe_variant_changes:HashMap<u32,CafeVariant>,
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
  let mut editor=Self{original,zip,slot_raw,slot,base,entries,changes:HashMap::new(),inventory_changes:HashMap::new(),pending_flowers:HashMap::new(),pending_furniture:HashMap::new(),pending_palettes:HashMap::new(),pending_bobas:HashMap::new(),pending_cafes:HashMap::new(),inventory_item_rows,unique_quantity_ids:HashSet::new(),flower_variant_changes:HashMap::new(),furniture_variant_changes:HashMap::new(),palette_variant_changes:HashMap::new(),boba_variant_changes:HashMap::new(),cafe_variant_changes:HashMap::new(),achievement_changes:HashMap::new(),achievement_created:HashMap::new(),undo:Vec::new(),redo:Vec::new(),revision:0};
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
  if (self.pending_unique_count()>0||self.redo.iter().any(|c|matches!(c,Change::FlowerCreated{..}|Change::FurnitureCreated{..}|Change::PaletteCreated{..}|Change::BobaCreated{..}|Change::CafeCreated{..})))&&self.undo.len()+self.redo.len()>=MAX_UNDO{return Err(Error::Budget)}
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
  self.flower_variant_changes.get(&row.id).copied().map(flower_unique)
   .or_else(||self.furniture_variant_changes.get(&row.id).copied().map(|materials|InventoryUniqueData::Furniture{materials}))
   .or_else(||self.palette_variant_changes.get(&row.id).copied().map(|rgba_bits|InventoryUniqueData::Palette{rgba_bits}))
   .or_else(||self.boba_variant_changes.get(&row.id).map(|v|InventoryUniqueData::BobaAppearance{color_id:v[0]}))
   .or_else(||self.cafe_variant_changes.get(&row.id).copied().map(Self::cafe_appearance)).or(row.unique_data)
 }
 pub fn inventory_unique_rows(&self)->impl Iterator<Item=(u32,Option<i32>,Option<bool>,Option<InventoryUniqueData>,usize)>+'_{
  self.slot.index.inventory.iter().filter(|r|r.item_id.is_some()&&r.quantity.is_some()).map(|r|(r.id,r.unique_id,r.unique_is_nil,self.effective_unique(r),r.unique_fields.len()))
   .chain(self.pending_inventory_rows().into_iter().map(|r|if self.pending_palettes.contains_key(&r.document_id){(r.document_id,None,Some(false),self.inventory_unique_data(r.document_id),3)}else if self.pending_bobas.contains_key(&r.document_id){(r.document_id,None,Some(false),self.inventory_unique_data(r.document_id),5)}else if self.pending_cafes.contains_key(&r.document_id){(r.document_id,None,Some(false),self.inventory_unique_data(r.document_id),2)}else{match self.pending_flowers.get(&r.document_id){
    Some(f)=>(r.document_id,None,Some(false),Some(flower_unique(self.flower_variant_changes.get(&r.document_id).copied().unwrap_or(f.variant))),4),
    None=>match self.pending_furniture.get(&r.document_id){Some(f)=>(r.document_id,None,Some(false),Some(InventoryUniqueData::Furniture{materials:self.furniture_variant_changes.get(&r.document_id).copied().unwrap_or(f.variant)}),3),None=>(r.document_id,Some(0),Some(true),None,0)}
   }}))
 }
 fn unique_row_source(&self,row:&crate::native::InventoryRow,fields:usize)->Option<i32>{
  if self.slot.envelope.version!=Version::V301||row.id==0||row.id>i32::MAX as u32||row.quantity?<0||
   (row.quantity==Some(0)&&!Self::is_emptyable_unique_family(row))||
   row.unique_is_nil!=Some(false)||row.unique_fields.len()!=fields||self.slot.index.inventory_item_refs_incomplete{return None}
  let item=row.item_id?;let uid=row.unique_id?;
  if item<=0||uid<=0||self.slot.index.inventory_item_refs.contains(&(item,uid))||self.slot.index.inventory_legacy_uid_refs.contains(&uid){return None}
  Some(item)
 }
 fn flower_source(&self,row:&crate::native::InventoryRow)->Option<&'static [i32]>{
  let item=self.unique_row_source(row,4)?;
  let original=flower_variant(row.unique_data?)?;
  // Copied outfit/placement payload references also block clothing.
  if !FLOWER_SPECIES.iter().any(|&(id,_)|id==item)&&
   (self.slot.index.inventory_payload_refs_incomplete||self.slot.index.inventory_payload_item_refs.contains(&item)){return None}
  let patterns=flower_item_patterns(item,original[0])?;
  if !valid_flower_variant(patterns,original){return None}
  Some(patterns)
 }
 fn furniture_source(&self,row:&crate::native::InventoryRow)->Option<&'static FurnitureItemSource>{
  let source=furniture_source::item(self.unique_row_source(row,3)?)?;
  // Existing inventory furniture only. Home layout/exterior edits and
  // pattern unlock grants remain outside this operation.
  if source.is_home_layout{return None}
  let original=furniture_variant(row.unique_data?)?;
  if original==[0;3]||original.iter().any(|&n|furniture_source::material_unlock_item(n).is_some()){return None}
  furniture_key(source,original)?;
  Some(source)
 }
 pub fn inventory_furniture_edit_hints(&self)->impl Iterator<Item=u32>+'_ {
  self.slot.index.inventory.iter().filter_map(|r|self.furniture_source(r).map(|_|r.id)).chain(self.pending_furniture.keys().copied().filter(|id|self.inventory_changes.contains_key(id)))
 }
 fn original_furniture_variant(&self,id:u32)->Option<FurnitureVariant>{
  self.pending_furniture.get(&id).map(|f|f.variant)
   .or_else(||self.slot.index.inventory.iter().find(|r|r.id==id).and_then(|r|r.unique_data).and_then(furniture_variant))
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
   else{for v in [other.unique_data?,self.effective_unique(other)?]{reserved.insert(furniture_key(source,furniture_variant(v)?)?);}}
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
    furniture_source::material_unlock_item(n).is_none()&&
    source.slots.iter().find(|s|s.slot as usize==i).is_some_and(|s|s.allowed.contains(&n)||original[i]==n)))
 }
 /// Rust issues source-defined one-slot choices. The commit accepts an
 /// independently validated complete tuple for atomic draft replay.
 pub fn inventory_furniture_variants(&self,id:u32)->Vec<FurnitureVariant>{
  let Some((source,original,current,reserved))=self.furniture_context(id)else{return Vec::new()};
  let current_key=furniture_key(source,current).unwrap();
  let mut out=Vec::new();
  for slot in source.slots{
   let i=slot.slot as usize;
   for n in std::iter::once(0).chain(slot.allowed.iter().copied()){
    let mut v=current;v[i]=n;
    if v==current||!Self::valid_furniture_target(source,original,v){continue}
    let key=furniture_key(source,v).unwrap();
    if key!=current_key&&!reserved.contains(&key)&&!out.contains(&v)&&
     (!self.pending_furniture.contains_key(&id)||Some(key)!=furniture_key(source,[0;3])){out.push(v)}
   }
  }
  out
 }
 // Only the intersection of verified ordinary acquisition definitions and
 // original non-layout customizable furniture. No inferred ownership.
 fn absent_furniture_choices(&self,item_id:i32)->Vec<FurnitureVariant>{
  if self.inventory_item_rows.contains_key(&item_id)||!self.can_create_inventory_item(item_id){return Vec::new()}
  self.default_furniture_choices(item_id)
 }
 // A single source-verified ordinary saved stack is sufficient evidence
 // for its default variant. Do not convert it or consume its quantity.
 fn saved_default_furniture_source(&self,row:&crate::native::InventoryRow)->Option<i32>{
  let item=row.item_id?;
  if row.id==0||row.id>=PENDING_ITEM||row.unique_id!=Some(0)||row.unique_is_nil!=Some(true)||
   self.inventory_changes.get(&row.id).copied().or(row.quantity)?<=0||
   !row.fields.iter().all(Option::is_some)||self.inventory_item_rows.get(&item)!=Some(&1)||
   !crate::inventory_source::ordinary_creation_item(item)||!self.inventory_creation_payload_safe(item)||
   self.slot.index.inventory_item_refs.iter().any(|&(id,_)|id==item){return None}
  let source=furniture_source::item(item)?;
  if source.is_home_layout||crate::inventory_source::ordinary_quantity_limit(item)!=Some(i32::MAX){return None}
  Some(item)
 }
 fn default_furniture_choices(&self,item_id:i32)->Vec<FurnitureVariant>{
  if crate::inventory_source::ordinary_quantity_limit(item_id)!=Some(i32::MAX){return Vec::new()}
  let Some(source)=furniture_source::item(item_id)else{return Vec::new()};
  if source.is_home_layout{return Vec::new()}
  let Some(default)=furniture_key(source,[0;3])else{return Vec::new()};
  let mut reserved=HashSet::new();
  for (&id,f) in &self.pending_furniture{
   if f.item_id!=item_id||!self.inventory_changes.contains_key(&id){continue}
   for v in [f.variant,self.furniture_variant_changes.get(&id).copied().unwrap_or(f.variant)]{
    let Some(key)=furniture_key(source,v)else{return Vec::new()};
    reserved.insert(key);
   }
  }
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
   if id&PENDING_ITEM==0||qty<=0||self.pending_flowers.contains_key(&id)||self.pending_furniture.contains_key(&id)||self.pending_palettes.contains_key(&id)||self.pending_bobas.contains_key(&id)||self.pending_cafes.contains_key(&id){return None}
   (!self.absent_furniture_choices((id&!PENDING_ITEM) as i32).is_empty()).then_some(id)
  })).collect()
 }
 pub fn inventory_furniture_creation_variants(&self,id:u32)->Vec<FurnitureVariant>{
  if !self.absent_flower_budget_available(){return Vec::new()}
  if self.pending_furniture.contains_key(&id){
   if !self.inventory_changes.contains_key(&id){return Vec::new()}
  }else if id&PENDING_ITEM!=0{return self.absent_furniture_choices((id&!PENDING_ITEM) as i32)}
  if let Some(item)=self.slot.index.inventory.iter().find(|r|r.id==id).and_then(|r|self.saved_default_furniture_source(r)){
   return self.default_furniture_choices(item)
  }
  if !self.pending_furniture.contains_key(&id)&&!self.unique_quantity_ids.contains(&id){return Vec::new()}
  let Some((source,original,current,_))=self.furniture_context(id)else{return Vec::new()};
  // No new restricted ownership: only existing, source-validated furniture.
  if self.slot.index.inventory_payload_item_refs.contains(&source.item_id){return Vec::new()}
  let default=furniture_key(source,[0;3]);
  let old=furniture_key(source,original);let now=furniture_key(source,current);
  self.inventory_furniture_variants(id).into_iter().filter(|&v|{
   let key=furniture_key(source,v);
   key!=default&&key!=old&&key!=now&&Self::valid_furniture_target(source,[0;3],v)
  }).collect()
 }
 pub fn create_inventory_furniture_variant(&mut self,source_id:u32,expected:FurnitureVariant,next:FurnitureVariant,quantity:i32)->Result<u32,Error>{
  if quantity<=0||!self.inventory_furniture_creation_variants(source_id).contains(&next){return Err(Error::Schema)}
  let item_id=if self.pending_furniture.contains_key(&source_id){
   let (source,_,current,_)=self.furniture_context(source_id).ok_or(Error::Schema)?;
   if current!=expected{return Err(Error::Schema)}
   source.item_id
  }else if source_id&PENDING_ITEM!=0{
   if expected!=[0;3]{return Err(Error::Schema)}
   (source_id&!PENDING_ITEM) as i32
  }else if let Some(item)=self.slot.index.inventory.iter().find(|r|r.id==source_id).and_then(|r|self.saved_default_furniture_source(r)){
   if expected!=[0;3]{return Err(Error::Schema)}
   item
  }else{
   let (source,_,current,_)=self.furniture_context(source_id).ok_or(Error::Schema)?;
   if current!=expected{return Err(Error::Schema)}
   source.item_id
  };
  let document_id=self.allocate_staged_unique_handle()?;
  let revision=self.next_edit_revision()?;
  let change=Change::FurnitureCreated{document_id,source_id,expected,furniture:PendingFurniture{item_id,variant:next},quantity};
  self.restore_change(&change,false);self.undo.push(change);self.redo.retain(|c|c.scope()!=HistoryScope::Inventory);self.revision=revision;
  Ok(document_id)
 }
 pub fn change_inventory_furniture_variant(&mut self,id:u32,expected:FurnitureVariant,next:FurnitureVariant)->Result<(),Error>{
  let (source,original,current,reserved)=self.furniture_context(id).ok_or(Error::Schema)?;
  if current!=expected||current==next||!Self::valid_furniture_target(source,original,next)||
   (self.pending_furniture.contains_key(&id)&&furniture_key(source,next)==furniture_key(source,[0;3]))||
   reserved.contains(&furniture_key(source,next).ok_or(Error::Schema)?){return Err(Error::Schema)}
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
   .or_else(||self.slot.index.inventory.iter().find(|r|r.id==id).and_then(|r|r.unique_data).and_then(flower_variant))
 }
 fn flower_context(&self,id:u32)->Option<(&'static [i32],FlowerVariant,HashSet<FlowerVariant>)>{
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
   // A legacy or incomplete payload might be semantically equal.
   let before=flower_variant(other.unique_data?)?;
   let after=flower_variant(self.effective_unique(other)?)?;
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
 /// On-demand choices preserve growth state and identity. Pattern changes
 /// include the corresponding secondary-color change in the same candidate.
 pub fn inventory_flower_variants(&self,id:u32)->Vec<FlowerVariant>{
  let Some((patterns,current,reserved))=self.flower_context(id)else{return Vec::new()};
  let mut out=Vec::new();
  let mut add=|v:FlowerVariant|{if v!=current&&valid_flower_variant(patterns,v)&&!reserved.contains(&v)&&!out.contains(&v){out.push(v)}};
  for &color in FLOWER_COLORS{
   let mut v=current;v[1]=color;
   if v[2]!=0&&!FLOWER_EFFECTS.contains(&v[2])&&v[1]==v[3]{v[3]=default_flower_accent(color)}
   add(v);
  }
  for pattern in std::iter::once(0).chain(patterns.iter().copied()){
   if pattern==current[2]{continue}
   let mut v=current;v[2]=pattern;
   v[3]=if pattern==0||FLOWER_EFFECTS.contains(&pattern){0}else{default_flower_accent(v[1])};
   add(v);
  }
  if current[2]!=0&&!FLOWER_EFFECTS.contains(&current[2]){
   for &color in FLOWER_COLORS{let mut v=current;v[3]=color;add(v);}
  }
  out
 }
 /// On-demand creation choices. Rust alone checks the source species,
 /// allocation budget, identity/reference guards, and original tuple.
 pub fn inventory_flower_creation_variants(&self,id:u32)->Vec<FlowerVariant>{
  if let Some(f)=self.pending_flowers.get(&id){
   if !self.inventory_changes.contains_key(&id)||!self.absent_flower_budget_available(){return Vec::new()}
   return self.inventory_flower_variants(id).into_iter().filter(|&v|v!=f.variant).collect()
  }
  if id&PENDING_ITEM!=0{return self.absent_flower_options((id&!PENDING_ITEM) as i32)}
  if !self.inventory_creation_source_valid()||!self.unique_quantity_ids.contains(&id)||self.undo.len()+self.redo.len()>=MAX_UNDO||
   crate::document_membership::allocate_inventory_unique_ids(&self.slot.index,self.slot.envelope.version,self.pending_unique_count()+1).is_err()||
   crate::document_membership::allocate_ids(&self.slot.index,self.pending_inventory_rows().len()+self.reserved_achievement_count()+1).is_err(){return Vec::new()}
  let Some(row)=self.slot.index.inventory.iter().find(|r|r.id==id)else{return Vec::new()};
  let Some(item)=row.item_id else{return Vec::new()};
  if self.slot.index.inventory_payload_item_refs.contains(&item){return Vec::new()}
  let Some(original)=row.unique_data.and_then(flower_variant)else{return Vec::new()};
  self.inventory_flower_variants(id).into_iter().filter(|&v|v!=original).collect()
 }
 /// Stage an explicitly chosen, different native flower tuple from an
 /// existing validated species row. No persisted UID is assigned until
 /// export. Multiple variants of one species use independent handles.
 pub fn create_inventory_flower_variant(&mut self,source_id:u32,expected:FlowerVariant,next:FlowerVariant,quantity:i32)->Result<u32,Error>{
  if let Some(f)=self.pending_flowers.get(&source_id).copied(){
   if quantity<=0||!self.inventory_changes.contains_key(&source_id)||!self.absent_flower_budget_available(){return Err(Error::Schema)}
   let (patterns,current,reserved)=self.flower_context(source_id).ok_or(Error::Schema)?;
   if expected!=current||next==current||next==f.variant||next[0]!=current[0]||
    !valid_flower_variant(patterns,next)||reserved.contains(&next){return Err(Error::Schema)}
   return self.stage_new_flower(source_id,f.item_id,expected,next,quantity)
  }
  if source_id&PENDING_ITEM!=0{
   let item_id=(source_id&!PENDING_ITEM) as i32;
   if quantity<=0||expected!=[0;4]||!self.absent_flower_options(item_id).contains(&next){return Err(Error::Schema)}
   return self.stage_new_flower(source_id,item_id,expected,next,quantity)
  }
  if quantity<=0||!self.inventory_creation_source_valid()||!self.unique_quantity_ids.contains(&source_id){return Err(Error::Schema)}
  let row=self.slot.index.inventory.iter().find(|r|r.id==source_id).ok_or(Error::Schema)?;
  let item_id=row.item_id.ok_or(Error::Schema)?;
  // The same exact species/processor source gate and reference index apply.
  if self.slot.index.inventory_payload_item_refs.contains(&item_id){return Err(Error::Schema)}
  let (patterns,current,reserved)=self.flower_context(source_id).ok_or(Error::Schema)?;
  let original=flower_variant(row.unique_data.ok_or(Error::Schema)?).ok_or(Error::Schema)?;
  if expected!=current||next==current||next==original||next[0]!=current[0]||!valid_flower_variant(patterns,next)||reserved.contains(&next){return Err(Error::Schema)}
  self.stage_new_flower(source_id,item_id,expected,next,quantity)
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
 fn absent_flower_choices(&self,item_id:i32)->Vec<FlowerVariant>{
  if self.inventory_item_rows.contains_key(&item_id)||
   self.slot.index.inventory_payload_item_refs.contains(&item_id)||
   self.slot.index.inventory_item_refs.iter().any(|&(id,_)|id==item_id){return Vec::new()}
  if !crate::inventory_source::is_uncapped_required_unique_stack(item_id){return Vec::new()}
  // Missing crowns use only their exact source species' original default
  // colors. Generic processors can use any of the unrestricted source
  // species; only their actual default colors are offered here.
  let species=FLOWER_CROWN_SPECIES.iter().find(|&&(id,_)|id==item_id).map_or(item_id,|&(_,species)|species);
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
   .chain(FLOWER_CLOTHING_GENERIC.iter().copied())
   .chain(std::iter::once(FLOWER_CLOTHING_NO_PATTERN))
   .filter(|&id|!self.absent_flower_choices(id).is_empty()).collect()
 }
 // Retain inactive staged identities for history replay; only active rows are exported.
 fn pending_unique_count(&self)->usize{self.pending_flowers.len()+self.pending_furniture.len()+self.pending_palettes.len()+self.pending_bobas.len()+self.pending_cafes.len()}
 fn active_pending_unique_count(&self)->usize{self.pending_flowers.keys().chain(self.pending_furniture.keys()).chain(self.pending_palettes.keys()).chain(self.pending_bobas.keys()).chain(self.pending_cafes.keys()).filter(|id|self.inventory_changes.contains_key(*id)).count()}
 fn allocate_staged_unique_handle(&self)->Result<u32,Error>{
  if self.undo.len()+self.redo.len()>=MAX_UNDO{return Err(Error::Budget)}
  crate::document_membership::allocate_inventory_unique_ids(&self.slot.index,self.slot.envelope.version,self.pending_unique_count()+1)?;
  crate::document_membership::allocate_ids(&self.slot.index,self.pending_inventory_rows().len()+self.reserved_achievement_count()+1)?;
  (1..=MAX_UNDO as u32+4096).map(|n|PENDING_ITEM|n).find(|id|
   !self.inventory_changes.contains_key(id)&&!self.pending_flowers.contains_key(id)&&!self.pending_furniture.contains_key(id)&&!self.pending_palettes.contains_key(id)&&!self.pending_bobas.contains_key(id)&&!self.pending_cafes.contains_key(id)&&
   !crate::inventory_source::ordinary_creation_item((id&!PENDING_ITEM) as i32)&&flower_item_patterns((id&!PENDING_ITEM) as i32,6).is_none()).ok_or(Error::Budget)
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
  if current!=expected||current==next||current[0]!=next[0]||!valid_flower_variant(patterns,next)||reserved.contains(&next){return Err(Error::Schema)}
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
   match self.effective_unique(row){
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
 // Only consumable families with the existing source-authorized
 // complete payload and quantity gates. No palette/outfit/layout removal.
 fn is_emptyable_unique_family(r:&crate::native::InventoryRow)->bool{
  use crate::inventory_source::{CAFE_IDS,BOBA_ID};
  Self::is_emptyable_flower_species(r)||match (r.item_id,r.unique_data){
   (Some(item),Some(InventoryUniqueData::CafeAppearance{..}))=>CAFE_IDS.binary_search(&item).is_ok(),
   (Some(item),Some(InventoryUniqueData::BobaAppearance{..}))=>item==BOBA_ID,
   _=>false
  }
 }
 /// Native subtraction clamps to zero without deleting the saved record.
 /// Existing consumables must pass the full original unique quantity
 /// identity/reference index, including copied payloads.
 fn inventory_can_empty(&self,r:&crate::native::InventoryRow)->bool{
  if Self::is_emptyable_unique_family(r)&&self.unique_quantity_ids.contains(&r.id){return true}
  let Some(item_id)=r.item_id else{return false};
  self.slot.envelope.version==Version::V301&&r.id>0&&r.id<=i32::MAX as u32&&
   (crate::inventory_source::ordinary_membership_item(item_id)||
    (crate::inventory_source::existing_currency_item(item_id)&&
     !self.slot.index.inventory_payload_refs_incomplete&&
     !self.slot.index.inventory_payload_item_refs.contains(&item_id)))&&
   r.unique_id==Some(0)&&r.unique_is_nil==Some(true)&&r.quantity.is_some_and(|q|q>=0)&&
   r.fields.iter().all(Option::is_some)&&self.inventory_item_rows.get(&item_id)==Some(&1)&&
   !self.slot.index.inventory_item_refs_incomplete&&
   !self.slot.index.inventory_item_refs.contains(&(item_id,0))
 }
 // Index the original unique identities once, rather than scanning all
 // peers per visible row or per complete Worker snapshot. Variant changes
 // already reserve original and effective peer identities in their contexts.
 fn is_flower_quantity_definition(item:i32)->bool{
  FLOWER_SPECIES.iter().any(|(id,_)|*id==item)||
   FLOWER_CROWN_SPECIES.binary_search_by_key(&item,|&(id,_)|id).is_ok()||
   FLOWER_CLOTHING_GENERIC.contains(&item)||item==FLOWER_CLOTHING_NO_PATTERN
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
    if !flavors.iter().all(|&n|n>0)||!colors.iter().all(|&n|is_chef_color(n)){return None}
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
 pub fn inventory_boba_creation_variants(&self,id:u32)->Vec<BobaVariant>{
  let Some((original,_,_))=self.boba_context(id)else{return Vec::new()};
  let item=crate::inventory_source::BOBA_ID;
  let quantity=self.inventory_changes.get(&id).copied().or_else(||self.slot.index.inventory.iter().find(|r|r.id==id).and_then(|r|r.quantity));
  if !quantity.is_some_and(|q|q>0)||self.boba_family_count()>=256||!self.absent_flower_budget_available()||
   !self.inventory_creation_payload_safe(item)||self.slot.index.inventory_item_refs.iter().any(|&(i,_)|i==item){return Vec::new()}
  self.inventory_boba_variants(id).into_iter().filter(|&v|v!=original).collect()
 }
 pub fn create_inventory_boba_variant(&mut self,source_id:u32,expected:BobaVariant,next:BobaVariant,quantity:i32)->Result<u32,Error>{
  if quantity<=0||!self.inventory_boba_creation_variants(source_id).contains(&next){return Err(Error::Schema)}
  let (_,current,_)=self.boba_context(source_id).ok_or(Error::Schema)?;
  if current!=expected{return Err(Error::Schema)}
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
 fn valid_cafe_original(item:i32,v:CafeVariant)->bool{
  let n=Self::cafe_count(v);
  if !crate::inventory_source::cafe_count_allowed(item,n){return false}
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
   src::cafe_pair_allowed(item,f,c)&&(src::ordinary_membership_item(id)||self.owned_cafe_ingredient(id))).collect()
 }
 pub fn inventory_cafe_witnesses(&self)->&'static [(i32,i32,i32)]{
  if self.slot.envelope.version==Version::V301{crate::inventory_source::CAFE_INGREDIENT_WITNESSES}else{&[]}
 }
 fn cafe_family_count(&self,item:i32)->usize{
  self.inventory_item_rows.get(&item).copied().unwrap_or(0)+self.pending_cafes.values().filter(|&&(i,_)|i==item).count()
 }
 pub fn inventory_cafe_rows(&self)->impl Iterator<Item=(u32,CafeVariant,bool)>+'_{
  self.slot.index.inventory.iter().filter_map(move |r|{
   if self.slot.envelope.version!=Version::V301{return None}
   let item=r.item_id?;let original=Self::cafe_words(&self.slot.envelope.decoded,r)?;
   let editable=self.unique_quantity_ids.contains(&r.id)&&self.cafe_family_count(item)<=256&&Self::valid_cafe_original(item,original);
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
  if self.cafe_family_count(item)>256{return None}
  let original=self.original_cafe_variant(id)?;
  if !Self::valid_cafe_original(item,original){return None}
  let current=self.cafe_variant_changes.get(&id).copied().unwrap_or(original);
  let mut reserved=HashSet::new();
  for other in &self.slot.index.inventory{
   if other.id==id||other.item_id!=Some(item){continue}
   let (flavors,colors)=self.chef_identity(other)?;
   if flavors.len()!=colors.len()||!crate::inventory_source::cafe_count_allowed(item,flavors.len()){continue}
   let v=Self::cafe_words(&self.slot.envelope.decoded,other)?;
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
  if !Self::valid_cafe_original(item,next){return false}
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
  let mut out=Vec::new();let mut seen=HashSet::new();
  let slots=if item==crate::inventory_source::NIGIRI_ID{2}else{crate::inventory_source::cafe_slot_count(item).unwrap_or(0)};
  for i in 0..slots{
   for (ingredient,flavor,color) in self.cafe_slot_choices(item,i){
    let mut next=current;next[i]=flavor;next[i+3]=color;
    if next!=current&&Self::valid_cafe_original(item,next)&&!reserved.contains(&next)&&seen.insert(next){out.push((next,ingredient,i))}
   }
   let mut next=current;next[i]=original[i];next[i+3]=original[i+3];
   if next!=current&&Self::valid_cafe_original(item,next)&&!reserved.contains(&next)&&seen.insert(next){out.push((next,0,i))}
  }
  out
 }
 pub fn inventory_cafe_creation_variants(&self,id:u32)->Vec<(CafeVariant,i32,usize)>{
  let Some((item,original,current,_))=self.cafe_context(id)else{return Vec::new()};
  let quantity=self.inventory_changes.get(&id).copied().or_else(||self.slot.index.inventory.iter().find(|r|r.id==id).and_then(|r|r.quantity));
  if !quantity.is_some_and(|q|q>0)||!self.absent_flower_budget_available()||!self.inventory_creation_payload_safe(item)||
   self.slot.index.inventory_item_refs.iter().any(|&(i,_)|i==item)||self.cafe_family_count(item)>=256{return Vec::new()}
  self.inventory_cafe_variants(id).into_iter().filter(|&(v,_,_)|
   v!=original&&v!=current&&self.valid_cafe_creation(item,v)).collect()
 }
 pub fn create_inventory_cafe_variant(&mut self,source_id:u32,expected:CafeVariant,next:CafeVariant,quantity:i32)->Result<u32,Error>{
  if quantity<=0||!self.inventory_cafe_creation_variants(source_id).iter().any(|&(v,_,_)|v==next){return Err(Error::Schema)}
  let (item,_,current,_)=self.cafe_context(source_id).ok_or(Error::Schema)?;
  if current!=expected{return Err(Error::Schema)}
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
 pub fn inventory_palette_creation_variants(&self,id:u32)->Vec<PaletteVariant>{
  let item=crate::inventory_source::CUSTOM_PALETTE_ID;
  if !self.absent_flower_budget_available()||!self.inventory_creation_payload_safe(item)||
   self.slot.index.inventory_item_refs.iter().any(|&(i,_)|i==item)||
   self.inventory_item_rows.get(&item).copied().unwrap_or(0)+self.pending_palettes.len()>=256{return Vec::new()}
  let Some((original,current,_))=self.palette_context(id)else{return Vec::new()};
  self.inventory_palette_variants(id).into_iter().filter(|v|
   !Self::palette_equal(*v,original)&&!Self::palette_equal(*v,current)&&
   v.iter().all(|&c|Self::palette_output_choices().any(|x|x==c))).collect()
 }
 pub fn create_inventory_palette_variant(&mut self,source_id:u32,expected:PaletteVariant,next:PaletteVariant,quantity:i32)->Result<u32,Error>{
  if quantity<=0||!self.inventory_palette_creation_variants(source_id).contains(&next){return Err(Error::Schema)}
  let (_,current,_)=self.palette_context(source_id).ok_or(Error::Schema)?;
  if expected!=current{return Err(Error::Schema)}
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
  let mut palette_peers=Vec::new();
  let mut palette_conflicts=HashSet::new();
  let mut ambiguous=HashSet::new();
  for row in &self.slot.index.inventory{
   if let Some(uid)=row.unique_id{*uid_counts.entry(uid).or_default()+=1}
   let Some(item)=row.item_id else{return HashSet::new()};
   if let Some(source)=furniture_source::item(item).filter(|s|!s.is_home_layout){
    let key=if row.unique_is_nil==Some(true){furniture_key(source,[0;3])}
     else{row.unique_data.and_then(furniture_variant).and_then(|v|furniture_key(source,v))};
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
   if !Self::is_flower_quantity_definition(item){continue}
   let Some(v)=row.unique_data.and_then(flower_variant)else{ambiguous.insert(item);continue};
   if !(0..=7).contains(&v[0])||!(1..=30).contains(&v[1])||!(0..=16).contains(&v[2])||!(0..=30).contains(&v[3]){
    ambiguous.insert(item);continue
   }
   *variant_counts.entry((item,v)).or_default()+=1;
  }
  self.slot.index.inventory.iter().filter_map(|row|{
   let item=row.item_id?;let uid=row.unique_id?;
   if ambiguous.contains(&item)||uid_counts.get(&uid)!=Some(&1)||
    self.slot.index.inventory_payload_item_refs.contains(&item)||
    !row.fields.iter().all(Option::is_some){return None}
   if Self::palette_identity(row).is_some(){
    self.unique_row_source(row,3)?;
    return (!palette_conflicts.contains(&row.id)).then_some(row.id)
   }
   if let Some((a,b))=self.chef_identity(row){
    self.unique_row_source(row,if item==crate::inventory_source::BOBA_ID{5}else{2})?;
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
   (r.quantity==Some(0)&&!self.inventory_can_empty(r)){return None}
  let item_id=r.item_id?;
  let cap=crate::inventory_source::ordinary_quantity_limit(item_id)?;
  // A finite definition limit must not be treated as an independent cap for
  // every ambiguous saved row with the same item identity. Preserve those rows.
  if cap<i32::MAX&&self.inventory_item_rows.get(&item_id)!=Some(&1){return None}
  Some(cap)
 }
 fn inventory_creation_source_valid(&self)->bool{
  self.slot.envelope.version==Version::V301&&!self.slot.index.inventory_item_refs_incomplete&&
   self.slot.index.inventory.iter().all(|r|r.item_id.is_some()&&r.id<PENDING_ITEM)
 }
 // Ordinary cosmetic definitions can also occur as copied outfit or placement
 // payloads without a UID reference. An absent row is not proof of absence.
 fn inventory_creation_payload_safe(&self,item_id:i32)->bool{
  crate::inventory_source::ordinary_membership_item(item_id)||
   (!self.slot.index.inventory_payload_refs_incomplete&&
    !self.slot.index.inventory_payload_item_refs.contains(&item_id))
 }
 // The ordinary base variant is distinct from a verified nondefault tag-8
 // stack. Reuse the original identity/reference index; check both original
 // and effective materials so Undo/Redo never creates a default collision.
 fn permits_separate_ordinary_base(&self,row:&crate::native::InventoryRow)->bool{
  if !self.unique_quantity_ids.contains(&row.id){return false}
  let Some(source)=self.furniture_source(row)else{return false};
  let Some(default)=furniture_key(source,[0;3])else{return false};
  [row.unique_data,self.effective_unique(row)].into_iter().all(|value|
   value.and_then(furniture_variant).and_then(|v|furniture_key(source,v)).is_some_and(|key|key!=default))
 }
 fn can_create_inventory_item(&self,item_id:i32)->bool{
  self.inventory_creation_source_valid()&&crate::inventory_source::ordinary_creation_item(item_id)&&
   (!self.inventory_item_rows.contains_key(&item_id)||
    self.slot.index.inventory.iter().filter(|r|r.item_id==Some(item_id)).all(|r|self.permits_separate_ordinary_base(r)))&&
   self.inventory_creation_payload_safe(item_id)&&
   !self.slot.index.inventory_item_refs.iter().any(|&(item,_)|item==item_id)
 }
 fn pending_inventory_rows(&self)->Vec<InventoryEntry>{
  let mut rows:Vec<_>=self.inventory_changes.iter().filter(|(&id,_)|id&PENDING_ITEM!=0)
   .map(|(&document_id,&quantity)|InventoryEntry{document_id,item_id:self.pending_flowers.get(&document_id).map(|f|f.item_id).or_else(||self.pending_furniture.get(&document_id).map(|f|f.item_id)).or_else(||self.pending_palettes.contains_key(&document_id).then_some(crate::inventory_source::CUSTOM_PALETTE_ID)).or_else(||self.pending_bobas.contains_key(&document_id).then_some(crate::inventory_source::BOBA_ID)).or_else(||self.pending_cafes.get(&document_id).map(|&(item,_)|item)).unwrap_or((document_id&!PENDING_ITEM) as i32),
    quantity,editable:true,quantity_limit:Some(i32::MAX),quantity_minimum:0}).collect();
  rows.sort_by_key(|r|(r.item_id,r.document_id));rows
 }
 // Include the other scope's redo future in the shared native ID reservation.
 fn reserved_inventory_count(&self)->usize{
  let mut handles:HashSet<u32>=self.inventory_changes.keys().filter(|&&id|id&PENDING_ITEM!=0).copied().collect();
  handles.extend(self.pending_flowers.keys().copied());
  handles.extend(self.pending_furniture.keys().copied());
  handles.extend(self.pending_palettes.keys().copied());handles.extend(self.pending_bobas.keys().copied());handles.extend(self.pending_cafes.keys().copied());
  for change in &self.redo{
   match change{
    Change::Inventory{document_id,after:Some(_),..} if document_id&PENDING_ITEM!=0=>{handles.insert(*document_id);}
    Change::InventoryBatch{deltas}=>for d in deltas{if d.document_id&PENDING_ITEM!=0&&d.after.is_some(){handles.insert(d.document_id);}},
    Change::FlowerCreated{document_id,..}|Change::FurnitureCreated{document_id,..}|Change::PaletteCreated{document_id,..}|Change::BobaCreated{document_id,..}|Change::CafeCreated{document_id,..}=>{handles.insert(*document_id);},
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
  if !self.inventory_creation_source_valid()||crate::document_membership::allocate_ids(&self.slot.index,self.pending_inventory_rows().len()+self.reserved_achievement_count()+1).is_err(){return Vec::new()}
  let referenced:HashSet<i32>=self.slot.index.inventory_item_refs.iter().map(|&(item,_)|item).collect();
  // One pass over saved rows; ordinary/opaque/default rows block their Item
  // ID, while verified nondefault customizable variants do not.
  let blocked:HashSet<i32>=self.slot.index.inventory.iter().filter_map(|r|
   (!self.permits_separate_ordinary_base(r)).then_some(r.item_id?)).collect();
  crate::inventory_source::ordinary_creation_ids().filter_map(|item_id|{
   let document_id=PENDING_ITEM|item_id as u32;
   if blocked.contains(&item_id)||referenced.contains(&item_id)||self.inventory_changes.contains_key(&document_id)||!self.inventory_creation_payload_safe(item_id){return None}
   Some(InventoryEntry{document_id,item_id,quantity:0,editable:true,quantity_limit:Some(i32::MAX),quantity_minimum:1})
  }).collect()
 }
 fn plan_inventory_quantity(&self,id:u32,expected:i32,next:i32)->Result<InventoryQuantityDelta,Error>{
  if id&PENDING_ITEM!=0{
   if self.pending_flowers.contains_key(&id)||self.pending_furniture.contains_key(&id)||self.pending_palettes.contains_key(&id)||self.pending_bobas.contains_key(&id)||self.pending_cafes.contains_key(&id){
    let before=self.inventory_changes.get(&id).copied();
    if next<0||expected<=0||before!=Some(expected){return Err(Error::Schema)}
    return Ok(InventoryQuantityDelta{document_id:id,before,after:(next>0).then_some(next)})
   }
   let item_id=(id&!PENDING_ITEM) as i32;
   let before=self.inventory_changes.get(&id).copied();
   if !self.can_create_inventory_item(item_id)||next<0||before.unwrap_or(0)!=expected{return Err(Error::Schema)}
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
 pub fn dirty(&self)->bool {!self.changes.is_empty()||!self.inventory_changes.is_empty()||self.flower_variant_changes.keys().chain(self.furniture_variant_changes.keys()).any(|id|*id&PENDING_ITEM==0||self.inventory_changes.contains_key(id))||self.palette_variant_changes.keys().any(|id|*id&PENDING_ITEM==0||self.inventory_changes.contains_key(id))||self.boba_variant_changes.keys().any(|id|*id&PENDING_ITEM==0||self.inventory_changes.contains_key(id))||self.cafe_variant_changes.keys().any(|id|*id&PENDING_ITEM==0||self.inventory_changes.contains_key(id))||!self.achievement_changes.is_empty()||!self.achievement_created.is_empty()}
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
 pub fn reset(&mut self){self.changes.clear();self.inventory_changes.clear();self.pending_flowers.clear();self.pending_furniture.clear();self.pending_palettes.clear();self.pending_bobas.clear();self.pending_cafes.clear();self.flower_variant_changes.clear();self.furniture_variant_changes.clear();self.palette_variant_changes.clear();self.boba_variant_changes.clear();self.cafe_variant_changes.clear();self.achievement_changes.clear();self.achievement_created.clear();self.undo.clear();self.redo.clear();self.revision=self.revision.wrapping_add(1)}
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
    let original=flower_variant(row.unique_data.ok_or(Error::Schema)?).ok_or(Error::Schema)?;
    for i in 1..4{
     if original[i]==v[i]{continue}
     let span=row.unique_fields.get(i).cloned().ok_or(Error::Schema)?;
     let mut encoded=vec![0xd2];encoded.extend(v[i].to_be_bytes());
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
     let mut encoded=vec![0xd2];encoded.extend(v[i].to_be_bytes());
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
     if !self.can_create_inventory_item(row.item_id){return Err(Error::Schema)}
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
   a.unique_data!=self.effective_unique(b)||
   if self.flower_variant_changes.contains_key(&b.id){
    a.unique_fields.len()!=4||b.unique_fields.len()!=4||
    (0..4).any(|i|{
     let original=flower_variant(b.unique_data.unwrap()).unwrap();
     let next=self.flower_variant_changes[&b.id];
     original[i]==next[i]&&reread.envelope.decoded[a.unique_fields[i].clone()]!=original_payload[b.unique_fields[i].clone()]
    })
   }else if let Some(next)=self.furniture_variant_changes.get(&b.id){
    a.unique_fields.len()!=3||b.unique_fields.len()!=3||
    b.unique_data.and_then(furniture_variant).is_none_or(|original|(0..3).any(|i|
     original[i]==next[i]&&reread.envelope.decoded[a.unique_fields[i].clone()]!=original_payload[b.unique_fields[i].clone()]))
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

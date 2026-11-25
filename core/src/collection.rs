use crate::{archive::{ZipIndex,SLOT,ACCOUNT,MAX_ARCHIVE,crc32},envelope::Version,read_slot,ReadSlot,Error,MAX_INPUT,MAX_DECODED,MAX_BLOCK,MAX_BLOCKS,decode_block};
use crate::wire::{Cursor,Token};
use crate::achievement::{self,AchievementValue,AchievementEntry};
use crate::native::{ModelState,InventoryUniqueData};
use std::{collections::{HashMap,HashSet},ops::Range};

const MAX_TICKS:i64=3_155_378_975_999_999_999;
const MAX_UNDO:usize=256;
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
pub type FlowerVariant=[i32;4]; // grow state, base color, pattern, pattern color
fn flower_variant(data:InventoryUniqueData)->Option<FlowerVariant>{
 if let InventoryUniqueData::Flower{grow_state,base_color,pattern,pattern_color}=data{
  Some([i32::from(grow_state),base_color,pattern,pattern_color])
 }else{None}
}
fn flower_unique(v:FlowerVariant)->InventoryUniqueData{
 InventoryUniqueData::Flower{grow_state:v[0] as u8,base_color:v[1],pattern:v[2],pattern_color:v[3]}
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
pub struct InventoryEntry {pub document_id:u32,pub item_id:i32,pub quantity:i32,pub editable:bool}
#[derive(Clone,Copy,Debug)]
enum Change {
 Collection{id:i32,before:Option<Option<i64>>,after:Option<Option<i64>>},
 Inventory{document_id:u32,before:Option<i32>,after:Option<i32>},
 FlowerVariant{document_id:u32,before:Option<FlowerVariant>,after:Option<FlowerVariant>},
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
  match self {Self::Collection{..}=>HistoryScope::Collections,Self::Inventory{..}|Self::FlowerVariant{..}=>HistoryScope::Inventory,_=>HistoryScope::Achievements}
 }
 fn history_record(&self,applied:bool)->HistoryRecord{
  let (item_id,guid,paired)=match self {
   Self::Collection{id,..}=>(*id,[0;4],false),
   Self::Inventory{document_id,..}|Self::FlowerVariant{document_id,..}=>(*document_id as i32,[0;4],false),
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
 flower_variant_changes:HashMap<u32,FlowerVariant>,
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
  Ok(Self{original,zip,slot_raw,slot,base,entries,changes:HashMap::new(),inventory_changes:HashMap::new(),flower_variant_changes:HashMap::new(),achievement_changes:HashMap::new(),achievement_created:HashMap::new(),undo:Vec::new(),redo:Vec::new(),revision:0})
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
 /// Original native inventory records only. Unique items are read-only.
 pub fn inventory(&self)->Vec<InventoryEntry>{
  self.slot.index.inventory.iter().filter_map(|r|{
   Some(InventoryEntry{document_id:r.id,item_id:r.item_id?,quantity:
    self.inventory_changes.get(&r.id).copied().or(r.quantity)?,
    editable:self.inventory_can_edit(r)})
  }).collect()
 }
 /// Read-only lookup by document identity, never by Item ID alone.
 pub fn inventory_unique_data(&self,id:u32)->Option<crate::native::InventoryUniqueData>{
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
  self.flower_variant_changes.get(&row.id).copied().map(flower_unique).or(row.unique_data)
 }
 pub fn inventory_unique_rows(&self)->impl Iterator<Item=(u32,Option<i32>,Option<bool>,Option<InventoryUniqueData>,usize)>+'_{
  self.slot.index.inventory.iter().filter(|r|r.item_id.is_some()&&r.quantity.is_some()).map(|r|(r.id,r.unique_id,r.unique_is_nil,self.effective_unique(r),r.unique_fields.len()))
 }
 fn flower_source(&self,row:&crate::native::InventoryRow)->Option<&'static [i32]>{
  if self.slot.envelope.version!=Version::V301||row.id==0||row.id>i32::MAX as u32||row.quantity?<=0||
   row.unique_is_nil!=Some(false)||row.unique_fields.len()!=4||self.slot.index.inventory_item_refs_incomplete{return None}
  let item=row.item_id?;let uid=row.unique_id?;
  if uid<=0||self.slot.index.inventory_item_refs.contains(&(item,uid))||self.slot.index.inventory_legacy_uid_refs.contains(&uid){return None}
  let patterns=FLOWER_SPECIES.iter().find(|(id,_)|*id==item)?.1;
  if !valid_flower_variant(patterns,flower_variant(row.unique_data?)?){return None}
  Some(patterns)
 }
 /// Cheap presentation hint. Actual source/collision check happens on demand,
 /// never an O(inventory squared) scan in the complete inventory snapshot.
 pub fn inventory_flower_edit_hints(&self)->impl Iterator<Item=u32>+'_ {
  self.slot.index.inventory.iter().filter_map(|r|self.flower_source(r).map(|_|r.id))
 }
 fn flower_context(&self,id:u32)->Option<(&'static [i32],FlowerVariant,HashSet<FlowerVariant>)>{
  let row=self.slot.index.inventory.iter().find(|r|r.id==id)?;
  let patterns=self.flower_source(row)?;
  let current=flower_variant(self.effective_unique(row)?)?;
  let original=flower_variant(row.unique_data?)?;
  let mut reserved=HashSet::new();
  for other in &self.slot.index.inventory{
   if other.id==id{continue}
   if other.unique_id==row.unique_id{return None}
   if other.item_id!=row.item_id{continue}
   // A legacy or incomplete payload might be semantically equal.
   let before=flower_variant(other.unique_data?)?;
   let after=flower_variant(self.effective_unique(other)?)?;
   // Restricted but known saved colors/patterns still participate in equality;
   // only unresolved indices might alias through native null GUID fallback.
   for v in [before,after]{if !(0..=7).contains(&v[0])||!(1..=30).contains(&v[1])||!(0..=16).contains(&v[2])||!(0..=30).contains(&v[3]){return None}}
   reserved.insert(before);reserved.insert(after);
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
  let row=self.slot.index.inventory.iter().find(|r|r.id==id).ok_or(Error::Schema)?;
  let original=flower_variant(row.unique_data.ok_or(Error::Schema)?).ok_or(Error::Schema)?;
  let revision=self.revision.checked_add(1).ok_or(Error::Overflow)?;
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
  })
 }
 /// Read-only palette colors from the existing native index, with original
 /// f32 bits intact. No new save rules or write path.
 pub fn inventory_palettes(&self)->impl Iterator<Item=(u32,[[u32;4];3])>+'_{
  self.slot.index.inventory.iter().filter_map(move |row|{
   if self.slot.envelope.version!=Version::V301||row.item_id.is_none()||row.quantity.is_none(){return None}
   match row.unique_data{
    Some(crate::native::InventoryUniqueData::Palette{rgba_bits})=>Some((row.id,rgba_bits)),
    _=>None
   }
  })
 }
 fn inventory_can_edit(&self,r:&crate::native::InventoryRow)->bool{
  self.slot.envelope.version==Version::V301&&r.id>0&&r.id<=i32::MAX as u32&&
   r.item_id.is_some_and(|id|id>0)&&r.quantity.is_some_and(|v|v>0)&&
   r.unique_is_nil==Some(true)&&r.fields[2].is_some()
 }
 /// CAS updates only existing ordinary stack quantities, never IDs or unique payloads.
 pub fn change_inventory_quantity(&mut self,id:u32,expected:i32,next:i32)->Result<(),Error>{
  let row=self.slot.index.inventory.iter().find(|r|r.id==id).ok_or(Error::Schema)?;
  if !self.inventory_can_edit(row)||next<1||expected==next||
   self.inventory_changes.get(&id).copied().or(row.quantity)!=Some(expected){return Err(Error::Schema)}
  let revision=self.revision.checked_add(1).ok_or(Error::Overflow)?;
  let before=self.inventory_changes.get(&id).copied();
  let after=if row.quantity==Some(next){None}else{Some(next)};
  match after{Some(v)=>{self.inventory_changes.insert(id,v);},None=>{self.inventory_changes.remove(&id);}}
  self.undo.push(Change::Inventory{document_id:id,before,after});
  if self.undo.len()>MAX_UNDO{self.undo.remove(0);}
  self.redo.retain(|c|c.scope()!=HistoryScope::Inventory);self.revision=revision;Ok(())
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
 pub fn dirty(&self)->bool {!self.changes.is_empty()||!self.inventory_changes.is_empty()||!self.flower_variant_changes.is_empty()||!self.achievement_changes.is_empty()||!self.achievement_created.is_empty()}
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
  let revision=self.revision.checked_add(1).ok_or(Error::Overflow)?;
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
  let revision=self.revision.checked_add(1).ok_or(Error::Overflow)?;
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
  let model=self.slot.index.achievements.iter().find(|m|m.guid==parent).ok_or(Error::Schema)?;
  let original=achievement::value(model)?;
  let before=self.achievement_changes.get(&parent).copied();
  let after=if next==original{None}else{Some(next)};
  let revision=self.revision.checked_add(1).ok_or(Error::Overflow)?;
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
  let revision=self.revision.checked_add(1).ok_or(Error::Overflow)?;
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
  let next_revision=self.revision.checked_add(1).ok_or(Error::Overflow)?;
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
   let revision=self.revision.checked_add(1).ok_or(Error::Overflow)?;
   self.achievement_created.insert(guid,next);
   self.undo.push(Change::AchievementCreated{guid,before:Some(before),after:Some(next)});
   if self.undo.len()>MAX_UNDO{self.undo.remove(0);}
   self.redo.retain(|change|change.scope()!=HistoryScope::Achievements);self.revision=revision;
   return Ok(())
  }
  let model=self.slot.index.achievements.iter().find(|m|m.guid==guid).ok_or(Error::Schema)?;
  let original=achievement::value(model)?;
  // Revision exhaustion must not leave a partially applied CAS transaction.
  let revision=self.revision.checked_add(1).ok_or(Error::Overflow)?;
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
   Change::FlowerVariant{document_id,before,after}=>{
    match if reverse{before}else{after}{
     Some(v)=>{self.flower_variant_changes.insert(document_id,v);},
     None=>{self.flower_variant_changes.remove(&document_id);}
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
 pub fn reset(&mut self){self.changes.clear();self.inventory_changes.clear();self.flower_variant_changes.clear();self.achievement_changes.clear();self.achievement_created.clear();self.undo.clear();self.redo.clear();self.revision=self.revision.wrapping_add(1)}
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
    if !self.inventory_can_edit(row){return Err(Error::Schema)}
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
   let span=index.root_documents_span.clone().ok_or(Error::Schema)?;
   let mut cursor=Cursor::new(&intermediate[span.clone()]);
   let count=cursor.array()?;
   if count!=index.documents||count+self.achievement_created.len()>1_000_000{return Err(Error::Schema)}
   let insertion=index.achievements.last().ok_or(Error::Schema)?.fields[2].bytes.end;
   let head_end=span.start+cursor.pos;
   if insertion<head_end||insertion>span.end{return Err(Error::Schema)}
   let mut added:Vec<_>=self.achievement_created.iter().collect();
   added.sort_by_key(|(&guid,_)|guid);
   let max_id=index.achievements.iter().map(|x|x.id).max().ok_or(Error::Schema)?;
   let max_new=max_id.checked_add(u32::try_from(added.len()).map_err(|_|Error::Overflow)?).ok_or(Error::Overflow)?;
   if max_new>i32::MAX as u32{return Err(Error::Schema)}
   let mut replacement=Vec::new();
   mp_array_header(count+added.len(),&mut replacement)?;
   replacement.extend_from_slice(&intermediate[head_end..insertion]);
   for (i,(&guid,&value)) in added.into_iter().enumerate(){
    let id=max_id+(i as u32)+1;
    replacement.extend(encode_achievement_document(id,guid,value)?);
   }
   replacement.extend_from_slice(&intermediate[insertion..span.end]);
   let (result,created_at)=achievement::splice(&intermediate,vec![(span,replacement)])?;
   (result,first.min(created_at))
  };
  if next_payload==*original_payload{return Err(Error::Schema)}
  let new_slot=encode_slot(&self.slot_raw,&self.slot,&next_payload,first)?;
  let reread=read_slot(&new_slot)?;
  if !Self::compatible(&reread)||reread.envelope.version!=self.slot.envelope.version{return Err(Error::Schema)}
  let expected=self.entries();
  if reread.index.collections.len()!=expected.len() ||
   !reread.index.collections.iter().zip(&expected).all(|(r,e)|r.id==e.id&&r.ticks==e.ticks) {return Err(Error::Schema)}
  if reread.index.inventory.len()!=self.slot.index.inventory.len(){return Err(Error::Schema)}
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

fn mp_array_header(n:usize,out:&mut Vec<u8>)->Result<(),Error>{
 if n>1_000_000{return Err(Error::Budget)}
 if n<16{out.push(0x90|n as u8)}
 else if n<=u16::MAX as usize{out.push(0xdc);out.extend((n as u16).to_be_bytes());}
 else{out.push(0xdd);out.extend((n as u32).to_be_bytes());}
 Ok(())
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
const HISTORY_MAX_BYTES:usize=128*1024;

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
     let original=self.slot.index.inventory.iter().find(|r|r.id==document_id)
      .and_then(|r|r.quantity).ok_or(Error::Schema)?;
     out.extend(before.unwrap_or(original).to_le_bytes());
     out.extend(after.unwrap_or(original).to_le_bytes());
    }
    Change::FlowerVariant{document_id,before,after}=>{
     out.push(8);out.extend(document_id.to_le_bytes());
     let original=self.slot.index.inventory.iter().find(|r|r.id==document_id).and_then(|r|r.unique_data).and_then(flower_variant).ok_or(Error::Schema)?;
     for word in before.unwrap_or(original){out.extend(word.to_le_bytes());}
     for word in after.unwrap_or(original){out.extend(word.to_le_bytes());}
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
    8=>{
     let id=r.u32()?;
     let before=[r.i32()?,r.i32()?,r.i32()?,r.i32()?];
     let after=[r.i32()?,r.i32()?,r.i32()?,r.i32()?];
     candidate.change_inventory_flower_variant(id,before,after)?;
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

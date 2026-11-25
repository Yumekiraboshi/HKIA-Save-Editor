//! Schema-directed, bounded Native DbRoot walk. Never serializes game objects.
use crate::{Error,MAX_DECODED,envelope::Version,schema::{self,Spec,Shape},wire::{Cursor,Token}};
use std::{collections::{HashMap,HashSet},ops::Range};
const MAX_NODES:usize=2_000_000;
const MAX_DEPTH:usize=80;
const DOC:&str="Sunblink.UserData.IDocument";
const INVENTORY_UNIQUE:&str="Sunblink.Game.InventoryUniqueData";
const INVENTORY_UNIQUE_CAPTURE:&str="inventory-unique-capture";
const WAND_SOURCE_CAPTURE:&str="wand-source-unique-capture";
const ROOT:&str="MessagePackCollectionProvider.DbRoot";
const TRAIT:&str="Sunblink.UserData.TraitModel";
const SHOP:&str="ShopManagerTraitModel.ShopItemKey";
const CELEBRATION:&str="Sunblink.UserData.CelebratedItemList";
const HOME:&str="Sunblink.UserData.HomeModel";
const CABIN:&str="Sunblink.Game.CabinModel";
const VISITOR_MANAGER:&str="Sunblink.Game.VisitorCabinManagerModel";
/// Candidate reporting limits only; existing global node/decoded budgets remain.
pub const MAX_INDEXED_CABIN_MODELS:usize=4096;
pub const MAX_INDEXED_APARTMENT_REFS:usize=4096;
/// Candidate reporting cap only. Never relax the existing decoded/node limits.
pub const MAX_INDEXED_HOME_MODELS:usize=4096;
#[derive(Debug,Clone,PartialEq)]
pub struct FieldSpan {pub bytes:Range<usize>}
#[derive(Debug,Clone,PartialEq)]
pub struct Model {pub id:u32,pub guid:[u32;4],pub fields:[FieldSpan;3],pub state:ModelState}
#[derive(Debug,Clone,PartialEq)]
pub enum ModelState { Achievement {complete:bool,current:f32,completed:Option<(i64,u32)>}, Counter {current:f32,counted_values:Option<usize>,counted_guids:usize} }
#[derive(Debug,Clone,PartialEq)]
pub struct CollectionEntry {pub id:i32,pub ticks:i64,pub value:Range<usize>,pub pair:Range<usize>}
#[derive(Debug,Clone,PartialEq,Eq)]
pub struct CelebrationSpan {pub id:u32,pub bytes:Range<usize>,pub guid_count:usize}
#[derive(Debug,Clone,PartialEq,Eq)]
pub struct DeprecatedEntry {pub guid:[u32;4],pub ticks:i64,pub value:Range<usize>,pub pair:Range<usize>}
#[derive(Debug,Clone,PartialEq,Eq)]
pub struct InventoryRow {pub id:u32,pub item_id:Option<i32>,pub unique_id:Option<i32>,pub quantity:Option<i32>,pub fields:[Option<Range<usize>>;4],pub unique_is_nil:Option<bool>,pub unique_data:Option<InventoryUniqueData>,pub unique_fields:Vec<Range<usize>>}
/// Typed, read-only original inventory payload. Float bits preserve exact values,
/// including signed zero. Opaque includes historical/other/partial union records.
#[derive(Debug,Clone,Copy,PartialEq,Eq)]
pub enum InventoryUniqueData {
 Flower {grow_state:u8,base_color:i32,pattern:i32,pattern_color:i32},
 Furniture {materials:[i32;3]},
 Palette {rgba_bits:[[u32;4];3]},
 CafeAppearance {count:u8,colors:[i32;3]},
 BobaAppearance {color_id:i32},
 /// A one-level display snapshot. The complete original nested payload is
 /// retained in the source span; no recursive expansion or edit authority.
 WandAppearance {source_item_id:i32,magic:i32,fleck:i32,style:i32,source_tag:i32,source_count:u8,source_words:[u32;12]},
 Opaque {tag:i32},
}
impl InventoryUniqueData {
 /// A single wire projection for the top-level snapshot and nested source.
 /// Native identifiers are transported as their exact 32-bit words.
 pub fn display_words(self)->(i32,Vec<u32>){match self{
  Self::Flower{grow_state,base_color,pattern,pattern_color}=>(7,vec![u32::from(grow_state),base_color as u32,pattern as u32,pattern_color as u32]),
  Self::Furniture{materials}=>(8,materials.into_iter().map(|v|v as u32).collect()),
  Self::Palette{rgba_bits}=>(6,rgba_bits.into_iter().flatten().collect()),
  Self::CafeAppearance{count,colors}=>{let mut words=vec![u32::from(count)];words.extend(colors.into_iter().take(count as usize).map(|v|v as u32));(3,words)},
  Self::BobaAppearance{color_id}=>(4,vec![color_id as u32]),
  Self::WandAppearance{source_item_id,magic,fleck,style,source_tag,source_count,source_words}=>{
   let mut words=vec![source_item_id as u32,magic as u32,fleck as u32,style as u32,source_tag as u32,u32::from(source_count)];
   words.extend(source_words.into_iter().take(source_count as usize));(9,words)
  },
  Self::Opaque{tag}=>(tag,Vec::new()),
 }}
}
#[derive(Debug,Clone,PartialEq,Eq)]
pub struct CollectionVersion {pub id:u32,pub number:i32,pub span:Range<usize>}
/// One fully schema-walked, source-relative HomeModel *candidate*.
//// Exactly 15 tokens are retained, without serializing or copying game data.
/// This record deliberately has NO parent, apartment, owner, entitlement,
/// restore, snapshot or Writer authority.
#[derive(Debug,Clone,PartialEq,Eq)]
pub struct HomeSourceRow{
 pub hash128:[u32;4],
 pub whole:Range<usize>,
 pub fields:[Range<usize>;15],
}
/// Original typed ApartmentLocation(byte enum) -> Home Hash128 map pair.
/// A matching GUID is NOT proof of local ownership, parentage or residency.
#[derive(Debug,Clone,PartialEq,Eq)]
pub struct CabinApartmentSourcePair{
 pub apartment:u8,
 pub home_hash128:[u32;4],
 pub key:Range<usize>,
 pub value:Range<usize>,
 pub pair:Range<usize>,
}
/// Source span only: full eight-field CabinModel schema as walked by NativeIndex.
#[derive(Debug,Clone,PartialEq,Eq)]
pub struct CabinSourceRow{
 pub hash128:[u32;4],
 pub whole:Range<usize>,
 pub fields:[Range<usize>;8],
 pub apartments:Vec<CabinApartmentSourcePair>,
}
/// Deterministic correlation of two token ranges from this one decoded source.
/// It is not a Home parent join, local ownership proof, or capture grant.
#[derive(Debug,Clone,PartialEq,Eq)]
pub struct HomeCabinSourceCorrelation {
 pub cabin_hash128:[u32;4],
 pub apartment:u8,
 pub home_hash128:[u32;4],
 pub cabin_source:Range<usize>,
 pub apartment_pair_source:Range<usize>,
 pub home_source:Range<usize>,
}
/// Typed VisitorCabinManager Homes-map key and HomeModel source tokens.
/// This is not proof of local ownership, parentage or permission.
#[derive(Debug,Clone,PartialEq,Eq)]
pub struct VisitorHomeMapSourceEntry{
 pub home_hash128:[u32;4],
 pub key:Range<usize>,
 pub home:Range<usize>,
 pub pair:Range<usize>,
}
#[derive(Debug,Clone,PartialEq,Eq)]
pub struct VisitorManagerSourceRow{
 pub whole:Range<usize>,
 pub fields:[Range<usize>;7],
}
#[derive(Debug,Clone,PartialEq,Eq)]
pub struct VisitorManagerScopedSourceLink{
 pub manager:Range<usize>,
 pub cabin:Range<usize>,
 pub apartment_pair:Range<usize>,
 pub homes_key:Range<usize>,
 pub home:Range<usize>,
 pub cabin_hash128:[u32;4],
 pub apartment:u8,
 pub home_hash128:[u32;4],
}
/// Exact original top-level IDocument union bytes. The key is per tag,
/// not a globally unique ID and not a player-item identity.
#[derive(Debug,Clone,PartialEq,Eq)]
pub(crate) struct DocumentSpan{pub key:(i32,u32),pub bytes:Range<usize>}
#[derive(Debug,Default)]
pub struct NativeIndex {pub documents:usize,pub logical_nodes:usize,pub achievements:Vec<Model>,pub counters:Vec<Model>,pub collections:Vec<CollectionEntry>,pub deprecated_count:usize,pub dictionary_entries:usize,pub collection_map:Option<Range<usize>>,pub root_documents_span:Option<Range<usize>>,pub celebrations:Vec<CelebrationSpan>,pub inventory:Vec<InventoryRow>,pub inventory_item_refs:HashSet<(i32,i32)>,pub inventory_legacy_uid_refs:HashSet<i32>,pub inventory_item_refs_incomplete:bool,pub deprecated:Vec<DeprecatedEntry>,pub deprecated_map:Option<Range<usize>>,pub collection_version:Option<CollectionVersion>,
 /// ItemId-based references with a copied unique payload (outfits, stands,
 /// presets, placed items, mail and wand sources), separate from UID refs.
 pub inventory_payload_item_refs:HashSet<i32>,
 pub inventory_payload_refs_incomplete:bool,
 pub(crate) document_spans:Vec<DocumentSpan>,
 /// DbRoot.Key(1), native shared document allocation counter and exact token span.
 pub root_next_id:Option<(i32,Range<usize>)>,
 /// Source rows are derived only inside this existing NativeIndex Walk;
 /// completeness means just 15 schema fields, NEVER ownership or local rights.
 pub home_sources:Vec<HomeSourceRow>,
 pub home_models_seen:usize,
 pub home_incomplete_or_overflow:bool,
 pub home_duplicate_hash128:bool,
 pub home_parent_join_proven:bool,
 pub home_local_rights_proven:bool,
 pub home_capture_authorized:bool,
 /// Candidate Cabin/Apartment records from the SAME schema walk.
 pub cabin_sources:Vec<CabinSourceRow>,
 pub cabin_models_seen:usize,
 pub cabin_incomplete_or_overflow:bool,
 pub cabin_duplicate_hash128:bool,
 pub cabin_apartment_ambiguous:bool,
 /// Untrusted source-only links. Always suppressed for any incomplete,
 /// duplicate or unresolved candidate. NEVER grants local Home authority.
 pub home_cabin_source_correlations:Vec<HomeCabinSourceCorrelation>,
 pub home_cabin_source_unresolved:usize,
 pub home_cabin_source_suppressed:bool,
 pub visitor_manager_sources:Vec<VisitorManagerSourceRow>,
 pub visitor_home_map_sources:Vec<VisitorHomeMapSourceEntry>,
 pub visitor_managers_seen:usize,
 pub visitor_manager_incomplete_or_overflow:bool,
 pub visitor_manager_scoped_links:Vec<VisitorManagerScopedSourceLink>,
 pub visitor_manager_scoped_unresolved:usize,
 pub visitor_manager_scoped_suppressed:bool,
}
#[derive(Clone,Debug,PartialEq,Eq,Hash)]
enum Key<'a>{Int(i128),Str(&'a str),Guid([u32;4]),Shop([u32;4],[u32;4],i128)}
#[derive(Clone,Debug)]
enum Value<'a>{DocumentId(i128),Other,Nil,Bool(bool),Float(f32),Color([u32;4]),ChefColors{count:u8,colors:[i32;3]},InventoryUnique(InventoryUniqueData,Vec<Range<usize>>),Time(i64,u32),Int(i128),Str(&'a str),Guid([u32;4]),Count(usize),Fields(Vec<(Value<'a>,Range<usize>)>),Key(Key<'a>),CabinApartmentPairs(Vec<CabinApartmentSourcePair>)}
impl<'a> Value<'a>{
 fn int(&self)->Result<i128,Error>{if let Self::Int(v)=self{Ok(*v)}else{Err(Error::Schema)}}
 fn guid(&self)->Result<[u32;4],Error>{if let Self::Guid(v)=self{Ok(*v)}else{Err(Error::Schema)}}
 fn key(self)->Result<Key<'a>,Error>{match self{Self::Int(v)=>Ok(Key::Int(v)),Self::Str(v)=>Ok(Key::Str(v)),Self::Guid(v)=>Ok(Key::Guid(v)),Self::Key(v)=>Ok(v),_=>Err(Error::Schema)}}
}
struct Walk<'a>{c:Cursor<'a>,index:NativeIndex,version:Version,version_seen:bool,collection_seen:bool,ids:HashMap<i32,HashSet<u32>>,guids:HashSet<(i32,[u32;4])>,home_guids:HashSet<[u32;4]>,cabin_guids:HashSet<[u32;4]>,cabin_home_refs:HashSet<[u32;4]>,cabin_apartment_refs_stored:usize}
impl<'a> Walk<'a>{
 fn budget(&mut self,depth:usize)->Result<(),Error>{self.index.logical_nodes+=1;if depth>MAX_DEPTH||self.index.logical_nodes>MAX_NODES{Err(Error::Budget)}else{Ok(())}}
 fn primitive(&mut self,s:&str,depth:usize)->Result<Value<'a>,Error>{
  let lim=match s{"int"=>Some((i32::MIN as i128,i32::MAX as i128)),"uint"=>Some((0,u32::MAX as i128)),"long"=>Some((i64::MIN as i128,i64::MAX as i128)),"ulong"=>Some((0,u64::MAX as i128)),"short"=>Some((i16::MIN as i128,i16::MAX as i128)),"ushort"=>Some((0,u16::MAX as i128)),"byte"=>Some((0,255)),"sbyte"=>Some((-128,127)),_=>None};
  if let Some((lo,hi))=lim{return Ok(Value::Int(self.c.int(lo,hi)?))}
  match s{
   "Hash128"|"SaveGameGuid"=>{let mut w=[0;4];for v in &mut w{*v=self.c.int(0,u32::MAX as i128)? as u32;}Ok(Value::Guid(w))},
   "string"|"FixedString128Bytes"=>match self.c.token()?{Token::Str(v)=>Ok(Value::Str(v)),Token::Nil if s=="string"=>Ok(Value::Nil),_=>Err(Error::Schema)},
   "byte[]"=>match self.c.token()?{Token::Nil=>Ok(Value::Nil),Token::Bin(_)=>Ok(Value::Other),_=>Err(Error::Schema)},
   "float"=>match self.c.token()?{Token::F32(v) if v.is_finite()=>Ok(Value::Float(v)),_=>Err(Error::Schema)},
   "bool"=>match self.c.token()?{Token::Bool(v)=>Ok(Value::Bool(v)),_=>Err(Error::Schema)},
   "DateTime"=>{if !matches!(self.c.peek()?,0xd6|0xd7|0xc7){return Err(Error::Schema)}let (sec,nano)=self.c.timestamp()?;if nano%100!=0||!(-8640000000000..=8640000000000).contains(&sec){return Err(Error::Schema)}Ok(Value::Time(sec,nano))},
   "Vector3"|"Quaternion"|"Color"=>{let n=if s=="Vector3"{3}else{4};if self.c.array()?!=n{return Err(Error::Schema)}
    let mut bits=[0u32;4];
    for component in bits.iter_mut().take(n){self.budget(depth+1)?;let Value::Float(v)=self.primitive("float",depth+1)? else{return Err(Error::Schema)};*component=v.to_bits();}
    Ok(if s=="Color"{Value::Color(bits)}else{Value::Other})},
   _=>Err(Error::Schema)
  }
 }
 fn read(&mut self,s:Spec,depth:usize,ctx:Option<(&'static str,i32)>,collection:bool)->Result<Value<'a>,Error>{
  self.budget(depth)?;
  match s{
   Spec::Primitive(s)=>self.primitive(s,depth),
   Spec::Nullable(inner)=>{if self.c.peek()?==0xc0{self.c.token()?;Ok(Value::Nil)}else{self.read(*inner,depth+1,ctx,collection)}},
   Spec::Seq(inner)=>{if self.c.peek()?==0xc0{self.c.token()?;return Ok(Value::Nil)}let n=self.c.array()?;
    if ctx==Some(("chef-colors",0)){
     let mut colors=[0;3];
     for i in 0..n{let v=self.read(*inner,depth+1,None,false)?;if i<3{colors[i]=i32::try_from(v.int()?).map_err(|_|Error::Schema)?;}}
     Ok(Value::ChefColors{count:n.min(3) as u8,colors})
    }else{for _ in 0..n{self.read(*inner,depth+1,None,false)?;}Ok(Value::Count(n))}},
   Spec::Dict(k,v)=>{
    if self.c.peek()?==0xc0{self.c.token()?;return Ok(Value::Nil)}let start=self.c.pos;let n=self.c.map()?;self.index.dictionary_entries=self.index.dictionary_entries.checked_add(n).ok_or(Error::Overflow)?;
    let deprecated=ctx==Some(("collection-key0",0));
    // Typed same-walker capture. Never parse apartment tokens through a
    // second Reader and never infer local authority from source Hash128.
    let cabin_apartments=ctx==Some((CABIN,6));
    let visitor_home_map=ctx==Some((VISITOR_MANAGER,4));
    let mut apartment_pairs=Vec::new();
    let mut seen=HashSet::new();
    for _ in 0..n{
     let p=self.c.pos;
     let key=self.read(*k,depth+1,None,false)?.key()?;
     if !seen.insert(key.clone()){return Err(Error::Duplicate)}
     let at=self.c.pos;
     let value=self.read(*v,depth+1,None,false)?;
     if collection{
      let id=match key{Key::Int(i)=>i32::try_from(i).map_err(|_|Error::Schema)?,_=>return Err(Error::Schema)};
      let ticks=i64::try_from(value.int()?).map_err(|_|Error::Schema)?;
      self.index.collections.push(CollectionEntry{id,ticks,value:at..self.c.pos,pair:p..self.c.pos});
     }else if deprecated{
      let guid=match key{Key::Guid(g)=>g,_=>return Err(Error::Schema)};
      let ticks=i64::try_from(value.int()?).map_err(|_|Error::Schema)?;
      self.index.deprecated.push(DeprecatedEntry{guid,ticks,value:at..self.c.pos,pair:p..self.c.pos});
     }else if visitor_home_map{
      let home_hash128=match key{Key::Guid(g)=>g,_=>return Err(Error::Schema)};
      if self.index.visitor_home_map_sources.len()>=MAX_INDEXED_HOME_MODELS{
       self.index.visitor_manager_incomplete_or_overflow=true;
      }else{
       self.index.visitor_home_map_sources.push(VisitorHomeMapSourceEntry{
        home_hash128,key:p..at,home:at..self.c.pos,pair:p..self.c.pos
       });
      }
     }else if cabin_apartments{
      let apartment=match key{Key::Int(i)=>u8::try_from(i).map_err(|_|Error::Schema)?,_=>return Err(Error::Schema)};
      let home_hash128=value.guid()?;
      if self.cabin_apartment_refs_stored>=MAX_INDEXED_APARTMENT_REFS{
       self.index.cabin_incomplete_or_overflow=true;
      }else{
       self.cabin_apartment_refs_stored+=1;
       if !self.cabin_home_refs.insert(home_hash128){
        self.index.cabin_apartment_ambiguous=true;
       }
       apartment_pairs.push(CabinApartmentSourcePair{
        apartment,home_hash128,key:p..at,value:at..self.c.pos,pair:p..self.c.pos
       });
      }
     }
    }
    if collection{
     if self.index.collection_map.replace(start..self.c.pos).is_some(){return Err(Error::Duplicate)}
    }
    if deprecated{
     if self.index.deprecated_map.replace(start..self.c.pos).is_some(){return Err(Error::Duplicate)}
    }
    if cabin_apartments{Ok(Value::CabinApartmentPairs(apartment_pairs))}
    else{Ok(Value::Count(n))}
   },
   Spec::Type(name)=>{
    let shape=schema::shape(name).ok_or(Error::Schema)?;
    if let Shape::Enum(inner)=shape{return self.read(inner,depth+1,ctx,collection)}
    if self.c.peek()?==0xc0{if name==DOC||name==ROOT{return Err(Error::Schema)}self.c.token()?;return Ok(Value::Nil)}
    match shape{
     Shape::Enum(_)=>unreachable!(),
     Shape::Union(branches)=>{let union_start=self.c.pos;if self.c.array()?!=2{return Err(Error::Schema)}self.budget(depth+1)?;let tag=self.c.int(i32::MIN as i128,i32::MAX as i128)? as i32;let branch=branches.iter().find(|(t,_)|*t==tag).ok_or(Error::Schema)?.1;
      let capture_unique=name==INVENTORY_UNIQUE&&ctx==Some((INVENTORY_UNIQUE_CAPTURE,0));
      let capture_source=name==INVENTORY_UNIQUE&&ctx==Some((WAND_SOURCE_CAPTURE,0));
      let value=self.read(branch,depth+1,Some((if capture_unique{INVENTORY_UNIQUE_CAPTURE}else if capture_source{WAND_SOURCE_CAPTURE}else{name},tag)),false)?;
      if capture_unique||capture_source {
       let unique_fields=match &value{Value::Fields(a)=>a.iter().map(|(_,span)|span.clone()).collect(),_=>Vec::new()};
       let data=match (&value,tag){
        (Value::Fields(a),3) if a.len()==2=>match &a[1].0{
          Value::ChefColors{count,colors}=>InventoryUniqueData::CafeAppearance{count:*count,colors:*colors},
          _=>InventoryUniqueData::Opaque{tag},
         },
         (Value::Fields(a),4) if a.len()==5=>InventoryUniqueData::BobaAppearance{color_id:i32::try_from(a[0].0.int()?).map_err(|_|Error::Schema)?},
         (Value::Fields(a),9) if capture_unique&&a.len()==5=>{
          let (source_tag,words)=match &a[1].0{
           Value::Nil=>(-1,Vec::new()),
           Value::InventoryUnique(data,_)=>data.display_words(),
           _=>return Err(Error::Schema),
          };
          if words.len()>12{return Err(Error::Schema)}
          let mut source_words=[0;12];source_words[..words.len()].copy_from_slice(&words);
          InventoryUniqueData::WandAppearance{
           source_item_id:i32::try_from(a[0].0.int()?).map_err(|_|Error::Schema)?,
           magic:i32::try_from(a[2].0.int()?).map_err(|_|Error::Schema)?,
           fleck:i32::try_from(a[3].0.int()?).map_err(|_|Error::Schema)?,
           style:i32::try_from(a[4].0.int()?).map_err(|_|Error::Schema)?,
           source_tag,source_count:words.len() as u8,source_words}
         },
         (Value::Fields(a),7) if a.len()==4=>InventoryUniqueData::Flower{
         grow_state:u8::try_from(a[0].0.int()?).map_err(|_|Error::Schema)?,
         base_color:i32::try_from(a[1].0.int()?).map_err(|_|Error::Schema)?,
         pattern:i32::try_from(a[2].0.int()?).map_err(|_|Error::Schema)?,
         pattern_color:i32::try_from(a[3].0.int()?).map_err(|_|Error::Schema)?},
        (Value::Fields(a),8) if a.len()==3=>InventoryUniqueData::Furniture{materials:[
         i32::try_from(a[0].0.int()?).map_err(|_|Error::Schema)?,
         i32::try_from(a[1].0.int()?).map_err(|_|Error::Schema)?,
         i32::try_from(a[2].0.int()?).map_err(|_|Error::Schema)?]},
        (Value::Fields(a),6) if a.len()==3=>{
         let mut rgba_bits=[[0u32;4];3];
         for (dest,(v,_)) in rgba_bits.iter_mut().zip(a){let Value::Color(bits)=v else{return Err(Error::Schema)};*dest=*bits;}
         InventoryUniqueData::Palette{rgba_bits}},
        _=>InventoryUniqueData::Opaque{tag},
       };
       return Ok(Value::InventoryUnique(data,unique_fields));
      }
      if name==DOC{let (id,a)=match value{
       Value::DocumentId(id)=>(u32::try_from(id).map_err(|_|Error::Schema)?,None),
       Value::Fields(a)=>{let id=u32::try_from(a.first().ok_or(Error::Schema)?.0.int()?).map_err(|_|Error::Schema)?;(id,Some(a))},
       _=>return Err(Error::Schema)
      };
       // V33 requires a two-field Celebration document with a non-null Hash128 list.
       // Record the full union token range, not a reconstructed value or a deduplicated list.
       if tag==1{let a=a.as_ref().ok_or(Error::Schema)?;let int=|k:usize|->Result<Option<i32>,Error>{a.get(k).map(|v|i32::try_from(v.0.int()?).map_err(|_|Error::Schema)).transpose()};let fields=std::array::from_fn(|i|a.get(i+1).map(|v|v.1.clone()));let unique_is_nil=a.get(4).map(|v|matches!(&v.0,Value::Nil));let unique_data=a.get(4).and_then(|v|match &v.0{Value::InventoryUnique(data,_)=>Some(*data),_=>None});let unique_fields=a.get(4).and_then(|v|match &v.0{Value::InventoryUnique(_,fields)=>Some(fields.clone()),_=>None}).unwrap_or_default();self.index.inventory.push(InventoryRow{id,item_id:int(1)?,unique_id:int(2)?,quantity:int(3)?,fields,unique_is_nil,unique_data,unique_fields});}
       if tag==8{let a=a.as_ref().ok_or(Error::Schema)?;if a.len()!=2{return Err(Error::Schema)}let guid_count=match &a[1].0{Value::Count(n)=>*n,_=>return Err(Error::Schema)};self.index.celebrations.push(CelebrationSpan{id,bytes:union_start..self.c.pos,guid_count});}
       // The schema already checked tag membership. Store each u32 only once in its tag bucket.
       if !self.ids.entry(tag).or_default().insert(id){return Err(Error::Duplicate)}
       self.index.document_spans.push(DocumentSpan{key:(tag,id),bytes:union_start..self.c.pos});
       self.index.documents+=1;}
      Ok(Value::Other)
     },
     Shape::Fields(specs)=>{
      // The span begins at the exact MessagePack array token, not at a
      // copied UI representation or a caller-supplied digest.
      let source_start=self.c.pos;
      let n=self.c.array()?;if n>specs.len(){return Err(Error::Schema)}
      let short=name.rsplit('.').next().unwrap_or(name);let is_doc=matches!(ctx,Some((DOC,_)));let capture_all=matches!(short,"AchievementData"|"GameCounterData"|"GameCollectionsTraitModel"|"CollectionVersion"|"AchievementModel"|"GameCounterModel")||name==ROOT||name==SHOP||name==CELEBRATION||(short=="InventoryItem"&&ctx==Some((DOC,1)))||name==HOME||name==CABIN||name==VISITOR_MANAGER||matches!(ctx,Some((INVENTORY_UNIQUE_CAPTURE,_))|Some((WAND_SOURCE_CAPTURE,_)))||name=="Sunblink.UserData.UniqueItemIdModel"||name=="Sunblink.UserData.HomeObjectModelDeprecatedV71"||name=="Sunblink.Game.OwnedRemoteCabinHomeObjectClientModelDeprecatedV71";
      // Capture the typed ItemId fields even where the original unique
      // payload is copied instead of referenced by UID. Never scan arbitrary bytes.
      let payload_ref_keys:&[usize]=match name{
       "Sunblink.UserData.UniqueItemModel"|"Sunblink.UserData.HomeWallpaperModel"|"Sunblink.UserData.HomeFloorModel"|
       "Sunblink.Game.TableTraitModel"|"Sunblink.UserData.Types.CharacterMailboxSlotModel"|"Sunblink.Game.WandUniqueData"=>&[0],
       "Sunblink.UserData.OutfitPresetPieceModel"=>&[1],
       "Sunblink.UserData.HomeObjectModel"|"Sunblink.Game.OwnedRemoteCabinHomeObjectClientModel"=>&[0,1],
       "Sunblink.UserData.HomeObjectModelDeprecatedV71"=>&[2,6],
       "Sunblink.Game.OwnedRemoteCabinHomeObjectClientModelDeprecatedV71"=>&[1,2,3],
       _=>&[],
      };
      if payload_ref_keys.iter().any(|&key|key>=n){self.index.inventory_payload_refs_incomplete=true;}
      // Historical GUID-based flower outfit/wand payloads cannot safely
      // be joined by integer ID here; fail closed for that domain.
      let opaque_flower_ref=match name{
       "Sunblink.UserData.MermaidifierOutfitModel"=>Some(2),
       "Sunblink.Game.WandUniqueDataDeprecatedV75"=>Some(1),
       _=>None,
      };
      if opaque_flower_ref.is_some_and(|key|key>=n){self.index.inventory_payload_refs_incomplete=true;}
      let mut fields=Vec::new();let mut document_id=None;
      for (i,spec) in specs.iter().take(n).enumerate(){let at=self.c.pos;let value=match spec{Some(_) if short=="GameCounterData"&&i==1=>{self.budget(depth+1)?;if self.c.peek()?==0xc0{self.c.token()?;Value::Nil}else{let n=self.c.array()?;for _ in 0..n{self.budget(depth+2)?;if !matches!(self.c.token()?,Token::Str(_)){return Err(Error::Schema)}}Value::Count(n)}},Some(s)=>self.read(*s,depth+1,if short=="GameCollectionsTraitModel"&&i==0{Some(("collection-key0",0))}else if name==CABIN&&i==6{Some((CABIN,6))}else if name==VISITOR_MANAGER&&i==4{Some((VISITOR_MANAGER,4))}else if short=="InventoryItem"&&ctx==Some((DOC,1))&&i==4{Some((INVENTORY_UNIQUE_CAPTURE,0))}else if short=="CafeCreationUniqueData"&&matches!(ctx,Some((INVENTORY_UNIQUE_CAPTURE,3))|Some((WAND_SOURCE_CAPTURE,3)))&&i==1{Some(("chef-colors",0))}else if short=="WandUniqueData"&&ctx==Some((INVENTORY_UNIQUE_CAPTURE,9))&&i==1{Some((WAND_SOURCE_CAPTURE,0))}else{None},short=="GameCollectionsTraitModel"&&i==1)?,None=>{if self.c.token()?!=Token::Nil{return Err(Error::Schema)}Value::Nil}};
       if payload_ref_keys.contains(&i){
        let item=i32::try_from(value.int()?).map_err(|_|Error::Schema)?;
        if item>0{self.index.inventory_payload_item_refs.insert(item);}
       }
       if opaque_flower_ref==Some(i)&&!matches!(&value,Value::Nil){
        let mut c=Cursor::new(&self.c.bytes[at..self.c.pos]);
        if c.array()?!=2{return Err(Error::Schema)}
        let tag=c.int(i32::MIN as i128,i32::MAX as i128)?;
        if matches!(tag,2|7|9){self.index.inventory_payload_refs_incomplete=true;}
       }
       if capture_all{fields.push((value,at..self.c.pos));}
       else if is_doc&&i==0{document_id=Some(value);}
      }
      if name=="Sunblink.Game.OwnedRemoteCabinHomeObjectClientModelDeprecatedV71" {
       if let (Some((item,_)),Some((uid,_)))=(fields.get(1),fields.get(4)){
        let item=i32::try_from(item.int()?).map_err(|_|Error::Schema)?;
        let uid=i32::try_from(uid.int()?).map_err(|_|Error::Schema)?;
        if uid>0{self.index.inventory_item_refs.insert((item,uid));}
       }else{self.index.inventory_item_refs_incomplete=true;}
      }
      if name=="Sunblink.UserData.HomeObjectModelDeprecatedV71" {
       if let Some((v,_))=fields.get(7){let uid=i32::try_from(v.int()?).map_err(|_|Error::Schema)?;if uid>0{self.index.inventory_legacy_uid_refs.insert(uid);}}
       else{self.index.inventory_item_refs_incomplete=true;}
      }
      if name=="Sunblink.UserData.UniqueItemIdModel" {
       if n==2 {
        let item=i32::try_from(fields[0].0.int()?).map_err(|_|Error::Schema)?;
        let uid=i32::try_from(fields[1].0.int()?).map_err(|_|Error::Schema)?;
        self.index.inventory_item_refs.insert((item,uid));
       }else{self.index.inventory_item_refs_incomplete=true;}
      }
      if name==HOME {
       // A full 15-field walk uses the existing generated typed schema,
       // including all nested fields, budgets and source-relative spans.
       // Older/truncated layouts remain readable for other domains, but they
       // never become an authorized Home candidate.
       self.index.home_models_seen=self.index.home_models_seen.checked_add(1).ok_or(Error::Overflow)?;
       if n!=15 {
        self.index.home_incomplete_or_overflow=true;
       } else {
        let identity=fields[0].0.guid()?;
        if self.index.home_sources.len()>=MAX_INDEXED_HOME_MODELS {
         self.index.home_incomplete_or_overflow=true;
        } else if !self.home_guids.insert(identity) {
         self.index.home_duplicate_hash128=true;
        } else {
         let spans=std::array::from_fn(|i|fields[i].1.clone());
         self.index.home_sources.push(HomeSourceRow{hash128:identity,whole:source_start..self.c.pos,fields:spans});
        }
       }
      }
      if name==CABIN{
       self.index.cabin_models_seen=self.index.cabin_models_seen.checked_add(1).ok_or(Error::Overflow)?;
       if n!=8 {
        // Partial historical schemas remain readable, never complete.
        self.index.cabin_incomplete_or_overflow=true;
       }else{
        let identity=fields[0].0.guid()?;
        if self.index.cabin_sources.len()>=MAX_INDEXED_CABIN_MODELS{
         self.index.cabin_incomplete_or_overflow=true;
        }else if !self.cabin_guids.insert(identity){
         self.index.cabin_duplicate_hash128=true;
        }else if let Value::CabinApartmentPairs(ref pairs)=fields[6].0{
         let spans=std::array::from_fn(|i|fields[i].1.clone());
         self.index.cabin_sources.push(CabinSourceRow{
          hash128:identity,whole:source_start..self.c.pos,
          fields:spans,apartments:pairs.clone()
         });
        }else{
         // Nil apartment map does not certify an empty local Home.
         self.index.cabin_incomplete_or_overflow=true;
        }
       }
      }
      if name==VISITOR_MANAGER{
       self.index.visitor_managers_seen=self.index.visitor_managers_seen.checked_add(1).ok_or(Error::Overflow)?;
       if n!=7||self.index.visitor_manager_sources.len()>=MAX_INDEXED_CABIN_MODELS{
        self.index.visitor_manager_incomplete_or_overflow=true;
       }else{
        self.index.visitor_manager_sources.push(VisitorManagerSourceRow{
         whole:source_start..self.c.pos,
         fields:std::array::from_fn(|i|fields[i].1.clone())
        });
       }
      }
      if name==ROOT{if n!=3||!matches!(&fields[2].0,Value::Count(x) if *x>0 && *x==self.index.documents){return Err(Error::Schema)}self.index.root_next_id=Some((i32::try_from(fields[1].0.int()?).map_err(|_|Error::Schema)?,fields[1].1.clone()));self.index.root_documents_span=Some(fields[2].1.clone());}
      if name==SHOP{if n!=3{return Err(Error::Schema)}return Ok(Value::Key(Key::Shop(fields[0].0.guid()?,fields[1].0.guid()?,fields[2].0.int()?)))}
      if short=="CollectionVersion"{if ctx!=Some((DOC,18))||n!=3||self.version_seen{return Err(Error::Schema)}if !matches!(&fields[2].0,Value::Str(v) if *v==self.version.as_str()){return Err(Error::Version)}self.version_seen=true;self.index.collection_version=Some(CollectionVersion{id:u32::try_from(fields[0].0.int()?).map_err(|_|Error::Schema)?,number:i32::try_from(fields[1].0.int()?).map_err(|_|Error::Schema)?,span:fields[1].1.clone()});}
      if short=="GameCollectionsTraitModel"{if ctx!=Some((TRAIT,39))||n!=2||self.collection_seen{return Err(Error::Schema)}self.collection_seen=true;self.index.deprecated_count=match &fields[0].0{Value::Count(x)=>*x,_=>return Err(Error::Schema)};if !matches!(&fields[1].0,Value::Count(_)){return Err(Error::Schema)}}
      if matches!(short,"AchievementData"|"GameCounterData")&&n!=3{return Err(Error::Schema)}
      if matches!(short,"AchievementModel"|"GameCounterModel"){
       let tag=if short=="AchievementModel"{16}else{17};if ctx!=Some((DOC,tag))||n!=3{return Err(Error::Schema)}let id=u32::try_from(fields[0].0.int()?).map_err(|_|Error::Schema)?;let guid=fields[1].0.guid()?;if !self.guids.insert((tag,guid)){return Err(Error::Duplicate)}
       let data=match &fields[2].0{Value::Fields(v) if v.len()==3=>v,_=>return Err(Error::Schema)};
       if tag==17&&(!matches!(&data[2].0,Value::Count(_))||!matches!(&data[1].0,Value::Count(_)|Value::Nil)){return Err(Error::Schema)}
       let state=if tag==16{let complete=match &data[0].0{Value::Bool(v)=>*v,_=>return Err(Error::Schema)};let current=match &data[1].0{Value::Float(v)=>*v,_=>return Err(Error::Schema)};let completed=match &data[2].0{Value::Nil=>None,Value::Time(s,n)=>Some((*s,*n)),_=>return Err(Error::Schema)};ModelState::Achievement{complete,current,completed}}else{let current=match &data[0].0{Value::Float(v)=>*v,_=>return Err(Error::Schema)};let counted_values=match &data[1].0{Value::Nil=>None,Value::Count(n)=>Some(*n),_=>return Err(Error::Schema)};let counted_guids=match &data[2].0{Value::Count(n)=>*n,_=>return Err(Error::Schema)};ModelState::Counter{current,counted_values,counted_guids}};
       let model=Model{id,guid,fields:std::array::from_fn(|i|FieldSpan{bytes:data[i].1.clone()}),state};if tag==16{self.index.achievements.push(model)}else{self.index.counters.push(model)}
      }
      if capture_all{Ok(Value::Fields(fields))}else if is_doc{Ok(Value::DocumentId(document_id.ok_or(Error::Schema)?.int()?))}else{Ok(Value::Other)}
     }
    }
   }
  }
 }
}
/// Correlates *already typed* token ranges in the same successfully walked DbRoot.
/// Never parse source again or copy raw bytes. A unique Hash128 match is not
/// proof that a Cabin is local, that a Home is owned or that a snapshot is safe.
/// All candidate rows come from the one NativeIndex; all counts are bounded
/// by the original 4096-row/4096-apartment candidate caps.
fn correlate_source_only(index:&mut NativeIndex){
 if index.home_incomplete_or_overflow
  || index.home_duplicate_hash128
  || index.cabin_incomplete_or_overflow
  || index.cabin_duplicate_hash128
  || index.cabin_apartment_ambiguous
 {
  index.home_cabin_source_suppressed=true;
  return;
 }
 let homes:HashMap<[u32;4],Range<usize>>=index.home_sources.iter()
  .map(|h|(h.hash128,h.whole.clone())).collect();
 let mut proposed=Vec::new();
 let mut missing=0usize;
 for cabin in &index.cabin_sources {
  for apartment in &cabin.apartments {
   if let Some(home_source)=homes.get(&apartment.home_hash128) {
    proposed.push(HomeCabinSourceCorrelation{
     cabin_hash128:cabin.hash128,
     apartment:apartment.apartment,
     home_hash128:apartment.home_hash128,
     cabin_source:cabin.whole.clone(),
     apartment_pair_source:apartment.pair.clone(),
     home_source:home_source.clone(),
    });
   } else {
    missing+=1;
   }
  }
 }
 index.home_cabin_source_unresolved=missing;
 if missing>0 {
  // The root may have a missing/remote/unindexed Home. Do not expose
  // a partial set as if it were a complete source closure.
  index.home_cabin_source_suppressed=true;
 } else {
  index.home_cabin_source_correlations=proposed;
 }
}
/// Source-only typed VisitorCabinManager field0/field4 closure in the existing
/// NativeIndex; never grants parent/local rights or opens a Writer.
fn correlate_visitor_manager_source_only(index:&mut NativeIndex){
 if index.home_incomplete_or_overflow||index.home_duplicate_hash128
  ||index.cabin_incomplete_or_overflow||index.cabin_duplicate_hash128
  ||index.cabin_apartment_ambiguous||index.visitor_manager_incomplete_or_overflow{
  index.visitor_manager_scoped_suppressed=true;
  return;
 }
 let inside=|outer:&Range<usize>,inner:&Range<usize>|{
  outer.start<=inner.start&&inner.end<=outer.end
 };
 // Avoid repeated linear Home scans under a forged high-cardinality
 // Visitor manager map. Cap is the existing 4096 Home source rows.
 let homes_by_span:HashMap<(usize,usize),[u32;4]>=index.home_sources.iter()
  .map(|h|((h.whole.start,h.whole.end),h.hash128)).collect();
 let mut proposed=Vec::new();
 let mut unresolved=0usize;
 for manager in &index.visitor_manager_sources{
  let mut homes=HashMap::new();
  for entry in &index.visitor_home_map_sources{
   if !inside(&manager.fields[4],&entry.pair){continue}
   let valid=homes_by_span.get(&(entry.home.start,entry.home.end))
    .is_some_and(|g|*g==entry.home_hash128)
    &&inside(&entry.pair,&entry.home)&&inside(&manager.fields[4],&entry.key);
   if !valid||homes.insert(entry.home_hash128,entry).is_some(){
    index.visitor_manager_scoped_suppressed=true;
    return;
   }
  }
  for cabin in &index.cabin_sources{
   if !inside(&manager.fields[0],&cabin.whole){continue}
   for pair in &cabin.apartments{
    if let Some(entry)=homes.get(&pair.home_hash128){
     proposed.push(VisitorManagerScopedSourceLink{
      manager:manager.whole.clone(),cabin:cabin.whole.clone(),
      apartment_pair:pair.pair.clone(),homes_key:entry.key.clone(),
      home:entry.home.clone(),cabin_hash128:cabin.hash128,
      apartment:pair.apartment,home_hash128:pair.home_hash128
     });
    }else{unresolved+=1}
   }
  }
 }
 index.visitor_manager_scoped_unresolved=unresolved;
 if unresolved>0{
  // Partial, foreign, or missing Homes dictionaries are NOT a scoped closure.
  index.visitor_manager_scoped_suppressed=true;
 }else{index.visitor_manager_scoped_links=proposed}
}
/// Strict schema walk over decompressed bytes; only target spans and identities are retained.
pub fn index_native(bytes:&[u8],version:Version)->Result<NativeIndex,Error>{
 if bytes.is_empty()||bytes.len()>MAX_DECODED{return Err(Error::Budget)}
 let mut w=Walk{c:Cursor::new(bytes),index:NativeIndex::default(),version,version_seen:false,collection_seen:false,ids:HashMap::new(),guids:HashSet::new(),home_guids:HashSet::new(),cabin_guids:HashSet::new(),cabin_home_refs:HashSet::new(),cabin_apartment_refs_stored:0};
 w.read(schema::ROOT,0,None,false)?;
 if w.c.pos!=bytes.len(){return Err(Error::Trailing)}
 if !w.version_seen||!w.collection_seen||w.index.achievements.is_empty()||w.index.counters.is_empty(){return Err(Error::Schema)}
 correlate_source_only(&mut w.index);
 correlate_visitor_manager_source_only(&mut w.index);
 Ok(w.index)
}

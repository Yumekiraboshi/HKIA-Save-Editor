//! v3.0.1 original inventory pin identity. No write or context authority.
//! Hash128Extensions.Append at 0x2E52A60/BF0/D20 and Unity short hash at
//! 0x7595EA0. Explicit little-endian word order; no platform-dependent hash.
use crate::{native::{InventoryRow,InventoryUniqueData},wire::{Cursor,Token}};
use std::collections::HashMap;
type Guid=[u32;4];
const C:u64=0xdeadbeefdeadbeef;
fn words(g:Guid)->[u64;2]{[u64::from(g[0])|(u64::from(g[1])<<32),u64::from(g[2])|(u64::from(g[3])<<32)]}
fn guid(v:[u64;2])->Guid{[v[0] as u32,(v[0]>>32) as u32,v[1] as u32,(v[1]>>32) as u32]}
fn short_end(mut v:[u64;4])->Guid{
 for (i,j,n) in [(3,2,15),(0,3,52),(1,0,26),(2,1,51),(3,2,28),(0,3,9),(1,0,47),(2,1,54),(3,2,32),(0,3,25),(1,0,63)]{
  v[i]^=v[j];v[j]=v[j].rotate_left(n);v[i]=v[i].wrapping_add(v[j]);
 }
 guid([v[0],v[1]])
}
fn append_int(h:Guid,n:i32)->Guid{
 let [a,b]=words(h);short_end([a,b,C.wrapping_add(u64::from(n as u32)),C.wrapping_add(4u64<<56)])
}
fn append_long(h:Guid,n:i64)->Guid{
 let [a,b]=words(h);short_end([a,b,C.wrapping_add(n as u64),C.wrapping_add(8u64<<56)])
}
fn append_guid(h:Guid,g:Guid)->Guid{
 if g==[0;4]{return h}
 let [a,b]=words(h);let [c,d]=words(g);
 let mut v=[a,b,C.wrapping_add(c),C.wrapping_add(d)];
 // Unity short hash's 16-byte block and final empty tail.
 for (i,j,k,n) in [(2,3,0,50),(3,0,1,52),(0,1,2,30),(1,2,3,41),
  (2,3,0,54),(3,0,1,48),(0,1,2,38),(1,2,3,37),
  (2,3,0,62),(3,0,1,34),(0,1,2,5),(1,2,3,36)]{
  v[i]=v[i].rotate_left(n);v[i]=v[i].wrapping_add(v[j]);v[k]^=v[i];
 }
 v[2]=v[2].wrapping_add(C);v[3]=v[3].wrapping_add(16u64<<56).wrapping_add(C);
 short_end(v)
}
fn read_int(b:&[u8])->Option<i32>{
 let mut c=Cursor::new(b);let n=c.int(i32::MIN as i128,i32::MAX as i128).ok()? as i32;
 (c.pos==b.len()).then_some(n)
}
fn read_guid(b:&[u8])->Option<Guid>{
 let mut c=Cursor::new(b);let mut g=[0;4];for w in &mut g{*w=c.int(0,u32::MAX as i128).ok()? as u32;}
 (c.pos==b.len()).then_some(g)
}
fn read_int_list(b:&[u8],mut h:Guid)->Option<Guid>{
 let mut c=Cursor::new(b);let n=c.array().ok()?;
 for _ in 0..n{h=append_int(h,c.int(i32::MIN as i128,i32::MAX as i128).ok()? as i32);}
 (c.pos==b.len()).then_some(h)
}
fn color_code(bits:[u32;4])->i32{
 let [r,g,b,a]=bits.map(|w|if w&0x7fffffff==0{0}else{w as i32});
 r^g.wrapping_shl(2)^(b>>2)^(a>>1)
}
fn unique_guid(row:&InventoryRow,raw:&[u8])->Option<Guid>{
 let data=row.unique_data?;let field=|i:usize|raw.get(row.unique_fields.get(i)?.clone());
 let int=|i|read_int(field(i)?);let g=|i|read_guid(field(i)?);
 let mut h=[0;4];
 match data{
  InventoryUniqueData::Flower{grow_state,base_color,pattern,pattern_color} if row.unique_fields.len()==4=>{
   use crate::collection::{LEGACY_FLOWER_COLOR_GUIDS as C,LEGACY_FLOWER_PATTERN_GUIDS as P};
   for key in [*C.get(usize::try_from(base_color).ok()?)?,*P.get(usize::try_from(pattern).ok()?)?,*C.get(usize::try_from(pattern_color).ok()?)?]{h=append_guid(h,key);}
   h=append_int(h,i32::from(grow_state));
  }
  InventoryUniqueData::Furniture{materials} if row.unique_fields.len()==3=>{
   for index in materials{
    let key=if index==0{[0;4]}else{crate::furniture_source::MATERIAL_GUID_INDEX.iter().find(|r|r.1==index)?.0};
    h=append_guid(h,key);
   }
  }
  InventoryUniqueData::Palette{rgba_bits} if row.unique_fields.len()==3=>{for bits in rgba_bits{h=append_int(h,color_code(bits));}}
  InventoryUniqueData::CafeAppearance{..} if row.unique_fields.len()==2=>{
   // Native Guid hashes both full lists in serialized order, not just the display colors.
   h=read_int_list(field(0)?,h)?;h=read_int_list(field(1)?,h)?;
  }
  InventoryUniqueData::BobaAppearance{..} if row.unique_fields.len()==5=>{for i in 0..5{h=append_int(h,int(i)?);}}
  InventoryUniqueData::WandAppearance{source_item_id,magic,fleck,style,..} if row.unique_fields.len()==5=>{
   // Native WandUniqueData.get_Guid does NOT hash the copied source payload.
   // Different source appearances can intentionally share a pin identity.
   for n in [source_item_id,magic,fleck,style]{h=append_int(h,n);}
  }
  InventoryUniqueData::Opaque{tag:0} if row.unique_fields.len()==1=>{h=g(0)?;}
  InventoryUniqueData::Opaque{tag:1} if row.unique_fields.len()==3=>{for i in 0..3{h=append_guid(h,g(i)?);}}
  InventoryUniqueData::Opaque{tag:2} if row.unique_fields.len()==4=>{
   for i in 1..4{h=append_guid(h,g(i)?);}h=append_int(h,int(0)?);
  }
  InventoryUniqueData::Opaque{tag:5} if row.unique_fields.len()==5=>{
   h=append_guid(h,g(0)?);for i in 2..5{h=append_int(h,int(i)?);}
  }
  InventoryUniqueData::Opaque{tag:10} if row.unique_fields.len()==1=>{
   let bytes=field(0)?;let mut c=Cursor::new(bytes);
   if c.array().ok()?!=3||!matches!(c.token().ok()?,Token::Str(_)){return None}
   let id=c.int(i64::MIN as i128,i64::MAX as i128).ok()? as i64;
   if !matches!(c.token().ok()?,Token::Bool(_))||c.pos!=bytes.len(){return None}
   h=append_long(h,id);
  }
  InventoryUniqueData::Opaque{tag:11} if row.unique_fields.len()==2=>{h=append_int(h,int(0)?);}
  _=>return None,
 }
 Some(h)
}
/// Build a single exact definition crosswalk per opened source, never a
/// per-item allowlist. Missing/unsupported identities stay absent.
pub(crate) fn source_identities(rows:&[InventoryRow],raw:&[u8])->HashMap<u32,Guid>{
 use crate::inventory_legacy_wand_guid_data::{LEGACY_WAND_SOURCE_GUIDS,OTHER_NATIVE_ITEM_GUIDS};
 let definitions:HashMap<i32,Guid>=LEGACY_WAND_SOURCE_GUIDS.iter().chain(OTHER_NATIVE_ITEM_GUIDS).map(|&(g,id)|(id,g)).collect();
 rows.iter().filter_map(|r|{
  if r.id==0||r.fields.iter().any(Option::is_none){return None}
  let definition=*definitions.get(&r.item_id?)?;
  let key=match r.unique_is_nil?{true=>definition,false=>append_guid(definition,unique_guid(r,raw)?)};
  Some((r.id,key))
 }).collect()
}
#[cfg(test)]
mod tests{
 use super::*;
 #[test]fn original_int_append_instruction_vectors(){
  // Independent transcription of the native straight-line integer append
  // at 0x2E52C50..0x2E52D04, including negative integer and nonzero seed.
  assert_eq!(words(append_int([0;4],0)),[0xacfc557d99b85644,0x14e6f10ef5c69b08]);
  assert_eq!(words(append_int([0;4],1)),[0xda1bf81db640f023,0x9bdbd1f5c5efad25]);
  assert_eq!(words(append_int(guid([0x1122334455667788,0x99aabbccddeeff00]),-1)),[0x46f78d50f3f7cc73,0xd72ff70de0c54cd4]);
  assert_eq!(words(append_int([0;4],12345)),[0xfbd2282a91426ddd,0x187378ce2207ab2f]);
  assert_eq!(append_guid([1,2,3,4],[0;4]),[1,2,3,4]);
 }
 #[test]fn ordered_native_payloads_and_shared_wand_identity(){
  let fields=std::array::from_fn(|_|Some(0..1));
  let row=|source_tag,source_words|InventoryRow{id:1,item_id:Some(315822),unique_id:Some(1),quantity:Some(1),fields:fields.clone(),unique_is_nil:Some(false),unique_data:Some(InventoryUniqueData::WandAppearance{source_item_id:123,magic:45,fleck:67,style:89,source_tag,source_count:1,source_words}),unique_fields:vec![0..1;5]};
  let mut variant=[0;12];variant[0]=1;
  assert_eq!(unique_guid(&row(7,variant),&[0]),unique_guid(&row(8,[0;12]),&[0]));
  assert_ne!(append_int(append_int([0;4],1),2),append_int(append_int([0;4],2),1));
  assert_eq!(color_code([0,0,0,0]),color_code([0x80000000,0x80000000,0x80000000,0x80000000]));
 }
}

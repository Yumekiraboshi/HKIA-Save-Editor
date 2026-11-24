/** Verified per-item image overrides (not guesses from the 5-channel palette).
 * A file is accepted only when its Item ID, same-origin path and source
 * provenance are registered. Validation of local bytes is performed in CI.
 */
export type VariantArtRecord={
 file:string;
 sha256:string;
 provenance:'game-render';
 source:string;
};
export type VariantArtIndex={
 schema:'HKIA.DyeVariantArt.1';
 version:'3.0.1';
 records:Record<string,VariantArtRecord>;
};
const ITEM_ID=/^[1-9][0-9]{0,9}$/;
const SHA=/^[0-9a-f]{64}$/;
const FILE=/^[1-9][0-9]{0,9}\.(?:png|webp)$/;
const MAX_RECORDS=6000;
const MAX_SOURCE=192;
const SOURCE=/^unityfs:[a-z0-9][a-z0-9._-]{4,185}$/;
const hasOwn=(obj:object,key:string)=>Object.prototype.hasOwnProperty.call(obj,key);
export function parseVariantArtIndex(value:unknown,base:string):Record<string,string>{
 if(!value||typeof value!=='object')throw Error('VARIANT_ART_INDEX_INVALID');
 const raw=value as Partial<VariantArtIndex>;
 if(raw.schema!=='HKIA.DyeVariantArt.1'||raw.version!=='3.0.1'||!raw.records||
  typeof raw.records!=='object'||Array.isArray(raw.records))throw Error('VARIANT_ART_INDEX_INVALID');
 const entries=Object.entries(raw.records);
 if(entries.length>MAX_RECORDS)throw Error('VARIANT_ART_INDEX_OVERSIZE');
 if(!base.startsWith('/')||!base.endsWith('/')||base.includes('..')||
  base.includes('\\')||base.includes('//'))throw Error('VARIANT_ART_BASE_INVALID');
 const urls:Record<string,string>={};
 for(const [id,record] of entries){
  if(!ITEM_ID.test(id)||!record||typeof record!=='object'||!hasOwn(record,'file')||
   !FILE.test(record.file)||!record.file.startsWith(id+'.')||
   !SHA.test(record.sha256)||
   record.provenance!=='game-render'||
   typeof record.source!=='string'||record.source.length>MAX_SOURCE||!SOURCE.test(record.source))
    throw Error('VARIANT_ART_RECORD_INVALID');
  // Only game-file derived renders are accepted: no third-party capture,
  // dynamic network source or path traversal.
  urls[id]=base+'variant-art/'+record.file;
 }
 return urls;
}
/** Named, already-colored sprites embedded in the game data. The original
 * Item Definition still points at a separate shared grey UiIcon, so this
 * is original source artwork, NOT a verified reproduction of runtime UI.
 */
type SourceColorwayRecord={
 file:string;sha256:string;itemKey:string;sourceSpriteName:string;
 definitionPathId:string;sourceSpritePathId:string;sharedUiIconPathId:string;
 texturePathId:string;textureName:string;textureSha256:string;
 sourceKind:'direct'|'atlas';sourceSpriteMeshApplied?:boolean;
 sourceSpriteBundle?:'atlas_global';pack?:string;
};
type SourceColorwayIndex={
 schema:'HKIA.NamedNativeColorwaySprite.1';version:'3.0.1';
 source:'original-game-texture-sprites';
 provenance:'game-original-named-colorway-sprite';
 definitionsSha256:string;atlasSha256:string;runtimeUiIconReferenceMatches:false;
 records:Record<string,SourceColorwayRecord>;
};
const I64=/^-?[1-9][0-9]{0,18}$/;
const SOURCE_KEY=/^item_c_dyeable_[a-z0-9_]{1,180}$/;
const DEFINITIONS_SHA='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0';
const GLOBAL_ATLAS_SHA='04c1f4c191b0a821a0bbcb15e67a75bec85cf343a0b2e875ee8e525e1e8dfc7b';
export function parseSourceColorwayIndex(value:unknown,base:string):Record<string,string>{
 if(!value||typeof value!=='object')throw Error('SOURCE_COLORWAY_INDEX_INVALID');
 const raw=value as Partial<SourceColorwayIndex>;
 if(raw.schema!=='HKIA.NamedNativeColorwaySprite.1'||raw.version!=='3.0.1'||
  raw.source!=='original-game-texture-sprites'||
  raw.provenance!=='game-original-named-colorway-sprite'||
  raw.definitionsSha256!==DEFINITIONS_SHA||raw.atlasSha256!==GLOBAL_ATLAS_SHA||
  raw.runtimeUiIconReferenceMatches!==false||!raw.records||
  typeof raw.records!=='object'||Array.isArray(raw.records))throw Error('SOURCE_COLORWAY_INDEX_INVALID');
 if(!base.startsWith('/')||!base.endsWith('/')||base.includes('..')||
  base.includes('\\')||base.includes('//'))throw Error('VARIANT_ART_BASE_INVALID');
 const entries=Object.entries(raw.records);
 if(entries.length>MAX_RECORDS)throw Error('SOURCE_COLORWAY_INDEX_OVERSIZE');
 const urls:Record<string,string>={};
 for(const [id,r] of entries){
  if(!ITEM_ID.test(id)||Number(id)>0x7fffffff||!r||typeof r!=='object'||
   r.file!==id+'.webp'||!SHA.test(r.sha256)||!SHA.test(r.textureSha256)||
   typeof r.itemKey!=='string'||!SOURCE_KEY.test(r.itemKey)||
   r.sourceSpriteName!=='icon_'+r.itemKey||
   ![r.definitionPathId,r.sourceSpritePathId,r.sharedUiIconPathId,r.texturePathId]
    .every(x=>typeof x==='string'&&I64.test(x))||
   r.sourceSpritePathId===r.sharedUiIconPathId||
   (r.sourceSpriteBundle!==undefined&&(r.sourceSpriteBundle!=='atlas_global'||r.sourceKind!=='atlas'||typeof r.pack!=='string'||!/^atlas-colorways-\d{2}\.zip$/.test(r.pack)))||
   (r.pack!==undefined&&r.sourceSpriteBundle!=='atlas_global')||
   (r.sourceKind==='direct'?r.textureName!==r.sourceSpriteName:
    r.sourceKind==='atlas'?r.sourceSpriteMeshApplied!==true||
     !/^sactx-[0-9]+-2048x2048-DXT5\|BC3-GlobalUIAtlas-[0-9a-f]+$/.test(r.textureName):true))
    throw Error('SOURCE_COLORWAY_RECORD_INVALID');
  urls[id]=base+'source-colorways/'+r.file;
 }
 return urls;
}
export async function loadSourceColorwayIndex(base:string):Promise<Record<string,string>>{
 const response=await fetch(base+'source-colorways/index.json',{cache:'force-cache'});
 if(!response.ok)throw Error('SOURCE_COLORWAY_INDEX_FETCH');
 return parseSourceColorwayIndex(await response.json(),base);
}
/** Compact, build-verified index of actual named dynamic inventory sprites.
 * These are original game images; the live runtime lookup is not established.
 */
export function parseDynamicColorwayIndex(value:unknown,base:string):Record<string,string>{
 const raw=value as {schema?:string;version?:string;definitionsSha256?:string;records?:Record<string,string>};
 if(!raw||raw.schema!=='HKIA.DynamicColorwayDisplay.1'||raw.version!=='3.0.1'||
  raw.definitionsSha256!==DEFINITIONS_SHA||!raw.records||typeof raw.records!=='object'||
  Array.isArray(raw.records)||Object.keys(raw.records).length!==5021)
  throw Error('DYNAMIC_COLORWAY_INDEX_INVALID');
 if(!base.startsWith('/')||!base.endsWith('/')||base.includes('..')||base.includes('\\')||base.includes('//'))
  throw Error('VARIANT_ART_BASE_INVALID');
 const result:Record<string,string>={};
 for(const [id,hash] of Object.entries(raw.records)){
  if(!ITEM_ID.test(id)||Number(id)>0x7fffffff||typeof hash!=='string'||!SHA.test(hash))
   throw Error('DYNAMIC_COLORWAY_RECORD_INVALID');
  result[id]=base+'dynamic-colorways/'+id+'.webp?v='+hash;
 }
 return result;
}
export async function loadDynamicColorwayIndex(base:string):Promise<Record<string,string>>{
 const response=await fetch(base+'dynamic-colorways/index.json',{cache:'force-cache'});
 if(!response.ok)throw Error('DYNAMIC_COLORWAY_INDEX_FETCH');
 return parseDynamicColorwayIndex(await response.json(),base);
}
export async function loadVariantArtIndex(base:string):Promise<Record<string,string>>{
 const [original,dynamic,verified]=await Promise.allSettled([
  loadSourceColorwayIndex(base),
  loadDynamicColorwayIndex(base),
  (async()=>{
   const response=await fetch(base+'variant-art/index.json',{cache:'force-cache'});
   if(!response.ok)throw Error('VARIANT_ART_INDEX_FETCH');
   return parseVariantArtIndex(await response.json(),base);
  })()
 ]);
 if(original.status==='rejected'&&dynamic.status==='rejected'&&verified.status==='rejected')throw verified.reason;
 // A verified runtime render outranks a named source sprite. A failed
 // optional index must not hide valid artwork from the other index.
 return {...(dynamic.status==='fulfilled'?dynamic.value:{}),
  ...(original.status==='fulfilled'?original.value:{}),
  ...(verified.status==='fulfilled'?verified.value:{})};
}

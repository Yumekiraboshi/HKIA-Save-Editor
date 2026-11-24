import type {Locale} from './locales';

const VERIFIED_DEFINITIONS_SHA256='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0';
const V301_COUNT=10262;
export type SourceItemNames=Record<string,string>;

/** Exact Steam 3.0.1 InventoryItemDefinitionAsset.Id → Name.selectedString
 * → Babel table-300 ID in the requested original game locale. This replaces
 * heuristic same-text joins; it does NOT write save data.
 */
export function decodeSourceItemNames(value:unknown,locale:Locale):SourceItemNames{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('SOURCE_NAMES_INVALID');
 const raw=value as Record<string,unknown>;
 if(raw.schema!=='HKIA.SourceVerifiedItemNames.1'||raw.version!=='3.0.1'||
  raw.locale!==locale||raw.source_sha256!==VERIFIED_DEFINITIONS_SHA256||
  !Number.isInteger(raw.count)||raw.count!==V301_COUNT||
  typeof raw.manifest_sha256!=='string'||!/^[a-f0-9]{64}$/.test(raw.manifest_sha256)||
  typeof raw.table300_sha256!=='string'||!/^[a-f0-9]{64}$/.test(raw.table300_sha256)||
  !raw.names||typeof raw.names!=='object'||Array.isArray(raw.names))throw Error('SOURCE_NAMES_INVALID');
 const names=raw.names as Record<string,unknown>,entries=Object.entries(names);
 if(entries.length!==V301_COUNT)throw Error('SOURCE_NAMES_INCOMPLETE');
 const verified:SourceItemNames=Object.create(null);
 for(const [id,name] of entries){
  if(!/^[1-9]\d{0,9}$/.test(id)||Number(id)>0x7fffffff||
   typeof name!=='string'||!name.trim()||name.length>256||
   Object.hasOwn(verified,id))throw Error('SOURCE_NAMES_INVALID');
  verified[id]=name;
 }
 return verified;
}
/** Additional names for original inventory definitions not in the collection crosswalk.
 * These are exact Id -> Name.selectedString -> Babel table 100/300 joins. */
export function decodeInventoryAdditionalNames(value:unknown,locale:Locale,baseNames:SourceItemNames):SourceItemNames{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('SOURCE_NAMES_INVALID');
 const raw=value as Record<string,unknown>;
 const tables=raw.tables_sha256 as Record<string,unknown>|undefined;
 if(raw.schema!=='HKIA.NativeInventoryAdditionalNames.1'||raw.version!=='3.0.1'||
  raw.locale!==locale||raw.source_sha256!==VERIFIED_DEFINITIONS_SHA256||
  raw.count!==1901||typeof raw.manifest_sha256!=='string'||!/^[a-f0-9]{64}$/.test(raw.manifest_sha256)||
  !tables||typeof tables['100']!=='string'||!/^[a-f0-9]{64}$/.test(tables['100'])||
  typeof tables['300']!=='string'||!/^[a-f0-9]{64}$/.test(tables['300'])||
  !raw.names||typeof raw.names!=='object'||Array.isArray(raw.names))throw Error('SOURCE_NAMES_INVALID');
 const entries=Object.entries(raw.names as Record<string,unknown>);
 if(entries.length!==1901)throw Error('SOURCE_NAMES_INCOMPLETE');
 const names:SourceItemNames=Object.create(null);
 for(const [id,name] of entries){
  if(!/^[1-9]\d{0,9}$/.test(id)||Number(id)>0x7fffffff||
   typeof name!=='string'||!name.trim()||name.length>256||Object.hasOwn(baseNames,id))
   throw Error('SOURCE_NAMES_INVALID');
  names[id]=name;
 }
 return names;
}
export async function loadSourceItemNames(base:string,locale:Locale):Promise<SourceItemNames>{
 const response=await fetch(base+'source-names/'+encodeURIComponent(locale)+'.json');
 if(!response.ok)throw Error('SOURCE_NAMES_UNAVAILABLE');
 const names=decodeSourceItemNames(await response.json(),locale);
 // Keep original collection names if the supplemental asset is unavailable.
 // No other language or guessed title substitutes for an unresolved native ID.
 if(locale==='ar')return names;
 try{
  const extra=await fetch(base+'inventory-names/'+encodeURIComponent(locale)+'.json');
  if(extra.ok)Object.assign(names,decodeInventoryAdditionalNames(await extra.json(),locale,names));
 }catch{/* verified base titles remain available */}
 return names;
}

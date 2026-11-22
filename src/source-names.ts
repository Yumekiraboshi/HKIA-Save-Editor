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
export async function loadSourceItemNames(base:string,locale:Locale):Promise<SourceItemNames>{
 const response=await fetch(base+'source-names/'+encodeURIComponent(locale)+'.json');
 if(!response.ok)throw Error('SOURCE_NAMES_UNAVAILABLE');
 return decodeSourceItemNames(await response.json(),locale);
}

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
export async function loadVariantArtIndex(base:string):Promise<Record<string,string>>{
 const response=await fetch(base+'variant-art/index.json',{cache:'force-cache'});
 if(!response.ok)throw Error('VARIANT_ART_INDEX_FETCH');
 return parseVariantArtIndex(await response.json(),base);
}

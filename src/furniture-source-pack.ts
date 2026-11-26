/** Read-only diagnostic source pack adapter. The caller must pin the manifest
 * digest independently of the downloaded asset files. Not a save parser and
 * not proof of native scene/shader parity. Unsupported draws still refuse. */
import type {FurnitureMultiSources} from './furniture-multi-diagnostic';
import type {NativeCubeSource} from './native-cube-upload';
import {furniturePayloadReferences,createFurniturePayloadReader,validateFurniturePayloadRoot} from './furniture-payload-reader';
import {createFurnitureTreatmentResolver} from './furniture-material-treatment';
type Geometry=FurnitureMultiSources['geometry']['rows'][number]&{visualGuid:string;bundle:string};
type Pack=Pick<FurnitureMultiSources,'geometry'|'base'|'patterns'|'additionalPatterns'>&{
 schema:string;version:string;catalogSha256:string;renderFidelity:string;
 geometry:FurnitureMultiSources['geometry']&{rows:readonly Geometry[]};
 cubemaps:Readonly<Record<string,NativeCubeSource>>;
};
type Visual={schema:string;version:string;definitionsSha256:string;rows:readonly (readonly [number,string,number,string,string,string|null,string|null,string])[]};
type Addressables={schema:string;version:string;catalogSha256:string;visualDefinitionsSha256:string;bundleNames:readonly string[];rows:readonly (readonly [string,number,number,readonly number[]])[]};
const catalogSha='555a82bf7e8a6f0b6c9fee7d179988f54015e7b354902f13937198115e9ff52a';
const definitionsSha='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0';
const hex=/^[0-9a-f]{64}$/;
const fail=(s:string):never=>{throw Error('FURNITURE_SOURCE_PACK_'+s);};
function unique<K,V>(rows:readonly V[],key:(v:V)=>K){
 const map=new Map<K,V>();for(const row of rows){const k=key(row);if(map.has(k))fail('DUPLICATE');map.set(k,row);}return map;
}
export async function openFurnitureSourcePack(
 bytes:ArrayBuffer,expected:{sha256:string;bytes:number},root:URL,
 source:Pick<FurnitureMultiSources,'catalog'|'variants'>,
 visual:Visual,addressables:Addressables,fetchAsset:typeof fetch=fetch
){
 if(!(bytes instanceof ArrayBuffer)||!hex.test(expected.sha256)||!Number.isSafeInteger(expected.bytes)||expected.bytes<=0||expected.bytes>32*1024*1024||bytes.byteLength!==expected.bytes)fail('LENGTH');
 // Snapshot before await to prevent a mutable ArrayBuffer from changing
 // between digest verification and JSON decoding.
 const snapshot=bytes.slice(0),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',snapshot)),x=>x.toString(16).padStart(2,'0')).join('');
 if(digest!==expected.sha256)fail('HASH');
 const p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(snapshot)) as Pack;
 if(p.schema!=='HKIA.FurnitureSourcePack.1'||p.version!=='3.0.1'||p.catalogSha256!==catalogSha||p.renderFidelity!=='unverified'||
 p.geometry.schema!=='HKIA.FurnitureStaticMeshSamples.1'||p.base.schema!=='HKIA.FurnitureBaseMaterialSource.1'||p.patterns.schema!=='HKIA.FurniturePatternTextureSamples.1'||p.additionalPatterns.schema!=='HKIA.FurniturePatternTextureSources.1'||
 [p.geometry,p.base,p.patterns,p.additionalPatterns].some(x=>x.version!=='3.0.1')||p.patterns.rows.length!==0||
 visual.schema!=='HKIA.FurnitureVisualSource.1'||visual.version!=='3.0.1'||visual.definitionsSha256!==definitionsSha||
 addressables.schema!=='HKIA.FurnitureAddressablesSource.1'||addressables.version!=='3.0.1'||addressables.catalogSha256!==catalogSha||addressables.visualDefinitionsSha256!==definitionsSha||
 source.catalog.source.definitionSha256!==definitionsSha||source.variants.definitionsSha256!==definitionsSha)fail('VERSION');
 createFurnitureTreatmentResolver(source.catalog,source.variants);
 const items=unique(visual.rows,r=>r[0]),assets=unique(addressables.rows,r=>r[0]),patternSources=unique(source.variants.patterns,r=>r[0]);
 const models=unique(p.geometry.rows,g=>g.itemId),bindings=unique(p.base.rows,r=>r.itemId);
 if(models.size===0||models.size!==bindings.size||models.size>649||p.additionalPatterns.rows.length>274)fail('COVERAGE');
 for(const [id,g] of models){
  const v=items.get(id);if(!v||!bindings.has(id)||g.visualGuid!==(v[6]??v[4]))fail('VISUAL');
  if(!assets.get(g.visualGuid)?.[3].some(i=>addressables.bundleNames[i]===g.bundle))fail('MODEL_SOURCE');
 }
 const patterns=unique(p.additionalPatterns.rows,t=>t.guid);
 for(const [guid,t] of patterns){
  if(!patternSources.get(guid)?.[3].some(i=>source.variants.bundleNames[i]===t.bundle))fail('PATTERN_SOURCE');
 }
 const d:FurnitureMultiSources={...source,geometry:p.geometry,base:p.base,patterns:p.patterns,additionalPatterns:p.additionalPatterns};
 const cubes=Object.values(p.cubemaps);
 if(cubes.length!==2||new Set(cubes.map(c=>c.sha256)).size!==2)fail('CUBE_COVERAGE');
 const refs=furniturePayloadReferences(d,cubes);
 const read=createFurniturePayloadReader(root,refs,fetchAsset);
 return {sources:d,cubemaps:p.cubemaps,read,renderFidelity:'unverified' as const};
}

/** Fetch only the independently pinned source manifest. Assets remain lazy and
 * content-addressed; this does not enable unverified artwork in product UI. */
export async function fetchFurnitureSourcePack(
 root:URL,expected:{sha256:string;bytes:number},
 source:Pick<FurnitureMultiSources,'catalog'|'variants'>,
 visual:Visual,addressables:Addressables,fetchAsset:typeof fetch=fetch
){
 const base=validateFurniturePayloadRoot(root),pin={...expected};
 if(!hex.test(pin.sha256)||!Number.isSafeInteger(pin.bytes)||pin.bytes<=0||pin.bytes>32*1024*1024)fail('LENGTH');
 const response=await fetchAsset(new URL('sources.json',base),{method:'GET',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
 if(!response.ok||!response.body)throw Error('FURNITURE_SOURCE_PACK_FETCH');
 const stream=response.body.getReader(),bytes=new ArrayBuffer(pin.bytes),out=new Uint8Array(bytes);
 let offset=0;
 try{
  for(;;){
   const {done,value}=await stream.read();
   if(done)break;
   if(value.byteLength>out.length-offset)fail('LENGTH');
   out.set(value,offset);offset+=value.byteLength;
  }
  if(offset!==out.length)fail('LENGTH');
 }finally{
  try{await stream.cancel();}catch{/* Preserve the original verification error. */}
  stream.releaseLock();
 }
 return openFurnitureSourcePack(bytes,pin,base,source,visual,addressables,fetchAsset);
}

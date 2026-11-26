/** Read-only transport for extracted, content-addressed furniture artwork.
 * The allowlist must come from pinned original source metadata, never a save.
 * No URLs or payloads are generated from unverified item appearance fields. */
import type {ReadRugPayload,RugPayload} from './furniture-rug-diagnostic';
import type {FurnitureMultiSources} from './furniture-multi-diagnostic';
import type {NativeCubeSource} from './native-cube-upload';
/** The existing pinned renderer source manifests, not the downloaded pack's
 * index, establish the browser's list of legal asset references. */
export function furniturePayloadReferences(s:FurnitureMultiSources,cubes:readonly NativeCubeSource[]):RugPayload[]{
 const geometry=s.geometry.rows.map(g=>({kind:'geometry' as const,sha256:g.geometrySha256,bytes:g.geometryBytes}));
 const textures=[...Object.values(s.base.textures),...s.patterns.rows,...s.additionalPatterns.rows].map(t=>({kind:'texture' as const,sha256:t.sha256,bytes:t.bytes}));
 return [...geometry,...textures,...cubes.map(c=>({kind:'cube' as const,sha256:c.sha256,bytes:c.bytes}))];
}
const MAX_PAYLOAD=96*1024*1024;
const MAX_CACHE=32*1024*1024;
const valid=(r:RugPayload)=>['geometry','texture','cube'].includes(r.kind)&&/^[0-9a-f]{64}$/.test(r.sha256)&&Number.isSafeInteger(r.bytes)&&r.bytes>0&&r.bytes<=MAX_PAYLOAD;
const key=(r:RugPayload)=>r.kind+'/'+r.sha256;
const digest=async(b:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
/** Stream into a size-bounded buffer; even a bad or missing Content-Length
 * cannot grow the allocation beyond the verified source length. */
async function verifiedBody(response:Response,ref:RugPayload):Promise<Blob>{
 if(!response.ok||!response.body)throw Error('FURNITURE_PAYLOAD_FETCH');
 const stream=response.body.getReader(),buf=new ArrayBuffer(ref.bytes),out=new Uint8Array(buf);
 let offset=0;
 try{
  for(;;){
   const {done,value}=await stream.read();
   if(done)break;
   if(value.byteLength>out.length-offset)throw Error('FURNITURE_PAYLOAD_LENGTH');
   out.set(value,offset);offset+=value.byteLength;
  }
  if(offset!==ref.bytes)throw Error('FURNITURE_PAYLOAD_LENGTH');
 }finally{
  try{await stream.cancel();}catch{/* Preserve the verification error. */}
  stream.releaseLock();
 }
 if(await digest(buf)!==ref.sha256)throw Error('FURNITURE_PAYLOAD_HASH');
 return new Blob([buf]);
}
/** One reader per source version. Coalesce in-flight loads and retain only
 * verified immutable blobs within the byte budget. Returned ArrayBuffers
 * are independent copies, so consumers cannot corrupt shared cached bytes. */
export function validateFurniturePayloadRoot(root:URL):URL{
 const base=new URL(root.href);
 if(!['http:','https:'].includes(base.protocol)||!base.pathname.endsWith('/')||base.search||base.hash||base.username||base.password||
  (typeof location!=='undefined'&&base.origin!==location.origin))throw Error('FURNITURE_PAYLOAD_ROOT');
 return base;
}
export function createFurniturePayloadReader(root:URL,allowed:readonly RugPayload[],fetchAsset:typeof fetch=fetch):ReadRugPayload{
 const base=validateFurniturePayloadRoot(root);
 const allow=new Map<string,number>();
 for(const ref of allowed){
  if(!valid(ref)||(allow.has(key(ref))&&allow.get(key(ref))!==ref.bytes))throw Error('FURNITURE_PAYLOAD_INDEX');
  allow.set(key(ref),ref.bytes);
 }
 const cache=new Map<string,Blob>(),pending=new Map<string,Promise<Blob>>();
 let used=0;
 function remember(k:string,blob:Blob){
  if(blob.size>MAX_CACHE)return;
  while(used+blob.size>MAX_CACHE){
   const oldest=cache.keys().next().value;if(oldest===undefined)break;
   used-=cache.get(oldest)!.size;cache.delete(oldest);
  }
  cache.set(k,blob);used+=blob.size;
 }
 return async ref=>{
  if(!valid(ref)||allow.get(key(ref))!==ref.bytes)throw Error('FURNITURE_PAYLOAD_UNKNOWN');
  const k=key(ref),cached=cache.get(k);
  if(cached){cache.delete(k);cache.set(k,cached);return cached.arrayBuffer();}
  let task=pending.get(k);
  if(!task){
   const expected={...ref};
   task=(async()=>{
    const response=await fetchAsset(new URL(k+'.bin',base),{method:'GET',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
    const blob=await verifiedBody(response,expected);remember(k,blob);return blob;
   })().finally(()=>{pending.delete(k);});
   pending.set(k,task);
  }
  return (await task).arrayBuffer();
 };
}

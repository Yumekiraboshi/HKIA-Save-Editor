/** Candidate-only delivery of original completed IconOverride artwork.
 * The receipt and every asset are bound to an explicitly reviewed release.
 * No save data, inferred recolor or alternate Item ID is used. */
import {readStoredZip} from './icon-packs';
import {loadVerifiedArtAsset} from './dynamic-art-assets';
const SHA=/^[a-f0-9]{64}$/;
const GUID=/^[a-f0-9]{32}$/;
const FILE=/^[1-9][0-9]{0,9}\.webp$/;
const ZIP=/^override-\d{3}\.zip$/;
type Pin=Readonly<{version:string;receiptFileSha256:string}>;
type Asset=Readonly<{file:string;bytes:number;sha256:string}>;
type Entry=Readonly<{file:string;sha256:string;pack:string}>;
type Pack=Asset&{entries:Map<number,Entry>};
type Index={packs:Map<string,Pack>;entries:Map<number,Entry>};
function check(ok:unknown):asserts ok{if(!ok)throw Error('ORIGINAL_OVERRIDE_CANDIDATE_INVALID');}
function obj(v:unknown):Record<string,unknown>{check(v!==null&&typeof v==='object'&&!Array.isArray(v));return v as Record<string,unknown>;}
function id(v:unknown):number{check(typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=0x7fffffff);return v;}
function array(v:unknown,max:number):unknown[]{check(Array.isArray(v)&&v.length<=max);return v;}
function validPin(p:Pin){check(/^\d+\.\d+\.\d+$/.test(p.version)&&SHA.test(p.receiptFileSha256));}
function asset(files:Record<string,unknown>,file:string,max:number):Asset{
 const v=obj(files['original-override-packs/'+file]);
 check(typeof v.bytes==='number'&&Number.isSafeInteger(v.bytes)&&v.bytes>0&&v.bytes<=max&&typeof v.sha256==='string'&&SHA.test(v.sha256));
 return {file,bytes:v.bytes,sha256:v.sha256};
}
function receiptObject(value:unknown,pin:Pin){
 validPin(pin);const v=obj(value);
 check(v.schema==='HKIA.IconReleaseCandidate.1'&&v.version===pin.version&&v.approval==='review-required'&&v.automaticReleaseActivationAuthorized===false);
 return v;
}
export function decodeCandidateOriginalOverrides(receipt:unknown,value:unknown,pin:Pin):Index{
 const r=receiptObject(receipt,pin),files=obj(r.outputFiles),v=obj(value);
 check(v.schema==='HKIA.OriginalOverridePackCandidate.1');
 const packs=new Map<string,Pack>(),counts=new Map<string,number>();
 const rows=array(v.packs,1000);
 for(const [i,raw] of rows.entries()){
  const p=obj(raw),file='override-'+String(i).padStart(3,'0')+'.zip';
  check(p.file===file&&ZIP.test(file)&&typeof p.count==='number'&&Number.isSafeInteger(p.count)&&p.count>0&&p.count<=144);
  const a=asset(files,file,4_000_000);check(a.bytes===p.bytes&&a.sha256===p.sha256);
  packs.set(file,{...a,entries:new Map()});counts.set(file,p.count);
 }
 const paths=Object.keys(files).filter(k=>k.startsWith('original-override-packs/'));
 check(paths.length===packs.size+1&&paths.every(k=>k==='original-override-packs/index.json'||packs.has(k.slice('original-override-packs/'.length))));
 const entries=new Map<number,Entry>(),guids=new Set<string>(),ready=new Set<number>();
 const census=array(r.routes,100000);
 check(census.length===r.definitionCount);
 const seen=new Set<number>();
 for(const raw of census){
  const route=obj(raw),i=id(route.itemId);check(!seen.has(i));seen.add(i);
  if(route.kind==='original-override'&&array(route.sourceBlockers,32).length===0)ready.add(i);
 }
 for(const [key,raw] of Object.entries(obj(v.records))){
  const i=id(Number(key)),e=obj(raw),b=obj(e.binding);
  check(String(i)===key&&seen.has(i)&&e.file===key+'.webp'&&FILE.test(e.file as string)&&typeof e.sha256==='string'&&SHA.test(e.sha256)&&typeof e.pack==='string'&&packs.has(e.pack));
  check(b.itemId===i&&typeof b.assetGuid==='string'&&GUID.test(b.assetGuid)&&!guids.has(b.assetGuid)&&
   typeof b.itemKey==='string'&&/^item_[a-z0-9_]+$/.test(b.itemKey)&&
   typeof b.serializedGuidBytes==='string'&&GUID.test(b.serializedGuidBytes));
  const entry={file:e.file as string,sha256:e.sha256,pack:e.pack};
  entries.set(i,entry);packs.get(e.pack)!.entries.set(i,entry);guids.add(b.assetGuid);
 }
 // A native recipe may itself have an override definition even when its
 // inventory display selects another result. Keep source identity separate.
 check(entries.size===r.completedOverrideCount&&[...ready].every(i=>entries.has(i)));
 for(const [file,p] of packs)check(p.entries.size===counts.get(file));
 return {packs,entries};
}
const hash=async(data:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
/** Verify every entry against the candidate's exact file identity before
 * exposing any image from the pack. Staged originals are 96x96 VP8L WebP. */
export async function decodeOriginalOverrideZip(data:ArrayBuffer,pack:Pack):Promise<ReadonlyMap<number,Blob>>{
 const files=readStoredZip(data,FILE);
 check(files.size===pack.entries.size);
 const images=new Map<number,Blob>();
 for(const [i,e] of pack.entries){
  const bytes=files.get(e.file);
  check(bytes&&bytes.length>=25&&bytes.length<=200000);
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  check(String.fromCharCode(...bytes.subarray(12,16))==='VP8L'&&bytes[20]===0x2f);
  const dim=view.getUint32(21,true);
  check((dim&0x3fff)+1===96&&((dim>>>14)&0x3fff)+1===96);
  const raw=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
  check(await hash(raw)===e.sha256);
  images.set(i,new Blob([raw],{type:'image/webp'}));
 }
 return images;
}
export function createVersionedOriginalOverrideProvider(root:string,pin:Pin,load=loadVerifiedArtAsset){
 validPin(pin);check(root.startsWith('/')&&root.endsWith('/')&&!root.includes('..')&&!root.includes('//')&&!root.includes('\\')&&!/[?#]/.test(root));
 let pending:Promise<Index>|undefined;
 const index=()=>pending??=(async()=>{
  const r=receiptObject(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await load(root,'release-candidate.json',pin.receiptFileSha256,16*1024*1024))),pin);
  const a=asset(obj(r.outputFiles),'index.json',16*1024*1024);
  const v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await load(root+'original-override-packs/',a.file,a.sha256,16*1024*1024,a.bytes)));
  return decodeCandidateOriginalOverrides(r,v,pin);
 })().catch(e=>{pending=undefined;throw e;});
 const inflight=new Map<string,Promise<ReadonlyMap<number,Blob>>>(),cache=new Map<string,ReadonlyMap<number,Blob>>();
 function getPack(p:Pack){
  const ready=cache.get(p.file);if(ready){cache.delete(p.file);cache.set(p.file,ready);return Promise.resolve(ready);}
  const existing=inflight.get(p.file);if(existing)return existing;
  const task=(async()=>decodeOriginalOverrideZip(await load(root+'original-override-packs/',p.file,p.sha256,4_000_000,p.bytes),p))().then(images=>{
   cache.set(p.file,images);if(cache.size>4)cache.delete(cache.keys().next().value!);return images;
  }).finally(()=>{inflight.delete(p.file);});
  inflight.set(p.file,task);return task;
 }
 return async(itemId:number,version:string):Promise<Blob|null>=>{
  try{
   if(version!==pin.version)return null;
   id(itemId);const v=await index(),e=v.entries.get(itemId);if(!e)return null;
   return (await getPack(v.packs.get(e.pack)!)).get(itemId)??null;
  }catch{return null;}
 };
}

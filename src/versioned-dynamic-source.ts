/** Version-bound source-page transport. Presentation only: caller supplies
 * validated tints and a source-proven mask binding. Never selects a save
 * version, infers appearance attributes, or enables an unreviewed release.
 * Reuses the existing shared texture verifier, rasterizer and Blob cache.
 */
import {loadVerifiedArtAsset,loadOpaqueArtTexture,renderCachedDynamicArt,renderCachedOriginalBase,type TextureAsset} from './dynamic-art-assets';
import {isNeutralTintSet,type TintSet} from './dynamic-sprite-color';
import type {Rect,SpriteOverlay} from './dynamic-sprite-raster';

export type DynamicSourcePin=Readonly<{
 version:string;indexSha256:string;renderer:'guarded-native-rgb-alpha-v1';
}>;
type SourceRow=Readonly<{
 texture:string;asset:TextureAsset;sampleRect:Rect;trimTopLeft:Rect;guardRect:Rect;
 logicalSize:number;alphaOffsetY:number;maskColorSpace:'linear'|'srgb';
}>;
type SourceIndex=ReadonlyMap<string,SourceRow>;
const SHA=/^[a-f0-9]{64}$/;
const KEY=/^(?:base:[1-9][0-9]{0,9}|mask:[a-f0-9]{32})$/;
const fail=():never=>{throw Error('VERSIONED_DYNAMIC_SOURCE_INVALID');};
function require(ok:unknown):asserts ok{if(!ok)fail();}
function object(v:unknown):Record<string,unknown>{
 require(v!==null&&typeof v==='object'&&!Array.isArray(v));return v as Record<string,unknown>;
}
function number(v:unknown):number{require(typeof v==='number'&&Number.isFinite(v));return v;}
function integer(v:unknown,min:number,max:number):number{
 const n=number(v);require(Number.isSafeInteger(n)&&n>=min&&n<=max);return n;
}
function hash(v:unknown):string{require(typeof v==='string'&&SHA.test(v));return v;}
function rect(v:unknown):Rect{
 require(Array.isArray(v)&&v.length===4);return [number(v[0]),number(v[1]),number(v[2]),number(v[3])];
}
function routeKey(v:unknown):string{
 require(typeof v==='string'&&KEY.test(v));
 if(v.startsWith('base:'))integer(Number(v.slice(5)),1,0x7fffffff);
 return v;
}
function asset(v:unknown):TextureAsset{
 const a=object(v),sha256=hash(a.sha256),file=a.file;
 require(typeof file==='string'&&file==='source-'+sha256+'.webp');
 const width=integer(a.width,1,1024),height=integer(a.height,2,2048);
 require(height%2===0);
 return {file,sha256,rgbSha256:hash(a.rgbSha256),width,height,bytes:integer(a.bytes,1,1024*1024)};
}
function validatePin(pin:DynamicSourcePin){
 require(/^\d+\.\d+\.\d+$/.test(pin.version)&&SHA.test(pin.indexSha256)&&pin.renderer==='guarded-native-rgb-alpha-v1');
}
function sameAsset(a:TextureAsset,b:TextureAsset){return a.file===b.file&&a.sha256===b.sha256&&a.rgbSha256===b.rgbSha256&&a.width===b.width&&a.height===b.height&&a.bytes===b.bytes;}
/** Decode an already hash-verified index. Missing routes remain missing.
 * Candidate pages have a duplicated outer edge around each original crop.
 */
export function decodeVersionedDynamicSource(value:unknown,pin:DynamicSourcePin):SourceIndex{
 validatePin(pin);
 const v=object(value);
 require(v.schema==='HKIA.DynamicSourcePageCandidate.1'&&v.version===pin.version&&v.renderer===pin.renderer);
 require(Array.isArray(v.pages)&&v.pages.length<=4096&&Array.isArray(v.unresolved)&&v.unresolved.length<=100000);
 const pages=new Map<string,TextureAsset>();
 for(const row of v.pages){const a=asset(row);require(!pages.has(a.file));pages.set(a.file,a);}
 const entries=Object.entries(object(v.records));require(entries.length<=100000);
 const records=new Map<string,SourceRow>(),used=new Set<string>();
 for(const [rawKey,raw] of entries){
  const key=routeKey(rawKey),r=object(raw),a=asset(r.asset),registered=pages.get(a.file);
  require(registered&&sameAsset(a,registered));
  const sampleRect=rect(r.sampleRect),trimTopLeft=rect(r.trimTopLeft),guardRect=rect(r.guardRect);
  const [x,y,w,h]=sampleRect,[gx,gy,gw,gh]=guardRect,[l,t,rr,b]=trimTopLeft;
  const logicalSize=number(r.logicalSize),alphaOffsetY=integer(r.alphaOffsetY,1,1024);
  require(alphaOffsetY*2===a.height&&logicalSize>0&&logicalSize<=4096&&
   guardRect.every(Number.isSafeInteger)&&gx>=1&&gy>=1&&gw>0&&gh>0&&gx+gw<a.width&&gy+gh<alphaOffsetY&&
   w>0&&h>0&&x>=gx&&y>=gy&&x+w<=gx+gw+.001&&y+h<=gy+gh+.001&&
   l>=-.001&&t>=-.001&&rr>l&&b>t&&rr<=logicalSize+.001&&b<=logicalSize+.001);
  require(r.maskColorSpace==='linear'||r.maskColorSpace==='srgb');
  if(key.startsWith('base:'))require(r.maskColorSpace==='srgb');
  records.set(key,{texture:hash(r.texture),asset:registered,sampleRect,trimTopLeft,guardRect,logicalSize,alphaOffsetY,maskColorSpace:r.maskColorSpace});
  used.add(a.file);
 }
 const missing=new Set<string>();
 for(const raw of v.unresolved){
  const row=object(raw),key=routeKey(row.key);
  require(!records.has(key)&&!missing.has(key)&&typeof row.reason==='string'&&row.reason.length>0&&row.reason.length<=4096);
  missing.add(key);
 }
 require(used.size===pages.size);
 return records;
}
/** Explicit source pin comes from a reviewed, bundled release descriptor,
 * never from a save, a remotely supplied version string, or the index itself.
 * No production candidate pin is installed by this module. */
export function createVersionedDynamicSourceLoader(root:string,pin:DynamicSourcePin,loadIndex=loadVerifiedArtAsset,loadTexture=loadOpaqueArtTexture){
 validatePin(pin);
 require(root.startsWith('/')&&root.endsWith('/')&&!root.includes('//')&&!root.includes('..')&&!root.includes('\\')&&!/[?#]/.test(root));
 let pending:Promise<SourceIndex>|undefined;
 const index=()=>pending??=(async()=>{
  const bytes=await loadIndex(root,'index.json',pin.indexSha256,16*1024*1024);
  return decodeVersionedDynamicSource(JSON.parse(new TextDecoder().decode(bytes)),pin);
 })().catch(error=>{pending=undefined;throw error;});
 function key(itemId:number,mode:string,extra:unknown){
  return JSON.stringify(['versioned-dynamic-source-1',pin.version,pin.indexSha256,pin.renderer,itemId,mode,extra]);
 }
 async function baseRow(itemId:number,version:string){
  if(version!==pin.version||!Number.isSafeInteger(itemId)||itemId<=0||itemId>0x7fffffff)return undefined;
  return (await index()).get('base:'+itemId);
 }
 async function original(itemId:number,version:string):Promise<Blob|null>{
  try{
   const row=await baseRow(itemId,version);if(!row)return null;
   const base=await loadTexture(root,row.asset);
   return await renderCachedOriginalBase(key(itemId,'original',row.texture),{base,baseRect:row.sampleRect,trim:row.trimTopLeft,alphaOffsetY:row.alphaOffsetY,logicalSize:row.logicalSize});
  }catch{return null;}
 }
 /** The caller has already resolved the native appearance and mask GUID
  * from the reviewed family manifest. Do not infer it from this index. */
 async function render(itemId:number,version:string,maskGuid:string,tints:TintSet):Promise<Blob|null>{
  try{
   if(!/^[a-f0-9]{32}$/.test(maskGuid)||
      tints.length!==3||!tints.every(t=>t.length===4&&t.every(v=>Number.isFinite(v)&&v>=0&&v<=1)))return null;
   const row=await baseRow(itemId,version);if(!row)return null;
   // A neutral, already validated appearance needs no mask texture.
   if(isNeutralTintSet(tints))return original(itemId,version);
   const maskRow=(await index()).get('mask:'+maskGuid);if(!maskRow)return null;
   const [base,mask]=await Promise.all([loadTexture(root,row.asset),loadTexture(root,maskRow.asset)]);
   return await renderCachedDynamicArt(key(itemId,'tinted',[row.texture,maskGuid,maskRow.texture,tints]),{
    base,mask,baseRect:row.sampleRect,maskRect:maskRow.sampleRect,trim:row.trimTopLeft,
    alphaOffsetY:row.alphaOffsetY,logicalSize:row.logicalSize,tints,maskColorSpace:maskRow.maskColorSpace
   });
  }catch{return null;}
 }
 async function originalOverlay(itemId:number,version:string,transform:Pick<SpriteOverlay,'scale'|'offsetPercent'|'rotation'>):Promise<{sourceHash:string;overlay:SpriteOverlay}|null>{
  try{
   const row=await baseRow(itemId,version);if(!row)return null;
   if(![transform.scale,...transform.offsetPercent,transform.rotation].every(Number.isFinite)||transform.scale<0)return null;
   const [x,y,w,h]=row.guardRect;
   return {sourceHash:pin.indexSha256,overlay:{texture:await loadTexture(root,row.asset),
    sampleRect:row.sampleRect,trim:row.trimTopLeft,alphaOffsetY:row.alphaOffsetY,
    logicalWidth:row.logicalSize,logicalHeight:row.logicalSize,sampleClamp:[x-.5,y-.5,x+w+.5,y+h+.5],...transform}};
  }catch{return null;}
 }
 return {original,render,originalOverlay};
}

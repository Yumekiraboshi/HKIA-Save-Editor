/** Version-bound source-page transport. Presentation only: caller supplies
 * validated tints and a source-proven mask binding. Never selects a save
 * version, infers appearance attributes, or enables an unreviewed release.
 * Reuses the existing shared texture verifier, rasterizer and Blob cache.
 */
import {loadVerifiedArtAsset,loadOpaqueArtTexture,renderCachedDynamicArt,renderCachedOriginalBase,NO_TINT_MASK,type TextureAsset} from './dynamic-art-assets';
import {isNeutralTintSet,type TintSet} from './dynamic-sprite-color';
import type {Rect,SpriteOverlay} from './dynamic-sprite-raster';

export type VersionedOverlay={version:string;sourceHash:string;route:string;texture:string;overlay:SpriteOverlay};
export type DynamicSourcePin=Readonly<{
 version:string;indexSha256:string;renderer:'guarded-native-rgb-alpha-v1';resolution?:'native';
}>;
type SourceRow=Readonly<{
 texture:string;asset:TextureAsset;sampleRect:Rect;trimTopLeft:Rect;guardRect:Rect;
 logicalSize:number;logicalHeight:number;alphaOffsetY:number;maskColorSpace:'linear'|'srgb';
}>;
type SourceIndex=ReadonlyMap<string,SourceRow>;
const SHA=/^[a-f0-9]{64}$/;
const KEY=/^(?:(?:base|magic|item|pattern):[1-9][0-9]{0,9}|growth:[1-9][0-9]{0,9}:(?:0|7)|mask:[a-f0-9]{32})$/;
const fail=():never=>{throw Error('VERSIONED_DYNAMIC_SOURCE_INVALID');};
function assertSource(ok:unknown):asserts ok{if(!ok)fail();}
function object(v:unknown):Record<string,unknown>{
 assertSource(v!==null&&typeof v==='object'&&!Array.isArray(v));return v as Record<string,unknown>;
}
function number(v:unknown):number{assertSource(typeof v==='number'&&Number.isFinite(v));return v;}
function integer(v:unknown,min:number,max:number):number{
 const n=number(v);assertSource(Number.isSafeInteger(n)&&n>=min&&n<=max);return n;
}
function hash(v:unknown):string{assertSource(typeof v==='string'&&SHA.test(v));return v;}
function rect(v:unknown):Rect{
 assertSource(Array.isArray(v)&&v.length===4);return [number(v[0]),number(v[1]),number(v[2]),number(v[3])];
}
function routeKey(v:unknown):string{
 assertSource(typeof v==='string'&&KEY.test(v));
 if(!v.startsWith('mask:'))integer(Number(v.split(':')[1]),1,0x7fffffff);
 return v;
}
function asset(v:unknown):TextureAsset{
 const a=object(v),sha256=hash(a.sha256),file=a.file;
 assertSource(typeof file==='string'&&file==='source-'+sha256+'.webp');
 const width=integer(a.width,1,1024),height=integer(a.height,2,2048);
 assertSource(height%2===0);
 return {file,sha256,rgbSha256:hash(a.rgbSha256),width,height,bytes:integer(a.bytes,1,1024*1024)};
}
function validatePin(pin:DynamicSourcePin){
 assertSource(/^\d+\.\d+\.\d+$/.test(pin.version)&&SHA.test(pin.indexSha256)&&pin.renderer==='guarded-native-rgb-alpha-v1'&&(pin.resolution===undefined||pin.resolution==='native'));
}
function sameAsset(a:TextureAsset,b:TextureAsset){return a.file===b.file&&a.sha256===b.sha256&&a.rgbSha256===b.rgbSha256&&a.width===b.width&&a.height===b.height&&a.bytes===b.bytes;}
/** Decode an already hash-verified index. Missing routes remain missing.
 * Candidate pages have a duplicated outer edge around each original crop.
 */
export function decodeVersionedDynamicSource(value:unknown,pin:DynamicSourcePin):SourceIndex{
 validatePin(pin);
 const v=object(value);
 assertSource(v.schema==='HKIA.DynamicSourcePageCandidate.1'&&v.version===pin.version&&v.renderer===pin.renderer);
 assertSource(Array.isArray(v.pages)&&v.pages.length<=4096&&Array.isArray(v.unresolved)&&v.unresolved.length<=100000);
 const pages=new Map<string,TextureAsset>();
 for(const row of v.pages){const a=asset(row);assertSource(!pages.has(a.file));pages.set(a.file,a);}
 const entries=Object.entries(object(v.records));assertSource(entries.length<=100000);
 const records=new Map<string,SourceRow>(),used=new Set<string>();
 for(const [rawKey,raw] of entries){
  const key=routeKey(rawKey),r=object(raw),a=asset(r.asset),registered=pages.get(a.file);
  assertSource(registered&&sameAsset(a,registered));
  const sampleRect=rect(r.sampleRect),trimTopLeft=rect(r.trimTopLeft),guardRect=rect(r.guardRect);
  const [x,y,w,h]=sampleRect,[gx,gy,gw,gh]=guardRect,[l,t,rr,b]=trimTopLeft;
  const logicalSize=number(r.logicalSize),logicalHeight=key.startsWith('item:')?number(r.logicalHeight):logicalSize,alphaOffsetY=integer(r.alphaOffsetY,1,1024);
  assertSource(alphaOffsetY*2===a.height&&logicalSize>0&&logicalSize<=4096&&logicalHeight>0&&logicalHeight<=4096&&
   guardRect.every(Number.isSafeInteger)&&gx>=1&&gy>=1&&gw>0&&gh>0&&gx+gw<a.width&&gy+gh<alphaOffsetY&&
   w>0&&h>0&&x>=gx&&y>=gy&&x+w<=gx+gw+.001&&y+h<=gy+gh+.001&&
   l>=-.001&&t>=-.001&&rr>l&&b>t&&rr<=logicalSize+.001&&b<=logicalHeight+.001);
  assertSource(r.maskColorSpace==='linear'||r.maskColorSpace==='srgb');
  if(!key.startsWith('mask:'))assertSource(r.maskColorSpace==='srgb');
  records.set(key,{texture:hash(r.texture),asset:registered,sampleRect,trimTopLeft,guardRect,logicalSize,logicalHeight,alphaOffsetY,maskColorSpace:r.maskColorSpace});
  used.add(a.file);
 }
 const missing=new Set<string>();
 for(const raw of v.unresolved){
  const row=object(raw),key=routeKey(row.key);
  assertSource(!records.has(key)&&!missing.has(key)&&typeof row.reason==='string'&&row.reason.length>0&&row.reason.length<=4096);
  missing.add(key);
 }
 assertSource(used.size===pages.size);
 return records;
}
/** Explicit source pin comes from a reviewed, bundled release descriptor,
 * never from a save, a remotely supplied version string, or the index itself.
 * No production candidate pin is installed by this module. */
export function createVersionedDynamicSourceLoader(root:string,pin:DynamicSourcePin,loadIndex=loadVerifiedArtAsset,loadTexture=loadOpaqueArtTexture){
 validatePin(pin);
 assertSource(root.startsWith('/')&&root.endsWith('/')&&!root.includes('//')&&!root.includes('..')&&!root.includes('\\')&&!/[?#]/.test(root));
 let pending:Promise<SourceIndex>|undefined;
 const index=()=>pending??=(async()=>{
  const bytes=await loadIndex(root,'index.json',pin.indexSha256,16*1024*1024);
  return decodeVersionedDynamicSource(JSON.parse(new TextDecoder().decode(bytes)),pin);
 })().catch(error=>{pending=undefined;throw error;});
 function key(itemId:number|string,mode:string,extra:unknown){
  return JSON.stringify(['versioned-dynamic-source-1',pin.version,pin.indexSha256,pin.renderer,itemId,mode,extra]);
 }
 async function baseRow(itemId:number,version:string){
  if(version!==pin.version||!Number.isSafeInteger(itemId)||itemId<=0||itemId>0x7fffffff)return undefined;
  return (await index()).get('base:'+itemId);
 }
 async function originalRoute(route:string,version:string):Promise<Blob|null>{
  try{
   if(version!==pin.version||route.startsWith('mask:')||(route.startsWith('item:')&&pin.resolution!=='native'))return null;
   const row=(await index()).get(routeKey(route));if(!row)return null;
   const base=await loadTexture(root,row.asset);
   return await renderCachedOriginalBase(key(route,'original',row.texture),{base,baseRect:row.sampleRect,trim:row.trimTopLeft,alphaOffsetY:row.alphaOffsetY,logicalSize:row.logicalSize,logicalHeight:row.logicalHeight,resolution:pin.resolution});
  }catch{return null;}
 }
 async function original(itemId:number,version:string):Promise<Blob|null>{
  return originalRoute('base:'+itemId,version);
 }
 /** The caller has already resolved the native appearance and mask GUID
  * from the reviewed family manifest. Do not infer it from this index. */
 async function render(itemId:number,version:string,maskGuid:string,tints:TintSet,layer?:VersionedOverlay):Promise<Blob|null>{
  try{
   if(!/^[a-f0-9]{32}$/.test(maskGuid)||
      tints.length!==3||!tints.every(t=>t.length===4&&t.every(v=>Number.isFinite(v)&&v>=0&&v<=1)))return null;
   const row=await baseRow(itemId,version);if(!row)return null;
   // A neutral, already validated appearance needs no mask texture.
   if(layer&&layer.version!==pin.version)return null;
   const neutral=isNeutralTintSet(tints);
   if(neutral&&!layer)return original(itemId,version);
   const maskRow=neutral?undefined:(await index()).get('mask:'+maskGuid);
   if(!neutral&&!maskRow)return null;
   const [base,mask]=await Promise.all([loadTexture(root,row.asset),maskRow?loadTexture(root,maskRow.asset):Promise.resolve(NO_TINT_MASK)]);
   const overlayKey=layer?[layer.sourceHash,layer.route,layer.texture,layer.overlay.scale,layer.overlay.offsetPercent,layer.overlay.rotation]:null;
   return await renderCachedDynamicArt(key(itemId,'tinted',[row.texture,maskGuid,maskRow?.texture,tints,overlayKey]),{
    base,mask,baseRect:row.sampleRect,maskRect:maskRow?.sampleRect??[0,0,1,1],trim:row.trimTopLeft,
    alphaOffsetY:row.alphaOffsetY,logicalSize:row.logicalSize,logicalHeight:row.logicalHeight,resolution:pin.resolution,tints,maskColorSpace:maskRow?.maskColorSpace,overlay:layer?.overlay
   });
  }catch{return null;}
 }
 async function originalOverlayRoute(route:string,version:string,transform:Pick<SpriteOverlay,'scale'|'offsetPercent'|'rotation'>):Promise<VersionedOverlay|null>{
  try{
   if(version!==pin.version||route.startsWith('mask:'))return null;
   const row=(await index()).get(routeKey(route));if(!row)return null;
   if(![transform.scale,...transform.offsetPercent,transform.rotation].every(Number.isFinite)||transform.scale<0)return null;
   const [x,y,w,h]=row.guardRect;
   return {version:pin.version,sourceHash:pin.indexSha256,route,texture:row.texture,overlay:{texture:await loadTexture(root,row.asset),
    sampleRect:row.sampleRect,trim:row.trimTopLeft,alphaOffsetY:row.alphaOffsetY,
    logicalWidth:row.logicalSize,logicalHeight:row.logicalHeight,sampleClamp:[x-.5,y-.5,x+w+.5,y+h+.5],...transform}};
  }catch{return null;}
 }
 const originalOverlay=(itemId:number,version:string,transform:Pick<SpriteOverlay,'scale'|'offsetPercent'|'rotation'>)=>originalOverlayRoute('base:'+itemId,version,transform);
 return {original,originalRoute,render,originalOverlay,originalOverlayRoute};
}

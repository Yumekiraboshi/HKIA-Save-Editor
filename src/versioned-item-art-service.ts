/** Candidate-only common collection/inventory artwork. Replaces the
 * draft fixed-cell integration with the Owner-approved native transport. */
import {loadVerifiedArtAsset} from './dynamic-art-assets';
import {createNativeRasterLoader,decodeNativeRasterAsset,NATIVE_RASTER_POLICY,type NativeRasterAsset} from './native-raster-art';
import {createVersionedInventoryArtwork,decodeInventoryRouteCandidate,type InventoryRoutePin,type InventoryArtAppearance,type InventoryArtwork} from './versioned-inventory-routes';
import {createVersionedFamilyRenderer,type FamilySourcePin} from './versioned-icon-families';
const SHA=/^[a-f0-9]{64}$/;
function check(v:unknown):asserts v{if(!v)throw Error('ITEM_ART_RELEASE_INVALID');}
function obj(v:unknown):Record<string,unknown>{check(v!==null&&typeof v==='object'&&!Array.isArray(v));return v as Record<string,unknown>;}
function list(v:unknown):unknown[]{check(Array.isArray(v)&&v.length<=100000);return v;}
function id(v:unknown):number{check(typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=0x7fffffff);return v;}
function json(data:ArrayBuffer):unknown{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}
function descriptor(files:Record<string,unknown>,path:string,max:number){
 const a=obj(files[path]);check(typeof a.sha256==='string'&&SHA.test(a.sha256)&&typeof a.bytes==='number'&&Number.isSafeInteger(a.bytes)&&a.bytes>0&&a.bytes<=max);
 return {sha256:a.sha256,bytes:a.bytes};
}
type OwnKind='original-base'|'original-base-only'|'original-override'|'source-placeholder';
type OwnRoute={kind:OwnKind;missing:boolean};
export type ItemArtServicePin=InventoryRoutePin&Readonly<{family:FamilySourcePin}>;
export function decodeNativeItemArt(receipt:unknown,value:unknown,catalog:unknown,pin:InventoryRoutePin){
 const r=obj(receipt),routes=decodeInventoryRouteCandidate(r,pin),v=obj(value),c=obj(catalog),files=obj(r.outputFiles);
 check(r.artworkPolicy===NATIVE_RASTER_POLICY&&v.schema==='HKIA.NativeResolutionItemArt.1'&&v.version===pin.version&&v.artworkPolicy===NATIVE_RASTER_POLICY&&c.schema==='HKIA.CollectionDisplayCatalog.2'&&c.version===pin.version);
 const assets=new Map<string,NativeRasterAsset>();
 for(const [key,raw] of Object.entries(obj(v.assets))){
  const a=decodeNativeRasterAsset(raw),d=descriptor(files,'native-art/'+a.file,100*1024*1024);
  check(key===a.sha256&&d.sha256===a.sha256&&d.bytes===a.bytes);assets.set(key,a);
 }
 check(assets.size===r.nativeStaticAssetCount&&[...assets.values()].reduce((n,a)=>n+a.bytes,0)===r.nativeStaticImageBytes);
 const used=new Set<string>();
 function table(raw:unknown){
  const result=new Map<number,NativeRasterAsset>();
  for(const [k,d] of Object.entries(obj(raw))){
   const i=id(Number(k));check(String(i)===k&&routes.has(i)&&typeof d==='string'&&assets.has(d));
   result.set(i,assets.get(d)!);used.add(d);
  }return result;
 }
 const base=table(v.base),overrides=table(v.overrides);
 check(used.size===assets.size&&overrides.size===r.completedOverrideCount);
 const assetPaths=Object.keys(files).filter(k=>k.startsWith('native-art/'));
 check(assetPaths.length===assets.size+1&&assetPaths.every(k=>k==='native-art/index.json'||(k.endsWith('.webp')&&assets.has(k.slice(11,-5)))));
 const placeholders=new Set(list(r.nativePlaceholderItemIds).map(id));
 check([...placeholders].every(i=>routes.has(i))&&[...placeholders].filter(i=>base.has(i)).length===r.placeholderCount);
 for(const [i,route] of routes){
  if(route.sourceBlockers.length)continue;
  if(route.kind==='original-base'||route.kind==='source-placeholder')check(base.has(i));
  if(route.kind==='original-override')check(overrides.has(i));
 }
 const groups=new Set<string>();
 for(const g of list(c.groups)){check(Array.isArray(g)&&typeof g[0]==='string'&&!groups.has(g[0]));groups.add(g[0]);}
 const ids=new Set<number>();
 for(const row of list(c.items)){
  check(Array.isArray(row)&&row.length>=4&&typeof row[3]==='string'&&groups.has(row[3]));
  const i=id(row[0]);check(routes.has(i)&&!ids.has(i));ids.add(i);
 }
 const own=new Map<number,OwnRoute>();
 check(JSON.stringify(v.collectionOwnRoutes)===JSON.stringify(r.collectionOwnRoutes));
 for(const row of list(v.collectionOwnRoutes)){
  check(Array.isArray(row)&&row.length===3&&typeof row[1]==='string'&&['original-base','original-base-only','original-override','source-placeholder'].includes(row[1])&&typeof row[2]==='boolean');
  const i=id(row[0]),kind=row[1] as OwnKind,missing=row[2];
  check(ids.has(i)&&!own.has(i)&&missing===!(kind==='original-override'?overrides:base).has(i));
  if(kind==='source-placeholder')check(placeholders.has(i));
  own.set(i,{kind,missing});
 }
 check(own.size===ids.size);
 return {base,overrides,placeholders,own};
}
export function createVersionedItemArtService(
 roots:{release:string;bindings:string;auxiliary:string},pin:ItemArtServicePin,
 options:{load?:typeof loadVerifiedArtAsset;loadTexture?:NonNullable<Parameters<typeof createVersionedFamilyRenderer>[2]>['loadTexture'];sharedImages?:ReturnType<typeof createNativeRasterLoader>}={}
){
 for(const root of Object.values(roots))check(root.startsWith('/')&&root.endsWith('/')&&!root.includes('..')&&!root.includes('//')&&!root.includes('\\')&&!/[?#%]/.test(root));
 check(pin.family.version===pin.version&&pin.family.dynamic.resolution==='native'&&pin.family.auxiliary.resolution==='native');
 const actualLoad=options.load??loadVerifiedArtAsset;
 let disposed=false,receiptPending:Promise<ArrayBuffer>|undefined;
 const load:typeof loadVerifiedArtAsset=(root,file,sha,max,exact)=>{
  if(root===roots.release&&file==='release-candidate.json'){
   check(sha===pin.receiptFileSha256&&exact===undefined);
   return receiptPending??=actualLoad(root,file,sha,max).catch(e=>{receiptPending=undefined;throw e;});
  }
  return actualLoad(root,file,sha,max,exact);
 };
 const images=options.sharedImages??createNativeRasterLoader(roots.release+'native-art/',load);
 let contextPending:Promise<Awaited<ReturnType<typeof init>>>|undefined;
 async function init(){
  const receipt=obj(json(await load(roots.release,'release-candidate.json',pin.receiptFileSha256,16*1024*1024)));
  const files=obj(receipt.outputFiles),cat=descriptor(files,'collection-catalog.json',16*1024*1024),native=descriptor(files,'native-art/index.json',16*1024*1024);
  check(descriptor(files,'dynamic-source-pages/index.json',16*1024*1024).sha256===pin.family.dynamic.indexSha256);
  const [catalog,index,bindings]=await Promise.all([
   load(roots.release,'collection-catalog.json',cat.sha256,16*1024*1024,cat.bytes),
   load(roots.release+'native-art/','index.json',native.sha256,16*1024*1024,native.bytes),
   load(roots.bindings,'family-bindings.json',pin.family.bindingsSha256,8*1024*1024)
  ]);
  const b=obj(json(bindings));check(b.definitionSnapshotSha256===receipt.snapshotSha256&&b.platform===receipt.platform&&b.version===pin.version);
  return {data:decodeNativeItemArt(receipt,json(index),json(catalog),pin),family:createVersionedFamilyRenderer({bindings:roots.bindings,dynamic:roots.release+'dynamic-source-pages/',auxiliary:roots.auxiliary},pin.family,{load,loadTexture:options.loadTexture})};
 }
 const context=()=>contextPending??=init().catch(e=>{contextPending=undefined;throw e;});
 async function get(i:number,v:string,kind:'base'|'overrides'|'placeholder'){
  if(disposed||v!==pin.version)return null;
  const {data}=await context();
  if(kind==='placeholder'&&!data.placeholders.has(i))return null;
  const a=(kind==='overrides'?data.overrides:data.base).get(i);
  return a?await images.image(a):null;
 }
 const family={
  original:async(...a:Parameters<ReturnType<typeof createVersionedFamilyRenderer>['original']>)=>(await context()).family.original(...a),
  flower:async(...a:Parameters<ReturnType<typeof createVersionedFamilyRenderer>['flower']>)=>(await context()).family.flower(...a),
  chef:async(...a:Parameters<ReturnType<typeof createVersionedFamilyRenderer>['chef']>)=>(await context()).family.chef(...a),
  wand:async(...a:Parameters<ReturnType<typeof createVersionedFamilyRenderer>['wand']>)=>(await context()).family.wand(...a),
  palette:async(...a:Parameters<ReturnType<typeof createVersionedFamilyRenderer>['palette']>)=>(await context()).family.palette(...a)
 };
 const inventory=createVersionedInventoryArtwork(roots.release,pin,{base:(i,v)=>get(i,v,'base'),override:(i,v)=>get(i,v,'overrides'),placeholder:(i,v)=>get(i,v,'placeholder'),family},load);
 return {
  async inventory(i:number,v:string,appearance?:InventoryArtAppearance){if(disposed||v!==pin.version)return null;const a=await inventory(i,v,appearance);return disposed?null:a;},
  async collection(i:number,v:string):Promise<InventoryArtwork|null>{
   if(disposed||v!==pin.version)return null;
   try{
    const route=(await context()).data.own.get(i);if(!route||route.missing)return null;
    const art=await get(i,v,route.kind==='original-override'?'overrides':route.kind==='source-placeholder'?'placeholder':'base');
    if(!art||disposed)return null;
    return {itemId:i,sourceItemId:i,kind:route.kind==='original-base-only'?'original-base':route.kind,fidelity:route.kind==='source-placeholder'?'source-placeholder':route.kind==='original-base-only'?'original-base-only':'original',art};
   }catch{return null;}
  },
  async flowerPattern(i:number,v:string){if(disposed||v!==pin.version)return null;try{const image=await (await context()).family.flowerPattern(i,v);return disposed?null:image;}catch{return null;}},
  dispose(){disposed=true;if(!options.sharedImages)images.dispose();}
 };
}

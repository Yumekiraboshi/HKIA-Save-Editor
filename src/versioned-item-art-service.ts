/** Reviewed candidate-only shared presentation service. This does not register
 * a release, read a save, or authorize editing. Collection selects its own
 * definition; Inventory selects the original native result route. */
import {loadVerifiedArtAsset} from './dynamic-art-assets';
import {createVersionedCollectionPackLoader,type IconPack,type SpriteCell} from './icon-packs';
import {createVersionedInventoryNativeArtLoader} from './inventory-native-art';
import {resolveVerifiedInventorySprite} from './inventory-sheet-art';
import {createVersionedInventoryArtwork,createVersionedPlaceholderProvider,decodeInventoryRouteCandidate,type InventoryRoutePin,type InventoryArtAppearance,type InventoryArtwork} from './versioned-inventory-routes';
import {createVersionedOriginalOverrideProvider} from './versioned-original-overrides';
import {createVersionedFamilyRenderer,type FamilySourcePin} from './versioned-icon-families';

const SHA=/^[a-f0-9]{64}$/;
const GROUP=/^[a-z_]+$/;
function check(ok:unknown):asserts ok{if(!ok)throw Error('ITEM_ART_RELEASE_INVALID');}
function obj(v:unknown):Record<string,unknown>{check(v!==null&&typeof v==='object'&&!Array.isArray(v));return v as Record<string,unknown>;}
function list(v:unknown):unknown[]{check(Array.isArray(v)&&v.length<=100000);return v;}
function id(v:unknown):number{check(typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=0x7fffffff);return v;}
function rootCheck(root:string){check(root.startsWith('/')&&root.endsWith('/')&&!root.includes('..')&&!root.includes('//')&&!root.includes('\\')&&!/[?#]/.test(root));}
function json(data:ArrayBuffer):unknown{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}
function asset(files:Record<string,unknown>,path:string,max:number){
 const a=obj(files[path]);check(typeof a.sha256==='string'&&SHA.test(a.sha256)&&typeof a.bytes==='number'&&Number.isSafeInteger(a.bytes)&&a.bytes>0&&a.bytes<=max);
 return {sha256:a.sha256,bytes:a.bytes};
}
type OwnKind='original-base'|'original-base-only'|'original-override'|'source-placeholder';
type OwnRoute={kind:OwnKind;missing:boolean};
export type ItemArtServicePin=InventoryRoutePin&Readonly<{family:FamilySourcePin}>;
export function decodeCollectionOwnRoutes(receipt:unknown,catalog:unknown,pin:InventoryRoutePin){
 const v=obj(receipt),routes=decodeInventoryRouteCandidate(v,pin),c=obj(catalog);
 check(c.schema==='HKIA.CollectionDisplayCatalog.2'&&c.version===pin.version);
 const groups=new Set<string>();
 for(const row of list(c.groups)){
  check(Array.isArray(row)&&typeof row[0]==='string'&&GROUP.test(row[0])&&!groups.has(row[0]));groups.add(row[0]);
 }
 const byItem=new Map<number,string>(),byGroup=new Map<string,Set<number>>();
 for(const row of list(c.items)){
  check(Array.isArray(row)&&row.length>=4&&typeof row[3]==='string'&&groups.has(row[3]));
  const i=id(row[0]),g=row[3];check(routes.has(i)&&!byItem.has(i));byItem.set(i,g);
  const members=byGroup.get(g)??new Set<number>();members.add(i);byGroup.set(g,members);
 }
 const own=new Map<number,OwnRoute>(),missingBase=new Set<number>();
 for(const raw of list(v.missingCollectionBaseItemIds)){
  const i=id(raw);check(byItem.has(i)&&!missingBase.has(i));missingBase.add(i);
 }
 const nativePlaceholders=new Set(list(v.nativePlaceholderItemIds).map(id));
 for(const row of list(v.collectionOwnRoutes)){
  check(Array.isArray(row)&&row.length===3);
  const i=id(row[0]),kind=row[1],missing=row[2];
  check(byItem.has(i)&&!own.has(i)&&typeof missing==='boolean'&&typeof kind==='string'&&['original-base','original-base-only','original-override','source-placeholder'].includes(kind));
  if(kind!=='original-override')check(missing===missingBase.has(i));
  if(kind==='source-placeholder')check(nativePlaceholders.has(i));
  own.set(i,{kind:kind as OwnKind,missing});
 }
 check(own.size===byItem.size);
 for(const members of byGroup.values())for(const i of missingBase)members.delete(i);
 const partGroups=obj(v.collectionPackParts);
 const expectedGroups=[...byGroup].filter(([,members])=>members.size>0).map(([group])=>group);
 check(Object.keys(partGroups).length===expectedGroups.length&&expectedGroups.every(g=>Object.hasOwn(partGroups,g)));
 return {byItem,byGroup,own,missingBase};
}
export function createVersionedItemArtService(
 roots:{release:string;bindings:string;auxiliary:string},pin:ItemArtServicePin,
 options:{load?:typeof loadVerifiedArtAsset;loadTexture?:Parameters<typeof createVersionedFamilyRenderer>[2]['loadTexture'];resolveSheet?:typeof resolveVerifiedInventorySprite}={}
){
 for(const root of Object.values(roots))rootCheck(root);
 check(/^\d+\.\d+\.\d+$/.test(pin.version)&&SHA.test(pin.receiptFileSha256)&&pin.family.version===pin.version);
 const actualLoad=options.load??loadVerifiedArtAsset,resolveSheet=options.resolveSheet??resolveVerifiedInventorySprite;
 let disposed=false,receiptPending:Promise<ArrayBuffer>|undefined;
 // All component adapters ask for the same exact receipt. Retain the one
 // verified fetch for this service and clear failed requests for retry.
 const load:typeof loadVerifiedArtAsset=(root,file,sha,max,exact)=>{
  if(root===roots.release&&file==='release-candidate.json'){
   check(sha===pin.receiptFileSha256&&exact===undefined);
   return receiptPending??=actualLoad(root,file,sha,max).catch(e=>{receiptPending=undefined;throw e;});
  }
  return actualLoad(root,file,sha,max,exact);
 };
 const loadGroup=createVersionedCollectionPackLoader(roots.release,pin,load);
 const override=createVersionedOriginalOverrideProvider(roots.release,pin,load);
 const placeholder=createVersionedPlaceholderProvider(roots.release,pin,load);
 const packs=new Map<string,Promise<IconPack>>();
 let contextPending:Promise<Awaited<ReturnType<typeof init>>>|undefined;
 async function init(){
  const receipt=obj(json(await load(roots.release,'release-candidate.json',pin.receiptFileSha256,16*1024*1024)));
  decodeInventoryRouteCandidate(receipt,pin);
  const files=obj(receipt.outputFiles),bundles=obj(receipt.sourceBundles);
  const catalog=asset(files,'collection-catalog.json',16*1024*1024);
  const inventory=asset(files,'inventory-art/index.json',8*1024*1024);
  const dynamic=asset(files,'dynamic-source-pages/index.json',16*1024*1024);
  check(dynamic.sha256===pin.family.dynamic.indexSha256&&typeof bundles.definitions==='string'&&SHA.test(bundles.definitions));
  const atlas=bundles.atlas_global??null;check(atlas===null||typeof atlas==='string'&&SHA.test(atlas));
  const bindings=obj(json(await load(roots.bindings,'family-bindings.json',pin.family.bindingsSha256,8*1024*1024)));
  check(bindings.definitionSnapshotSha256===receipt.snapshotSha256&&bindings.platform===receipt.platform&&bindings.version===pin.version);
  const catalogData=decodeCollectionOwnRoutes(receipt,json(await load(roots.release,'collection-catalog.json',catalog.sha256,16*1024*1024,catalog.bytes)),pin);
  const native=createVersionedInventoryNativeArtLoader(roots.release,{version:pin.version,indexFileSha256:inventory.sha256,definitionsSha256:bundles.definitions,atlasSha256:atlas},load);
  const family=createVersionedFamilyRenderer({bindings:roots.bindings,dynamic:roots.release+'dynamic-source-pages/',auxiliary:roots.auxiliary},pin.family,{load,loadTexture:options.loadTexture});
  return {catalogData,native,family};
 }
 const context=()=>contextPending??=init().catch(e=>{contextPending=undefined;throw e;});
 async function base(i:number,version:string):Promise<SpriteCell|null>{
  if(disposed||version!==pin.version)return null;
  const {catalogData,native}=await context(),group=catalogData.byItem.get(i);
  if(group!==undefined){
   if(catalogData.missingBase.has(i))return null;
   let task=packs.get(group);
   if(!task){
    task=loadGroup(group,version).then(pack=>{
     const expected=catalogData.byGroup.get(group)!;
     if(disposed||Object.keys(pack.entries).length!==expected.size||!Object.keys(pack.entries).every(k=>expected.has(Number(k)))){
      pack.dispose();throw Error('ITEM_ART_RELEASE_INVALID');
     }
     return pack;
    }).catch(e=>{packs.delete(group);throw e;});packs.set(group,task);
   }
   return (await task).entries[String(i)]??null;
  }
  const cell=(await native(version)).entries.get(i);
  return cell?await resolveSheet(cell):null;
 }
 const family={
  original:async(...args:Parameters<ReturnType<typeof createVersionedFamilyRenderer>['original']>)=>(await context()).family.original(...args),
  flower:async(...args:Parameters<ReturnType<typeof createVersionedFamilyRenderer>['flower']>)=>(await context()).family.flower(...args),
  chef:async(...args:Parameters<ReturnType<typeof createVersionedFamilyRenderer>['chef']>)=>(await context()).family.chef(...args),
  wand:async(...args:Parameters<ReturnType<typeof createVersionedFamilyRenderer>['wand']>)=>(await context()).family.wand(...args),
  palette:async(...args:Parameters<ReturnType<typeof createVersionedFamilyRenderer>['palette']>)=>(await context()).family.palette(...args)
 };
 const renderInventory=createVersionedInventoryArtwork(roots.release,pin,{base,override,placeholder,family},load);
 return {
  async inventory(itemId:number,version:string,appearance?:InventoryArtAppearance):Promise<InventoryArtwork|null>{
   if(disposed||version!==pin.version)return null;
   try{await context();const result=await renderInventory(itemId,version,appearance);return disposed?null:result;}catch{return null;}
  },
  async collection(itemId:number,version:string):Promise<InventoryArtwork|null>{
   if(disposed||version!==pin.version)return null;
   try{
    const route=(await context()).catalogData.own.get(id(itemId));if(!route||route.missing)return null;
    const art=route.kind==='original-override'?await override(itemId,version):route.kind==='source-placeholder'?await placeholder(itemId,version):await base(itemId,version);
    if(!art||disposed)return null;
    const kind=route.kind==='original-base-only'?'original-base':route.kind;
    return {itemId,sourceItemId:itemId,kind,fidelity:route.kind==='source-placeholder'?'source-placeholder':route.kind==='original-base-only'?'original-base-only':'original',art};
   }catch{return null;}
  },
  dispose(){disposed=true;for(const task of packs.values())void task.then(p=>p.dispose(),()=>{});packs.clear();}
 };
}

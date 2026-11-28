/** Candidate-only presentation. Category membership/order remain owned by
 * the versioned catalog. Colored representatives are explicit display choices. */
import {createNativeRasterLoader,decodeNativeRasterAsset,NATIVE_RASTER_POLICY,type NativeRasterAsset} from './native-raster-art';
import {loadVerifiedArtAsset} from './dynamic-art-assets';
import type {SpriteCell} from './icon-packs';
const SHA=/^[a-f0-9]{64}$/;
const KEY=/^[a-z][a-z0-9_-]{0,127}$/;
const PATH=/^-?[1-9]\d{0,18}$/;
type Domain='collection'|'inventory';
export type CategoryArtPin=Readonly<{version:string;platform:'steam'|'switch';manifestFileSha256:string;definitionsSha256:string}>;
type Sprite={kind:'sprite';asset:NativeRasterAsset;sourceBundleSha256:string;spritePathId:string;sourceSha256:string}|{kind:'null'|'unresolved'};
type Route={domain:Domain;key:string;native:Sprite;representativeItemId:number|null;collectionFallback:string|null};
export type CategoryArtwork={art:Blob|SpriteCell;source:'representative'|'collection-category'|'native-category'};
type Scope={collectionKeys:ReadonlySet<string>;inventoryKeys:ReadonlySet<string>;itemIds:ReadonlySet<number>};
function check(v:unknown):asserts v{if(!v)throw Error('CATEGORY_ART_CANDIDATE_INVALID');}
function obj(v:unknown):Record<string,unknown>{check(v!==null&&typeof v==='object'&&!Array.isArray(v));return v as Record<string,unknown>;}
function str(v:unknown,p:RegExp):string{check(typeof v==='string'&&p.test(v));return v;}
function pinCheck(p:CategoryArtPin){check(/^\d+\.\d+\.\d+$/.test(p.version)&&(p.platform==='steam'||p.platform==='switch')&&SHA.test(p.manifestFileSha256)&&SHA.test(p.definitionsSha256));}
export function decodeVersionedCategoryArt(value:unknown,pin:CategoryArtPin,scope:Scope):ReadonlyMap<string,Route>{
 pinCheck(pin);const v=obj(value);
 check(v.schema==='HKIA.CategoryArtCandidate.2'&&v.artworkPolicy===NATIVE_RASTER_POLICY&&v.version===pin.version&&v.platform===pin.platform&&v.definitionsSha256===pin.definitionsSha256&&v.automaticReleaseActivationAuthorized===false);
 const bundles=obj(v.sourceBundles);check(bundles.definitions===pin.definitionsSha256);
 const hashes=new Set(Object.values(bundles));for(const h of hashes)str(h,SHA);
 const rows=v.rows;check(Array.isArray(rows)&&rows.length===scope.collectionKeys.size+scope.inventoryKeys.size&&rows.length<=4096);
 const routes=new Map<string,Route>(),bySprite=new Map<string,string>();
 let missing=0;
 for(const raw of rows){
  const r=obj(raw),domain=r.domain;check(domain==='collection'||domain==='inventory');
  const key=str(r.key,KEY),full=domain+':'+key;
  check((domain==='collection'?scope.collectionKeys:scope.inventoryKeys).has(key)&&!routes.has(full));
  const rep=r.representativeItemId,fb=r.collectionFallback;
  check(rep===null||typeof rep==='number'&&Number.isSafeInteger(rep)&&rep>0&&scope.itemIds.has(rep));
  check(fb===null||typeof fb==='string'&&scope.collectionKeys.has(fb));
  if(domain==='collection')check(rep===null&&fb===null);
  const n=obj(r.native);let native:Sprite;
  if(n.kind==='null'||n.kind==='unresolved'){
   check(Object.keys(n).length===1);native={kind:n.kind};if(n.kind==='unresolved')missing++;
  }else{
   check(n.kind==='sprite');
   const asset=decodeNativeRasterAsset(n.asset),sourceBundleSha256=str(n.sourceBundleSha256,SHA),spritePathId=str(n.spritePathId,PATH),sourceSha256=str(n.sourceSha256,SHA);
   check(hashes.has(sourceBundleSha256));
   const sk=sourceBundleSha256+':'+spritePathId,identity=sourceSha256+':'+JSON.stringify(asset);
   check(!bySprite.has(sk)||bySprite.get(sk)===identity);bySprite.set(sk,identity);
   native={kind:'sprite',asset,sourceBundleSha256,spritePathId,sourceSha256};
  }
  routes.set(full,{domain,key,native,representativeItemId:rep,collectionFallback:fb});
 }
 check(missing===v.unresolvedCount);
 return routes;
}
export function createVersionedCategoryArt(root:string,pin:CategoryArtPin,scope:Scope,representative:(itemId:number,version:string)=>Promise<Blob|SpriteCell|null>,load=loadVerifiedArtAsset,sharedImages?:ReturnType<typeof createNativeRasterLoader>){
 pinCheck(pin);check(root.startsWith('/')&&root.endsWith('/')&&!root.includes('..')&&!root.includes('//')&&!root.includes('\\')&&!/[?#]/.test(root));
 let pending:Promise<ReadonlyMap<string,Route>>|undefined,disposed=false;
 const routes=()=>pending??=(async()=>decodeVersionedCategoryArt(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await load(root,'category-art.json',pin.manifestFileSha256,4*1024*1024))),pin,scope))().catch(e=>{pending=undefined;throw e;});
 const images=sharedImages??createNativeRasterLoader(root,load);
 async function original(n:Sprite):Promise<Blob|null>{return n.kind==='sprite'?images.image(n.asset):null;}
 return {
  async artwork(domain:Domain,key:string,version:string):Promise<CategoryArtwork|null>{
   try{
    if(disposed||version!==pin.version)return null;
    const table=await routes(),r=table.get(domain+':'+key);if(!r||disposed)return null;
    if(r.representativeItemId!==null){
     const art=await representative(r.representativeItemId,version).catch(()=>null);
     if(art&&!disposed)return {art,source:'representative'};
    }
    if(r.collectionFallback!==null){
     const f=table.get('collection:'+r.collectionFallback);
     const art=f?await original(f.native).catch(()=>null):null;
     if(art&&!disposed)return {art,source:'collection-category'};
    }
    const art=await original(r.native);return art&&!disposed?{art,source:'native-category'}:null;
   }catch{return null;}
  },
  dispose(){disposed=true;if(!sharedImages)images.dispose();}
 };
}

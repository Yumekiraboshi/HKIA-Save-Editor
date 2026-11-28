/** Candidate-only presentation. Category membership/order remain owned by
 * the versioned catalog. Colored representatives are explicit display choices. */
import {loadVerifiedArtAsset} from './dynamic-art-assets';
import type {SpriteCell} from './icon-packs';
const SHA=/^[a-f0-9]{64}$/;
const KEY=/^[a-z][a-z0-9_-]{0,127}$/;
const PATH=/^-?[1-9]\d{0,18}$/;
type Domain='collection'|'inventory';
export type CategoryArtPin=Readonly<{version:string;platform:'steam'|'switch';manifestFileSha256:string;definitionsSha256:string}>;
type Sprite={kind:'sprite';file:string;sha256:string;bytes:number;sourceBundleSha256:string;spritePathId:string;sourceSha256:string}|{kind:'null'|'unresolved'};
type Route={domain:Domain;key:string;native:Sprite;representativeItemId:number|null;collectionFallback:string|null};
export type CategoryArtwork={art:Blob|SpriteCell;source:'representative'|'collection-category'|'native-category'};
type Scope={collectionKeys:ReadonlySet<string>;inventoryKeys:ReadonlySet<string>;itemIds:ReadonlySet<number>};
function check(v:unknown):asserts v{if(!v)throw Error('CATEGORY_ART_CANDIDATE_INVALID');}
function obj(v:unknown):Record<string,unknown>{check(v!==null&&typeof v==='object'&&!Array.isArray(v));return v as Record<string,unknown>;}
function str(v:unknown,p:RegExp):string{check(typeof v==='string'&&p.test(v));return v;}
function pinCheck(p:CategoryArtPin){check(/^\d+\.\d+\.\d+$/.test(p.version)&&(p.platform==='steam'||p.platform==='switch')&&SHA.test(p.manifestFileSha256)&&SHA.test(p.definitionsSha256));}
export function decodeVersionedCategoryArt(value:unknown,pin:CategoryArtPin,scope:Scope):ReadonlyMap<string,Route>{
 pinCheck(pin);const v=obj(value);
 check(v.schema==='HKIA.CategoryArtCandidate.1'&&v.version===pin.version&&v.platform===pin.platform&&v.definitionsSha256===pin.definitionsSha256&&v.automaticReleaseActivationAuthorized===false);
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
   const sha256=str(n.sha256,SHA),file=str(n.file,/^[a-f0-9]{64}\.webp$/),sourceBundleSha256=str(n.sourceBundleSha256,SHA),spritePathId=str(n.spritePathId,PATH),sourceSha256=str(n.sourceSha256,SHA),bytes=n.bytes;
   check(file===sha256+'.webp'&&hashes.has(sourceBundleSha256)&&typeof bytes==='number'&&Number.isSafeInteger(bytes)&&bytes>=25&&bytes<=200000);
   const sk=sourceBundleSha256+':'+spritePathId,identity=sourceSha256+':'+sha256;
   check(!bySprite.has(sk)||bySprite.get(sk)===identity);bySprite.set(sk,identity);
   native={kind:'sprite',file,sha256,bytes,sourceBundleSha256,spritePathId,sourceSha256};
  }
  routes.set(full,{domain,key,native,representativeItemId:rep,collectionFallback:fb});
 }
 check(missing===v.unresolvedCount);
 return routes;
}
export function createVersionedCategoryArt(root:string,pin:CategoryArtPin,scope:Scope,representative:(itemId:number,version:string)=>Promise<Blob|SpriteCell|null>,load=loadVerifiedArtAsset){
 pinCheck(pin);check(root.startsWith('/')&&root.endsWith('/')&&!root.includes('..')&&!root.includes('//')&&!root.includes('\\')&&!/[?#]/.test(root));
 let pending:Promise<ReadonlyMap<string,Route>>|undefined,disposed=false;
 const routes=()=>pending??=(async()=>decodeVersionedCategoryArt(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await load(root,'category-art.json',pin.manifestFileSha256,4*1024*1024))),pin,scope))().catch(e=>{pending=undefined;throw e;});
 const cache=new Map<string,Promise<Blob>>();
 async function original(n:Sprite):Promise<Blob|null>{
  if(n.kind!=='sprite')return null;
  let task=cache.get(n.sha256);
  if(!task){task=(async()=>{
   const raw=await load(root,n.file,n.sha256,200000,n.bytes),b=new Uint8Array(raw),v=new DataView(raw);
   check(b.length>=25&&String.fromCharCode(...b.subarray(0,4))==='RIFF'&&String.fromCharCode(...b.subarray(8,16))==='WEBPVP8L'&&b[20]===0x2f);
   const dim=v.getUint32(21,true);check((dim&0x3fff)+1===96&&((dim>>>14)&0x3fff)+1===96);
   return new Blob([raw],{type:'image/webp'});
  })().catch(e=>{cache.delete(n.sha256);throw e;});cache.set(n.sha256,task);if(cache.size>128)cache.delete(cache.keys().next().value!);}
  return task;
 }
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
  dispose(){disposed=true;cache.clear();}
 };
}

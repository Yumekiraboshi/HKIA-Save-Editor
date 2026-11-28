/** Reviewed candidate achievement artwork. Display only: the existing Rust
 * engine remains the sole authority for achievement progress and save edits.
 * A native null Icon PPtr is distinct from a missing/unsupported source. */
import type {AchievementIndex} from './achievement-index';
import type {AchievementHierarchy} from './achievement-groups';
import {createNativeRasterLoader,decodeNativeRasterAsset,NATIVE_RASTER_POLICY,type NativeRasterAsset} from './native-raster-art';
import {loadVerifiedArtAsset} from './dynamic-art-assets';

const SHA=/^[a-f0-9]{64}$/;
const GUID=/^[a-f0-9]{32}$/;
const PATH=/^-?[1-9]\d{0,18}$/;
const SAVE_GUID=/^[a-f0-9]{8}(?::[a-f0-9]{8}){3}$/;
const ROUTING='native-local-achievement-direct-parent-v1';
export type AchievementArtPin=Readonly<{version:string;platform:'steam'|'switch';definitionsSha256:string;manifestFileSha256:string}>;
type Sprite=Readonly<{sourceGuid:string;sourceBundleSha256:string;spritePathId:string;sourceSha256:string;asset:NativeRasterAsset}>;
type Icon=Readonly<{kind:'null'}>|Readonly<{kind:'unresolved';sourceGuid:string;fileId:number;spritePathId:string}>|Readonly<{kind:'sprite';sprite:Sprite}>;
type Row=Readonly<{saveGuid:string;sourceKey:string;parent:string|null;icon:Icon}>;
export type AchievementArtCensus={rows:ReadonlyMap<string,Row>};
export type VersionedAchievementArtwork={art:Blob;width:number;height:number;saveGuid:string;sourceSaveGuid:string;sourceKey:string;spritePathId:string;fidelity:'original'|'direct-parent'};
function check(ok:unknown):asserts ok{if(!ok)throw Error('ACHIEVEMENT_ART_CANDIDATE_INVALID');}
function obj(v:unknown):Record<string,unknown>{check(v!==null&&typeof v==='object'&&!Array.isArray(v));return v as Record<string,unknown>;}
function list(v:unknown,max:number):unknown[]{check(Array.isArray(v)&&v.length<=max);return v;}
function text(v:unknown,re:RegExp):string{check(typeof v==='string'&&re.test(v));return v;}
function int(v:unknown,min:number,max:number):number{check(typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max);return v;}
function pinCheck(p:AchievementArtPin){check(/^\d+\.\d+\.\d+$/.test(p.version)&&(p.platform==='steam'||p.platform==='switch')&&SHA.test(p.definitionsSha256)&&SHA.test(p.manifestFileSha256));}
export function decodeVersionedAchievementArt(input:unknown,pin:AchievementArtPin,index:AchievementIndex,hierarchy:AchievementHierarchy):AchievementArtCensus{
 pinCheck(pin);const v=obj(input);
 check(v.schema==='HKIA.AchievementArtCandidate.2'&&v.artworkPolicy===NATIVE_RASTER_POLICY&&v.version===pin.version&&v.platform===pin.platform&&v.definitionsSha256===pin.definitionsSha256&&v.reviewedRouting===ROUTING&&v.automaticReleaseActivationAuthorized===false);
 const rows=new Map<string,Row>(),sourceGuids=new Set<string>(),sourceKeys=new Set<string>();
 const bySprite=new Map<string,string>();
 const bundles=obj(v.sourceBundles);check(bundles.definitions===pin.definitionsSha256);
 const hashes=new Set(Object.values(bundles));for(const h of hashes)text(h,SHA);
 const census=list(v.rows,100000);check(census.length===index.size&&census.length===v.definitionCount);
 check(hierarchy.byGuid.size+hierarchy.owner.size===index.size);
 let nativeNull=0,unresolved=0;
 for(const raw of census){
  const r=obj(raw),saveGuid=text(r.saveGuid,SAVE_GUID),sourceKey=text(r.sourceKey,/^[A-Za-z0-9_-]{1,128}$/);
  check(!rows.has(saveGuid)&&!sourceKeys.has(sourceKey)&&index.get(saveGuid)?.key===sourceKey);
  const category=hierarchy.byGuid.has(saveGuid),parent=category?null:hierarchy.owner.get(saveGuid);
  check(parent!==undefined&&r.parent===parent&&(!category||!hierarchy.owner.has(saveGuid)));
  const a=obj(r.icon);let icon:Icon;
  if(a.kind==='null'){
   check(Object.keys(a).length===1);nativeNull++;icon={kind:'null'};
  }else{
   const sourceGuid=text(a.sourceGuid,GUID),spritePathId=text(a.spritePathId,PATH);
   check(!sourceGuids.has(sourceGuid));sourceGuids.add(sourceGuid);
   if(a.kind==='unresolved'){
    unresolved++;icon={kind:'unresolved',sourceGuid,spritePathId,fileId:int(a.fileId,0,0x7fffffff)};
   }else{
    check(a.kind==='sprite');
    const sourceBundleSha256=text(a.sourceBundleSha256,SHA),sourceSha256=text(a.sourceSha256,SHA),asset=decodeNativeRasterAsset(a.asset);
    check(hashes.has(sourceBundleSha256));
    const spriteKey=sourceBundleSha256+':'+spritePathId,identity=sourceSha256+':'+JSON.stringify(asset);
    check(!bySprite.has(spriteKey)||bySprite.get(spriteKey)===identity);bySprite.set(spriteKey,identity);
    icon={kind:'sprite',sprite:{sourceGuid,sourceBundleSha256,spritePathId,sourceSha256,asset}};
   }
  }
  sourceKeys.add(sourceKey);rows.set(saveGuid,{saveGuid,sourceKey,parent,icon});
 }
 check(rows.size===index.size&&nativeNull===v.nativeNullCount&&unresolved===v.unresolvedCount);
 for(const row of rows.values()){
  if(row.parent!==null)check(rows.get(row.parent)?.parent===null&&hierarchy.byGuid.has(row.parent));
 }
 return {rows};
}
/** Fallback is only a reviewed detail-view rule, never a response to
 * network failure, an unresolved non-null reference or an unknown ID. */
export function resolveAchievementArtSource(census:AchievementArtCensus,guid:string,detail:boolean):{row:Row;sprite:Sprite;fidelity:'original'|'direct-parent'}|null{
 const row=census.rows.get(guid);if(!row)return null;
 if(row.icon.kind==='sprite')return {row,sprite:row.icon.sprite,fidelity:'original'};
 if(!detail||row.icon.kind!=='null'||row.parent===null)return null;
 const parent=census.rows.get(row.parent);
 return parent?.icon.kind==='sprite'?{row:parent,sprite:parent.icon.sprite,fidelity:'direct-parent'}:null;
}
export function createVersionedAchievementArt(root:string,pin:AchievementArtPin,index:AchievementIndex,hierarchy:AchievementHierarchy,options:{load?:typeof loadVerifiedArtAsset;sharedImages?:ReturnType<typeof createNativeRasterLoader>}={}){
 pinCheck(pin);check(root.startsWith('/')&&root.endsWith('/')&&!root.includes('..')&&!root.includes('//')&&!root.includes('\\')&&!/[?#%]/.test(root));
 const load=options.load??loadVerifiedArtAsset,images=options.sharedImages??createNativeRasterLoader(root,load);
 let pending:Promise<AchievementArtCensus>|undefined,disposed=false;
 const census=()=>pending??=(async()=>decodeVersionedAchievementArt(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(
  await load(root,'achievement-art.json',pin.manifestFileSha256,16*1024*1024))),pin,index,hierarchy))().catch(e=>{pending=undefined;throw e;});
 return {
  async artwork(guid:string,version:string,detail=false):Promise<VersionedAchievementArtwork|null>{
   try{
    if(disposed||version!==pin.version)return null;
    const c=await census(),source=resolveAchievementArtSource(c,guid,detail);
    if(!source||disposed)return null;
    const {row,sprite,fidelity}=source,art=await images.image(sprite.asset);
    if(disposed)return null;
    return {art,width:sprite.asset.width,height:sprite.asset.height,saveGuid:guid,sourceSaveGuid:row.saveGuid,sourceKey:row.sourceKey,spritePathId:sprite.spritePathId,fidelity};
   }catch{return null;}
  },
  dispose(){disposed=true;if(!options.sharedImages)images.dispose();}
 };
}

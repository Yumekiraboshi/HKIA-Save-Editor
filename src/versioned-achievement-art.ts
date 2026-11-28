/** Reviewed candidate achievement artwork. Display only: the existing Rust
 * engine remains the sole authority for achievement progress and save edits.
 * A native null Icon PPtr is distinct from a missing/unsupported source. */
import type {AchievementIndex} from './achievement-index';
import type {AchievementHierarchy} from './achievement-groups';
import {loadVerifiedArtAsset} from './dynamic-art-assets';

const SHA=/^[a-f0-9]{64}$/;
const GUID=/^[a-f0-9]{32}$/;
const PATH=/^-?[1-9]\d{0,18}$/;
const SAVE_GUID=/^[a-f0-9]{8}(?::[a-f0-9]{8}){3}$/;
const PAGE=/^achievement-(?:category|individual)-atlas(?:-\d{3})?\.webp$/;
const ROUTING='native-local-achievement-direct-parent-v1';
export type AchievementArtPin=Readonly<{version:string;platform:'steam'|'switch';definitionsSha256:string;manifestFileSha256:string}>;
type Page=Readonly<{file:string;sha256:string;bytes:number;columns:number;rows:number;cellPx:number}>;
type Sprite=Readonly<{sourceGuid:string;sourceBundleSha256:string;spritePathId:string;sourceSha256:string;page:string;cell:number}>;
type Icon=Readonly<{kind:'null'}>|Readonly<{kind:'unresolved';sourceGuid:string;fileId:number;spritePathId:string}>|Readonly<{kind:'sprite';sprite:Sprite}>;
type Row=Readonly<{saveGuid:string;sourceKey:string;parent:string|null;icon:Icon}>;
export type AchievementArtCensus={pages:ReadonlyMap<string,Page>;rows:ReadonlyMap<string,Row>};
export type VersionedAchievementArtwork={url:string;saveGuid:string;sourceSaveGuid:string;sourceKey:string;spritePathId:string;columns:number;rows:number;cellPx:number;cell:number;x:string;y:string;fidelity:'original'|'direct-parent'};
function check(ok:unknown):asserts ok{if(!ok)throw Error('ACHIEVEMENT_ART_CANDIDATE_INVALID');}
function obj(v:unknown):Record<string,unknown>{check(v!==null&&typeof v==='object'&&!Array.isArray(v));return v as Record<string,unknown>;}
function list(v:unknown,max:number):unknown[]{check(Array.isArray(v)&&v.length<=max);return v;}
function text(v:unknown,re:RegExp):string{check(typeof v==='string'&&re.test(v));return v;}
function int(v:unknown,min:number,max:number):number{check(typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max);return v;}
function pinCheck(p:AchievementArtPin){check(/^\d+\.\d+\.\d+$/.test(p.version)&&(p.platform==='steam'||p.platform==='switch')&&SHA.test(p.definitionsSha256)&&SHA.test(p.manifestFileSha256));}
export function decodeVersionedAchievementArt(input:unknown,pin:AchievementArtPin,index:AchievementIndex,hierarchy:AchievementHierarchy):AchievementArtCensus{
 pinCheck(pin);const v=obj(input);
 check(v.schema==='HKIA.AchievementArtCandidate.1'&&v.version===pin.version&&v.platform===pin.platform&&v.definitionsSha256===pin.definitionsSha256&&v.reviewedRouting===ROUTING&&v.automaticReleaseActivationAuthorized===false);
 const pages=new Map<string,Page>(),rows=new Map<string,Row>(),sourceGuids=new Set<string>(),sourceKeys=new Set<string>();
 const bySprite=new Map<string,string>(),byCell=new Map<string,string>();
 for(const raw of list(v.pages,1000)){
  const p=obj(raw),file=text(p.file,PAGE),sha256=text(p.sha256,SHA),bytes=int(p.bytes,16,4*1024*1024),columns=int(p.columns,1,32),r=int(p.rows,1,32),cellPx=int(p.cellPx,32,256);
  check(!pages.has(file)&&columns*cellPx<=4096&&r*cellPx<=4096);
  pages.set(file,{file,sha256,bytes,columns,rows:r,cellPx});
 }
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
    const sourceBundleSha256=text(a.sourceBundleSha256,SHA),sourceSha256=text(a.sourceSha256,SHA),page=text(a.page,PAGE),p=pages.get(page);
    check(p);const cell=int(a.cell,0,p.columns*p.rows-1);
    const sourceIdentity=JSON.stringify([sourceBundleSha256,spritePathId,sourceSha256]),cellIdentity=page+':'+cell;
    check(!byCell.has(cellIdentity)||byCell.get(cellIdentity)===sourceIdentity);
    const spriteKey=sourceBundleSha256+':'+spritePathId;
    check(!bySprite.has(spriteKey)||bySprite.get(spriteKey)===sourceSha256);
    byCell.set(cellIdentity,sourceIdentity);bySprite.set(spriteKey,sourceSha256);
    icon={kind:'sprite',sprite:{sourceGuid,sourceBundleSha256,spritePathId,sourceSha256,page,cell}};
   }
  }
  sourceKeys.add(sourceKey);rows.set(saveGuid,{saveGuid,sourceKey,parent,icon});
 }
 check(rows.size===index.size&&nativeNull===v.nativeNullCount&&unresolved===v.unresolvedCount);
 for(const row of rows.values()){
  if(row.parent!==null)check(rows.get(row.parent)?.parent===null&&hierarchy.byGuid.has(row.parent));
 }
 for(const p of pages.values())check([...byCell.keys()].some(k=>k.startsWith(p.file+':')));
 return {pages,rows};
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
type LoadedPage={url:string;dispose():void};
async function decodePage(data:ArrayBuffer,p:Page):Promise<LoadedPage>{
 const header=new Uint8Array(data,0,12);
 check(String.fromCharCode(...header.subarray(0,4))==='RIFF'&&String.fromCharCode(...header.subarray(8,12))==='WEBP');
 const blob=new Blob([data],{type:'image/webp'}),image=await createImageBitmap(blob);
 try{check(image.width===p.columns*p.cellPx&&image.height===p.rows*p.cellPx);}
 finally{image.close();}
 const url=URL.createObjectURL(blob);let disposed=false;
 return {url,dispose(){if(!disposed){disposed=true;URL.revokeObjectURL(url);}}};
}
export function createVersionedAchievementArt(root:string,pin:AchievementArtPin,index:AchievementIndex,hierarchy:AchievementHierarchy,options:{load?:typeof loadVerifiedArtAsset;decodePage?:typeof decodePage}={}){
 pinCheck(pin);check(root.startsWith('/')&&root.endsWith('/')&&!root.includes('..')&&!root.includes('//')&&!root.includes('\\')&&!/[?#]/.test(root));
 const load=options.load??loadVerifiedArtAsset,decode=options.decodePage??decodePage;
 let pending:Promise<AchievementArtCensus>|undefined,disposed=false;
 const census=()=>pending??=(async()=>decodeVersionedAchievementArt(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(
  await load(root,'achievement-art.json',pin.manifestFileSha256,16*1024*1024))),pin,index,hierarchy))().catch(e=>{pending=undefined;throw e;});
 const pages=new Map<string,Promise<LoadedPage>>();
 function page(p:Page){
  let task=pages.get(p.file);
  if(!task){task=(async()=>decode(await load(root,p.file,p.sha256,4*1024*1024,p.bytes),p))().then(value=>{
   if(disposed){value.dispose();throw Error('ACHIEVEMENT_ART_DISPOSED');}return value;
  }).catch(e=>{pages.delete(p.file);throw e;});pages.set(p.file,task);}
  return task;
 }
 return {
  async artwork(guid:string,version:string,detail=false):Promise<VersionedAchievementArtwork|null>{
   try{
    if(disposed||version!==pin.version)return null;
    const c=await census(),source=resolveAchievementArtSource(c,guid,detail);
    if(!source||disposed)return null;
    const {row,sprite,fidelity}=source,p=c.pages.get(sprite.page)!;
    const loaded=await page(p);if(disposed)return null;
    return {url:loaded.url,saveGuid:guid,sourceSaveGuid:row.saveGuid,sourceKey:row.sourceKey,spritePathId:sprite.spritePathId,columns:p.columns,rows:p.rows,cellPx:p.cellPx,cell:sprite.cell,
     x:(p.columns===1?0:(sprite.cell%p.columns)*100/(p.columns-1))+'%',y:(p.rows===1?0:Math.floor(sprite.cell/p.columns)*100/(p.rows-1))+'%',fidelity};
   }catch{return null;}
  },
  dispose(){disposed=true;for(const task of pages.values())void task.then(p=>p.dispose(),()=>{});pages.clear();}
 };
}

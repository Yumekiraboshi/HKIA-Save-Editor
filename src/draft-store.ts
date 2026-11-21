import {cloneStoredAchievementPatches,type StoredPatch} from './achievement-draft';
export type DraftPatch={id:number;before:string|null;after:string|null};
export type DraftUi={group:string|null;subgroup:string|null};
export type LocalDraft={file:File;patches:DraftPatch[];achievementPatches:StoredPatch[];ui:DraftUi;historyCheckpoint:Uint8Array|null};
const DB_NAME='hkia-editor-local-session';
const BASE='source-save';
const EDITS='unsaved-changes';
const KEY='current';
const VERSION=1;
const HISTORY_MAGIC=[72,75,73,65,72,83,48,49]; // HKIAHS01
export function safeHistoryCheckpoint(value:unknown):Uint8Array|null{
 if(!(value instanceof Uint8Array)||value.length<16||value.length>128*1024||
  HISTORY_MAGIC.some((byte,i)=>value[i]!==byte))return null;
 const view=new DataView(value.buffer,value.byteOffset,value.byteLength);
 const count=view.getUint32(8,true),active=view.getUint32(12,true);
 if(count>256||active>count)return null;
 return new Uint8Array(value);
}
const isPatch=(p:DraftPatch)=>Number.isInteger(p.id)&&p.id>0&&p.id<=2147483647
 &&(p.before===null||typeof p.before==='string'&&/^-?\d{1,19}$/.test(p.before))
 &&(p.after===null||typeof p.after==='string'&&/^-?\d{1,19}$/.test(p.after));

function openDatabase():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  if(!('indexedDB' in globalThis)){reject(Error('INDEXEDDB_UNAVAILABLE'));return}
  let request:IDBOpenDBRequest;
  try{request=indexedDB.open(DB_NAME,VERSION)}catch(e){reject(e);return}
  request.onupgradeneeded=()=>{
   const db=request.result;
   if(!db.objectStoreNames.contains(BASE))db.createObjectStore(BASE);
   if(!db.objectStoreNames.contains(EDITS))db.createObjectStore(EDITS);
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error??Error('INDEXEDDB_OPEN'));
  request.onblocked=()=>reject(Error('INDEXEDDB_BLOCKED'));
 });
}
function complete(tx:IDBTransaction):Promise<void>{
 return new Promise((resolve,reject)=>{
  tx.oncomplete=()=>resolve();
  tx.onabort=()=>reject(tx.error??Error('INDEXEDDB_ABORT'));
  tx.onerror=()=>reject(tx.error??Error('INDEXEDDB_WRITE'));
 });
}
export function diffPatches(baseline:ReadonlyMap<number,bigint>,current:Readonly<Record<string,bigint>>):DraftPatch[]{
 const all=new Set<number>(baseline.keys());
 for(const key of Object.keys(current)){const n=Number(key);if(Number.isInteger(n)&&n>0)all.add(n)}
 const result:DraftPatch[]=[];
 for(const id of all){
  const before=baseline.get(id)??null;
  const after=current[String(id)]??null;
  if(before===after)continue;
  result.push({id,before:before===null?null:String(before),after:after===null?null:String(after)});
 }
 return result.sort((a,b)=>a.id-b.id);
}
export function safePatches(value:unknown):DraftPatch[]{
 if(!Array.isArray(value)||value.length>20000||value.some(p=>!p||typeof p!=='object'||!isPatch(p as DraftPatch)))throw Error('DRAFT_INVALID');
 const out=value as DraftPatch[];
 if(new Set(out.map(x=>x.id)).size!==out.length)throw Error('DRAFT_INVALID');
 return out;
}
export async function restoreLocalDraft():Promise<LocalDraft|null>{
 const db=await openDatabase();
 try{
  const tx=db.transaction([BASE,EDITS],'readonly');
  const source=tx.objectStore(BASE).get(KEY);
  const changes=tx.objectStore(EDITS).get(KEY);
  const completed=complete(tx);
  await completed;
  if(!source.result)return null;
  const file=source.result;
  if(!(file instanceof Blob)||file.size<=0||file.size>60*1024*1024)throw Error('DRAFT_INVALID');
  const actualFile=file instanceof File?file:new File([file],'HKIA-save.save',{type:'application/octet-stream'});
  const state=changes.result as {version?:number;patches?:DraftPatch[];achievementPatches?:unknown;ui?:DraftUi;historyCheckpoint?:unknown}|undefined;
  const patches=safePatches(state?.patches??[]);
  const achievementPatches=state?.achievementPatches??[];
  if(!Array.isArray(achievementPatches)||achievementPatches.length>10000)throw Error('DRAFT_INVALID');
  const group=typeof state?.ui?.group==='string'&&state.ui.group.length<128?state.ui.group:null;
  const subgroup=typeof state?.ui?.subgroup==='string'&&state.ui.subgroup.length<128?state.ui.subgroup:null;
  return {file:actualFile,patches,achievementPatches:achievementPatches as StoredPatch[],ui:{group,subgroup},historyCheckpoint:safeHistoryCheckpoint(state?.historyCheckpoint)};
 }finally{db.close()}
}
export async function saveOriginalLocally(file:File):Promise<void>{
 const db=await openDatabase();
 try{
  const tx=db.transaction([BASE,EDITS],'readwrite');
  const finished=complete(tx);
  tx.objectStore(BASE).put(file,KEY);
  tx.objectStore(EDITS).put({version:VERSION,patches:[],achievementPatches:[],ui:{group:null,subgroup:null}},KEY);
  await finished;
 }finally{db.close()}
}
export async function saveDraftChanges(patches:DraftPatch[],ui:DraftUi,achievementPatches:StoredPatch[]=[],historyCheckpoint:Uint8Array|null=null):Promise<void>{
 // Svelte $state arrays and their nested GUIDs can be Proxies. IDB.put clones data
 // synchronously and rejects them with DataCloneError, so normalize *all* inputs
 // before opening the transaction. Do not JSON-stringify nanosecond timestamps.
 const savedPatches=safePatches(patches).map(p=>({id:p.id,before:p.before,after:p.after}));
 const savedAchievements=cloneStoredAchievementPatches(achievementPatches);
 const savedUi:DraftUi={group:ui.group,subgroup:ui.subgroup};
 const savedHistory=historyCheckpoint===null?null:safeHistoryCheckpoint(historyCheckpoint);
 if(historyCheckpoint!==null&&!savedHistory)throw Error('HISTORY_CHECKPOINT_INVALID');
 const db=await openDatabase();
 try{
  const tx=db.transaction(EDITS,'readwrite');
  const finished=complete(tx);
  tx.objectStore(EDITS).put({version:VERSION,patches:savedPatches,achievementPatches:savedAchievements,ui:savedUi,historyCheckpoint:savedHistory},KEY);
  await finished;
 }finally{db.close()}
}
export async function forgetLocalDraft():Promise<void>{
 const db=await openDatabase();
 try{
  const tx=db.transaction([BASE,EDITS],'readwrite');
  const finished=complete(tx);
  tx.objectStore(BASE).delete(KEY);
  tx.objectStore(EDITS).delete(KEY);
  await finished;
 }finally{db.close()}
}

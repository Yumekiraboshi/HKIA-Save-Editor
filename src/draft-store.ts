export type DraftPatch={id:number;before:string|null;after:string|null};
export type DraftUi={group:string|null};
export type LocalDraft={file:File;patches:DraftPatch[];ui:DraftUi};
const DB_NAME='hkia-editor-local-session';
const BASE='source-save';
const EDITS='unsaved-changes';
const KEY='current';
const VERSION=1;
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
  const state=changes.result as {version?:number;patches?:DraftPatch[];ui?:DraftUi}|undefined;
  const patches=safePatches(state?.patches??[]);
  const group=typeof state?.ui?.group==='string'&&state.ui.group.length<128?state.ui.group:null;
  return {file:actualFile,patches,ui:{group}};
 }finally{db.close()}
}
export async function saveOriginalLocally(file:File):Promise<void>{
 const db=await openDatabase();
 try{
  const tx=db.transaction([BASE,EDITS],'readwrite');
  const finished=complete(tx);
  tx.objectStore(BASE).put(file,KEY);
  tx.objectStore(EDITS).put({version:VERSION,patches:[],ui:{group:null}},KEY);
  await finished;
 }finally{db.close()}
}
export async function saveDraftChanges(patches:DraftPatch[],ui:DraftUi):Promise<void>{
 safePatches(patches);
 const db=await openDatabase();
 try{
  const tx=db.transaction(EDITS,'readwrite');
  const finished=complete(tx);
  tx.objectStore(EDITS).put({version:VERSION,patches,ui},KEY);
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

import {workerAchievementGuid,workerAchievementValue,workerAchievementPatch,workerAchievementDraftPatch,workerCollectionPatch} from './achievement-worker-payload';

export type AchievementValue={complete:boolean;current:number;completed:[bigint,number]|null};
export type AchievementEntry={guid:[number,number,number,number];value:AchievementValue};
export type AchievementPatch={guid:[number,number,number,number];before:AchievementValue;after:AchievementValue};
export type AchievementDraftPatch={guid:[number,number,number,number];before:AchievementValue|null;after:AchievementValue};
export type CounterEntry={guid:[number,number,number,number];current:number;countedValues:number|null;countedGuids:number};
export type SaveSnapshot={
 version:'3.0.0'|'3.0.1';
 zip:boolean;
 membershipEdit:boolean;
 dirty:boolean;
 canUndo:boolean;
 canRedo:boolean;
 revision:number;
 bytes:number;
 entries:Array<[number,bigint]>;
 achievements:AchievementEntry[];
 counters:CounterEntry[];
};
type Action='open'|'snapshot'|'change'|'achievement'|'achievement-create'|'achievement-create-parent'|'achievement-parent-create'|'achievement-pair'|'batch'|'undo'|'redo'|'reset'|'export'|'clear';
type Response={id:number;ok:boolean;value?:unknown;error?:string};
let nextId=0;
const worker=new Worker(new URL('./editor.worker.ts',import.meta.url),{type:'module'});
const waiting=new Map<number,{resolve:(value:unknown)=>void;reject:(error:Error)=>void}>();
worker.onmessage=(event:MessageEvent<Response>)=>{
 const r=event.data;const pending=waiting.get(r.id);if(!pending)return;
 waiting.delete(r.id);if(r.ok)pending.resolve(r.value);else pending.reject(Error(r.error||'操作に失敗しました'));
};
worker.onerror=()=>{
 for(const x of waiting.values())x.reject(Error('Web Workerが停止しました。'));
 waiting.clear();
};
function rpc(action:Action,data:Record<string,unknown>={},transfer:Transferable[]=[]):Promise<unknown>{
 const id=++nextId;
 return new Promise((resolve,reject)=>{
  waiting.set(id,{resolve,reject});
  try{worker.postMessage({id,action,...data},transfer)}
  catch(e){waiting.delete(id);reject(e instanceof Error?e:new Error(String(e)))}
 });
}
export async function openSave(file:File):Promise<SaveSnapshot>{
 const bytes=new Uint8Array(await file.arrayBuffer());
 return rpc('open',{file:bytes},[bytes.buffer]) as Promise<SaveSnapshot>;
}
export function changeCollection(itemId:number,expected:bigint|null,next:bigint|null):Promise<SaveSnapshot>{
 return rpc('change',{itemId,expected,next}) as Promise<SaveSnapshot>;
}
/** CAS-validated atomic leaf+parent change; both revert with one Undo. */
export function changeAchievementPair(first:AchievementPatch,second:AchievementPatch):Promise<SaveSnapshot>{
 return rpc('achievement-pair',{
  achievementPatches:[workerAchievementPatch(first),workerAchievementPatch(second)]
 }) as Promise<SaveSnapshot>;
}
/** Source-index-verified previously missing saved achievement: created only on user action. */
export function createAchievement(guid:AchievementEntry['guid'],afterValue:AchievementValue):Promise<SaveSnapshot>{
 return rpc('achievement-create',{guid:workerAchievementGuid(guid),afterValue:workerAchievementValue(afterValue)}) as Promise<SaveSnapshot>;
}
/** Missing last child + existing parent update are atomic and one-step undoable. */
export function createAchievementWithParent(guid:AchievementEntry['guid'],value:AchievementValue,parent:AchievementPatch):Promise<SaveSnapshot>{
 return rpc('achievement-create-parent',{
  guid:workerAchievementGuid(guid),afterValue:workerAchievementValue(value),
  achievementPatches:[workerAchievementPatch(parent)]
 }) as Promise<SaveSnapshot>;
}
/** A saved or newly-created final child and missing native category parent
 * are committed as one atomic Rust/WASM transaction and one Undo step. */
export function completeChildWithNewParent(
 child:AchievementDraftPatch,parent:{guid:AchievementEntry['guid'];after:AchievementValue}
):Promise<SaveSnapshot>{
 return rpc('achievement-parent-create',{
  achievementPatches:[
   workerAchievementDraftPatch(child),
   workerAchievementDraftPatch({guid:parent.guid,before:null,after:parent.after})
  ]
 }) as Promise<SaveSnapshot>;
}
export function changeAchievement(guid:AchievementEntry['guid'],beforeValue:AchievementValue,afterValue:AchievementValue):Promise<SaveSnapshot>{
 return rpc('achievement',{
  guid:workerAchievementGuid(guid),
  beforeValue:workerAchievementValue(beforeValue),
  afterValue:workerAchievementValue(afterValue)
 }) as Promise<SaveSnapshot>;
}
export function undo():Promise<SaveSnapshot>{return rpc('undo') as Promise<SaveSnapshot>}
export function redo():Promise<SaveSnapshot>{return rpc('redo') as Promise<SaveSnapshot>}
export function reset():Promise<SaveSnapshot>{return rpc('reset') as Promise<SaveSnapshot>}
export function exportSave():Promise<Uint8Array>{return rpc('export') as Promise<Uint8Array>}
export function clear():Promise<unknown>{return rpc('clear')}

export type ChangeRequest={id:number;before:bigint|null;after:bigint|null};
export function applyDraft(patches:ChangeRequest[],achievementPatches:AchievementDraftPatch[]=[]):Promise<SaveSnapshot>{
 return rpc('batch',{
  patches:patches.map(workerCollectionPatch),
  achievementPatches:achievementPatches.map(workerAchievementDraftPatch)
 }) as Promise<SaveSnapshot>;
}

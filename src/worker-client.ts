export type AchievementValue={complete:boolean;current:number;completed:[bigint,number]|null};
export type AchievementEntry={guid:[number,number,number,number];value:AchievementValue};
export type AchievementPatch={guid:[number,number,number,number];before:AchievementValue;after:AchievementValue};
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
};
type Action='open'|'snapshot'|'change'|'achievement'|'batch'|'undo'|'redo'|'reset'|'export'|'clear';
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
  worker.postMessage({id,action,...data},transfer);
 });
}
export async function openSave(file:File):Promise<SaveSnapshot>{
 const bytes=new Uint8Array(await file.arrayBuffer());
 return rpc('open',{file:bytes},[bytes.buffer]) as Promise<SaveSnapshot>;
}
export function changeCollection(itemId:number,expected:bigint|null,next:bigint|null):Promise<SaveSnapshot>{
 return rpc('change',{itemId,expected,next}) as Promise<SaveSnapshot>;
}
export function changeAchievement(guid:AchievementEntry['guid'],beforeValue:AchievementValue,afterValue:AchievementValue):Promise<SaveSnapshot>{
 return rpc('achievement',{guid,beforeValue,afterValue}) as Promise<SaveSnapshot>;
}
export function undo():Promise<SaveSnapshot>{return rpc('undo') as Promise<SaveSnapshot>}
export function redo():Promise<SaveSnapshot>{return rpc('redo') as Promise<SaveSnapshot>}
export function reset():Promise<SaveSnapshot>{return rpc('reset') as Promise<SaveSnapshot>}
export function exportSave():Promise<Uint8Array>{return rpc('export') as Promise<Uint8Array>}
export function clear():Promise<unknown>{return rpc('clear')}

export type ChangeRequest={id:number;before:bigint|null;after:bigint|null};
export function applyDraft(patches:ChangeRequest[],achievementPatches:AchievementPatch[]=[]):Promise<SaveSnapshot>{return rpc('batch',{patches,achievementPatches}) as Promise<SaveSnapshot>}

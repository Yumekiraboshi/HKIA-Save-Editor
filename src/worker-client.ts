import {workerAchievementGuid,workerAchievementValue,workerAchievementPatch,workerAchievementDraftPatch,workerCollectionPatch} from './achievement-worker-payload';

export type AchievementValue={complete:boolean;current:number;completed:[bigint,number]|null};
export type AchievementEntry={guid:[number,number,number,number];value:AchievementValue};
export type AchievementPatch={guid:[number,number,number,number];before:AchievementValue;after:AchievementValue};
export type AchievementDraftPatch={guid:[number,number,number,number];before:AchievementValue|null;after:AchievementValue};
export type CounterEntry={guid:[number,number,number,number];current:number;countedValues:number|null;countedGuids:number};
import type {FlowerVariant,FurnitureVariant,InventoryUniqueInfo} from './inventory-unique';
import type {InventoryFlower} from './inventory-flower-display';
import type {InventoryPalette} from './inventory-palette-display';
export type InventoryEntry={documentId:number;itemId:number;quantity:number;editable:boolean;quantityLimit:number|null;quantityMinimum:number;flowerCreatable?:boolean;flower?:InventoryFlower;palette?:InventoryPalette;unique?:InventoryUniqueInfo};
export type InventoryQuantityRequest=[documentId:number,before:number,after:number];
export type InventoryPatch={documentId:number;before:number;after:number;kind?:undefined}|{documentId:number;before:FlowerVariant;after:FlowerVariant;kind:'flower-variant'}|{documentId:number;before:FurnitureVariant;after:FurnitureVariant;kind:'furniture-variant'}|{documentId:number;itemId:number;variant:FlowerVariant;quantity:number;kind:'flower-create'};
export type HistoryScope='collections'|'achievements'|'inventory';
export type HistoryRecord={
 scope:HistoryScope;applied:boolean;paired:boolean;
 itemId:number|null;guid:[number,number,number,number]|null
};
export type SaveSnapshot={
 inventoryBatchLimit:number;
 history:HistoryRecord[];
 historyCheckpoint:Uint8Array|null;
 /** Sorted source-verified IDs currently absent and safe to record in this session. */
 eligibleCollectionHistoryIds:number[];
 /** Original v3.0.1 Rust-defined GUID/goal pairs, empty on older or unknown versions. */
 achievementGoals:Array<[string,number]>;
 version:string; // Source-semver; Rust verifies target schema for future revisions.
 zip:boolean;
 membershipEdit:boolean;
 dirty:boolean;
 canUndo:boolean;
 canRedo:boolean;
 revision:number;
 bytes:number;
 entries:Array<[number,bigint]>;
 achievements:AchievementEntry[];
 inventory:InventoryEntry[];
 inventoryCreatable:InventoryEntry[];
 counters:CounterEntry[];
};
type Action='open'|'snapshot'|'change'|'inventory-change'|'inventory-batch-change'|'flower-variant-change'|'flower-variants'|'flower-create'|'flower-create-variants'|'furniture-variants'|'furniture-variant-change'|'achievement'|'achievement-create'|'achievement-create-parent'|'achievement-parent-create'|'achievement-pair'|'achievement-plan-toggle'|'achievement-auto'|'batch'|'undo'|'redo'|'history-jump'|'history-restore'|'reset'|'export'|'clear';
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
/** Existing ordinary stack only. Rust enforces structural eligibility and CAS. */
export function changeInventoryQuantity(documentId:number,beforeQuantity:number,nextQuantity:number):Promise<SaveSnapshot>{
 return rpc('inventory-change',{documentId,beforeQuantity,nextQuantity}) as Promise<SaveSnapshot>;
}
export function changeInventoryQuantities(rows:readonly InventoryQuantityRequest[]):Promise<SaveSnapshot>{
 return rpc('inventory-batch-change',{quantityBatch:rows.map(row=>[...row])}) as Promise<SaveSnapshot>;
}
export function requestFlowerVariants(documentId:number):Promise<FlowerVariant[]>{
 return rpc('flower-variants',{documentId}) as Promise<FlowerVariant[]>;
}
export function requestFlowerCreationVariants(documentId:number):Promise<FlowerVariant[]>{
 return rpc('flower-create-variants',{documentId}) as Promise<FlowerVariant[]>;
}
export function createInventoryFlowerVariant(documentId:number,beforeVariant:FlowerVariant,nextVariant:FlowerVariant,nextQuantity:number):Promise<SaveSnapshot>{
 return rpc('flower-create',{documentId,beforeVariant:[...beforeVariant],nextVariant:[...nextVariant],nextQuantity}) as Promise<SaveSnapshot>;
}
export function changeInventoryFlowerVariant(documentId:number,beforeVariant:FlowerVariant,nextVariant:FlowerVariant):Promise<SaveSnapshot>{
 return rpc('flower-variant-change',{documentId,beforeVariant:[...beforeVariant],nextVariant:[...nextVariant]}) as Promise<SaveSnapshot>;
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
/** Rust derives the source-v3.0.1 native goal and timestamp. Planning is
 * read-only; normal change/create/pair CAS still commits the operation. */
export function planAchievementToggle(guid:AchievementEntry['guid'],nowMs:number):Promise<AchievementValue>{
 return rpc('achievement-plan-toggle',{
  guid:workerAchievementGuid(guid),nowMs
 }) as Promise<AchievementValue>;
}
/** The sole UI-facing achievement edit: Rust validates source membership,
 * plans any parent change and commits the entire CAS as one Undo event.
 * Null before means a source-verified, currently absent saved record. */
export function editAchievementAuto(
 guid:AchievementEntry['guid'],beforeValue:AchievementValue|null,afterValue:AchievementValue
):Promise<SaveSnapshot>{
 return rpc('achievement-auto',{
  guid:workerAchievementGuid(guid),
  beforeValue:beforeValue===null?null:workerAchievementValue(beforeValue),
  afterValue:workerAchievementValue(afterValue)
 }) as Promise<SaveSnapshot>;
}
export function changeAchievement(guid:AchievementEntry['guid'],beforeValue:AchievementValue,afterValue:AchievementValue):Promise<SaveSnapshot>{
 return rpc('achievement',{
  guid:workerAchievementGuid(guid),
  beforeValue:workerAchievementValue(beforeValue),
  afterValue:workerAchievementValue(afterValue)
 }) as Promise<SaveSnapshot>;
}
/** Absolute cursor in one independent tab timeline. Other tab's edits are retained. */
export function jumpHistory(scope:HistoryScope,target:number):Promise<SaveSnapshot>{
 return rpc('history-jump',{scope,target}) as Promise<SaveSnapshot>;
}
/** Rebuild validated native transactions and both tab cursors from an IndexedDB checkpoint. */
export function restoreHistory(checkpoint:Uint8Array):Promise<SaveSnapshot>{
 const bytes=checkpoint.slice();
 return rpc('history-restore',{checkpoint:bytes},[bytes.buffer]) as Promise<SaveSnapshot>;
}
export function undo():Promise<SaveSnapshot>{return rpc('undo') as Promise<SaveSnapshot>}
export function redo():Promise<SaveSnapshot>{return rpc('redo') as Promise<SaveSnapshot>}
export function reset():Promise<SaveSnapshot>{return rpc('reset') as Promise<SaveSnapshot>}
export function exportSave():Promise<Uint8Array>{return rpc('export') as Promise<Uint8Array>}
export function clear():Promise<unknown>{return rpc('clear')}

export type ChangeRequest={id:number;before:bigint|null;after:bigint|null};
export function applyDraft(patches:ChangeRequest[],achievementPatches:AchievementDraftPatch[]=[],inventoryPatches:InventoryPatch[]=[]):Promise<SaveSnapshot>{
 return rpc('batch',{
  patches:patches.map(workerCollectionPatch),
  achievementPatches:achievementPatches.map(workerAchievementDraftPatch),
  inventoryPatches:inventoryPatches.map(p=>p.kind==='flower-create'?{documentId:p.documentId,itemId:p.itemId,kind:p.kind,variant:[...p.variant],quantity:p.quantity}:p.kind!==undefined?{documentId:p.documentId,kind:p.kind,before:[...p.before],after:[...p.after]}:{documentId:p.documentId,before:p.before,after:p.after})
 }) as Promise<SaveSnapshot>;
}

export function requestFurnitureVariants(documentId:number):Promise<FurnitureVariant[]>{
 return rpc('furniture-variants',{documentId}) as Promise<FurnitureVariant[]>;
}
export function changeInventoryFurnitureVariant(documentId:number,beforeFurnitureVariant:FurnitureVariant,nextFurnitureVariant:FurnitureVariant):Promise<SaveSnapshot>{
 return rpc('furniture-variant-change',{documentId,beforeFurnitureVariant:[...beforeFurnitureVariant],nextFurnitureVariant:[...nextFurnitureVariant]}) as Promise<SaveSnapshot>;
}

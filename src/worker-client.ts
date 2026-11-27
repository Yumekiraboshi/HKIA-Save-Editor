import {workerAchievementGuid,workerAchievementValue,workerAchievementPatch,workerAchievementDraftPatch,workerCollectionPatch} from './achievement-worker-payload';

export type AchievementValue={complete:boolean;current:number;completed:[bigint,number]|null};
export type AchievementEntry={guid:[number,number,number,number];value:AchievementValue};
export type AchievementPatch={guid:[number,number,number,number];before:AchievementValue;after:AchievementValue};
export type AchievementDraftPatch={guid:[number,number,number,number];before:AchievementValue|null;after:AchievementValue};
export type CounterEntry={guid:[number,number,number,number];current:number;countedValues:number|null;countedGuids:number};
import type {FlowerVariant,FurnitureVariant,InventoryUniqueInfo} from './inventory-unique';
import type {InventoryFlower} from './inventory-flower-display';
import type {InventoryPalette,PaletteVariant} from './inventory-palette-display';
import type {CafeVariant,CafeOption,CafeRow,CafeWitness} from './inventory-cafe-display';
import type {WandVariant,WandIdentity} from './inventory-wand-display';
import type {InventoryBoba,BobaVariant,BobaWitness} from './inventory-boba-display';
export type InventoryEntry={documentId:number;itemId:number;quantity:number;editable:boolean;quantityLimit:number|null;quantityMinimum:number;flowerCreatable?:boolean;furnitureCreatable?:boolean;wandCreatableStyle?:number;flower?:InventoryFlower;palette?:InventoryPalette;paletteCreationDefault?:PaletteVariant;boba?:InventoryBoba;cafe?:CafeRow;unique?:InventoryUniqueInfo};
export type InventoryQuantityRequest=[documentId:number,before:number,after:number];
export type InventoryPatch={documentId:number;before:number;after:number;kind?:undefined}|{documentId:number;before:FlowerVariant;after:FlowerVariant;kind:'flower-variant'}|{documentId:number;before:FurnitureVariant;after:FurnitureVariant;kind:'furniture-variant'}|{documentId:number;before:PaletteVariant;after:PaletteVariant;kind:'palette-variant'}|{documentId:number;before:BobaVariant;after:BobaVariant;kind:'boba-variant'}|{documentId:number;before:WandVariant;after:WandVariant;kind:'wand-variant'}|{documentId:number;before:WandIdentity;after:WandIdentity;kind:'wand-identity'}|{documentId:number;before:CafeVariant;after:CafeVariant;kind:'cafe-variant'}|{documentId:number;itemId:number;variant:PaletteVariant;quantity:number;kind:'palette-create'}|{documentId:number;itemId:number;variant:BobaVariant;quantity:number;kind:'boba-create'}|{documentId:number;itemId:number;variant:CafeVariant;quantity:number;kind:'cafe-create'}|{documentId:number;itemId:number;variant:WandVariant;quantity:number;kind:'wand-create';sourceItemId?:number}|{documentId:number;itemId:number;variant:FlowerVariant;quantity:number;kind:'flower-create'}|{documentId:number;itemId:number;variant:FurnitureVariant;quantity:number;kind:'furniture-create'};
export type HistoryScope='collections'|'achievements'|'inventory';
export type HistoryRecord={
 scope:HistoryScope;applied:boolean;paired:boolean;
 itemId:number|null;guid:[number,number,number,number]|null
};
export type SaveSnapshot={
 inventoryBatchLimit:number;
 bobaWitnesses?:BobaWitness[];
 cafeWitnesses?:CafeWitness[];
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
type Action='open'|'snapshot'|'change'|'inventory-change'|'inventory-batch-change'|'flower-variant-change'|'flower-variants'|'flower-preview'|'flower-create'|'flower-create-variants'|'furniture-variants'|'furniture-variant-change'|'furniture-create'|'furniture-create-variants'|'palette-variants'|'palette-preview'|'palette-variant-change'|'palette-create-variants'|'palette-create'|'boba-variants'|'boba-variant-change'|'boba-create-variants'|'boba-create'|'cafe-variants'|'cafe-variant-change'|'cafe-create-variants'|'cafe-create'|'wand-variants'|'wand-variant-change'|'wand-identity-change'|'wand-create-variants'|'wand-absent-sources'|'wand-create'|'achievement'|'achievement-create'|'achievement-create-parent'|'achievement-parent-create'|'achievement-pair'|'achievement-plan-toggle'|'achievement-auto'|'batch'|'undo'|'redo'|'history-jump'|'history-restore'|'reset'|'export'|'clear';
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
export type FlowerPreview={options:FlowerVariant[];creatable:boolean};
export function requestFlowerPreview(documentId:number,beforeVariant:FlowerVariant,nextVariant:FlowerVariant):Promise<FlowerPreview>{
 return rpc('flower-preview',{documentId,beforeVariant:[...beforeVariant],nextVariant:[...nextVariant]}) as Promise<FlowerPreview>;
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
  inventoryPatches:inventoryPatches.map(p=>p.kind==='wand-create'?{documentId:p.documentId,itemId:p.itemId,kind:p.kind,variant:[...p.variant],quantity:p.quantity,sourceItemId:p.sourceItemId}:p.kind==='cafe-create'?{documentId:p.documentId,itemId:p.itemId,kind:p.kind,variant:[...p.variant],quantity:p.quantity}:p.kind==='boba-create'?{documentId:p.documentId,itemId:p.itemId,kind:p.kind,variant:[...p.variant],quantity:p.quantity}:p.kind==='palette-create'?{documentId:p.documentId,itemId:p.itemId,kind:p.kind,variant:[...p.variant],quantity:p.quantity}:p.kind==='furniture-create'?{documentId:p.documentId,itemId:p.itemId,kind:p.kind,variant:[...p.variant],quantity:p.quantity}:p.kind==='flower-create'?{documentId:p.documentId,itemId:p.itemId,kind:p.kind,variant:[...p.variant],quantity:p.quantity}:p.kind!==undefined?{documentId:p.documentId,kind:p.kind,before:[...p.before],after:[...p.after]}:{documentId:p.documentId,before:p.before,after:p.after})
 }) as Promise<SaveSnapshot>;
}

export function requestFurnitureCreationVariants(documentId:number):Promise<FurnitureVariant[]>{
 return rpc('furniture-create-variants',{documentId}) as Promise<FurnitureVariant[]>;
}
export function createInventoryFurnitureVariant(documentId:number,beforeFurnitureVariant:FurnitureVariant,nextFurnitureVariant:FurnitureVariant,nextQuantity:number):Promise<SaveSnapshot>{
 return rpc('furniture-create',{documentId,beforeFurnitureVariant:[...beforeFurnitureVariant],nextFurnitureVariant:[...nextFurnitureVariant],nextQuantity}) as Promise<SaveSnapshot>;
}
export function requestFurnitureVariants(documentId:number):Promise<FurnitureVariant[]>{
 return rpc('furniture-variants',{documentId}) as Promise<FurnitureVariant[]>;
}
export function changeInventoryFurnitureVariant(documentId:number,beforeFurnitureVariant:FurnitureVariant,nextFurnitureVariant:FurnitureVariant):Promise<SaveSnapshot>{
 return rpc('furniture-variant-change',{documentId,beforeFurnitureVariant:[...beforeFurnitureVariant],nextFurnitureVariant:[...nextFurnitureVariant]}) as Promise<SaveSnapshot>;
}

export type PalettePreview={options:PaletteVariant[];creatable:boolean};
export function requestPalettePreview(documentId:number,beforePaletteVariant:PaletteVariant,nextPaletteVariant:PaletteVariant):Promise<PalettePreview>{
 return rpc('palette-preview',{documentId,beforePaletteVariant:[...beforePaletteVariant],nextPaletteVariant:[...nextPaletteVariant]}) as Promise<PalettePreview>;
}
export function requestPaletteVariants(documentId:number):Promise<PaletteVariant[]>{
 return rpc('palette-variants',{documentId}) as Promise<PaletteVariant[]>;
}
export function changeInventoryPaletteVariant(documentId:number,beforePaletteVariant:PaletteVariant,nextPaletteVariant:PaletteVariant):Promise<SaveSnapshot>{
 return rpc('palette-variant-change',{documentId,beforePaletteVariant:[...beforePaletteVariant],nextPaletteVariant:[...nextPaletteVariant]}) as Promise<SaveSnapshot>;
}

export function requestBobaVariants(documentId:number):Promise<BobaVariant[]>{
 return rpc('boba-variants',{documentId}) as Promise<BobaVariant[]>;
}
export function changeInventoryBobaVariant(documentId:number,beforeBobaVariant:BobaVariant,nextBobaVariant:BobaVariant):Promise<SaveSnapshot>{
 return rpc('boba-variant-change',{documentId,beforeBobaVariant:[...beforeBobaVariant],nextBobaVariant:[...nextBobaVariant]}) as Promise<SaveSnapshot>;
}

export function requestPaletteCreationVariants(documentId:number):Promise<PaletteVariant[]>{
 return rpc('palette-create-variants',{documentId}) as Promise<PaletteVariant[]>;
}
export function createInventoryPaletteVariant(documentId:number,beforePaletteVariant:PaletteVariant,nextPaletteVariant:PaletteVariant,nextQuantity:number):Promise<SaveSnapshot>{
 return rpc('palette-create',{documentId,beforePaletteVariant:[...beforePaletteVariant],nextPaletteVariant:[...nextPaletteVariant],nextQuantity}) as Promise<SaveSnapshot>;
}

export function requestWandVariants(documentId:number,sourceItemId?:number):Promise<WandVariant[]>{
 return rpc('wand-variants',{documentId,itemId:sourceItemId}) as Promise<WandVariant[]>;
}
export function changeInventoryWandVariant(documentId:number,beforeWandVariant:WandVariant,nextWandVariant:WandVariant):Promise<SaveSnapshot>{
 return rpc('wand-variant-change',{documentId,beforeWandVariant:[...beforeWandVariant],nextWandVariant:[...nextWandVariant]}) as Promise<SaveSnapshot>;
}

export function requestCafeVariants(documentId:number):Promise<CafeOption[]>{
 return rpc('cafe-variants',{documentId}) as Promise<CafeOption[]>;
}
export function changeInventoryCafeVariant(documentId:number,beforeCafeVariant:CafeVariant,nextCafeVariant:CafeVariant):Promise<SaveSnapshot>{
 return rpc('cafe-variant-change',{documentId,beforeCafeVariant:[...beforeCafeVariant],nextCafeVariant:[...nextCafeVariant]}) as Promise<SaveSnapshot>;
}

export function requestCafeCreationVariants(documentId:number):Promise<CafeOption[]>{
 return rpc('cafe-create-variants',{documentId}) as Promise<CafeOption[]>;
}
export function createInventoryCafeVariant(documentId:number,beforeCafeVariant:CafeVariant,nextCafeVariant:CafeVariant,nextQuantity:number):Promise<SaveSnapshot>{
 return rpc('cafe-create',{documentId,beforeCafeVariant:[...beforeCafeVariant],nextCafeVariant:[...nextCafeVariant],nextQuantity}) as Promise<SaveSnapshot>;
}

export function requestBobaCreationVariants(documentId:number):Promise<BobaVariant[]>{
 return rpc('boba-create-variants',{documentId}) as Promise<BobaVariant[]>;
}
export function createInventoryBobaVariant(documentId:number,beforeBobaVariant:BobaVariant,nextBobaVariant:BobaVariant,nextQuantity:number):Promise<SaveSnapshot>{
 return rpc('boba-create',{documentId,beforeBobaVariant:[...beforeBobaVariant],nextBobaVariant:[...nextBobaVariant],nextQuantity}) as Promise<SaveSnapshot>;
}

export function requestWandEditSources(documentId:number):Promise<number[]>{
 return rpc('wand-absent-sources',{documentId,target:1}) as Promise<number[]>;
}
export function changeInventoryWandIdentity(documentId:number,beforeWandIdentity:WandIdentity,nextWandIdentity:WandIdentity):Promise<SaveSnapshot>{
 return rpc('wand-identity-change',{documentId,beforeWandIdentity:[...beforeWandIdentity],nextWandIdentity:[...nextWandIdentity]}) as Promise<SaveSnapshot>;
}
export function requestAbsentWandSources(documentId:number):Promise<number[]>{
 return rpc('wand-absent-sources',{documentId}) as Promise<number[]>;
}
export function requestWandCreationVariants(documentId:number,sourceItemId?:number):Promise<WandVariant[]>{
 return rpc('wand-create-variants',{documentId,itemId:sourceItemId}) as Promise<WandVariant[]>;
}
export function createInventoryWandVariant(documentId:number,beforeWandVariant:WandVariant,nextWandVariant:WandVariant,nextQuantity:number):Promise<SaveSnapshot>{
 return rpc('wand-create',{documentId,beforeWandVariant:[...beforeWandVariant],nextWandVariant:[...nextWandVariant],nextQuantity}) as Promise<SaveSnapshot>;
}

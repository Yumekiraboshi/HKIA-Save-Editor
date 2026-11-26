import {HISTORY_MAX_BYTES,HISTORY_MAX_ROWS,MAX_INVENTORY_DRAFT_PATCHES} from './history-limits';
import {flowerVariantOf,isFlowerVariantWire,furnitureVariantOf,isFurnitureVariantWire} from './inventory-unique';
import {paletteVariantOf,isPaletteVariantWire} from './inventory-palette-display';
import {isCafeVariantWire} from './inventory-cafe-display';
import {isWandVariantWire,wandVariantOf} from './inventory-wand-display';
import {isBobaVariantWire} from './inventory-boba-display';
import {cloneStoredAchievementPatches,type StoredPatch} from './achievement-draft';
import type {InventoryEntry,InventoryPatch} from './worker-client';
export type DraftPatch={id:number;before:string|null;after:string|null};
export type DraftUi={group:string|null;subgroup:string|null};
export type LocalDraft={file:File;patches:DraftPatch[];achievementPatches:StoredPatch[];inventoryPatches:InventoryPatch[];ui:DraftUi;historyCheckpoint:Uint8Array|null};
const DB_NAME='hkia-editor-local-session';
const BASE='source-save';
const EDITS='unsaved-changes';
const KEY='current';
const VERSION=1;
const HISTORY_MAGIC=[72,75,73,65,72,83,48,49]; // HKIAHS01
export function safeHistoryCheckpoint(value:unknown):Uint8Array|null{
 if(!(value instanceof Uint8Array)||value.length<16||value.length>HISTORY_MAX_BYTES||
  HISTORY_MAGIC.some((byte,i)=>value[i]!==byte))return null;
 const view=new DataView(value.buffer,value.byteOffset,value.byteLength);
 const count=view.getUint32(8,true),active=view.getUint32(12,true);
 if(count>HISTORY_MAX_ROWS||active>count)return null;
 return new Uint8Array(value);
}
const isPatch=(p:DraftPatch)=>Number.isInteger(p.id)&&p.id>0&&p.id<=2147483647
 &&(p.before===null||typeof p.before==='string'&&/^-?\d{1,19}$/.test(p.before))
 &&(p.after===null||typeof p.after==='string'&&/^-?\d{1,19}$/.test(p.after));

/** Existing rows and Rust-issued session handles are tracked, never fabricated saved document IDs. */
export function diffInventory(before:readonly InventoryEntry[],after:readonly InventoryEntry[]):InventoryPatch[]{
 const original=new Map(before.map(x=>[x.documentId,x]));
 const result:InventoryPatch[]=[];
 for(const row of after){
  const source=original.get(row.documentId);
  if(source&&source.itemId===row.itemId){
   if(source.quantity!==row.quantity)result.push({documentId:row.documentId,before:source.quantity,after:row.quantity});
   if(source.flower&&row.flower){
    const before=flowerVariantOf(source.flower),after=flowerVariantOf(row.flower);
    if(before.some((x,i)=>x!==after[i]))result.push({documentId:row.documentId,before,after,kind:'flower-variant'});
   }
   const cafeBefore=source.cafe?.variant,cafeAfter=row.cafe?.variant;
   if(cafeBefore&&cafeAfter&&cafeBefore.some((v,i)=>v!==cafeAfter[i]))result.push({documentId:row.documentId,before:cafeBefore,after:cafeAfter,kind:'cafe-variant'});
   const wandBefore=wandVariantOf(source.unique),wandAfter=wandVariantOf(row.unique);
   if(wandBefore&&wandAfter&&wandBefore.some((v,i)=>v!==wandAfter[i]))result.push({documentId:row.documentId,kind:'wand-variant',before:wandBefore,after:wandAfter});
   const bobaBefore=source.boba?.variant,bobaAfter=row.boba?.variant;
   if(bobaBefore&&bobaAfter&&bobaBefore.some((v,i)=>v!==bobaAfter[i]))result.push({documentId:row.documentId,before:bobaBefore,after:bobaAfter,kind:'boba-variant'});
   const paletteBefore=paletteVariantOf(source.unique),paletteAfter=paletteVariantOf(row.unique);
   if(paletteBefore&&paletteAfter&&paletteBefore.some((v,i)=>v!==paletteAfter[i]))result.push({documentId:row.documentId,before:paletteBefore,after:paletteAfter,kind:'palette-variant'});
   const furnitureBefore=furnitureVariantOf(source.unique),furnitureAfter=furnitureVariantOf(row.unique);
   if(furnitureBefore&&furnitureAfter&&furnitureBefore.some((v,i)=>v!==furnitureAfter[i]))result.push({documentId:row.documentId,before:furnitureBefore,after:furnitureAfter,kind:'furniture-variant'});
  }else if(!source&&row.documentId>2147483647&&row.itemId>0&&row.quantity>0&&row.unique?.tag===9&&row.unique.uniqueId===null&&wandVariantOf(row.unique)){
   result.push({documentId:row.documentId,itemId:row.itemId,variant:wandVariantOf(row.unique)!,quantity:row.quantity,kind:'wand-create'});
  }else if(!source&&row.documentId>2147483647&&row.itemId>0&&row.quantity>0&&row.unique?.tag===3&&row.unique.uniqueId===null&&row.cafe){
   result.push({documentId:row.documentId,itemId:row.itemId,variant:row.cafe.variant,quantity:row.quantity,kind:'cafe-create'});
  }else if(!source&&row.documentId>2147483647&&row.itemId>0&&row.quantity>0&&row.unique?.tag===4&&row.unique.uniqueId===null&&row.boba){
   result.push({documentId:row.documentId,itemId:row.itemId,variant:row.boba.variant,quantity:row.quantity,kind:'boba-create'});
  }else if(!source&&row.documentId>2147483647&&row.itemId>0&&row.quantity>0&&row.unique?.tag===6&&row.unique.uniqueId===null&&paletteVariantOf(row.unique)){
   result.push({documentId:row.documentId,itemId:row.itemId,variant:paletteVariantOf(row.unique)!,quantity:row.quantity,kind:'palette-create'});
  }else if(!source&&row.documentId>2147483647&&row.itemId>0&&row.quantity>0&&row.unique?.tag===7&&row.unique.uniqueId===null&&row.flower){
   result.push({documentId:row.documentId,itemId:row.itemId,variant:flowerVariantOf(row.flower),quantity:row.quantity,kind:'flower-create'});
  }else if(!source&&row.documentId>2147483647&&row.itemId>0&&row.quantity>0&&row.unique?.tag===8&&row.unique.uniqueId===null&&furnitureVariantOf(row.unique)){
   result.push({documentId:row.documentId,itemId:row.itemId,variant:furnitureVariantOf(row.unique)!,quantity:row.quantity,kind:'furniture-create'});
  }else if(!source&&row.documentId===2147483648+row.itemId&&row.itemId>0&&row.quantity>0){
   result.push({documentId:row.documentId,before:0,after:row.quantity});
  }
 }
 return result.sort((a,b)=>a.documentId-b.documentId);
}
/** Compare canonical validated net edits, not incidental property order.
 * A unique addition must replay the native checkpoint; a false mismatch
 * cannot safely fall back to the net-only restore path. */
export function inventoryPatchesEqual(a:readonly InventoryPatch[],b:readonly InventoryPatch[]):boolean{
 const canonical=(rows:readonly InventoryPatch[])=>safeInventoryPatches(rows).sort((x,y)=>x.documentId-y.documentId||
  (x.kind??'').localeCompare(y.kind??''));
 return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
}
export function safeInventoryPatches(value:unknown):InventoryPatch[]{
 if(!Array.isArray(value)||value.length>MAX_INVENTORY_DRAFT_PATCHES)throw Error('DRAFT_INVALID');
 const ids=new Set<string>(),result:InventoryPatch[]=[];
 for(const p of value){
  if(!p||typeof p!=='object'||!Number.isInteger(p.documentId)||p.documentId<=0||p.documentId>4294967295||(p.documentId>2147483647&&p.kind!=='flower-create'&&p.kind!=='furniture-create'&&p.kind!=='palette-create'&&p.kind!=='boba-create'&&p.kind!=='cafe-create'&&p.kind!=='wand-create'&&(p.kind!==undefined||p.before!==0||p.after<=0)))throw Error('DRAFT_INVALID');
  const key=p.documentId+':'+(p.kind??'quantity');
  if(ids.has(key))throw Error('DRAFT_INVALID');
  ids.add(key);
  if(p.kind==='wand-create'){
   const variant:unknown=p.variant;
   if(p.documentId<=2147483647||!Number.isInteger(p.itemId)||p.itemId<=0||p.itemId>2147483647||!isWandVariantWire(variant)||!Number.isInteger(p.quantity)||p.quantity<=0||p.quantity>2147483647)throw Error('DRAFT_INVALID');
   result.push({documentId:p.documentId,itemId:p.itemId,variant:[...variant],quantity:p.quantity,kind:'wand-create'});
  }else if(p.kind==='cafe-create'){
   const variant:unknown=p.variant;
   if(p.documentId<=2147483647||!Number.isInteger(p.itemId)||p.itemId<=0||p.itemId>2147483647||!isCafeVariantWire(variant)||!Number.isInteger(p.quantity)||p.quantity<=0||p.quantity>2147483647)throw Error('DRAFT_INVALID');
   result.push({documentId:p.documentId,itemId:p.itemId,variant:[...variant],quantity:p.quantity,kind:'cafe-create'});
  }else if(p.kind==='boba-create'){
   const variant:unknown=p.variant;
   if(p.documentId<=2147483647||!Number.isInteger(p.itemId)||p.itemId<=0||p.itemId>2147483647||!isBobaVariantWire(variant)||!Number.isInteger(p.quantity)||p.quantity<=0||p.quantity>2147483647)throw Error('DRAFT_INVALID');
   result.push({documentId:p.documentId,itemId:p.itemId,variant:[...variant],quantity:p.quantity,kind:'boba-create'});
  }else if(p.kind==='palette-create'){
   const variant:unknown=p.variant;
   if(p.documentId<=2147483647||!Number.isInteger(p.itemId)||p.itemId<=0||p.itemId>2147483647||!isPaletteVariantWire(variant)||!Number.isInteger(p.quantity)||p.quantity<=0||p.quantity>2147483647)throw Error('DRAFT_INVALID');
   result.push({documentId:p.documentId,itemId:p.itemId,variant:[...variant],quantity:p.quantity,kind:'palette-create'});
  }else if(p.kind==='flower-create'){
   const variant:unknown=p.variant;
   if(p.documentId<=2147483647||!Number.isInteger(p.itemId)||p.itemId<=0||p.itemId>2147483647||!isFlowerVariantWire(variant)||!Number.isInteger(p.quantity)||p.quantity<=0||p.quantity>2147483647)throw Error('DRAFT_INVALID');
   result.push({documentId:p.documentId,itemId:p.itemId,variant:[...variant],quantity:p.quantity,kind:'flower-create'});
  }else if(p.kind==='furniture-create'){
   const variant:unknown=p.variant;
   if(p.documentId<=2147483647||!Number.isInteger(p.itemId)||p.itemId<=0||p.itemId>2147483647||!isFurnitureVariantWire(variant)||!Number.isInteger(p.quantity)||p.quantity<=0||p.quantity>2147483647)throw Error('DRAFT_INVALID');
   result.push({documentId:p.documentId,itemId:p.itemId,variant:[...variant],quantity:p.quantity,kind:'furniture-create'});
  }else if(p.kind==='flower-variant'){
   const before:unknown=p.before,after:unknown=p.after;
   if(!isFlowerVariantWire(before)||!isFlowerVariantWire(after)||before.every((v,i)=>v===after[i]))throw Error('DRAFT_INVALID');
   result.push({documentId:p.documentId,kind:p.kind,before:[...before],after:[...after]});
  }else if(p.kind==='cafe-variant'){
   const before:unknown=p.before,after:unknown=p.after;
   if(!isCafeVariantWire(before)||!isCafeVariantWire(after)||before.every((v,i)=>v===after[i]))throw Error('DRAFT_INVALID');
   result.push({documentId:p.documentId,kind:p.kind,before:[...before],after:[...after]});
  }else if(p.kind==='wand-variant'){
   const before:unknown=p.before,after:unknown=p.after;
   if(!isWandVariantWire(before)||!isWandVariantWire(after)||before.every((v,i)=>v===after[i]))throw Error('DRAFT_INVALID');
   result.push({documentId:p.documentId,kind:p.kind,before:[...before],after:[...after]});
  }else if(p.kind==='boba-variant'){
   const before:unknown=p.before,after:unknown=p.after;
   if(!isBobaVariantWire(before)||!isBobaVariantWire(after)||before.every((v,i)=>v===after[i]))throw Error('DRAFT_INVALID');
   result.push({documentId:p.documentId,kind:p.kind,before:[...before],after:[...after]});
  }else if(p.kind==='palette-variant'){
   const before:unknown=p.before,after:unknown=p.after;
   if(!isPaletteVariantWire(before)||!isPaletteVariantWire(after)||before.every((v,i)=>v===after[i]))throw Error('DRAFT_INVALID');
   result.push({documentId:p.documentId,kind:p.kind,before:[...before],after:[...after]});
  }else if(p.kind==='furniture-variant'){
   const before:unknown=p.before,after:unknown=p.after;
   if(!isFurnitureVariantWire(before)||!isFurnitureVariantWire(after)||before.every((v,i)=>v===after[i]))throw Error('DRAFT_INVALID');
   result.push({documentId:p.documentId,kind:p.kind,before:[...before],after:[...after]});
  }else{
   if(p.kind!==undefined||!Number.isInteger(p.before)||!Number.isInteger(p.after)||p.before<0||p.before>2147483647||p.after<0||p.after>2147483647||p.before===p.after)throw Error('DRAFT_INVALID');
   result.push({documentId:p.documentId,before:p.before,after:p.after});
  }
 }
 return result;
}
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
  const state=changes.result as {version?:number;patches?:DraftPatch[];achievementPatches?:unknown;inventoryPatches?:unknown;ui?:DraftUi;historyCheckpoint?:unknown}|undefined;
  const patches=safePatches(state?.patches??[]);
  const achievementPatches=state?.achievementPatches??[];
  if(!Array.isArray(achievementPatches)||achievementPatches.length>10000)throw Error('DRAFT_INVALID');
  const group=typeof state?.ui?.group==='string'&&state.ui.group.length<128?state.ui.group:null;
  const subgroup=typeof state?.ui?.subgroup==='string'&&state.ui.subgroup.length<128?state.ui.subgroup:null;
  return {file:actualFile,patches,achievementPatches:achievementPatches as StoredPatch[],inventoryPatches:safeInventoryPatches(state?.inventoryPatches??[]),ui:{group,subgroup},historyCheckpoint:safeHistoryCheckpoint(state?.historyCheckpoint)};
 }finally{db.close()}
}
export async function saveOriginalLocally(file:File):Promise<void>{
 const db=await openDatabase();
 try{
  const tx=db.transaction([BASE,EDITS],'readwrite');
  const finished=complete(tx);
  tx.objectStore(BASE).put(file,KEY);
  tx.objectStore(EDITS).put({version:VERSION,patches:[],achievementPatches:[],inventoryPatches:[],ui:{group:null,subgroup:null}},KEY);
  await finished;
 }finally{db.close()}
}
export async function saveDraftChanges(patches:DraftPatch[],ui:DraftUi,achievementPatches:StoredPatch[]=[],historyCheckpoint:Uint8Array|null=null,inventoryPatches:InventoryPatch[]=[]):Promise<void>{
 // Svelte $state arrays and their nested GUIDs can be Proxies. IDB.put clones data
 // synchronously and rejects them with DataCloneError, so normalize *all* inputs
 // before opening the transaction. Do not JSON-stringify nanosecond timestamps.
 const savedPatches=safePatches(patches).map(p=>({id:p.id,before:p.before,after:p.after}));
 const savedAchievements=cloneStoredAchievementPatches(achievementPatches);
 const savedInventory=safeInventoryPatches(inventoryPatches);
 const savedUi:DraftUi={group:ui.group,subgroup:ui.subgroup};
 const savedHistory=historyCheckpoint===null?null:safeHistoryCheckpoint(historyCheckpoint);
 if(historyCheckpoint!==null&&!savedHistory)throw Error('HISTORY_CHECKPOINT_INVALID');
 const db=await openDatabase();
 try{
  const tx=db.transaction(EDITS,'readwrite');
  const finished=complete(tx);
  tx.objectStore(EDITS).put({version:VERSION,patches:savedPatches,achievementPatches:savedAchievements,inventoryPatches:savedInventory,ui:savedUi,historyCheckpoint:savedHistory},KEY);
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

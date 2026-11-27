import {HISTORY_MAX_BYTES,MAX_INVENTORY_DRAFT_PATCHES} from './history-limits';
import type {InventoryPatch,InventoryQuantityRequest} from './worker-client';
import {decodeInventoryUnique,decodeFlowerVariants,isFlowerVariantWire,decodeFurnitureVariants,isFurnitureVariantWire,type FurnitureVariant,type FlowerVariant,type InventoryUniqueInfo} from './inventory-unique';
import {decodeInventoryFlowers,type InventoryFlower} from './inventory-flower-display';
import {decodeInventoryPalettes,decodePaletteVariants,isPaletteVariantWire,type InventoryPalette,type PaletteVariant} from './inventory-palette-display';
import {decodeBobaRows,decodeBobaVariants,isBobaVariantWire,type InventoryBoba,type BobaVariant} from './inventory-boba-display';
import {decodeCafeRows,decodeCafeOptions,isCafeVariantWire,type CafeVariant,type CafeRow} from './inventory-cafe-display';
import {decodeWandVariants,isWandVariantWire,type WandVariant} from './inventory-wand-display';
type Action = 'open'|'snapshot'|'change'|'achievement'|'achievement-create'|'achievement-create-parent'|'achievement-parent-create'|'achievement-pair'|'achievement-plan-toggle'|'achievement-auto'|'inventory-change'|'inventory-batch-change'|'flower-variant-change'|'flower-variants'|'flower-preview'|'flower-create'|'flower-create-variants'|'furniture-variants'|'furniture-variant-change'|'furniture-create'|'furniture-create-variants'|'palette-variants'|'palette-preview'|'palette-variant-change'|'palette-create-variants'|'palette-create'|'boba-variants'|'boba-variant-change'|'boba-create-variants'|'boba-create'|'cafe-variants'|'cafe-variant-change'|'cafe-create-variants'|'cafe-create'|'wand-variants'|'wand-variant-change'|'wand-create-variants'|'wand-absent-sources'|'wand-create'|'batch'|'undo'|'redo'|'history-jump'|'history-restore'|'reset'|'export'|'clear';
type AchievementValue = {complete:boolean;current:number;completed:[bigint,number]|null};
type AchievementPatch = {guid:number[];before:AchievementValue;after:AchievementValue};
type AchievementDraftPatch = {guid:number[];before:AchievementValue|null;after:AchievementValue};
type Request = { id:number; action:Action; checkpoint?:Uint8Array; scope?:'collections'|'achievements'|'inventory'; target?:number; file?:Uint8Array; itemId?:number;documentId?:number;beforeQuantity?:number;nextQuantity?:number;quantityBatch?:InventoryQuantityRequest[];beforeVariant?:FlowerVariant;nextVariant?:FlowerVariant;beforeFurnitureVariant?:FurnitureVariant;nextFurnitureVariant?:FurnitureVariant;beforePaletteVariant?:PaletteVariant;nextPaletteVariant?:PaletteVariant;beforeBobaVariant?:BobaVariant;nextBobaVariant?:BobaVariant;beforeCafeVariant?:CafeVariant;nextCafeVariant?:CafeVariant;beforeWandVariant?:WandVariant;nextWandVariant?:WandVariant; expected?:bigint|null; next?:bigint|null; patches?:Array<{id:number;before:bigint|null;after:bigint|null}>;achievementPatches?:AchievementDraftPatch[];inventoryPatches?:InventoryPatch[];guid?:number[];nowMs?:number;beforeValue?:AchievementValue|null;afterValue?:AchievementValue };
type Transport = { postMessage(data:unknown, transfer?:Transferable[]):void; onmessage:((event:MessageEvent<Request>)=>void)|null };
type Engine = {
 memory:WebAssembly.Memory;
 hkia_stage(n:number):number; hkia_open():number;
 hkia_collection_creatable_snapshot():number;
 hkia_inventory_snapshot():number;hkia_inventory_creatable_snapshot():number;hkia_inventory_quantity_bounds():number;hkia_inventory_flowers_snapshot():number;hkia_inventory_palettes_snapshot():number;hkia_inventory_boba_snapshot():number;hkia_inventory_absent_chef_defaults():number;hkia_inventory_wand_variants(id:number):number;hkia_inventory_wand_creation_variants(id:number):number;hkia_inventory_wand_source_creation_variants(id:number,source:number):number;hkia_inventory_absent_wand_ids():number;hkia_inventory_absent_wand_sources(id:number):number;hkia_inventory_wand_create(id:number,...words:number[]):number;hkia_inventory_wand_variant_change(id:number,...words:number[]):number;hkia_inventory_cafe_snapshot():number;hkia_inventory_cafe_variants(id:number):number;hkia_inventory_cafe_creation_variants(id:number):number;hkia_inventory_cafe_create(id:number,...words:number[]):number;hkia_inventory_cafe_variant_change(id:number,...words:number[]):number;hkia_inventory_boba_variants(id:number):number;hkia_inventory_boba_creation_variants(id:number):number;hkia_inventory_boba_create(id:number,...words:number[]):number;hkia_inventory_boba_variant_change(id:number,...words:number[]):number;hkia_inventory_palette_variants(id:number):number;hkia_inventory_palette_preview(id:number,...words:number[]):number;hkia_inventory_palette_creation_variants(id:number):number;hkia_inventory_palette_create(id:number,...words:number[]):number;hkia_inventory_palette_variant_change(id:number,...words:number[]):number;hkia_inventory_unique_snapshot():number;hkia_inventory_flower_variants(id:number):number;hkia_inventory_flower_preview(id:number,...values:[...FlowerVariant,...FlowerVariant]):number;hkia_inventory_absent_flower_ids():number;hkia_inventory_absent_furniture_ids():number;hkia_inventory_default_furniture_ids():number;hkia_inventory_flower_creation_variants(id:number):number;hkia_inventory_flower_create(id:number,...values:[...FlowerVariant,...FlowerVariant,number]):number;hkia_inventory_flower_variant_change(id:number,...values:[...FlowerVariant,...FlowerVariant]):number;hkia_inventory_furniture_variants(id:number):number;hkia_inventory_furniture_creation_variants(id:number):number;hkia_inventory_furniture_create(id:number,...values:[...FurnitureVariant,...FurnitureVariant,number]):number;hkia_inventory_furniture_variant_change(id:number,...values:[...FurnitureVariant,...FurnitureVariant]):number;hkia_inventory_change(id:number,before:number,after:number):number;hkia_inventory_batch_limit():number;hkia_inventory_batch_change():number;
 hkia_change(id:number,expectedPresent:number,old:bigint,nextPresent:number,value:bigint):number;
 hkia_achievement_parent_create(...args:[ number,number,number,number, number, number,number,bigint,number,number, number,number,bigint,number,number, number,number,number,number, number,number,bigint,number,number]):number;
 hkia_achievement_create(g0:number,g1:number,g2:number,g3:number,complete:number,progress:number,seconds:bigint,nanos:number,hasDate:number):number;
 hkia_achievement_create_parent(...args:[
  number,number,number,number,number,number,bigint,number,number,
  number,number,number,number,number,number,bigint,number,number,
  number,number,bigint,number,number
 ]):number;
 hkia_achievement_change(g0:number,g1:number,g2:number,g3:number,bc:number,bp:number,bs:bigint,bn:number,bh:number,ac:number,ap:number,as:bigint,an:number,ah:number):number;
 hkia_achievement_pair_change(
  ...args:[number,number,number,number,number,number,bigint,number,number,number,number,bigint,number,number,
   number,number,number,number,number,number,bigint,number,number,number,number,bigint,number,number]
 ):number;
 hkia_achievement_toggle_plan(g0:number,g1:number,g2:number,g3:number,nowMs:bigint):number;
 hkia_achievement_edit_auto(g0:number,g1:number,g2:number,g3:number,present:number,bc:number,bp:number,bs:bigint,bn:number,bh:number,ac:number,ap:number,as:bigint,an:number,ah:number):number;
 hkia_achievement_goals_snapshot():number;
 hkia_achievement_snapshot():number;
 hkia_counter_snapshot():number;
 hkia_undo():number; hkia_redo():number; hkia_reset():number; hkia_history_snapshot():number; hkia_history_jump(scope:number,target:number):number; hkia_history_checkpoint():number; hkia_history_restore():number;
 hkia_snapshot():number; hkia_export():number; hkia_clear():void;
 hkia_reply_ptr():number; hkia_reply_len():number;
 hkia_output_ptr():number; hkia_output_len():number;
};
const context=self as unknown as Transport;
let engine:Promise<Engine>|null=null;
function getEngine():Promise<Engine>{
 if(!engine){
  engine=(async()=>{
   const response=await fetch(import.meta.env.BASE_URL+'editor.wasm',{cache:'no-cache'});
   if(!response.ok)throw Error('WASMファイルを取得できません。');
   const result=await WebAssembly.instantiate(await response.arrayBuffer(),{});
   return result.instance.exports as unknown as Engine;
  })();
 }
 return engine;
}
function readBytes(e:Engine,p:number,n:number):Uint8Array{
 if(n<0||n>60*1024*1024||p<=0||p+n>e.memory.buffer.byteLength)throw Error('WASM応答が不正です。');
 return new Uint8Array(e.memory.buffer,p,n).slice();
}
function snapshot(e:Engine){
 if(e.hkia_snapshot()!==0)throw Error('先にセーブを読み込んでください。');
 const b=readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len());
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 if(b.byteLength<17)throw Error('セーブ一覧の応答が不正です。');
 const count=v.getUint32(13,true);
 if(count>1_000_000||b.length<17+count*12)throw Error('セーブ一覧の形式が不正です。');
 const end=17+count*12;
 let version=b[0]===1?'3.0.0':b[0]===2?'3.0.1':null;
 if(b[0]===3){
  const n=b[end];
  if(!n||n>24||b.length!==end+1+n)throw Error('セーブ一覧の形式が不正です。');
  const label=new TextDecoder('utf-8',{fatal:true}).decode(b.subarray(end+1));
  const parts=label.split('.');
  if(parts.length!==3||parts.some(p=>!/^[0-9]{1,2}$/.test(p)||(p.length>1&&p.startsWith('0'))||
   Number(p)>99))throw Error('セーブ一覧の形式が不正です。');
  const [major,minor,patch]=parts.map(Number);
  if(major<3||(major===3&&minor===0&&patch<=1))throw Error('セーブ一覧の形式が不正です。');
  version=label;
 }else if(b.length!==end)throw Error('セーブ一覧の形式が不正です。');
 if(!version)throw Error('セーブ一覧の形式が不正です。');
 const entries:Array<[number,bigint]>=[];
 for(let i=0;i<count;i++){const p=17+i*12;entries.push([v.getInt32(p,true),v.getBigInt64(p+4,true)]);}
 if(e.hkia_inventory_snapshot()!==0)throw Error('INVENTORY_SNAPSHOT_FAILED');
 const bytesInv=readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len());
 if(bytesInv.length<4)throw Error('INVENTORY_SNAPSHOT_INVALID');
 const iv=new DataView(bytesInv.buffer,bytesInv.byteOffset,bytesInv.byteLength);
 const countInv=iv.getUint32(0,true);
 if(countInv>1_000_000||bytesInv.length!==4+countInv*16)throw Error('INVENTORY_SNAPSHOT_INVALID');
 const inventory:Array<{documentId:number;itemId:number;quantity:number;editable:boolean;quantityLimit:number|null;quantityMinimum:number;flowerCreatable?:boolean;furnitureCreatable?:boolean;wandCreatableStyle?:number;flower?:InventoryFlower;palette?:InventoryPalette;boba?:InventoryBoba;cafe?:CafeRow;unique?:InventoryUniqueInfo}>=[];
 const docIds=new Set<number>();
 for(let i=0;i<countInv;i++){
  const at=4+i*16,documentId=iv.getUint32(at,true),itemId=iv.getInt32(at+4,true),
   quantity=iv.getInt32(at+8,true),editable=iv.getUint32(at+12,true);
  if(docIds.has(documentId)||editable>1)throw Error('INVENTORY_SNAPSHOT_INVALID');
  docIds.add(documentId);
  inventory.push({documentId,itemId,quantity,editable:editable===1,quantityLimit:null,quantityMinimum:1});
 }
 if(e.hkia_inventory_quantity_bounds()!==0)throw Error('INVENTORY_SNAPSHOT_FAILED');
 const boundsBytes=readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len());
 if(boundsBytes.length<4)throw Error('INVENTORY_SNAPSHOT_INVALID');
 const bv=new DataView(boundsBytes.buffer,boundsBytes.byteOffset,boundsBytes.byteLength);
 const boundCount=bv.getUint32(0,true),editableRows=new Map(inventory.filter(row=>row.editable).map(row=>[row.documentId,row]));
 if(boundCount!==editableRows.size||boundsBytes.length!==4+12*boundCount)throw Error('INVENTORY_SNAPSHOT_INVALID');
 for(let i=0;i<boundCount;i++){
  const p=4+i*12,id=bv.getUint32(p,true),minimum=bv.getInt32(p+4,true),cap=bv.getInt32(p+8,true);
  const row=editableRows.get(id);
  if(!row||(minimum!==0&&minimum!==1)||cap<1)throw Error('INVENTORY_SNAPSHOT_INVALID');
  row.quantityLimit=cap;row.quantityMinimum=minimum;editableRows.delete(id);
 }
 if(editableRows.size!==0)throw Error('INVENTORY_SNAPSHOT_INVALID');
 if(e.hkia_inventory_default_furniture_ids()!==0)throw Error('INVENTORY_SNAPSHOT_INVALID');
 const defaultBytes=readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len());
 if(defaultBytes.length<4)throw Error('INVENTORY_SNAPSHOT_INVALID');
 const defaultView=new DataView(defaultBytes.buffer,defaultBytes.byteOffset,defaultBytes.byteLength),defaultCount=defaultView.getUint32(0,true);
 if(defaultCount>inventory.length||defaultBytes.length!==4+defaultCount*4)throw Error('INVENTORY_SNAPSHOT_INVALID');
 const defaultRows=new Map(inventory.map(row=>[row.documentId,row]));
 for(let i=0;i<defaultCount;i++){
  const id=defaultView.getUint32(4+4*i,true),row=defaultRows.get(id);
  if(!row||row.furnitureCreatable)throw Error('INVENTORY_SNAPSHOT_INVALID');
  row.furnitureCreatable=true;
 }
 if(e.hkia_inventory_creatable_snapshot()!==0)throw Error('INVENTORY_SNAPSHOT_FAILED');
 const cb=readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len());
 if(cb.length<4)throw Error('INVENTORY_SNAPSHOT_INVALID');
 const cv=new DataView(cb.buffer,cb.byteOffset,cb.byteLength),cn=cv.getUint32(0,true);
 if(cn>12163||cb.length!==4+12*cn)throw Error('INVENTORY_SNAPSHOT_INVALID');
 const inventoryCreatable:typeof inventory=[],candidateIds=new Set<number>();
 for(let i=0;i<cn;i++){
  const p=4+i*12,documentId=cv.getUint32(p,true),itemId=cv.getInt32(p+4,true),cap=cv.getInt32(p+8,true);
  if(itemId<=0||documentId!==2147483648+itemId||cap<1||docIds.has(documentId)||candidateIds.has(documentId))throw Error('INVENTORY_SNAPSHOT_INVALID');
  candidateIds.add(documentId);
  inventoryCreatable.push({documentId,itemId,quantity:0,editable:true,quantityLimit:cap,quantityMinimum:1});
 }
 if(e.hkia_inventory_absent_furniture_ids()!==0)throw Error('INVENTORY_SNAPSHOT_INVALID');
 const furnitureBytes=readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len());
 if(furnitureBytes.length<4)throw Error('INVENTORY_SNAPSHOT_INVALID');
 const furnitureView=new DataView(furnitureBytes.buffer,furnitureBytes.byteOffset,furnitureBytes.byteLength),furnitureCount=furnitureView.getUint32(0,true);
 if(furnitureCount>cn||furnitureBytes.length!==4+4*furnitureCount)throw Error('INVENTORY_SNAPSHOT_INVALID');
 const furnitureCandidates=new Map(inventoryCreatable.map(row=>[row.itemId,row]));
 for(let i=0;i<furnitureCount;i++){
  const itemId=furnitureView.getInt32(4+4*i,true),row=furnitureCandidates.get(itemId);
  if(!row||row.furnitureCreatable)throw Error('INVENTORY_SNAPSHOT_INVALID');
  row.furnitureCreatable=true;
 }
 if(e.hkia_inventory_absent_flower_ids()!==0)throw Error('INVENTORY_SNAPSHOT_INVALID');
 const fb=readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len());
 if(fb.length<4)throw Error('INVENTORY_SNAPSHOT_INVALID');
 const fv=new DataView(fb.buffer,fb.byteOffset,fb.byteLength),fn=fv.getUint32(0,true);
 if(fn>12163||fb.length!==4+fn*4)throw Error('INVENTORY_SNAPSHOT_INVALID');
 for(let i=0;i<fn;i++){
  const itemId=fv.getInt32(4+i*4,true),documentId=2147483648+itemId;
  if(itemId<=0||docIds.has(documentId)||candidateIds.has(documentId))throw Error('INVENTORY_SNAPSHOT_INVALID');
  candidateIds.add(documentId);
  inventoryCreatable.push({documentId,itemId,quantity:0,editable:false,quantityLimit:null,quantityMinimum:1,flowerCreatable:true});
 }
 if(e.hkia_inventory_absent_wand_ids()!==0)throw Error('INVENTORY_SNAPSHOT_INVALID');
 const wb=readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len());
 if(wb.length<4)throw Error('INVENTORY_SNAPSHOT_INVALID');
 const wv=new DataView(wb.buffer,wb.byteOffset,wb.byteLength),wn=wv.getUint32(0,true);
 if(wn>8||wb.length!==4+wn*8)throw Error('INVENTORY_SNAPSHOT_INVALID');
 for(let i=0;i<wn;i++){
  const itemId=wv.getInt32(4+i*8,true),style=wv.getInt32(8+i*8,true),documentId=2147483648+itemId;
  if(itemId<=0||style<0||docIds.has(documentId)||candidateIds.has(documentId))throw Error('INVENTORY_SNAPSHOT_INVALID');
  candidateIds.add(documentId);
  inventoryCreatable.push({documentId,itemId,quantity:0,editable:false,quantityLimit:null,quantityMinimum:1,wandCreatableStyle:style});
 }
 if(e.hkia_inventory_flowers_snapshot()!==0)throw Error('FLOWER_SNAPSHOT_FAILED');
 const flowerRows=decodeInventoryFlowers(readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len()),docIds);
 for(const row of inventory){const flower=flowerRows.get(row.documentId);if(flower)row.flower=flower;}
 if(e.hkia_inventory_palettes_snapshot()!==0)throw Error('PALETTE_SNAPSHOT_FAILED');
 const paletteRows=decodeInventoryPalettes(readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len()),docIds);
 for(const row of inventory){const palette=paletteRows.get(row.documentId);if(palette)row.palette=palette;}
 if(e.hkia_inventory_unique_snapshot()!==0)throw Error('INVENTORY_UNIQUE_INVALID');
 const uniqueRows=decodeInventoryUnique(readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len()),docIds);
 for(const row of inventory)row.unique=uniqueRows.get(row.documentId);
 if(e.hkia_inventory_cafe_snapshot()!==0)throw Error('CAFE_SNAPSHOT_FAILED');
 const cafeData=decodeCafeRows(readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len()),docIds);
 for(const row of inventory){const cafe=cafeData.rows.get(row.documentId);if(cafe)row.cafe=cafe;}
 if(e.hkia_inventory_boba_snapshot()!==0)throw Error('BOBA_SNAPSHOT_FAILED');
 const bobaData=decodeBobaRows(readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len()),docIds);
 for(const row of inventory){const boba=bobaData.rows.get(row.documentId);if(boba)row.boba=boba;}
 if(e.hkia_inventory_absent_chef_defaults()!==0)throw Error('INVENTORY_SNAPSHOT_INVALID');
 const chb=readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len());
 if(chb.length<8)throw Error('INVENTORY_SNAPSHOT_INVALID');
 const chv=new DataView(chb.buffer,chb.byteOffset,chb.byteLength),bn=chv.getUint32(0,true);
 if(bn>1||chb.length<8+24*bn)throw Error('INVENTORY_SNAPSHOT_INVALID');
 if(bn===1){
  const itemId=chv.getInt32(4,true),documentId=2147483648+itemId;
  if(itemId<=0||docIds.has(documentId)||candidateIds.has(documentId))throw Error('INVENTORY_SNAPSHOT_INVALID');
  const variant=Array.from({length:5},(_,i)=>chv.getInt32(8+i*4,true)) as BobaVariant;
  candidateIds.add(documentId);
  inventoryCreatable.push({documentId,itemId,quantity:0,editable:false,quantityLimit:null,quantityMinimum:1,boba:{variant,editable:true,creationOnly:true}});
 }
 const chStart=4+24*bn,chn=chv.getUint32(chStart,true);
 if(chn>9||chb.length!==chStart+4+28*chn)throw Error('INVENTORY_SNAPSHOT_INVALID');
 for(let i=0;i<chn;i++){
  const at=chStart+4+i*28,itemId=chv.getInt32(at,true),documentId=2147483648+itemId;
  if(itemId<=0||docIds.has(documentId)||candidateIds.has(documentId))throw Error('INVENTORY_SNAPSHOT_INVALID');
  const variant=Array.from({length:6},(_,j)=>chv.getInt32(at+4+j*4,true)) as CafeVariant;
  candidateIds.add(documentId);
  inventoryCreatable.push({documentId,itemId,quantity:0,editable:false,quantityLimit:null,quantityMinimum:1,cafe:{variant,editable:true,creationOnly:true}});
 }
 if(e.hkia_achievement_snapshot()!==0)throw Error('実績の取得に失敗しました。');
 const a=readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len());
 if(a.byteLength<4)throw Error('実績データの形式が不正です。');
 const d=new DataView(a.buffer,a.byteOffset,a.byteLength);
 const total=d.getUint32(0,true);
 if(total>100000||a.length!==4+total*34)throw Error('実績データの形式が不正です。');
 const achievements:Array<{guid:[number,number,number,number];value:AchievementValue}>=[];
 for(let i=0;i<total;i++){
  const p=4+i*34;
  const guid:[number,number,number,number]=[d.getUint32(p,true),d.getUint32(p+4,true),d.getUint32(p+8,true),d.getUint32(p+12,true)];
  const complete=a[p+16]===1;
  const current=d.getFloat32(p+17,true);
  const hasDate=a[p+21];
  if(a[p+16]>1||hasDate>1)throw Error('実績データの形式が不正です。');
  const completed=hasDate===1?[d.getBigInt64(p+22,true),d.getUint32(p+30,true)] as [bigint,number]:null;
  achievements.push({guid,value:{complete,current,completed}});
 }
 if(e.hkia_achievement_goals_snapshot()!==0)throw Error('ACH_GOALS_FAILED');
 const goalsBytes=readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len());
 if(goalsBytes.length<4)throw Error('ACH_GOALS_INVALID');
 const gv=new DataView(goalsBytes.buffer,goalsBytes.byteOffset,goalsBytes.byteLength);
 const goalCount=gv.getUint32(0,true);
 if(goalCount>820||goalsBytes.length!==4+goalCount*20||
  (version==='3.0.1'?goalCount!==820:goalCount!==0))throw Error('ACH_GOALS_INVALID');
 const achievementGoals:Array<[string,number]>=[];
 let lastGoalKey='';
 for(let i=0;i<goalCount;i++){
  const at=4+i*20;
  const words=[gv.getUint32(at,true),gv.getUint32(at+4,true),
   gv.getUint32(at+8,true),gv.getUint32(at+12,true)];
  const key=words.map(w=>w.toString(16).padStart(8,'0')).join(':');
  const goal=gv.getFloat32(at+16,true);
  if(!Number.isSafeInteger(goal)||goal<=0||goal>1_000_000||
   (i>0&&key<=lastGoalKey))throw Error('ACH_GOALS_INVALID');
  achievementGoals.push([key,goal]);
  lastGoalKey=key;
 }
 if(e.hkia_counter_snapshot()!==0)throw Error('COUNTER_SNAPSHOT_FAILED');
 const raw=readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len());
 if(raw.length<4)throw Error('COUNTER_SNAPSHOT_INVALID');
 const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);
 const counterCount=view.getUint32(0,true);
 if(counterCount>100000||raw.length!==4+counterCount*28)throw Error('COUNTER_SNAPSHOT_INVALID');
 const counters:Array<{guid:[number,number,number,number];current:number;countedValues:number|null;countedGuids:number}>=[];
 for(let i=0;i<counterCount;i++){
  const offset=4+i*28;
  const guid:[number,number,number,number]=[view.getUint32(offset,true),view.getUint32(offset+4,true),view.getUint32(offset+8,true),view.getUint32(offset+12,true)];
  const current=view.getFloat32(offset+16,true),countedValues=view.getInt32(offset+20,true),countedGuids=view.getUint32(offset+24,true);
  if(!Number.isFinite(current)||countedValues< -1||countedGuids>1000000)throw Error('COUNTER_SNAPSHOT_INVALID');
  counters.push({guid,current,countedValues:countedValues===-1?null:countedValues,countedGuids});
 }
 if(e.hkia_history_snapshot()!==0)throw Error('HISTORY_SNAPSHOT_FAILED');
 const h=readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len());
 if(h.length<4)throw Error('HISTORY_SNAPSHOT_INVALID');
 const historyCount=new DataView(h.buffer,h.byteOffset,h.byteLength).getUint32(0,true);
 if(historyCount>512||h.length!==4+historyCount*23)throw Error('HISTORY_SNAPSHOT_INVALID');
 const history:Array<{
  scope:'collections'|'achievements'|'inventory';applied:boolean;paired:boolean;
  itemId:number|null;guid:[number,number,number,number]|null
 }>=[];
 const hv=new DataView(h.buffer,h.byteOffset,h.byteLength);
 for(let i=0;i<historyCount;i++){
  const offset=4+i*23,scope=h[offset],applied=h[offset+1],paired=h[offset+2];
  if(scope>2||applied>1||paired>1)throw Error('HISTORY_SNAPSHOT_INVALID');
  const itemId=scope===2?hv.getUint32(offset+3,true):hv.getInt32(offset+3,true);
  const guid:[number,number,number,number]=[
   hv.getUint32(offset+7,true),hv.getUint32(offset+11,true),
   hv.getUint32(offset+15,true),hv.getUint32(offset+19,true)
  ];
  if(scope!==1&&itemId<=0)throw Error('HISTORY_SNAPSHOT_INVALID');
  history.push({scope:scope===0?'collections':scope===1?'achievements':'inventory',
   applied:applied===1,paired:paired===1,
   itemId:scope!==1?itemId:null,guid:scope===1?guid:null});
 }
 // A large legacy session may exceed the bounded replay limit.
 // Keep edits and net-diff autosave functional instead of failing snapshot().
 let checkpoint:Uint8Array|null=null;
 if(e.hkia_history_checkpoint()===0){
  const saved=readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len());
  if(saved.length>=16&&saved.length<=HISTORY_MAX_BYTES)checkpoint=saved;
 }
 if(e.hkia_collection_creatable_snapshot()!==0)throw Error('COLLECTION_ELIGIBILITY_FAILED');
 const eligible=readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len());
 if(eligible.length<4)throw Error('COLLECTION_ELIGIBILITY_INVALID');
 const ev=new DataView(eligible.buffer,eligible.byteOffset,eligible.byteLength);
 const eligibleCount=ev.getUint32(0,true);
 if(eligibleCount>100_000||eligible.length!==4+eligibleCount*4)throw Error('COLLECTION_ELIGIBILITY_INVALID');
 const eligibleCollectionHistoryIds:number[]=[];
 let lastId=0;
 for(let i=0;i<eligibleCount;i++){
  const id=ev.getInt32(4+i*4,true);
  if(id<=0||id>=2147483647||id===lastId)throw Error('COLLECTION_ELIGIBILITY_INVALID');
  eligibleCollectionHistoryIds.push(id);
  lastId=id;
 }
 return {version,zip:(b[1]&1)!==0,membershipEdit:(b[1]&2)!==0,dirty:b[2]===1,canUndo:b[3]===1,canRedo:b[4]===1,revision:v.getUint32(5,true),bytes:v.getUint32(9,true),entries,inventory,inventoryCreatable,inventoryBatchLimit:e.hkia_inventory_batch_limit(),bobaWitnesses:bobaData.witnesses,cafeWitnesses:cafeData.witnesses,achievements,counters,history,historyCheckpoint:checkpoint,eligibleCollectionHistoryIds,achievementGoals};
}
function validAchievement(v:AchievementValue):boolean{
 return !!v&&typeof v.complete==='boolean'&&typeof v.current==='number'&&Number.isFinite(v.current)&&v.current>=0&&
 (v.completed===null||(Array.isArray(v.completed)&&v.completed.length===2&&typeof v.completed[0]==='bigint'&&
 v.completed[0]>=0n&&v.completed[0]<=253402300799n&&Number.isInteger(v.completed[1])&&v.completed[1]>=0&&v.completed[1]<1_000_000_000&&v.completed[1]%100===0));
}
function changeAchievement(e:Engine,guid:number[]|undefined,before:AchievementValue|null|undefined,after:AchievementValue|undefined):boolean{
 if(!Array.isArray(guid)||guid.length!==4||guid.some(n=>!Number.isInteger(n)||n<0||n>0xffffffff)||!before||!after||!validAchievement(before)||!validAchievement(after))return false;
 return e.hkia_achievement_change(...guid as [number,number,number,number],Number(before.complete),before.current,before.completed?.[0]??0n,before.completed?.[1]??0,Number(before.completed!==null),Number(after.complete),after.current,after.completed?.[0]??0n,after.completed?.[1]??0,Number(after.completed!==null))===0;
}
type CreationArgs=[number,number,number,number,number,number,bigint,number,number];
function createArgs(guid:number[]|undefined,after:AchievementValue|undefined):CreationArgs{
 if(!Array.isArray(guid)||guid.length!==4||guid.some(n=>!Number.isInteger(n)||n<0||n>0xffffffff)||
  !after||!validAchievement(after))throw Error('ACH_CREATE_INVALID');
 return [guid[0],guid[1],guid[2],guid[3],Number(after.complete),after.current,
  after.completed?.[0]??0n,after.completed?.[1]??0,Number(after.completed!==null)];
}
type ChangeArgs=[number,number,number,number,number,number,bigint,number,number,number,number,bigint,number,number];
function patchArgs(p:AchievementPatch):ChangeArgs{
 const {guid,before,after}=p;
 if(!Array.isArray(guid)||guid.length!==4||guid.some(n=>!Number.isInteger(n)||n<0||n>0xffffffff)||
  !validAchievement(before)||!validAchievement(after))
  throw Error('ACH_PAIR_INVALID');
 return [guid[0],guid[1],guid[2],guid[3],
  Number(before.complete),before.current,before.completed?.[0]??0n,before.completed?.[1]??0,Number(before.completed!==null),
  Number(after.complete),after.current,after.completed?.[0]??0n,after.completed?.[1]??0,Number(after.completed!==null)];
}
async function execute(r:Request):Promise<unknown>{
 const e=await getEngine();
 switch(r.action){
  case 'open':{
   const b=r.file;
   if(!(b instanceof Uint8Array)||b.length<1||b.length>60*1024*1024)throw Error('対応するセーブファイルを選択してください（最大60MB）。');
   e.hkia_clear();
   const p=e.hkia_stage(b.length);
   if(p===0||p+b.length>e.memory.buffer.byteLength)throw Error('セーブ読み込み用の領域を確保できません。');
   new Uint8Array(e.memory.buffer,p,b.length).set(b);
   if(e.hkia_open()!==0)throw Error('対応セーブではありません。形式、ゲームバージョン、破損の有無を確認してください。');
   return snapshot(e);
  }
  case 'snapshot':return snapshot(e);
  case 'change':{
   if(typeof r.itemId!=='number'||!Number.isInteger(r.itemId)||r.itemId<=0||r.itemId>2147483647)throw Error('ItemIdが不正です。');
   const a=r.expected??null,b=r.next??null;
   if(e.hkia_change(r.itemId,a===null?0:1,a??0n,b===null?0:1,b??0n)!==0)throw Error('変更できませんでした。元の値か編集条件が一致しません。');
   return snapshot(e);
  }
  case 'flower-variants':{
   const id=r.documentId;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295)throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_flower_variants(id)!==0)throw Error('INVENTORY_CONFLICT');
   return decodeFlowerVariants(readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len()));
  }
  case 'flower-preview':{
   const id=r.documentId,before=r.beforeVariant,next=r.nextVariant;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295||!isFlowerVariantWire(before)||!isFlowerVariantWire(next))throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_flower_preview(id,...before,...next)!==0)throw Error('INVENTORY_CONFLICT');
   const bytes=readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len());
   if(bytes.length<8)throw Error('INVENTORY_INVALID');
   const flag=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0,true);
   if(flag>1)throw Error('INVENTORY_INVALID');
   return {options:decodeFlowerVariants(bytes.subarray(4)),creatable:flag===1};
  }
  case 'flower-create-variants':{
   const id=r.documentId;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295)throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_flower_creation_variants(id)!==0)throw Error('INVENTORY_CONFLICT');
   return decodeFlowerVariants(readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len()));
  }
  case 'flower-create':{
   const id=r.documentId,before=r.beforeVariant,next=r.nextVariant,quantity=r.nextQuantity;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295||!isFlowerVariantWire(before)||!isFlowerVariantWire(next)||quantity===undefined||!Number.isInteger(quantity)||quantity<1||quantity>2147483647)throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_flower_create(id,...before,...next,quantity)!==0)throw Error('INVENTORY_CONFLICT');
   return snapshot(e);
  }
  case 'flower-variant-change':{
   const id=r.documentId,before=r.beforeVariant,next=r.nextVariant;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295||!isFlowerVariantWire(before)||!isFlowerVariantWire(next))throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_flower_variant_change(id,...before,...next)!==0)throw Error('INVENTORY_CONFLICT');
   return snapshot(e);
  }
  case 'furniture-create-variants':{
   const id=r.documentId;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295)throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_furniture_creation_variants(id)!==0)throw Error('INVENTORY_CONFLICT');
   return decodeFurnitureVariants(readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len()));
  }
  case 'furniture-create':{
   const id=r.documentId,before=r.beforeFurnitureVariant,next=r.nextFurnitureVariant,quantity=r.nextQuantity;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295||!isFurnitureVariantWire(before)||!isFurnitureVariantWire(next)||quantity===undefined||!Number.isInteger(quantity)||quantity<1||quantity>2147483647)throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_furniture_create(id,...before,...next,quantity)!==0)throw Error('INVENTORY_CONFLICT');
   return snapshot(e);
  }
  case 'palette-preview':{
   const id=r.documentId,before=r.beforePaletteVariant,next=r.nextPaletteVariant;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295||!isPaletteVariantWire(before)||!isPaletteVariantWire(next))throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_palette_preview(id,...before,...next)!==0)throw Error('INVENTORY_CONFLICT');
   const bytes=readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len());
   if(bytes.length<8)throw Error('INVENTORY_INVALID');
   const flag=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0,true);
   if(flag>1)throw Error('INVENTORY_INVALID');
   return {options:decodePaletteVariants(bytes.subarray(4)),creatable:flag===1};
  }
  case 'palette-create-variants':{
   const id=r.documentId;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295)throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_palette_creation_variants(id)!==0)throw Error('INVENTORY_CONFLICT');
   return decodePaletteVariants(readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len()));
  }
  case 'palette-create':{
   const id=r.documentId,before=r.beforePaletteVariant,next=r.nextPaletteVariant,quantity=r.nextQuantity;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295||!isPaletteVariantWire(before)||!isPaletteVariantWire(next)||quantity===undefined||!Number.isInteger(quantity)||quantity<1||quantity>2147483647)throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_palette_create(id,...before,...next,quantity)!==0)throw Error('INVENTORY_CONFLICT');
   return snapshot(e);
  }
  case 'cafe-create-variants':{
   const id=r.documentId;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295)throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_cafe_creation_variants(id)!==0)throw Error('INVENTORY_CONFLICT');
   return decodeCafeOptions(readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len()));
  }
  case 'cafe-create':{
   const id=r.documentId,before=r.beforeCafeVariant,next=r.nextCafeVariant,quantity=r.nextQuantity;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295||!isCafeVariantWire(before)||!isCafeVariantWire(next)||quantity===undefined||!Number.isInteger(quantity)||quantity<1||quantity>2147483647)throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_cafe_create(id,...before,...next,quantity)!==0)throw Error('INVENTORY_CONFLICT');
   return snapshot(e);
  }
  case 'cafe-variants':{
   const id=r.documentId;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295)throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_cafe_variants(id)!==0)throw Error('INVENTORY_CONFLICT');
   return decodeCafeOptions(readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len()));
  }
  case 'cafe-variant-change':{
   const id=r.documentId,before=r.beforeCafeVariant,next=r.nextCafeVariant;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295||!isCafeVariantWire(before)||!isCafeVariantWire(next))throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_cafe_variant_change(id,...before,...next)!==0)throw Error('INVENTORY_CONFLICT');
   return snapshot(e);
  }
  case 'boba-create-variants':{
   const id=r.documentId;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295)throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_boba_creation_variants(id)!==0)throw Error('INVENTORY_CONFLICT');
   return decodeBobaVariants(readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len()));
  }
  case 'boba-create':{
   const id=r.documentId,before=r.beforeBobaVariant,next=r.nextBobaVariant,quantity=r.nextQuantity;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295||!isBobaVariantWire(before)||!isBobaVariantWire(next)||quantity===undefined||!Number.isInteger(quantity)||quantity<1||quantity>2147483647)throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_boba_create(id,...before,...next,quantity)!==0)throw Error('INVENTORY_CONFLICT');
   return snapshot(e);
  }
  case 'wand-absent-sources':{
   const id=r.documentId;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295)throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_absent_wand_sources(id)!==0)throw Error('INVENTORY_CONFLICT');
   const bytes=readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len());
   if(bytes.length<4)throw Error('INVENTORY_SNAPSHOT_INVALID');
   const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),count=view.getUint32(0,true);
   if(count>12163||bytes.length!==4+count*4)throw Error('INVENTORY_SNAPSHOT_INVALID');
   const rows=Array.from({length:count},(_,i)=>view.getInt32(4+i*4,true));
   if(rows.some((source,i)=>source<=0||(i>0&&source<=rows[i-1])))throw Error('INVENTORY_SNAPSHOT_INVALID');
   return rows;
  }
  case 'wand-create-variants':{
   const id=r.documentId;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295)throw Error('INVENTORY_INVALID');
   const source=r.itemId;
   if(source!==undefined&&(!Number.isInteger(source)||source<=0||source>2147483647))throw Error('INVENTORY_INVALID');
   if((source===undefined?e.hkia_inventory_wand_creation_variants(id):e.hkia_inventory_wand_source_creation_variants(id,source))!==0)throw Error('INVENTORY_CONFLICT');
   return decodeWandVariants(readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len()));
  }
  case 'wand-create':{
   const id=r.documentId,before=r.beforeWandVariant,next=r.nextWandVariant,quantity=r.nextQuantity;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295||!isWandVariantWire(before)||!isWandVariantWire(next)||quantity===undefined||!Number.isInteger(quantity)||quantity<1||quantity>2147483647)throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_wand_create(id,...before,...next,quantity)!==0)throw Error('INVENTORY_CONFLICT');
   return snapshot(e);
  }
  case 'wand-variants':{
   const id=r.documentId;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295)throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_wand_variants(id)!==0)throw Error('INVENTORY_CONFLICT');
   return decodeWandVariants(readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len()));
  }
  case 'wand-variant-change':{
   const id=r.documentId,before=r.beforeWandVariant,next=r.nextWandVariant;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295||!isWandVariantWire(before)||!isWandVariantWire(next))throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_wand_variant_change(id,...before,...next)!==0)throw Error('INVENTORY_CONFLICT');
   return snapshot(e);
  }
  case 'boba-variants':{
   const id=r.documentId;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295)throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_boba_variants(id)!==0)throw Error('INVENTORY_CONFLICT');
   return decodeBobaVariants(readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len()));
  }
  case 'boba-variant-change':{
   const id=r.documentId,before=r.beforeBobaVariant,next=r.nextBobaVariant;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295||!isBobaVariantWire(before)||!isBobaVariantWire(next))throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_boba_variant_change(id,...before,...next)!==0)throw Error('INVENTORY_CONFLICT');
   return snapshot(e);
  }
  case 'palette-variants':{
   const id=r.documentId;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295)throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_palette_variants(id)!==0)throw Error('INVENTORY_CONFLICT');
   return decodePaletteVariants(readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len()));
  }
  case 'palette-variant-change':{
   const id=r.documentId,before=r.beforePaletteVariant,next=r.nextPaletteVariant;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295||!isPaletteVariantWire(before)||!isPaletteVariantWire(next))throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_palette_variant_change(id,...before,...next)!==0)throw Error('INVENTORY_CONFLICT');
   return snapshot(e);
  }
  case 'furniture-variants':{
   const id=r.documentId;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295)throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_furniture_variants(id)!==0)throw Error('INVENTORY_CONFLICT');
   return decodeFurnitureVariants(readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len()));
  }
  case 'furniture-variant-change':{
   const id=r.documentId,before=r.beforeFurnitureVariant,next=r.nextFurnitureVariant;
   if(id===undefined||!Number.isInteger(id)||id<1||id>4294967295||!isFurnitureVariantWire(before)||!isFurnitureVariantWire(next))throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_furniture_variant_change(id,...before,...next)!==0)throw Error('INVENTORY_CONFLICT');
   return snapshot(e);
  }
  case 'inventory-batch-change':{
   const rows=r.quantityBatch;
   if(!Array.isArray(rows)||rows.length<1||rows.length>e.hkia_inventory_batch_limit()||
    rows.some(row=>!Array.isArray(row)||row.length!==3||row.some((n,i)=>!Number.isInteger(n)||n<(i===0?1:0)||n>(i===0?4294967295:2147483647))))
    throw Error('INVENTORY_INVALID');
   const len=rows.length*12,p=e.hkia_stage(len);
   if(!p||p+len>e.memory.buffer.byteLength)throw Error('INVENTORY_INVALID');
   const view=new DataView(e.memory.buffer,p,len);
   rows.forEach((row,i)=>{view.setUint32(i*12,row[0],true);view.setInt32(i*12+4,row[1],true);view.setInt32(i*12+8,row[2],true)});
   if(e.hkia_inventory_batch_change()!==0)throw Error('INVENTORY_CONFLICT');
   return snapshot(e);
  }
  case 'inventory-change':{
   const id=r.documentId,before=r.beforeQuantity,next=r.nextQuantity;
   if(!Number.isInteger(id)||id===undefined||id<1||id>4294967295||
    !Number.isInteger(before)||before===undefined||before<0||before>2147483647||
    !Number.isInteger(next)||next===undefined||next<0||next>2147483647)
    throw Error('INVENTORY_INVALID');
   if(e.hkia_inventory_change(id,before,next)!==0)throw Error('INVENTORY_CONFLICT');
   return snapshot(e);
  }
  case 'achievement-plan-toggle':{
   const guid=r.guid,nowMs=r.nowMs;
   if(!Array.isArray(guid)||guid.length!==4||
    guid.some(n=>!Number.isInteger(n)||n<0||n>0xffffffff)||
    typeof nowMs!=='number'||!Number.isSafeInteger(nowMs)||
    nowMs<0||nowMs>253402300799000)throw Error('ACH_TOGGLE_INVALID');
   if(e.hkia_achievement_toggle_plan(...guid as [number,number,number,number],BigInt(nowMs))!==0)
    throw Error('ACH_TOGGLE_UNSUPPORTED');
   const b=readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len());
   if(b.length!==18||b[0]>1||b[5]>1)throw Error('ACH_TOGGLE_RESPONSE_INVALID');
   const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
   const value:AchievementValue={
    complete:b[0]===1,current:v.getFloat32(1,true),
    completed:b[5]===1?[v.getBigInt64(6,true),v.getUint32(14,true)]:null
   };
   if(!validAchievement(value))throw Error('ACH_TOGGLE_RESPONSE_INVALID');
   return value;
  }
  case 'achievement-auto':{
   const guid=r.guid, before=r.beforeValue, after=r.afterValue;
   if(!Array.isArray(guid)||guid.length!==4||
    guid.some(x=>!Number.isInteger(x)||x<0||x>0xffffffff)||
    !(before===null||validAchievement(before as AchievementValue))||
    !validAchievement(after as AchievementValue))throw Error('ACH_AUTO_INVALID');
   if(before===undefined||after===undefined)throw Error('ACH_AUTO_INVALID');
   if(e.hkia_achievement_edit_auto(
    ...guid as [number,number,number,number],
    Number(before!==null),Number(before?.complete??false),before?.current??0,
    before?.completed?.[0]??0n,before?.completed?.[1]??0,Number(before!==null&&before.completed!==null),
    Number(after.complete),after.current,after.completed?.[0]??0n,
    after.completed?.[1]??0,Number(after.completed!==null)
   )!==0)throw Error('ACH_AUTO_CONFLICT');
   return snapshot(e);
  }
  case 'achievement':{
   if(!changeAchievement(e,r.guid,r.beforeValue,r.afterValue))throw Error('実績を変更できませんでした。編集条件を確認してください。');
   return snapshot(e);
  }
  case 'achievement-create':{
   const args=createArgs(r.guid,r.afterValue);
   if(e.hkia_achievement_create(...args)!==0)
    throw Error('ACH_CREATE_CONFLICT');
   return snapshot(e);
  }
  case 'achievement-create-parent':{
   const args=createArgs(r.guid,r.afterValue);
   const parent=r.achievementPatches;
   if(!Array.isArray(parent)||parent.length!==1||parent[0].before===null)
    throw Error('ACH_CREATE_PARENT_INVALID');
   if(e.hkia_achievement_create_parent(...args,...patchArgs(parent[0] as AchievementPatch))!==0)
    throw Error('ACH_CREATE_PARENT_CONFLICT');
   return snapshot(e);
  }
  case 'achievement-parent-create':{
   const patches=r.achievementPatches;
   if(!Array.isArray(patches)||patches.length!==2||patches[1].before!==null)
    throw Error('ACH_PARENT_CREATE_INVALID');
   const [child,parent]=patches;
   const childAfter=createArgs(child.guid,child.after);
   const parentAfter=createArgs(parent.guid,parent.after);
   const before=child.before;
   if(before!==null&&!validAchievement(before))throw Error('ACH_PARENT_CREATE_INVALID');
   type ParentCreateArgs=[
    number,number,number,number, number, number,number,bigint,number,number,
    number,number,bigint,number,number, number,number,number,number,
    number,number,bigint,number,number
   ];
   const args:ParentCreateArgs=[
    childAfter[0],childAfter[1],childAfter[2],childAfter[3],
    Number(before!==null),
    Number(before?.complete??false),before?.current??0,
    before?.completed?.[0]??0n,before?.completed?.[1]??0,
    Number(before!==null&&before.completed!==null),
    childAfter[4],childAfter[5],childAfter[6],childAfter[7],childAfter[8],
    parentAfter[0],parentAfter[1],parentAfter[2],parentAfter[3],
    parentAfter[4],parentAfter[5],parentAfter[6],parentAfter[7],parentAfter[8]
   ];
   if(e.hkia_achievement_parent_create(...args)!==0)throw Error('ACH_PARENT_CREATE_CONFLICT');
   return snapshot(e);
  }
  case 'achievement-pair':{
   const patches=r.achievementPatches;
   if(!Array.isArray(patches)||patches.length!==2)throw Error('ACH_PAIR_INVALID');
   if(patches[0].before===null||patches[1].before===null)throw Error('ACH_PAIR_INVALID');
   const a=patchArgs(patches[0] as AchievementPatch),b=patchArgs(patches[1] as AchievementPatch);
   if(e.hkia_achievement_pair_change(...a,...b)!==0)
    throw Error('ACH_PAIR_CONFLICT');
   return snapshot(e);
  }
  case 'batch':{
   const patches=r.patches;
   const achievements=r.achievementPatches??[];
   const inventoryPatches=r.inventoryPatches??[];
   if(!Array.isArray(inventoryPatches)||inventoryPatches.length>MAX_INVENTORY_DRAFT_PATCHES)throw Error('DRAFT_INVALID');
   if(!Array.isArray(patches)||patches.length>20000||!Array.isArray(achievements)||achievements.length>10000)throw Error('DRAFT_INVALID');
   for(const p of patches){
    if(!Number.isInteger(p.id)||p.id<=0||p.id>2147483647){
     e.hkia_reset();throw Error('DRAFT_INVALID');
    }
    const before=p.before??null,after=p.after??null;
    if(e.hkia_change(p.id,before===null?0:1,before??0n,after===null?0:1,after??0n)!==0){
     e.hkia_reset();throw Error('DRAFT_CONFLICT');
    }
   }
   for(const p of inventoryPatches){
    // Unique creation requires the native checkpoint with its source CAS
    // and exact handle. Net changes are a verification view, never a writer.
    if(p?.kind==='flower-create'||p?.kind==='furniture-create'||p?.kind==='palette-create'||p?.kind==='boba-create'||p?.kind==='cafe-create'||p?.kind==='wand-create'){e.hkia_reset();throw Error('HISTORY_RESTORE_CONFLICT')}
    if(!p||!Number.isInteger(p.documentId)||p.documentId<=0||p.documentId>4294967295||(p.documentId>2147483647&&(p.kind!==undefined||p.before!==0||p.after<=0))){
     e.hkia_reset();throw Error('DRAFT_INVALID');
    }
    const ok=p.kind==='flower-variant'
     ?isFlowerVariantWire(p.before)&&isFlowerVariantWire(p.after)&&e.hkia_inventory_flower_variant_change(p.documentId,...p.before,...p.after)===0
     :p.kind==='furniture-variant'?isFurnitureVariantWire(p.before)&&isFurnitureVariantWire(p.after)&&e.hkia_inventory_furniture_variant_change(p.documentId,...p.before,...p.after)===0
      :p.kind==='palette-variant'?isPaletteVariantWire(p.before)&&isPaletteVariantWire(p.after)&&e.hkia_inventory_palette_variant_change(p.documentId,...p.before,...p.after)===0
      :p.kind==='cafe-variant'?isCafeVariantWire(p.before)&&isCafeVariantWire(p.after)&&e.hkia_inventory_cafe_variant_change(p.documentId,...p.before,...p.after)===0
      :p.kind==='wand-variant'?isWandVariantWire(p.before)&&isWandVariantWire(p.after)&&e.hkia_inventory_wand_variant_change(p.documentId,...p.before,...p.after)===0
      :p.kind==='boba-variant'?isBobaVariantWire(p.before)&&isBobaVariantWire(p.after)&&e.hkia_inventory_boba_variant_change(p.documentId,...p.before,...p.after)===0
      :p.kind===undefined&&Number.isInteger(p.before)&&Number.isInteger(p.after)&&p.before>=0&&p.before<=2147483647&&p.after>=0&&p.after<=2147483647&&e.hkia_inventory_change(p.documentId,p.before,p.after)===0;
    if(!ok){e.hkia_reset();throw Error('DRAFT_CONFLICT');}
   }
   for(const p of achievements){
    const ok=p.before===null?
     e.hkia_achievement_create(...createArgs(p.guid,p.after))===0:
     changeAchievement(e,p.guid,p.before,p.after);
    if(!ok){e.hkia_reset();throw Error('DRAFT_CONFLICT');}
   }
   return snapshot(e);
  }
  case 'undo':if(e.hkia_undo()!==0)throw Error('戻せる変更がありません。');return snapshot(e);
  case 'redo':if(e.hkia_redo()!==0)throw Error('やり直せる変更がありません。');return snapshot(e);
   case 'history-jump':{
    if((r.scope!=='collections'&&r.scope!=='achievements'&&r.scope!=='inventory')||!Number.isSafeInteger(r.target)||
     r.target===undefined||r.target<0||r.target>512)throw Error('HISTORY_JUMP_INVALID');
    if(e.hkia_history_jump(r.scope==='collections'?0:r.scope==='achievements'?1:2,r.target)!==0)throw Error('HISTORY_JUMP_CONFLICT');
    return snapshot(e);
   }
  case 'history-restore':{
   const checkpoint=r.checkpoint;
   if(!(checkpoint instanceof Uint8Array)||checkpoint.byteLength<16||
    checkpoint.byteLength>HISTORY_MAX_BYTES)throw Error('HISTORY_CHECKPOINT_INVALID');
   const p=e.hkia_stage(checkpoint.byteLength);
   if(p===0||p+checkpoint.byteLength>e.memory.buffer.byteLength)throw Error('HISTORY_CHECKPOINT_INVALID');
   new Uint8Array(e.memory.buffer,p,checkpoint.byteLength).set(checkpoint);
   if(e.hkia_history_restore()!==0)throw Error('HISTORY_RESTORE_INVALID');
   return snapshot(e);
  }
  case 'reset':if(e.hkia_reset()!==0)throw Error('セーブが読み込まれていません。');return snapshot(e);
  case 'export':{
   if(e.hkia_export()!==0)throw Error('書き出し後の再検証に失敗しました。データは出力していません。');
   const b=readBytes(e,e.hkia_output_ptr(),e.hkia_output_len());
   return b;
  }
  case 'clear':e.hkia_clear();return null;
 }
}
context.onmessage=async({data:r})=>{
 try{
  const value=await execute(r);
  if(value instanceof Uint8Array)context.postMessage({id:r.id,ok:true,value},[value.buffer]);
  else context.postMessage({id:r.id,ok:true,value});
 }catch(e){
  context.postMessage({id:r.id,ok:false,error:e instanceof Error?e.message:'不明なエラー'});
 }
};

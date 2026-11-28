import type {SpriteCell} from './icon-packs';
import {loadVerifiedArtAsset} from './dynamic-art-assets';
import placeholderSource from '../data/native-placeholder-main-routes-v3.0.1.json';

const DEFINITIONS='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0';
const ATLAS='04c1f4c191b0a821a0bbcb15e67a75bec85cf343a0b2e875ee8e525e1e8dfc7b';
const INDEX_SHA='a5cb833211120f94c59e0bd31b6a0ae27e4d58149406fdc0269ab5274ffa13e9';
export const NATIVE_PLACEHOLDER_SPRITE='-6646601456236922891';
type NativeArt={entries:ReadonlyMap<number,SpriteCell>;withheld:ReadonlySet<number>;placeholders:ReadonlySet<number>};
export type InventoryNativeArt=NativeArt;

/** Known source decisions do not depend on loading the additional atlas index.
 * A missing atlas never promotes a withheld definition into a guessed image. */
export function initialInventoryNativeArt():InventoryNativeArt{
 const placeholders=new Set(placeholderSource.ids);
 return {entries:new Map(),placeholders,withheld:new Set([...placeholders,...placeholderSource.dynamicExcludedIds])};
}


/** Original Item ID -> exact UiIcon Sprite -> original texture crop.
 * Read-only presentation data; never grants save mutation eligibility. */
export type InventoryArtPin=Readonly<{version:string;indexFileSha256:string;definitionsSha256:string;atlasSha256:string|null}>;
const SHA=/^[a-f0-9]{64}$/;
function validatePin(pin:InventoryArtPin){
 if(!/^\d+\.\d+\.\d+$/.test(pin.version)||!SHA.test(pin.indexFileSha256)||!SHA.test(pin.definitionsSha256)||(pin.atlasSha256!==null&&!SHA.test(pin.atlasSha256)))throw Error('INVENTORY_ART_INVALID');
}
const BASELINE_PIN:InventoryArtPin={version:'3.0.1',indexFileSha256:INDEX_SHA,definitionsSha256:DEFINITIONS,atlasSha256:ATLAS};
function decodeNativeArt(value:unknown,base:string,pin:InventoryArtPin,baseline:boolean):NativeArt{
 validatePin(pin);
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVENTORY_ART_INVALID');
 const v=value as Record<string,unknown>;
 if(v.schema!=='HKIA.InventoryNativeArt.1'||v.version!==pin.version||
  v.definitionsSha256!==pin.definitionsSha256||v.atlasSha256!==pin.atlasSha256||
  v.size!==96||v.columns!==12||
  !Array.isArray(v.sheets)||v.sheets.length>1000||!Array.isArray(v.records)||v.records.length!==v.count||
  !Array.isArray(v.withheld)||v.withheld.length!==v.withheldCount||v.records.length+v.withheld.length>100000||
  (baseline&&(v.sheets.length!==10||v.count!==1747||v.withheldCount!==154)))throw Error('INVENTORY_ART_INVALID');
 for(const [i,sheet] of v.sheets.entries()){
  if(!sheet||sheet.name!=='sheet-'+String(i).padStart(3,'0')+'.webp'||
   typeof sheet.sha256!=='string'||!/^[a-f0-9]{64}$/.test(sheet.sha256)||
   !Number.isInteger(sheet.bytes)||sheet.bytes<1||sheet.bytes>2000000)throw Error('INVENTORY_ART_INVALID');
 }
 const entries=new Map<number,SpriteCell>(),withheld=new Set<number>(),placeholders=new Set<number>(),sourceCells=new Map<string,string>(),cellSources=new Map<string,string>();
 const validId=(id:unknown):id is number=>typeof id==='number'&&Number.isInteger(id)&&id>0&&id<=0x7fffffff;
 const validPath=(id:unknown)=>typeof id==='string'&&/^-?[1-9]\d{0,18}$/.test(id);
 for(const row of v.records){
  if(!Array.isArray(row)||row.length!==4)throw Error('INVENTORY_ART_INVALID');
  const [id,sheet,cell,pathId]=row;
  if(!validId(id)||entries.has(id)||!Number.isInteger(sheet)||sheet<0||sheet>=v.sheets.length||
   !Number.isInteger(cell)||cell<0||cell>=144||!validPath(pathId))throw Error('INVENTORY_ART_INVALID');
  const key=sheet+':'+cell;
  if(sourceCells.has(pathId)&&sourceCells.get(pathId)!==key||
   cellSources.has(key)&&cellSources.get(key)!==pathId)throw Error('INVENTORY_ART_INVALID');
  sourceCells.set(pathId,key);cellSources.set(key,pathId);
  const descriptor=v.sheets[sheet];
  entries.set(id,{url:base+'inventory-art/'+descriptor.name,x:(cell%12)*96,y:Math.floor(cell/12)*96,sheet,cell,nativeSheet:{root:base+'inventory-art/',file:descriptor.name,sha256:descriptor.sha256,bytes:descriptor.bytes}});
 }
 for(const row of v.withheld){
  if(!Array.isArray(row)||row.length!==3||!validId(row[0])||!validPath(row[1])||
   !['source-placeholder','dynamic-color'].includes(row[2])||entries.has(row[0])||withheld.has(row[0]))
   throw Error('INVENTORY_ART_INVALID');
  if(row[2]==='source-placeholder'){
   if(baseline&&row[1]!==NATIVE_PLACEHOLDER_SPRITE)throw Error('INVENTORY_ART_INVALID');
   placeholders.add(row[0]);
  }
  withheld.add(row[0]);
 }
 const original=initialInventoryNativeArt();
 if(baseline&&(placeholders.size!==original.placeholders.size||withheld.size!==original.withheld.size||
  [...original.placeholders].some(id=>!placeholders.has(id))||
  [...original.withheld].some(id=>!withheld.has(id))))throw Error('INVENTORY_ART_INVALID');
 return {entries,withheld,placeholders};
}
export function decodeInventoryNativeArt(value:unknown,base:string):NativeArt{
 return decodeNativeArt(value,base,BASELINE_PIN,true);
}
/** Only an explicitly reviewed release descriptor may supply these pins.
 * This is the additional native atlas, not the complete inventory route
 * policy. Overrides, recipe results and dynamic families remain separate. */
export function decodeCandidateInventoryNativeArt(value:unknown,base:string,pin:InventoryArtPin):NativeArt{
 if(!base.startsWith('/')||!base.endsWith('/')||base.includes('..')||base.includes('//')||base.includes('\\')||/[?#]/.test(base))throw Error('INVENTORY_ART_INVALID');
 return decodeNativeArt(value,base,pin,false);
}
export function createVersionedInventoryNativeArtLoader(base:string,pin:InventoryArtPin,load=loadVerifiedArtAsset){
 validatePin(pin);
 if(!base.startsWith('/')||!base.endsWith('/')||base.includes('..')||base.includes('//')||base.includes('\\')||/[?#]/.test(base))throw Error('INVENTORY_ART_INVALID');
 let pending:Promise<NativeArt>|undefined;
 return (version:string):Promise<NativeArt>=>{
  if(version!==pin.version)return Promise.reject(Error('INVENTORY_ART_INVALID'));
  return pending??=(async()=>{
   const bytes=await load(base+'inventory-art/','index.json',pin.indexFileSha256,8*1024*1024);
   return decodeCandidateInventoryNativeArt(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),base,pin);
  })().catch(error=>{pending=undefined;throw error;});
 };
}
export async function loadInventoryNativeArt(base:string):Promise<NativeArt>{
 const response=await fetch(base+'inventory-art/index.json');
 if(!response.ok)throw Error('INVENTORY_ART_UNAVAILABLE');
 const data=await response.arrayBuffer();
 if(data.byteLength>150000)throw Error('INVENTORY_ART_INVALID');
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
 if(digest!==INDEX_SHA)throw Error('INVENTORY_ART_INVALID');
 return decodeInventoryNativeArt(JSON.parse(new TextDecoder().decode(data)),base);
}

/** Preserve the original withheld-route policy during transient failures.
 * Successful immutable indices remain shared for the editor session. */
export function createInventoryNativeArtLoader(base:string):()=>Promise<NativeArt>{
 let pending:Promise<NativeArt>|undefined;
 return ()=>{
  if(!pending)pending=loadInventoryNativeArt(base).catch(error=>{pending=undefined;throw error});
  return pending;
 };
}

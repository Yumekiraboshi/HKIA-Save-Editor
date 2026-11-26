import type {SpriteCell} from './icon-packs';
import {flowerGrowthKind,type InventoryFlower} from './inventory-flower-display';
import {loadVerifiedArtAsset} from './dynamic-art-assets';
const ROOT=import.meta.env.BASE_URL+'inventory-flower-art/';
const SOURCE_SHA='bf99336e9eaf20de7d2f81f57f00fd2a514e59db03c2e161219f528fed59ff48';
const SHEET_SHA='f9160f0302ad5cffefe28a2ee5cc69e630be2735c0e83cf3bdb9982e7495f083';
const TRANSPORT_SHA='db4d9182b3ebc170ed0c9f66b2c97cc5b2997f530a090fc1064a80aa5e57c342';
type GrowthSource={schema:string;version:string;definitionsSha256:string;atlasSha256:string;sheet:{file:string;sha256:string;bytes:number;width:number;height:number;size:number;columns:number};rows:ReadonlyArray<{itemId:number;state:number;spritePathId:string;cell:number}>};
const key=(id:number,state:number)=>id+':'+state;
export function decodeFlowerGrowthCells(value:unknown,url:string):ReadonlyMap<string,SpriteCell>{
 const v=value as GrowthSource;
 if(!v||v.schema!=='HKIA.FlowerGrowthArt.1'||v.version!=='3.0.1'||
 v.definitionsSha256!=='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0'||
 v.atlasSha256!=='04c1f4c191b0a821a0bbcb15e67a75bec85cf343a0b2e875ee8e525e1e8dfc7b'||
 !v.sheet||v.sheet.file!=='flower-growth-icons-v3.0.1.webp'||v.sheet.sha256!==SHEET_SHA||v.sheet.bytes!==306216||
 v.sheet.width!==960||v.sheet.height!==480||v.sheet.size!==96||v.sheet.columns!==10||
 !Array.isArray(v.rows)||v.rows.length!==50)throw Error('FLOWER_GROWTH_SOURCE');
 const cells=new Map<string,SpriteCell>(),ids=new Set<number>(),sprites=new Set<string>();
 for(const [i,row] of v.rows.entries()){
  if(!row||!Number.isSafeInteger(row.itemId)||![0,7].includes(row.state)||row.cell!==i||
   !/^-?[1-9]\d{0,18}$/.test(row.spritePathId)||sprites.has(row.spritePathId)||
   !['seed','uprooted'].includes(flowerGrowthKind(row.itemId,{growState:row.state,baseColor:0,pattern:0,patternColor:0})??'')||
   cells.has(key(row.itemId,row.state)))throw Error('FLOWER_GROWTH_ROW');
  sprites.add(row.spritePathId);ids.add(row.itemId);
  cells.set(key(row.itemId,row.state),{url,x:(i%10)*96,y:Math.floor(i/10)*96,cell:i});
 }
 if(ids.size!==25||[...ids].some(id=>!cells.has(key(id,0))||!cells.has(key(id,7))))throw Error('FLOWER_GROWTH_COVERAGE');
 return cells;
}
export function resolveFlowerGrowthCell(cells:ReadonlyMap<string,SpriteCell>,itemId:number,flower:InventoryFlower):SpriteCell|undefined{
 const kind=flowerGrowthKind(itemId,flower);
 return kind==='seed'||kind==='uprooted'?cells.get(key(itemId,flower.growState)):undefined;
}
/** A single shared immutable sheet, loaded only for actual seed/plant cards.
 * One page-lifetime URL, independent of save identity. */
let source:Promise<ReadonlyMap<string,SpriteCell>>|undefined;
function load(){
 if(!source)source=(async()=>{
  const [manifest,transport]=await Promise.all([
   loadVerifiedArtAsset(ROOT,'flower-growth-source-v3.0.1.json',SOURCE_SHA,34788,34788),
   loadVerifiedArtAsset(ROOT,'flower-growth-icons-v3.0.1.webp.b64',TRANSPORT_SHA,408289,408289)]);
  const bytes=Uint8Array.from(atob(new TextDecoder('ascii').decode(transport).trim()),v=>v.charCodeAt(0));
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.buffer)),v=>v.toString(16).padStart(2,'0')).join('');
  if(bytes.byteLength!==306216||digest!==SHEET_SHA)throw Error('FLOWER_GROWTH_SHEET');
  const blob=new Blob([bytes.buffer],{type:'image/webp'});
  const bitmap=await createImageBitmap(blob);
  try{if(bitmap.width!==960||bitmap.height!==480)throw Error('FLOWER_GROWTH_DIMENSIONS');}finally{bitmap.close();}
  const url=URL.createObjectURL(blob);
  try{return decodeFlowerGrowthCells(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(manifest)),url);}
  catch(e){URL.revokeObjectURL(url);throw e;}
 })().catch(e=>{source=undefined;throw e;});
 return source;
}
export async function loadFlowerGrowthCell(itemId:number,flower:InventoryFlower):Promise<SpriteCell|undefined>{
 const kind=flowerGrowthKind(itemId,flower);
 if(kind!=='seed'&&kind!=='uprooted')return undefined;
 try{return resolveFlowerGrowthCell(await load(),itemId,flower);}catch{return undefined;}
}

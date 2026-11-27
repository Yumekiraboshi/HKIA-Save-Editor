import type {SpriteCell} from './icon-packs';

const DEFINITIONS='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0';
const ATLAS='04c1f4c191b0a821a0bbcb15e67a75bec85cf343a0b2e875ee8e525e1e8dfc7b';
const INDEX_SHA='a5cb833211120f94c59e0bd31b6a0ae27e4d58149406fdc0269ab5274ffa13e9';
export const NATIVE_PLACEHOLDER_SPRITE='-6646601456236922891';
type NativeArt={entries:ReadonlyMap<number,SpriteCell>;withheld:ReadonlySet<number>;placeholders:ReadonlySet<number>};
export type InventoryNativeArt=NativeArt;

/** Original Item ID -> exact UiIcon Sprite -> original texture crop.
 * Read-only presentation data; never grants save mutation eligibility. */
export function decodeInventoryNativeArt(value:unknown,base:string):NativeArt{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVENTORY_ART_INVALID');
 const v=value as Record<string,unknown>;
 if(v.schema!=='HKIA.InventoryNativeArt.1'||v.version!=='3.0.1'||
  v.definitionsSha256!==DEFINITIONS||v.atlasSha256!==ATLAS||
  v.size!==96||v.columns!==12||v.count!==1747||v.withheldCount!==154||
  !Array.isArray(v.sheets)||v.sheets.length!==10||!Array.isArray(v.records)||v.records.length!==1747||
  !Array.isArray(v.withheld)||v.withheld.length!==154)throw Error('INVENTORY_ART_INVALID');
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
  entries.set(id,{url:base+'inventory-art/'+v.sheets[sheet].name,x:(cell%12)*96,y:Math.floor(cell/12)*96,sheet,cell});
 }
 for(const row of v.withheld){
  if(!Array.isArray(row)||row.length!==3||!validId(row[0])||!validPath(row[1])||
   !['source-placeholder','dynamic-color'].includes(row[2])||entries.has(row[0])||withheld.has(row[0]))
   throw Error('INVENTORY_ART_INVALID');
  if(row[2]==='source-placeholder'){
   if(row[1]!==NATIVE_PLACEHOLDER_SPRITE)throw Error('INVENTORY_ART_INVALID');
   placeholders.add(row[0]);
  }
  withheld.add(row[0]);
 }
 if(placeholders.size!==152)throw Error('INVENTORY_ART_INVALID');
 return {entries,withheld,placeholders};
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

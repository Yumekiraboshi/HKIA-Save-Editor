/** Display-only, typed Rust/WASM flower snapshot. No mutation rules. */
export type InventoryFlower={growState:number;baseColor:number;pattern:number;patternColor:number};
type ColorDef={labelId:string;rgba:[number,number,number,number]};
type PatternDef={labelId:string;effect:boolean};
export type FlowerDisplayDefinitions={colors:Record<string,ColorDef>;patterns:Record<string,PatternDef>};
export function decodeInventoryFlowers(bytes:Uint8Array,docIds:ReadonlySet<number>):Map<number,InventoryFlower>{
 if(bytes.length<4)throw Error('FLOWER_SNAPSHOT_INVALID');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=v.getUint32(0,true);
 if(n>docIds.size||bytes.length!==4+n*20)throw Error('FLOWER_SNAPSHOT_INVALID');
 const rows=new Map<number,InventoryFlower>();
 for(let i=0;i<n;i++){
  const at=4+i*20,id=v.getUint32(at,true),growState=v.getUint32(at+4,true);
  if(!docIds.has(id)||rows.has(id)||growState>255)throw Error('FLOWER_SNAPSHOT_INVALID');
  rows.set(id,{growState,baseColor:v.getInt32(at+8,true),pattern:v.getInt32(at+12,true),patternColor:v.getInt32(at+16,true)});
 }
 return rows;
}
export async function loadFlowerDisplayDefinitions(base:string):Promise<FlowerDisplayDefinitions>{
 const r=await fetch(base+'inventory-ui/flowers.json');
 if(!r.ok)throw Error('FLOWER_DISPLAY_UNAVAILABLE');
 const data=await r.arrayBuffer();
 if(data.byteLength>20000)throw Error('FLOWER_DISPLAY_INVALID');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!=='a92aea32a46dd00b5a526be38f693ddce1280b7f7e7819cd6d667b9d9c790443')throw Error('FLOWER_DISPLAY_INVALID');
 return JSON.parse(new TextDecoder().decode(data)) as FlowerDisplayDefinitions;
}
export function flowerSwatch(color:ColorDef|undefined):string|undefined{
 if(!color)return undefined;
 const [r,g,b,a]=color.rgba;return 'rgba('+[r,g,b].map(v=>Math.round(Math.min(1,Math.max(0,v))*255)).join(',')+','+Math.min(1,Math.max(0,a))+')';
}
export function flowerDisplay(flower:InventoryFlower|undefined,defs:FlowerDisplayDefinitions|null,strings:Readonly<Record<string,string>>){
 if(!flower||!defs)return null;
 const primary=defs.colors[String(flower.baseColor)],pattern=defs.patterns[String(flower.pattern)],accent=defs.colors[String(flower.patternColor)];
 const color=flowerSwatch(primary),patternUrl=pattern?'pattern-'+flower.pattern+'.webp':undefined;
 if(!color&&!patternUrl)return null;
 const title=[primary&&strings[primary.labelId],accent&&pattern&&!pattern.effect&&strings[accent.labelId],pattern&&strings[pattern.labelId]].filter(Boolean).join(' · ');
 return {color,patternUrl,title,accent:flowerSwatch(accent)};
}

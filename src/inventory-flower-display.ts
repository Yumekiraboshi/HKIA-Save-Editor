/** Display-only, typed Rust/WASM flower snapshot. No mutation rules. */
export type InventoryFlower={growState:number;baseColor:number;pattern:number;patternColor:number};
// Source species only: tag 7 is also used by flower-crafted clothing.
import {nativeIconRoute} from './native-icon-route';
export function hasNativeFlowerArt(itemId:number):boolean{return nativeIconRoute(itemId)==='flower';}
const nativeGrowthKinds=['seed','planted','seedling','grown','bud','bloom','plucked','uprooted'] as const;
export type FlowerGrowthKind=typeof nativeGrowthKinds[number]|'unknown';
/** Display classification, not an edit rule. Never infer an unknown state. */
export function flowerGrowthKind(itemId:number,flower:InventoryFlower|undefined):FlowerGrowthKind|null{
 if(!flower||!hasNativeFlowerArt(itemId))return null;
 return Number.isInteger(flower.growState)&&flower.growState>=0&&flower.growState<nativeGrowthKinds.length?nativeGrowthKinds[flower.growState]:'unknown';
}
/** Native FlowerModel.IconForState selects GrownTroweledIcon for both
 * Grown (3) and GrownTroweled (7). Keep the saved state and its label distinct. */
export function flowerGrowthSpriteState(itemId:number,flower:InventoryFlower|undefined,isSpecies=hasNativeFlowerArt):0|7|undefined{
 if(!flower||!isSpecies(itemId))return undefined;
 return flower.growState===0?0:flower.growState===3||flower.growState===7?7:undefined;
}
/** Known states that select the definition UiIcon; only 6 applies tint. */
export function flowerUsesDefinitionIcon(itemId:number,flower:InventoryFlower|undefined,isSpecies=hasNativeFlowerArt):boolean{
 return !!flower&&isSpecies(itemId)&&[1,2,4,5,6].includes(flower.growState);
}
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

export type FlowerLabels=Record<string,Readonly<Record<string,string>>>;
export async function loadFlowerLabels(base:string):Promise<FlowerLabels>{
 const r=await fetch(base+'inventory-ui/flower-labels.json');
 if(!r.ok)throw Error('FLOWER_LABELS_UNAVAILABLE');
 const data=await r.arrayBuffer();
 if(data.byteLength>60000)throw Error('FLOWER_LABELS_INVALID');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!=='06519628a93327d82ef66ccc336c29244c5e91f433169ac9cb1b290ea6063a0b')throw Error('FLOWER_LABELS_INVALID');
 return JSON.parse(new TextDecoder().decode(data)).locales as FlowerLabels;
}

/** Native AddFlowerIcons: after all non-null GUID references resolve,
 * append FlowerColor (12) with the definition's Color as PrimaryColor,
 * then FlowerPattern (11) if IsPatterned. Never infer a missing definition.
 * The zero pattern/secondary-color sentinel is a valid absent reference. */
// Editor enhancement: display both native color references in one plate.
export type FlowerDecorator={type:12;primaryColor:string;secondaryColor?:string}|{type:11;patternUrl:string};
export function flowerDecorators(flower:InventoryFlower|undefined,defs:FlowerDisplayDefinitions|null):FlowerDecorator[]{
 if(!flower||!defs||!Object.hasOwn(defs.colors,String(flower.baseColor)))return [];
 if(flower.pattern!==0&&!Object.hasOwn(defs.patterns,String(flower.pattern)))return [];
 if(flower.patternColor!==0&&!Object.hasOwn(defs.colors,String(flower.patternColor)))return [];
 const color=flowerSwatch(defs.colors[String(flower.baseColor)]);
 if(!color)return [];
 const pattern=defs.patterns[String(flower.pattern)];
 const secondaryColor=flower.pattern!==0&&pattern&&!pattern.effect&&flower.patternColor!==0
  ?flowerSwatch(defs.colors[String(flower.patternColor)]):undefined;
 const rows:FlowerDecorator[]=[{type:12,primaryColor:color,...(secondaryColor?{secondaryColor}:{})}];
 if(flower.pattern!==0)rows.push({type:11,patternUrl:'pattern-'+flower.pattern+'.webp'});
 return rows;
}

/** Independent immutable source requests. A failed label file never blocks
 * color rendering, and successful definitions are not fetched again. */
export function createFlowerDisplayLoader(base:string){
 function retryable<T>(load:()=>Promise<T>){
  let pending:Promise<T>|undefined;
  return ()=>pending??(pending=load().catch(error=>{pending=undefined;throw error;}));
 }
 return {definitions:retryable(()=>loadFlowerDisplayDefinitions(base)),labels:retryable(()=>loadFlowerLabels(base))};
}

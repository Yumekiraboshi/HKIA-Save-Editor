import {resolveFlowerAppearance,type FlowerMaskIndex} from './flower-appearance';
import type {PixelBuffer,Rect} from './dynamic-sprite-raster';
import {loadVerifiedArtAsset,loadOpaqueArtTexture,renderCachedDynamicArt,renderCachedOriginalBase,type TextureAsset} from './dynamic-art-assets';
import {flowerGrowthKind,type InventoryFlower,type FlowerDisplayDefinitions} from './inventory-flower-display';

const ROOT=import.meta.env.BASE_URL+'inventory-flower-art/';
const MANIFEST_SHA='0cefd2977c3e25157023e3c47a180e7ebe4e8ab850dfdbe5bd481ae38d0b5020';
const INDEX_SHA='dfc7abc0963e1e1ff7700b2b7806bc156614bba48c1f6ef4b69114e92cc54771';
type SourceRow={itemId:number;baseSpritePathId:string;baseSampleRect:Rect;sourceTrimTopLeft:Rect};
type Manifest={schema:string;version:string;base:TextureAsset;mask:TextureAsset;alphaOffsetY:number;logicalSize:number;rows:SourceRow[]};
type Mask={textureRect:{x:number;y:number;width:number;height:number}};
type Sources={manifest:Manifest;index:FlowerMaskIndex;base:PixelBuffer;mask:PixelBuffer;rows:Map<number,SourceRow>};
type Binding=Omit<Sources,'base'|'mask'>;
let binding:Promise<Binding>|undefined;
function sourceBinding():Promise<Binding>{
 if(!binding)binding=(async()=>{
  const [m,i]=await Promise.all([loadVerifiedArtAsset(ROOT,'flower-runtime-source-v3.0.1.json',MANIFEST_SHA,65536),loadVerifiedArtAsset(ROOT,'index.json',INDEX_SHA,524288)]);
  const manifest=JSON.parse(new TextDecoder().decode(m)) as Manifest;
  const index=JSON.parse(new TextDecoder().decode(i)) as FlowerMaskIndex;
  if(manifest.schema!=='HKIA.FlowerRuntimeSource.1'||manifest.version!=='3.0.1'||manifest.rows.length!==25||index.items.length!==25)throw Error('FLOWER_ART_VERSION');
  const rows=new Map(manifest.rows.map(row=>[row.itemId,row]));
  if(rows.size!==25||index.items.some(item=>rows.get(item.itemId)?.baseSpritePathId!==item.baseSpritePathId))throw Error('FLOWER_ART_BINDING');
  return {manifest,index,rows};
 })().catch(e=>{binding=undefined;throw e;});
 return binding;
}
let loading:Promise<Sources>|undefined;
function sources():Promise<Sources>{
 if(!loading)loading=(async()=>{
  const s=await sourceBinding();
  const [base,mask]=await Promise.all([loadOpaqueArtTexture(ROOT,s.manifest.base),loadOpaqueArtTexture(ROOT,s.manifest.mask)]);
  return {...s,base,mask};
 })().catch(e=>{loading=undefined;throw e;});
 return loading;
}
export async function renderFlowerOriginalBaseArt(itemId:number,flower:InventoryFlower):Promise<Blob|null>{
 if(flowerGrowthKind(itemId,flower)!=='plucked')return null;
 return renderFlowerDefinitionBaseArt(itemId);
}
/** Definition template only: no growth state or individual color is inferred. */
export async function renderFlowerDefinitionBaseArt(itemId:number):Promise<Blob|null>{
 try{
  const s=await sourceBinding(),row=s.rows.get(itemId);if(!row)return null;
  const base=await loadOpaqueArtTexture(ROOT,s.manifest.base);
  return await renderCachedOriginalBase(JSON.stringify([MANIFEST_SHA,itemId]),{base,baseRect:row.baseSampleRect,trim:row.sourceTrimTopLeft,alphaOffsetY:s.manifest.alphaOffsetY,logicalSize:s.manifest.logicalSize});
 }catch{return null;}
}
/** Shared display-only compositor; save fields are consumed from the
 * Rust/WASM snapshot. No output is written to disk or sent to a service. */
export async function renderFlowerArt(itemId:number,flower:InventoryFlower,defs:FlowerDisplayDefinitions):Promise<Blob|null>{
 if(flowerGrowthKind(itemId,flower)!=='plucked'||(flower.pattern!==0&&!Object.hasOwn(defs.patterns,String(flower.pattern))))return null;
 try{
  const source=await sources();
  const appearance=resolveFlowerAppearance(itemId,flower,defs,source.index);
  const row=source.rows.get(itemId);
  if(!appearance||!row)return null;
  const mask=source.index.masks[appearance.maskGuid] as Mask|undefined;
  if(!mask)return null;
  const m=mask.textureRect;
  return await renderCachedDynamicArt(appearance.cacheKey,{base:source.base,mask:source.mask,baseRect:row.baseSampleRect,
   maskRect:[m.x,source.mask.height-m.y-m.height,m.width,m.height],trim:row.sourceTrimTopLeft,
   alphaOffsetY:source.manifest.alphaOffsetY,logicalSize:source.manifest.logicalSize,tints:appearance.tints});
 }catch{return null;}
}

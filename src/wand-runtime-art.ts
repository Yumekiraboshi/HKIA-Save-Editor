import {resolveWandBaseTints,type WandBaseAppearance,type WandColor} from './wand-appearance';
import type {Rgba} from './dynamic-sprite-color';
import type {PixelBuffer,Rect,SpriteOverlay} from './dynamic-sprite-raster';
import {loadVerifiedArtAsset,loadOpaqueArtTexture,renderCachedDynamicArt,type TextureAsset} from './dynamic-art-assets';

const ROOT=import.meta.env.BASE_URL+'dynamic-wand-art/';
export const WAND_MANIFEST_SHA='5d4d42d95417c8e6222747433b784a32ee9aaebb91216366a70645a33085f0bb';
type Row={itemId:number;maskGuid:string;base:{spritePathId:string;sampleRect:Rect;trimTopLeft:Rect;logicalSize:number};mask:{spritePathId:string;sampleRect:Rect;colorSpace:number;filterMode:number;mipCount:number}};
type Manifest={schema:string;version:string;base:TextureAsset;mask:TextureAsset;alphaOffsetY:number;magic:WandColor[];flecks:WandColor[];rows:Row[]};
type Source={manifest:Manifest;base:PixelBuffer;mask:PixelBuffer;rows:Map<number,Row>;magic:Map<number,Rgba>;flecks:Map<number,Rgba>};
let loading:Promise<Source>|undefined;
export const WAND_SUBICON_MANIFEST_SHA='e69a97ec439e0574a024aaf9ec4379cb83d6946adc460cc2d7c53ab7b617d1a6';
type SubRow={characteristicId:number;spritePathId:string;sampleRect:Rect;trimTopLeft:Rect;guardRect:Rect;logicalSize:number};
type WandTransform={itemId:number;scale:number;offsetPercent:[number,number];rotation:number;wandType:number};
type SubSource={texture:TextureAsset;alphaOffsetY:number;magic:SubRow[];wands:WandTransform[];schema:string;version:string};
let subLoading:Promise<{source:SubSource;texture:PixelBuffer}>|undefined;
function subSources(){
 if(!subLoading)subLoading=(async()=>{
  const raw=await loadVerifiedArtAsset(ROOT,'wand-subicon-source-v3.0.1.json',WAND_SUBICON_MANIFEST_SHA,32768);
  const source=JSON.parse(new TextDecoder().decode(raw)) as SubSource;
  if(source.schema!=='HKIA.WandSubIconSource.1'||source.version!=='3.0.1'||source.magic.length!==13||new Set(source.magic.map(x=>x.characteristicId)).size!==13||source.wands.length!==9||new Set(source.wands.map(x=>x.itemId)).size!==9||source.alphaOffsetY*2!==source.texture.height)throw Error('WAND_SUBICON_BINDING');
  return {source,texture:await loadOpaqueArtTexture(ROOT,source.texture)};
 })().catch(e=>{subLoading=undefined;throw e;});
 return subLoading;
}
function sources():Promise<Source>{
 if(!loading)loading=(async()=>{
  const raw=await loadVerifiedArtAsset(ROOT,'wand-runtime-source-v3.0.1.json',WAND_MANIFEST_SHA,65536);
  const manifest=JSON.parse(new TextDecoder().decode(raw)) as Manifest;
  const rows=new Map(manifest.rows.map(r=>[r.itemId,r]));
  const magic=new Map(manifest.magic.map(r=>[r.characteristicId,r.rgba])),flecks=new Map(manifest.flecks.map(r=>[r.characteristicId,r.rgba]));
  if(manifest.schema!=='HKIA.WandRuntimeSource.1'||manifest.version!=='3.0.1'||rows.size!==9||manifest.rows.length!==9||
    magic.size!==13||flecks.size!==3||manifest.rows.some(r=>r.mask.colorSpace!==0||r.mask.filterMode!==2||r.mask.mipCount!==1))throw Error('WAND_ART_BINDING');
  const [base,mask]=await Promise.all([loadOpaqueArtTexture(ROOT,manifest.base),loadOpaqueArtTexture(ROOT,manifest.mask)]);
  return {manifest,base,mask,rows,magic,flecks};
 })().catch(error=>{loading=undefined;throw error;});
 return loading;
}
/** Original dynamic base layer only. Not an inventory-ready final icon:
 * source-item sub-icon selection, transform and composition are separate.
 * All output is an in-memory local blob. */
export async function renderWandBaseArt(itemId:number,appearance:WandBaseAppearance):Promise<Blob|null>{
 try{
  const s=await sources(),r=s.rows.get(itemId);if(!r)return null;
  const tints=resolveWandBaseTints(appearance,s.magic,s.flecks);if(!tints)return null;
  return await renderCachedDynamicArt(JSON.stringify(['3.0.1','wand-base-dynamic-1',WAND_MANIFEST_SHA,itemId,tints]),{
   base:s.base,mask:s.mask,baseRect:r.base.sampleRect,maskRect:r.mask.sampleRect,trim:r.base.trimTopLeft,
   alphaOffsetY:s.manifest.alphaOffsetY,logicalSize:r.base.logicalSize,tints,maskColorSpace:'linear'
  });
 }catch{return null;}
}

/** SourceItemId==0 selects the MagicDisplay.Icon, not a missing item.
 * Nonzero source IDs use native GetUiIcon, never an inferred dynamic tint.
 * This candidate reproduces source geometry in the normalized editor canvas;
 * original prefab blend/anchor capture parity is still to be verified. */
export async function renderWandMagicArt(itemId:number,appearance:WandBaseAppearance&{sourceItemId:number}):Promise<Blob|null>{
 if(appearance.sourceItemId!==0)return null;
 try{
  const [s,sub]=await Promise.all([sources(),subSources()]);
  const row=s.rows.get(itemId),transform=sub.source.wands.find(x=>x.itemId===itemId);
  const index=sub.source.magic.findIndex(x=>x.characteristicId===appearance.magicCharacteristicId);
  if(!row||!transform||index<0)return null;
  const icon=sub.source.magic[index],tints=resolveWandBaseTints(appearance,s.magic,s.flecks);if(!tints)return null;
  // Each source crop has its own guard. Clamp the diamond's source atlas
  // edge to its own texel center rather than reading the adjacent packed cell.
  const x=index%4*258,y=Math.floor(index/4)*258;
  const overlay:SpriteOverlay={texture:sub.texture,sampleRect:icon.sampleRect,trim:icon.trimTopLeft,
   alphaOffsetY:sub.source.alphaOffsetY,logicalWidth:icon.logicalSize,logicalHeight:icon.logicalSize,
   scale:transform.scale,offsetPercent:transform.offsetPercent,rotation:transform.rotation,
   sampleClamp:[x+.5,y+.5,x+icon.guardRect[2]-.5,y+icon.guardRect[3]-.5]};
  return await renderCachedDynamicArt(JSON.stringify(['3.0.1','wand-magic-composite-1',WAND_MANIFEST_SHA,WAND_SUBICON_MANIFEST_SHA,itemId,tints,icon.spritePathId]),{
   base:s.base,mask:s.mask,baseRect:row.base.sampleRect,maskRect:row.mask.sampleRect,trim:row.base.trimTopLeft,
   alphaOffsetY:s.manifest.alphaOffsetY,logicalSize:row.base.logicalSize,tints,maskColorSpace:'linear',overlay
  });
 }catch{return null;}
}

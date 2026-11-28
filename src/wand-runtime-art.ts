import {resolveWandBaseTints,type WandBaseAppearance,type WandColor} from './wand-appearance';
import {isNeutralTintSet,type Rgba} from './dynamic-sprite-color';
import type {PixelBuffer,Rect,SpriteOverlay} from './dynamic-sprite-raster';
import {loadVerifiedArtAsset,loadOpaqueArtTexture,renderCachedDynamicArt,renderCachedOriginalBase,NO_TINT_MASK,type TextureAsset} from './dynamic-art-assets';
import {originalWandOverlay,originalWandCellKey,type WandOriginalCell} from './wand-original-subicon';
import {loadSampledWandOverlay} from './wand-candidate-source';
import {loadRemainingWandOverlay} from './wand-remaining-source';
import {hasNativePlaceholderArt,loadNativePlaceholderTexture,NATIVE_PLACEHOLDER_SPRITE,PLACEHOLDER_ASSET} from './native-placeholder-art';

import {loadChefOriginalOverlay} from './chef-runtime-art';
import {loadPaletteOriginalOverlay} from './palette-runtime-art';
import {loadFlowerOriginalOverlay} from './flower-runtime-art';
import {nativeIconRoute,nativeChefInstructionBase} from './native-icon-route';

const ROOT=import.meta.env.BASE_URL+'dynamic-wand-art/';

/** Every dynamic definition has a source-pinned original base. Reuse the
 * same family resolver for creation and instruction aliases. The ordinary
 * Ramen Recipe (not a dynamic flag) shares Ramen's exact original PPtr. */
export function wandOriginalTemplate(itemId:number):{kind:'chef'|'palette'|'flower'|'wand';itemId:number}|undefined{
 if(itemId===964128772)return {kind:'chef',itemId:1061947263};
 const route=nativeIconRoute(itemId);
 if(route==='cafe'||route==='boba')return {kind:'chef',itemId};
 if(route==='instruction'){
  const source=nativeChefInstructionBase(itemId);
  return source===undefined?undefined:{kind:'chef',itemId:source};
 }
 if(route==='palette'||route==='flower'||route==='wand')return {kind:route,itemId};
 return undefined;
}

export const WAND_MANIFEST_SHA='5d4d42d95417c8e6222747433b784a32ee9aaebb91216366a70645a33085f0bb';
type Row={itemId:number;maskGuid:string;base:{spritePathId:string;sampleRect:Rect;trimTopLeft:Rect;logicalSize:number;guardRect:Rect};mask:{spritePathId:string;sampleRect:Rect;colorSpace:number;filterMode:number;mipCount:number}};
type Manifest={schema:string;version:string;base:TextureAsset;mask:TextureAsset;alphaOffsetY:number;magic:WandColor[];flecks:WandColor[];rows:Row[]};
type Source={manifest:Manifest;base:PixelBuffer;mask:PixelBuffer;rows:Map<number,Row>;magic:Map<number,Rgba>;flecks:Map<number,Rgba>};
type Binding=Omit<Source,'base'|'mask'>;
let binding:Promise<Binding>|undefined;
let loading:Promise<Source>|undefined;
export const WAND_SUBICON_MANIFEST_SHA='e69a97ec439e0574a024aaf9ec4379cb83d6946adc460cc2d7c53ab7b617d1a6';
type SubRow={characteristicId:number;spritePathId:string;sampleRect:Rect;trimTopLeft:Rect;guardRect:Rect;logicalSize:number};
type WandTransform={itemId:number;scale:number;offsetPercent:[number,number];rotation:number;wandType:number};
type SubSource={texture:TextureAsset;alphaOffsetY:number;magic:SubRow[];wands:WandTransform[];schema:string;version:string};
let subLoading:Promise<SubSource>|undefined;
function subSources(){
 if(!subLoading)subLoading=(async()=>{
  const raw=await loadVerifiedArtAsset(ROOT,'wand-subicon-source-v3.0.1.json',WAND_SUBICON_MANIFEST_SHA,32768);
  const source=JSON.parse(new TextDecoder().decode(raw)) as SubSource;
  if(source.schema!=='HKIA.WandSubIconSource.1'||source.version!=='3.0.1'||source.magic.length!==13||new Set(source.magic.map(x=>x.characteristicId)).size!==13||source.wands.length!==9||new Set(source.wands.map(x=>x.itemId)).size!==9||source.alphaOffsetY*2!==source.texture.height)throw Error('WAND_SUBICON_BINDING');
  return source;
 })().catch(e=>{subLoading=undefined;throw e;});
 return subLoading;
}
export const WAND_ITEM_SUBICON_SHA='c5dce47482496e6ddda8b82bebfa845b519a37449228c4a88e894bad2c65e5f3';
type ItemSubRow={itemId:number;definitionPathId:string;spritePathId:string;pack:number;sampleRect:Rect;trimTopLeft:Rect;sampleClamp:Rect;logicalSize:number};
type ItemSubSource={schema:string;version:string;textures:TextureAsset[];alphaOffsetY:number;rows:ItemSubRow[]};
let itemSubLoading:Promise<ItemSubSource>|undefined;
function itemSubSources(){
 if(!itemSubLoading)itemSubLoading=(async()=>{
  const raw=await loadVerifiedArtAsset(ROOT,'wand-item-subicon-source-v3.0.1.json',WAND_ITEM_SUBICON_SHA,65536);
  const source=JSON.parse(new TextDecoder().decode(raw)) as ItemSubSource;
  if(source.schema!=='HKIA.WandItemSubIconSource.1'||source.version!=='3.0.1'||source.rows.length!==25||
    new Set(source.rows.map(r=>r.itemId)).size!==25||source.textures.length!==2||
    source.textures.some(t=>t.height!==source.alphaOffsetY*2)||
    source.rows.some(r=>!Number.isInteger(r.pack)||!source.textures[r.pack]))throw Error('WAND_ITEM_SUBICON_BINDING');
  return source;
 })().catch(e=>{itemSubLoading=undefined;throw e;});
 return itemSubLoading;
}
function sourceBinding():Promise<Binding>{
 if(!binding)binding=(async()=>{
  const raw=await loadVerifiedArtAsset(ROOT,'wand-runtime-source-v3.0.1.json',WAND_MANIFEST_SHA,65536);
  const manifest=JSON.parse(new TextDecoder().decode(raw)) as Manifest;
  const rows=new Map(manifest.rows.map(r=>[r.itemId,r]));
  const magic=new Map(manifest.magic.map(r=>[r.characteristicId,r.rgba])),flecks=new Map(manifest.flecks.map(r=>[r.characteristicId,r.rgba]));
  if(manifest.schema!=='HKIA.WandRuntimeSource.1'||manifest.version!=='3.0.1'||rows.size!==9||manifest.rows.length!==9||
    magic.size!==13||flecks.size!==3||manifest.rows.some(r=>r.mask.colorSpace!==0||r.mask.filterMode!==2||r.mask.mipCount!==1))throw Error('WAND_ART_BINDING');
  return {manifest,rows,magic,flecks};
 })().catch(error=>{binding=undefined;throw error;});
 return binding;
}
function sources():Promise<Source>{
 if(!loading)loading=(async()=>{
  const source=await sourceBinding();
  const [base,mask]=await Promise.all([loadOpaqueArtTexture(ROOT,source.manifest.base),loadOpaqueArtTexture(ROOT,source.manifest.mask)]);
  return {...source,base,mask};
 })().catch(error=>{loading=undefined;throw error;});
 return loading;
}
export async function renderWandOriginalBaseArt(itemId:number):Promise<Blob|null>{
 try{
  const s=await sourceBinding(),row=s.rows.get(itemId);if(!row)return null;
  const base=await loadOpaqueArtTexture(ROOT,s.manifest.base);
  return await renderCachedOriginalBase(JSON.stringify([WAND_MANIFEST_SHA,itemId]),{base,baseRect:row.base.sampleRect,trim:row.base.trimTopLeft,alphaOffsetY:s.manifest.alphaOffsetY,logicalSize:row.base.logicalSize});
 }catch{return null;}
}
/** Original dynamic base layer only. Not an inventory-ready final icon:
 * source-item sub-icon selection, transform and composition are separate.
 * All output is an in-memory local blob. */
export async function renderWandBaseArt(itemId:number,appearance:WandBaseAppearance):Promise<Blob|null>{
 try{
  const s=await sourceBinding(),r=s.rows.get(itemId);if(!r)return null;
  const tints=resolveWandBaseTints(appearance,s.magic,s.flecks);if(!tints)return null;
  if(isNeutralTintSet(tints))return renderWandOriginalBaseArt(itemId);
  const {base,mask}=await sources();
  return await renderCachedDynamicArt(JSON.stringify(['3.0.1','wand-base-dynamic-1',WAND_MANIFEST_SHA,itemId,tints]),{
   base,mask,baseRect:r.base.sampleRect,maskRect:r.mask.sampleRect,trim:r.base.trimTopLeft,
   alphaOffsetY:s.manifest.alphaOffsetY,logicalSize:r.base.logicalSize,tints,maskColorSpace:'linear'
  });
 }catch{return null;}
}

/** A wand used as another wand's source uses only its definition UiIcon,
 * never its own dynamic tint or nested source. No recursive rendering. */
export async function loadWandOriginalOverlay(itemId:number,transform:Pick<SpriteOverlay,'scale'|'offsetPercent'|'rotation'>):Promise<{spritePathId:string;sourceHash:string;overlay:SpriteOverlay}|null>{
 if(nativeIconRoute(itemId)!=='wand')return null;
 try{
  const s=await sourceBinding(),row=s.rows.get(itemId);if(!row?.base.guardRect)return null;
  const [x,y,w,h]=row.base.guardRect;
  return {spritePathId:row.base.spritePathId,sourceHash:WAND_MANIFEST_SHA,overlay:{
   texture:await loadOpaqueArtTexture(ROOT,s.manifest.base),sampleRect:row.base.sampleRect,trim:row.base.trimTopLeft,
   alphaOffsetY:s.manifest.alphaOffsetY,logicalWidth:row.base.logicalSize,logicalHeight:row.base.logicalSize,
   sampleClamp:[x+.5,y+.5,x+w-.5,y+h-.5],...transform}};
 }catch{return null;}
}
async function guardedItemOverlay(itemId:number,transform:WandTransform):Promise<{spritePathId:string;sourceHash:string;overlay:SpriteOverlay}|null>{
 try{
  const source=await itemSubSources(),icon=source.rows.find(x=>x.itemId===itemId);
  if(!icon)return null;
  return {spritePathId:icon.spritePathId,sourceHash:WAND_ITEM_SUBICON_SHA,
   overlay:{texture:await loadOpaqueArtTexture(ROOT,source.textures[icon.pack]),sampleRect:icon.sampleRect,trim:icon.trimTopLeft,
    alphaOffsetY:source.alphaOffsetY,logicalWidth:icon.logicalSize,logicalHeight:icon.logicalSize,
    scale:transform.scale,offsetPercent:transform.offsetPercent,rotation:transform.rotation,sampleClamp:icon.sampleClamp}};
 }catch{return null;}
}

/** SourceItemId==0 selects MagicDisplay.Icon. Otherwise select the exact
 * original definition UiIcon; nested unique-data colors are intentionally
 * not used by native TryGetSubIcon. Unknown/unextracted IDs remain withheld.
 * Normalized editor geometry; actual prefab/framebuffer parity is pending. */
export async function renderWandArt(itemId:number,appearance:WandBaseAppearance&{sourceItemId:number},originalCell?:WandOriginalCell):Promise<Blob|null>{
 try{
  const s=await sourceBinding(),row=s.rows.get(itemId);
  const tints=resolveWandBaseTints(appearance,s.magic,s.flecks);
  if(!row||!tints)return null;
  // A known characteristic without a MagicDisplay entry has no native
  // sub-icon. The game hides that Image, so the tinted base is complete.
  // This does not cover unknown IDs or a failed fetch of an existing icon.
  if(appearance.sourceItemId===0&&!s.magic.has(appearance.magicCharacteristicId))return renderWandBaseArt(itemId,appearance);
  const neutral=isNeutralTintSet(tints);
  const {base,mask}=neutral?{base:await loadOpaqueArtTexture(ROOT,s.manifest.base),mask:NO_TINT_MASK}:await sources();
  const sub=await subSources(),transform=sub.wands.find(x=>x.itemId===itemId);
  if(!transform)return null;
  let spritePathId:string,sourceHash:string,overlay:SpriteOverlay;
  if(appearance.sourceItemId===0){
   const index=sub.magic.findIndex(x=>x.characteristicId===appearance.magicCharacteristicId);
   if(index<0)return null;
   const icon=sub.magic[index],x=index%4*258,y=Math.floor(index/4)*258;
   spritePathId=icon.spritePathId;sourceHash=WAND_SUBICON_MANIFEST_SHA;
   overlay={texture:await loadOpaqueArtTexture(ROOT,sub.texture),sampleRect:icon.sampleRect,trim:icon.trimTopLeft,
    alphaOffsetY:sub.alphaOffsetY,logicalWidth:icon.logicalSize,logicalHeight:icon.logicalSize,
    scale:transform.scale,offsetPercent:transform.offsetPercent,rotation:transform.rotation,
    sampleClamp:[x+.5,y+.5,x+icon.guardRect[2]-.5,y+icon.guardRect[3]-.5]};
  }else{
   // A missing or corrupt optional guarded pack must not suppress the
   // independently verified candidate source for the same item.
   const guarded=await guardedItemOverlay(appearance.sourceItemId,transform);
   if(guarded){
    ({spritePathId,sourceHash,overlay}=guarded);
   }else if(hasNativePlaceholderArt(appearance.sourceItemId)){
    // Native GetUiIcon returns the same original placeholder Sprite.
    spritePathId=NATIVE_PLACEHOLDER_SPRITE;sourceHash=PLACEHOLDER_ASSET.sha256;
    overlay={texture:await loadNativePlaceholderTexture(),
     sampleRect:[1,1,256,256],trim:[0,0,256,256],alphaOffsetY:258,
     logicalWidth:256,logicalHeight:256,sampleClamp:[.5,.5,257.5,257.5],
     scale:transform.scale,offsetPercent:transform.offsetPercent,rotation:transform.rotation};
   }else{
    // Reuse independently verified original dynamic-family bases before
    // sampled/cell fallbacks. Never apply the source item's individual tint.
    const template=wandOriginalTemplate(appearance.sourceItemId);
    const shared=template?.kind==='chef'?await loadChefOriginalOverlay(template.itemId,transform)
     :template?.kind==='palette'?await loadPaletteOriginalOverlay(template.itemId,transform)
     :template?.kind==='flower'?await loadFlowerOriginalOverlay(template.itemId,transform)
     :template?.kind==='wand'?await loadWandOriginalOverlay(template.itemId,transform):null;
    if(shared){
     ({spritePathId,sourceHash,overlay}=shared);
    }else{
    // Every native wand uses TryGetSubIcon and the same source transform.
    // The sampled route checks exact source identity and geometry. It is
    // read-only artwork, not permission to create or edit a wand variant.
    const direct=await loadSampledWandOverlay(appearance.sourceItemId,transform)??await loadRemainingWandOverlay(appearance.sourceItemId,transform);
    if(direct){
     sourceHash=direct.sourceHash;spritePathId=direct.spritePathId;overlay=direct.overlay;
    }else{
     // Every shape can reuse the independently selected original cell.
     // The existing cell selector excludes non-square/withheld sources;
     // only use a cell bearing the same saved source ID.
     if(!originalCell||originalCell.itemId!==appearance.sourceItemId)return null;
     sourceHash='original-item-cell-v2';spritePathId=originalWandCellKey(originalCell);
     overlay=await originalWandOverlay(originalCell,transform);
    }
    }
   }
  }
  return await renderCachedDynamicArt(JSON.stringify(['3.0.1','wand-composite-2',WAND_MANIFEST_SHA,WAND_SUBICON_MANIFEST_SHA,sourceHash,itemId,tints,spritePathId]),{
   base,mask,baseRect:row.base.sampleRect,maskRect:neutral?[0,0,1,1]:row.mask.sampleRect,trim:row.base.trimTopLeft,
   alphaOffsetY:s.manifest.alphaOffsetY,logicalSize:row.base.logicalSize,tints,maskColorSpace:'linear',overlay
  });
 }catch{return null;}
}
export async function renderWandMagicArt(itemId:number,appearance:WandBaseAppearance&{sourceItemId:number}):Promise<Blob|null>{
 return appearance.sourceItemId===0?renderWandArt(itemId,appearance):null;
}

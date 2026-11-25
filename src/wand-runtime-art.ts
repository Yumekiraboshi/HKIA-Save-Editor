import {resolveWandBaseTints,type WandBaseAppearance,type WandColor} from './wand-appearance';
import type {Rgba} from './dynamic-sprite-color';
import type {PixelBuffer,Rect} from './dynamic-sprite-raster';
import {loadVerifiedArtAsset,loadOpaqueArtTexture,renderCachedDynamicArt,type TextureAsset} from './dynamic-art-assets';

const ROOT=import.meta.env.BASE_URL+'dynamic-wand-art/';
export const WAND_MANIFEST_SHA='5d4d42d95417c8e6222747433b784a32ee9aaebb91216366a70645a33085f0bb';
type Row={itemId:number;maskGuid:string;base:{spritePathId:string;sampleRect:Rect;trimTopLeft:Rect;logicalSize:number};mask:{spritePathId:string;sampleRect:Rect;colorSpace:number;filterMode:number;mipCount:number}};
type Manifest={schema:string;version:string;base:TextureAsset;mask:TextureAsset;alphaOffsetY:number;magic:WandColor[];flecks:WandColor[];rows:Row[]};
type Source={manifest:Manifest;base:PixelBuffer;mask:PixelBuffer;rows:Map<number,Row>;magic:Map<number,Rgba>;flecks:Map<number,Rgba>};
let loading:Promise<Source>|undefined;
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

import {resolveChefTints,type ChefAppearance,type ChefArtBinding,type ChefColor} from './chef-appearance';
import type {Rgba} from './dynamic-sprite-color';
import type {PixelBuffer,Rect} from './dynamic-sprite-raster';
import {loadVerifiedArtAsset,loadOpaqueArtTexture,renderCachedDynamicArt,renderCachedOriginalBase,type TextureAsset} from './dynamic-art-assets';
const ROOT=import.meta.env.BASE_URL+'dynamic-chef-art/';
const MASK_ROOT=import.meta.env.BASE_URL+'inventory-flower-art/';
export const CHEF_MANIFEST_SHA='8c73d78ef825e53777bd5042201a6290289213b0f226b27a39e72707ba1fa59c';
type SpriteRow={spritePathId:string;sampleRect:Rect;trimTopLeft:Rect;logicalSize:number;settingsRaw:number};
type Row=ChefArtBinding&{base:SpriteRow;mask:SpriteRow;maskGuid:string};
type Manifest={schema:string;version:string;base:TextureAsset;mask:TextureAsset;alphaOffsetY:number;rows:Row[];colors:ChefColor[]};
type Source={manifest:Manifest;base:PixelBuffer;mask:PixelBuffer;rows:Map<number,Row>;colors:Map<number,Rgba>};
type Binding={manifest:Manifest;rows:Map<number,Row>;colors:Map<number,Rgba>};
let binding:Promise<Binding>|undefined;
function sourceBinding():Promise<Binding>{
 if(!binding)binding=(async()=>{
  const raw=await loadVerifiedArtAsset(ROOT,'chef-runtime-source-v3.0.1.json',CHEF_MANIFEST_SHA,65536);
  const manifest=JSON.parse(new TextDecoder().decode(raw)) as Manifest;
  const rows=new Map(manifest.rows.map(row=>[row.itemId,row]));
  const colors=new Map(manifest.colors.map(row=>[row.characteristicId,row.rgba]));
  if(manifest.schema!=='HKIA.ChefRuntimeSource.1'||manifest.version!=='3.0.1'||manifest.rows.length!==10||rows.size!==10||manifest.colors.length!==34||colors.size!==34||
    manifest.mask.file!=='flower-mask-rgb-v3.0.1.webp'||manifest.mask.sha256!=='60bb931b9a4c5147415d61f0640b46c384fdabf9835621155282b60d6a8f2bb1')throw Error('CHEF_ART_BINDING');
  return {manifest,rows,colors};
 })().catch(e=>{binding=undefined;throw e;});
 return binding;
}
let loading:Promise<Source>|undefined;
function sources():Promise<Source>{
 if(!loading)loading=(async()=>{
  const row=await sourceBinding();
  const [base,mask]=await Promise.all([loadOpaqueArtTexture(ROOT,row.manifest.base),loadOpaqueArtTexture(MASK_ROOT,row.manifest.mask)]);
  return {...row,base,mask};
 })().catch(e=>{loading=undefined;throw e;});
 return loading;
}
/** Called only for source-version 3.0.1 native payloads from the worker.
 * No generated variant is published. No save payload or identity leaves the browser. */
export async function renderChefArt(itemId:number,appearance:ChefAppearance):Promise<Blob|null>{
 try{
  const s=await sources(),row=s.rows.get(itemId);
  if(!row)return null;
  const tints=resolveChefTints(row,appearance,s.colors);if(!tints)return null;
  return await renderCachedDynamicArt(JSON.stringify(['3.0.1','chef-dynamic-1',CHEF_MANIFEST_SHA,itemId,tints]),{
   base:s.base,mask:s.mask,baseRect:row.base.sampleRect,maskRect:row.mask.sampleRect,trim:row.base.trimTopLeft,
   alphaOffsetY:s.manifest.alphaOffsetY,logicalSize:row.base.logicalSize,tints
  });
 }catch{return null;}
}

export async function renderChefBaseArt(itemId:number):Promise<Blob|null>{
 try{
  const s=await sourceBinding(),row=s.rows.get(itemId);if(!row)return null;
  const base=await loadOpaqueArtTexture(ROOT,s.manifest.base);
  return await renderCachedOriginalBase(JSON.stringify([CHEF_MANIFEST_SHA,itemId]),{base,baseRect:row.base.sampleRect,trim:row.base.trimTopLeft,alphaOffsetY:s.manifest.alphaOffsetY,logicalSize:row.base.logicalSize});
 }catch{return null;}
}

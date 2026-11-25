import type {InventoryPalette} from './inventory-palette-display';
import {resolvePaletteTints,CUSTOM_PALETTE_ITEM_ID} from './inventory-palette-display';
import type {PixelBuffer,Rect} from './dynamic-sprite-raster';
import {loadVerifiedArtAsset,loadOpaqueArtTexture,renderCachedDynamicArt,type TextureAsset} from './dynamic-art-assets';
const ROOT=import.meta.env.BASE_URL+'dynamic-palette-art/';
const MANIFEST_SHA='c25b4775b46e460136f0c5dd8e0d7b24088cd92660451f535488f0b25f9cc386';
type Row={kind:string;spritePathId:string;sampleRect:Rect};
type Manifest={schema:string;version:string;itemId:number;maskGuid:string;base:TextureAsset;mask:TextureAsset;rows:Row[];alphaOffsetY:number;logicalSize:number};
type Source={manifest:Manifest;base:PixelBuffer;mask:PixelBuffer;baseRect:Rect;maskRect:Rect};
let loading:Promise<Source>|undefined;
function sources():Promise<Source>{
 if(!loading)loading=(async()=>{
  const raw=await loadVerifiedArtAsset(ROOT,'palette-runtime-source-v3.0.1.json',MANIFEST_SHA,16384);
  const manifest=JSON.parse(new TextDecoder().decode(raw)) as Manifest;
  const baseRow=manifest.rows.find(r=>r.kind==='base'),maskRow=manifest.rows.find(r=>r.kind==='mask');
  if(manifest.schema!=='HKIA.PaletteRuntimeSource.1'||manifest.version!=='3.0.1'||manifest.itemId!==CUSTOM_PALETTE_ITEM_ID||
   manifest.maskGuid!=='602c13ceeccd84df58cad480b3b9d792'||baseRow?.spritePathId!=='4281893961233162555'||maskRow?.spritePathId!=='2390703949357470540')throw Error('PALETTE_ART_BINDING');
  const [base,mask]=await Promise.all([loadOpaqueArtTexture(ROOT,manifest.base),loadOpaqueArtTexture(ROOT,manifest.mask)]);
  return {manifest,base,mask,baseRect:baseRow.sampleRect,maskRect:maskRow.sampleRect};
 })().catch(e=>{loading=undefined;throw e;});
 return loading;
}
export async function renderPaletteArt(itemId:number,palette:InventoryPalette):Promise<Blob|null>{
 const tints=resolvePaletteTints(itemId,palette);if(!tints)return null;
 try{
  const s=await sources(),size=s.manifest.logicalSize;
  return await renderCachedDynamicArt(JSON.stringify(['3.0.1','palette-dynamic-1',MANIFEST_SHA,itemId,tints]),{
   base:s.base,mask:s.mask,baseRect:s.baseRect,maskRect:s.maskRect,trim:[0,0,size,size],
   alphaOffsetY:s.manifest.alphaOffsetY,logicalSize:size,tints
  });
 }catch{return null;}
}

import {resolveFlowerAppearance,type FlowerMaskIndex} from './flower-appearance';
import {rasterizeDynamicSprite,type PixelBuffer,type Rect} from './dynamic-sprite-raster';
import type {InventoryFlower,FlowerDisplayDefinitions} from './inventory-flower-display';

const ROOT=import.meta.env.BASE_URL+'inventory-flower-art/';
const MANIFEST_SHA='0cefd2977c3e25157023e3c47a180e7ebe4e8ab850dfdbe5bd481ae38d0b5020';
const INDEX_SHA='dfc7abc0963e1e1ff7700b2b7806bc156614bba48c1f6ef4b69114e92cc54771';
type TextureAsset={file:string;bytes:number;sha256:string;rgbSha256:string;width:number;height:number};
type SourceRow={itemId:number;baseSpritePathId:string;baseSampleRect:Rect;sourceTrimTopLeft:Rect};
type Manifest={schema:string;version:string;base:TextureAsset;mask:TextureAsset;alphaOffsetY:number;logicalSize:number;rows:SourceRow[]};
type Mask={textureRect:{x:number;y:number;width:number;height:number}};
type Sources={manifest:Manifest;index:FlowerMaskIndex;base:PixelBuffer;mask:PixelBuffer;rows:Map<number,SourceRow>};
const digest=async(data:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');
async function verified(file:string,sha:string,max:number,exact?:number):Promise<ArrayBuffer>{
 if(!/^[a-z0-9.-]+$/.test(file))throw Error('FLOWER_ART_FILE');
 const r=await fetch(ROOT+file);if(!r.ok)throw Error('FLOWER_ART_FETCH');
 const data=await r.arrayBuffer();
 if(data.byteLength>max||(exact!==undefined&&data.byteLength!==exact)||await digest(data)!==sha)throw Error('FLOWER_ART_HASH');
 return data;
}
function canvas2d(width:number,height:number){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('FLOWER_ART_CANVAS');
 return {canvas,ctx};
}
async function pixels(asset:TextureAsset):Promise<PixelBuffer>{
 const bytes=await verified(asset.file,asset.sha256,1024*1024,asset.bytes);
 const image=await createImageBitmap(new Blob([bytes],{type:'image/webp'}),{premultiplyAlpha:'none',colorSpaceConversion:'none'});
 try{
  if(image.width!==asset.width||image.height!==asset.height)throw Error('FLOWER_ART_DIMENSIONS');
  const {canvas,ctx}=canvas2d(image.width,image.height);
  ctx.drawImage(image,0,0);
  const rgba=ctx.getImageData(0,0,image.width,image.height).data;
  canvas.width=0;canvas.height=0;
  // Both source planes are opaque. Check decoded RGB, including mask
  // values whose original alpha was zero, rather than relying on browser alpha handling.
  const rgb=new Uint8Array(image.width*image.height*3);
  for(let i=0,j=0;i<rgba.length;i+=4){if(rgba[i+3]!==255)throw Error('FLOWER_ART_ALPHA');rgb[j++]=rgba[i];rgb[j++]=rgba[i+1];rgb[j++]=rgba[i+2];}
  if(await digest(rgb.buffer)!==asset.rgbSha256)throw Error('FLOWER_ART_PIXELS');
  return {width:image.width,height:image.height,rgba};
 }finally{image.close();}
}
let loading:Promise<Sources>|undefined;
function sources():Promise<Sources>{
 if(!loading)loading=(async()=>{
  const [m,i]=await Promise.all([verified('flower-runtime-source-v3.0.1.json',MANIFEST_SHA,65536),verified('index.json',INDEX_SHA,524288)]);
  const manifest=JSON.parse(new TextDecoder().decode(m)) as Manifest;
  const index=JSON.parse(new TextDecoder().decode(i)) as FlowerMaskIndex;
  if(manifest.schema!=='HKIA.FlowerRuntimeSource.1'||manifest.version!=='3.0.1'||manifest.rows.length!==25||index.items.length!==25)throw Error('FLOWER_ART_VERSION');
  const rows=new Map(manifest.rows.map(row=>[row.itemId,row]));
  if(rows.size!==25||index.items.some(item=>rows.get(item.itemId)?.baseSpritePathId!==item.baseSpritePathId))throw Error('FLOWER_ART_BINDING');
  const [base,mask]=await Promise.all([pixels(manifest.base),pixels(manifest.mask)]);
  return {manifest,index,base,mask,rows};
 })().catch(e=>{loading=undefined;throw e;});
 return loading;
}
const cache=new Map<string,Promise<Blob|null>>();
const CACHE_LIMIT=192;
/** Shared display-only compositor; save fields are consumed from the
 * Rust/WASM snapshot. No output is written to disk or sent to a service. */
export async function renderFlowerArt(itemId:number,flower:InventoryFlower,defs:FlowerDisplayDefinitions):Promise<Blob|null>{
 if(flower.growState!==6||(flower.pattern!==0&&!Object.hasOwn(defs.patterns,String(flower.pattern))))return null;
 try{
  const source=await sources();
  const appearance=resolveFlowerAppearance(itemId,flower,defs,source.index);
  const row=source.rows.get(itemId);
  if(!appearance||!row)return null;
  const mask=source.index.masks[appearance.maskGuid] as Mask|undefined;
  if(!mask)return null;
  const key=appearance.cacheKey;
  const old=cache.get(key);if(old){cache.delete(key);cache.set(key,old);return old;}
  const task=(async()=>{
   // Yield between distinct icons to preserve browser interaction.
   await new Promise<void>(resolve=>setTimeout(resolve,0));
   const m=mask.textureRect;
   const rgba=rasterizeDynamicSprite({base:source.base,mask:source.mask,baseRect:row.baseSampleRect,
    maskRect:[m.x,source.mask.height-m.y-m.height,m.width,m.height],trim:row.sourceTrimTopLeft,
    alphaOffsetY:source.manifest.alphaOffsetY,logicalSize:source.manifest.logicalSize,tints:appearance.tints});
   const {canvas,ctx}=canvas2d(96,96);
   ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba),96,96),0,0);
   try{return await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));}finally{canvas.width=0;canvas.height=0;}
  })().catch(()=>null);
  cache.set(key,task);
  if(cache.size>CACHE_LIMIT)cache.delete(cache.keys().next().value!);
  void task.then(value=>{if(!value&&cache.get(key)===task)cache.delete(key);});
  return task;
 }catch{return null;}
}

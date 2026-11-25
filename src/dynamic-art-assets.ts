import {rasterizeDynamicSprite,type PixelBuffer,type RasterInput} from './dynamic-sprite-raster';

export type TextureAsset={file:string;bytes:number;sha256:string;rgbSha256:string;width:number;height:number};
const digest=async(data:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');
export async function loadVerifiedArtAsset(root:string,file:string,sha:string,max:number,exact?:number):Promise<ArrayBuffer>{
 if(!/^[a-z0-9.-]+$/.test(file))throw Error('DYNAMIC_ART_FILE');
 const r=await fetch(root+file);if(!r.ok)throw Error('DYNAMIC_ART_FETCH');
 const data=await r.arrayBuffer();
 if(data.byteLength>max||(exact!==undefined&&data.byteLength!==exact)||await digest(data)!==sha)throw Error('DYNAMIC_ART_HASH');
 return data;
}
function canvas2d(width:number,height:number){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('DYNAMIC_ART_CANVAS');
 return {canvas,ctx};
}
/** Opaque source planes retain RGB at original alpha=0. Verify the
 * exact decoded texels, not only the compressed WebP bytes. */
export async function loadOpaqueArtTexture(root:string,asset:TextureAsset):Promise<PixelBuffer>{
 const bytes=await loadVerifiedArtAsset(root,asset.file,asset.sha256,1024*1024,asset.bytes);
 const image=await createImageBitmap(new Blob([bytes],{type:'image/webp'}),{premultiplyAlpha:'none',colorSpaceConversion:'none'});
 try{
  if(image.width!==asset.width||image.height!==asset.height)throw Error('DYNAMIC_ART_DIMENSIONS');
  const {canvas,ctx}=canvas2d(image.width,image.height);
  const rgba=(()=>{try{ctx.drawImage(image,0,0);return ctx.getImageData(0,0,image.width,image.height).data;}finally{canvas.width=0;canvas.height=0;}})();
  const rgb=new Uint8Array(image.width*image.height*3);
  for(let i=0,j=0;i<rgba.length;i+=4){if(rgba[i+3]!==255)throw Error('DYNAMIC_ART_ALPHA');rgb[j++]=rgba[i];rgb[j++]=rgba[i+1];rgb[j++]=rgba[i+2];}
  if(await digest(rgb.buffer)!==asset.rgbSha256)throw Error('DYNAMIC_ART_PIXELS');
  return {width:image.width,height:image.height,rgba};
 }finally{image.close();}
}
// Shared bounded cache of local image blobs. Keys include source identity,
// pipeline version and appearance, never the save document identity.
const cache=new Map<string,Promise<Blob|null>>();
const CACHE_LIMIT=192;
export function renderCachedDynamicArt(key:string,input:RasterInput):Promise<Blob|null>{
 const old=cache.get(key);if(old){cache.delete(key);cache.set(key,old);return old;}
 const task=(async()=>{
  await new Promise<void>(resolve=>setTimeout(resolve,0));
  const rgba=rasterizeDynamicSprite(input);
  const {canvas,ctx}=canvas2d(96,96);
  try{
   ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba),96,96),0,0);
   return await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));
  }finally{canvas.width=0;canvas.height=0;}
 })().catch(()=>null);
 cache.set(key,task);
 if(cache.size>CACHE_LIMIT)cache.delete(cache.keys().next().value!);
 void task.then(value=>{if(!value&&cache.get(key)===task)cache.delete(key);});
 return task;
}

import type {SpriteCell} from './icon-packs';
import type {NativeDyePalette} from './native-dye-palettes';
import {sourceIconDyeRegions} from './dye-icon-regions';

const SIDE=96;
const MAX_SHEETS=8;
const MAX_RENDERED=240;

function clamp(value:number,min=0,max=255):number{
 return Math.min(max,Math.max(min,value));
}
function decodeColor(value:string|null):[number,number,number]|null{
 if(!value||!/^#[0-9a-f]{6}$/.test(value))return null;
 return [parseInt(value.slice(1,3),16),parseInt(value.slice(3,5),16),parseInt(value.slice(5,7),16)];
}

/**
 * Recolor the pixels of a real source sprite, not its border or a CSS overlay.
 *
 * The source UiIcon omits the game's five 3D shader material-channel masks.
 * Without a verified channel mask, only source palette channel 1 is applied
 * to neutral fabric; existing colorful decals, outlines and alpha are kept.
 * A future source-derived 1..5 per-pixel channel mask can be passed directly.
 * 0 means unchanged and null palette channels are never synthesized.
 */
export function recolorDyePixels(
 input:Uint8ClampedArray,width:number,height:number,
 palette:NativeDyePalette,channelMask?:Uint8Array
):{pixels:Uint8ClampedArray;changed:number}|null{
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||
  input.length!==width*height*4||
  (channelMask!==undefined&&channelMask.length!==width*height))throw Error('DYE_IMAGE_DIMENSIONS');
 const colors=palette.colors.map(decodeColor);
 if(!colors[0])return null;
 // Median grayscale fabric tone provides a stable, local brightness anchor.
 // Ignore transparent pixels, almost-black seams and white specular pixels.
 const neutral:number[]=[];
 for(let i=0;i<input.length;i+=4){
  const r=input[i],g=input[i+1],b=input[i+2];
  const l=.2126*r+.7152*g+.0722*b;
  const chroma=Math.max(r,g,b)-Math.min(r,g,b);
  if(input[i+3]>=64&&chroma<=36&&l>=65&&l<=225)neutral.push(l);
 }
 if(neutral.length<16)return null;
 neutral.sort((a,b)=>a-b);
 const reference=Math.max(75,neutral[neutral.length>>1]);
 const channelReferences=[reference,reference,reference,reference,reference];
 if(channelMask){
  const values:Array<number[]>=[[],[],[],[],[]];
  for(let i=0;i<channelMask.length;i++){
   const channel=channelMask[i]-1,offset=i*4;
   if(channel<0||channel>4||input[offset+3]<64)continue;
   values[channel].push(.2126*input[offset]+.7152*input[offset+1]+.0722*input[offset+2]);
  }
  for(let channel=1;channel<5;channel++){
   const sampled=values[channel];
   if(sampled.length<8)continue;
   sampled.sort((a,b)=>a-b);
   channelReferences[channel]=Math.max(55,sampled[sampled.length>>1]);
  }
 }
 const output=new Uint8ClampedArray(input);
 let changed=0;
 for(let i=0;i<input.length;i+=4){
  const a=input[i+3];
  if(a<24)continue;
  const r=input[i],g=input[i+1],b=input[i+2];
  const lo=Math.min(r,g,b),hi=Math.max(r,g,b),chroma=hi-lo;
  // Already-colored trim is not a verified dye channel: leave it untouched.
  const neutrality=clamp((70-chroma)/34,0,1);
  const lum=.2126*r+.7152*g+.0722*b;
  const targetIndex=channelMask?channelMask[i>>2]-1:0;
  if(targetIndex<0||targetIndex>=colors.length)continue;
  const color=colors[targetIndex];
  if(!color)continue;
  // A source-derived colored decorative region must not be rejected as
  // "nonneutral" just because the original image already has orange/gold.
  // Only explicitly tagged pixels bypass that generic neutrality test.
  const eligible=channelMask&&targetIndex>0?1:neutrality;
  const shadows=clamp((lum-33)/49,0,1);
  const highlights=clamp((252-lum)/29,0,1);
  const strength=eligible*shadows*highlights;
  if(strength<=.015)continue;
  const channelReference=channelReferences[targetIndex];
  const shade=clamp(.66+.34*lum/channelReference,0.25,1.55);
  let different=false;
  for(let channel=0;channel<3;channel++){
   const lit=clamp(color[channel]*shade+(lum-channelReference)*.27);
   const value=Math.round(input[i+channel]*(1-strength)+lit*strength);
   if(Math.abs(value-input[i+channel])>=3)different=true;
   output[i+channel]=value;
  }
  if(different)changed++;
 }
 return changed>8?{pixels:output,changed}:null;
}

const sheets=new Map<string,Promise<HTMLImageElement>>();
const rendered=new Map<string,Promise<Blob|null>>();
function remember<K,V>(cache:Map<K,V>,key:K,value:V,max:number):V{
 cache.delete(key);cache.set(key,value);
 while(cache.size>max)cache.delete(cache.keys().next().value!);
 return value;
}
function loadSheet(url:string):Promise<HTMLImageElement>{
 const found=sheets.get(url);
 if(found)return found;
 const image=new Image();
 image.src=url;
 const result=image.decode().then(()=>image).catch(e=>{sheets.delete(url);throw e;});
 return remember(sheets,url,result,MAX_SHEETS);
}
function toBlob(canvas:HTMLCanvasElement):Promise<Blob>{
 return new Promise((resolve,reject)=>{
  canvas.toBlob(blob=>blob?resolve(blob):reject(Error('DYE_IMAGE_ENCODE')),'image/webp',.92);
 });
}
async function render(sprite:SpriteCell,palette:NativeDyePalette,sourceKey:string):Promise<Blob|null>{
 const image=await loadSheet(sprite.url);
 const canvas=document.createElement('canvas');
 canvas.width=SIDE;canvas.height=SIDE;
 const context=canvas.getContext('2d',{willReadFrequently:true});
 if(!context)throw Error('DYE_IMAGE_CANVAS');
 context.drawImage(image,sprite.x,sprite.y,SIDE,SIDE,0,0,SIDE,SIDE);
 const pixels=context.getImageData(0,0,SIDE,SIDE);
 const mask=sourceIconDyeRegions(sourceKey,pixels.data,SIDE,SIDE);
 const result=recolorDyePixels(pixels.data,SIDE,SIDE,palette,mask);
 if(!result)return null;
 pixels.data.set(result.pixels);
 context.putImageData(pixels,0,0);
 return toBlob(canvas);
}
/** Lazily produce a 96px WebP for the requested Item ID / native dye.
 * Coalesce identical rendering work, retain a small LRU of blobs, and let
 * the calling component revoke its own object URL when unmounted. */
export function renderDyeSprite(sprite:SpriteCell,palette:NativeDyePalette,sourceKey=''):Promise<Blob|null>{
 const key=sprite.url+'|'+sprite.x+':'+sprite.y+'|'+palette.dye+'|'+sourceKey;
 const found=rendered.get(key);
 if(found)return found;
 const promise=render(sprite,palette,sourceKey).catch(()=>{rendered.delete(key);return null});
 return remember(rendered,key,promise,MAX_RENDERED);
}

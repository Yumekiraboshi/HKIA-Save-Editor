import {dynamicSpritePixel,type Rgba,type TintSet} from './dynamic-sprite-color';

export type PixelBuffer={width:number;height:number;rgba:Uint8ClampedArray};
export type Rect=readonly [number,number,number,number];
export const srgbToLinear=(s:number)=>s<=0.04045?s/12.92:((s+0.055)/1.055)**2.4;
export const linearToSrgb=(s:number)=>s<=0.0031308?s*12.92:1.055*s**(1/2.4)-0.055;
const linearBytes=Array.from({length:256},(_,i)=>srgbToLinear(i/255));
const clamp=(v:number,max:number)=>Math.max(0,Math.min(max,v));
function sample(p:PixelBuffer,x:number,y:number,channel:number,linear:boolean):number{
 const sx=x-.5,sy=y-.5,ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
 const read=(a:number,b:number)=>{const v=p.rgba[(clamp(b,p.height-1)*p.width+clamp(a,p.width-1))*4+channel];return linear?linearBytes[v]:v/255;};
 const a=read(ix,iy),b=read(ix+1,iy),c=read(ix,iy+1),d=read(ix+1,iy+1);
 return (a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy;
}
export function sampleLinearRgb(p:PixelBuffer,x:number,y:number):Rgba{
 return [sample(p,x,y,0,true),sample(p,x,y,1,true),sample(p,x,y,2,true),1];
}
export type RasterInput={base:PixelBuffer;mask:PixelBuffer;baseRect:Rect;maskRect:Rect;trim:Rect;alphaOffsetY:number;logicalSize:number;tints:TintSet};
/** Native zero-border, non-rotated Sprite geometry, sRGB textures, bilinear
 * clamp sampling and non-clipped white UI shader. Source crops retain
 * one original texel of guard on every side. Alpha is separate, linear data.
 * The 84px content/6px padding are editor layout, not game capture geometry.
 */
export function rasterizeDynamicSprite(input:RasterInput):Uint8ClampedArray{
 const {base,mask,baseRect,maskRect,trim,alphaOffsetY,logicalSize,tints}=input;
 const [l,t,r,b]=trim;
 if(![...baseRect,...maskRect,...trim,alphaOffsetY,logicalSize].every(Number.isFinite)||
  r<=l||b<=t||logicalSize<=0||baseRect[2]<=0||baseRect[3]<=0||maskRect[2]<=0||maskRect[3]<=0||
  base.rgba.length!==base.width*base.height*4||mask.rgba.length!==mask.width*mask.height*4||
  !tints.every(c=>c.length===4&&c.every(v=>Number.isFinite(v)&&v>=0&&v<=1)))throw Error('DYNAMIC_RASTER_INPUT');
 const tint=(c:Rgba):Rgba=>[srgbToLinear(c[0]),srgbToLinear(c[1]),srgbToLinear(c[2]),c[3]];
 const linearTints:TintSet=[tint(tints[0]),tint(tints[1]),tint(tints[2])];
 const out=new Uint8ClampedArray(96*96*4);
 for(let y=6;y<90;y++)for(let x=6;x<90;x++){
  const sx=(x+.5-6)*logicalSize/84,sy=(y+.5-6)*logicalSize/84;
  if(sx<l||sx>=r||sy<t||sy>=b)continue;
  const u=(sx-l)/(r-l),v=(sy-t)/(b-t);
  const bx=baseRect[0]+u*baseRect[2],by=baseRect[1]+v*baseRect[3];
  const mx=maskRect[0]+u*maskRect[2],my=maskRect[1]+v*maskRect[3];
  const rgb=sampleLinearRgb(base,bx,by);
  const rgba:Rgba=[rgb[0],rgb[1],rgb[2],sample(base,bx,by+alphaOffsetY,0,false)];
  const result=dynamicSpritePixel(rgba,sampleLinearRgb(mask,mx,my),linearTints);
  const p=(y*96+x)*4;
  for(let c=0;c<3;c++)out[p+c]=Math.round(clamp(linearToSrgb(clamp(result[c],1)),1)*255);
  out[p+3]=Math.round(clamp(result[3],1)*255);
 }
 return out;
}

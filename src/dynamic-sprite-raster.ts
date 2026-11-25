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
export type SpriteOverlay={texture:PixelBuffer;sampleRect:Rect;trim:Rect;alphaOffsetY:number;logicalWidth:number;logicalHeight:number;scale:number;offsetPercent:readonly [number,number];rotation:number;sampleClamp:Rect};
export type RasterInput={base:PixelBuffer;mask:PixelBuffer;baseRect:Rect;maskRect:Rect;trim:Rect;alphaOffsetY:number;logicalSize:number;tints:TintSet;maskColorSpace?:'srgb'|'linear';overlay?:SpriteOverlay};
/** Native zero-border, non-rotated Sprite geometry, sRGB base texture, source-selected mask color space, bilinear
 * clamp sampling and non-clipped white UI shader. Source crops retain
 * one original texel of guard on every side. Alpha is separate, linear data.
 * The 84px content/6px padding are editor layout, not game capture geometry.
 */
/** SubIconData.ComputeContainSize + ApplyToRectTransform, normalized to
 * the editor's 84px square icon area. Unity +Y points upwards.
 * The centered pivot here is the editor layout; prefab parity is separate. */
export function overlayPlacement(width:number,height:number,overlay:Pick<SpriteOverlay,'logicalWidth'|'logicalHeight'|'scale'|'offsetPercent'|'rotation'>){
 if(![width,height,overlay.logicalWidth,overlay.logicalHeight,overlay.scale,...overlay.offsetPercent,overlay.rotation].every(Number.isFinite)||
 width<=0||height<=0||overlay.logicalWidth<=0||overlay.logicalHeight<=0)throw Error('OVERLAY_GEOMETRY');
 const scale=Math.min(width/overlay.logicalWidth,height/overlay.logicalHeight)*Math.max(0,overlay.scale);
 return {width:overlay.logicalWidth*scale,height:overlay.logicalHeight*scale,cx:width*(.5+overlay.offsetPercent[0]),cy:height*(.5-overlay.offsetPercent[1]),radians:overlay.rotation*Math.PI/180};
}
/** Straight-alpha source-over in linear RGB. Both source samples are
 * unassociated; framebuffer quantization happens once at the end. */
export function sourceOver(base:Rgba,over:Rgba):Rgba{
 const ba=clamp(base[3],1),a=clamp(over[3],1),out=a+ba*(1-a);
 if(out===0)return [0,0,0,0];
 return [(over[0]*a+base[0]*ba*(1-a))/out,(over[1]*a+base[1]*ba*(1-a))/out,(over[2]*a+base[2]*ba*(1-a))/out,out];
}
function overlaySample(overlay:SpriteOverlay,placement:ReturnType<typeof overlayPlacement>,x:number,y:number):Rgba|null{
 if(placement.width===0||placement.height===0)return null;
 const dx=x-placement.cx,dy=y-placement.cy,co=Math.cos(placement.radians),si=Math.sin(placement.radians);
 const sx=(co*dx-si*dy)/placement.width*overlay.logicalWidth+overlay.logicalWidth/2;
 const sy=(si*dx+co*dy)/placement.height*overlay.logicalHeight+overlay.logicalHeight/2;
 const [l,t,r,b]=overlay.trim;
 if(sx<l||sx>=r||sy<t||sy>=b)return null;
 const [rx,ry,rw,rh]=overlay.sampleRect,[cl,ct,cr,cb]=overlay.sampleClamp;
 const bx=Math.max(cl,Math.min(cr,rx+(sx-l)/(r-l)*rw)),by=Math.max(ct,Math.min(cb,ry+(sy-t)/(b-t)*rh));
 const p=overlay.texture;
 return [sample(p,bx,by,0,true),sample(p,bx,by,1,true),sample(p,bx,by,2,true),sample(p,bx,by+overlay.alphaOffsetY,0,false)];
}
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
 const overlay=input.overlay,placement=overlay?overlayPlacement(84,84,overlay):null;
 if(overlay&&(![...overlay.sampleRect,...overlay.trim,...overlay.sampleClamp,overlay.alphaOffsetY].every(Number.isFinite)||overlay.texture.rgba.length!==overlay.texture.width*overlay.texture.height*4||overlay.trim[2]<=overlay.trim[0]||overlay.trim[3]<=overlay.trim[1]||overlay.sampleRect[2]<=0||overlay.sampleRect[3]<=0||overlay.alphaOffsetY<=0))throw Error('OVERLAY_INPUT');
 for(let y=6;y<90;y++)for(let x=6;x<90;x++){
  const sx=(x+.5-6)*logicalSize/84,sy=(y+.5-6)*logicalSize/84;
  let result:Rgba=[0,0,0,0];
  if(sx>=l&&sx<r&&sy>=t&&sy<b){
  const u=(sx-l)/(r-l),v=(sy-t)/(b-t);
  const bx=baseRect[0]+u*baseRect[2],by=baseRect[1]+v*baseRect[3];
  const mx=maskRect[0]+u*maskRect[2],my=maskRect[1]+v*maskRect[3];
  const rgb=sampleLinearRgb(base,bx,by);
  const rgba:Rgba=[rgb[0],rgb[1],rgb[2],sample(base,bx,by+alphaOffsetY,0,false)];
  // A linear-data Texture2D must not undergo the sRGB transfer function.
  const m:Rgba=input.maskColorSpace==='linear'?[sample(mask,mx,my,0,false),sample(mask,mx,my,1,false),sample(mask,mx,my,2,false),1]:sampleLinearRgb(mask,mx,my);
  result=dynamicSpritePixel(rgba,m,linearTints);
  }
  if(overlay&&placement){const layer=overlaySample(overlay,placement,x+.5-6,y+.5-6);if(layer)result=sourceOver(result,layer);}
  const p=(y*96+x)*4;
  for(let c=0;c<3;c++)out[p+c]=Math.round(clamp(linearToSrgb(clamp(result[c],1)),1)*255);
  out[p+3]=Math.round(clamp(result[3],1)*255);
 }
 return out;
}

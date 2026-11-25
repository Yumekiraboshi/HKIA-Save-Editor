/** Source-derived presentation math for Steam v3.0.1
 * Sunblink/UI/Dynamic Sprite Color, non-clipped white-UI path.
 * Inputs are already sampled in the shader's color space. This module
 * deliberately does not decide texture decoding, sampler UVs or save edits.
 */
export type Rgba=readonly [number,number,number,number];
export type TintSet=readonly [Rgba,Rgba,Rgba];
export type UvRect=readonly [number,number,number,number];
const WHITE:Rgba=[1,1,1,1];
const ZERO:Rgba=[0,0,0,0];
function lerp(a:number,b:number,t:number){return a+(b-a)*t;}
/** Exact RGB channel ordering in the un-clipped native pixel program.
 * Mask alpha and Tint alpha do not participate in the tint operation.
 * Base alpha is modulated only by vertex alpha and texture sample add.
 */
export function dynamicSpritePixel(base:Rgba,mask:Rgba,tints:TintSet,vertex:Rgba=WHITE,sampleAdd:Rgba=ZERO):Rgba{
 const tint=(c:0|1|2)=>lerp(lerp(lerp(1,tints[0][c],mask[0]),tints[1][c],mask[1]),tints[2][c],mask[2]);
 return [
  (base[0]+sampleAdd[0])*vertex[0]*tint(0),
  (base[1]+sampleAdd[1])*vertex[1]*tint(1),
  (base[2]+sampleAdd[2])*vertex[2]*tint(2),
  (base[3]+sampleAdd[3])*vertex[3]
 ];
}
/** Native DynamicColorViewBase.AdjustMaskOuterUV:
 * map source outer UV into mask inner UV using source inner UV.
 * Return null for a degenerate/non-finite input rather than invent geometry.
 */
export function adjustMaskOuterUV(sourceInner:UvRect,sourceOuter:UvRect,maskInner:UvRect):UvRect|null{
 if(![...sourceInner,...sourceOuter,...maskInner].every(Number.isFinite))return null;
 const dx=sourceInner[2]-sourceInner[0],dy=sourceInner[3]-sourceInner[1];
 if(dx<=0||dy<=0||maskInner[2]<=maskInner[0]||maskInner[3]<=maskInner[1])return null;
 const x=(u:number)=>maskInner[0]+(u-sourceInner[0])/dx*(maskInner[2]-maskInner[0]);
 const y=(v:number)=>maskInner[1]+(v-sourceInner[1])/dy*(maskInner[3]-maskInner[1]);
 return [x(sourceOuter[0]),y(sourceOuter[1]),x(sourceOuter[2]),y(sourceOuter[3])];
}
/** Compose aligned, normalized shader-space RGBA samples on demand.
 * Not a PNG generator; output stays in memory. The caller owns sampling,
 * color-space conversion and the framebuffer transform.
 */
export function composeDynamicSpriteSamples(base:Float32Array,mask:Float32Array,tints:TintSet):Float32Array{
 if(base.length!==mask.length||base.length===0||base.length%4!==0||base.length>4*1024*1024||
  !tints.every(t=>t.length===4&&t.every(Number.isFinite)))throw Error('DYNAMIC_ART_INPUT');
 const out=new Float32Array(base.length);
 for(let i=0;i<base.length;i+=4){
  const b:Rgba=[base[i],base[i+1],base[i+2],base[i+3]];
  const m:Rgba=[mask[i],mask[i+1],mask[i+2],mask[i+3]];
  if(!b.every(Number.isFinite)||!m.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('DYNAMIC_ART_SAMPLE');
  out.set(dynamicSpritePixel(b,m,tints),i);
 }
 return out;
}

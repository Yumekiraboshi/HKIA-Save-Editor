/** Source-bound output stages, not a complete Unity postprocessor.
 * Steam v3.0.1 UI/Default pixel program 7 and the two original post shaders.
 * Inputs must already be sampled/graded in the native color space.
 * Never select FinalPost as an alpha repair for an unsupported preview. */
export type PreviewRGBA=readonly [number,number,number,number];
export type PreviewRGB=readonly [number,number,number];
export type PreviewPostStage='uber'|'final';
const inv255=Math.fround(1/255);
function finite(v:readonly number[],n:number){
 if(v.length!==n||v.some(x=>!Number.isFinite(x)))throw Error('FURNITURE_PREVIEW_OUTPUT_VALUE');
}
function roundEven(v:number){
 const lo=Math.floor(v),d=v-lo;
 return d<.5?lo:d>.5?lo+1:lo%2===0?lo:lo+1;
}
/** Native RenderTextureDataProvider.MatchToNearestPowerOf2, Switch 3.0.1.
 * Reject nonsensical requests instead of relying on the native int default. */
export function nativePreviewTextureSize(request:number):64|128|256|512|1024{
 if(!Number.isSafeInteger(request)||request<=0||request>2147483647)throw Error('FURNITURE_PREVIEW_TEXTURE_SIZE');
 return request<=64?64:request<=128?128:request<=256?256:request<=512?512:1024;
}
/** Explicit shader selection only. RGB grading remains a separate stage. */
export function nativePreviewPostOutput(rgb:PreviewRGB,inputAlpha:number,stage:PreviewPostStage):PreviewRGBA{
 finite(rgb,3);finite([inputAlpha],1);
 if(stage!=='uber'&&stage!=='final')throw Error('FURNITURE_PREVIEW_POST_STAGE');
 return [rgb[0],rgb[1],rgb[2],stage==='final'?1:inputAlpha];
}
/** UI/Default, unclipped variant. The texture sample add is a real uniform,
 * not an inferred alpha correction. Returns premultiplied fragment output. */
export function nativePreviewUiPixel(sample:PreviewRGBA,vertex:PreviewRGBA,sampleAdd:PreviewRGBA):PreviewRGBA{
 finite(sample,4);finite(vertex,4);finite(sampleAdd,4);
 const alpha=roundEven(vertex[3]*255)*inv255*(sample[3]+sampleAdd[3]);
 return [(sample[0]+sampleAdd[0])*vertex[0]*alpha,
  (sample[1]+sampleAdd[1])*vertex[1]*alpha,
  (sample[2]+sampleAdd[2])*vertex[2]*alpha,alpha];
}
/** Original UI pass: One / OneMinusSrcAlpha for color AND alpha.
 * Both arguments are in the render target's blend space. */
export function nativePreviewUiBlend(src:PreviewRGBA,dst:PreviewRGBA):PreviewRGBA{
 finite(src,4);finite(dst,4);
 const k=1-src[3];
 return [src[0]+dst[0]*k,src[1]+dst[1]*k,src[2]+dst[2]*k,src[3]+dst[3]*k];
}
export const NATIVE_PREVIEW_UI_GLSL=`
vec4 nativePreviewUiPixel(vec4 texel, vec4 vertex, vec4 sampleAdd) {
  vertex.a = roundEven(vertex.a * 255.0) * 0.003921568859368563;
  vec4 c = (texel + sampleAdd) * vertex;
  c.rgb *= c.a;
  return c;
}
`;

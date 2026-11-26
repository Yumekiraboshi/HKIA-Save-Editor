/** Source-pinned DefaultVolumeProfile / ColorCurves from Steam 3.0.1.
 * Not a claim that this profile is the effective furniture camera volume.
 * The original curve texture uses 128 samples at i / 128, not i / 127.
 * Formats must be supplied explicitly from platform capability evidence.
 */
export type GradeCurveSlot=0|1|2|3|4|5|6|7;
export type GradeCurveFormat=45|5|8;
export const DEFAULT_GRADE_CURVE_SOURCE={
 version:'3.0.1',sourceSha256:'2e0b45213e7b65120e5aa72f5e1dd708e46abcc61ff9ceb2645d6f2e055227d6',
 profilePathId:'10324',profileSha256:'348ff93ae9e7d587b16c7cd2655569707a679f41f55b3ec11ebf04e9b5382ad5',
 curvePathId:'10352',curveSha256:'1534520ea482c526d94960d32db1d68608104e56374f141670003e83953c9229',
 sampleCount:128,sourceFidelity:'serialized-default-only'
} as const;
/** Exact TextureCurve.GetTextureFormat preference, based on SetPixels
 * capability. Native fallback is RGBA8, not a different curve. */
export function nativeGradeCurveFormat(r16SetPixels:boolean,r8SetPixels:boolean):GradeCurveFormat{
 if(typeof r16SetPixels!=='boolean'||typeof r8SetPixels!=='boolean')throw Error('FURNITURE_CURVE_CAPABILITY');
 return r16SetPixels?45:r8SetPixels?5:8;
}
const slotValid=(slot:number)=>Number.isInteger(slot)&&slot>=0&&slot<=7;
const sat=(x:number)=>Math.max(0,Math.min(1,x));
/** Original four two-key curves are linear from (0,0) to (1,1),
 * both tangents 1, unweighted. Four zero-key curves return m_ZeroValue=.5.
 * All native sample values are exactly representable in float16.
 * UNorm conversion uses nearest-byte diagnostic quantization. */
export function nativeDefaultGradeCurveTexels(slot:GradeCurveSlot,format:GradeCurveFormat){
 if(!slotValid(slot)||![45,5,8].includes(format))throw Error('FURNITURE_CURVE_SOURCE');
 const values=new Float32Array(128);
 for(let i=0;i<128;i++){
  const v=slot<4?i/128:.5;
  values[i]=format===45?v:Math.round(v*255)/255;
 }
 return values;
}
/** Compatible with nativeLdrBuilderPixel/buildNativeLdrLut curve callback.
 * Bilinear/clamp, one row and no mipmaps, as in TextureCurve.GetTexture. */
export function createNativeDefaultGradeCurveSampler(format:GradeCurveFormat){
 const textures=Array.from({length:8},(_,i)=>nativeDefaultGradeCurveTexels(i as GradeCurveSlot,format));
 return (slot:GradeCurveSlot,u:number)=>{
  if(!slotValid(slot)||!Number.isFinite(u))throw Error('FURNITURE_CURVE_SAMPLE');
  const x=sat(u)*128-.5,lo=Math.floor(x),t=x-lo,tex=textures[slot];
  const a=tex[Math.max(0,Math.min(127,lo))],b=tex[Math.max(0,Math.min(127,lo+1))];
  return a+(b-a)*t;
 };
}

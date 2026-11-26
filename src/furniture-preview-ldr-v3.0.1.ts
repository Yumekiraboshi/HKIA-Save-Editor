/** Isolated native LDR UberPost lookup operations. Original Steam v3.0.1
 * pixel programs 6/7/8. No invented LUT, grade, exposure or runtime selection.
 * The caller must provide the actual LUTs and shader uniform values. */
export type LutRgb=readonly [number,number,number];
export type LutRgba=readonly [number,number,number,number];
export type LutUv=readonly [number,number];
export type LutParameters=readonly [number,number,number];
export type LutSampler=(uv:LutUv)=>LutRgb;
const f=Math.fround,sat=(x:number)=>Math.min(1,Math.max(0,x));
const valid=(a:readonly number[],length:number)=>a.length===length&&a.every(Number.isFinite);
const rgb=(fn:(i:0|1|2)=>number):LutRgb=>[fn(0),fn(1),fn(2)];
export function nativeLdrLutCoordinates(c:LutRgb,p:LutParameters){
 if(!valid(c,3)||!valid(p,3)||p[0]<=0||p[1]<=0||p[2]<1)throw Error('FURNITURE_LUT_INPUT');
 const z=c[2]*p[2],slice=Math.floor(z);
 const u=(c[0]*p[2]+.5)*p[0]+slice*p[1],v=(c[1]*p[2]+.5)*p[1];
 return {lower:[u,v] as LutUv,upper:[u+p[1],v] as LutUv,weight:z-slice};
}
export function nativeLdrLutSample(c:LutRgb,p:LutParameters,sample:LutSampler):LutRgb{
 const q=nativeLdrLutCoordinates(c,p),a=sample(q.lower),b=sample(q.upper);
 if(!valid(a,3)||!valid(b,3))throw Error('FURNITURE_LUT_SAMPLE');
 return rgb(i=>a[i]+(b[i]-a[i])*q.weight);
}
export function nativeLinearToSrgb(c:number){
 if(!Number.isFinite(c))throw Error('FURNITURE_LUT_INPUT');
 return c<=f(.0031308)?c*f(12.9232101):Math.pow(Math.abs(c),f(1/2.4))*f(1.055)-f(.055);
}
export function nativeSrgbToLinear(c:number){
 if(!Number.isFinite(c))throw Error('FURNITURE_LUT_INPUT');
 return c<=f(.04045)?c*f(.07739938):Math.pow(Math.abs((c+f(.055))*f(.9478673)),f(2.4));
}
export type LdrPostInput={
 color:LutRgba;uv:LutUv;
 vignetteColor:LutRgb;vignetteAspect:number;
 vignetteCenter:LutUv;vignetteIntensity:number;vignetteSmoothness:number;
 exposureMultiplier:number;internalLut:LutParameters;
 userLut?:{parameters:LutParameters;weight:number;sample:LutSampler};
 output:'linear'|'gamma20'|'srgb';
};
/** No bloom, HDR grading or tonemapping keywords. Input is the actual
 * main texture sample. LUT sampling is explicitly level zero. */
export function nativeLdrPost(u:LdrPostInput,internalSample:LutSampler):LutRgba{
 if(!valid(u.color,4)||!valid(u.uv,2)||!valid(u.vignetteColor,3)||!valid(u.vignetteCenter,2)||
 ![u.vignetteAspect,u.vignetteIntensity,u.vignetteSmoothness,u.exposureMultiplier].every(Number.isFinite)||
 u.vignetteIntensity<0||u.vignetteSmoothness<0||u.exposureMultiplier<0||
 !['linear','gamma20','srgb'].includes(u.output))throw Error('FURNITURE_LDR_INPUT');
 let c:LutRgb=[u.color[0],u.color[1],u.color[2]];
 if(u.vignetteIntensity>0){
  const x=Math.abs(u.uv[0]-u.vignetteCenter[0])*u.vignetteIntensity*u.vignetteAspect,y=Math.abs(u.uv[1]-u.vignetteCenter[1])*u.vignetteIntensity;
  const w=Math.pow(Math.max(0,1-x*x-y*y),u.vignetteSmoothness);
  const v=c;c=rgb(i=>v[i]*(u.vignetteColor[i]+w*(1-u.vignetteColor[i])));
 }
 const exposed=c;c=rgb(i=>sat(exposed[i]*u.exposureMultiplier));
 if(u.userLut){
  const {weight,parameters,sample}=u.userLut;
  if(!Number.isFinite(weight)||weight<0||weight>1)throw Error('FURNITURE_LUT_WEIGHT');
  if(weight>0){
   const gamma=rgb(i=>nativeLinearToSrgb(c[i])),graded=nativeLdrLutSample(gamma,parameters,sample);
   c=rgb(i=>nativeSrgbToLinear(gamma[i]+weight*(graded[i]-gamma[i])));
  }
 }
 const graded=nativeLdrLutSample(c,u.internalLut,internalSample);
 return [...rgb(i=>u.output==='gamma20'?Math.sqrt(graded[i]):u.output==='srgb'?nativeLinearToSrgb(graded[i]):graded[i]),u.color[3]];
}
/** Original Switch 3.0.1 UniversalRenderer.Setup final-post predicate,
 * evaluated only for normal camera rendering, not special depth-only paths.
 * postDataAvailable is the resolved, non-null native PostProcessData. */
export function nativeRequiresFinalPost(s:{
 resolveFinalTarget:boolean;anyPostProcessingEnabled:boolean;postDataAvailable:boolean;
 antialiasing:0|1|2;imageScalingMode:0|1|2;upscalingFilter:0|1|2;
}):boolean{
 if(![s.resolveFinalTarget,s.anyPostProcessingEnabled,s.postDataAvailable].every(x=>typeof x==='boolean')||
 ![s.antialiasing,s.imageScalingMode,s.upscalingFilter].every(x=>[0,1,2].includes(x)))throw Error('FURNITURE_FINAL_POST_INPUT');
 return s.resolveFinalTarget&&s.anyPostProcessingEnabled&&s.postDataAvailable&&
 (s.antialiasing===1||(s.imageScalingMode===1&&s.upscalingFilter!==0));
}
export const NATIVE_LDR_LUT_GLSL=`
vec3 nativeLdrLut(sampler2D lut,vec3 color,vec3 p){
 float z=color.b*p.z,slice=floor(z);
 vec2 uv=(color.rg*p.z+.5)*p.xy;
 uv.x+=slice*p.y;
 vec3 a=textureLod(lut,uv,0.).rgb;
 vec3 b=textureLod(lut,uv+vec2(p.y,0.),0.).rgb;
 return a+(b-a)*(z-slice);
}
`;

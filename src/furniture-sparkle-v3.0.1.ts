/** Display-only translation of hash-pinned Steam 3.0.1 CustomLitSparkle
 * ForwardLit pixel blob 65. The two lighting lobes are not interchangeable
 * with ordinary CustomLitFurniture. Scene/lobe evaluation is not implemented
 * by these functions. All samples are in shader space. */
import type {Vec2,Vec3,Vec4} from './furniture-surface-v3.0.1';
const sat=(x:number)=>Math.min(1,Math.max(0,x));
const vec=(f:(i:number)=>number):Vec3=>[f(0),f(1),f(2)];
const finite=(v:readonly number[],n:number)=>v.length===n&&v.every(Number.isFinite);
const unit=(v:Vec3):Vec3=>{
 const len=Math.hypot(...v);
 if(!Number.isFinite(len)||len===0)throw Error('SPARKLE_NORMAL');
 return vec(i=>v[i]/len);
};
export type SparkleSurfaceInput={base:Vec4;combo:Vec4;baseColor:Vec4;smoothnessShift:number;metallicShift:number;occlusionStrength:number;normal:Vec4;noise:Vec3;noiseIntensity:number;baseUV:Vec2;noiseScale:number;frontFacing:boolean};
export function sparkleSurface(u:SparkleSurfaceInput){
 if(![u.base,u.combo,u.baseColor,u.normal].every(v=>finite(v,4))||!finite(u.noise,3)||!finite(u.baseUV,2)||
 ![u.smoothnessShift,u.metallicShift,u.occlusionStrength,u.noiseIntensity,u.noiseScale].every(Number.isFinite)||typeof u.frontFacing!=='boolean')throw Error('SPARKLE_SURFACE_INPUT');
 const x=2*u.normal[0]*u.normal[3]-1,y=2*u.normal[1]-1;
 const tangent:Vec3=[x,y,Math.max(Math.sqrt(1-Math.min(1,x*x+y*y)),Math.fround(1e-16))];
 const noise=unit(vec(i=>2*u.noise[i]-1));
 return {
  albedo:vec(i=>u.base[i]*u.baseColor[i]),alpha:u.base[3]*u.baseColor[3],
  rawRoughness:sat(u.combo[0]-u.smoothnessShift),rawMetallic:sat(u.combo[1]+u.metallicShift),
  occlusion:1+u.occlusionStrength*(u.combo[2]-1),emissionMask:u.combo[3],
  baseNormal:vec(i=>tangent[i]*(u.frontFacing?1:-1)),
  noiseNormal:unit(vec(i=>tangent[i]+noise[i]*u.noiseIntensity)),
  noiseUV:[u.baseUV[0]*u.noiseScale,u.baseUV[1]*u.noiseScale] as Vec2
 };
}
export type SparkleLayerInput={noiseIndirect:Vec3;baseIndirect:Vec3;sparkleTint:Vec3;noiseSpecular:Vec3;noiseSpec:number;directBase:Vec3;directLight:Vec3;emissionColor:Vec3;albedo:Vec3;alpha:number;occlusion:number;emissionMask:number};
/** Combine already evaluated native direct and indirect lobes, before rim/fog.
 * Alpha gates the noise contribution; it is NOT simply output opacity. */
export function sparkleCombine(u:SparkleLayerInput){
 if(![u.noiseIndirect,u.baseIndirect,u.sparkleTint,u.noiseSpecular,u.directBase,u.directLight,u.emissionColor,u.albedo].every(v=>finite(v,3))||
 ![u.noiseSpec,u.alpha,u.occlusion,u.emissionMask].every(Number.isFinite))throw Error('SPARKLE_LAYER_INPUT');
 const indirect=vec(i=>(u.baseIndirect[i]+u.noiseIndirect[i]*u.sparkleTint[i]*u.alpha)*u.occlusion);
 const lit=vec(i=>Math.max(0,u.directBase[i]+u.noiseSpecular[i]**2*u.noiseSpec*u.sparkleTint[i]*u.alpha)*u.directLight[i]+indirect[i]+u.albedo[i]*u.emissionMask*u.emissionColor[i]);
 return {indirect,lit};
}
/** Shared shader blocks for a future complete sparkle renderer. Inputs are
 * already decoded texture samples / native light lobes; no substitute assets. */
export const sparkleSurfaceGLSL=`
struct SparkleSurface {vec3 albedo;float alpha;float rough;float metal;float occlusion;float emissionMask;vec3 baseNormal;vec3 noiseNormal;vec2 noiseUV;};
SparkleSurface sparkleSurface(vec4 b,vec4 c,vec4 tint,float smoothShift,float metalShift,float occ,vec4 nm,vec3 noise,float intensity,vec2 baseUV,float scale,bool frontFacing){
 vec2 xy=vec2(nm.r*nm.a,nm.g)*2.-1.;
 vec3 tn=vec3(xy,max(sqrt(1.-min(1.,dot(xy,xy))),1e-16));
 return SparkleSurface(b.rgb*tint.rgb,b.a*tint.a,clamp(c.r-smoothShift,0.,1.),clamp(c.g+metalShift,0.,1.),1.+occ*(c.b-1.),c.a,
 tn*(frontFacing?1.:-1.),normalize(tn+normalize(noise*2.-1.)*intensity),baseUV*scale);
}
vec3 sparkleIndirect(vec3 base,vec3 noise,vec3 tint,float alpha,float occlusion){
 return (base+noise*tint*alpha)*occlusion;
}
vec3 sparkleCombine(vec3 directBase,vec3 noiseSpecular,float noiseSpec,vec3 tint,float alpha,vec3 directLight,vec3 indirect,vec3 albedo,float emissionMask,vec3 emissionColor){
 return max(vec3(0.),directBase+noiseSpecular*noiseSpecular*noiseSpec*tint*alpha)*directLight+indirect+albedo*emissionMask*emissionColor;
}
`;

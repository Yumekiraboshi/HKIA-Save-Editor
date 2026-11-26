/** CustomLitFlower v3.0.1 no-effect ForwardLit lighting.
 * All arguments are explicitly supplied shader-space values, not inferred scene
 * defaults. The original rim-only pixel program's token ranges are documented
 * in docs/flower-forward-lighting.md. No save parsing or mutation.
 */
import type {Vec3,Vec4} from './furniture-surface-v3.0.1';
import {furnitureTangentNormal} from './furniture-surface-v3.0.1';
import {furnitureReflectionCoordinates} from './furniture-lighting-v3.0.1';
const sat=(x:number)=>Math.max(0,Math.min(1,x));
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const map=(f:(i:number)=>number):Vec3=>[f(0),f(1),f(2)];
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const finite=(v:readonly number[],n:number)=>v.length===n&&v.every(Number.isFinite);
const unit=(v:Vec3):Vec3=>{const d=Math.hypot(...v);if(!Number.isFinite(d)||d===0)throw Error('FLOWER_LIGHTING_DIRECTION');return map(i=>v[i]/d);};
/** Original no-effect normal decode and face sign match the furniture shader.
 * basisRows are the three explicitly provided interpolated native TBN rows. */
export function flowerWorldNormal(sample:Vec4,frontFace:boolean,basisRows:readonly [Vec3,Vec3,Vec3]):Vec3{
 if(!finite(sample,4)||!sample.every(v=>v>=0&&v<=1)||typeof frontFace!=='boolean'||basisRows.length!==3||!basisRows.every(v=>finite(v,3)))throw Error('FLOWER_NORMAL_INPUT');
 const n=furnitureTangentNormal(sample,frontFace);
 return unit(map(i=>dot(n,basisRows[i])));
}
export type FlowerRim={power:number;feathering:number;intensity:number;coloring:number};
export type FlowerLightingInput={
 albedo:Vec3;roughness:number;metallic:number;occlusion:number;
 normal:Vec3;view:Vec3;lightDirection:Vec3;lightColor:Vec3;ambient:Vec3;
 reflection:Vec3;reflectionStrength:number;ambientSaturation:number;
 screenOcclusion:number;screenOcclusionStrength:number;emission:Vec3;
 rim:FlowerRim|null;fogMain:Vec3;fogFill:Vec3;fogVarying:number;fogMultiplier:number;
};
export function evaluateFlowerLighting(u:FlowerLightingInput){
 const vectors=[u.albedo,u.normal,u.view,u.lightDirection,u.lightColor,u.ambient,u.reflection,u.emission,u.fogMain,u.fogFill];
 const scalars=[u.roughness,u.metallic,u.occlusion,u.reflectionStrength,u.ambientSaturation,u.screenOcclusion,u.screenOcclusionStrength,u.fogVarying,u.fogMultiplier];
 if(!vectors.every(v=>finite(v,3))||!scalars.every(Number.isFinite)||![u.roughness,u.metallic,u.occlusion,u.screenOcclusion].every(v=>v>=0&&v<=1)||
 u.albedo.some(v=>v<0)||Math.abs(Math.hypot(...u.lightDirection)-1)>1e-5||
 (u.rim!==null&&(![u.rim.power,u.rim.feathering,u.rim.intensity,u.rim.coloring].every(Number.isFinite)||u.rim.power<0||u.rim.power>1)))throw Error('FLOWER_LIGHTING_INPUT');
 const n=unit(u.normal),v=unit(u.view),l=u.lightDirection,h=unit(map(i=>v[i]+l[i]));
 const om=.96*(1-u.metallic),diffuse=map(i=>u.albedo[i]*om),specular=map(i=>mix(.04,u.albedo[i],u.metallic));
 const r=Math.max(u.roughness*u.roughness,.0078125),r2=r*r;
 const grazing=sat(2-om-u.roughness),nv=sat(dot(n,v)),fresnel=(1-nv)**4;
 const brdf=map(i=>mix(specular[i],grazing,fresnel)/(1+r2));
 const ambient=map(i=>u.ambient[i]*(1+u.screenOcclusionStrength*(u.screenOcclusion-1)));
 const reflection=map(i=>u.reflection[i]*u.reflectionStrength);
 const saturation=(a:Vec3)=>{const gray=(a[0]+a[1]+a[2])/3;return map(i=>mix(gray,a[i],u.ambientSaturation));};
 const amb=saturation(ambient),refl=saturation(reflection);
 const ndh=sat(dot(n,h)),ldh=sat(dot(l,h)),den=(ndh*ndh*(r2-1)+1.00001)**2*Math.max(ldh*ldh,.1)*(4*r+2);
 const spec=Math.min(100,Math.max(0,r2/den-.00006103515625)),ndl=sat(dot(n,l));
 const lit=map(i=>(diffuse[i]+spec*specular[i])*ndl*u.lightColor[i]+(diffuse[i]*amb[i]+brdf[i]*refl[i]*ambient[i])*u.occlusion+u.emission[i]);
 let rimmed=lit;
 if(u.rim){
  const t=u.rim,base=(sat(1-dot(n,v))+.2)/1.2,exponent=mix(u.roughness,1,t.power);
  const a=sat((base**exponent-.15)/(10*Math.max(t.feathering,.01)));
  const strength=a*a*(3-2*a)*base*u.occlusion*t.intensity;
  const lum=dot(map(i=>sat(lit[i])),[.212673,.715152,.072175]);
  rimmed=map(i=>lit[i]+strength*mix(lum,u.albedo[i]**.45,t.coloring)*u.ambient[i]);
 }
 const ldv=-dot(l,v),wm=sat(.6*ldv+.4),wf=sat(-.6*ldv+.4),fog=u.fogVarying*u.fogMultiplier;
 return {lit,rimmed,color:map(i=>mix(rimmed[i],wm*u.fogMain[i]+wf*u.fogFill[i],fog)),reflection:furnitureReflectionCoordinates(n,v,u.roughness)};
}

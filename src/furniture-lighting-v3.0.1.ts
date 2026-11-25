/** Original keyword-free CustomLitFurniture ForwardLit lighting arithmetic.
 * All scene lighting, shader-space samples and varyings are supplied by the caller.
 * No guessed default light, texture lookup, shadow, interior, rim or post-process. */
import type {Vec3} from './furniture-surface-v3.0.1';
const f=Math.fround;
const sat=(x:number)=>Math.min(1,Math.max(0,x));
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const map=(fn:(i:number)=>number):Vec3=>[fn(0),fn(1),fn(2)];
function unit(v:Vec3):Vec3{const d=Math.sqrt(dot(v,v));if(!Number.isFinite(d)||d===0)throw Error('FURNITURE_LIGHTING_DIRECTION');return map(i=>v[i]/d);}
export type FurnitureLightingInput={albedo:Vec3;perceptualRoughness:number;metallic:number;occlusion:number;emissionColor:Vec3;emissionMask:number;normal:Vec3;view:Vec3;mainLightDirection:Vec3;mainLightColor:Vec3;ambient:Vec3;screenOcclusion:number;screenOcclusionStrength:number;reflectionPrimary:Vec3;reflectionSecondary:Vec3;reflectionBlendWeight:number;reflectionIntensity:number;reflectionStrength:number;ambientMain:Vec3;ambientFill:Vec3;fogVarying:number;fogMultiplier:number};
export function furnitureReflectionCoordinates(normal:Vec3,view:Vec3,perceptualRoughness:number){
 if(![...normal,...view,perceptualRoughness].every(Number.isFinite)||perceptualRoughness<0||perceptualRoughness>1)throw Error('FURNITURE_LIGHTING_INPUT');
 const n=unit(normal),v=unit(view),r=Math.max(perceptualRoughness**2,0.0078125),nv=dot(n,v);
 return {direction:map(i=>2*nv*n[i]-v[i]),lod:(f(1.7)-f(.7)*r)*r*6};
}
export function furnitureLighting(u:FurnitureLightingInput){
 const scalars=[u.perceptualRoughness,u.metallic,u.occlusion,u.emissionMask,u.screenOcclusion,u.screenOcclusionStrength,u.reflectionBlendWeight,u.reflectionIntensity,u.reflectionStrength,u.fogVarying,u.fogMultiplier];
 const vectors=[u.albedo,u.emissionColor,u.normal,u.view,u.mainLightDirection,u.mainLightColor,u.ambient,u.reflectionPrimary,u.reflectionSecondary,u.ambientMain,u.ambientFill];
 if(![...scalars,...vectors.flat()].every(Number.isFinite)||u.perceptualRoughness<0||u.perceptualRoughness>1||u.metallic<0||u.metallic>1||u.reflectionBlendWeight<0||u.reflectionBlendWeight>1)throw Error('FURNITURE_LIGHTING_INPUT');
 const n=unit(u.normal),v=unit(u.view),l=u.mainLightDirection,h=unit(map(i=>v[i]+l[i]));
 const oneMinusReflectivity=f(.96)*(1-u.metallic),diffuse=map(i=>u.albedo[i]*oneMinusReflectivity),specular=map(i=>(u.albedo[i]-f(.04))*u.metallic+f(.04));
 const r=Math.max(u.perceptualRoughness**2,.0078125),r2=r*r,grazing=Math.min(1,2-oneMinusReflectivity-u.perceptualRoughness),fresnel=(1-sat(dot(n,v)))**4;
 const reflectionBRDF=map(i=>(specular[i]+fresnel*(grazing-specular[i]))/(1+r2));
 const ambient=map(i=>u.ambient[i]*(1+u.screenOcclusionStrength*(u.screenOcclusion-1)));
 const refl=map(i=>u.reflectionPrimary[i]+u.reflectionBlendWeight*(u.reflectionSecondary[i]-u.reflectionPrimary[i]));
 const ndh=sat(dot(n,h)),ldh=sat(dot(l,h)),den=(ndh*ndh*(r2-1)+f(1.00001))**2*Math.max(ldh*ldh,f(.1))*(4*r+2);
 const spec=Math.min(100,Math.max(0,r2/den-0.00006103515625));
 const ndl=sat(dot(n,l));
 const lit=map(i=>(diffuse[i]+spec*specular[i])*ndl*u.mainLightColor[i]+ambient[i]*(diffuse[i]+refl[i]*u.reflectionIntensity*u.reflectionStrength*reflectionBRDF[i])*u.occlusion+u.albedo[i]*u.emissionColor[i]*u.emissionMask);
 const ldv=-dot(l,v),wm=sat(f(.6)*ldv+f(.4)),wf=sat(-f(.6)*ldv+f(.4)),fog=u.fogVarying*u.fogMultiplier;
 return {color:map(i=>lit[i]+fog*(wm*u.ambientMain[i]+wf*u.ambientFill[i]-lit[i])),reflection:furnitureReflectionCoordinates(n,v,u.perceptualRoughness)};
}

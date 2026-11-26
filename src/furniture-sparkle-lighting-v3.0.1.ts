/** Hash-pinned CustomLitSparkle rim-only ForwardLit pixel lighting, evaluated
 * at the original screen/cubemap sampling boundaries. Unlike the furniture
 * shader, direct specular is squared in both lobes and rim luminance comes
 * from gamma-transformed albedo. No automatic runtime light/variant selection. */
import type {Vec3,Vec4} from './furniture-surface-v3.0.1';
import {sparkleCombine} from './furniture-sparkle-v3.0.1';
const f=Math.fround,sat=(x:number)=>Math.min(1,Math.max(0,x));
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const vec=(fn:(i:number)=>number):Vec3=>[fn(0),fn(1),fn(2)];
const unit=(v:Vec3):Vec3=>{const n=Math.hypot(...v);if(!Number.isFinite(n)||n===0)throw Error('SPARKLE_LIGHTING_DIRECTION');return vec(i=>v[i]/n);};
const finite=(v:readonly number[],n:number)=>v.length===n&&v.every(Number.isFinite);
export type SparkleLightingInput={
 albedo:Vec3;roughness:number;metallic:number;occlusion:number;alpha:number;emissionMask:number;emissionColor:Vec3;
 normal:Vec3;noiseNormal:Vec3;view:Vec3;lightDirection:Vec3;lightColor:Vec3;ambient:Vec3;
 screenOcclusion:number;screenOcclusionStrength:number;reflectionBlendWeight:number;reflectionIntensity:number;
 reflectionStrength:number;noiseReflectionStrength:number;noiseRoughness:number;noiseMetal:number;sparkleTint:Vec3;
 primary:Vec3;secondary:Vec3;noisePrimary:Vec3;noiseSecondary:Vec3;rim:Vec4;fogVarying:number;fogMultiplier:number;
 ambientMain:Vec3;ambientFill:Vec3;materialAlpha:number
};
export function sparkleReflectionCoordinates(normal:Vec3,view:Vec3,roughness:number){
 if(!finite(normal,3)||!finite(view,3)||!Number.isFinite(roughness)||roughness<0||roughness>1)throw Error('SPARKLE_LIGHTING_INPUT');
 const n=unit(normal),v=unit(view),r=Math.max(roughness**2,.0078125);
 return {direction:vec(i=>2*dot(n,v)*n[i]-v[i]),lod:(f(1.7)-f(.7)*r)*r*6};
}
export function sparkleLighting(u:SparkleLightingInput){
 const values=[u.roughness,u.metallic,u.occlusion,u.alpha,u.emissionMask,u.screenOcclusion,u.screenOcclusionStrength,u.reflectionBlendWeight,u.reflectionIntensity,u.reflectionStrength,u.noiseReflectionStrength,u.noiseRoughness,u.noiseMetal,u.fogVarying,u.fogMultiplier,u.materialAlpha];
 if(!values.every(Number.isFinite)||![u.roughness,u.metallic,u.noiseRoughness,u.noiseMetal,u.reflectionBlendWeight].every(v=>v>=0&&v<=1)||
 ![u.albedo,u.emissionColor,u.normal,u.noiseNormal,u.view,u.lightDirection,u.lightColor,u.ambient,u.sparkleTint,u.primary,u.secondary,u.noisePrimary,u.noiseSecondary,u.ambientMain,u.ambientFill].every(v=>finite(v,3))||
 !finite(u.rim,4)||u.albedo.some(x=>x<0)||u.rim[0]<0||u.rim[1]<0)throw Error('SPARKLE_LIGHTING_INPUT');
 const n=unit(u.normal),nn=unit(u.noiseNormal),v=unit(u.view),l=u.lightDirection;
 if(Math.abs(Math.hypot(...l)-1)>1e-5)throw Error('SPARKLE_LIGHTING_DIRECTION');
 const h=unit(vec(i=>v[i]+l[i])),ldh=sat(dot(l,h));
 const ambient=vec(i=>u.ambient[i]*(1+u.screenOcclusionStrength*(u.screenOcclusion-1)));
 function lobe(normal:Vec3,rough:number,metal:number,p:Vec3,s:Vec3,strength:number,noise:boolean){
  const r=Math.max(rough**2,.0078125),r2=r*r,om=f(.96)*(1-metal);
  const diffuse=vec(i=>u.albedo[i]*om),specular=vec(i=>(u.albedo[i]-f(.04))*metal+f(.04));
  const grazing=noise?sat(2-om-rough):Math.min(1,2-om-rough);
  const fresnel=(1-sat(dot(normal,v)))**4;
  const brdf=vec(i=>(specular[i]+(grazing-specular[i])*fresnel)/(1+r2));
  const indirect=vec(i=>ambient[i]*(diffuse[i]+(p[i]+u.reflectionBlendWeight*(s[i]-p[i]))*u.reflectionIntensity*strength*brdf[i]));
  const ndh=sat(dot(normal,h));
  const den=(ndh*ndh*(r2-1)+f(1.00001))**2*Math.max(ldh*ldh,f(.1))*(4*r+2);
  const spec=Math.min(100,Math.max(0,r2/den-.00006103515625));
  return {indirect,specular,spec,direct:vec(i=>diffuse[i]+spec*specular[i]**2)};
 }
 const b=lobe(n,u.roughness,u.metallic,u.primary,u.secondary,u.reflectionStrength,false);
 const noise=lobe(nn,u.noiseRoughness,u.noiseMetal,u.noisePrimary,u.noiseSecondary,u.noiseReflectionStrength,true);
 const pre=sparkleCombine({noiseIndirect:noise.indirect,baseIndirect:b.indirect,sparkleTint:u.sparkleTint,noiseSpecular:noise.specular,noiseSpec:noise.spec,directBase:b.direct,directLight:vec(i=>sat(dot(n,l))*u.lightColor[i]),emissionColor:u.emissionColor,albedo:u.albedo,alpha:u.alpha,occlusion:u.occlusion,emissionMask:u.emissionMask}).lit;
 const [power,feather,intensity,coloring]=u.rim,q=(sat(1-dot(n,v))+f(.2))*f(5/6),p=u.roughness*(1-power)+power;
 const t=sat((q**p-f(.15))/(Math.max(feather,f(.01))*10)),weight=t*t*(3-2*t)*q*u.occlusion*intensity;
 const gamma=vec(i=>u.albedo[i]**f(.45)),gray=dot(gamma,[f(.21),f(.72),f(.01)]);
 const lit=vec(i=>pre[i]+weight*(gray+coloring*(gamma[i]-gray))*ambient[i]);
 const ldv=-dot(l,v),wm=sat(f(.6)*ldv+f(.4)),wf=sat(-f(.6)*ldv+f(.4));
 return {pre,color:vec(i=>lit[i]+u.fogVarying*u.fogMultiplier*(wm*u.ambientMain[i]+wf*u.ambientFill[i]-lit[i])),baseReflection:sparkleReflectionCoordinates(n,v,u.roughness),noiseReflection:sparkleReflectionCoordinates(nn,v,u.noiseRoughness),alpha:u.materialAlpha<.5?1:u.alpha};
}

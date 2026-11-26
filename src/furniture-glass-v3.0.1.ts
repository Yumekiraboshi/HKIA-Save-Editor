/** Steam 3.0.1 CustomLitRefractive high-quality rim-only ForwardLit pixel
 * blob 191. REFRACTION_ON is absent on the original glass furniture
 * materials. This diagnostic uses the original pixel arithmetic and explicit
 * caller scene values, not a claim of native preview-scene parity. */
import type {Vec3,Vec4} from './furniture-surface-v3.0.1';
import type {RugNativeSources} from './furniture-rug-source';
import type {FurnitureForwardMaterial} from './furniture-forwardlit-gpu';
const sat=(x:number)=>Math.min(1,Math.max(0,x)),f=Math.fround;
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const rgb=(fn:(i:0|1|2)=>number):Vec3=>[fn(0),fn(1),fn(2)];
const normalize=(v:Vec3,floor=0):Vec3=>{const n=Math.sqrt(Math.max(floor,dot(v,v)));return rgb(i=>v[i]/n);};
export type GlassPixelInput={
 base:Vec4;tint:Vec4;normalSample:Vec4;tangentRows:readonly [Vec3,Vec3,Vec3];
 view:Vec3;light:Vec3;lightColor:Vec3;ambientMain:Vec3;ambientFill:Vec3;emission:Vec3;
 primary:Vec3;secondary:Vec3;roughness:number;metallic:number;lightingClamp:number;
 reflectionBlend:number;reflectionIntensity:number;rim:Vec4;fog:number;
};
export function evaluateGlassPixel(u:GlassPixelInput){
 const x=2*u.normalSample[0]*u.normalSample[3]-1,y=2*u.normalSample[1]-1;
 const tn:Vec3=[x,y,Math.sqrt(1-Math.min(1,x*x+y*y))];
 const n=normalize(rgb(i=>dot(u.tangentRows[i],tn))),v=normalize(u.view,.00006103515625),l=u.light;
 const alb=rgb(i=>u.base[i]*u.tint[i]),ndv=dot(n,v),ndl=dot(n,l),h=normalize(rgb(i=>v[i]+l[i]));
 const om=f(.96)*(1-u.metallic),rough=u.roughness,r=Math.max(rough*rough,.0078125),r2=r*r;
 const diff=rgb(i=>alb[i]*om),spec=rgb(i=>f(.04)+(alb[i]-f(.04))*u.metallic);
 const grazing=sat(2-om-rough),fresnel=(1-sat(ndv))**4;
 const ambient=(d:number)=>rgb(i=>sat(f(.6)*d+f(.4))*u.ambientMain[i]+sat(-f(.6)*d+f(.4))*u.ambientFill[i]);
 const amb=ambient(ndl),refl=rgb(i=>u.primary[i]+(u.secondary[i]-u.primary[i])*u.reflectionBlend);
 const den=(sat(dot(n,h))**2*(r2-1)+f(1.00001))**2*Math.max(sat(dot(l,h))**2,f(.1))*(4*r+2);
 const s=Math.min(100,Math.max(0,r2/den-.00006103515625));
 const pre=rgb(i=>Math.min(u.lightingClamp,(diff[i]+s*spec[i])*sat(ndl)*u.lightColor[i]+amb[i]*(diff[i]+refl[i]*u.reflectionIntensity*(spec[i]+(grazing-spec[i])*fresnel)/(1+r2))+alb[i]*u.emission[i]));
 const q=(sat(1-dot(n,normalize(v)))+f(.2))*f(.8333333333333333),p=rough*(1-u.rim[0])+u.rim[0];
 const t=sat((q**p-f(.15))/(Math.max(u.rim[1],f(.01))*10)),weight=t*t*(3-2*t)*q*u.rim[2];
 const gamma=rgb(i=>alb[i]**f(.45)),gray=dot(gamma,[f(.21),f(.72),f(.01)]);
 const lit=rgb(i=>pre[i]+weight*(gray+(gamma[i]-gray)*u.rim[3])*amb[i]),fogColor=ambient(-dot(l,v));
 const color=rgb(i=>lit[i]+(fogColor[i]-lit[i])*u.fog);
 return {rgba:[...color,u.base[3]*u.tint[3]] as Vec4,direction:rgb(i=>2*ndv*n[i]-v[i]),lod:(f(1.7)-f(.7)*r)*r*6};
}
export const nativeGlassGLSL=`
vec3 glassAmbient(float d, vec3 main, vec3 fill) {
 return clamp(.6*d+.4,0.,1.)*main+clamp(-.6*d+.4,0.,1.)*fill;
}
vec3 nativeGlassNormal(vec4 bump,mat3 basis) {
 vec2 xy=vec2(bump.r*bump.a,bump.g)*2.-1.;
 return normalize(basis*vec3(xy,sqrt(1.-min(1.,dot(xy,xy)))));
}
vec3 nativeGlassLight(vec3 albedo,vec3 n,vec3 v,vec3 l,vec3 lc,
 float rough,float metal,float lightClamp,vec3 refl,vec3 em,vec4 rim,
 vec3 ambientMain,vec3 ambientFill,float fog) {
 float om=.96*(1.-metal),r=max(rough*rough,.0078125),r2=r*r;
 vec3 diffuse=albedo*om,specular=mix(vec3(.04),albedo,metal);
 float ndl=dot(n,l),ndv=dot(n,v),fr=1.-clamp(ndv,0.,1.);
 fr*=fr;fr*=fr;
 vec3 amb=glassAmbient(ndl,ambientMain,ambientFill);
 vec3 h=normalize(v+l);
 float ndh=clamp(dot(n,h),0.,1.),ldh=clamp(dot(l,h),0.,1.);
 float den=ndh*ndh*(r2-1.)+1.00001;
 den=den*den*max(ldh*ldh,.1)*(4.*r+2.);
 float s=clamp(r2/den-.00006103515625,0.,100.);
 vec3 indirect=amb*(diffuse+refl*mix(specular,vec3(clamp(2.-om-rough,0.,1.)),fr)/(1.+r2));
 vec3 pre=min(vec3(lightClamp),(diffuse+s*specular)*clamp(ndl,0.,1.)*lc+indirect+albedo*em);
 float q=(clamp(1.-dot(n,normalize(v)),0.,1.)+.2)*.8333333333333333;
 float t=clamp((pow(q,rough*(1.-rim.x)+rim.x)-.15)/(max(rim.y,.01)*10.),0.,1.);
 vec3 gamma=pow(albedo,vec3(.45));float gray=dot(gamma,vec3(.21,.72,.01));
 vec3 lit=pre+t*t*(3.-2.*t)*q*rim.z*mix(vec3(gray),gamma,rim.w)*amb;
 return mix(lit,glassAmbient(-dot(l,v),ambientMain,ambientFill),fog);
}
`;
export const glassShaderId='CAB-46b8f8fe122147493b3113f7c1c8cd0f:-245959077359590779';
export const glassShaderHash='39080ec3a7154ee8032ee36bab5f861630dfe745b3bd1e35ad275662b1c6e332';
export type GlassState={queue:3001|3201;srcBlend:1|3;dstBlend:10;zWrite:false;cull:2};
const finite=(v:readonly number[]|undefined,n:number)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
const fail=(s:string):never=>{throw Error('FURNITURE_GLASS_'+s);};
/** Gate the actual fixed PAPE26 glass and shared shelf glass separately.
 * Neither enables the REFRACTION_ON variant or invents a missing map. */
export function glassMaterialState(base:RugNativeSources['base'],id:string):GlassState{
 const m=base.materials[id];
 if(!m||m.shader!==glassShaderId||base.shaders[glassShaderId]?.objectSha256!==glassShaderHash||m.validKeywords.length!==1||m.validKeywords[0]!=='CUSTOM_RIMLIGHT_ON')return fail('SOURCE');
 const expected=id==='CAB-9a3da43ca266ea5645a6445a7d9fd3c3:8738455483337011380'?['a1d4aa4fd2c08828c06ae21279fb288a95bc8a4acb8108b5b59928188725796f',3201,3] as const:
 id==='CAB-b7b9619989a948060360e493812c1b7f:635830900356876204'?['1e84276455f6138a4564ae0e7cd6da21556f8a63c776dd24d621002f45e6d2ee',3001,1] as const:null;
 if(!expected||m.objectSha256!==expected[0]||m.renderQueue!==expected[1])return fail('IDENTITY');
 const f=m.floats;
 if(f._Material_SrcBlend!==expected[2]||f._Material_DstBlend!==10||f._ZWrite!==0||f._Cull!==2||f._Refraction_Intensity!==0||
 f.CUSTOM_RIMLIGHT!==1||f.GLIMMER!==0||f.EFFECT_OPALESCENT!==0||f._AlphaClip!==0||f._Geometry_VertexOffset!==0||f._Geometry_NormalScale!==1)return fail('STATE');
 return {queue:expected[1],srcBlend:expected[2],dstBlend:10,zWrite:false,cull:2};
}
export function resolveGlassFixedMaterial(base:RugNativeSources['base'],id:string){
 const state=glassMaterialState(base,id),m=base.materials[id],f=m.floats,c=m.colors;
 if(!finite(c._BaseColor,4)||!finite(c._EmissionColor,4)||![f._Roughness,f._Metallic,f._Lighting_Clamp,f._Lighting_RimPower,f._Lighting_RimFeathering,f._Lighting_RimIntensity,f._Lighting_RimColoring].every(Number.isFinite)||
 ![f._Roughness,f._Metallic].every(x=>x>=0&&x<=1)||f._Lighting_Clamp<0)return fail('PROPERTIES');
 const tex=(name:string)=>{
  const link=m.textures[name];if(!link||link.scale.join(',')!=='1,1'||link.offset.join(',')!=='0,0')return fail('TEXTURE_LINK');
  // Shared_Glass names Unity built-ins white/bump via null pointers.
  // Their actual built-in texture pixels are not extracted yet.
  if(!link.texture)return fail('BUILTIN_TEXTURE_UNVERIFIED');
  const t=base.textures[link.texture];if(!t)return fail('TEXTURE');return t;
 };
 const b=tex('_BaseMap'),n=tex('_BumpMap');
 const material:FurnitureForwardMaterial={
  baseColor:c._BaseColor,baseST:[1,1,0,0],patternST:[1,1,0,0],patternTint:[1,1,1,1],
  useBaseMapMask:false,worldUV:false,rotationTurns:0,rotationCenter:[0,0],
  smoothnessShift:0,metallicShift:0,patternSmoothnessShift:0,patternMetallicShift:0,occlusionStrength:1,
  glass:{roughness:f._Roughness,metallic:f._Metallic,lightingClamp:f._Lighting_Clamp,
   rim:[f._Lighting_RimPower,f._Lighting_RimFeathering,f._Lighting_RimIntensity,f._Lighting_RimColoring]}
 };
 return {state,material,emissionColor:c._EmissionColor.slice(0,3) as unknown as Vec3,
  textures:{baseMap:b,normalMap:n,comboMap:b},fidelity:'native-glass-pixel-diagnostic' as const};
}

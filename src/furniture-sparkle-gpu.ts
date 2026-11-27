/** Display-only Sparkle rim-only diagnostic GPU path.
 * Reuses native texture and mesh transport. Vertex transform and explicit
 * ambient are diagnostic; this is not native scene/vertex-light parity. */
import {sparkleSurfaceGLSL} from './furniture-sparkle-v3.0.1';
import type {FurnitureForwardScene} from './furniture-forwardlit-gpu';
import {nativeMeshDrawRange,type UploadedNativeMesh} from './native-furniture-mesh';
import type {RugNativeSources} from './furniture-rug-source';
import type {Vec3,Vec4} from './furniture-surface-v3.0.1';
export const sparkleLightingGLSL=`
float sparkSat(float x){return clamp(x,0.,1.);}
vec4 sparkleReflection(vec3 n,vec3 v,float rough){
 float r=max(rough*rough,.0078125);
 return vec4(2.*dot(n,v)*n-v,(1.7-.7*r)*r*6.);
}
struct SparkleLobe {vec3 indirect;vec3 specular;float spec;vec3 direct;};
SparkleLobe sparkleLobe(vec3 albedo,vec3 n,vec3 v,vec3 h,float ldh,float rough,float metal,vec3 ambient,vec3 reflection,float strength,bool noise){
 float r=max(rough*rough,.0078125),r2=r*r,om=.96*(1.-metal);
 vec3 diffuse=albedo*om,specular=mix(vec3(.04),albedo,metal);
 float grazing=2.-om-rough;grazing=noise?sparkSat(grazing):min(1.,grazing);
 float fresnel=1.-sparkSat(dot(n,v));fresnel*=fresnel;fresnel*=fresnel;
 vec3 brdf=mix(specular,vec3(grazing),fresnel)/(1.+r2);
 vec3 indirect=ambient*(diffuse+reflection*strength*brdf);
 float ndh=sparkSat(dot(n,h)),den=ndh*ndh*(r2-1.)+1.00001;
 den=den*den*max(ldh*ldh,.1)*(4.*r+2.);
 float spec=clamp(r2/den-.00006103515625,0.,100.);
 return SparkleLobe(indirect,specular,spec,diffuse+spec*specular*specular);
}
struct SparkleLightResult {vec3 pre;vec3 color;};
SparkleLightResult sparkleLight(SparkleSurface s,vec3 n,vec3 nn,vec3 v,vec3 l,vec3 lc,vec3 ambient,float ao,float aoStrength,vec3 baseReflection,vec3 noiseReflection,float reflStrength,float noiseStrength,float noiseRough,float noiseMetal,vec3 tint,vec3 emission,vec4 rim,float fog,vec3 ambientMain,vec3 ambientFill){
 vec3 h=normalize(v+l);float ldh=sparkSat(dot(l,h));
 vec3 amb=ambient*(1.+aoStrength*(ao-1.));
 SparkleLobe b=sparkleLobe(s.albedo,n,v,h,ldh,s.rough,s.metal,amb,baseReflection,reflStrength,false);
 SparkleLobe a=sparkleLobe(s.albedo,nn,v,h,ldh,noiseRough,noiseMetal,amb,noiseReflection,noiseStrength,true);
 vec3 indirect=sparkleIndirect(b.indirect,a.indirect,tint,s.alpha,s.occlusion);
 vec3 pre=sparkleCombine(b.direct,a.specular,a.spec,tint,s.alpha,sparkSat(dot(n,l))*lc,indirect,s.albedo,s.emissionMask,emission);
 float q=(sparkSat(1.-dot(n,v))+.2)*.8333333333333333,p=s.rough*(1.-rim.x)+rim.x;
 float t=sparkSat((pow(q,p)-.15)/(max(rim.y,.01)*10.));
 float weight=t*t*(3.-2.*t)*q*s.occlusion*rim.z;
 vec3 gamma=pow(s.albedo,vec3(.45));float gray=dot(gamma,vec3(.21,.72,.01));
 vec3 lit=pre+weight*mix(vec3(gray),gamma,rim.w)*amb;
 float ldv=-dot(l,v),wm=sparkSat(.6*ldv+.4),wf=sparkSat(-.6*ldv+.4);
 return SparkleLightResult(pre,mix(lit,wm*ambientMain+wf*ambientFill,fog));
}
`;
export const sparkleVertex=`#version 300 es
precision highp float;
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in vec4 tangent;
layout(location=4) in vec2 uv0;
uniform mat4 model,viewProjection;
uniform mat3 normalMatrix;
uniform float tangentParity;
uniform vec4 baseST;
out vec2 baseUV;
out vec3 worldPosition,worldNormal,worldTangent,worldBitangent;
void main(){
 vec4 p=model*vec4(position,1.);gl_Position=viewProjection*p;worldPosition=p.xyz;
 worldNormal=normalize(normalMatrix*normal);worldTangent=normalize(mat3(model)*tangent.xyz);
 worldBitangent=cross(worldNormal,worldTangent)*tangent.w*tangentParity;
 baseUV=uv0*baseST.xy+baseST.zw;
}
`;
export const sparkleFragment=`#version 300 es
precision highp float;
in vec2 baseUV;
in vec3 worldPosition,worldNormal,worldTangent,worldBitangent;
uniform sampler2D baseMap,normalMap,comboMap,noiseMap;
uniform samplerCube reflectionPrimary,reflectionSecondary;
uniform vec4 baseColor,rim;
uniform float smoothnessShift,metallicShift,occlusionStrength,noiseIntensity,noiseScale,noiseRoughness,noiseMetal,materialAlpha;
uniform float screenOcclusion,screenOcclusionStrength,reflectionBlendWeight,reflectionIntensity,reflectionStrength,noiseReflectionStrength,fogVarying,fogMultiplier;
uniform vec3 cameraPosition,mainLightDirection,mainLightColor,ambient,emissionColor,sparkleTint,ambientMain,ambientFill;
out vec4 color;
`+sparkleSurfaceGLSL+sparkleLightingGLSL+`
void main(){
 SparkleSurface s=sparkleSurface(texture(baseMap,baseUV),texture(comboMap,baseUV),baseColor,smoothnessShift,metallicShift,occlusionStrength,texture(normalMap,baseUV),texture(noiseMap,baseUV*noiseScale).rgb,noiseIntensity,baseUV,noiseScale,gl_FrontFacing);
 mat3 basis=mat3(worldTangent,worldBitangent,worldNormal);
 vec3 n=normalize(basis*s.baseNormal),nn=normalize(basis*s.noiseNormal),v=normalize(cameraPosition-worldPosition);
 vec4 b=sparkleReflection(n,v,s.rough),a=sparkleReflection(nn,v,noiseRoughness);
 vec3 br=mix(textureLod(reflectionPrimary,b.xyz,b.w).rgb,textureLod(reflectionSecondary,b.xyz,b.w).rgb,reflectionBlendWeight)*reflectionIntensity;
 vec3 nr=mix(textureLod(reflectionPrimary,a.xyz,a.w).rgb,textureLod(reflectionSecondary,a.xyz,a.w).rgb,reflectionBlendWeight)*reflectionIntensity;
 SparkleLightResult r=sparkleLight(s,n,nn,v,mainLightDirection,mainLightColor,ambient,screenOcclusion,screenOcclusionStrength,br,nr,reflectionStrength,noiseReflectionStrength,noiseRoughness,noiseMetal,sparkleTint,emissionColor,rim,fogVarying*fogMultiplier,ambientMain,ambientFill);
 color=vec4(r.color,materialAlpha<.5?1.:s.alpha);
}
`;
export type SparkleGpuMaterial={
 baseST:Vec4;baseColor:Vec4;rim:Vec4;sparkleTint:Vec3;noiseIntensity:number;noiseScale:number;noiseRoughness:number;noiseMetal:number;
 smoothnessShift:number;metallicShift:number;occlusionStrength:number;noiseReflectionStrength:number;materialAlpha:number;
};
const textureNames=['baseMap','normalMap','comboMap','noiseMap','reflectionPrimary','reflectionSecondary'] as const;
export type SparkleGpuTextures=Record<typeof textureNames[number],WebGLTexture>;
const sceneVectors=['cameraPosition','mainLightDirection','mainLightColor','ambient','emissionColor','ambientMain','ambientFill'] as const;
const sceneFloats=['screenOcclusion','screenOcclusionStrength','reflectionBlendWeight','reflectionIntensity','reflectionStrength','fogVarying','fogMultiplier','tangentParity'] as const;
const materialFloats=['smoothnessShift','metallicShift','occlusionStrength','noiseIntensity','noiseScale','noiseRoughness','noiseMetal','noiseReflectionStrength','materialAlpha'] as const;
const finite=(v:readonly number[],n:number)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
const fail=(s:string):never=>{throw Error('SPARKLE_GPU_'+s);};
export function validateSparkleGpuInputs(s:FurnitureForwardScene,m:SparkleGpuMaterial){
 if(!finite(s.model,16)||!finite(s.viewProjection,16)||!finite(s.normalMatrix,9)||![1,-1].includes(s.tangentParity)||
 !sceneVectors.every(k=>finite(s[k],3))||!sceneFloats.every(k=>Number.isFinite(s[k]))||Math.abs(Math.hypot(...s.mainLightDirection)-1)>1e-5||s.reflectionBlendWeight<0||s.reflectionBlendWeight>1||
 ![m.baseST,m.baseColor,m.rim].every(v=>finite(v,4))||!finite(m.sparkleTint,3)||!materialFloats.every(k=>Number.isFinite(m[k]))||
 ![m.noiseRoughness,m.noiseMetal].every(x=>x>=0&&x<=1)||m.rim[0]<0||m.rim[1]<0||m.materialAlpha!==0)fail('INPUT');
}
/** Resolve only the original fixed GIVE25 Sparkle material, not its customized
 * candle/bow or other Sparkle variants. No synthetic substitute textures. */
export function resolveSparkleFixedMaterial(base:RugNativeSources['base'],id:string){
 const m=base.materials[id],shader='CAB-2b27edbfe7f08bad1cd631865ee4eb15:-2527260696058741820';
 if(!m||m.shader!==shader||m.objectSha256!=='6f14880f811a3c74f9b44374a5482e1652849144b672c43b14623ccd47dfd6c6'||
 base.shaders[shader]?.objectSha256!=='1d7fcbcf451083bffb545d5490fa8a894cf373f0f7b03dd834a89f21e07e7e9a'||m.validKeywords.length!==1||m.validKeywords[0]!=='CUSTOM_RIMLIGHT_ON')throw Error('SPARKLE_GPU_SOURCE');
 const f=m.floats,c=m.colors;
 if(f.CUSTOM_RIMLIGHT!==1||f._Material_Alpha!==0||f._AlphaClip!==0||f._ZWrite!==1||f._Cull!==0||f.GLIMMER!==0)fail('FEATURE');
 const tex=(key:string)=>{
  const l=m.textures[key];if(!l||!l.texture||l.scale.join(',')!=='1,1'||l.offset.join(',')!=='0,0')throw Error('SPARKLE_GPU_TEXTURE');
  const t=base.textures[l.texture];if(!t)throw Error('SPARKLE_GPU_TEXTURE');return t;
 };
 const noiseMap=tex('_NoiseMap');if(noiseMap.sha256!=='32a69f4556559ad246668292638068e0e352cfe2415c4314df9778c352573c20')fail('NOISE_SOURCE');
 const rgb=(key:string):Vec3=>{const v=c[key];if(!v||!finite(v,4))throw Error('SPARKLE_GPU_COLOR');return [v[0],v[1],v[2]];};
 const material:SparkleGpuMaterial={baseST:[1,1,0,0],baseColor:c._BaseColor,rim:[f._Lighting_RimPower,f._Lighting_RimFeathering,f._Lighting_RimIntensity,f._Lighting_RimColoring],sparkleTint:rgb('_SparkleTint'),smoothnessShift:f._Smoothness_Shift,metallicShift:f._Metallic_Shift,occlusionStrength:f._OcclusionStrength,noiseIntensity:f._NoiseIntensity,noiseScale:f._NoiseScale,noiseRoughness:f._NoiseRoughness,noiseMetal:f._NoiseMetal,noiseReflectionStrength:f._NoiseReflectionStrength,materialAlpha:f._Material_Alpha};
 return {material,reflectionStrength:f._ReflectionStrength,emissionColor:rgb('_EmissionColor'),textures:{baseMap:tex('_BaseMap'),normalMap:tex('_BumpMap'),comboMap:tex('_MetallicGlossMap'),noiseMap},fidelity:'sparkle-part-diagnostic-only' as const};
}
/** Isolated GPU program, caller owns native verified resources and framebuffer.
 * No implicit full-model rendering of a multi-material mesh. */
export function createSparkleGpuRenderer(gl:WebGL2RenderingContext){
 const program=gl.createProgram();if(!program)throw Error('SPARKLE_GPU_PROGRAM');
 const shaders:WebGLShader[]=[],uniforms=new Map<string,WebGLUniformLocation>();
 try{
  for(const [type,src] of [[gl.VERTEX_SHADER,sparkleVertex],[gl.FRAGMENT_SHADER,sparkleFragment]] as const){
   const sh=gl.createShader(type);if(!sh)throw Error('SPARKLE_GPU_SHADER');shaders.push(sh);gl.shaderSource(sh,src);gl.compileShader(sh);
   if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error('SPARKLE_GPU_COMPILE '+gl.getShaderInfoLog(sh));gl.attachShader(program,sh);
  }
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('SPARKLE_GPU_LINK '+gl.getProgramInfoLog(program));
  for(const name of ['model','viewProjection','normalMatrix','baseST','baseColor','rim','sparkleTint',...sceneVectors,...sceneFloats,...materialFloats,...textureNames]){
   const loc=gl.getUniformLocation(program,name);if(loc===null)throw Error('SPARKLE_GPU_UNIFORM '+name);uniforms.set(name,loc);
  }
 }catch(e){gl.deleteProgram(program);throw e;}finally{for(const sh of shaders)gl.deleteShader(sh);}
 const u=(name:string)=>uniforms.get(name)!;let disposed=false;
 return {draw(mesh:UploadedNativeMesh,textures:SparkleGpuTextures,s:FurnitureForwardScene,m:SparkleGpuMaterial,submeshIndex:number){
  if(disposed)fail('DISPOSED');validateSparkleGpuInputs(s,m);const range=nativeMeshDrawRange(mesh,submeshIndex);
  if(!gl.isVertexArray(mesh.vao)||textureNames.some(k=>!gl.isTexture(textures[k])))fail('RESOURCES');
  if(gl.getError()!==gl.NO_ERROR)fail('GPU_DIRTY');gl.useProgram(program);gl.bindVertexArray(mesh.vao);
  gl.uniformMatrix4fv(u('model'),false,new Float32Array(s.model));gl.uniformMatrix4fv(u('viewProjection'),false,new Float32Array(s.viewProjection));gl.uniformMatrix3fv(u('normalMatrix'),false,new Float32Array(s.normalMatrix));
  for(const k of sceneVectors)gl.uniform3fv(u(k),new Float32Array(s[k]));for(const k of sceneFloats)gl.uniform1f(u(k),s[k]);
  for(const k of materialFloats)gl.uniform1f(u(k),m[k]);for(const k of ['baseST','baseColor','rim'] as const)gl.uniform4fv(u(k),new Float32Array(m[k]));
  gl.uniform3fv(u('sparkleTint'),new Float32Array(m.sparkleTint));
  for(const [i,k] of textureNames.entries()){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(i<4?gl.TEXTURE_2D:gl.TEXTURE_CUBE_MAP,textures[k]);gl.uniform1i(u(k),i);}
  gl.drawElements(gl.TRIANGLES,range.indexCount,mesh.indexFormat===1?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT,range.firstByte);
  if(gl.getError()!==gl.NO_ERROR)fail('DRAW');
 },dispose(){if(!disposed){disposed=true;gl.deleteProgram(program);}}};
}

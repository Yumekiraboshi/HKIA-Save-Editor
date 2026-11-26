/** Diagnostic GPU bridge for the recovered keyword-free ForwardLit arithmetic.
 * Geometry/texture inputs must already be uploaded using native source helpers.
 * Camera, tangent basis, lights, emission mask, fog and ambient varyings are
 * explicit caller inputs: this is not the native scene selection or final icon. */
import type {Vec2,Vec3,Vec4,FurnitureSurfaceUniforms} from './furniture-surface-v3.0.1';
import type {UploadedNativeMesh} from './native-furniture-mesh';
import {furnitureRimGLSL,validateFurnitureRim,type FurnitureRimParameters} from './furniture-rim-v3.0.1';
export const furnitureForwardVertex=`#version 300 es
precision highp float;
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in vec4 tangent;
layout(location=4) in vec2 uv0;
layout(location=5) in vec2 uv1;
uniform mat4 model, viewProjection;
uniform mat3 normalMatrix;
uniform float tangentParity, rotationTurns;
uniform vec4 baseST, patternST;
uniform bool worldUV;
uniform vec2 rotationCenter;
out vec2 bUV,pUV;
out vec3 worldPosition, worldNormal, worldTangent, worldBitangent;
void main(){
 vec4 p=model*vec4(position,1.);
 gl_Position=viewProjection*p;
 worldPosition=p.xyz;
 worldNormal=normalize(normalMatrix*normal);
 worldTangent=normalize(mat3(model)*tangent.xyz);
 worldBitangent=cross(worldNormal,worldTangent)*tangent.w*tangentParity;
 vec2 a=worldUV?p.xz/4.:uv0,b=worldUV?a:uv1,c=worldUV?vec2(0.):rotationCenter;
 bUV=a*baseST.xy+baseST.zw;
 vec2 q=b*patternST.xy+patternST.zw-c;
 float theta=rotationTurns*6.283185307179586,s=sin(theta),co=cos(theta);
 pUV=vec2(co*q.x+s*q.y,-s*q.x+co*q.y)+c;
}`;
/** Separate pure shader function permits independently supplied native-token fixtures. */
export const furnitureForwardLightingGLSL=furnitureRimGLSL+`
float sat(float v){return clamp(v,0.,1.);}
vec4 reflectionCoordinates(vec3 n,vec3 v,float rough){
 float r=max(rough*rough,.0078125);
 return vec4(2.*dot(n,v)*n-v,(1.7-.7*r)*r*6.);
}
vec3 evaluateLightingWithRim(vec3 albedo,float rough,float metallic,float occlusion,
 vec3 n,vec3 v,vec3 l,vec3 mainLightColor,vec3 ambient,
 float screenOcclusion,float screenOcclusionStrength,vec3 primary,vec3 secondary,
 float reflectionBlendWeight,float reflectionIntensity,float reflectionStrength,
 vec3 emissionColor,float emissionMask,vec3 ambientMain,vec3 ambientFill,
 float fogVarying,float fogMultiplier,bool rimEnabled,vec4 rim){
 vec3 h=normalize(v+l);
 float oneMinusReflectivity=.96*(1.-metallic);
 vec3 diffuse=albedo*oneMinusReflectivity,specular=mix(vec3(.04),albedo,metallic);
 float r=max(rough*rough,.0078125),r2=r*r;
 float grazing=min(1.,2.-oneMinusReflectivity-rough),fresnel=1.-sat(dot(n,v));
 fresnel*=fresnel;fresnel*=fresnel;
 vec3 reflectionBRDF=mix(specular,vec3(grazing),fresnel)/(1.+r2);
 vec3 amb=ambient*(1.+screenOcclusionStrength*(screenOcclusion-1.));
 vec3 refl=mix(primary,secondary,reflectionBlendWeight);
 float ndh=sat(dot(n,h)),ldh=sat(dot(l,h));
 float den=ndh*ndh*(r2-1.)+1.00001;
 den=den*den*max(ldh*ldh,.1)*(4.*r+2.);
 float spec=clamp(r2/den-.00006103515625,0.,100.);
 vec3 lit=(diffuse+spec*specular)*sat(dot(n,l))*mainLightColor+
 amb*(diffuse+refl*reflectionIntensity*reflectionStrength*reflectionBRDF)*occlusion+
 albedo*emissionColor*emissionMask;
 if(rimEnabled)lit=evaluateFurnitureRim(albedo,rough,dot(n,v),occlusion,ambient,lit,rim);
 float ldv=-dot(l,v),wm=sat(.6*ldv+.4),wf=sat(-.6*ldv+.4);
 return mix(lit,wm*ambientMain+wf*ambientFill,fogVarying*fogMultiplier);
}
vec3 evaluateLighting(vec3 albedo,float rough,float metallic,float occlusion,vec3 n,vec3 v,vec3 l,vec3 mainLightColor,vec3 ambient,float screenOcclusion,float screenOcclusionStrength,vec3 primary,vec3 secondary,float reflectionBlendWeight,float reflectionIntensity,float reflectionStrength,vec3 emissionColor,float emissionMask,vec3 ambientMain,vec3 ambientFill,float fogVarying,float fogMultiplier){
 return evaluateLightingWithRim(albedo,rough,metallic,occlusion,n,v,l,mainLightColor,ambient,screenOcclusion,screenOcclusionStrength,primary,secondary,reflectionBlendWeight,reflectionIntensity,reflectionStrength,emissionColor,emissionMask,ambientMain,ambientFill,fogVarying,fogMultiplier,false,vec4(0.));
}
`;
export const furnitureForwardFragment=`#version 300 es
precision highp float;
in vec2 bUV,pUV;
in vec3 worldPosition,worldNormal,worldTangent,worldBitangent;
uniform sampler2D baseMap,patternMap,comboMap,normalMap;
uniform samplerCube reflectionPrimary,reflectionSecondary;
uniform vec4 baseColor,patternTint;
uniform bool useBaseMapMask,rimEnabled;
uniform vec4 rimParameters;
uniform float smoothnessShift,metallicShift,patternSmoothnessShift,patternMetallicShift,occlusionStrength;
uniform vec3 cameraPosition,mainLightDirection,mainLightColor,ambient,emissionColor,ambientMain,ambientFill;
uniform float screenOcclusion,screenOcclusionStrength,reflectionBlendWeight,reflectionIntensity,reflectionStrength,emissionMask,fogVarying,fogMultiplier;
out vec4 color;
`+furnitureForwardLightingGLSL+`
void main(){
 vec4 b=texture(baseMap,bUV),p=texture(patternMap,pUV),c=texture(comboMap,bUV),nm=texture(normalMap,bUV);
 float w=baseColor.a>0.?(useBaseMapMask?b.a:1.):0.;
 vec3 albedo=mix(p.rgb*patternTint.rgb,b.rgb*baseColor.rgb,w);
 float rough=sat(sat(c.r-smoothnessShift)-mix(patternSmoothnessShift,smoothnessShift,w));
 float metallic=sat(sat(c.g+metallicShift)+mix(patternMetallicShift,metallicShift,w));
 float occlusion=1.+occlusionStrength*(c.b-1.);
 vec2 xy=vec2(nm.r*nm.a,nm.g)*2.-1.;
 vec3 tn=vec3(xy,sqrt(max(0.,1.-min(1.,dot(xy,xy)))))*(gl_FrontFacing?1.:-1.);
 vec3 n=normalize(mat3(worldTangent,worldBitangent,worldNormal)*tn);
 vec3 v=normalize(cameraPosition-worldPosition);
 vec4 refl=reflectionCoordinates(n,v,rough);
 vec3 rp=textureLod(reflectionPrimary,refl.xyz,refl.w).rgb;
 vec3 rs=textureLod(reflectionSecondary,refl.xyz,refl.w).rgb;
 color=vec4(evaluateLightingWithRim(albedo,rough,metallic,occlusion,n,v,mainLightDirection,
 mainLightColor,ambient,screenOcclusion,screenOcclusionStrength,rp,rs,
 reflectionBlendWeight,reflectionIntensity,reflectionStrength,emissionColor,emissionMask,
 ambientMain,ambientFill,fogVarying,fogMultiplier,rimEnabled,rimParameters),1.);
}`;

export type FurnitureForwardScene={
 model:readonly number[];viewProjection:readonly number[];normalMatrix:readonly number[];
 tangentParity:1|-1;cameraPosition:Vec3;mainLightDirection:Vec3;mainLightColor:Vec3;
 ambient:Vec3;emissionColor:Vec3;ambientMain:Vec3;ambientFill:Vec3;
 screenOcclusion:number;screenOcclusionStrength:number;reflectionBlendWeight:number;
 reflectionIntensity:number;reflectionStrength:number;emissionMask:number;fogVarying:number;fogMultiplier:number;
};
export type FurnitureForwardMaterial=FurnitureSurfaceUniforms&{baseST:Vec4;patternST:Vec4;rotationTurns:number;rotationCenter:Vec2;worldUV:boolean;rim?:FurnitureRimParameters};
export type FurnitureForwardTextures={baseMap:WebGLTexture;patternMap:WebGLTexture;comboMap:WebGLTexture;normalMap:WebGLTexture;reflectionPrimary:WebGLTexture;reflectionSecondary:WebGLTexture};
const textureNames=['baseMap','patternMap','comboMap','normalMap','reflectionPrimary','reflectionSecondary'] as const;
const sceneVectors=['cameraPosition','mainLightDirection','mainLightColor','ambient','emissionColor','ambientMain','ambientFill'] as const;
const sceneScalars=['screenOcclusion','screenOcclusionStrength','reflectionBlendWeight','reflectionIntensity','reflectionStrength','emissionMask','fogVarying','fogMultiplier'] as const;
const materialScalars=['smoothnessShift','metallicShift','patternSmoothnessShift','patternMetallicShift','occlusionStrength','rotationTurns'] as const;
const finite=(a:readonly number[],length:number)=>a.length===length&&a.every(Number.isFinite);
export function validateFurnitureForwardInputs(s:FurnitureForwardScene,m:FurnitureForwardMaterial){
 if(m.rim!==undefined)validateFurnitureRim(m.rim);
 if(!finite(s.model,16)||!finite(s.viewProjection,16)||!finite(s.normalMatrix,9)||![1,-1].includes(s.tangentParity)||
 !sceneVectors.every(k=>finite(s[k],3))||!sceneScalars.every(k=>Number.isFinite(s[k]))||
 Math.abs(Math.hypot(...s.mainLightDirection)-1)>1e-5||s.reflectionBlendWeight<0||s.reflectionBlendWeight>1||
 ![m.baseColor,m.patternTint,m.baseST,m.patternST].every(x=>finite(x,4))||!finite(m.rotationCenter,2)||
 !materialScalars.every(k=>Number.isFinite(m[k]))||typeof m.worldUV!=='boolean'||typeof m.useBaseMapMask!=='boolean')throw Error('FURNITURE_FORWARD_INPUT');
}
/** Owns only the shader program. Use an isolated WebGL2 context and explicitly
 * configure framebuffer, viewport, culling, depth, clear and output conversion.
 * Caller owns all geometry/textures. Output is linear shader-space RGBA. */
export function createFurnitureForwardRenderer(gl:WebGL2RenderingContext){
 const compile=(type:number,source:string)=>{
  const s=gl.createShader(type);if(!s)throw Error('FURNITURE_FORWARD_SHADER');
  gl.shaderSource(s,source);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const e=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error('FURNITURE_FORWARD_COMPILE '+e);}
  return s;
 };
 const program=gl.createProgram();if(!program)throw Error('FURNITURE_FORWARD_PROGRAM');
 let vs:WebGLShader|undefined,fs:WebGLShader|undefined;
 const uniforms=new Map<string,WebGLUniformLocation>();
 try{
  vs=compile(gl.VERTEX_SHADER,furnitureForwardVertex);fs=compile(gl.FRAGMENT_SHADER,furnitureForwardFragment);
  gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('FURNITURE_FORWARD_LINK '+gl.getProgramInfoLog(program));
  const names=['model','viewProjection','normalMatrix','tangentParity','baseST','patternST','rotationCenter','worldUV','baseColor','patternTint','useBaseMapMask','rimEnabled','rimParameters',...textureNames,...sceneVectors,...sceneScalars,...materialScalars];
  for(const name of names){const u=gl.getUniformLocation(program,name);if(u===null)throw Error('FURNITURE_FORWARD_UNIFORM '+name);uniforms.set(name,u);}
 }catch(e){gl.deleteProgram(program);throw e;}
 finally{if(vs)gl.deleteShader(vs);if(fs)gl.deleteShader(fs);}
 const u=(name:string)=>uniforms.get(name)!;let disposed=false;
 return {
  draw(mesh:UploadedNativeMesh,textures:FurnitureForwardTextures,s:FurnitureForwardScene,m:FurnitureForwardMaterial){
   if(disposed)throw Error('FURNITURE_FORWARD_DISPOSED');
   validateFurnitureForwardInputs(s,m);
   if(!Number.isInteger(mesh.indexCount)||mesh.indexCount<=0||mesh.indexCount%3||!gl.isVertexArray(mesh.vao)||textureNames.some(k=>!gl.isTexture(textures[k])))throw Error('FURNITURE_FORWARD_RESOURCES');
   if(gl.getError()!==gl.NO_ERROR)throw Error('FURNITURE_FORWARD_GPU_DIRTY');
   gl.useProgram(program);gl.bindVertexArray(mesh.vao);
   gl.uniformMatrix4fv(u('model'),false,new Float32Array(s.model));gl.uniformMatrix4fv(u('viewProjection'),false,new Float32Array(s.viewProjection));gl.uniformMatrix3fv(u('normalMatrix'),false,new Float32Array(s.normalMatrix));
   gl.uniform1f(u('tangentParity'),s.tangentParity);
   for(const k of sceneVectors)gl.uniform3fv(u(k),new Float32Array(s[k]));
   for(const k of sceneScalars)gl.uniform1f(u(k),s[k]);
   for(const k of materialScalars)gl.uniform1f(u(k),m[k]);
   for(const k of ['baseST','patternST','baseColor','patternTint'] as const)gl.uniform4fv(u(k),new Float32Array(m[k]));
   gl.uniform2fv(u('rotationCenter'),new Float32Array(m.rotationCenter));gl.uniform1i(u('worldUV'),Number(m.worldUV));gl.uniform1i(u('useBaseMapMask'),Number(m.useBaseMapMask));
   gl.uniform1i(u('rimEnabled'),Number(m.rim!==undefined));
   const rim=m.rim;gl.uniform4fv(u('rimParameters'),new Float32Array(rim?[rim.power,rim.feathering,rim.intensity,rim.coloring]:[0,0,0,0]));
   for(const [i,k] of textureNames.entries()){
    gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(i<4?gl.TEXTURE_2D:gl.TEXTURE_CUBE_MAP,textures[k]);gl.uniform1i(u(k),i);
   }
   gl.drawElements(gl.TRIANGLES,mesh.indexCount,gl.UNSIGNED_SHORT,0);
   if(gl.getError()!==gl.NO_ERROR)throw Error('FURNITURE_FORWARD_DRAW');
  },
  dispose(){if(!disposed){disposed=true;gl.deleteProgram(program);}}
 };
}

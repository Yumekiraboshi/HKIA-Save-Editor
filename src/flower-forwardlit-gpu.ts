import {furnitureForwardVertex,furnitureForwardLightingGLSL} from './furniture-forwardlit-gpu';
import type {Vec3,Vec4} from './furniture-surface-v3.0.1';
import type {FlowerSurfaceUniforms} from './flower-native-surface';
import type {FlowerRim} from './flower-native-lighting';
import type {UploadedNativeMesh} from './native-furniture-mesh';

/** Reuse the shared authored transform, TBN and UV transport for diagnostics;
 * the exact flower runtime wind, pose, ambient varyings and camera remain
 * external requirements. No native thumbnail equivalence claim. */
export const flowerForwardVertex=furnitureForwardVertex;
export const flowerForwardLightingGLSL=`
vec3 flowerLighting(vec3 albedo,float rough,float metallic,float occlusion,
 vec3 n,vec3 v,vec3 l,vec3 lightColor,vec3 ambient,vec3 reflection,
 float reflectionStrength,float ambientSaturation,float screenOcclusion,float screenOcclusionStrength,
 vec3 emission,bool rimOn,vec4 rim,vec3 fogMain,vec3 fogFill,float fogVarying,float fogMultiplier,
 out vec3 lit,out vec3 rimmed){
 vec3 h=normalize(v+l);
 float om=.96*(1.-metallic),r=max(rough*rough,.0078125),r2=r*r;
 vec3 diffuse=albedo*om,specular=mix(vec3(.04),albedo,metallic);
 float grazing=sat(2.-om-rough),fresnel=1.-sat(dot(n,v));
 fresnel*=fresnel;fresnel*=fresnel;
 vec3 brdf=mix(specular,vec3(grazing),fresnel)/(1.+r2);
 vec3 amb=ambient*(1.+screenOcclusionStrength*(screenOcclusion-1.)),refl=reflection*reflectionStrength;
 vec3 ambS=mix(vec3(dot(amb,vec3(1./3.))),amb,ambientSaturation);
 vec3 reflS=mix(vec3(dot(refl,vec3(1./3.))),refl,ambientSaturation);
 float ndh=sat(dot(n,h)),ldh=sat(dot(l,h)),den=ndh*ndh*(r2-1.)+1.00001;
 den=den*den*max(ldh*ldh,.1)*(4.*r+2.);
 float spec=clamp(r2/den-.00006103515625,0.,100.);
 lit=(diffuse+spec*specular)*sat(dot(n,l))*lightColor+(diffuse*ambS+brdf*reflS*amb)*occlusion+emission;
 rimmed=lit;
 if(rimOn){
  float base=(sat(1.-dot(n,v))+.2)/1.2;
  float a=sat((pow(base,mix(rough,1.,rim.x))-.15)/(10.*max(rim.y,.01)));
  float strength=a*a*(3.-2.*a)*base*occlusion*rim.z;
  float lum=dot(clamp(lit,0.,1.),vec3(.212673,.715152,.072175));
  rimmed+=strength*mix(vec3(lum),pow(albedo,vec3(.45)),rim.w)*ambient;
 }
 float ldv=-dot(l,v),wm=sat(.6*ldv+.4),wf=sat(-.6*ldv+.4);
 return mix(rimmed,wm*fogMain+wf*fogFill,fogVarying*fogMultiplier);
}
`;
export const flowerForwardFragment=`#version 300 es
precision highp float;
in vec2 bUV,pUV;
in vec3 worldPosition,worldNormal,worldTangent,worldBitangent;
uniform sampler2D baseMap,patternMap,comboMap,normalMap;
uniform samplerCube reflectionMap;
uniform vec4 baseColor;
uniform vec3 patternColor1,patternColor2,emissionColor;
uniform float smoothnessShift,metallicShift,patternSmoothnessShift,patternMetallicShift,occlusionStrength;
uniform vec3 cameraPosition,lightDirection,lightColor,ambient,fogMain,fogFill;
uniform float reflectionStrength,ambientSaturation,screenOcclusion,screenOcclusionStrength,fogVarying,fogMultiplier,mipBias;
uniform bool rimOn;
uniform vec4 rim;
out vec4 color;
`+furnitureForwardLightingGLSL+flowerForwardLightingGLSL+`
void main(){
 vec4 b=texture(baseMap,bUV,mipBias),c=texture(comboMap,bUV,mipBias),nm=texture(normalMap,bUV,mipBias);
 float p=texture(patternMap,pUV,mipBias).r;
 float w=baseColor.a>0.?b.a:0.;
 vec3 albedo=mix(mix(patternColor2,patternColor1,p),b.rgb*baseColor.rgb,w);
 float rough=sat(sat(c.r-smoothnessShift)-mix(patternSmoothnessShift,smoothnessShift,w));
 float metallic=sat(sat(c.g+metallicShift)+mix(patternMetallicShift,metallicShift,w));
 float occlusion=1.+occlusionStrength*(c.b-1.);
 vec2 xy=vec2(nm.r*nm.a,nm.g)*2.-1.;
 vec3 tn=vec3(xy,sqrt(max(0.,1.-min(1.,dot(xy,xy)))))*(gl_FrontFacing?1.:-1.);
 vec3 n=normalize(mat3(worldTangent,worldBitangent,worldNormal)*tn),v=normalize(cameraPosition-worldPosition);
 vec4 rc=reflectionCoordinates(n,v,rough);
 vec3 refl=textureLod(reflectionMap,rc.xyz,rc.w).rgb;
 vec3 lit,rimmed;
 color=vec4(flowerLighting(albedo,rough,metallic,occlusion,n,v,lightDirection,lightColor,ambient,refl,
 reflectionStrength,ambientSaturation,screenOcclusion,screenOcclusionStrength,albedo*emissionColor*c.a,
 rimOn,rim,fogMain,fogFill,fogVarying,fogMultiplier,lit,rimmed),1.);
}
`;
export type FlowerForwardScene={
 model:readonly number[];viewProjection:readonly number[];normalMatrix:readonly number[];tangentParity:1|-1;
 cameraPosition:Vec3;lightDirection:Vec3;lightColor:Vec3;ambient:Vec3;fogMain:Vec3;fogFill:Vec3;
 screenOcclusion:number;screenOcclusionStrength:number;fogVarying:number;fogMultiplier:number;mipBias:number;
};
export type FlowerForwardMaterial=FlowerSurfaceUniforms&{
 baseST:Vec4;patternST:Vec4;emissionColor:Vec3;reflectionStrength:number;ambientSaturation:number;rim:FlowerRim|null;
};
export type FlowerForwardTextures={baseMap:WebGLTexture;patternMap:WebGLTexture;comboMap:WebGLTexture;normalMap:WebGLTexture;reflectionMap:WebGLTexture};
const textureNames=['baseMap','patternMap','comboMap','normalMap','reflectionMap'] as const;
const sceneVectors=['cameraPosition','lightDirection','lightColor','ambient','fogMain','fogFill'] as const;
const sceneScalars=['screenOcclusion','screenOcclusionStrength','fogVarying','fogMultiplier','mipBias'] as const;
const materialScalars=['smoothnessShift','metallicShift','patternSmoothnessShift','patternMetallicShift','occlusionStrength','reflectionStrength','ambientSaturation'] as const;
const materialVec3=['patternColor1','patternColor2','emissionColor'] as const;
const materialVec4=['baseColor','baseST','patternST'] as const;
const finite=(v:readonly number[],n:number)=>v.length===n&&v.every(Number.isFinite);
const fail=(m:string):never=>{throw Error('FLOWER_FORWARD_'+m);};
export function validateFlowerForwardInputs(s:FlowerForwardScene,m:FlowerForwardMaterial){
 if(!finite(s.model,16)||!finite(s.viewProjection,16)||!finite(s.normalMatrix,9)||![1,-1].includes(s.tangentParity)||
 !sceneVectors.every(k=>finite(s[k],3))||!sceneScalars.every(k=>Number.isFinite(s[k]))||
 Math.abs(Math.hypot(...s.lightDirection)-1)>1e-5||s.screenOcclusion<0||s.screenOcclusion>1||
 !materialScalars.every(k=>Number.isFinite(m[k]))||!materialVec3.every(k=>finite(m[k],3))||!materialVec4.every(k=>finite(m[k],4))||
 m.surfaceEffect!==0||m.baseColor.slice(0,3).some(x=>x<0)||m.patternColor1.some(x=>x<0)||m.patternColor2.some(x=>x<0)||
 (m.rim!==null&&(![m.rim.power,m.rim.feathering,m.rim.intensity,m.rim.coloring].every(Number.isFinite)||m.rim.power<0)))fail('INPUT');
}
/** Caller owns isolated context and native textures/cube (including proven face
 * orientation), depth/culling, framebuffer and final color conversion. */
export function createFlowerForwardRenderer(gl:WebGL2RenderingContext){
 if(gl.getError()!==gl.NO_ERROR)fail('DIRTY');
 const shaders:WebGLShader[]=[];let program:WebGLProgram|null=null;
 try{
  for(const [type,source] of [[gl.VERTEX_SHADER,flowerForwardVertex],[gl.FRAGMENT_SHADER,flowerForwardFragment]] as const){
   const sh=gl.createShader(type);if(!sh)throw Error('FLOWER_FORWARD_SHADER');shaders.push(sh);
   gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))fail('COMPILE '+gl.getShaderInfoLog(sh));
  }
  program=gl.createProgram();if(!program)throw Error('FLOWER_FORWARD_PROGRAM');const p=program;
  for(const sh of shaders)gl.attachShader(p,sh);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))fail('LINK '+gl.getProgramInfoLog(p));
  const names=['model','viewProjection','normalMatrix','tangentParity','worldUV','rotationTurns','rotationCenter','rimOn','rim',...textureNames,...sceneVectors,...sceneScalars,...materialScalars,...materialVec3,...materialVec4];
  const uniforms=new Map(names.map(n=>[n,gl.getUniformLocation(p,n)]));if([...uniforms.values()].some(v=>v===null))fail('UNIFORM');
  const u=(name:string)=>uniforms.get(name)!;let disposed=false;
  return {
   draw(mesh:UploadedNativeMesh,textures:FlowerForwardTextures,s:FlowerForwardScene,m:FlowerForwardMaterial){
    if(disposed)fail('DISPOSED');validateFlowerForwardInputs(s,m);
    if(!Number.isInteger(mesh.indexCount)||mesh.indexCount<=0||mesh.indexCount%3||!gl.isVertexArray(mesh.vao)||textureNames.some(k=>!gl.isTexture(textures[k])))fail('RESOURCE');
    if(gl.getError()!==gl.NO_ERROR)fail('DIRTY');
    gl.useProgram(p);gl.bindVertexArray(mesh.vao);
    gl.uniformMatrix4fv(u('model'),false,new Float32Array(s.model));gl.uniformMatrix4fv(u('viewProjection'),false,new Float32Array(s.viewProjection));gl.uniformMatrix3fv(u('normalMatrix'),false,new Float32Array(s.normalMatrix));
    gl.uniform1f(u('tangentParity'),s.tangentParity);gl.uniform1i(u('worldUV'),0);gl.uniform1f(u('rotationTurns'),0);gl.uniform2f(u('rotationCenter'),0,0);
    for(const k of sceneVectors)gl.uniform3fv(u(k),new Float32Array(s[k]));
    for(const k of sceneScalars)gl.uniform1f(u(k),s[k]);
    for(const k of materialScalars)gl.uniform1f(u(k),m[k]);
    for(const k of materialVec3)gl.uniform3fv(u(k),new Float32Array(m[k]));
    for(const k of materialVec4)gl.uniform4fv(u(k),new Float32Array(m[k]));
    const rim=m.rim;gl.uniform1i(u('rimOn'),rim?1:0);gl.uniform4f(u('rim'),rim?.power??0,rim?.feathering??0,rim?.intensity??0,rim?.coloring??0);
    for(const [i,k] of textureNames.entries()){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(i===4?gl.TEXTURE_CUBE_MAP:gl.TEXTURE_2D,textures[k]);gl.uniform1i(u(k),i);}
    gl.drawElements(gl.TRIANGLES,mesh.indexCount,gl.UNSIGNED_SHORT,0);if(gl.getError()!==gl.NO_ERROR)fail('DRAW');
   },
   dispose(){if(!disposed){disposed=true;gl.deleteProgram(p);}}
  };
 }catch(e){if(program)gl.deleteProgram(program);throw e;}
 finally{for(const sh of shaders)gl.deleteShader(sh);}
}

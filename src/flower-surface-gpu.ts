import type {FlowerSurfaceUniforms} from './flower-native-surface';
import {uploadNativeGeometry,type NativeGeometrySource,type UploadedNativeMesh} from './native-furniture-mesh';
import {uploadNativeTexture,type NativeTextureSource,type Bc1Mode} from './native-texture-upload';

/** Source-derived surface diagnostic, not a complete CustomLitFlower render.
 * Native vertex DXBC SHA 5cd10a88525c0eda465f99a94eff25440751096e6f6a71fb003efce14d2073a8.
 * ISGN: TEXCOORD0=v4, TEXCOORD1=v5. SHEX words [2493,2515):
 * bff3c1e53aa695c3a8b0f494de4d7e25e712542bb8772314bf91d22dd8ba06be.
 * Explicit object-to-clip matrix, no vertex wind, lighting or final color transform.
 */
export const FLOWER_SURFACE_VERTEX=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=4) in vec2 aUV0;
layout(location=5) in vec2 aUV1;
uniform mat4 uClipFromObject;
uniform vec4 uBaseST,uPatternST;
out vec2 vBaseUV,vPatternUV;
void main(){
 gl_Position=uClipFromObject*vec4(aPosition,1.0);
 vBaseUV=aUV0*uBaseST.xy+uBaseST.zw;
 vPatternUV=aUV1*uPatternST.xy+uPatternST.zw;
}
`;
export const FLOWER_SURFACE_FRAGMENT=`#version 300 es
precision highp float;
in vec2 vBaseUV,vPatternUV;
uniform sampler2D uBaseMap,uPatternMap,uComboMap;
uniform vec4 uBaseColor;
uniform vec3 uPatternColor1,uPatternColor2;
uniform vec4 uShifts;
uniform float uOcclusionStrength,uMipBias;
uniform int uOutput;
out vec4 outputColor;
float sat(float x){return clamp(x,0.0,1.0);}
void main(){
 vec4 base=texture(uBaseMap,vBaseUV,uMipBias);
 float patternRed=texture(uPatternMap,vPatternUV,uMipBias).r;
 vec4 combo=texture(uComboMap,vBaseUV,uMipBias);
 float weight=uBaseColor.a>0.0?base.a:0.0;
 vec3 albedo=mix(mix(uPatternColor2,uPatternColor1,patternRed),base.rgb*uBaseColor.rgb,weight);
 float rough=sat(sat(combo.r-uShifts.x)-mix(uShifts.z,uShifts.x,weight));
 float metallic=sat(sat(combo.g+uShifts.y)+mix(uShifts.w,uShifts.y,weight));
 float occlusion=mix(1.0,combo.b,uOcclusionStrength);
 outputColor=vec4(uOutput==0?albedo:vec3(rough,metallic,occlusion),1.0);
}
`;
type Vec4=readonly [number,number,number,number];
export type FlowerSurfaceDraw={
 clipFromObject:readonly number[];baseST:Vec4;patternST:Vec4;surface:FlowerSurfaceUniforms;
 mipBias:number;output:'albedo'|'material';
};
type TextureKey='baseMap'|'patternMap'|'comboMap';
type SurfaceTextures=Record<TextureKey,WebGLTexture>;
export type FlowerSurfaceSources={geometry:NativeGeometrySource;meshId:string;textures:Record<TextureKey,NativeTextureSource>};
export type FlowerSurfacePayload={kind:'geometry'|'texture';sha256:string;bytes:number};
const fail=(why:string):never=>{throw Error('FLOWER_SURFACE_GPU_'+why);};
function finite(v:readonly number[],n:number){return v.length===n&&v.every(Number.isFinite);}
export function validateFlowerSurfaceDraw(d:FlowerSurfaceDraw){
 const u=d.surface;
 if(u.surfaceEffect!==0||!finite(d.clipFromObject,16)||!finite(d.baseST,4)||!finite(d.patternST,4)||
 !finite(u.baseColor,4)||!finite(u.patternColor1,3)||!finite(u.patternColor2,3)||
 !finite([u.smoothnessShift,u.metallicShift,u.patternSmoothnessShift,u.patternMetallicShift,u.occlusionStrength,d.mipBias],6)||
 (d.output!=='albedo'&&d.output!=='material'))fail('INPUT');
}
/** Caller owns the isolated context and framebuffer, viewport, depth and culling.
 * Output is linear diagnostic data, not a ready-to-display game thumbnail. */
export function createFlowerSurfaceRenderer(gl:WebGL2RenderingContext){
 if(gl.getError()!==gl.NO_ERROR)fail('DIRTY');
 const shaders:WebGLShader[]=[];
 let program:WebGLProgram|null=null;
 try{
  for(const [type,source] of [[gl.VERTEX_SHADER,FLOWER_SURFACE_VERTEX],[gl.FRAGMENT_SHADER,FLOWER_SURFACE_FRAGMENT]] as const){
   const shader=gl.createShader(type);if(!shader)throw Error('FLOWER_SURFACE_GPU_SHADER');
   shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
   if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))fail('COMPILE '+gl.getShaderInfoLog(shader));
  }
  program=gl.createProgram();if(!program)throw Error('FLOWER_SURFACE_GPU_PROGRAM');
  for(const s of shaders)gl.attachShader(program,s);
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))fail('LINK '+gl.getProgramInfoLog(program));
  const p=program;
  const names=['uClipFromObject','uBaseST','uPatternST','uBaseColor','uPatternColor1','uPatternColor2','uShifts','uOcclusionStrength','uMipBias','uOutput','uBaseMap','uPatternMap','uComboMap'];
  const loc=new Map(names.map(n=>[n,gl.getUniformLocation(p,n)]));if([...loc.values()].some(v=>v===null))fail('UNIFORM');
  const l=(name:string)=>loc.get(name)!;
  let disposed=false;
  return {
   draw(mesh:UploadedNativeMesh,textures:SurfaceTextures,d:FlowerSurfaceDraw){
    if(disposed)fail('DISPOSED');validateFlowerSurfaceDraw(d);
    if(gl.getError()!==gl.NO_ERROR)fail('DIRTY');
    const u=d.surface;
    gl.useProgram(p);gl.bindVertexArray(mesh.vao);
    gl.uniformMatrix4fv(l('uClipFromObject'),false,new Float32Array(d.clipFromObject));
    gl.uniform4fv(l('uBaseST'),new Float32Array(d.baseST));gl.uniform4fv(l('uPatternST'),new Float32Array(d.patternST));
    gl.uniform4fv(l('uBaseColor'),new Float32Array(u.baseColor));gl.uniform3fv(l('uPatternColor1'),new Float32Array(u.patternColor1));gl.uniform3fv(l('uPatternColor2'),new Float32Array(u.patternColor2));
    gl.uniform4f(l('uShifts'),u.smoothnessShift,u.metallicShift,u.patternSmoothnessShift,u.patternMetallicShift);
    gl.uniform1f(l('uOcclusionStrength'),u.occlusionStrength);gl.uniform1f(l('uMipBias'),d.mipBias);gl.uniform1i(l('uOutput'),d.output==='albedo'?0:1);
    (['baseMap','patternMap','comboMap'] as const).forEach((k,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,textures[k]);gl.uniform1i(l(['uBaseMap','uPatternMap','uComboMap'][i]),i);});
    gl.drawElements(gl.TRIANGLES,mesh.indexCount,gl.UNSIGNED_SHORT,0);
    if(gl.getError()!==gl.NO_ERROR)fail('DRAW');
   },
   dispose(){if(disposed)return;disposed=true;gl.deleteProgram(p);}
  };
 }catch(e){if(program)gl.deleteProgram(program);throw e;}
 finally{for(const s of shaders)gl.deleteShader(s);}
}
/** Upload exact source-pinned bytes once for a draw batch. The caller supplies
 * explicit uniforms and camera; no guessed pattern rules or native save logic.
 * BC1 mode is explicit, and absent UV1 never falls back to UV0. */
export async function drawFlowerSurfaceDiagnostic(gl:WebGL2RenderingContext,s:FlowerSurfaceSources,draws:readonly FlowerSurfaceDraw[],read:(p:FlowerSurfacePayload)=>Promise<ArrayBuffer>,bc1Modes:Partial<Record<TextureKey,Bc1Mode>>,beforeDraw:(i:number)=>void,afterDraw:(i:number)=>void){
 if(!draws.length||draws.length>256)fail('BATCH');
 for(const d of draws)validateFlowerSurfaceDraw(d);
 const m=s.geometry.meshes[s.meshId];
 if(!m||Object.keys(s.geometry.meshes).length!==1||[0,4,5].some(i=>!(m.channels[i]?.[3]&15)))fail('MESH_UV');
 let geometry:Awaited<ReturnType<typeof uploadNativeGeometry>>|undefined;
 let renderer:ReturnType<typeof createFlowerSurfaceRenderer>|undefined;
 const owned:WebGLTexture[]=[];
 const get=async(kind:FlowerSurfacePayload['kind'],source:{sha256:string;bytes:number})=>{
  const b=await read({kind,sha256:source.sha256,bytes:source.bytes});
  if(!(b instanceof ArrayBuffer)||b.byteLength!==source.bytes)fail('PAYLOAD');
  return b;
 };
 try{
  geometry=await uploadNativeGeometry(gl,s.geometry,await get('geometry',{sha256:s.geometry.geometrySha256,bytes:s.geometry.geometryBytes}),{[s.meshId]:{0:0,4:4,5:5}});
  const textures={} as SurfaceTextures;
  for(const k of ['baseMap','patternMap','comboMap'] as const){
   const t=s.textures[k];const texture=await uploadNativeTexture(gl,t,await get('texture',t),bc1Modes[k]);owned.push(texture);textures[k]=texture;
  }
  renderer=createFlowerSurfaceRenderer(gl);
  const uploaded=geometry.meshes.get(s.meshId);if(!uploaded)throw Error('FLOWER_SURFACE_GPU_MESH');
  draws.forEach((d,i)=>{beforeDraw(i);renderer!.draw(uploaded,textures,d);afterDraw(i);});
  return {draws:draws.length,fidelity:'surface-diagnostic-only' as const};
 }finally{
  if(renderer){gl.useProgram(null);renderer.dispose();}
  gl.bindVertexArray(null);geometry?.dispose();
  for(const t of owned)gl.deleteTexture(t);
 }
}

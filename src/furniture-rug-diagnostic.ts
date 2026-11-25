import {resolveNativeRugMaterial,type RugNativeSources} from './furniture-rug-source';
import {uploadNativeGeometry} from './native-furniture-mesh';
import {uploadNativeTexture,type Bc1Mode} from './native-texture-upload';
import {uploadNativeCube,validateNativeCubeOrientation,type NativeCubeSource,type NativeCubeOrientation} from './native-cube-upload';
import {createFurnitureForwardRenderer,validateFurnitureForwardInputs,type FurnitureForwardScene} from './furniture-forwardlit-gpu';
/** Only a diagnostic path until native runtime shader variant, camera/light
 * selection, cube axes, color conversion and postprocessing are established.
 * The caller must supply explicit evaluated scene and cube orientations.
 * No URL, remote request, native save or static icon is produced here. */
export type RugCubeRequest={source:NativeCubeSource;orientation:NativeCubeOrientation;bc1Mode:Bc1Mode};
export type RugDrawRequest={
 itemId:number;materialIndex:number;scene:Omit<FurnitureForwardScene,'reflectionStrength'>;
 patternBc1Mode:Bc1Mode;reflectionPrimary:RugCubeRequest;reflectionSecondary:RugCubeRequest;
};
export type RugPayload={kind:'geometry'|'texture'|'cube';sha256:string;bytes:number};
export type ReadRugPayload=(reference:RugPayload)=>Promise<ArrayBuffer>;
/** A single draw with exact source-verified bytes. Caller owns an isolated GL
 * context and its framebuffer, viewport, clear, culling and depth policy.
 * Uploads and program are always released before returning; no hidden cache. */
export async function drawNativeRugDiagnostic(gl:WebGL2RenderingContext,sources:RugNativeSources,request:RugDrawRequest,read:ReadRugPayload){
 const selected=resolveNativeRugMaterial(sources,request.itemId,request.materialIndex);
 const m=selected.geometry.meshes[selected.meshId];
 const required=[0,1,2,4,5];
 if(required.some(i=>!m.channels[i]||!(m.channels[i][3]&15))||Object.keys(selected.geometry.meshes).length!==1)throw Error('RUG_DRAW_MESH_CHANNELS');
 const scene={...request.scene,reflectionStrength:selected.reflectionStrength};
 validateFurnitureForwardInputs(scene,selected.material);
 for(const c of [request.reflectionPrimary,request.reflectionSecondary])validateNativeCubeOrientation(c.source,c.orientation);
 const owned:WebGLTexture[]=[];
 let geometry:Awaited<ReturnType<typeof uploadNativeGeometry>>|undefined;
 let renderer:ReturnType<typeof createFurnitureForwardRenderer>|undefined;
 const get=async(kind:RugPayload['kind'],sha256:string,bytes:number)=>{
  const buffer=await read({kind,sha256,bytes});
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength!==bytes)throw Error('RUG_DRAW_PAYLOAD_LENGTH');
  return buffer;
 };
 try{
  geometry=await uploadNativeGeometry(gl,selected.geometry,await get('geometry',selected.geometry.geometrySha256,selected.geometry.geometryBytes),{[selected.meshId]:Object.fromEntries(required.map(i=>[i,i]))});
  const texture=async(name:keyof typeof selected.textures)=>{
   const s=selected.textures[name];
   if(s.format===10&&name!=='patternMap')throw Error('RUG_DRAW_UNRESOLVED_BC1_MODE');
   const t=await uploadNativeTexture(gl,s,await get('texture',s.sha256,s.bytes),name==='patternMap'?request.patternBc1Mode:undefined);
   owned.push(t);return t;
  };
  const cube=async(c:RugCubeRequest)=>{
   const t=await uploadNativeCube(gl,c.source,await get('cube',c.source.sha256,c.source.bytes),c.orientation,c.bc1Mode);
   owned.push(t);return t;
  };
  const textures={baseMap:await texture('baseMap'),patternMap:await texture('patternMap'),comboMap:await texture('comboMap'),normalMap:await texture('normalMap'),reflectionPrimary:await cube(request.reflectionPrimary),reflectionSecondary:await cube(request.reflectionSecondary)};
  renderer=createFurnitureForwardRenderer(gl);
  const mesh=geometry.meshes.get(selected.meshId);if(!mesh)throw Error('RUG_DRAW_MESH_MISSING');
  renderer.draw(mesh,textures,scene,selected.material);
  return {itemId:selected.itemId,materialIndex:selected.materialIndex,materialGuid:selected.materialGuid,renderFidelity:'unverified' as const};
 }finally{
  // This is an isolated diagnostic context, not a state-preserving compositor.
  // Unbind the program before deletion and release all transient GPU objects.
  if(renderer){gl.useProgram(null);renderer.dispose();}
  geometry?.dispose();
  for(const t of owned)gl.deleteTexture(t);
 }
}

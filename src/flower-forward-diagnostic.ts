import {uploadNativeGeometry,type NativeGeometrySource} from './native-furniture-mesh';
import {uploadNativeTexture,type NativeTextureSource,type Bc1Mode} from './native-texture-upload';
import {uploadNativeCube,validateNativeCubeOrientation,type NativeCubeSource,type NativeCubeOrientation} from './native-cube-upload';
import {createFlowerForwardRenderer,validateFlowerForwardInputs,type FlowerForwardScene,type FlowerForwardMaterial,type FlowerForwardTextures} from './flower-forwardlit-gpu';
type TextureKey='baseMap'|'patternMap'|'comboMap'|'normalMap';
export type FlowerForwardSources={geometry:NativeGeometrySource;meshId:string;textures:Record<TextureKey,NativeTextureSource>;material:FlowerForwardMaterial;authoredReflectionRef:readonly [string,string]|null;authoredKeywords:readonly string[]};
export type FlowerForwardCube={source:NativeCubeSource;orientation:NativeCubeOrientation;bc1Mode:Bc1Mode;sourceRef:readonly [string,string]};
export type FlowerForwardPayload={kind:'geometry'|'texture'|'cube';sha256:string;bytes:number};
/** Diagnostic path only: no implicit cube, no native runtime wind, no
 * inferred scene or save mutation. The caller explicitly supplies a cube,
 * including for the three authored materials with no assigned cube. */
export async function drawFlowerForwardDiagnostic(gl:WebGL2RenderingContext,s:FlowerForwardSources,draws:readonly {scene:FlowerForwardScene;material:FlowerForwardMaterial}[],cube:FlowerForwardCube,read:(p:FlowerForwardPayload)=>Promise<ArrayBuffer>,bc1Modes:Partial<Record<TextureKey,Bc1Mode>>,beforeDraw:(i:number)=>void,afterDraw:(i:number)=>void){
 if(!draws.length||draws.length>256)throw Error('FLOWER_FORWARD_BATCH');
 const mesh=s.geometry.meshes[s.meshId];
 if(!mesh||Object.keys(s.geometry.meshes).length!==1||[0,1,2,4,5].some(i=>!mesh.channels[i]||!(mesh.channels[i][3]&15)))throw Error('FLOWER_FORWARD_MESH_CHANNELS');
 for(const d of draws)validateFlowerForwardInputs(d.scene,d.material);
 validateNativeCubeOrientation(cube.source,cube.orientation);
 // Exact authored assignment is honored; a null authored assignment is not
 // treated as proof that the runtime uses any particular reflection map.
 if(s.authoredReflectionRef&&(s.authoredReflectionRef[0]!==cube.sourceRef[0]||s.authoredReflectionRef[1]!==cube.sourceRef[1]))throw Error('FLOWER_FORWARD_CUBE_REF');
 const get=async(kind:FlowerForwardPayload['kind'],sha256:string,bytes:number)=>{
  const b=await read({kind,sha256,bytes});if(!(b instanceof ArrayBuffer)||b.byteLength!==bytes)throw Error('FLOWER_FORWARD_PAYLOAD');
  return b;
 };
 const textures:WebGLTexture[]=[];let g:Awaited<ReturnType<typeof uploadNativeGeometry>>|undefined;let renderer:ReturnType<typeof createFlowerForwardRenderer>|undefined;
 try{
  g=await uploadNativeGeometry(gl,s.geometry,await get('geometry',s.geometry.geometrySha256,s.geometry.geometryBytes),{[s.meshId]:{0:0,1:1,2:2,4:4,5:5}});
  const uploaded={} as FlowerForwardTextures;
  for(const k of ['baseMap','patternMap','comboMap','normalMap'] as const){
   const t=s.textures[k],gpu=await uploadNativeTexture(gl,t,await get('texture',t.sha256,t.bytes),bc1Modes[k]);textures.push(gpu);uploaded[k]=gpu;
  }
  uploaded.reflectionMap=await uploadNativeCube(gl,cube.source,await get('cube',cube.source.sha256,cube.source.bytes),cube.orientation,cube.bc1Mode);textures.push(uploaded.reflectionMap);
  renderer=createFlowerForwardRenderer(gl);const m=g.meshes.get(s.meshId);if(!m)throw Error('FLOWER_FORWARD_MESH');
  draws.forEach((d,i)=>{beforeDraw(i);renderer!.draw(m,uploaded,d.scene,d.material);afterDraw(i);});
  return {draws:draws.length,authoredReflectionAssigned:s.authoredReflectionRef!==null,fidelity:'forward-diagnostic-only' as const};
 }finally{
  if(renderer){gl.useProgram(null);renderer.dispose();}
  gl.bindVertexArray(null);g?.dispose();
  for(const texture of textures)gl.deleteTexture(texture);
 }
}

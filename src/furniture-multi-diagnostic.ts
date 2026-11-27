/** Multi-renderer diagnostic path. All materials and geometry come from the
 * original source crosswalk. Camera, root pose, scene and cube orientation
 * are explicit diagnostic inputs, not inferred production icon settings. */
import {bindFurnitureRendererTreatments,nativeFurnitureTreatment,furnitureTreatmentScale} from './furniture-material-treatment';
import type {RugNativeSources} from './furniture-rug-source';
import type {RugCubeRequest,RugPayload,ReadRugPayload} from './furniture-rug-diagnostic';
import {authoredRendererModel} from './furniture-authored-transforms';
import {mergeStaticRendererBounds} from './furniture-renderer-bounds';
import {uploadNativeGeometry,validateNativeGeometryLayout,nativeMissingUv1AliasesUv0,type NativeMeshSource,type MeshAttributeLocations} from './native-furniture-mesh';
import {uploadNativeTexture,validateNativeTextureLayout,type NativeTextureSource,type Bc1Mode} from './native-texture-upload';
import {uploadNativeCube,validateNativeCubeOrientation} from './native-cube-upload';
import {createFurnitureForwardRenderer,validateFurnitureForwardInputs,type FurnitureForwardMaterial,type FurnitureForwardScene} from './furniture-forwardlit-gpu';
import type {Vec3,Vec4} from './furniture-surface-v3.0.1';
import {furnitureNativeBuiltinTexture,furnitureNativeBuiltinBytes} from './furniture-native-builtin-textures-v3.0.1';
import {furnitureRimFromMaterial} from './furniture-rim-v3.0.1';
import {terrainShaderId,resolveTrellisTerrainMaterial} from './furniture-terrain-v3.0.1';
import {resolveCustomLitFixedMaterial,type CustomLitBlendState} from './furniture-customlit-v3.0.1';
import {glassShaderId,resolveGlassFixedMaterial,type GlassState} from './furniture-glass-v3.0.1';
import {resolveSparkleFixedMaterial,validateSparkleGpuInputs,createSparkleGpuRenderer} from './furniture-sparkle-gpu';
type TransparentState=GlassState|CustomLitBlendState;
type Pattern=NativeTextureSource&{guid:string;bundle:string;bundleSha256:string;pathId:string;objectSha256:string};
export type FurnitureMultiSources=Omit<RugNativeSources,'variants'>&{
 variants:RugNativeSources['variants']&{bundleNames:readonly string[];patterns:readonly (readonly [string,number,number,readonly number[]])[]};
 additionalPatterns:{schema:string;version:string;rows:readonly Pattern[]};
};
type Scene=Omit<FurnitureForwardScene,'model'|'normalMatrix'|'tangentParity'|'reflectionStrength'|'emissionColor'>;
export type FurnitureMultiRequest={
 itemId:number;indices:readonly number[];scene:Scene;
 mountWorld:readonly number[];runtimeRoot:Parameters<typeof authoredRendererModel>[3];fit:Parameters<typeof authoredRendererModel>[4];
 bc1Modes:Readonly<Record<string,Bc1Mode>>;
 reflectionPrimary:RugCubeRequest;reflectionSecondary:RugCubeRequest;
};
const shaderId='CAB-2b27edbfe7f08bad1cd631865ee4eb15:-6806329374484566350';
const shaderHash='cdb64e92e92cbc2b88b3ce48c8a3ed302a16972a23528c27e766b7a646d852d0';
const fail=(code:string):never=>{throw Error('FURNITURE_MULTI_'+code);};
function get<T>(x:T|undefined|null,code:string):T{if(x==null)throw Error('FURNITURE_MULTI_'+code);return x;}
/** An exact null pattern may be mathematically unused by the shader.
 * Independently establish opacity even if BC1's alpha mode is not known. */
export function nativeBaseIsOpaque(s:NativeTextureSource,bytes:ArrayBuffer){
 if(bytes.byteLength!==s.bytes)return false;
 const b=new Uint8Array(bytes),v=new DataView(bytes);
 if(s.format===4)return b.length>0&&b.length%4===0&&b.every((x,i)=>i%4!==3||x===255);
 // Only the all-white original ARGB32 layout is admitted by the uploader.
 if(s.format===5)return b.length>0&&b.every(x=>x===255);
 if(s.format===10){
  if(!b.length||b.length%8)return false;
  for(let i=0;i<b.length;i+=8)if(v.getUint16(i,true)<=v.getUint16(i+2,true)){
   const indices=v.getUint32(i+4,true);for(let j=0;j<16;j++)if(((indices>>>(j*2))&3)===3)return false;
  }
  return true;
 }
 // BC3 stores two alpha endpoints followed by sixteen packed 3-bit
 // selectors in each 16-byte block. A selected interpolant can be exactly
 // 255 only when both endpoints are 255 (or the explicit 255 entry in
 // six-alpha mode). Test every selector, including padded edge texels and
 // every mip: this is deliberately conservative and needs no color guess.
 if(s.format===12){
  if(!b.length||b.length%16)return false;
  for(let i=0;i<b.length;i+=16){
   const a0=b[i],a1=b[i+1];
   if(a0===255&&a1===255){
    // Equal endpoints select six-alpha mode: entry 6 is zero.
    for(let j=0;j<16;j++){const bit=j*3,k=i+2+(bit>>3),shift=bit&7;const index=((b[k]|((k<i+7?b[k+1]:0)<<8))>>shift)&7;if(index===6)return false;}
   }else{
    for(let j=0;j<16;j++){
     const bit=j*3,k=i+2+(bit>>3),shift=bit&7;
     const index=((b[k]|((k<i+7?b[k+1]:0)<<8))>>shift)&7;
     if(!((index===0&&a0===255)||(index===1&&a1===255)||(a0<=a1&&index===7)))return false;
    }
   }
  }
  return true;
 }
 return false;
}
type NullPatternPlan={patternMap:NativeTextureSource|null;material:Pick<FurnitureForwardMaterial,'useBaseMapMask'>;baseMap:NativeTextureSource};
export function furnitureNullPatternRequiresOpacity(p:NullPatternPlan){
 return p.patternMap===null&&p.material.useBaseMapMask;
}
/** Shared byte-level prerequisite for both the GPU draw and pack preflight. */
export async function verifyFurnitureNullPatternOpacity(p:NullPatternPlan,read:ReadRugPayload){
 if(!furnitureNullPatternRequiresOpacity(p))return;
 const b=furnitureNativeBuiltinBytes(p.baseMap)??await read({kind:'texture',sha256:p.baseMap.sha256,bytes:p.baseMap.bytes});
 if(!nativeBaseIsOpaque(p.baseMap,b))fail('NULL_PATTERN_CONTRIBUTES');
}
/** UV1 is not consumed when the authored world-UV branch is selected,
 * or when the only pattern sample is provably constant/unused. The one
 * original white ARGB32 texture is verified again at GPU upload. A null
 * masked pattern still requires the existing payload opacity proof before draw.
 * Spatial patterns can use the source-proven UnityPlayer descriptor alias
 * for the verified half2 layout only; no synthesized UV bytes. */
export function furnitureForwardAttributeLocations(mesh:NativeMeshSource,material:FurnitureForwardMaterial,pattern:NativeTextureSource|null):MeshAttributeLocations{
 const active=(i:number)=>!!(mesh.channels[i]?.[3]&15);
 if([0,1,2,4].some(i=>!active(i)))fail('MESH_CHANNEL');
 const locations:Record<number,number>={0:0,1:1,2:2,4:4};
 if(active(5)){locations[5]=5;return locations;}
 const white=pattern!==null&&pattern.format===5&&pattern.sha256==='9a8dcd3f9ff7aa3114e141f03c12989d363ea81fd74c02eea63c5f41489cb17a';
 if(white)validateNativeTextureLayout(pattern);
 if(!material.worldUV&&!white&&!(pattern===null&&material.baseColor[3]>0)){
  if(pattern!==null&&nativeMissingUv1AliasesUv0(mesh))locations[5]=5;
  else fail('MESH_CHANNEL');
 }
 return locations;
}
export function resolveFurnitureMultiDiagnostic(d:FurnitureMultiSources,request:FurnitureMultiRequest){
 const bound=bindFurnitureRendererTreatments(d,request.itemId,request.indices);
 if(d.additionalPatterns.schema!=='HKIA.FurniturePatternTextureSources.1'||d.additionalPatterns.version!=='3.0.1'||d.base.shaders[shaderId]?.objectSha256!==shaderHash)fail('SOURCE_VERSION');
 const patternRows=[...d.patterns.rows,...d.additionalPatterns.rows] as readonly Pattern[];
 const nodes=bound.geometry.nodes as unknown as Parameters<typeof authoredRendererModel>[0];
 validateNativeGeometryLayout(bound.geometry,true);
 const checkTextures=(ts:readonly (NativeTextureSource|null)[])=>{
  for(const t of ts.filter((v):v is NativeTextureSource=>v!==null)){
   validateNativeTextureLayout(t);
   if(t.format===10&&!['rgb','rgba'].includes(request.bc1Modes[t.sha256]))fail('BC1_MODE');
  }
 };
 const plans=bound.plans.map(p=>{
  const base=p.baseMaterial,f=base.floats,c=base.colors;
  const mesh=get(bound.geometry.meshes[p.meshPathId],'MESH');
  const common={rendererPathId:p.rendererPathId,meshPathId:p.meshPathId,submeshIndex:p.submeshIndex,slot:p.choice?.slot??null,selectedIndex:p.choice?.selectedIndex??null,cull:f._Cull,glassState:undefined as GlassState|undefined,customLitBlendState:undefined as CustomLitBlendState|undefined,opaque:f._ZWrite===1&&f._Material_SrcBlend===1&&f._Material_DstBlend===0&&(base.renderQueue===-1||typeof base.renderQueue==='number'&&base.renderQueue<=2500)};
  const sceneFor=(reflectionStrength:number,emissionColor:Vec3,modelNodes=nodes):FurnitureForwardScene=>{
   const transform=authoredRendererModel(modelNodes,p.rendererPathId,request.mountWorld,request.runtimeRoot,request.fit);
   return {...request.scene,model:transform.model,normalMatrix:transform.normalMatrix,tangentParity:transform.tangentParity,reflectionStrength,emissionColor};
  };
  if(base.shader===terrainShaderId){
   if(p.choice!==null)fail('SHADER_UNSUPPORTED');
   const r=resolveTrellisTerrainMaterial(d.base,p.baseMaterialId),scene=sceneFor(1,[0,0,0]);
   const attributes:MeshAttributeLocations={0:0,1:1,2:2,4:4};
   if(Object.keys(attributes).some(i=>!(mesh.channels[Number(i)]?.[3]&15)))fail('MESH_CHANNEL');
   validateFurnitureForwardInputs(scene,r.material);checkTextures(Object.values(r.textures));
   return {...common,kind:'forward' as const,material:r.material,scene,attributes,...r.textures,patternMap:null};
  }
  if(base.shader===glassShaderId){
   if(p.choice!==null)fail('SHADER_UNSUPPORTED');
   const r=resolveGlassFixedMaterial(d.base,p.baseMaterialId),scene=sceneFor(1,r.emissionColor);
   const attributes:MeshAttributeLocations={0:0,1:1,2:2,4:4};
   if(Object.keys(attributes).some(i=>!(mesh.channels[Number(i)]?.[3]&15)))fail('MESH_CHANNEL');
   validateFurnitureForwardInputs(scene,r.material);checkTextures(Object.values(r.textures));
   return {...common,kind:'forward' as const,material:r.material,scene,attributes,...r.textures,patternMap:null,glassState:r.state};
  }
  if(base.shader.endsWith(':-2527260696058741820')){
   if(p.choice!==null||p.submeshIndex===undefined)fail('SHADER_UNSUPPORTED');
   const r=resolveSparkleFixedMaterial(d.base,p.baseMaterialId),scene=sceneFor(r.reflectionStrength,r.emissionColor);
   const attributes:MeshAttributeLocations={0:0,1:1,2:2,4:4};
   if(Object.keys(attributes).some(i=>!(mesh.channels[Number(i)]?.[3]&15)))fail('MESH_CHANNEL');
   checkTextures(Object.values(r.textures));validateSparkleGpuInputs(scene,r.material);
   return {...common,kind:'sparkle' as const,material:r.material,scene,attributes,...r.textures,patternMap:null};
  }
  if(base.shader.endsWith(':-6681258383375895387')){
   if(p.choice!==null)fail('SHADER_UNSUPPORTED');
   const r=resolveCustomLitFixedMaterial(d.base,p.baseMaterialId),scene=sceneFor(r.reflectionStrength,r.emissionColor);
   validateFurnitureForwardInputs(scene,r.material);checkTextures(Object.values(r.textures));
   return {...common,kind:'forward' as const,material:r.material,scene,attributes:furnitureForwardAttributeLocations(mesh,r.material,null),...r.textures,patternMap:null,customLitBlendState:r.blendState};
  }
  if(base.shader!==shaderId||base.textures._PatternNormalMap?.texture!==null||base.textures._Surface_EffectMap?.texture!==null||
   f._PatternNormalMap_Toggle!==0||f._Surface_Effect!==0||f.GLIMMER!==0||f._AlphaClip!==0||f._Material_Alpha!==0||f._ZWrite!==1)fail('SHADER_UNSUPPORTED');
  const rim=furnitureRimFromMaterial(base.validKeywords,f);
  const link=(name:string)=>get(base.textures[name],'TEXTURE_LINK');
  const st=(name:string):Vec4=>{const l=link(name);return [...l.scale,...l.offset] as Vec4;};
  const tex=(name:string)=>{
   const ref=link(name).texture;
   // Only an exact serialized null pointer uses the shader's original
   // builtin. A dangling non-null reference still fails closed.
   return ref===null?furnitureNativeBuiltinTexture(d.base.shaders[base.shader].objectSha256,name):get(d.base.textures[get(ref,'TEXTURE_NULL')],'TEXTURE');
  };
  const n=tex('_BumpMap'),x=tex('_MetallicGlossMap');
  const baseST=st('_BaseMap');
  if(['_BumpMap','_MetallicGlossMap'].some(k=>st(k).some((v,i)=>v!==baseST[i])))fail('BASE_UV');
  if(![0,1].includes(f._Pattern_WorldUV)||![0,1].includes(f._BaseMap_Mask_Toggle))fail('FLAGS');
  let treatment:ReturnType<typeof nativeFurnitureTreatment>|null=null,pattern:NativeTextureSource|null=null;
  if(p.choice){
   const row=p.choice.definition,guid=row[5];
   if(guid!==null){
    const selected=patternRows.filter(t=>t.guid===guid);
    if(selected.length!==1)fail('PATTERN_UNAVAILABLE');
    const t=selected[0],locations=d.variants.patterns.filter(v=>v[0]===guid);
    if(locations.length!==1||!locations[0][3].some(i=>d.variants.bundleNames[i]===t.bundle))fail('PATTERN_SOURCE');
    pattern=t;
   }
   treatment=nativeFurnitureTreatment(row,guid);
  }else{
   const l=link('_PatternMap');if(l.texture!==null)pattern=get(d.base.textures[l.texture],'PATTERN_AUTHORED');
  }
  const material:FurnitureForwardMaterial={
   baseColor:treatment?.baseColor??get(c._BaseColor,'BASE_COLOR'),
   patternTint:treatment?.patternTint??get(c._PatternTint,'PATTERN_TINT'),
   useBaseMapMask:treatment?.useBaseMapMask??(f._BaseMap_Mask_Toggle===1),
   baseST,patternST:treatment?.patternST??st('_PatternMap'),
   rotationTurns:treatment?.rotationTurns??f._PatternRotate,
   rotationCenter:treatment?.rotationCenter??[c._PatternRotateCenter[0],c._PatternRotateCenter[1]],
   smoothnessShift:treatment?.smoothnessShift??f._Smoothness_Shift,metallicShift:treatment?.metallicShift??f._Metallic_Shift,
   patternSmoothnessShift:treatment?.patternSmoothnessShift??f._Smoothness_Shift_Pattern,patternMetallicShift:treatment?.patternMetallicShift??f._Metallic_Shift_Pattern,
   occlusionStrength:f._OcclusionStrength,worldUV:f._Pattern_WorldUV===1,useComboEmissionMask:true,...(rim?{rim}:{})
  };
  if(!pattern&&material.baseColor[3]<=0)fail('NULL_PATTERN_CONTRIBUTES');
  // The original Furniture surface sets the base blend weight to zero
  // whenever BaseColor.a <= 0. In this branch RGB/alpha of BaseMap are
  // unused, but its authored ST still drives the normal and combo UVs.
  // Alias an already verified, non-null pattern only for an exact null
  // BaseMap pointer; never replace a missing/corrupt referenced texture.
  const baseLink=link('_BaseMap');
  const b=baseLink.texture===null&&material.baseColor[3]<=0&&pattern!==null
   ?pattern:tex('_BaseMap');
  const modelNodes=treatment?nodes.map(node=>node.rendererPathId===p.rendererPathId?{...node,scale:furnitureTreatmentScale(node.scale,treatment!.mirrored)}:node):nodes;
  const emissionColor=get(c._EmissionColor,'EMISSION').slice(0,3) as unknown as Vec3;
  const scene=sceneFor(f._ReflectionStrength,emissionColor,modelNodes);
  validateFurnitureForwardInputs(scene,material);checkTextures([b,n,x,pattern]);
  const attributes=furnitureForwardAttributeLocations(mesh,material,pattern);
  return {...common,kind:'forward' as const,material,scene,attributes,baseMap:b,normalMap:n,comboMap:x,patternMap:pattern};
 });
 if(new Set(plans.map(p=>p.meshPathId)).size!==Object.keys(bound.geometry.meshes).length)fail('MESH_COVERAGE');
 const hasGlass=plans.some(p=>p.glassState!==undefined);
 const transparent=plans.filter(p=>p.glassState!==undefined||p.customLitBlendState!==undefined);
 const hasTransparent=transparent.length>0;
 // Only one known transparent range after opaque. Do not infer ordering
 // of multiple transparent ranges or mix unrelated transparency modes.
 if(hasTransparent&&(transparent.length!==1||plans.some(p=>!p.glassState&&!p.customLitBlendState&&!p.opaque)))fail(hasGlass?'GLASS_ORDER_UNVERIFIED':'TRANSPARENT_ORDER_UNVERIFIED');
 const mixed=hasTransparent||plans.some(p=>p.kind==='sparkle'||p.kind==='forward'&&(p.material.customLit!==undefined||p.material.terrain!==undefined));
 if(mixed&&plans.some(p=>![0,2].includes(p.cull)))fail('CULL_UNSUPPORTED');
 const locations:Record<string,MeshAttributeLocations>={};
 for(const p of plans){
  const previous=locations[p.meshPathId]??{};
  if(Object.entries(p.attributes).some(([i,v])=>previous[Number(i)]!==undefined&&previous[Number(i)]!==v))fail('ATTRIBUTE_CONFLICT');
  locations[p.meshPathId]={...previous,...p.attributes};
 }
 for(const c of [request.reflectionPrimary,request.reflectionSecondary])validateNativeCubeOrientation(c.source,c.orientation);
 return {geometry:bound.geometry,plans,locations,mixed,hasGlass,hasTransparent,fidelity:'forward-diagnostic-only' as const};
}
/** Resolve all static meshes, including fixed renderer parts and selected
 * local mirroring, before applying the existing native diagonal scale fit.
 * Explicit runtimeRoot, mount and lossyScale still come from the caller.
 * This is a static-mesh diagnostic, not a Unity runtime component census. */
export function fitFurnitureMultiStaticBounds(d:FurnitureMultiSources,request:FurnitureMultiRequest){
 const raw=resolveFurnitureMultiDiagnostic(d,{...request,fit:{...request.fit,extents:[0,0,0]}});
 const bounds=mergeStaticRendererBounds(raw.plans.map(p=>({
  model:p.scene.model,localBounds:raw.geometry.meshes[p.meshPathId].bounds[0]
 })));
 return {request:{...request,fit:{...request.fit,extents:bounds.extents}},bounds,renderFidelity:'unverified' as const};
}
/** One depth buffer, one model upload, and one upload per distinct texture.
 * All source bindings and payloads are resolved before the first draw.
 * Caller owns the isolated framebuffer and discards it on any thrown error. */
export async function drawFurnitureMultiDiagnostic(gl:WebGL2RenderingContext,d:FurnitureMultiSources,request:FurnitureMultiRequest,read:ReadRugPayload){
 const resolved=resolveFurnitureMultiDiagnostic(d,request);
 const getBytes=async(kind:RugPayload['kind'],sha256:string,bytes:number)=>{
  const b=await read({kind,sha256,bytes});if(!(b instanceof ArrayBuffer)||b.byteLength!==bytes)fail('PAYLOAD_LENGTH');return b;
 };
 const owned:WebGLTexture[]=[],textures=new Map<string,WebGLTexture>(),payloads=new Map<string,ArrayBuffer>();
 let geometry:Awaited<ReturnType<typeof uploadNativeGeometry>>|undefined,renderer:ReturnType<typeof createFurnitureForwardRenderer>|undefined,sparkleRenderer:ReturnType<typeof createSparkleGpuRenderer>|undefined;
 let cullState:{enabled:boolean;mode:number;front:number}|undefined;
 let blendState:{enabled:boolean;srcRGB:number;dstRGB:number;srcAlpha:number;dstAlpha:number;eqRGB:number;eqAlpha:number;depthMask:boolean;depthTest:boolean;depthFunc:number}|undefined;
 try{
  geometry=await uploadNativeGeometry(gl,resolved.geometry,await getBytes('geometry',resolved.geometry.geometrySha256,resolved.geometry.geometryBytes),
   resolved.locations,true,true);
  const texture=async(t:NativeTextureSource)=>{
   const builtin=furnitureNativeBuiltinBytes(t);
   const key=(builtin?'builtin:':'source:')+t.sha256+':'+t.colorSpace+':'+t.format+':'+JSON.stringify(t.sampler)+':'+(request.bc1Modes[t.sha256]??'');
   const cached=textures.get(key);if(cached)return cached;
   let b=builtin??payloads.get(t.sha256);if(!b){b=await getBytes('texture',t.sha256,t.bytes);payloads.set(t.sha256,b);}
   const uploaded=await uploadNativeTexture(gl,t,b,request.bc1Modes[t.sha256]);owned.push(uploaded);textures.set(key,uploaded);return uploaded;
  };
  const cube=async(c:RugCubeRequest)=>{
   const t=await uploadNativeCube(gl,c.source,await getBytes('cube',c.source.sha256,c.source.bytes),c.orientation,c.bc1Mode);owned.push(t);return t;
  };
  const reflectionPrimary=await cube(request.reflectionPrimary),reflectionSecondary=await cube(request.reflectionSecondary);
  // Resolve every payload before first draw, so unsupported or corrupt assets
  // cannot leave a misleading partial model in the caller's framebuffer.
  const draws:Array<{cull:number;transparentState?:TransparentState;run:()=>void}>=[];
  for(const p of resolved.plans){
   const baseMap=await texture(p.baseMap),normalMap=await texture(p.normalMap),comboMap=await texture(p.comboMap);
   const mesh=get(geometry.meshes.get(p.meshPathId),'GPU_MESH');
   if(p.kind==='sparkle'){
    const noiseMap=await texture(p.noiseMap),submeshIndex=get(p.submeshIndex,'SUBMESH');
    draws.push({cull:p.cull,run:()=>sparkleRenderer!.draw(mesh,{baseMap,normalMap,comboMap,noiseMap,reflectionPrimary,reflectionSecondary},p.scene,p.material,submeshIndex)});
   }else{
    await verifyFurnitureNullPatternOpacity(p,async ref=>get(payloads.get(ref.sha256),'BASE_PAYLOAD'));
    // CustomLit never consumes patternMap; unused source binding can alias base.
    const patternMap=p.patternMap?await texture(p.patternMap):baseMap;
    draws.push({cull:p.cull,transparentState:p.glassState??p.customLitBlendState,run:()=>{
     if(resolved.locations[p.meshPathId][5]===undefined)gl.vertexAttrib2f(5,0,0);
     renderer!.draw(mesh,{baseMap,normalMap,comboMap,patternMap,reflectionPrimary,reflectionSecondary},p.scene,p.material,p.submeshIndex);
    }});
   }
  }
  // Compile every required shader before the first draw.
  if(resolved.plans.some(p=>p.kind==='forward'))renderer=createFurnitureForwardRenderer(gl);
  if(resolved.plans.some(p=>p.kind==='sparkle'))sparkleRenderer=createSparkleGpuRenderer(gl);
  if(resolved.mixed){
   cullState={enabled:gl.isEnabled(gl.CULL_FACE),mode:gl.getParameter(gl.CULL_FACE_MODE),front:gl.getParameter(gl.FRONT_FACE)};
   // Explicit diagnostic handedness (not proof of Unity camera parity).
   gl.frontFace(gl.CCW);gl.cullFace(gl.BACK);
  }
  if(resolved.hasTransparent){
   blendState={enabled:gl.isEnabled(gl.BLEND),srcRGB:gl.getParameter(gl.BLEND_SRC_RGB),dstRGB:gl.getParameter(gl.BLEND_DST_RGB),
    srcAlpha:gl.getParameter(gl.BLEND_SRC_ALPHA),dstAlpha:gl.getParameter(gl.BLEND_DST_ALPHA),eqRGB:gl.getParameter(gl.BLEND_EQUATION_RGB),
    eqAlpha:gl.getParameter(gl.BLEND_EQUATION_ALPHA),depthMask:gl.getParameter(gl.DEPTH_WRITEMASK),depthTest:gl.isEnabled(gl.DEPTH_TEST),depthFunc:gl.getParameter(gl.DEPTH_FUNC)};
   gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
   draws.sort((a,b)=>(a.transparentState?.queue??0)-(b.transparentState?.queue??0));
  }
  for(const draw of draws){
   if(resolved.mixed){if(draw.cull===2)gl.enable(gl.CULL_FACE);else gl.disable(gl.CULL_FACE);}
   if(blendState){
    if(draw.transparentState){
     gl.enable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);gl.blendFunc(draw.transparentState.srcBlend===1?gl.ONE:draw.transparentState.srcBlend===3?gl.SRC_COLOR:gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
    }else{gl.disable(gl.BLEND);gl.depthMask(true);}
   }
   draw.run();
  }
  return {itemId:request.itemId,renderers:new Set(resolved.plans.map(p=>p.rendererPathId)).size,drawCalls:draws.length,uniqueTextures:textures.size,fidelity:resolved.fidelity};
 }finally{
  if(blendState){gl.blendFuncSeparate(blendState.srcRGB,blendState.dstRGB,blendState.srcAlpha,blendState.dstAlpha);gl.blendEquationSeparate(blendState.eqRGB,blendState.eqAlpha);gl.depthMask(blendState.depthMask);gl.depthFunc(blendState.depthFunc);if(blendState.enabled)gl.enable(gl.BLEND);else gl.disable(gl.BLEND);if(blendState.depthTest)gl.enable(gl.DEPTH_TEST);else gl.disable(gl.DEPTH_TEST);}
  if(cullState){gl.frontFace(cullState.front);gl.cullFace(cullState.mode);if(cullState.enabled)gl.enable(gl.CULL_FACE);else gl.disable(gl.CULL_FACE);}
  if(renderer||sparkleRenderer){gl.useProgram(null);renderer?.dispose();sparkleRenderer?.dispose();}
  // A rejected read/hash can occur before the first GPU allocation. Do not
  // touch the context (or mask the original error) without owned geometry.
  if(geometry){gl.bindVertexArray(null);geometry.dispose();}
  for(const t of owned)gl.deleteTexture(t);
 }
}

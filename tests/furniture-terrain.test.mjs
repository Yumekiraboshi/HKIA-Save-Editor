import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({stdin:{contents:"export * from './src/furniture-terrain-v3.0.1';export * from './src/furniture-customlit-v3.0.1';",resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {nativeTerrainSurface,resolveTrellisTerrainMaterial,terrainShaderId,terrainShaderHash,trellisTerrainMaterialId,resolveCustomLitFixedMaterial}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const input={"position":[0.926124521600844,1.656247162070985,-1.850680217470705],"normal":[-0.6859303478028729,0.6829431764033649,-0.2511735968749746],"time":0.219052862850308,"mipBias":-0.7012133144346564,"occlusionStrength":0.9385905152067543,"blend":0.23680088957620393,"topTiling":1.0475763173616164,"sideTiling":1.1477429481830341,"topTint":[0.7392757413295123,0.6086024057140853,0.544902257226378],"sideTint":[0.7561000117457155,0.26132492367643756,0.46737926750333414],"topNormalScale":0.8910014249020605,"sideNormalScale":0.7256231705114251,"topSmoothShift":0.1030415461917914,"sideSmoothShift":-0.3742356251168041,"speed":1.2432549608967824};
const expected={"albedo":[0.43329253779423743,0.17069459554677238,0.030814914966545783],"rawColor":[0.5737580556058546,0.6090886504684818,0.0653407937391872],"normal":[-0.49742081367434376,-0.019883322034196585,-0.8611495632722757],"roughness":0.9368165967556294,"metallic":0.5663539316948683,"occlusion":0.7863201421380197,"emissionMask":0.5363021964153554};
const uvSide=[[-2.1241051689438457,1.900946000715136],[1.375527548771485,-2.1241051689438457],[1.375527548771485,1.900946000715136]];
const uvTop=[[-1.9387287668319566,1.7350453026829509],[1.2554815398802064,-1.9387287668319566],[1.2554815398802064,1.7350453026829509]];
function close(a,b){if(Array.isArray(b)){assert.equal(a.length,b.length);b.forEach((x,i)=>close(a[i],x));}else if(typeof b==='object'){assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());for(const k of Object.keys(b))close(a[k],b[k]);}else assert.ok(Math.abs(a-b)<1e-12,JSON.stringify({a,b}));}
test('terrain original pixel 84/92 surface fixture: 18 actual sampling operands and outputs',()=>{
 const calls=[],sample=(t,uv,b)=>{calls.push([t,uv,b]);return Array.from({length:4},(_,k)=>(Math.sin(uv[0]*(1+t*.2)+uv[1]*(k+.7)+b*.3+k+t)+1)*.5);};
 close(nativeTerrainSurface(input,sample),expected);
 close(calls,[3,2,1,0,5,4].flatMap(t=>(t%2?uvSide:uvTop).map(uv=>[t,uv,input.mipBias])));
 for(const bad of [{...input,blend:0},{...input,normal:[0,0,0]},{...input,topTiling:NaN}])assert.throws(()=>nativeTerrainSurface(bad,sample),/TERRAIN_/);
 assert.throws(()=>nativeTerrainSurface(input,()=>[0,0,0,NaN]),/TERRAIN_SAMPLE/);
});
const cab='CAB-6df9b7d36015f1762383468832407e58:',leaf=cab+'-6080070135784173191',leafShader='CAB-46b8f8fe122147493b3113f7c1c8cd0f:-6681258383375895387';
const link=texture=>({texture,scale:[1,1],offset:[0,0]});
function source(){
 const pids=['5580743019608900113','-2993798695702454380','6647181599229530417','2618436341354446861','18344951364392744'].map(x=>cab+x).concat('CAB-7df3c645952e1600d64bc9355b67a711:-7092282721538532352');
 const common={renderQueue:-1,validKeywords:[],floats:{_Cull:0,_ZWrite:1,_ZTest:4,_Material_SrcBlend:1,_Material_DstBlend:0,_AlphaClip:0,_Material_Alpha:0,_StencilCompare:0,_StencilOverride:0,_Lighting_Fog:1,_Lighting_Medium_Underwater:0,_Material_VertexAnimation:0,_Surface_Effect:0,_Clip_Offset:0,GLIMMER:0,UV_WORLD:0},colors:{_EmissionColor:[0,0,0,1]}};
 const terrain={...common,objectSha256:'ad91f98ed41af7801ff3acc5b58e838d0daacb95804c80efa6cdef9192ed83e7',shader:terrainShaderId,floats:{...common.floats,_Hack_InfinityCart_Speed:0,_Terrain_Blend:.9150000214576721,_Terrain_Tiling_Top:.6000000238418579,_Terrain_Tiling_Sides:.6000000238418579,_Terrain_NormalScale_Top:.5,_Terrain_NormalScale_Sides:.5,_Terrain_SmoothShift_Top:-.5,_Terrain_SmoothShift_Sides:-.5,_OcclusionStrength:.2240000069141388},colors:{...common.colors,_BaseColor:[.5411764979362488,.6901960968971252,.32549020648002625,1],_Terrain_Tint_Sides:[.5411764979362488,.6901960968971252,.32549020648002625,1],_Terrain_Tint_Top:[.6376680135726929,.8509804010391235,.33358433842658997,1]},textures:Object.fromEntries(['Color','Combo','Normal'].flatMap((k,i)=>['Top','Sides'].map(face=>['_Terrain_'+k+'Map_'+face,link(pids[i])])) )};
 const l={...common,objectSha256:'ab66b7d885664065bc047cd4f756db30c365827cee8281d565133d1c560e6e16',shader:leafShader,floats:{...common.floats,CUSTOM_RIMLIGHT:0,_Smoothness_Shift:0,_Metallic_Shift:0,_OcclusionStrength:1,_ReflectionStrength:1},colors:{...common.colors,_BaseColor:[.4431372582912445,.6117647290229797,.20392157137393951,1]},textures:{_BaseMap:link(pids[3]),_BumpMap:link(pids[4]),_MetallicGlossMap:link(pids[5]),_AnimTex:link(null),_Surface_EffectMap:link(null)}};
 return {materials:{[trellisTerrainMaterialId]:terrain,[leaf]:l},shaders:{[terrainShaderId]:{objectSha256:terrainShaderHash},[leafShader]:{objectSha256:'7c32f4b3f7c0c0d580af1e22584952aa29d266dfbe98de3b916c3fecb7339931'}},textures:Object.fromEntries(pids.map(k=>[k,{fixture:k}]))};
}
test('exact source trellis material identity, matching map pairs, opaque state and keyword-free leaf',()=>{
 const s=source(),p=resolveTrellisTerrainMaterial(s,trellisTerrainMaterialId),l=resolveCustomLitFixedMaterial(s,leaf);
 assert.equal(p.material.terrain.blend,.9150000214576721);assert.equal(p.textures.baseMap.fixture,cab+'5580743019608900113');
 assert.equal(l.material.rim,undefined);assert.equal(l.material.customLit.materialAlpha,0);assert.equal(l.blendState,undefined);
 for(const key of ['_ZWrite','_ZTest','_Cull','_Material_SrcBlend','_Hack_InfinityCart_Speed']){
  const bad=source();bad.materials[trellisTerrainMaterialId].floats[key]=8;assert.throws(()=>resolveTrellisTerrainMaterial(bad,trellisTerrainMaterialId),/TERRAIN_SOURCE/);
 }
 const different=source();different.materials[trellisTerrainMaterialId].textures._Terrain_ColorMap_Top.texture=cab+'-2993798695702454380';assert.throws(()=>resolveTrellisTerrainMaterial(different,trellisTerrainMaterialId),/TERRAIN_SOURCE/);
 const absent=source();delete absent.textures[cab+'5580743019608900113'];assert.throws(()=>resolveTrellisTerrainMaterial(absent,trellisTerrainMaterialId),/TERRAIN_SOURCE/);
 const changed=source();changed.materials[leaf].validKeywords=['CUSTOM_RIMLIGHT_ON'];assert.throws(()=>resolveCustomLitFixedMaterial(changed,leaf),/SHADER_UNSUPPORTED/);
});

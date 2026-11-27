import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({stdin:{contents:"export * from './src/furniture-customlit-v3.0.1';export * from './src/furniture-lighting-v3.0.1';",resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {customLitSurface,furnitureLighting,resolveCustomLitFixedMaterial}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const fixture={"surface":{"base":[0.5344306148252668,0.45243573351052724,0.19259406782058125,0.787451344513032],"combo":[0.3524005663109737,0.6929882001299398,0.15514106069980163,0.7831071437591759],"normal":[0.11577131139629045,0.13931298953975324,0.4212706392514621,0.9423724598549297],"baseColor":[0.149135700713298,0.5132556178532656,0.3163923035006913,0.4370872766464654],"smoothnessShift":0.13492933980426547,"metallicShift":-0.39518906111062346,"occlusionStrength":0.41210321346763934,"materialAlpha":0,"frontFacing":false,"expected":{"albedo":[0.07970268422460482,0.23221518194184107,0.060935280758322066],"roughness":0.21747122650670825,"metallic":0.2977991390193163,"occlusion":0.651830916187527,"emissionMask":0.7831071437591759,"alpha":0.4370872766464654,"normal":[0.7818006089976934,0.7213740209204935,-1.0000000168623835e-16]}},"lighting":{"input":{"albedo":[0.07970268422460482,0.23221518194184107,0.060935280758322066],"perceptualRoughness":0.21747122650670825,"metallic":0.2977991390193163,"occlusion":0.651830916187527,"emissionColor":[0.10239734520653249,0.7379683801674424,0.03499013649339659],"emissionMask":0.7831071437591759,"normal":[-0.6618131913502167,0.016494574197591684,0.7494873106176527],"view":[-0.4581997965828931,-0.47531770247307004,-0.7510832364838915],"mainLightDirection":[0.6042583696424916,-0.5601768123183019,-0.5666337103084355],"mainLightColor":[0.5190314051071282,0.23936006761503192,0.6402833429766911],"ambient":[0.9667030545540543,0.4950325701465578,0.9489956577889054],"screenOcclusion":0.8894339546705303,"screenOcclusionStrength":0.32520992030739904,"reflectionPrimary":[0.860688722815379,0.780005331681303,0.6858008998894323],"reflectionSecondary":[0.23278268944163105,0.8537336095096696,0.7880089179253811],"reflectionBlendWeight":0,"reflectionIntensity":0.6364910753855832,"reflectionStrength":0.5957813354307011,"ambientMain":[0.08296010041183259,0.8251141873058784,0.8217473220973527],"ambientFill":[0.6181556686781976,0.2760147251503617,0.8872527819551915],"fogVarying":0.27961379578820944,"fogMultiplier":0.947260612645819,"rim":{"power":2.1146860580906863,"feathering":0.5407491143667085,"intensity":0.3166531746427935,"coloring":0.8093647847070062}},"expected":{"color":[0.286701694893188,0.2847283635319697,0.3210420475815582],"reflection":{"direction":[0.8123027439803874,0.4664922855491226,0.35007027815152936],"lod":0.47300197544567635}}}};
function close(a,b){if(Array.isArray(b)){assert.equal(a.length,b.length);b.forEach((x,i)=>close(a[i],x));}else if(typeof b==='object'){assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());for(const k of Object.keys(b))close(a[k],b[k]);}else assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);}
test('original CustomLit surface, shared reflection, rim and ordinary fog match source token vector',()=>{
 const {expected,...u}=fixture.surface;close(customLitSurface(u),expected);
 const a=customLitSurface({...u,materialAlpha:1});close(a.alpha,u.base[3]*u.baseColor[3]);close(a.emissionMask,u.combo[3]);
 close(customLitSurface({...u,frontFacing:true}).normal,expected.normal.map(x=>-x));
 close(furnitureLighting(fixture.lighting.input),fixture.lighting.expected);
 assert.throws(()=>customLitSurface({...u,materialAlpha:NaN}),/SURFACE/);
});

test('source-pinned Scholastic fixed opaque objects reuse the verified rim-only CustomLit path',()=>{
 const cab='CAB-6c0f768e2ed4ce159a88e4d10c87130c',shader='CAB-46b8f8fe122147493b3113f7c1c8cd0f:-6681258383375895387';
 const sources=[
  ['4614022325940026044','1a66af5ceb1a495b3faea68fcbdc06337b04d082a006d16b5a15133b3d635c56',['-3511099656593168348','3619812887226190167','681439210963050857']],
  ['7677975864228729985','c234b16c48caeb781dc6c9a8603cd69dcc437e8ed7d12479cfddb0d8d34efc94',['-4726591929330554932','-4508928113816266226','5614357796165466026']]
 ];
 const link=texture=>({texture,scale:[1,1],offset:[0,0]});
 for(const [pid,hash,pids] of sources){
  const id=cab+':'+pid,keys=pids.map(p=>cab+':'+p);
  // Actual material constants, synthetic texture metadata: resolver only.
  const textures=Object.fromEntries(keys.map((k,i)=>[k,{fixture:i}]));
  const material={shader,objectSha256:hash,renderQueue:-1,validKeywords:['CUSTOM_RIMLIGHT_ON'],
   floats:{_Material_Alpha:0,_AlphaClip:0,_ZWrite:1,_Cull:2,_Lighting_Fog:1,_Lighting_Medium_Underwater:0,_Material_VertexAnimation:0,_Surface_Effect:0,_Clip_Offset:0,GLIMMER:0,UV_WORLD:0,_Material_SrcBlend:1,_Material_DstBlend:0,_ZTest:4,CUSTOM_RIMLIGHT:1,_Lighting_RimPower:1.5,_Lighting_RimFeathering:0.16699999570846558,_Lighting_RimIntensity:1,_Lighting_RimColoring:0,_Smoothness_Shift:0,_Metallic_Shift:0,_OcclusionStrength:0,_ReflectionStrength:1},
   colors:{_BaseColor:[1,1,1,1],_EmissionColor:[1.8443026542663574,1.0621638298034668,.5697060227394104,1]},
   textures:{_BaseMap:link(keys[0]),_BumpMap:link(keys[1]),_MetallicGlossMap:link(keys[2]),_AnimTex:link(null),_Surface_EffectMap:link(null)}};
  const base={materials:{[id]:material},shaders:{[shader]:{objectSha256:'7c32f4b3f7c0c0d580af1e22584952aa29d266dfbe98de3b916c3fecb7339931'}},textures};
  const p=resolveCustomLitFixedMaterial(base,id);
  assert.deepEqual(p.material.customLit,{materialAlpha:0});
  assert.deepEqual(p.material.rim,{power:1.5,feathering:0.16699999570846558,intensity:1,coloring:0});
  assert.deepEqual(p.emissionColor,material.colors._EmissionColor.slice(0,3));
  assert.deepEqual(p.textures,{baseMap:textures[keys[0]],normalMap:textures[keys[1]],comboMap:textures[keys[2]]});
  for(const [key,value] of [['_Material_SrcBlend',5],['_Material_DstBlend',10],['_ZTest',8],['_ZWrite',0],['_Material_Alpha',1]]){
   const bad=structuredClone(base);bad.materials[id].floats[key]=value;
   assert.throws(()=>resolveCustomLitFixedMaterial(bad,id),/SHADER_UNSUPPORTED/);
  }
  const bad=structuredClone(base);bad.materials[id].objectSha256='0'.repeat(64);
  assert.throws(()=>resolveCustomLitFixedMaterial(bad,id),/SHADER_UNSUPPORTED/);
  bad.materials[id]=material;delete bad.textures[keys[0]];
  assert.throws(()=>resolveCustomLitFixedMaterial(bad,id),/CUSTOM_LIT_TEXTURE/);
 }
});

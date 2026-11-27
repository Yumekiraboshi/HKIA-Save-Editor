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

test('source-pinned banner alpha uses the same rim-only shader and native blend state',()=>{
 const cab='CAB-6c0f768e2ed4ce159a88e4d10c87130c',shader='CAB-46b8f8fe122147493b3113f7c1c8cd0f:-6681258383375895387';
 const id=cab+':-532235555454519552',opaqueId=cab+':6239858323994365581';
 const keys=['-1565386650576965043','-1067708205451591808','873700301604624324','-6390226552218355717','8776367702219260351','8443359782372921580'].map(x=>cab+':'+x);
 const link=texture=>({texture,scale:[1,1],offset:[0,0]});
 const material={shader,objectSha256:'c999d000910a1cd7a947323d5d55ba205a3365cbac45d740927a7da57edc9210',renderQueue:3000,validKeywords:['CUSTOM_RIMLIGHT_ON'],
 floats:{_Material_Alpha:1,_AlphaClip:0,_ZWrite:0,_Cull:0,_Lighting_Fog:1,_Lighting_Medium_Underwater:0,_Material_VertexAnimation:0,_Surface_Effect:0,_Clip_Offset:0,GLIMMER:0,UV_WORLD:0,_Material_SrcBlend:5,_Material_DstBlend:10,_ZTest:4,_StencilCompare:0,_StencilOverride:0,CUSTOM_RIMLIGHT:1,_Lighting_RimPower:1.5,_Lighting_RimFeathering:.16699999570846558,_Lighting_RimIntensity:1,_Lighting_RimColoring:0,_Smoothness_Shift:0,_Metallic_Shift:0,_OcclusionStrength:0,_ReflectionStrength:1},
 colors:{_BaseColor:[1,1,1,1],_EmissionColor:[1.8443026542663574,1.0621638298034668,.5697060227394104,1]},
 textures:{_BaseMap:link(keys[0]),_BumpMap:link(keys[1]),_MetallicGlossMap:link(keys[2]),_AnimTex:link(null),_Surface_EffectMap:link(null)}};
 const opaque={...material,objectSha256:'02edfece5fd39fa1edf984d80ee4758d6bfa180794dd929556d29eada5d8ab46',renderQueue:-1,
 floats:{...material.floats,_Material_Alpha:0,_ZWrite:1,_Cull:2,_Material_SrcBlend:1,_Material_DstBlend:0},
 textures:{...material.textures,_BaseMap:link(keys[3]),_BumpMap:link(keys[4]),_MetallicGlossMap:link(keys[5])}};
 const base={materials:{[id]:material,[opaqueId]:opaque},shaders:{[shader]:{objectSha256:'7c32f4b3f7c0c0d580af1e22584952aa29d266dfbe98de3b916c3fecb7339931'}},textures:Object.fromEntries(keys.map(k=>[k,{fixture:k}]))};
 const p=resolveCustomLitFixedMaterial(base,id);
 assert.deepEqual(p.blendState,{queue:3000,srcBlend:5,dstBlend:10,zWrite:false,cull:0});
 assert.deepEqual(p.material.customLit,{materialAlpha:1});
 assert.equal(resolveCustomLitFixedMaterial(base,opaqueId).blendState,undefined);
 for(const [k,val] of [['_Material_Alpha',0],['_Cull',2],['_ZWrite',1],['_Material_SrcBlend',1],['_Material_DstBlend',0],['_ZTest',8],['_StencilCompare',3],['_StencilOverride',1]]){
  const bad=structuredClone(base);bad.materials[id].floats[k]=val;
  assert.throws(()=>resolveCustomLitFixedMaterial(bad,id),/SHADER_UNSUPPORTED/);
 }
 const bad=structuredClone(base);bad.materials[id].renderQueue=3001;
 assert.throws(()=>resolveCustomLitFixedMaterial(bad,id),/SHADER_UNSUPPORTED/);
});

test('source-pinned Retsuko amplifier and Scholastic bleacher opaque CustomLit materials',()=>{
 const shader='CAB-46b8f8fe122147493b3113f7c1c8cd0f:-6681258383375895387';
 const rows=[
  ['CAB-6ef96dd92514d121449bf26b3df2f0e4','-4094287017633679692','a95c9bc23890d6021dcc50d3835d1453278342b0ec9444dd9ed50b591db675ef',['8952410971996192852','2352204321797132278','657186981487005829'],-0.5,0.5],
  ['CAB-d61f0eabee36bcd36932688765a94472','5316780692551889377','db71ba2d2ef4a0625a42141f3a9477d8696c055ab347da4acf05062fde348fe8',['4737708589456548386','-8337080324662890314','-1890117830744700162'],0,0]
 ];
 const link=texture=>({texture,scale:[1,1],offset:[0,0]});
 for(const [cab,pid,hash,pids,metallic,occlusion] of rows){
  const id=cab+':'+pid,keys=pids.map(p=>cab+':'+p);
  // Source-verified material constants and identities; texture data is synthetic.
  const material={shader,objectSha256:hash,renderQueue:-1,validKeywords:['CUSTOM_RIMLIGHT_ON'],
   floats:{_Material_Alpha:0,_AlphaClip:0,_ZWrite:1,_Cull:2,_Lighting_Fog:1,_Lighting_Medium_Underwater:0,_Material_VertexAnimation:0,_Surface_Effect:0,_Clip_Offset:0,GLIMMER:0,UV_WORLD:0,_Material_SrcBlend:1,_Material_DstBlend:0,_ZTest:4,CUSTOM_RIMLIGHT:1,_Lighting_RimPower:1.5,_Lighting_RimFeathering:0.16699999570846558,_Lighting_RimIntensity:1,_Lighting_RimColoring:0,_Smoothness_Shift:0,_Metallic_Shift:metallic,_OcclusionStrength:occlusion,_ReflectionStrength:1},
   colors:{_BaseColor:[1,1,1,1],_EmissionColor:[1.8443026542663574,1.0621638298034668,.5697060227394104,1]},
   textures:{_BaseMap:link(keys[0]),_BumpMap:link(keys[1]),_MetallicGlossMap:link(keys[2]),_AnimTex:link(null),_Surface_EffectMap:link(null)}};
  const textures=Object.fromEntries(keys.map(k=>[k,{fixture:k}]));
  const base={materials:{[id]:material},shaders:{[shader]:{objectSha256:'7c32f4b3f7c0c0d580af1e22584952aa29d266dfbe98de3b916c3fecb7339931'}},textures};
  const p=resolveCustomLitFixedMaterial(base,id);
  assert.equal(p.blendState,undefined);assert.equal(p.material.metallicShift,metallic);assert.equal(p.material.occlusionStrength,occlusion);
  assert.deepEqual(p.textures,{baseMap:textures[keys[0]],normalMap:textures[keys[1]],comboMap:textures[keys[2]]});
  for(const [k,v] of [['_Material_Alpha',1],['_ZWrite',0],['_Cull',0],['_Material_DstBlend',10],['UV_WORLD',1]]){
   const bad=structuredClone(base);bad.materials[id].floats[k]=v;assert.throws(()=>resolveCustomLitFixedMaterial(bad,id),/SHADER_UNSUPPORTED/);
  }
  const bad=structuredClone(base);bad.materials[id].objectSha256='0'.repeat(64);assert.throws(()=>resolveCustomLitFixedMaterial(bad,id),/SHADER_UNSUPPORTED/);
  assert.throws(()=>resolveCustomLitFixedMaterial({...base,materials:{[id+'0']:material}},id+'0'),/SHADER_UNSUPPORTED/);
 }
});

test('original sandwich board, car and potted plant materials use exact existing CustomLit branches',()=>{
 const shader='CAB-46b8f8fe122147493b3113f7c1c8cd0f:-6681258383375895387';
 const rows=[
 ['CAB-5ef6817f21189d51a1959442b2f74051:-7047482495623742839','46792fb6732c4f6891287c3f4adf9454f03bf4e332645d2385b88d60e9c362a3',2,1,0,-0.18799999356269836,1,1,[0,0,0,1]],
 ['CAB-727becbe455791108d05c4e036482727:7716668811824500502','1f5785fed9b1d2f3b8a90bdd46353f754fe7ca46bae247c309b19318768f76ed',0,0,-0.14399999380111694,0,1,1,[0,0,0,1]],
 ['CAB-4cb7373ba004738e2471a644a799f890:6471817753889870274','e16c6bbb1062ac1acdde8d94024609e9691db4be970812d8edbd46216e2d5f93',2,0,-0.20000000298023224,0.20000000298023224,.5,1,[7.906698703765869,5.795485973358154,3.2289137840270996,1]],
 ['CAB-4cb7373ba004738e2471a644a799f890:709974708372506574','0b3ce9b28eaf6ecabda17e848e2e01c4a132a3d6756d1ea62a074ee72d56fe19',2,0,-0.20000000298023224,-0.20000000298023224,0.7009999752044678,6,[0,0,0,1]]
 ];
 for(const [id,hash,cull,rim,ss,ms,occ,refl,emission] of rows){
  const link=texture=>({texture,scale:[1,1],offset:[0,0]});
  const material={shader,objectSha256:hash,renderQueue:-1,validKeywords:rim?['CUSTOM_RIMLIGHT_ON']:[],
   floats:{_Material_Alpha:0,_AlphaClip:0,_ZWrite:1,_Cull:cull,_Lighting_Fog:1,_Lighting_Medium_Underwater:0,_Material_VertexAnimation:0,_Surface_Effect:0,_Clip_Offset:0,GLIMMER:0,UV_WORLD:0,_Material_SrcBlend:1,_Material_DstBlend:0,_ZTest:4,_StencilCompare:0,_StencilOverride:0,CUSTOM_RIMLIGHT:rim,_Lighting_RimPower:rim?5:1.5,_Lighting_RimFeathering:rim?.18199999630451202:.5,_Lighting_RimIntensity:rim?.9300000071525574:1,_Lighting_RimColoring:rim?.5370000004768372:0,_Smoothness_Shift:ss,_Metallic_Shift:ms,_OcclusionStrength:occ,_ReflectionStrength:refl},
   colors:{_BaseColor:[1,1,1,1],_EmissionColor:emission},textures:{_BaseMap:link('base'),_BumpMap:link('normal'),_MetallicGlossMap:link('combo'),_AnimTex:link(null),_Surface_EffectMap:link(null)}};
  const base={materials:{[id]:material},shaders:{[shader]:{objectSha256:'7c32f4b3f7c0c0d580af1e22584952aa29d266dfbe98de3b916c3fecb7339931'}},textures:{base:{fixture:1},normal:{fixture:2},combo:{fixture:3}}};
  const p=resolveCustomLitFixedMaterial(base,id);
  assert.equal(p.material.smoothnessShift,ss);assert.equal(p.material.metallicShift,ms);assert.equal(p.material.occlusionStrength,occ);assert.equal(p.reflectionStrength,refl);assert.equal(!!p.material.rim,!!rim);assert.equal(p.blendState,undefined);
  for(const [k,v] of [['_Cull',cull===0?2:0],['_ZWrite',0],['_AlphaClip',1],['_Material_DstBlend',10],['UV_WORLD',1]]){
   const bad=structuredClone(base);bad.materials[id].floats[k]=v;assert.throws(()=>resolveCustomLitFixedMaterial(bad,id),/SHADER_UNSUPPORTED/);
  }
  const wrong=structuredClone(base);wrong.materials[id].validKeywords=rim?[]:['CUSTOM_RIMLIGHT_ON'];assert.throws(()=>resolveCustomLitFixedMaterial(wrong,id),/SHADER_UNSUPPORTED/);
  const bad=structuredClone(base);bad.materials[id].objectSha256='0'.repeat(64);assert.throws(()=>resolveCustomLitFixedMaterial(bad,id),/SHADER_UNSUPPORTED/);
 }
});

// Synthetic resolver fixtures with exact source identity/state pins, not original texture bytes.
test('recovered CustomLit material identities keep opaque and transparent state and refuse unknown sources',()=>{
 const shader='CAB-46b8f8fe122147493b3113f7c1c8cd0f:-6681258383375895387';
 const pins={"CAB-1439ecb4e3aec07edf439376f0ff48b7:6875419335993937146":["fe7c1d68a979a90755b8ecd8f6ddd6d0507455af2052d9c6e2c6df3e1a6a2bca",2,1,0],"CAB-1c1b859afeb3ce121c65bd4d940f64a3:8021757393813074012":["dd32afd94fc5c46bc05221db41fdbda2ddbf1ec4ea82e2659967b0a4f4ab9c7b",0,0,0],"CAB-26b78ef50cd0102f819c80ce76b0e84a:-8751875142509439319":["40184e152d561c9995165acbe812f3e56da79625aac194f612d2e6ceecb47013",2,1,0],"CAB-326430791305264b72b217604f631d01:8956617032269294769":["08194347d6edec88a736cae1dac2cbfe64f48fe5c6e141f70124341701fbb2ce",2,1,1],"CAB-33bc600e7fae418c9769544f1e5f05d2:5873890289002783234":["ba070631622075a6b8858e0b2e1c9d59acdad009666ecc152b375703e5807e45",2,1,0],"CAB-4cbb188f16e193d9bfbdc1f756a7075f:5006645151548219416":["a8467a6b9baced830e965e1078bd5a0978ce415f351bdc78e51e11ef06ba820d",2,1,1],"CAB-5adefa5259bf77974773f1a45f661f73:4239319393969375369":["c61132de1dce5b1d5955d7f67904a20e589b0304a87a3c71223e0ed5ecbfe9b1",2,1,0],"CAB-6d11532fc68f7b4cb891d1c834aa5158:4239319393969375369":["2235c20ed5276ba36c84259dccf84caa4555fe2d0db06a08f9daf3b9bb82b8b9",2,1,0],"CAB-73835266a195e40d140153efd7f1158d:-3532526916947604860":["fad92deea0c524374498984df044f1b68b2b7058d574949fc99e86f599fdf833",2,1,0],"CAB-73835266a195e40d140153efd7f1158d:-4011883226903426342":["188175dbad2892f3b504fe6839967c2042568899431b73ea967d003bdafb20d7",2,1,0],"CAB-73835266a195e40d140153efd7f1158d:1785596979502785932":["dee6b450d1987552480d8844a20d25b45ddfb9788256e92d41e7d374c03e4218",2,1,0],"CAB-73835266a195e40d140153efd7f1158d:3913939513852248152":["40df42e2ebb7593a1af28c66f2cfdf023b19d76be7571e13d2385c724c48baf3",2,1,0],"CAB-73835266a195e40d140153efd7f1158d:4199956011791383284":["d8678de264bf23569ad616210e67baf8fb23cccc839fa854caf6f025d15ce0f9",2,1,0],"CAB-73835266a195e40d140153efd7f1158d:4239319393969375369":["f49a88c0d27bc896b4e29e7bd0c7c4424ac1cdbf24e6c7f831db62de9e9db92a",2,1,0],"CAB-73835266a195e40d140153efd7f1158d:493915374724310081":["771b1bb537e77fcc94c3a8d84286d422c875092e10e6311eef4378fee7b9854b",2,1,0],"CAB-73835266a195e40d140153efd7f1158d:5962445236911637713":["78e392620ce1e627ae8c4036ae6601a2ae18ecd01df55fc2161996feba3e4eaa",2,1,0],"CAB-739c310574b04f80c73dc9bcbce7b5a6:-6459101295544685820":["24b47eeaeeaa611d985eec0af4a87d70a4e464cb20ec72d3814c5a454c012ef0",2,1,1],"CAB-73c2544405ea19bc6b0e6e3c697cdf3a:-2145339595968911544":["0c9f17486d04ac011d53d7af00713d75fc18d1d953354985df10bfafe0e766e7",2,1,0],"CAB-73c2544405ea19bc6b0e6e3c697cdf3a:-740010890970367087":["824c6736801c3e82b167415c8a94eb2d72306fe80ace62cc89a33acb18eeafd9",2,1,0],"CAB-73c2544405ea19bc6b0e6e3c697cdf3a:8635216688364837206":["6d2e5c1c2c771a6f98d76b191a0c114898cbefb0b13f480113e145538bd94247",2,0,0],"CAB-75d62aea5e760f726633c5193da9e44f:-7813672276148275753":["449d8ae5fe4d7eca1f18124f22fb36c8d154dff8a1ff7f0285191fbee1054576",2,0,1],"CAB-77b4d466cba978b8d21f2677ba9c072c:6619394934813481110":["ed31a29df1f710687009a83303e6de72eebd38930639c42905838103a8ac28e3",2,1,0],"CAB-8b270d641718a9750b3162a6d7a8fa58:3649081133865875251":["342350d0a6ce74936a7b3577964587e1c93be01cf7520e01bac20bc1c0f43bf0",2,1,1],"CAB-92d332698b260ccb0ebe4b727c4ee438:-8610936547380561021":["8e610e83be83173de854562262eeea880354f1230a9435e823e94472a8fb8927",2,1,0],"CAB-cd65c191db860a8da2d63322561f9184:-7077824350659111235":["4d05e4effe9bfec2df681680bc28648455632f0fd5b4496c443d6670314cf3a0",2,1,0],"CAB-dfce5aa155a7778c534c64f350e65fc2:-6900618558525068163":["4fd299964a4aebc251c8b9656d956aa9c8b723252056148ca43ae3a0d2b4f064",2,1,0],"CAB-edde5a06cbc2839ee42b4b8883d57d4f:3365990827015722336":["0de7bf0df7f5500253f7137b81ca6943d45054eda9d13ffdf2d58deea7317636",0,0,0],"CAB-f73d61053072c31e477b89e0600e2d74:2747074911116870100":["dc78dc143fd7f356c197d82fa1cd0520c7cfc0b072c89ffd58be6318f541a241",2,1,0]};
 for(const [id,[hash,cull,rim,alpha]] of Object.entries(pins)){
  const link=texture=>({texture,scale:[1,1],offset:[0,0]});
  const material={shader,objectSha256:hash,renderQueue:alpha?3000:-1,validKeywords:rim?['CUSTOM_RIMLIGHT_ON']:[],floats:{_Material_Alpha:alpha,_AlphaClip:0,_ZWrite:1-alpha,_Cull:cull,_Lighting_Fog:1,_Lighting_Medium_Underwater:0,_Material_VertexAnimation:0,_Surface_Effect:0,_Clip_Offset:0,GLIMMER:0,UV_WORLD:0,_Material_SrcBlend:alpha?5:1,_Material_DstBlend:alpha?10:0,_ZTest:4,_StencilCompare:0,_StencilOverride:0,CUSTOM_RIMLIGHT:rim,_Lighting_RimPower:1.5,_Lighting_RimFeathering:.167,_Lighting_RimIntensity:1,_Lighting_RimColoring:0,_Smoothness_Shift:0,_Metallic_Shift:0,_OcclusionStrength:1,_ReflectionStrength:1},colors:{_BaseColor:[1,1,1,alpha?.38:1],_EmissionColor:[0,0,0,1]},textures:{_BaseMap:link(null),_BumpMap:link(null),_MetallicGlossMap:link('combo'),_AnimTex:link(null),_Surface_EffectMap:link(null)}};
  const base={materials:{[id]:material},shaders:{[shader]:{objectSha256:'7c32f4b3f7c0c0d580af1e22584952aa29d266dfbe98de3b916c3fecb7339931'}},textures:{combo:{fixture:1}}};
  const p=resolveCustomLitFixedMaterial(base,id);assert.equal(p.material.customLit.materialAlpha,alpha);assert.equal(!!p.material.rim,!!rim);assert.equal(p.textures.baseMap.sha256,'8667e718294e9e0df1d30600ba3eeb201f764aad2dad72748643e4a285e1d1f7');assert.equal(p.textures.normalMap.sha256,'33869922b91375cf2b77363e8858a3aee06bae988641ad07f99e817b272d2c35');assert.equal(p.textures.comboMap,base.textures.combo);
  assert.deepEqual(p.blendState,alpha?{queue:3000,srcBlend:5,dstBlend:10,zWrite:false,cull}:undefined);
  for(const [k,v] of [['_Cull',cull===0?2:0],['_Material_Alpha',1-alpha],['_ZWrite',alpha],['_StencilCompare',1],['UV_WORLD',1]]){const bad=structuredClone(base);bad.materials[id].floats[k]=v;assert.throws(()=>resolveCustomLitFixedMaterial(bad,id),/SHADER_UNSUPPORTED/);}
  const bad=structuredClone(base);bad.materials[id].textures._BaseMap.texture='missing';assert.throws(()=>resolveCustomLitFixedMaterial(bad,id),/CUSTOM_LIT_TEXTURE/);
  bad.materials[id].objectSha256='0'.repeat(64);assert.throws(()=>resolveCustomLitFixedMaterial(bad,id),/SHADER_UNSUPPORTED/);
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({stdin:{contents:"export * from './src/furniture-glass-v3.0.1';export * from './src/furniture-forwardlit-gpu';",resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {evaluateGlassPixel,glassMaterialState,resolveGlassFixedMaterial,glassShaderId,glassShaderHash,furnitureForwardFragment}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const fixture={"input":{"base":[0.7615834408422766,0.7891948328714786,0.8726994226564978,0.5181723824671266],"tint":[0.15353533793165822,0.4090226974862695,0.6430780820606644,0.4844497839843047],"normalSample":[0.6194045583333824,0.9012159850936742,0.4116674091505519,0.3717944727178961],"tangentRows":[[-0.09649277861212698,-0.9953336845880938,0],[0.9953336845880938,-0.09649277861212698,0],[0,0,1]],"view":[-0.45278113313939045,0.7771924488883222,0.43699101004938584],"light":[0.5702515450279504,-0.8211921228597845,0.021369902813912364],"lightColor":[0.7719948682531239,0.7976928615468308,0.675812983832913],"ambientMain":[0.8043246803273157,0.8715404574762975,0.30327980935921334],"ambientFill":[0.37335579273038033,0.844976329731015,0.036185732011605354],"emission":[0.8813620964985817,0.23290886856867496,0.6362618499511303],"primary":[0.9851913373194936,0.48941949223937176,0.2568081939796472],"secondary":[0.4049308103778444,0.41498905510022494,0.4833678929916363],"roughness":0.8079264723813384,"metallic":0.06236030717009772,"lightingClamp":0.08576863975199935,"reflectionBlend":0.2354500320907196,"reflectionIntensity":0.19914178250893078,"rim":[3.4329664008201557,0.29854817608646345,0.8762322830538223,0.6713842438396881],"fog":0.647440171955199},"expected":{"rgba":[0.5285079528679848,0.5803435960908075,0.21954897045256005,0.251028498752832],"direction":[0.49439088180780266,-0.7429561736773047,-0.4512136744161042],"lod":4.868480741692954}};
test('original high quality glass blob 191 token evaluation fixture',()=>{
 const actual=evaluateGlassPixel(fixture.input),e=fixture.expected;
 for(const [a,b] of [[...actual.rgba,...actual.direction,actual.lod],[...e.rgba,...e.direction,e.lod]][0].map((x,i)=>[x,[...e.rgba,...e.direction,e.lod][i]]))assert.ok(Math.abs(a-b)<1e-12,JSON.stringify({a,b}));
 assert.match(furnitureForwardFragment,/if\(glassEnabled\)/);assert.match(furnitureForwardFragment,/b\.a\*baseColor\.a/);
});
const table='CAB-9a3da43ca266ea5645a6445a7d9fd3c3:8738455483337011380',shelf='CAB-b7b9619989a948060360e493812c1b7f:635830900356876204';
const link=texture=>({texture,scale:[1,1],offset:[0,0]});
const source=(id)=>{
 const isTable=id===table;
 const material={objectSha256:isTable?'a1d4aa4fd2c08828c06ae21279fb288a95bc8a4acb8108b5b59928188725796f':'1e84276455f6138a4564ae0e7cd6da21556f8a63c776dd24d621002f45e6d2ee',shader:glassShaderId,validKeywords:['CUSTOM_RIMLIGHT_ON'],renderQueue:isTable?3201:3001,
 floats:{_Material_SrcBlend:isTable?3:1,_Material_DstBlend:10,_ZWrite:0,_Cull:2,_Refraction_Intensity:0,CUSTOM_RIMLIGHT:1,GLIMMER:0,EFFECT_OPALESCENT:0,_AlphaClip:0,_Geometry_VertexOffset:0,_Geometry_NormalScale:1,_Roughness:.467,_Metallic:.146,_Lighting_Clamp:1,_Lighting_RimPower:1.24,_Lighting_RimFeathering:.171,_Lighting_RimIntensity:5,_Lighting_RimColoring:0},
 colors:{_BaseColor:[.67,.736,.736,.549],_EmissionColor:[0,0,0,1]},textures:{_BaseMap:link(isTable?'base':null),_BumpMap:link(isTable?'normal':null)}};
 return {materials:{[id]:material},shaders:{[glassShaderId]:{objectSha256:glassShaderHash}},textures:{base:{sha256:'b'},normal:{sha256:'n'}}};
};
test('exact glass material queue/blend state, and no fake built-in texture fallback',()=>{
 const d=source(table);
 assert.deepEqual(glassMaterialState(d,table),{queue:3201,srcBlend:3,dstBlend:10,zWrite:false,cull:2});
 const p=resolveGlassFixedMaterial(d,table);
 assert.equal(p.textures.baseMap,d.textures.base);assert.equal(p.textures.normalMap,d.textures.normal);assert.equal(p.material.glass.roughness,.467);
 const s=source(shelf);
 assert.deepEqual(glassMaterialState(s,shelf),{queue:3001,srcBlend:1,dstBlend:10,zWrite:false,cull:2});
 assert.throws(()=>resolveGlassFixedMaterial(s,shelf),/BUILTIN_TEXTURE_UNVERIFIED/);
 d.materials[table].validKeywords.push('REFRACTION_ON');assert.throws(()=>glassMaterialState(d,table),/SOURCE/);
 const wrong=source(table);wrong.materials[table].floats._Material_SrcBlend=5;assert.throws(()=>glassMaterialState(wrong,table),/STATE/);
 const changed=source(table);changed.materials[table].renderQueue=2000;assert.throws(()=>glassMaterialState(changed,table),/IDENTITY/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
async function load(file){
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/'+file,import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
}
const {evaluateFlowerLighting,flowerWorldNormal}=await load('flower-native-lighting.ts');
const {flowerForwardLightingGLSL,validateFlowerForwardInputs}=await load('flower-forwardlit-gpu.ts');
const vectors=JSON.parse(readFileSync(new URL('../data/flower-native-lighting-vectors-v3.0.1.json',import.meta.url),'utf8'));
const equal=(actual,expected)=>{assert.equal(actual.length,expected.length);actual.forEach((x,i)=>assert.ok(Math.abs(x-expected[i])<1e-6,JSON.stringify({actual,expected,i})));};
test('original flower lighting, rim and fog arithmetic matches native instruction samples',()=>{
 assert.equal(vectors.cases.length,8);
 for(const {input,expected} of vectors.cases){
  const result=evaluateFlowerLighting(input);
  [result.lit,result.rimmed,result.color].forEach((v,i)=>equal(v,expected[i]));
  const noRim=evaluateFlowerLighting({...input,rim:null});
  equal(noRim.lit,noRim.rimmed);
  assert.ok(result.reflection.lod>=0&&result.reflection.lod<=6.01);
 }
 assert.throws(()=>evaluateFlowerLighting({...vectors.cases[0].input,normal:[0,0,0]}),/DIRECTION/);
});
test('native normal map decode preserves face sign, TBN rows and normalization',()=>{
 assert.equal(vectors.normals.length,8);
 for(const [sample,face,basis,expected] of vectors.normals)equal(flowerWorldNormal(sample,face,basis),expected);
 assert.throws(()=>flowerWorldNormal([0,0,0,0],true,[[0,0,0],[0,0,0],[0,0,0]]),/DIRECTION/);
});
test('the GLSL lighting function equals the one exercised in Mesa EGL float readback',()=>{
 assert.equal(createHash('sha256').update(flowerForwardLightingGLSL).digest('hex'),'d852034f9051346ef25cd2b940e3690fc0ce7cdd6f226f62d23e2109c91fa00f');
});
test('native authored rim power can exceed one; unsupported effects refuse',()=>{
 const scene={model:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],viewProjection:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],normalMatrix:[1,0,0,0,1,0,0,0,1],tangentParity:1,cameraPosition:[0,2,1],lightDirection:[0,1,0],lightColor:[1,1,1],ambient:[1,1,1],fogMain:[0,0,0],fogFill:[0,0,0],screenOcclusion:1,screenOcclusionStrength:0,fogVarying:0,fogMultiplier:0,mipBias:0};
 const material={baseColor:[1,1,1,1],patternColor1:[1,0,0],patternColor2:[0,0,1],smoothnessShift:0,metallicShift:0,patternSmoothnessShift:0,patternMetallicShift:0,occlusionStrength:1,surfaceEffect:0,baseST:[1,1,0,0],patternST:[1,1,0,0],emissionColor:[0,0,0],reflectionStrength:0.1,ambientSaturation:0,rim:{power:1.5,feathering:.05,intensity:.6,coloring:0}};
 validateFlowerForwardInputs(scene,material);
 assert.throws(()=>validateFlowerForwardInputs(scene,{...material,surfaceEffect:1}),/INPUT/);
 assert.throws(()=>validateFlowerForwardInputs({...scene,normalMatrix:[1]},material),/INPUT/);
});

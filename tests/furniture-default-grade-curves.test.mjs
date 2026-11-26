import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/furniture-default-grade-curves-v3.0.1.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {nativeGradeCurveFormat,nativeDefaultGradeCurveTexels,createNativeDefaultGradeCurveSampler,DEFAULT_GRADE_CURVE_SOURCE}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
test('source texture format selection preserves the original SetPixels preference',()=>{
 assert.equal(nativeGradeCurveFormat(true,true),45);
 assert.equal(nativeGradeCurveFormat(true,false),45);
 assert.equal(nativeGradeCurveFormat(false,true),5);
 assert.equal(nativeGradeCurveFormat(false,false),8);
 assert.throws(()=>nativeGradeCurveFormat(null,false),/CAPABILITY/);
});
test('all original default curves generate 128 native samples, i/128 not i/127',()=>{
 for(const format of [45,5,8])for(let slot=0;slot<8;slot++){
  const t=nativeDefaultGradeCurveTexels(slot,format);
  assert.equal(t.length,128);
  const quant=v=>format===45?v:Math.fround(Math.round(v*255)/255);
  for(let i=0;i<128;i++)assert.equal(t[i],quant(slot<4?i/128:.5));
  const s=createNativeDefaultGradeCurveSampler(format);
  for(let i=0;i<128;i++)assert.equal(s(slot,(i+.5)/128),t[i]);
  assert.equal(s(slot,-2),t[0]);assert.equal(s(slot,3),t[127]);
  assert.equal(s(slot,1/128),(t[0]+t[1])/2);
 }
 const s=createNativeDefaultGradeCurveSampler(45);
 assert.equal(s(0,0),0);assert.equal(s(0,1),127/128);
 assert.equal(s(0,.5),.5-1/256);
 assert.equal(s(7,.5),.5);
 assert.throws(()=>s(8,0),/SAMPLE/);assert.throws(()=>s(0,Infinity),/SAMPLE/);
 assert.throws(()=>nativeDefaultGradeCurveTexels(0,99),/SOURCE/);
 assert.equal(DEFAULT_GRADE_CURVE_SOURCE.sourceFidelity,'serialized-default-only');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/furniture-authored-light-v3.0.1.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {sampleAuthoredCurve,sampleAuthoredGradient,sampleFurnitureAuthoredPreset}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const d=JSON.parse(readFileSync(new URL('../data/furniture-light-region-source-v3.0.1.json',import.meta.url),'utf8'));
const ui=d.regions[0].settings.Settings;
const value=(r,k)=>r.fields[k].sample.value;
test('actual UI_Static authored data: retain raw HDR values and all source references',()=>{
 const r=sampleFurnitureAuthoredPreset(d,ui,.5);
 assert.equal(r.name,'LightRegion_UI_Static');assert.equal(r.polar,140);assert.equal(r.vignetteEnabled,false);
 assert.equal(Object.keys(r.fields).length,24);
 assert.equal(value(r,'Elevation'),95);assert.equal(value(r,'Tilt'),130);assert.equal(value(r,'ReflectionIntensity'),1);
 assert.ok(Math.abs(value(r,'SSAOIntensity')-1.2)<1e-6);
 assert.ok(Math.abs(value(r,'SSAORadius')-.6)<1e-6);
 const raw=d.assets[d.presets[ui].links.AmbientFillColor].keys[0];
 assert.deepEqual(value(r,'AmbientFillColor'),raw);assert.ok(raw[0]>1&&raw[2]>1);
 assert.equal(r.fields.SunColor.sample.reason,'gradient-interpolation-unverified');
 assert.equal(r.reflection.name,'Cubemap_Interior');assert.equal(r.reflection.faceOrder,'unverified');assert.equal(r.runtimeBinding,'unverified');
 const a=sampleFurnitureAuthoredPreset(d,ui,0),b=sampleFurnitureAuthoredPreset(d,ui,1);
 assert.deepEqual(value(a,'SunColor'),d.assets[d.presets[ui].links.SunColor].keys[0]);
 assert.deepEqual(value(b,'SunColor'),d.assets[d.presets[ui].links.SunColor].keys[1]);
 assert.notDeepEqual(value(a,'SunColor'),value(b,'SunColor'));
});
test('every original preset preserves its exact asset IDs and never invents a missing value',()=>{
 for(const [id,p] of Object.entries(d.presets))for(const t of [0,.25,.5,.75,1]){
  const r=sampleFurnitureAuthoredPreset(d,id,t);
  assert.equal(r.reflection.assetId,p.links.ReflectionMap);
  assert.equal(Object.keys(r.fields).length,24);
  for(const [key,{assetId,sample}] of Object.entries(r.fields)){
   assert.equal(assetId,p.links[key]);
   if(sample.status==='sampled')assert.ok([sample.value].flat().every(Number.isFinite));
   else assert.ok(sample.reason);
  }
 }
 assert.throws(()=>sampleFurnitureAuthoredPreset(d,'not-a-preset',.5),/FURNITURE_LIGHT_SOURCE/);
 assert.throws(()=>sampleFurnitureAuthoredPreset(d,'0',.5),/FURNITURE_LIGHT_PRESET/);
 assert.throws(()=>sampleFurnitureAuthoredPreset(d,ui,NaN),/FURNITURE_LIGHT_SOURCE/);
});
test('unweighted curve arithmetic, explicit unresolved weighted, step and out-of-domain cases',()=>{
 const k=(t,v,inT=0,outT=0,mode=0)=>[t,v,inT,outT,mode,0,0];
 const c=(keys)=>({kind:'curve',keys,wrap:[2,2,4]});
 assert.deepEqual(sampleAuthoredCurve(c([k(0,0,0,2),k(1,2,2,0)]),.25),{status:'sampled',value:.5});
 assert.deepEqual(sampleAuthoredCurve(c([k(0,0),k(1,1)]),.25),{status:'sampled',value:.15625});
 assert.equal(sampleAuthoredCurve(c([k(.2,0),k(1,1)]),.1).reason,'wrap-unverified');
 assert.equal(sampleAuthoredCurve(c([k(0,0,0,0,1),k(1,1)]),.5).reason,'weighted-curve');
 assert.equal(sampleAuthoredCurve(c([k(0,0,0,'Infinity'),k(1,1)]),.5).reason,'step-tangent-unverified');
 assert.equal(sampleAuthoredCurve(c([k(0,0),k(1,1)]),-1).reason,'invalid-time');
});
test('gradient uses separate active RGB and alpha key counts, not unused slots',()=>{
 const g={kind:'gradient',keys:[[2,1,0,1],[2,1,0,.5],[99,99,99,99]],colorTimes:[0,65535,0],alphaTimes:[0,65535,0],colorKeyCount:2,alphaKeyCount:2,mode:0,colorSpaceRaw:255};
 assert.deepEqual(sampleAuthoredGradient(g,1),{status:'sampled',value:[2,1,0,.5]});
 assert.equal(sampleAuthoredGradient(g,.5).reason,'gradient-interpolation-unverified');
 assert.deepEqual(sampleAuthoredGradient({...g,keys:[[2,1,0,1],[2,1,0,1]]},.5),{status:'sampled',value:[2,1,0,1]});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/furniture-grade-uniforms-v3.0.1.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {nativeGradeWhiteBalance,nativePrepareSmh,nativePrepareLiftGammaGain,nativePrepareGradeProfile,nativeSerializedDefaultGradeProfile,prepareNativeSerializedDefaultGrade}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
test('Switch 3.0.1 original instruction fixtures: white balance including neutral and both temperature branches',()=>{
 for(const [a,e] of [[[0,0],[1.0000003576278687,0.9999992847442627,1.000003457069397]],[[-100,-100],[0.6998651623725891,1.4416356086730957,1.7967475652694702]],[[100,100],[1.2687970399856567,0.8818109631538391,0.7534120082855225]],[[-25,17],[0.9527607560157776,0.9912306666374207,1.488387942314148]],[[65,-30],[1.0731083154678345,1.0714070796966553,0.5581302046775818]]]){
  assert.deepEqual(nativeGradeWhiteBalance(...a),e);
 }
 assert.throws(()=>nativeGradeWhiteBalance(101,0),/WHITE_BALANCE/);
});
test('prepare serialized default profile without replacing the nonidentity native balance',()=>{
 const p=nativeSerializedDefaultGradeProfile(),{uniforms:u,exposureMultiplier}=prepareNativeSerializedDefaultGrade();
 assert.deepEqual(u.balance,[1.0000003576278687,.9999992847442627,1.000003457069397]);
 assert.deepEqual(u.filter,[1,1,1]);assert.deepEqual(u.mixer,[[1,0,0],[0,1,0],[0,0,1]]);
 assert.deepEqual(u.hueSatContrast,[0,1,1]);assert.deepEqual(u.splitShadows,[.5,.5,.5,0]);
 assert.deepEqual(u.splitHighlights,[.5,.5,.5]);assert.deepEqual(u.limits,[0,Math.fround(.3),Math.fround(.55),1]);
 for(const name of ['gamma','gain','shadows','midtones','highlights'])assert.deepEqual(u[name],[1,1,1]);
 assert.deepEqual(u.lift,[0,0,0]);assert.equal(exposureMultiplier,1);
 p.filter[0]=0;assert.equal(nativeSerializedDefaultGradeProfile().filter[0],1);
});
test('explicit converter and authored weight rules; no hidden gamma approximation',()=>{
 const linear=x=>x;
 assert.deepEqual(nativePrepareSmh([.25,.5,.75,.125],linear),[.75,1,1.25]);
 assert.deepEqual(nativePrepareSmh([.25,.5,.75,-.5],linear),[0,0,.25]);
 const lgg=nativePrepareLiftGammaGain([1,1,1,.25],[1,1,1,-2],[1,1,1,.5],linear);
 assert.deepEqual(lgg.lift,[.25,.25,.25]);assert.deepEqual(lgg.gain,[1.5,1.5,1.5]);
 assert.deepEqual(lgg.gamma,Array(3).fill(Math.fround(1/Math.fround(.001))));
 const p={...nativeSerializedDefaultGradeProfile(),hueShift:180,saturation:-50,contrast:25,splitBalance:-25,postExposure:2,filter:[.25,.5,1,1]};
 const {uniforms:u,exposureMultiplier}=nativePrepareGradeProfile(p,x=>x*x);
 assert.deepEqual(u.filter,[.0625,.25,1]);assert.deepEqual(u.hueSatContrast,[.5,.5,1.25]);
 assert.equal(u.splitShadows[3],-.25);assert.equal(exposureMultiplier,4);
 assert.throws(()=>nativePrepareGradeProfile(p,()=>NaN),/GAMMA/);
 assert.throws(()=>nativePrepareGradeProfile({...p,limits:[0,0,1,1]},linear),/PROFILE/);
});

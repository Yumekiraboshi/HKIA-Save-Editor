import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/furniture-ldr-lut-builder-v3.0.1.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {nativeLdrBuilderPixel,buildNativeLdrLut,sampleNativeLdrAtlas}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const uniform={
 balance:[1.0301391803971789,0.956667568240407,0.9844617473542958],
 filter:[1.143914113493529,1.1111490886780304,1.0563322052753505],
 mixer:[[1,.01,.01],[.01,1,.01],[.01,.01,1]],
 hueSatContrast:[0.00984106870671013,0.964816911733465,0.9713384943218395],
 lift:[-0.004988114338747761,0.0015555175073117336,0.004797031014094524],
 gamma:[1.1234800322064216,0.8567823779946513,1.1974289786580683],
 gain:[0.912869707367299,0.9572289573359632,0.9392038630581429],
 shadows:[1.0978098352403438,0.9421997840608326,1.0838956112576736],
 midtones:[1.0874821465537543,1.0856686394293074,1.0006688785798765],
 highlights:[0.941529214536046,0.9198807275105765,1.0778846973506624],
 limits:[0,.3,.55,1],
 splitShadows:[0.5457917527337801,0.4524302212490831,0.559798658971638,-0.056300693704976174],
 splitHighlights:[0.5214376768053769,0.5778282285342968,0.41258351965809903]
};
const sat=x=>Math.max(0,Math.min(1,x));
const sample=(slot,x)=>sat(.13+slot*.037+.6*sat(x));
const near=(a,b)=>{assert.equal(a.length,b.length);a.forEach((x,i)=>assert.ok(Math.abs(x-b[i])<1e-12,JSON.stringify({a,b})));};
test('native LutBuilderLdr program 2 fixture: full grading, all eight curves',()=>{
 const calls=[];const c=nativeLdrBuilderPixel([.076171875,.21875],[16,.001953125,.03125,16/15],uniform,(slot,x)=>{calls.push(slot);return sample(slot,x);});
 near(c,[0.36096391990472687,0.3530881678605804,0.32134375,1]);
 assert.deepEqual(calls,[4,7,5,6,0,1,0,2,0,3]);
 assert.throws(()=>nativeLdrBuilderPixel([.1,.2],[16,0,.03125,16/15],{...uniform,gamma:[1,0,1]},sample),/UNIFORMS/);
 assert.throws(()=>nativeLdrBuilderPixel([.1,.2],[16,0,.03125,16/15],uniform,()=>NaN),/CURVE_SAMPLE/);
});
test('generated native-layout atlas covers all 4096 texels and samples center/edge/interpolation',()=>{
 const a=buildNativeLdrLut(16,uniform,sample);assert.equal(a.width,256);assert.equal(a.height,16);assert.equal(a.rgba.length,4096*4);assert.equal(a.rowOrder,'bottom-up');assert.deepEqual(a.parameters,[1/256,1/16,15]);
 for(let y=0;y<16;y++)for(let x=0;x<256;x++){
  const i=(y*256+x)*4;assert.equal(a.rgba[i+3],255);
  const p=nativeLdrBuilderPixel([(x+.5)/256,(y+.5)/16],[16,.5/256,.5/16,16/15],uniform,sample);
  assert.deepEqual([...a.rgba.slice(i,i+4)],p.map(v=>Math.round(v*255)));
 }
 const u=(x,y)=>sampleNativeLdrAtlas(a,[(x+.5)/256,(y+.5)/16]);
 near(u(19,3),[...a.rgba.slice((3*256+19)*4,(3*256+19)*4+3)].map(x=>x/255));
 near(u(-100,3),u(0,3));near(u(1000,3),u(255,3));
 near(u(19.5,3.5),u(19,3).map((x,i)=>(x+u(20,3)[i]+u(19,4)[i]+u(20,4)[i])/4));
 assert.throws(()=>buildNativeLdrLut(66,uniform,sample),/SIZE/);
 assert.throws(()=>sampleNativeLdrAtlas({...a,rgba:new Uint8Array(4)},[0,0]),/ATLAS/);
});

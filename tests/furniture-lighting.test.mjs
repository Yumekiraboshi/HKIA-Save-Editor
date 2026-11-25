import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/furniture-lighting-v3.0.1.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {furnitureLighting,furnitureReflectionCoordinates}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
test('128 independently evaluated original lighting blocks reproduce direct, ambient, environment, emission and fog math',()=>{
 const raw=readFileSync(new URL('../data/furniture-lighting-vectors-v3.0.1.json',import.meta.url)),d=JSON.parse(raw);
 assert.equal(createHash('sha256').update(raw).digest('hex'),'350bd4449929c3fddfd72def1a97872aaed63c6b25dd6c440231b29e5112da92');
 assert.equal(d.version,'3.0.1');assert.equal(d.cases.length,128);
 const near=(a,b)=>{if(typeof b==='number'){assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=1e-6,JSON.stringify({a,b}));}else for(const k of Object.keys(b))near(a[k],b[k]);};
 for(const {input,expected} of d.cases)near(furnitureLighting(input),expected);
 assert.throws(()=>furnitureLighting({...d.cases[0].input,reflectionBlendWeight:NaN}),/FURNITURE_LIGHTING_INPUT/);
 assert.throws(()=>furnitureReflectionCoordinates([0,0,0],[1,0,0],.5),/FURNITURE_LIGHTING_DIRECTION/);
});

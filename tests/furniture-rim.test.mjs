import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/furniture-rim-v3.0.1.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {furnitureRimLighting,furnitureRimFromMaterial}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const cases=[
 [[0.9792596188720466,0.4617352935289298,0.7216585637592341],0.7348862425853395,-0.5701966630058732,0.07803796911512406,[0.6027432362671394,0.12191950272268226,0.382226634481309],[1.7794056436140877,1.7443005841269013,0.2373780979083484],{power:0.4111697946537929,feathering:0.22248607563414302,intensity:4.140455572789147,coloring:0.02472447636767583},[1.8395373170643121,1.7563733009003861,0.27538360334759393]],
 [[0.23293101744485686,0.1161643953959747,0.13636186518608823],0.5234249852126434,-0.6331365295370335,0.40944334015947625,[0.7331857650038027,0.7229955321011505,0.41503758152257597],[1.572269658107329,1.1450150276923294,1.6539203020568083],{power:1.2444093482967862,feathering:0.36912357958085673,intensity:2.901674964224688,coloring:0.9458939112226394},[1.6362112440082692,1.1928010022732178,1.6831352108706887]],
 [[0.622156530505453,0.4799554661468866,0.25844865698261615],0.2813337214794214,-0.5684266126488218,0.9863645026702189,[0.8865853309878791,0.8945620392234958,0.5285688951098176],[1.416768975905648,0.5929782992814003,0.9631409918188667],{power:0.7277073014961127,feathering:0.420140098875878,intensity:1.2635167658156248,coloring:0.09997671456057478},[1.5008589060542077,0.6767707279286295,1.0114288960551252]],
 [[0.9202496385171177,0.10571654060538357,0.8148019173092731],0.69957905129295,-0.8198911949130694,0.48515271892966294,[0.9958643028455554,0.9868623533325966,0.5633005482415795],[1.5436189486875216,1.417349508156207,0.5835457149148873],{power:2.749684768815874,feathering:0.596939821696328,intensity:1.9702820994486203,coloring:0.8189990872832278},[1.5941650688097502,1.4419405313993496,0.6108902829712229]]
];
test('rim arithmetic matches independent original DXBC token evaluator',()=>{
 for(const row of cases){const result=furnitureRimLighting(...row.slice(0,-1));assert.ok(result.every((x,i)=>Math.abs(x-row.at(-1)[i])<1e-12));}
 const [a,r,n,o,amb,lit,p]=cases[0];assert.deepEqual(furnitureRimLighting(a,r,n,o,amb,lit,{...p,intensity:0}),lit);
 assert.deepEqual(furnitureRimLighting(a,r,n,0,amb,lit,p),lit);
});
test('original rim-only materials retain exact parameters; incompatible keywords or inconsistent toggle refuse',()=>{
 const d=JSON.parse(readFileSync(new URL('../data/furniture-base-material-source-v3.0.1.json',import.meta.url)));
 for(const m of Object.values(d.materials).filter(x=>x.shader.endsWith(':-6806329374484566350'))){
  const r=furnitureRimFromMaterial(m.validKeywords,m.floats);
  if(m.floats.CUSTOM_RIMLIGHT===0)assert.equal(r,undefined);
  else assert.deepEqual(r,{power:m.floats._Lighting_RimPower,feathering:m.floats._Lighting_RimFeathering,intensity:m.floats._Lighting_RimIntensity,coloring:m.floats._Lighting_RimColoring});
  assert.throws(()=>furnitureRimFromMaterial([...m.validKeywords,'LIGHTING_INTERIOR'],m.floats),/SHADER_UNSUPPORTED/);
  assert.throws(()=>furnitureRimFromMaterial(m.validKeywords,{...m.floats,CUSTOM_RIMLIGHT:1-m.floats.CUSTOM_RIMLIGHT}),/SHADER_UNSUPPORTED/);
 }
});

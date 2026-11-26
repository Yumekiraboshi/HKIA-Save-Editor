import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const {outputFiles}=await build({stdin:{contents:"export * from './src/flower-icon-route';export * from './src/flower-pattern-selection';export * from './src/inventory-flower-display';",resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {isStaticFlowerCreationIcon,selectFlowerPattern,flowerGrowthKind,loadFlowerPatternSource}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const rows=JSON.parse(readFileSync(new URL('../data/flower-creation-icon-source-v3.0.1.json',import.meta.url)));
const crowns=JSON.parse(readFileSync(new URL('../data/flower-crown-source-index-v3.0.1.json',import.meta.url)));
test('all original creation icon definitions use static routing, distinct from flower species',()=>{
 assert.equal(rows.length,117);assert.equal(new Set(rows.map(r=>r[0])).size,117);
 for(const [id,pid] of rows){assert.match(pid,/^-?[1-9]\d+$/);assert.equal(isStaticFlowerCreationIcon(id),true);assert.equal(flowerGrowthKind(id,{growState:6,baseColor:1,pattern:0,patternColor:0}),null);}
 for(const [id,flowerId] of crowns.rows){assert.equal(isStaticFlowerCreationIcon(id),true);assert.equal(isStaticFlowerCreationIcon(flowerId),false);assert.equal(flowerGrowthKind(flowerId,{growState:6,baseColor:1,pattern:0,patternColor:0}),'plucked');}
 assert.equal(isStaticFlowerCreationIcon(0),false);
});
test('native first enabled override is independent for map and tiling',()=>{
 const guid='543bc492e6cd892439694185f6a4e4bc';
 const row=[14,'Striped','1','',false,'default',null,0,[1,1],[],false,0,[],[],0,[[228573412,null,[4,1],0,1],[228573412,guid,null,1,0],[228573412,'later',[9,9],1,1]]];
 const source={patterns:[row],floatColumns:[]};
 const chosen=selectFlowerPattern(source,228573412,14);
 assert.equal(chosen.patternMapGuid,guid);assert.deepEqual(chosen.patternTiling,[4,1]);
 const fallback=selectFlowerPattern(source,43114910,14);
 assert.equal(fallback.patternMapGuid,'default');assert.deepEqual(fallback.patternTiling,[1,1]);
 assert.equal(selectFlowerPattern(source,228573412,0),null);
 assert.equal(selectFlowerPattern(source,0,14),null);
});
test('unverified pattern manifest is rejected',async()=>{
 await assert.rejects(loadFlowerPatternSource(new ArrayBuffer(0)),/SIZE/);
 await assert.rejects(loadFlowerPatternSource(new ArrayBuffer(32)),/HASH/);
});

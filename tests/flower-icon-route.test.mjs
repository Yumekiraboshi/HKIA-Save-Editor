import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const {outputFiles}=await build({stdin:{contents:"export * from './src/flower-icon-route';export * from './src/flower-appearance';export * from './src/flower-pattern-selection';export * from './src/inventory-flower-display';",resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {isStaticFlowerCreationIcon,selectFlowerPattern,flowerGrowthKind,flowerArtKey,resolveFlowerAppearance,loadFlowerPatternSource}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const rows=JSON.parse(readFileSync(new URL('../data/flower-creation-icon-source-v3.0.1.json',import.meta.url)));
const crowns=JSON.parse(readFileSync(new URL('../data/flower-crown-source-index-v3.0.1.json',import.meta.url)));
test('all original creation icon definitions use static routing, distinct from flower species',()=>{
 assert.equal(rows.length,118);assert.equal(new Set(rows.map(r=>r[0])).size,118);assert.equal(new Set(rows.map(r=>r[1])).size,118);
 for(const [id,pid] of rows){assert.match(pid,/^-?[1-9]\d+$/);assert.equal(isStaticFlowerCreationIcon(id),true);assert.equal(flowerGrowthKind(id,{growState:6,baseColor:1,pattern:0,patternColor:0}),null);}
 for(const [id,flowerId] of crowns.rows){assert.equal(isStaticFlowerCreationIcon(id),true);assert.equal(isStaticFlowerCreationIcon(flowerId),false);assert.equal(flowerGrowthKind(flowerId,{growState:6,baseColor:1,pattern:0,patternColor:0}),'plucked');}
 assert.equal(isStaticFlowerCreationIcon(0),false);
});
test('generic candle original sprite and all creation routes remain definition-based',()=>{
 const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
 const ids=new Set(rows.map(r=>r[0]));
 assert.deepEqual(rows.find(r=>r[0]===1556387960),[1556387960,'-7615028577972391204']);
 const atlas=read('public/inventory-art/index.json');
 assert.deepEqual(atlas.records.filter(r=>ids.has(r[0])),[[1474758012,2,122,'7865155622530449067'],[1556387960,7,47,'-7615028577972391204']]);
 assert.equal(atlas.withheld.filter(r=>ids.has(r[0])).length,0);
 assert.equal(read('data/native-icon-override-source-v3.0.1.json').rows.filter(r=>ids.has(r[0])).length,0);
 assert.equal(read('data/native-result-icon-routes-v3.0.1.json').rows.filter(r=>ids.has(r[0])).length,0);
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

test('all native flower species retain identical artwork for equivalent tint and state inputs',()=>{
 const defs=JSON.parse(readFileSync(new URL('../public/inventory-ui/flowers.json',import.meta.url)));
 const masks=JSON.parse(readFileSync(new URL('../public/inventory-flower-art/index.json',import.meta.url)));
 for(const {itemId} of masks.items){
  const fields={growState:6,baseColor:1,pattern:0,patternColor:0};
  const key=flowerArtKey(itemId,fields,defs);
  const known={...fields,patternColor:9},unknown={...fields,patternColor:9999};
  assert.equal(flowerArtKey(itemId,known,defs),key);
  assert.equal(resolveFlowerAppearance(itemId,known,defs,masks).cacheKey,resolveFlowerAppearance(itemId,fields,defs,masks).cacheKey);
  assert.equal(resolveFlowerAppearance(itemId,unknown,defs,masks),null);
  assert.notEqual(flowerArtKey(itemId,unknown,defs),key);
  assert.notEqual(flowerArtKey(itemId,fields,null),key);
  assert.notEqual(flowerArtKey(itemId,{...fields,baseColor:2},defs),key);
  assert.notEqual(flowerArtKey(itemId,{...fields,pattern:1,patternColor:9},defs),key);
  const base=flowerArtKey(itemId,{...fields,growState:1},null);
  for(const state of [1,2,4,5])assert.equal(flowerArtKey(itemId,{...unknown,growState:state,baseColor:2,pattern:1},defs),base);
  assert.notEqual(base,key);
 }
});

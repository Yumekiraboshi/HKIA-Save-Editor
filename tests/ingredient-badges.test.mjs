import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/ingredient-badges.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {cafeIngredientBadges,bobaIngredientBadges}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
test('ordered cafe slots never collapse repeated ingredients or hide their order',()=>{
 const w=[[10,44,6],[20,55,9]];
 const a=cafeIngredientBadges([44,55,44,6,9,6],w);
 const b=cafeIngredientBadges([44,44,55,6,6,9],w);
 assert.deepEqual(a.map(x=>x.itemIds),[[10],[20],[10]]);
 assert.deepEqual(b.map(x=>x.itemIds),[[10],[10],[20]]);
 for(const rows of [a,b,cafeIngredientBadges([44,44,44,6,6,6],w)]){
  assert.deepEqual(rows.map(x=>x.slots),[[1],[2],[3]]);
  assert.ok(rows.every(x=>x.count===1));
  assert.equal(new Set(rows.map(x=>x.key)).size,3);
 }
});
test('unresolved and ambiguous slots do not choose a fabricated material',()=>{
 assert.deepEqual(cafeIngredientBadges([65,99,0,25,8,0],[[1,65,25],[2,65,25],[2,65,25]]),[
  {key:'1:65:25',itemIds:[1,2],slots:[1],count:1},{key:'2:99:8',itemIds:[],slots:[2],count:1}
 ]);
 assert.deepEqual(cafeIngredientBadges(undefined,[]),[]);
});
test('Boba flavor display never interprets unverified sweetness as an ingredient quantity',()=>{
 assert.deepEqual(bobaIngredientBadges([6,44,76,75,74],[[10,44,6]]),[{key:'1:44:6',itemIds:[10],slots:[1],count:1}]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/ingredient-badges.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {cafeIngredientBadges,bobaIngredientBadges}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
test('repeat flavor/color pairs collapse but retain the native slot positions',()=>{
 const w=[[10,44,6],[20,55,9]];
 assert.deepEqual(cafeIngredientBadges([44,55,44,6,9,6],w),[
  {key:'44:6',itemIds:[10],slots:[1,3],count:2},{key:'55:9',itemIds:[20],slots:[2],count:1}
 ]);
});
test('unresolved and ambiguous slots do not choose a fabricated material',()=>{
 assert.deepEqual(cafeIngredientBadges([65,99,0,25,8,0],[[1,65,25],[2,65,25],[2,65,25]]),[
  {key:'65:25',itemIds:[1,2],slots:[1],count:1},{key:'99:8',itemIds:[],slots:[2],count:1}
 ]);
 assert.deepEqual(cafeIngredientBadges(undefined,[]),[]);
});
test('Boba flavor display never interprets unverified sweetness as an ingredient quantity',()=>{
 assert.deepEqual(bobaIngredientBadges([6,44,76,75,74],[[10,44,6]]),[{key:'44:6',itemIds:[10],slots:[1],count:1}]);
});

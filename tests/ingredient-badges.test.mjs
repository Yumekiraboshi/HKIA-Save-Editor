import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
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
test('Boba modifiers use the source processor characteristics and keep milk ambiguous',()=>{
 const w=[[10,44,6]];
 const base={key:'1:44:6',itemIds:[10],slots:[1],count:1};
 const milk={key:'milk',itemIds:[1743974962,619719355],slots:[],count:1};
 const pearl={key:'tapioca',itemIds:[1962729997],slots:[],count:1};
 for(let n=0;n<=3;n++){
  assert.deepEqual(bobaIngredientBadges([6,44,76,75,71+n],w),[base,milk,pearl,...(n?[{key:'honeycomb',itemIds:[1456512081],slots:[],count:n}]:[])]);
 }
 assert.deepEqual(bobaIngredientBadges([6,44,79,78,71],w),[base]);
 assert.deepEqual(bobaIngredientBadges([6,44,0,0,999],w),[base]);
});

test('all original flavor materials, exact pairs and every source flavor-only mismatch resolve without invented IDs',()=>{
 const native=readFileSync(new URL('../core/src/inventory_source.rs',import.meta.url),'utf8');
 const table=native.match(/const CAFE_INGREDIENT_WITNESSES:[\s\S]*?=\s*&\[([\s\S]*?)\];/)[1];
 const rows=[...table.matchAll(/\((\d+),(\d+),(\d+)\)/g)].map(m=>m.slice(1).map(Number));
 assert.equal(rows.length,48);
 assert.equal(createHash('sha256').update(JSON.stringify(rows)+'\n').digest('hex'),'584604fa1159b9aa7f76178c4a4f83352316856d273e27550fb86ef1aab0ddb1');
 const flavors=[...new Set(rows.map(r=>r[1]))],colors=[...new Set(rows.map(r=>r[2]))];
 assert.equal(flavors.length,32);
 assert.equal(new Set(rows.map(r=>r.slice(1).join(':'))).size,47);
 for(const f of flavors)for(const c of [...colors,0,9999]){
  const exact=rows.filter(r=>r[1]===f&&r[2]===c).map(r=>r[0]),same=rows.filter(r=>r[1]===f).map(r=>r[0]);
  const cafe=cafeIngredientBadges([f,0,0,c,0,0],rows)[0];
  const boba=bobaIngredientBadges([c,f,79,78,71],rows)[0];
  for(const badge of [cafe,boba]){
   assert.deepEqual(badge.itemIds,exact.length?exact:same);
   assert.equal(badge.flavorOnly,exact.length?undefined:true);
  }
 }
 // Two original authored CafeCreationUniqueData definitions use 54/9,
 // while the sole original cheesy ingredient has 54/25.
 assert.deepEqual(cafeIngredientBadges([54,0,0,9,0,0],rows)[0],
  {key:'1:54:9',itemIds:[1002666914],flavorOnly:true,slots:[1],count:1});
 assert.deepEqual(cafeIngredientBadges([9999,0,0,9,0,0],rows)[0].itemIds,[]);
});

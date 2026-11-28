import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/ordinary-recipe-badges.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {recipeAlternativeBadges,ordinaryRecipeBadges}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const source=JSON.parse(readFileSync(new URL('../data/native-cooking-recipes-v3.0.1.json',import.meta.url),'utf8'));
test('all authored recipes preserve complete additional ingredient combinations',()=>{
 const groups=new Map();
 for(const row of source.rows){const list=groups.get(row[1])??[];list.push(row.slice(2));groups.set(row[1],list);}
 assert.equal(groups.size,232);
 for(const [id,recipes] of groups){
  const badges=ordinaryRecipeBadges(id,'3.0.1');
  assert.equal(badges.length,recipes[0].length-1);
  const actual=badges.reduce((all,b)=>all.flatMap(r=>b.itemIds.map(i=>[...r,i])),[[]]);
  assert.deepEqual(new Set(actual.map(r=>JSON.stringify(r))),new Set(recipes.map(r=>JSON.stringify(r.slice(1)))));
  assert.ok(badges.every(b=>b.count===1));
  assert.deepEqual(ordinaryRecipeBadges(id,'unknown'),[]);
 }
});
test('correlated slots or differing bases are not flattened into false alternatives',()=>{
 assert.deepEqual(recipeAlternativeBadges([[1,2,3],[1,4,5]]),[]);
 assert.deepEqual(recipeAlternativeBadges([[1,2],[3,2]]),[]);
 assert.deepEqual(recipeAlternativeBadges([[1,2],[1,2,3]]),[]);
 assert.deepEqual(recipeAlternativeBadges([[1,2,3],[1,2,4]]).map(b=>b.itemIds),[[2],[3,4]]);
});

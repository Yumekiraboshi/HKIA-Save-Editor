import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {buildInventoryThumbnailIndex,selectCollectionRoute} from '../scripts/inventory-thumbnail-index.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/inventory-collection-routes.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {decodeInventoryCollectionRoutes,inventoryCollectionRoute}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
test('native source pack route resolution preserves preferred and rejects ambiguous alternatives',()=>{
 assert.equal(selectCollectionRoute('a',['a','b']),'a');
 assert.equal(selectCollectionRoute('a',['b']),'b');
 assert.equal(selectCollectionRoute('a',['b','c']),null);
 assert.equal(selectCollectionRoute('a',[]),null);
});
test('all 12,163 definitions have a classified image route and generated routes match actual archives',()=>{
 const {rows,routes,report}=buildInventoryThumbnailIndex(root,{write:false});
 assert.equal(rows.length,12163);
 assert.equal(new Set(rows.map(r=>r.id)).size,12163);
 assert.equal(Object.values(report.counts).reduce((a,b)=>a+b,0),12163);
 assert.equal(report.counts['original-colorway'],5383);
 assert.equal(report.counts['native-inventory'],1747);
 const generated=JSON.parse(readFileSync(new URL('../public/inventory-art/collection-routes.json',import.meta.url),'utf8'));
 assert.deepEqual(generated.routes,routes);
 const decoded=decodeInventoryCollectionRoutes(generated);
 for(const row of rows){
  assert.equal(inventoryCollectionRoute(row.id,row.preferred??undefined,decoded),routes[row.id]??row.preferred??undefined);
  if(Object.hasOwn(routes,row.id)){
   assert.deepEqual(row.groups,[routes[row.id]]);
   assert.notEqual(row.preferred,routes[row.id]);
  }
 }
 assert.throws(()=>decodeInventoryCollectionRoutes({...generated,routes:{1:'../evil'}}),/INVALID/);
 assert.throws(()=>decodeInventoryCollectionRoutes({...generated,routes:{0:'collections_group_food'}}),/INVALID/);
});

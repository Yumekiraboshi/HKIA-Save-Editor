import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {buildInventoryThumbnailIndex,selectCollectionRoute} from '../scripts/inventory-thumbnail-index.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
test('native archive audit distinguishes preferred, sole alternative and ambiguous sources',()=>{
 assert.equal(selectCollectionRoute('a',['a','b']),'a');
 assert.equal(selectCollectionRoute('a',['b']),'b');
 assert.equal(selectCollectionRoute('a',['b','c']),null);
 assert.equal(selectCollectionRoute('a',[]),null);
});
test('all 12,163 definitions have a classified source route',()=>{
 const {rows,routes,report}=buildInventoryThumbnailIndex(root);
 assert.equal(rows.length,12163);
 assert.equal(new Set(rows.map(r=>r.id)).size,12163);
 assert.deepEqual(report.counts,{'collection-pack':4878,'original-colorway':5383,'original-named-item':1,'native-inventory':1747,'source-placeholder':152,'dynamic-color':2});
 assert.equal(report.alternateRoutes,0);
 assert.deepEqual(routes,{});
 assert.equal(report.otherUnique.length,93);
 console.log('HKIA_INVENTORY_THUMBNAIL_CENSUS '+JSON.stringify(report));
});

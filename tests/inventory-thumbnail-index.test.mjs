import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
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

test('all ordinary and result inventory routes resolve existing source assets; no native-sheet row needs an individual dynamic renderer',()=>{
 const {rows}=buildInventoryThumbnailIndex(root),byId=new Map(rows.map(r=>[r.id,r]));
 const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
 const results=read('data/native-result-icon-routes-v3.0.1.json').rows;
 const source=read('data/unityfs-audit/dynamic-uiicons.v3.0.1.json').rows;
 const dynamics=new Set(source.filter(r=>!r.key.startsWith('item_instruction_')).map(r=>r.itemId));
 assert.equal(dynamics.size,45);
 for(const row of rows){
  assert.ok(!['missing-pack','ambiguous-pack'].includes(row.source));
  if(row.source==='dynamic-color')assert.ok(dynamics.has(row.id));
  if(row.source==='native-inventory')assert.ok(!dynamics.has(row.id));
 }
 assert.equal(results.filter(([,target])=>byId.get(target)?.source==='native-inventory').length,161);
 for(const [id,target] of results){
  assert.ok(byId.has(id)&&byId.has(target));
  assert.ok(!dynamics.has(id)&&!dynamics.has(target));
  assert.ok(!['missing-pack','ambiguous-pack','dynamic-color'].includes(byId.get(target).source));
 }
});

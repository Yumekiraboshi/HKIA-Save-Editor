import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {furniturePackDiagnosticCases,furniturePackDiagnosticWindow} from '../scripts/furniture-pack-diagnostic-cases.mjs';
const c=JSON.parse(readFileSync(new URL('../public/inventory-ui/furniture-customization-v3.0.1.json',import.meta.url)));
test('source catalog: all 649 defaults and independent choices are enumerated without Cartesian explosion',()=>{
 const rows=furniturePackDiagnosticCases(c,c.items.map(i=>i[0]));
 assert.equal(rows.length,25834);
 assert.equal(rows.filter(r=>r.indices.every(v=>v===0)).length,649);
 assert.ok(rows.every(r=>r.indices.filter(v=>v!==0).length<=1));
 assert.equal(new Set(rows.map(r=>r.itemId+':'+r.indices.join(','))).size,rows.length);
 const items=new Map(c.items.map(i=>[i[0],i])),sets=new Map(c.sets.map(s=>[s[0],s[2]]));
 for(const row of rows){
  const slots=items.get(row.itemId)[4];
  for(let i=0;i<3;i++){
   const v=row.indices[i];if(!v)continue;
   const slot=slots.find(s=>s[0]===i);
   assert.ok(slot&&v!==slot[2]&&slot[3].some(k=>sets.get(k).includes(v)));
  }
 }
});
test('sample source coverage and exact native side table choices, stable pagination',()=>{
 const sample=furniturePackDiagnosticCases(c,[90163601,61381969,34770598,32709745]);
 assert.equal(sample.length,108);
 const table=furniturePackDiagnosticCases(c,[302413286,32709745],302413286);
 assert.equal(table.length,11);
 assert.deepEqual(table.map(r=>r.indices),[[0,0,0],...Array.from({length:10},(_,i)=>[377+i,0,0])]);
 const page=furniturePackDiagnosticWindow(table,0,4);
 assert.equal(page.nextOffset,4);assert.equal(page.total,11);assert.deepEqual(page.cases,table.slice(0,4));
 assert.deepEqual(furniturePackDiagnosticWindow(table,4,256),{total:11,offset:4,cases:table.slice(4),nextOffset:null});
 assert.throws(()=>furniturePackDiagnosticWindow(table,11,4),/WINDOW/);
 assert.throws(()=>furniturePackDiagnosticWindow(table,0,257),/WINDOW/);
 assert.throws(()=>furniturePackDiagnosticCases(c,[302413286,302413286]),/DUPLICATE/);
 assert.throws(()=>furniturePackDiagnosticCases(c,[302413286],32709745),/ITEM/);
 assert.throws(()=>furniturePackDiagnosticCases(c,[302413286,9999999999]),/COVERAGE/);
});

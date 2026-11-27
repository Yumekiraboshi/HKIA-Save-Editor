import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
test('native IconOverride GUID to actual source sprite and texture across eleven bundles',()=>{
 const source=read('data/native-icon-override-source-v3.0.1.json');
 const index=read('data/dynamic-colorway-packs/index.json');
 const original=read('public/source-colorways/index.json');
 const named=read('data/named-original-item-sprites-v3.0.1.json');
 const native=read('public/native-dye-palettes.json');
 const all=new Map(source.rows.map(row=>[String(row[0]),row]));
 assert.equal(source.switchDefinitionsSha256,'660aba36ab6da5964180fe0d474696fc22dd806b2f5b19ce601222cb5a631afa');
 assert.equal(source.switchDefinitionsCab,'CAB-191652df9468c684714b3b89a22974ec');
 assert.equal(source.steamCatalogSha256,'555a82bf7e8a6f0b6c9fee7d179988f54015e7b354902f13937198115e9ff52a');
 assert.deepEqual(source.sourceBundles,index.sourceBundles);
 assert.equal(all.size,5384);
 assert.equal(new Set(source.rows.map(r=>r[1])).size,5384);
 assert.ok(source.rows.every(r=>/^[a-f0-9]{32}$/.test(r[1])));
 assert.deepEqual([...all.keys()].filter(id=>id!=='1393962785').sort(),Object.keys(native.records).sort());
 const direct=source.rows.filter(r=>r[2]===0),dynamic=source.rows.filter(r=>r[2]!==0);
 assert.equal(direct.length,39);assert.equal(dynamic.length,5345);
 for(const [id,,n,sprite,texture] of direct){assert.equal(n,0);const r=original.records[id];assert.equal(r.sourceKind,'direct');assert.equal(r.sourceSpritePathId,sprite);assert.equal(r.texturePathId,texture);}
 let mapped=0,overlap=0;
 for(const [i,b] of index.sourceBundles.entries()){
  const records=read('data/dynamic-colorway-packs/index-'+String(i+1).padStart(2,'0')+'.json');
  const rows=dynamic.filter(r=>r[2]===i+1);assert.equal(rows.length,b.count);
  for(const [id,,n,sprite,texture] of rows){
   const r=records[id]??named.records[id];
   if(r){assert.equal(r.sourceSpritePathId,sprite);assert.equal(r.texturePathId,texture);assert.equal(r.sourceSpriteBundle,b.name);mapped++;}
   else{assert.ok(original.records[id]);overlap++;}
  }
 }
 assert.equal(mapped,5022);assert.equal(overlap,323);
});
test('all 152 placeholders are exact original Switch definitions, not assumed missing alternate art',()=>{
 const source=read('data/native-icon-override-source-v3.0.1.json');
 const extra=read('public/inventory-art/index.json');
 assert.deepEqual(source.placeholderRows.map(r=>r[0]),extra.withheld.filter(r=>r[2]==='source-placeholder').map(r=>r[0]).sort((a,b)=>a-b));
 assert.ok(source.placeholderRows.every(r=>r[3]==='-6646601456236922891'&&r[4]===false&&r[5]===null&&r[11]===null));
 assert.equal(source.placeholderRows.filter(r=>r[10]==='OutfitItemDetails').length,19);
 assert.deepEqual(source.dynamicExcludedRows.map(r=>r[0]),[1061947263,1835273963]);
 assert.ok(source.dynamicExcludedRows.every(r=>r[4]===true&&/^[a-f0-9]{32}$/.test(r[5])));
});

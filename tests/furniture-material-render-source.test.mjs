import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL('../'+p,import.meta.url));
test('all native furniture material render values map to the existing material IDs and original texture locations',()=>{
 const raw=read('data/furniture-material-render-source-v3.0.1.json'),d=JSON.parse(raw);
 assert.equal(createHash('sha256').update(raw).digest('hex'),'6745eaa77b9ef86ba1a2d3bbc56a9f3841d9e5ce8edf6437a01b4780e868f4f3');
 const c=JSON.parse(read('public/inventory-ui/furniture-customization-v3.0.1.json'));
 assert.equal(d.version,c.gameVersion);assert.equal(d.rows.length,877);
 assert.deepEqual(d.rows.map(r=>[...r.slice(0,3),r[16]]),c.materials.map(r=>r.slice(0,4)));
 assert.equal(d.rows.filter(r=>r[4]).length,274);assert.equal(d.rows.filter(r=>r[15]).length,2);
 assert.equal(d.rows.filter(r=>r[5]!==null).length,864);
 assert.notDeepEqual(d.rows[0][3],c.materials[0][5]);
 for(const r of d.rows){
  assert.equal(r.length,18);assert.equal(typeof r[4],'boolean');assert.equal(typeof r[15],'boolean');
  for(const [i,n] of [[3,4],[6,2],[7,2],[8,4],[10,4]]){assert.equal(r[i].length,n);assert.ok(r[i].every(Number.isFinite));}
  for(const i of [9,11,12,13,14])assert.ok(Number.isFinite(r[i]));
  assert.match(r[17],/^[a-f0-9]{64}$/);
 }
 assert.equal(d.patterns.length,278);assert.equal(d.bundleNames.length,193);
 assert.equal(new Set(d.bundleNames).size,193);
 assert.deepEqual(new Set(d.patterns.map(r=>r[0])),new Set(d.rows.map(r=>r[5]).filter(Boolean)));
 for(const [guid,offset,type,deps] of d.patterns){assert.match(guid,/^[a-f0-9]{32}$/);assert.ok(offset>0);assert.equal(type,0x40a9dd);assert.ok(deps.length);assert.equal(new Set(deps).size,deps.length);assert.ok(deps.every(i=>Number.isInteger(i)&&i>=0&&i<d.bundleNames.length));}
});

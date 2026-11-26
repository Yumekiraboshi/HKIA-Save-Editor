import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url)));
test('crown source index covers all original flower species with exact geometry layout',()=>{
 const d=read('data/flower-crown-source-index-v3.0.1.json'),f=read('core/data/inventory-flower-definitions-v3.0.1.json');
 assert.equal(d.definitionsSha256,f.sha256);
 assert.equal(d.rows.length,25);
 assert.deepEqual(new Set(d.rows.map(r=>r[1])),new Set(f.flowers.map(r=>r.itemId)));
 assert.equal(new Set(d.rows.map(r=>r[0])).size,25);
 assert.equal(new Set(d.rows.map(r=>r[2])).size,25);
 assert.equal(new Set(d.rows.map(r=>r[8])).size,25);
 for(const [id,flower,guid,model,material,vertices,stride,indices,digest] of d.rows){
  assert.ok(Number.isInteger(id)&&id>0&&Number.isInteger(flower)&&flower>0);
  assert.match(guid,/^[a-f0-9]{32}$/);
  assert.match(model,/^[a-z]+$/);assert.match(material,/^[a-z]+$/);
  assert.ok(vertices>0&&vertices<=65535&&Number.isInteger(vertices));
  assert.ok(stride===40||stride===44);
  assert.ok(indices>0&&indices%3===0&&Number.isInteger(indices));
  assert.match(digest,/^[a-f0-9]{64}$/);
 }
 assert.equal(d.rows.filter(r=>r[6]===44).length,8);
 assert.equal(d.rows.reduce((n,r)=>n+r[5]*r[6]+2*r[7],0),d.geometryBytes);
 assert.equal(d.localTextureCount,75);
 assert.equal(d.unresolvedTextureRefs.length,6);
});

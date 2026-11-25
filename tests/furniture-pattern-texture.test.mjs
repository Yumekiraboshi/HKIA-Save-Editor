import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL('../'+p,import.meta.url));
test('all six rug patterns retain exact original texture GUID, BC1 mip chain and sampler metadata',()=>{
 const raw=read('data/furniture-pattern-texture-sample-v3.0.1.json'),d=JSON.parse(raw);
 assert.equal(createHash('sha256').update(raw).digest('hex'),'24c6110b33ea80e8990f6017e7010350e36c6b1638d24956908c9f34915a8d78');
 const source=JSON.parse(read('data/furniture-material-render-source-v3.0.1.json')),catalog=JSON.parse(read('public/inventory-ui/furniture-customization-v3.0.1.json'));
 assert.equal(d.version,source.version);assert.equal(d.itemId,32709745);
 const item=catalog.items.find(r=>r[0]===d.itemId),slot=item[4][0];
 const indices=new Set([slot[2],...slot[3].flatMap(p=>catalog.sets.find(s=>s[0]===p)[2])]);
 assert.deepEqual(new Set(d.rows.map(r=>r.materialIndex)),indices);
 assert.equal(d.rows.length,6);assert.equal(new Set(d.rows.map(r=>r.guid)).size,6);
 for(const t of d.rows){
  assert.equal(t.guid,source.rows.find(r=>r[0]===t.materialIndex)[5]);
  assert.ok(source.patterns.find(r=>r[0]===t.guid)[3].map(i=>source.bundleNames[i]).includes(t.bundle));
  assert.match(t.pathId,/^-?[0-9]+$/);assert.match(t.cab,/^CAB-[a-f0-9]{32}$/);
  assert.equal(t.format,10);assert.equal(t.colorSpace,1);assert.equal(t.width,512);assert.equal(t.height,512);
  assert.deepEqual(t.sampler,[1,2,0,0,0,0]);assert.equal(t.mips.length,10);
  let cursor=0;
  for(let i=0;i<t.mips.length;i++){const [w,h,off,len,sha]=t.mips[i];assert.equal(w,512>>i);assert.equal(h,w);assert.equal(off,cursor);assert.equal(len,Math.ceil(w/4)*Math.ceil(h/4)*8);assert.match(sha,/^[a-f0-9]{64}$/);cursor+=len;}
  assert.equal(cursor,t.bytes);assert.equal(t.bytes,174776);
  for(const hash of [t.bundleSha256,t.objectSha256,t.sha256])assert.match(hash,/^[a-f0-9]{64}$/);
 }
 assert.equal(d.rows.reduce((s,r)=>s+r.bytes,0),1048656);
});

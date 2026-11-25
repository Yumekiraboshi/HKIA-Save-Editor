import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL('../'+p,import.meta.url));
test('source-pinned static mesh samples resolve exact item GUIDs, renderer slots and geometry ranges',()=>{
 const raw=read('data/furniture-mesh-source-sample-v3.0.1.json');
 assert.equal(createHash('sha256').update(raw).digest('hex'),'161428cccd58c9737e133ac60a128744a94672b4606c84d8f2a0bd696a923f70');
 const d=JSON.parse(raw),v=JSON.parse(read('data/furniture-visual-source-v3.0.1.json')),a=JSON.parse(read('data/furniture-addressables-v3.0.1.json')),cat=JSON.parse(read('public/inventory-ui/furniture-customization-v3.0.1.json'));
 assert.equal(d.version,v.version);assert.deepEqual(d.rows.map(r=>r.itemId),[32709745,34770598,61381969,90163601]);
 let count=0,bytes=0;
 for(const m of d.rows){
  const row=v.rows.find(r=>r[0]===m.itemId);assert.equal(m.visualGuid,row[6]??row[4]);
  const loc=a.rows.find(r=>r[0]===m.visualGuid);assert.ok(loc[3].map(i=>a.bundleNames[i]).includes(m.bundle));
  assert.equal(m.renderFidelity,'unverified');assert.equal(m.nodes[0].gameObjectPathId,m.rootGameObjectPathId);
  const ids=new Set(m.nodes.map(n=>n.transformPathId));assert.equal(ids.size,m.nodes.length);
  assert.deepEqual(m.nodes.filter(n=>n.slot).map(n=>n.slot.slot).sort(),cat.items.find(r=>r[0]===m.itemId)[4].map(s=>s[0]).sort());
  for(const n of m.nodes){assert.ok(n.parentPathId===null||ids.has(n.parentPathId));if(n.rendererPathId){assert.ok(m.meshes[n.meshPathId]);assert.ok(m.materials[n.material]);}}
  const ranges=[];
  for(const mesh of Object.values(m.meshes)){count++;assert.equal(mesh.vertexBytes[1],mesh.vertexCount*mesh.stride);assert.equal(mesh.indexBytes[1],mesh.indexCount*2);assert.equal(mesh.indexCount%3,0);for(const [off,len,hash] of [mesh.vertexBytes,mesh.indexBytes]){assert.equal(off%4,0);assert.ok(len>0&&off+len<=m.geometryBytes);assert.match(hash,/^[a-f0-9]{64}$/);ranges.push([off,off+len]);}}
  ranges.sort((a,b)=>a[0]-b[0]);for(let i=1;i<ranges.length;i++)assert.ok(ranges[i-1][1]<=ranges[i][0]);bytes+=m.geometryBytes;
 }
 assert.equal(count,11);assert.equal(bytes,162644);
});

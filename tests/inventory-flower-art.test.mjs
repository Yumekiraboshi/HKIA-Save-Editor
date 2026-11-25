import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir=new URL('../public/inventory-flower-art/',import.meta.url);
const read=n=>readFileSync(new URL(n,dir));
const hash=b=>createHash('sha256').update(b).digest('hex');
test('exact original FlowerItemDetails mask GUIDs resolve to native Sprite atlas entries',()=>{
 const raw=read('index.json'),d=JSON.parse(raw);
 assert.equal(hash(raw),'dfc7abc0963e1e1ff7700b2b7806bc156614bba48c1f6ef4b69114e92cc54771');
 assert.equal(d.schema,'HKIA.FlowerNativeMaskIndex.1');
 assert.equal(d.version,'3.0.1');
 assert.equal(d.items.length,25);
 assert.equal(new Set(d.items.map(x=>x.itemId)).size,25);
 assert.equal(Object.keys(d.masks).length,161);
 assert.deepEqual(d.unresolved,[]);
 const seen=new Set();
 for(const item of d.items){
  assert.match(item.baseSpritePathId,/^-?\d+$/);
  const patterns=new Set();
  for(const row of item.patterns){
   assert.ok(!patterns.has(row.patternIndex));patterns.add(row.patternIndex);
   assert.match(row.maskGuid,/^[a-f0-9]{32}$/);seen.add(row.maskGuid);
   const mask=d.masks[row.maskGuid];assert.ok(mask);
   assert.match(mask.spritePathId,/^-?\d+$/);
   assert.equal(mask.downscaleMultiplier,1);
   const rect=mask.textureRect;
   assert.ok(rect.x>=-0.5&&rect.y>=-0.5&&rect.width>0&&rect.height>0);
   assert.ok(rect.x+rect.width<=2048.5&&rect.y+rect.height<=2048.5);
  }
 }
 assert.equal(seen.size,161);
 const pen=d.items.find(x=>x.itemId===1331175279);
 assert.equal(d.masks[pen.patterns.find(x=>x.patternIndex===10).maskGuid].name,'Daisy_Ombre');
 assert.equal(d.masks[pen.patterns.find(x=>x.patternIndex===14).maskGuid].name,'Daisy_Striped');
});
test('source mask texture retains native 2048x2048 lossless RGBA',()=>{
 const d=JSON.parse(read('index.json')),b=read(d.atlas.file);
 assert.equal(hash(b),d.atlas.sha256);
 assert.equal(b.toString('ascii',8,16),'WEBPVP8L');
 assert.equal(b[20],47);
 const bits=b.readUInt32LE(21);
 assert.equal((bits&16383)+1,2048);
 assert.equal(((bits>>>14)&16383)+1,2048);
});

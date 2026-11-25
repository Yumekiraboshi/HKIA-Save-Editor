import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const json=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const audit=json('../data/unityfs-audit/dynamic-uiicons.v3.0.1.json');
const flowers=json('../public/inventory-flower-art/index.json');
test('native dynamic flag audit covers the pinned 50 definitions',()=>{
 assert.equal(audit.scannedDefinitionCount,12163);
 assert.equal(audit.rows.length,50);
 assert.equal(new Set(audit.rows.map(r=>r.itemId)).size,50);
 assert.equal(new Set(audit.rows.map(r=>r.definitionPathId)).size,50);
 for(const row of audit.rows){
  assert.match(row.definitionPathId,/^-?\d+$/);
  assert.match(row.baseSpritePathId,/^-?\d+$/);
  if(row.maskGuid)assert.match(row.maskGuid,/^[a-f0-9]{32}$/);
 }
 for(const [prefix,count] of [['item_flower_',25],['item_chefcreation_',10],['item_instruction_chefcreation_',5],['item_wandcreation_',9],['item_avatarpalette_',1]]){
  assert.equal(audit.rows.filter(r=>r.key.startsWith(prefix)).length,count);
 }
 assert.equal(audit.rows.filter(r=>r.maskBundle==='atlas_iconcolormasks').length,15);
 assert.equal(new Set(audit.rows.filter(r=>r.maskBundle==='atlas_iconcolormasks').map(r=>r.maskGuid)).size,10);
 assert.equal(audit.rows.filter(r=>r.maskBundle==='atlas_global').length,1);
 assert.equal(audit.rows.filter(r=>r.maskGuid&&!r.maskSpritePathId).length,9);
});
test('flower audit matches original per-pattern mask index',()=>{
 const rows=audit.rows.filter(r=>r.key.startsWith('item_flower_'));
 assert.equal(flowers.items.length,rows.length);
 for(const r of rows){
  const f=flowers.items.find(x=>x.itemId===r.itemId);
  assert.ok(f);
  assert.equal(f.definitionPathId,r.definitionPathId);
  assert.equal(f.baseSpritePathId,r.baseSpritePathId);
  assert.equal(r.maskGuid,null);
 }
});

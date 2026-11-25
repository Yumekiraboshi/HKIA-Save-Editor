import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {generateFurnitureSource,sourcePath,rustPath} from '../scripts/generate-furniture-source.mjs';
const raw=readFileSync(sourcePath),d=JSON.parse(raw);
test('source furniture catalog has exact full material and slot joins',()=>{
 assert.equal(createHash('sha256').update(raw).digest('hex'),'3b7dafc47b8b59046030494297d59c3f41fb327b5f537db6bb9e2788f24c43bf');
 assert.equal(d.gameVersion,'3.0.1');assert.equal(d.materials.length,877);
 assert.equal(d.sets.length,141);assert.equal(d.items.length,649);
 assert.equal(d.items.filter(x=>x[3]===0).length,621);
 assert.equal(d.items.filter(x=>x[3]===1).length,28);
 const materials=new Map(d.materials.map(x=>[x[0],x]));
 assert.equal(materials.size,877);assert.equal(new Set(d.materials.map(x=>x[1])).size,877);
 const sets=new Map(d.sets.map(x=>[x[0],x[2]]));assert.equal(sets.size,141);
 for(const values of sets.values())for(const value of values)assert.ok(materials.has(value));
 let last=0;
 for(const [id,,,kind,slots] of d.items){
  assert.ok(id>last);last=id;assert.ok(kind===0||kind===1);
  assert.ok(slots.length>=1&&slots.length<=3);
  assert.equal(new Set(slots.map(s=>s[0])).size,slots.length);
  for(const [slot,,def,refs] of slots){
   assert.ok(slot>=0&&slot<=2);assert.ok(def===0||materials.has(def));
   for(const ref of refs)assert.ok(sets.has(ref));
  }
 }
 assert.deepEqual(d.materials.filter(m=>m[4]!==null).map(m=>[m[0],m[4]]),[[285,1071638037],[287,1557463363],[288,1760731481],[289,1817393655]]);
 assert.equal(new Set(d.materials.map(x=>x[3])).size,772);
 const lamp=d.items.find(x=>x[0]===61381969);
 assert.deepEqual(lamp[4].map(([slot,,def,refs])=>[slot,def,refs.flatMap(r=>sets.get(r))]),[[0,503,[13,502,503,505]],[1,1,[1,2,3,4]]]);
});
test('compiled Rust lookup is regenerated exactly from the pinned source data',()=>{
 assert.equal(readFileSync(rustPath,'utf8'),generateFurnitureSource(d));
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {auditNativeColorwayCollisions} from '../scripts/audit-native-colorway-collisions.mjs';

const base=(records)=>({schema:'HKIA.NativeColorwayIcons.1',version:'3.0.1',records});
const rec=(sha,cell=10)=>({group:'collections_group_events',sheet:2,cell,
 sha256:sha,file:'one.png',fidelity:'approximate'});
const native={
 1:{dye:1,colors:['#888888','#ff0000','#aaaaaa',null,null]},
 2:{dye:2,colors:['#888888','#0000ff','#aaaaaa',null,null]},
 3:{dye:3,colors:['#888888','#00ff00','#aaaaaa',null,null]},
 4:{dye:1,colors:['#888888','#ff0000','#aaaaaa',null,null]}
};
test('shared source icon with distinct full dye palettes but identical bitmaps is prioritized',()=>{
 const qa=auditNativeColorwayCollisions(base({
  1:rec('a'.repeat(64)),2:rec('a'.repeat(64)),3:rec('b'.repeat(64)),
  4:rec('c'.repeat(64),11)
 }),native);
 assert.deepEqual(qa.totals,{
  sourceUiIconFamilies:2,generatedColorways:4,
  indistinguishableItems:2,indistinguishableFamilies:1,
  visuallyDifferentiatedItems:2
 });
 assert.equal(qa.priorities.length,1);
 assert.equal(qa.priorities[0].key,'collections_group_events:2:10');
 assert.equal(qa.priorities[0].uniqueGamePalettes,3);
 assert.equal(qa.priorities[0].uniquePreviewImages,2);
 assert.deepEqual(qa.priorities[0].examples[0].map(x=>x.id),['1','2']);
});
test('duplicates of the SAME full palette are not falsely labeled as missing masks',()=>{
 const qa=auditNativeColorwayCollisions(base({
  1:rec('a'.repeat(64)),4:rec('a'.repeat(64))
 }),{...native,4:{...native[1]}});
 assert.equal(qa.totals.indistinguishableItems,0);
 assert.deepEqual(qa.priorities,[]);
});
test('different complete palette colors are detectable without guessing channel positions',()=>{
 const qa=auditNativeColorwayCollisions(base({
  1:rec('a'.repeat(64)),2:rec('b'.repeat(64))
 }),native);
 assert.equal(qa.totals.indistinguishableItems,0);
 assert.equal(qa.totals.sourceUiIconFamilies,1);
});
test('diagnostic rejects missing source palette rather than inventing a dye color',()=>{
 assert.throws(()=>auditNativeColorwayCollisions(base({1:rec('a')}),{}),
  /DYE_COLLISION_AUDIT_ITEM_INVALID/);
 assert.throws(()=>auditNativeColorwayCollisions({schema:'wrong',records:{}},native),
  /DYE_COLLISION_AUDIT_INPUT_INVALID/);
});

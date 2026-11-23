import assert from 'node:assert/strict';
import {test} from 'node:test';
import {auditNativeColorwayCollisions,assertFullNativeColorwayFidelityFloor} from '../scripts/audit-native-colorway-collisions.mjs';

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
  visuallyDifferentiatedItems:2,
  unresolvedByFirstDifferentChannel:{1:0,2:2,3:0,4:0,5:0},
  unverifiedHigherChannelItems:0
 });
 assert.equal(qa.priorities.length,1);
 assert.equal(qa.priorities[0].key,'collections_group_events:2:10');
 assert.equal(qa.priorities[0].uniqueGamePalettes,3);
 assert.equal(qa.priorities[0].uniquePreviewImages,2);
 assert.deepEqual(qa.priorities[0].examples[0].map(x=>x.id),['1','2']);
 assert.deepEqual(qa.priorities[0].unresolvedBitmapGroups,[{
  pngSha256:'a'.repeat(64),
  itemIds:['1','2'],
  firstDifferentChannel:2,
  differentNativeChannels:[2],
  maskStatus:'source-preview-channel-mask-incomplete'
 }]);
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

test('native first-different channel 3 remains material-mask blocked without fabricating 2D colors',()=>{
 const palette={
  11:{dye:300,colors:['#a79dda','#ffa1d8','#69636d','#6e64ab','#ffd6f2']},
  12:{dye:301,colors:['#a79dda','#ffa1d8','#ffd6f2','#6e64ab','#f4e8ef']}
 };
 const manifest=base({
  11:rec('f'.repeat(64),63),12:rec('f'.repeat(64),63)
 });
 const qa=auditNativeColorwayCollisions(manifest,palette);
 assert.equal(qa.totals.indistinguishableItems,2);
 assert.equal(qa.totals.unverifiedHigherChannelItems,2);
 assert.deepEqual(qa.totals.unresolvedByFirstDifferentChannel,
  {1:0,2:0,3:2,4:0,5:0});
 const group=qa.priorities[0].unresolvedBitmapGroups[0];
 assert.equal(group.firstDifferentChannel,3);
 assert.deepEqual(group.differentNativeChannels,[3,5]);
 assert.deepEqual(group.itemIds,['11','12']);
 assert.equal(group.maskStatus,'higher-channel-material-mask-unverified');
 // The category-name "High Tea" or similar is NOT a recovered shader mask.
 assert.equal(Object.hasOwn(group,'pixelRegion'),false);
});
test('first differing game dye channel 4 or 5 is distinguished from channel 3',()=>{
 const baseColors=['#444444','#ffffff','#222222','#aabbcc','#ddeeff'];
 const c4=[...baseColors];c4[3]='#bada55';
 const c5=[...baseColors];c5[4]='#123456';
 const qa=auditNativeColorwayCollisions(base({
  21:rec('a'.repeat(64),12),22:rec('a'.repeat(64),12),
  23:rec('b'.repeat(64),13),24:rec('b'.repeat(64),13)
 }),{
  21:{dye:21,colors:baseColors},22:{dye:22,colors:c4},
  23:{dye:23,colors:baseColors},24:{dye:24,colors:c5}
 });
 assert.deepEqual(qa.totals.unresolvedByFirstDifferentChannel,
  {1:0,2:0,3:0,4:2,5:2});
 assert.equal(qa.totals.unverifiedHigherChannelItems,4);
 assert.deepEqual(qa.priorities.map(x=>x.unresolvedBitmapGroups[0].firstDifferentChannel),[4,5]);
});
test('a visible source-palette channel 1 mismatch is not misattributed to channel 3',()=>{
 const qa=auditNativeColorwayCollisions(base({
  1:rec('a'.repeat(64)),2:rec('a'.repeat(64))
 }),{
  1:{dye:1,colors:['#000000',null,null,null,null]},
  2:{dye:2,colors:['#eeeeee',null,null,null,null]}
 });
 assert.equal(qa.totals.unresolvedByFirstDifferentChannel[1],2);
 assert.equal(qa.totals.unverifiedHigherChannelItems,0);
});

test('all 5,383 native 2D icons fail closed on any new SHA-256 collision in channels 1–5',()=>{
 const qa=auditNativeColorwayCollisions(base({
  1:rec('a'.repeat(64)),2:rec('b'.repeat(64))
 }),native);
 // Unit-test the production budget independently of the full PNG export.
 qa.totals.generatedColorways=5383;
 assert.equal(assertFullNativeColorwayFidelityFloor(qa),qa.totals);
 // A regression must fail even when the original renderer mask is unverified.
 // This tests PNG differentiation only, not native Unity shader fidelity.
 for(const channel of [1,2,3,4,5]){
  const regression=structuredClone(qa);
  regression.totals.indistinguishableItems=2;
  regression.totals.indistinguishableFamilies=1;
  regression.totals.unresolvedByFirstDifferentChannel[channel]=2;
  regression.totals.unverifiedHigherChannelItems=channel>=3?2:0;
  assert.throws(()=>assertFullNativeColorwayFidelityFloor(regression),
   /DYE_NATIVE_COLORWAY_REGRESSION/);
 }
 for(const mutation of [
  x=>x.indistinguishableItems=12,
  x=>x.indistinguishableFamilies=6,
  x=>x.unverifiedHigherChannelItems=2,
  x=>x.generatedColorways=5382
 ]){
  const regression=structuredClone(qa);
  mutation(regression.totals);
  assert.throws(()=>assertFullNativeColorwayFidelityFloor(regression),
   /DYE_NATIVE_COLORWAY_REGRESSION/);
 }
});

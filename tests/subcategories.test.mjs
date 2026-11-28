import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const catalog=JSON.parse(readFileSync(new URL('../public/catalog.json',import.meta.url),'utf8'));
const source=readFileSync(new URL('../src/subcategories.ts',import.meta.url),'utf8');
const component=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
}).outputText;
const taxonomy=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));

test('every source collection ID has a meaningful Japanese and English subcategory label',()=>{
 const ids=new Set(catalog.items.map(item=>item[2]));
 assert.equal(ids.size,181);
 for(const id of ids){
  assert.ok(taxonomy.isKnownSubcategory(id),id);
  for(const locale of ['ja','en']){
   const label=taxonomy.subcategoryLabel(id,locale);
   assert.ok(label&&label!=='Other'&&label!=='その他',id);
   assert.doesNotMatch(label,/collection_/);
  }
 }
});

test('weather subcollections match game parent-item totals, not variant counts',()=>{
 const items=catalog.items.filter(item=>item[3]==='collections_group_weather');
 assert.equal(items.length,174);
 const list=taxonomy.listSubcategories(catalog.items,'collections_group_weather',{},'en');
 assert.deepEqual(list.map(x=>[x.key,x.total]),[
  ['collection_aquafall_aquafallmachine',9],
  ['collection_celestree_celestree',9],
  ['collection_saunarator_saunarator',15],
  ['collection_weather_snow',16]
 ]);
 assert.equal(new Set(items.map(x=>x[7])).size,49);
});

test('every subcategory has a canonical parent row and belongs to exactly one top group',()=>{
 const groupBySub=new Map();
 const byId=new Map(catalog.items.map(item=>[item[0],item]));
 for(const item of catalog.items){
  assert.ok(byId.has(item[7]),'missing base item '+item[7]);
  const parent=byId.get(item[7]);
  assert.equal(parent[2],item[2]);
  assert.equal(parent[3],item[3]);
  if(groupBySub.has(item[2]))assert.equal(groupBySub.get(item[2]),item[3]);
  else groupBySub.set(item[2],item[3]);
 }
});

test('a recorded color variant contributes one parent completion without losing its edit ID',()=>{
 const variant=1392669,parent=1699275562;
 const saved={[variant]:638000000000000000n};
 const families=taxonomy.recordedFamilies(catalog.items,saved);
 assert.deepEqual(families[String(parent)],[variant]);
 const sauna=taxonomy.listSubcategories(catalog.items,'collections_group_weather',saved,'ja')
  .find(x=>x.key==='collection_saunarator_saunarator');
 assert.equal(sauna.count,1);
 assert.equal(sauna.total,15);
});

test('UI implements subgroup navigation and does not hide individual variation controls permanently',()=>{
 for(const token of ['selectedSubgroup','selectSubcategory(','goSubcategories(','activeSubgroup','subcategory-grid',
  'subcategoryLabel(activeSubgroup,locale)','showVariants','families[String(item[7]||item[0])]','item[0]!==item[7]']){
  assert.ok(component.includes(token),token);
 }
 assert.match(component,/selectedSubgroup=draft\.ui\.subgroup/);
 const store=readFileSync(new URL('../src/draft-store.ts',import.meta.url),'utf8');
 assert.match(store,/const subgroup=typeof state\?\.ui\?\.subgroup/);
 assert.match(store,/return \{file:actualFile,patches,achievementPatches:achievementPatches as StoredPatch\[\],inventoryPatches:safeInventoryPatches\(state\?\.inventoryPatches\?\?\[\]\),ui:\{group,subgroup,\.\.\.\(state\?\.ui\?\.inventoryLocks!==undefined\?\{inventoryLocks:safeInventoryLocks\(state\.ui\.inventoryLocks\)\}:\{\}\)\},historyCheckpoint:safeHistoryCheckpoint\(state\?\.historyCheckpoint\)\}/);
});

test('each subcategory has an actual representative parent image in its group',()=>{
 const byId=new Map(catalog.items.map(item=>[item[0],item]));
 for(const group of catalog.groups){
  for(const sub of taxonomy.listSubcategories(catalog.items,group[0],{},'en')){
   assert.ok(Number.isInteger(sub.previewId),sub.key);
   const item=byId.get(sub.previewId);
   assert.ok(item,sub.key);
   assert.equal(item[2],sub.key);
   assert.equal(item[3],group[0]);
   assert.equal(item[0],item[7]);
  }
 }
 const weather=taxonomy.listSubcategories(catalog.items,'collections_group_weather',{},'en');
 assert.deepEqual(weather.map(x=>x.previewId),[1611616925,463096384,254880643,815186408]);
});

test('category previews reuse shipped sprites, dates use a native modal instead of clipped cards',()=>{
 assert.match(component,/class="subcategory-art"/);
 assert.match(component,/iconPack\.entries\[String\(sub\.previewId\)\]/);
 assert.match(component,/void fetchImages\(key\)/);
 assert.match(component,/<dialog class="date-dialog"/);
 assert.match(component,/dateDialogEl\.showModal\(\)/);
 assert.match(component,/onclose=\{onDateDialogClosed\}/);
 assert.match(component,/type="datetime-local" step="1"/);
 assert.match(component,/fromDateTimeValue\(dateValue,dateDialogTick\)/);
 assert.doesNotMatch(component,/<div class="date-panel"/);
});

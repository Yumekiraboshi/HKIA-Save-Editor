import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
async function compiled(path){
 const b=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
}
const {FLOORPLAN_ITEM_IDS,isVerifiedFloorplanItemId}=await compiled('../src/floorplan-names.ts');
const {mayCreateCollectionHistory}=await compiled('../src/collection-eligibility.ts');
const {filterCollectionItems}=await compiled('../src/collection-search.ts');
const src=read('../core/src/catalog.rs');
const app=read('../src/App.svelte');
const ids=src.match(/const VERIFIED_FLOORPLAN_HISTORY_IDS:\[i32;18\]=\[([\s\S]*?)\];/)?.[1]?.match(/\d+/g).map(Number);
const template=(id,flags=1,group='collection_group_floorplans')=>
 [id,'item_floorplan','collection_furniture_floorplans',group,flags,null,null,id];

test('all 18 precisely verified original Floorplan IDs are authorized in both native Rust writer and UI',()=>{
 assert.equal(FLOORPLAN_ITEM_IDS.length,18);
 assert.deepEqual([...ids], [...FLOORPLAN_ITEM_IDS]);
 for(const id of FLOORPLAN_ITEM_IDS){
  assert.ok(isVerifiedFloorplanItemId(id));
  assert.ok(mayCreateCollectionHistory(template(id),true,'3.0.1','3.0.1'),
   'hidden/DLC floorplan must be editable by explicit user action: '+id);
  assert.ok(mayCreateCollectionHistory(template(id,0),true,'3.0.1','3.0.1'));
 }
 assert.match(src,/VERIFIED_FLOORPLAN_HISTORY_IDS\.binary_search\(&id\)\.is_ok\(\)/);
 assert.match(read('../core/src/collection.rs'),/eligible_for_new_history\(id\)/);
});

test('missing-history Floorplans remain visible, editable and identifiable even with restrictive source flag',()=>{
 const items=FLOORPLAN_ITEM_IDS.map(id=>template(id,1));
 const filtered=filterCollectionItems(items,'collection_group_floorplans',
  'collection_furniture_floorplans',{}, {},false,'all','','ja',
  x=>'間取り '+x[0]);
 assert.equal(filtered.length,18);
 assert.ok(filtered.every(x=>mayCreateCollectionHistory(x,true,'3.0.1','3.0.1')));
 assert.equal(filterCollectionItems(items,'collection_group_floorplans',
  'collection_furniture_floorplans',{}, {},false,'recorded','','ja',x=>String(x[0])).length,0);
});

test('no blanket unlock of unrelated hidden/DLC items, unknown IDs, or old save versions',()=>{
 for(const id of FLOORPLAN_ITEM_IDS){
  assert.equal(mayCreateCollectionHistory(template(id),false,'3.0.1','3.0.1'),false);
  assert.equal(mayCreateCollectionHistory(template(id),true,'3.0.0','3.0.1'),false);
  assert.equal(mayCreateCollectionHistory(template(id),true,'3.0.1','3.0.0'),false);
  assert.equal(mayCreateCollectionHistory(template(id,1,'collections_group_events'),true,'3.0.1','3.0.1'),false);
 }
 for(const id of [0,-1,259795662,259795664,2147483647]){
  assert.equal(isVerifiedFloorplanItemId(id),false);
  assert.equal(mayCreateCollectionHistory(template(id),true,'3.0.1','3.0.1'),false);
 }
 assert.equal(mayCreateCollectionHistory(template(315822,0,'collections_group_food'),true,'3.0.1','3.0.1'),true,
  'existing unrestricted collection history remains editable');
});

test('the actual collection item toggle, not just its display, checks the new whitelist',()=>{
 assert.match(app,/mayCreateCollectionHistory\(item,snapshot\.membershipEdit,snapshot\.version,catalog\?\.version\)/);
 assert.match(app,/\{@const mayToggle=showVariants\?/);
 assert.match(app,/disabled=\{busy\|\|!mayToggle\}/);
 assert.ok(app.includes('onclick={e=>void toggleCollection(item[0],nameFor(item),e.currentTarget)}'));
 assert.ok(app.includes('if(!snapshot.membershipEdit)return;'));
 assert.match(read('../src/collection-eligibility.ts'),/collection_group_floorplans/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
async function compiled(path){
 const b=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
  bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
}
const {FLOORPLAN_ITEM_IDS,isVerifiedFloorplanItemId}=await compiled('../src/floorplan-names.ts');
const {filterCollectionItems}=await compiled('../src/collection-search.ts');
const src=read('../core/src/catalog.rs');
const core=read('../core/src/collection.rs');
const app=read('../src/App.svelte');
const wasm=read('../wasm/src/lib.rs');
const worker=read('../src/editor.worker.ts');
const client=read('../src/worker-client.ts');
const sourceIds=src.match(/const VERIFIED_HISTORY_IDS:&\[i32\]=&\[([\s\S]*?)\];/)?.[1]?.match(/\d+/g).map(Number);
const floorIds=src.match(/const VERIFIED_FLOORPLAN_HISTORY_IDS:\[i32;18\]=\[([\s\S]*?)\];/)?.[1]?.match(/\d+/g).map(Number);
const template=(id,flags=1,group='collection_group_floorplans')=>
 [id,'item_floorplan','collection_furniture_floorplans',group,flags,null,null,id];

test('all 18 verified floorplan IDs are included in the same source-authoritative Rust whitelist used by the writer',()=>{
 assert.equal(FLOORPLAN_ITEM_IDS.length,18);
 assert.deepEqual([...floorIds], [...FLOORPLAN_ITEM_IDS]);
 assert.ok(sourceIds.length>5000);
 assert.ok(sourceIds.every(id=>Number.isInteger(id)&&id>0));
 for(let i=1;i<sourceIds.length;i++)assert.ok(sourceIds[i]>sourceIds[i-1],'native allowlist must remain ordered');
 for(const id of FLOORPLAN_ITEM_IDS){
  assert.ok(isVerifiedFloorplanItemId(id));
  assert.ok(floorIds.includes(id));
 }
 assert.match(src,/VERIFIED_FLOORPLAN_HISTORY_IDS\.binary_search\(&id\)\.is_ok\(\)/);
 assert.match(src,/VERIFIED_HISTORY_IDS\.binary_search\(&id\)\.is_ok\(\)/);
 assert.match(core,/eligible_for_new_history\(id\)/);
});

test('unrecorded restrictive-source floorplans remain visible and can be offered by Rust, not by a TS flag or group rule',()=>{
 const items=FLOORPLAN_ITEM_IDS.map(id=>template(id,1));
 const filtered=filterCollectionItems(items,'collection_group_floorplans',
  'collection_furniture_floorplans',{}, {},false,'all','','ja',x=>'間取り '+x[0]);
 assert.equal(filtered.length,18);
 assert.ok(filtered.every(x=>floorIds.includes(x[0])));
 assert.equal(filterCollectionItems(items,'collection_group_floorplans',
  'collection_furniture_floorplans',{}, {},false,'recorded','','ja',x=>String(x[0])).length,0);
 assert.ok(!existsSync(new URL('../src/collection-eligibility.ts',import.meta.url)));
});

test('missing collection membership and game version checks now belong to Rust and cannot be guessed by catalog flags',()=>{
 assert.match(core,/self\.slot\.envelope\.version!=Version::V301\|\|!self\.can_change_membership\(\)/);
 assert.match(core,/self\.value\(id\)\.is_none\(\)/);
 assert.match(core,/id>0&&id!=i32::MAX/);
 assert.match(core,/ids\.sort_unstable\(\)/);
 assert.match(core,/ids\.dedup\(\)/);
 assert.match(core,/pub fn creatable_collection_history_ids\(/);
 assert.match(wasm,/pub extern "C" fn hkia_collection_creatable_snapshot\(/);
 assert.match(worker,/e\.hkia_collection_creatable_snapshot\(\)/);
 assert.match(worker,/COLLECTION_ELIGIBILITY_INVALID/);
 assert.match(client,/eligibleCollectionHistoryIds:number\[\]/);
 assert.match(app,/eligibleCollectionHistoryIds=\$derived\(new Set\(/);
 assert.match(app,/mayAdd=snapshot\.version===catalog\?\.version&&eligibleCollectionHistoryIds\.has\(item\[0\]\)/);
 assert.match(app,/\{@const mayToggle=showVariants\?/);
 assert.match(app,/disabled=\{busy\|\|!mayToggle\}/);
 assert.ok(app.includes('onclick={e=>void toggleCollection(item[0],nameFor(item),e.currentTarget)}'));
 assert.ok(app.includes('if(!snapshot.membershipEdit)return;'));
 assert.doesNotMatch(app,/mayCreateCollectionHistory/);
});

test('unknown and boundary IDs are not promoted into native membership allowlist',()=>{
 for(const id of [0,-1,259795662,259795664,2147483647]){
  assert.equal(isVerifiedFloorplanItemId(id),false);
 }
 assert.equal(sourceIds.includes(259795662),false);
 assert.equal(sourceIds.includes(259795664),false);
 assert.ok(sourceIds.includes(315822));
 assert.match(read('../core/tests/collection_roundtrip.rs'),/native_collection_creation_eligibility_gates_and_updates/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const groups=JSON.parse(read('../public/achievement-groups.json'));
const rust=read('../core/src/collection.rs');
const keys=read('../core/src/achievement_keys.rs');
const wasm=read('../wasm/src/lib.rs');
const client=read('../src/worker-client.ts');
const worker=read('../src/editor.worker.ts');
const ui=read('../src/App.svelte');
const nativeTests=read('../core/tests/collection_roundtrip.rs');
const words=g=>g.split(':').map(x=>parseInt(x,16));
const sources=[...keys.matchAll(/^ \(\[(\d+),(\d+),(\d+),(\d+)\],\[(\d+),(\d+),(\d+),(\d+)\]\),$/gm)]
 .map(x=>[x.slice(1,5).map(Number).join(':'),x.slice(5,9).map(Number).join(':')]);
const groupSizes=[...keys.matchAll(/^ \(\[(\d+),(\d+),(\d+),(\d+)\],(\d+)\),$/gm)]
 .map(x=>[x.slice(1,5).map(Number).join(':'),Number(x[5])]);

test('all 757 native source child-parent links and 63 category sizes agree with the verified v3.0.1 index',()=>{
 assert.equal(groups.groups.length,63);
 assert.equal(sources.length,757);
 assert.equal(groupSizes.length,63);
 const hierarchy=new Map(groups.groups.map(([parent,children])=>[words(parent).join(':'),children.map(g=>words(g).join(':'))]));
 const nativeLinks=new Map(sources);
 const nativeSizes=new Map(groupSizes);
 const seenChildren=new Set;
 for(const [parent,children] of hierarchy){
  assert.equal(nativeSizes.get(parent),children.length,parent);
  for(const child of children){
   assert.equal(nativeLinks.get(child),parent,child);
   assert.ok(!seenChildren.has(child),'no duplicate child');
   seenChildren.add(child);
  }
 }
 assert.equal(seenChildren.size,757);
});

test('all category edit decisions and the atomic CAS history are Rust-owned',()=>{
 assert.match(rust,/pub fn edit_achievement_auto\(/);
 assert.match(rust,/parent_of_v301\(guid\)/);
 assert.match(rust,/parent_size_v301\(parent_guid\)/);
 assert.match(rust,/self\.change_achievement_pair\(/);
 assert.match(rust,/self\.complete_child_and_create_parent\(/);
 assert.match(rust,/self\.create_achievement_with_parent\(/);
 assert.match(rust,/let remaining=saved\.iter\(\)/);
 assert.match(rust,/parent_before\.completed==old_latest/);
 assert.match(rust,/self\.achievement_value\(guid\)!=expected/);
 assert.match(wasm,/pub extern "C" fn hkia_achievement_edit_auto\(/);
 assert.match(worker,/case 'achievement-auto'/);
 assert.match(worker,/hkia_achievement_edit_auto\(/);
 assert.match(client,/rpc\('achievement-auto'/);
 assert.match(ui,/editAchievementAuto\(guid,live\?\.value\?\?null,next\)/);
 assert.match(ui,/editAchievementAuto\(selected\.guid,selected\.value,next\)/);
 assert.doesNotMatch(ui,/planCategoryParent|changeAchievementWithParent/);
 assert.equal(existsSync(new URL('../src/achievement-parent-auto.ts',import.meta.url)),false);
});

test('synthetic source category tests exercise completion, creation, revocation, date synchronization, immutable original and export',()=>{
 for(const name of [
  'rust_auto_category_last_child_completion_revoke_and_date_sync_one_undo',
  'rust_auto_category_missing_parent_and_child_create_atomically',
  'rust_auto_category_missing_siblings_and_unsupported_creation_fail_closed'
 ])assert.match(nativeTests,new RegExp('fn '+name+'\\('));
 assert.match(nativeTests,/let independently_dated=/);
 assert.match(nativeTests,/e\.edit_achievement_auto\(c2,Some\(second\),done\)/);
 assert.match(nativeTests,/assert!\(e\.undo\(\)\)/);
 assert.match(nativeTests,/let reopen=Editor::open\(exported\)\.unwrap\(\)/);
});

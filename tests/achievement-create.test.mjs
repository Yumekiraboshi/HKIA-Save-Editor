import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const app=read('../src/App.svelte');
const rust=read('../core/src/collection.rs');
const native=read('../core/src/native.rs');
const wasm=read('../wasm/src/lib.rs');
const worker=read('../src/editor.worker.ts');
const source=JSON.parse(read('../public/achievement-index.json'));
const groups=JSON.parse(read('../public/achievement-groups.json'));
const compiled=await build({entryPoints:[fileURLToPath(new URL('../src/achievement-draft.ts',import.meta.url))],
 bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const drafts=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const guid=source.records[0][0].split(':').map(x=>parseInt(x,16));
const created={guid,value:{complete:true,current:1,completed:[1780000000n,123456700]}};

test('all 820 source GUIDs are pinned in native source allowlist, including all 757 child-parent links',()=>{
 const keys=read('../core/src/achievement_keys.rs');
 const listed=[...keys.matchAll(/^ \[(\d+),(\d+),(\d+),(\d+)\],$/gm)];
 const parents=[...keys.matchAll(/^ \(\[(\d+),(\d+),(\d+),(\d+)\],\[(\d+),(\d+),(\d+),(\d+)\]\),$/gm)];
 assert.equal(listed.length,820);
 assert.equal(parents.length,757);
 assert.equal(source.records.length,820);
 assert.equal(groups.groups.length,63);
 assert.match(rust,/known_v301\(guid\)/);
 assert.match(rust,/parent_of_v301\(guid\)!=Some\(parent\)/);
 assert.match(rust,/version!=Version::V301/);
 assert.match(rust,/mp_array_header\(count\+added\.len\(\)/);
 assert.match(rust,/mp_u32\(id,&mut out\)/);
 assert.match(rust,/for word in guid\{mp_u32\(word,&mut out\);\}/);
 assert.match(rust,/let reread=read_slot\(&new_slot\)\?/);
});

test('missing achievement stays absent in baseline but is recoverable via draft create and editor Undo',()=>{
 const p=drafts.diffAchievements([], [created]);
 assert.equal(p.length,1);
 assert.equal(p[0].before,null);
 assert.equal(p[0].after.current,1);
 assert.deepEqual(drafts.decodeAchievementDraft(p,[]),[{guid,before:null,after:created.value}]);
 assert.deepEqual(drafts.cloneStoredAchievementPatches(p),p);
 assert.deepEqual(drafts.diffAchievements([],[]),[]);
 assert.throws(()=>drafts.decodeAchievementDraft(p,[created]),/DRAFT_CONFLICT/);
 assert.throws(()=>drafts.diffAchievements([created],[]),/DRAFT_INVALID/);
 const edited={...created,value:{complete:false,current:0,completed:null}};
 const later=drafts.diffAchievements([], [edited]);
 assert.equal(later[0].before,null);
 assert.equal(later[0].after.complete,false);
});

test('UI displays absent 0/goal and restricts creation to a verified source-defined v3.0.1 save',()=>{
 assert.match(app,/\(item\.row\?\.value\.current\?\?0\)\.toLocaleString\(locale\)/);
 assert.match(app,/editAchievementAuto\(guid,live\?\.value\?\?null,next\)/);
 assert.match(app,/editAchievementAuto\(selected\.guid,selected\.value,next\)/);
 assert.match(app,/snapshot\.version!=='3\.0\.1'\|\|!achievementIndex\.has\(item\.guid\)/);
 assert.match(app,/if\(item\.row\)void openAchievement/);
 assert.match(app,/locale==='ja'&&g\[0\]==='collection_group_citytown'\?'都市の町'/);
 assert.match(worker,/hkia_achievement_create\(\.\.\.args\)/);
 assert.match(worker,/hkia_achievement_edit_auto\(/);
 assert.match(wasm,/pub extern "C" fn hkia_achievement_edit_auto\(/);
 assert.match(native,/root_documents_span/);
 assert.match(rust,/pub fn create_achievement_with_parent\(/);
});

test('all original 25 collection categories remain accessible; already supported dictionary-member add is preserved',()=>{
 assert.match(rust,/eligible_for_new_history\(id\)/);
 assert.match(rust,/replace_map\(original_payload,map\.clone\(\),&self\.slot\.index\.collections,&self\.entries\(\)\)/);
 assert.match(app,/mayAdd=mayCreateCollectionHistory\(item,snapshot\.membershipEdit,snapshot\.version,catalog\?\.version\)/);
 assert.match(read('../src/collection-eligibility.ts'),/item\[4\]===0/);
 assert.match(app,/EPOCH\+BigInt\(Date\.now\(\)\)\*10000n/);
});

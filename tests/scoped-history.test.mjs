import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');

test('native/WASM history records preserve scopes and atomic pair identity',()=>{
 const core=read('../core/src/collection.rs');
 const wasm=read('../wasm/src/lib.rs');
 const client=read('../src/worker-client.ts');
 const worker=read('../src/editor.worker.ts');
 assert.match(core,/pub enum HistoryScope \{ Collections, Achievements, Inventory \}/);
 assert.match(core,/pub fn history\(&self\)->Vec<HistoryRecord>/);
 assert.match(core,/pub fn undo_scope\(&mut self,scope:HistoryScope\)/);
 assert.match(core,/pub fn redo_scope\(&mut self,scope:HistoryScope\)/);
 assert.match(core,/pub fn jump_history\(&mut self,scope:HistoryScope,target:usize\)/);
 assert.match(core,/HistoryRecord\{scope:self.scope\(\),applied,paired,item_id,guid\}/);
 assert.match(core,/self\.redo\.retain\(\|change\|change\.scope\(\)!=HistoryScope::Collections\)/);
 assert.match(core,/self\.redo\.retain\(\|change\|change\.scope\(\)!=HistoryScope::Achievements\)/);
 assert.match(core,/self\.undo\.clear\(\);self\.redo\.clear\(\)/);
 assert.match(wasm,/pub extern "C" fn hkia_history_snapshot\(\)/);
 assert.match(wasm,/pub extern "C" fn hkia_history_jump\(scope:u32,target:u32\)/);
 assert.match(worker,/hkia_history_snapshot\(\)/);
 assert.match(worker,/hkia_history_jump\(r\.scope==='collections'\?0:r\.scope==='achievements'\?1:2,r\.target\)/);
 assert.match(worker,/h\.length!==4\+historyCount\*23/);
 assert.match(worker,/history\.push\(/);
 assert.match(client,/export type HistoryScope='collections'\|'achievements'\|'inventory'/);
 assert.match(client,/export function jumpHistory\(scope:HistoryScope,target:number\)/);
});

test('active-tab timeline jumps keep other tabs unchanged and are accessible from SVG header',()=>{
 const app=read('../src/App.svelte');
 const translations=read('../src/history-copy.ts');
 assert.match(app,/const tabHistory=\$derived\(\(\(snapshot as SaveSnapshot\|null\)\?\.history\?\?\[\]\)\.filter\(\(entry:HistoryRecord\)=>entry\.scope===activeTool\)\)/);
 assert.match(app,/const tabHistoryCursor=\$derived\(tabHistory\.filter\(entry=>entry\.applied\)\.length\)/);
 assert.match(app,/update\(await jumpHistory\(scope,target\)\)/);
 assert.match(app,/return goToHistory\(tabHistoryCursor\+\(which==='undo'\?-1:1\)\)/);
 assert.match(app,/\{#each tabHistory as entry,i \(i\)\}/);
 assert.match(app,/\{historyEntryLabel\(entry,i\)\}/);
 assert.doesNotMatch(app,/\(which==='undo'\?undo\(\):redo\(\)\)/);
 assert.match(translations,/ja:\{title:'編集履歴'/);
 assert.match(translations,/export function historyCopy\(locale:Locale\)/);
 const rust=read('../core/tests/collection_roundtrip.rs');
 assert.match(rust,/fn tab_scoped_history_jumps_preserve_interleaved_edits_and_independent_redo_branches/);
 assert.match(rust,/fn native_pair_is_one_achievement_history_step_and_never_rewinds_collections/);
});

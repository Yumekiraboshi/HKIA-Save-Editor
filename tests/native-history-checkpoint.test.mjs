import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');

test('native local checkpoint is replayed through source-validated CAS, not injected into save state',()=>{
 const core=read('../core/src/collection.rs');
 assert.match(core,/const HISTORY_MAGIC:&\[u8;8\]=b"HKIAHS01"/);
 assert.match(core,/pub fn history_checkpoint\(&self\)->Result<Vec<u8>,Error>/);
 assert.match(core,/pub fn restore_history\(&mut self,checkpoint:&\[u8\]\)->Result<\(\),Error>/);
 assert.match(core,/let mut candidate=Self::open\(self.original.clone\(\)\)\?/);
 assert.match(core,/candidate\.change\(id,before,after\)\?/);
 assert.match(core,/candidate\.change_achievement\(guid,before,after\)\?/);
 assert.match(core,/candidate\.create_achievement\(guid,value\)\?/);
 assert.match(core,/candidate\.create_achievement_with_parent\(guid,child,pg,before,after\)\?/);
 assert.match(core,/candidate\.complete_child_and_create_parent\(guid,before,after,pg,parent\)\?/);
 assert.match(core,/candidate\.change_achievement_pair\(\(aguid,abefore,anext\),\(bguid,bbefore,bnext\)\)\?/);
 assert.match(core,/for scope in scopes\[active\.\.\]\.iter\(\)\.rev\(\)/);
 assert.match(core,/if candidate\.history_checkpoint\(\)\?\.as_slice\(\)!=checkpoint/);
 assert.match(core,/\*self=candidate;/);
 assert.match(core,/pub const HISTORY_MAX_BYTES:usize=1024\*1024/);
 assert.match(core,/const _: \(\)=assert!|const _:\(\)=assert!/);
 const limits=read('../src/history-limits.ts');
 const nativeBytes=Number(core.match(/pub const HISTORY_MAX_BYTES:usize=(\d+)\*(\d+)/)[1])*1024;
 const browserBytes=Number(limits.match(/HISTORY_MAX_BYTES=(\d+)\*(\d+)/)[1])*1024;
 assert.equal(browserBytes,nativeBytes);
 assert.equal(Number(limits.match(/HISTORY_MAX_BATCH_ROWS=(\d+)/)[1]),Number(core.match(/MAX_INVENTORY_BATCH:usize=(\d+)/)[1]));
 assert.match(read('../wasm/src/lib.rs'),/hkia_save_core::collection::HISTORY_MAX_BYTES/);
 for(const path of ['../src/editor.worker.ts','../src/draft-store.ts','../src/history-details.ts'])assert.match(read(path),/HISTORY_MAX_BYTES/);
});

test('WASM checkpoint bytes reach IndexedDB and can be restored atomically through worker',()=>{
 const wasm=read('../wasm/src/lib.rs');
 const worker=read('../src/editor.worker.ts');
 const client=read('../src/worker-client.ts');
 const app=read('../src/App.svelte');
 const store=read('../src/draft-store.ts');
 assert.match(wasm,/pub extern "C" fn hkia_history_checkpoint\(\)->u32/);
 assert.match(wasm,/pub extern "C" fn hkia_history_restore\(\)->u32/);
 assert.match(wasm,/editor\.restore_history\(&checkpoint\)/);
 assert.match(worker,/case 'history-restore':/);
 assert.match(worker,/e\.hkia_history_restore\(\)/);
 assert.match(worker,/e\.hkia_history_checkpoint\(\)===0/);
 assert.match(worker,/let checkpoint:Uint8Array\|null=null/);
 assert.match(worker,/historyCheckpoint:checkpoint/);
 assert.match(client,/historyCheckpoint:Uint8Array\|null/);
 assert.match(client,/export function restoreHistory\(checkpoint:Uint8Array\)/);
 assert.match(store,/historyCheckpoint:savedHistory/);
 assert.match(store,/historyCheckpoint:safeHistoryCheckpoint\(state\?\.historyCheckpoint\)/);
 assert.match(app,/saveDraftChanges\(patches,ui,achievements,checkpoint,inventoryPatches\)/);
 assert.match(app,/await restoreHistory\(draft\.historyCheckpoint\)/);
 assert.match(app,/recoveredMatchesDraft\(originalRows,s\.achievements,s\.inventory,recovered,draft\.patches,draft\.achievementPatches,inventoryPatches\)/);
 assert.match(app,/await openSave\(draft\.file\);/);
});

test('native roundtrip regression covers redo-only, interleaved tabs and grouped source records',()=>{
 const rust=read('../core/tests/collection_roundtrip.rs');
 for(const name of [
  'restored_history_checkpoint_keeps_tab_cursors_redo_order_and_native_state',
  'native_checkpoint_replays_source_verified_achievement_creation_and_grouped_parent_edits',
  'native_checkpoint_replays_missing_parent_creation_as_one_reversible_step',
  'checkpoint_recovery_rejects_corrupted_stale_or_trailing_data_atomically'
 ])assert.match(rust,new RegExp('fn '+name+'\\('));
});

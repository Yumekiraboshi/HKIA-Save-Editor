import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');

test('future save labels are release-verified and structurally gated rather than blocked by fixed version list',()=>{
 const e=read('../core/src/envelope.rs');
 const native=read('../core/src/native.rs');
 const collection=read('../core/src/collection.rs');
 assert.match(e,/pub enum Version \{ V300,V301,Forward\{/);
 assert.match(e,/pub fn parse\(label:&str\)->Result<Self,Error>/);
 assert.match(e,/c\.int\(0,999999\)\?!=version\.number\(\)/);
 assert.match(native,/short=="CollectionVersion"/);
 assert.match(native,/self\.version\.as_str\(\)/);
 assert.match(native,/short=="AchievementModel"/);
 assert.match(collection,/Version::Forward\{\.\.\}=>n\.is_some_and\(\|v\|v>=87\)/);
 assert.match(collection,/pub fn version\(&self\)->String/);
 assert.match(collection,/if !Self::compatible\(&slot\)/);
 assert.match(collection,/if !Self::compatible\(&reread\)/);
 assert.match(collection,/self\.slot\.envelope\.version!=Version::V301/);
});

test('the worker preserves future version labels in a bounded extensible snapshot response',()=>{
 const wasm=read('../wasm/src/lib.rs');
 const worker=read('../src/editor.worker.ts');
 const client=read('../src/worker-client.ts');
 assert.match(wasm,/version_flag=if version=="3\.0\.0"\{1\}else if version=="3\.0\.1"\{2\}else\{3\}/);
 assert.match(wasm,/if version_flag==3 \{bytes\.push\(version\.len\(\) as u8\);bytes\.extend\(version\.as_bytes\(\)\);\}/);
 assert.match(worker,/if\(b\[0\]===3\)/);
 assert.match(worker,/if\(!n\|\|n>24\|\|b\.length!==end\+1\+n\)/);
 assert.match(worker,/\/\^\[0-9\]\{1,2\}\$\//);
 assert.match(worker,/version=label;/);
 assert.match(client,/version:string/);
});

test('roundtrip tests cover multiple future versions, incompatible target typing and no unverified new records',()=>{
 const testSource=read('../core/tests/collection_roundtrip.rs');
 assert.match(testSource,/fn future_semver_uses_native_schema_compatibility_for_existing_collection_and_achievement_edits/);
 assert.match(testSource,/fn forward_compatibility_rejects_malformed_versions_and_version_metadata_disagreement/);
 assert.match(testSource,/for version in \["3\.0\.2","3\.0\.4","3\.1\.0","4\.0\.0"\]/);
 assert.match(testSource,/editor\.create_achievement\(\[3,0,0,1\],after\)\.is_err\(\)/);
});

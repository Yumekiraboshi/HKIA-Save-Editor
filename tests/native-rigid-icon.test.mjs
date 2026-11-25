import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
test('source rigid mesh layout has bounded indices and does not claim exact icon render',()=>{
 const e=JSON.parse(readFileSync(new URL('../data/unityfs-audit/witchhat-rigid-icon-diagnostic.v3.0.1.json',import.meta.url),'utf8'));
 assert.equal(e.itemId,528610065);
 assert.equal(e.vertices,1320);
 assert.equal(e.triangles,1988);
 assert.equal(e.nativeIconVerified,false);
 assert.equal(e.nativeLightingVerified,false);
 assert.match(execFileSync('python3',[fileURLToPath(new URL('../scripts/render-native-rigid-icon.py',import.meta.url)),'--self-test'],{encoding:'utf8'}),/NATIVE_RIGID_ICON_SELFTEST_OK/);
});

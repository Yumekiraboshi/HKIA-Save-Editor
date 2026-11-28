import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('candidate dynamic icon bindings preserve native mask IDs and report configuration deltas without activation',()=>{
 const script=fileURLToPath(new URL('../scripts/dynamic-icon-source-update.py',import.meta.url));
 const result=spawnSync(process.env.PYTHON??'python3',[script,'self-test'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr??String(result.error));
 assert.match(result.stdout,/HKIA_DYNAMIC_ICON_SOURCE_UPDATE_SELF_TEST_OK/);
});

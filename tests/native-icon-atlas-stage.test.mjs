import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('versioned native atlas staging resolves exact source references and rejects malformed atlas maps',()=>{
 const script=fileURLToPath(new URL('../scripts/stage-native-icon-atlas.py',import.meta.url));
 const result=spawnSync(process.env.PYTHON??'python3',[script,'--self-test'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr??String(result.error));
 assert.match(result.stdout,/HKIA_NATIVE_ICON_ATLAS_STAGE_SELF_TEST_OK/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('achievement atlas staging verifies complete source census and native null pointer identities',()=>{
 const result=spawnSync(process.env.PYTHON??'python3',[fileURLToPath(new URL('../scripts/stage-achievement-art.py',import.meta.url)),'--self-test'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr??String(result.error));
 assert.match(result.stdout,/HKIA_ACHIEVEMENT_ART_STAGE_SELF_TEST_OK/);
});

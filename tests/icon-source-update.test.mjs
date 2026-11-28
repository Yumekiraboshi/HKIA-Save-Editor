import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('candidate game version icon delta is identity-safe and never activates a release',()=>{
 const script=fileURLToPath(new URL('../scripts/icon-source-update.py',import.meta.url));
 const result=spawnSync(process.env.PYTHON??'python3',[script,'self-test'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr??String(result.error));
 assert.match(result.stdout,/HKIA_ICON_SOURCE_UPDATE_SELF_TEST_OK/);
});

test('completed original icon staging resolves original container GUID and only reuses exact verified dependency identity',()=>{
 const script=fileURLToPath(new URL('../scripts/stage-icon-overrides.py',import.meta.url));
 const result=spawnSync(process.env.PYTHON??'python3',[script,'--self-test'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr??String(result.error));
 assert.match(result.stdout,/HKIA_ICON_OVERRIDE_STAGE_SELF_TEST_OK/);
});

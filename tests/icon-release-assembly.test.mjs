import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('release candidate assembly preserves native result targets, reports missing original sources and packs bounded deterministic source pages',()=>{
 const script=fileURLToPath(new URL('../scripts/assemble-icon-release.py',import.meta.url));
 const result=spawnSync(process.env.PYTHON??'python3',[script,'--self-test'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr??String(result.error));
 assert.match(result.stdout,/HKIA_ICON_RELEASE_ASSEMBLY_SELF_TEST_OK/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('auxiliary icon source maps reject duplicate keys, malformed arrays and nonfinite colors',()=>{
 const script=fileURLToPath(new URL('../scripts/extract-icon-auxiliary-source.py',import.meta.url));
 const result=spawnSync(process.env.PYTHON??'python3',[script,'--self-test'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr??String(result.error));
 assert.match(result.stdout,/HKIA_ICON_AUXILIARY_SOURCE_SELF_TEST_OK/);
});

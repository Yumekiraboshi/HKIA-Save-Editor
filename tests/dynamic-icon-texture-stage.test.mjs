import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('dynamic source crops preserve fractional coordinates and one-texel guard without resampling',()=>{
 const script=fileURLToPath(new URL('../scripts/stage-dynamic-icon-textures.py',import.meta.url));
 const result=spawnSync(process.env.PYTHON??'python3',[script,'--self-test'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr??String(result.error));
 assert.match(result.stdout,/HKIA_DYNAMIC_TEXTURE_STAGE_SELF_TEST_OK/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('auxiliary icon assets keep exact swatch IDs, explicitly unresolved values and unique Sprite routes',()=>{
 const script=fileURLToPath(new URL('../scripts/stage-icon-auxiliary-assets.py',import.meta.url));
 const result=spawnSync(process.env.PYTHON??'python3',[script,'--self-test'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr??String(result.error));
 assert.match(result.stdout,/HKIA_ICON_AUXILIARY_ASSET_STAGE_SELF_TEST_OK/);
});

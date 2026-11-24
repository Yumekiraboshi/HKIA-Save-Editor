import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('rigid headwear batch supports both source vertex layouts without accepting unknown layout',()=>{
 const p=fileURLToPath(new URL('../scripts/render-native-headwear.py',import.meta.url));
 assert.match(execFileSync('python3',[p,'--self-test'],{encoding:'utf8'}),/NATIVE_HEADWEAR_BATCH_SELFTEST_OK/);
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('Chromium image/history smoke script parses before the expensive image batch',()=>{
 const script=fileURLToPath(new URL('../scripts/browser-history-smoke.mjs',import.meta.url));
 const result=spawnSync(process.execPath,['--check',script],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr||result.error?.message||'Node script parse failed');
});

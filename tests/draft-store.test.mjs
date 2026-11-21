import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const source=readFileSync(new URL('../src/draft-store.ts',import.meta.url),'utf8');
const {outputFiles}=await build({
 entryPoints:[fileURLToPath(new URL('../src/draft-store.ts',import.meta.url))],
 bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'
});
const store=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

test('record changes preserve exact 100-nanosecond tick strings',()=>{
 const original=new Map([[23,638000000000000001n],[42,999999999999999999n]]);
 const same={23:638000000000000001n,42:999999999999999999n};
 assert.deepEqual(store.diffPatches(original,same),[]);
 const current={23:638000000000001011n,84:638000000000002022n};
 const patches=store.diffPatches(original,current);
 assert.deepEqual(patches,[
  {id:23,before:'638000000000000001',after:'638000000000001011'},
  {id:42,before:'999999999999999999',after:null},
  {id:84,before:null,after:'638000000000002022'}
 ]);
 assert.deepEqual(store.safePatches(patches),patches);
});

test('draft validation rejects malformed identities and duplicated records',()=>{
 const good={id:7,before:null,after:'638000000000000000'};
 for(const bad of [
  null,{id:0,before:null,after:'10'},
  {id:2147483648,before:null,after:'10'},
  {id:7,before:'not-a-tick',after:'10'},
  {id:7,before:null,after:'1'.repeat(25)},
  {id:7,before:'10',after:undefined}
 ])assert.throws(()=>store.safePatches([bad]));
 assert.throws(()=>store.safePatches([good,good]));
 assert.throws(()=>store.safePatches(Array(20001).fill(good)));
});

test('restoration code keeps source and changes separate and clears both on close',()=>{
 assert.match(source,/transaction\(\[BASE,EDITS\],'readwrite'\)/);
 assert.match(source,/objectStore\(BASE\)\.put\(file,KEY\)/);
 assert.match(source,/objectStore\(EDITS\)\.put\(\{version:VERSION,patches:savedPatches,achievementPatches:savedAchievements,ui:savedUi\},KEY\)/);
 assert.match(source,/cloneStoredAchievementPatches\(achievementPatches\)/);
 assert.match(source,/objectStore\(BASE\)\.delete\(KEY\)/);
 assert.match(source,/objectStore\(EDITS\)\.delete\(KEY\)/);
});

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
 assert.match(source,/objectStore\(EDITS\)\.put\(\{version:VERSION,patches:savedPatches,achievementPatches:savedAchievements,inventoryPatches:savedInventory,ui:savedUi,historyCheckpoint:savedHistory\},KEY\)/);
 assert.match(source,/cloneStoredAchievementPatches\(achievementPatches\)/);
 assert.match(source,/objectStore\(BASE\)\.delete\(KEY\)/);
 assert.match(source,/objectStore\(EDITS\)\.delete\(KEY\)/);
});


test('local native history checkpoints are cloned losslessly and invalid payloads fall back safely',()=>{
 const valid=new Uint8Array(16);
 valid.set(new TextEncoder().encode('HKIAHS01'));
 assert.deepEqual(store.safeHistoryCheckpoint(valid),valid);
 const copy=store.safeHistoryCheckpoint(valid);
 assert.ok(copy);
 assert.notEqual(copy,valid);
 copy[0]=0;
 assert.equal(valid[0],72,'IndexDB must never retain a mutable Svelte/worker buffer');
 for(const invalid of [
  null,{},new Uint8Array(0),new Uint8Array(15),new Uint8Array(128*1024+1),
  Uint8Array.from(valid, (x,i)=>i===0?0:x),
  Uint8Array.from(valid, (x,i)=>i===8?1:i===12?2:x),
  Uint8Array.from(valid, (x,i)=>i===8?1:x) // structurally bounded but incomplete; Rust must reject
 ]){
  const result=store.safeHistoryCheckpoint(invalid);
  if(invalid instanceof Uint8Array&&invalid[8]===1&&invalid[12]===0&&invalid[0]===72){
   assert.ok(result,'native verifier rejects truncated operations on replay, not IDB reader');
  }else assert.equal(result,null);
 }
 assert.match(source,/safeHistoryCheckpoint\(state\?\.historyCheckpoint\)/);
 assert.match(source,/if\(historyCheckpoint!==null&&!savedHistory\)throw Error\('HISTORY_CHECKPOINT_INVALID'\)/);
});

test('staged unique flower patches preserve identity, appearance and quantity only as recovery comparison',()=>{
 const row={documentId:2147483649,itemId:43114910,quantity:7,unique:{uniqueId:null,tag:7},flower:{growState:6,baseColor:9,pattern:0,patternColor:0}};
 const patches=store.diffInventory([], [row]);
 assert.deepEqual(patches,[{documentId:2147483649,itemId:43114910,variant:[6,9,0,0],quantity:7,kind:'flower-create'}]);
 assert.deepEqual(store.safeInventoryPatches(patches),patches);
 for(const bad of [{...patches[0],documentId:8},{...patches[0],quantity:0},{...patches[0],variant:[6,9,0]},{...patches[0],itemId:0}])assert.throws(()=>store.safeInventoryPatches([bad]));
});

test('staged furniture creation retains the native tuple in the recovery comparison',()=>{
 const row={documentId:2147483649,itemId:61381969,quantity:7,unique:{uniqueId:null,tag:8,fieldCount:3,words:[502,3,0],flowerEditable:false,furnitureEditable:true}};
 const patches=store.diffInventory([], [row]);
 assert.deepEqual(patches,[{documentId:2147483649,itemId:61381969,variant:[502,3,0],quantity:7,kind:'furniture-create'}]);
 assert.deepEqual(store.safeInventoryPatches(patches),patches);
 for(const bad of [{...patches[0],documentId:8},{...patches[0],quantity:0},{...patches[0],variant:[502,3]}])assert.throws(()=>store.safeInventoryPatches([bad]));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {build} from 'esbuild';

function reactive(value){
 if(value===null||typeof value!=='object')return value;
 return new Proxy(value,{
  get(target,key,receiver){return reactive(Reflect.get(target,key,receiver))}
 });
}
const sourceValue={complete:false,current:7.75,completed:[1780000000n,123456700]};
const originalGuid=[0,1,0xFFFFFFFF,1234];

test('deep Svelte-like reactive Proxies are not transferable but explicit worker snapshots are',async()=>{
 const {outputFiles}=await build({
  entryPoints:[fileURLToPath(new URL('../src/achievement-worker-payload.ts',import.meta.url))],
  bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'
 });
 const safe=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
 const proxiedGuid=reactive(originalGuid),proxiedBefore=reactive(sourceValue);
 const proxiedAfter=reactive({complete:true,current:7.75,completed:[1780000060n,987654300]});
 assert.throws(()=>structuredClone(proxiedGuid),/could not be cloned|DataCloneError/i);
 assert.throws(()=>structuredClone(proxiedBefore),/could not be cloned|DataCloneError/i);
 const payload={
  guid:safe.workerAchievementGuid(proxiedGuid),
  beforeValue:safe.workerAchievementValue(proxiedBefore),
  afterValue:safe.workerAchievementValue(proxiedAfter)
 };
 assert.deepEqual(structuredClone(payload),{
  guid:originalGuid,beforeValue:sourceValue,
  afterValue:{complete:true,current:7.75,completed:[1780000060n,987654300]}
 });
 assert.notStrictEqual(payload.beforeValue,sourceValue);
 assert.notStrictEqual(payload.guid,originalGuid);
 const other=safe.workerAchievementValue(reactive({complete:true,current:1,completed:null}));
 assert.deepEqual(structuredClone(other),{complete:true,current:1,completed:null});
 const patch=safe.workerAchievementPatch(reactive({guid:originalGuid,before:sourceValue,
  after:{complete:true,current:7.75,completed:[1780000060n,987654300]}}));
 assert.deepEqual(structuredClone(patch),{
  guid:originalGuid,before:sourceValue,
  after:{complete:true,current:7.75,completed:[1780000060n,987654300]}
 });
 assert.deepEqual(structuredClone(safe.workerCollectionPatch(reactive({id:123,before:700n,after:800n}))),
  {id:123,before:700n,after:800n});
});

test('real Worker RPC client passes clone-safe objects for both one-click/date edits and draft restoration',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hkia-dataclone-test-'));
 const path=join(dir,'worker-client-test.mjs');
 const messages=[];
 const oldWorker=globalThis.Worker;
 class CloneCheckingWorker{
  onmessage=null;
  onerror=null;
  constructor(){globalThis.__workerMock=this}
  postMessage(message,transfer){
   // Emulate the browser structuredClone step that previously threw synchronously.
   const cloned=structuredClone(message,transfer?.length?{transfer}:undefined);
   messages.push(cloned);
   queueMicrotask(()=>this.onmessage?.({data:{id:cloned.id,ok:true,value:{revision:messages.length}}}));
  }
 }
 try{
  const source=fileURLToPath(new URL('../src/worker-client.ts',import.meta.url));
  await build({entryPoints:[source],bundle:true,platform:'node',format:'esm',
   outfile:path,logLevel:'silent'});
  globalThis.Worker=CloneCheckingWorker;
  const rpc=await import(pathToFileURL(path).href);
  const before=reactive({complete:false,current:4.5,completed:null});
  const after=reactive({complete:true,current:4.5,completed:[1780000000n,300000000]});
  const guid=reactive([11,22,33,44]);
  const result=await rpc.changeAchievement(guid,before,after);
  assert.equal(result.revision,1);
  assert.deepEqual(messages[0],{id:1,action:'achievement',guid:[11,22,33,44],
   beforeValue:{complete:false,current:4.5,completed:null},
   afterValue:{complete:true,current:4.5,completed:[1780000000n,300000000]}});
  const edited=await rpc.changeAchievement(guid,after,reactive({complete:true,current:5.5,completed:[1780000001n,400000000]}));
  assert.equal(edited.revision,2);
  assert.deepEqual(messages[1].beforeValue.completed,[1780000000n,300000000]);
  assert.deepEqual(messages[1].afterValue.completed,[1780000001n,400000000]);
  const batch=await rpc.applyDraft(reactive([{id:22,before:1n,after:2n}]),
   reactive([{guid:[11,22,33,44],before:{complete:false,current:4.5,completed:null},
     after:{complete:true,current:4.5,completed:[1780000000n,300000000]}}]));
  assert.equal(batch.revision,3);
  assert.equal(messages[2].action,'batch');
  assert.deepEqual(messages[2].patches,[{id:22,before:1n,after:2n}]);
  assert.deepEqual(messages[2].achievementPatches,[{guid:[11,22,33,44],
   before:{complete:false,current:4.5,completed:null},
   after:{complete:true,current:4.5,completed:[1780000000n,300000000]}}]);
  const auto=await rpc.editAchievementAuto(guid,before,after);
  assert.equal(auto.revision,4);
  assert.deepEqual(messages[3],{id:4,action:'achievement-auto',guid:[11,22,33,44],
   beforeValue:{complete:false,current:4.5,completed:null},
   afterValue:{complete:true,current:4.5,completed:[1780000000n,300000000]}});
  const created=await rpc.editAchievementAuto(guid,null,after);
  assert.equal(created.revision,5);
  assert.equal(messages[4].action,'achievement-auto');
  assert.equal(messages[4].beforeValue,null);
  assert.deepEqual(messages[4].afterValue.completed,[1780000000n,300000000]);
 }finally{
  if(oldWorker===undefined)delete globalThis.Worker;else globalThis.Worker=oldWorker;
  delete globalThis.__workerMock;
  rmSync(dir,{recursive:true,force:true});
 }
});

test('all achievement mutation entrypoints normalize at the RPC boundary, not only the card button',()=>{
 const client=readFileSync(new URL('../src/worker-client.ts',import.meta.url),'utf8');
 const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 for(const marker of ['workerAchievementGuid(guid)','workerAchievementValue(beforeValue)',
  'workerAchievementValue(afterValue)','patches.map(workerCollectionPatch)',
  'achievementPatches.map(workerAchievementDraftPatch)','waiting.delete(id);reject']){
  assert.ok(client.includes(marker),marker);
 }
 assert.ok(app.includes('editAchievementAuto(guid,live?.value??null,next)'));
 assert.ok(app.includes('editAchievementAuto(selected.guid,selected.value,next)'));
 assert.ok(client.includes("rpc('achievement-auto'"));
 assert.ok(client.includes('workerAchievementValue(beforeValue)'));
 assert.ok(client.includes('workerAchievementValue(afterValue)'));
 assert.ok(!app.includes('changeAchievementWithParent('));
 assert.ok(app.includes('applyDraft(patches,achievementPatches,inventoryPatches)'));
});

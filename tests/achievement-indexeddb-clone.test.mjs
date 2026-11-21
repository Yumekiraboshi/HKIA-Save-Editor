import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

async function imported(path){
 const {outputFiles}=await build({
  entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
  bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'
 });
 return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
}
const [draft,store]=await Promise.all([
 imported('../src/achievement-draft.ts'),
 imported('../src/draft-store.ts')
]);
function reactive(value){
 if(value===null||typeof value!=='object')return value;
 return new Proxy(value,{get(target,key,receiver){return reactive(Reflect.get(target,key,receiver))}});
}
const original={
 guid:[0,1,0xffffffff,123456],
 value:{complete:false,current:7.25,completed:null}
};
const edited={
 guid:[0,1,0xffffffff,123456],
 value:{complete:true,current:7.25,completed:[1780000000n,123456700]}
};
const expected={
 guid:[0,1,0xffffffff,123456],
 before:{complete:false,current:7.25,completed:null},
 after:{complete:true,current:7.25,completed:['1780000000',123456700]}
};

test('diffAchievements never leaks a Svelte Proxy GUID into the persisted patch',()=>{
 const rows=reactive([edited]);
 assert.throws(()=>structuredClone(rows),/could not be cloned|DataCloneError/i);
 const changes=draft.diffAchievements(reactive([original]),rows);
 assert.deepEqual(changes,[expected]);
 assert.deepEqual(structuredClone(changes),[expected]);
 assert.notStrictEqual(changes[0].guid,edited.guid);
 const noChange=draft.diffAchievements(reactive([original]),reactive([original]));
 assert.deepEqual(noChange,[]);
});

test('IndexedDB payload normalization deep-copies reactive GUIDs, timestamps and collection patches',async()=>{
 const old=globalThis.indexedDB;
 const writes=[];
 let databaseName=null;
 const database={
  transaction(name,mode){
   assert.equal(name,'unsaved-changes');assert.equal(mode,'readwrite');
   const tx={oncomplete:null,onabort:null,onerror:null,
    objectStore(which){
     assert.equal(which,'unsaved-changes');
     return {put(payload,key){
      // Emulates the exact browser IDB put structuredClone boundary.
      const safe=structuredClone(payload);
      writes.push({key,payload:safe});
      queueMicrotask(()=>tx.oncomplete?.());
     }};
    }
   };
   return tx;
  },
  close(){}
 };
 globalThis.indexedDB={
  open(name,version){
   databaseName=name;
   assert.equal(version,1);
   const request={result:database,onsuccess:null,onerror:null,onupgradeneeded:null,onblocked:null};
   queueMicrotask(()=>request.onsuccess?.());
   return request;
  }
 };
 try{
  const collection=reactive([{id:17,before:null,after:'638000000000001234'}]);
  const proxiedChanges=reactive([expected]);
  const ui=reactive({group:'fish',subgroup:'nested'});
  assert.throws(()=>structuredClone({version:1,patches:collection,achievementPatches:proxiedChanges,ui}),
   /could not be cloned|DataCloneError/i);
  await store.saveDraftChanges(collection,ui,proxiedChanges);
  assert.equal(databaseName,'hkia-editor-local-session');
  assert.deepEqual(writes,[{key:'current',payload:{
   version:1,
   patches:[{id:17,before:null,after:'638000000000001234'}],
   achievementPatches:[expected],
   ui:{group:'fish',subgroup:'nested'}
  }}]);
  await store.saveDraftChanges(reactive([]),reactive({group:null,subgroup:null}),reactive([]));
  assert.deepEqual(writes.at(-1).payload,{version:1,patches:[],achievementPatches:[],
   ui:{group:null,subgroup:null}});
  assert.deepEqual(expected.after.completed,['1780000000',123456700]);
 }finally{
  if(old===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=old;
 }
});

test('tampered or duplicated achievement drafts cannot be persisted',()=>{
 const duplicate=reactive([expected,expected]);
 assert.throws(()=>draft.cloneStoredAchievementPatches(duplicate),/DRAFT_INVALID/);
 assert.throws(()=>draft.cloneStoredAchievementPatches(reactive([{...expected,guid:[1,2,3]}])),/DRAFT_INVALID/);
 const changed=reactive([{...expected,after:{...expected.after,completed:['1780000000',123456789]}}]);
 assert.throws(()=>draft.cloneStoredAchievementPatches(changed),/DRAFT_INVALID/);
 const allowed=draft.cloneStoredAchievementPatches(reactive([expected]));
 assert.deepEqual(structuredClone(allowed),[expected]);
});

test('existing worker and save behavior are unaffected by the IndexedDB-only fix',()=>{
 const source=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../src/worker-client.ts',import.meta.url),'utf8');
 assert.match(source,/diffAchievements\(achievementBaseline,snapshot\?\.achievements\?\?\[\]\)/);
 assert.match(source,/saveDraftChanges\(patches,ui,achievements\)/);
 assert.match(worker,/workerAchievementGuid\(guid\)/);
 assert.match(worker,/workerAchievementValue\(beforeValue\)/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/inventory-native-art.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {decodeInventoryNativeArt,initialInventoryNativeArt,createInventoryNativeArtLoader,decodeCandidateInventoryNativeArt,createVersionedInventoryNativeArtLoader}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const raw=readFileSync(new URL('../public/inventory-art/index.json',import.meta.url));
const manifest=JSON.parse(raw);
test('all additional original inventory definitions have a verified native 2D sprite or an explicit reason to withhold art',()=>{
 const art=decodeInventoryNativeArt(manifest,'/editor/');
 assert.equal(createHash('sha256').update(raw).digest('hex'),'a5cb833211120f94c59e0bd31b6a0ae27e4d58149406fdc0269ab5274ffa13e9');
 const names=JSON.parse(readFileSync(new URL('../public/inventory-names/en.json',import.meta.url))).names;
 assert.equal(art.entries.size,1747);assert.equal(art.withheld.size,154);assert.equal(art.placeholders.size,152);
 assert.deepEqual([...art.placeholders],manifest.withheld.filter(x=>x[2]==='source-placeholder').map(x=>x[0]));
 assert.equal(art.placeholders.has(1061947263),false);assert.equal(art.placeholders.has(1835273963),false);
 const wrong=structuredClone(manifest);wrong.withheld[0][1]='123';assert.throws(()=>decodeInventoryNativeArt(wrong,'/'));
 assert.deepEqual(new Set([...art.entries.keys(),...art.withheld].map(String)),new Set(Object.keys(names)));
 assert.deepEqual(art.entries.get(427689),{url:'/editor/inventory-art/sheet-005.webp',x:576,y:192,sheet:5,cell:30,nativeSheet:{root:'/editor/inventory-art/',file:manifest.sheets[5].name,sha256:manifest.sheets[5].sha256,bytes:manifest.sheets[5].bytes}});
 assert.equal(art.entries.has(7427895),false);assert.equal(art.withheld.has(7427895),true);
 assert.equal(art.withheld.has(1061947263),true);
 assert.equal(manifest.withheld.filter(x=>x[2]==='source-placeholder').length,152);
 assert.equal(manifest.withheld.filter(x=>x[2]==='dynamic-color').length,2);
 for(const s of manifest.sheets){
  const bytes=readFileSync(new URL('../public/inventory-art/'+s.name,import.meta.url));
  assert.equal(bytes.length,s.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),s.sha256);
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
 }
 assert.throws(()=>decodeInventoryNativeArt({...manifest,atlasSha256:'0'.repeat(64)},'/'));
 assert.throws(()=>decodeInventoryNativeArt({...manifest,records:[...manifest.records.slice(0,-1),manifest.records[0]]},'/'));
});

test('inventory uses the exact shared original placeholder without claiming item-specific art',()=>{
 const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 const runtime=readFileSync(new URL('../src/native-placeholder-art.ts',import.meta.url),'utf8');
 const component=readFileSync(new URL('../src/DynamicArtSprite.svelte',import.meta.url),'utf8');
 const bytes=readFileSync(new URL('../public/dynamic-wand-art/native-placeholder.webp',import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'0adfe05aff08f9988167c8e8a04b47bfe01cfb1b955aee56a70a2c29edc638c2');
 assert.ok(app.includes('inventoryNativeArt?.placeholders.has(item.itemId)'));
 assert.ok(app.includes('<DynamicArtSprite source="native-placeholder" render={renderNativePlaceholderArt}/>'));
 assert.ok(runtime.includes('renderCachedOriginalBase(PLACEHOLDER_ASSET.sha256'));
 assert.ok(component.includes("source==='native-placeholder'?'game-original-placeholder'"));
});

test('all 152 original placeholder routes work before or without the additional atlas index',()=>{
 const source=JSON.parse(readFileSync(new URL('../data/native-placeholder-main-routes-v3.0.1.json',import.meta.url)));
 const original=JSON.parse(readFileSync(new URL('../data/native-icon-override-source-v3.0.1.json',import.meta.url)));
 const ids=original.placeholderRows.map(r=>r[0]).sort((a,b)=>a-b);
 assert.deepEqual(source.ids,ids);
 assert.equal(source.switchDefinitionsSha256,original.switchDefinitionsSha256);
 assert.equal(source.sourceSpriteName,'icon_placeholder');
 assert.equal(source.sourceSpritePathId,'-6646601456236922891');
 assert.equal(source.exactNamedAlternativeCount,0);
 const bytes=Buffer.alloc(ids.length*4);
 ids.forEach((id,i)=>bytes.writeUInt32LE(id,i*4));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),source.idsLittleEndianSha256);
 assert.equal(source.idsLittleEndianSha256,'2b73f3d62c360681b401b746a6958f16a3c7e5b6846aa9afdf67ff41917d0f78');
 const initial=initialInventoryNativeArt(),complete=decodeInventoryNativeArt(manifest,'/');
 assert.equal(initial.entries.size,0);
 assert.deepEqual(initial.placeholders,complete.placeholders);
 assert.deepEqual(initial.withheld,complete.withheld);
 assert.deepEqual(source.dynamicExcludedIds,original.dynamicExcludedRows.map(r=>r[0]));
 const wrong=structuredClone(manifest);
 wrong.withheld.find(r=>r[2]==='source-placeholder')[0]=2147483647;
 assert.throws(()=>decodeInventoryNativeArt(wrong,'/'));
 const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 assert.ok(app.includes('$state(initialInventoryNativeArt())'));
 assert.ok(app.includes('if(!inventoryNativeArtDisposed)inventoryNativeArt=art'));
 assert.ok(app.includes("window.addEventListener('online',refreshInventoryNativeArt)"));
 assert.ok(app.includes("window.removeEventListener('online',refreshInventoryNativeArt)"));
});

test('native inventory index can recover from network and integrity failures without changing withheld policy',async()=>{
 const prev=globalThis.fetch;
 let attempt=0;
 try{
  globalThis.fetch=async url=>{
   assert.equal(url,'/editor/inventory-art/index.json');
   attempt++;
   if(attempt===1)return {ok:false};
   const bytes=attempt===2?Buffer.from(raw.toString('utf8').replace('1747','1748')):raw;
   return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
  };
  const initial=initialInventoryNativeArt();
  const request=createInventoryNativeArtLoader('/editor/');
  const first=request();assert.equal(request(),first);
  await assert.rejects(first,/INVENTORY_ART_UNAVAILABLE/);
  await assert.rejects(request(),/INVENTORY_ART_INVALID/);
  assert.equal(initial.entries.size,0);
  const third=request();assert.equal(request(),third);
  const recovered=await third;
  assert.equal(recovered.entries.size,1747);
  assert.deepEqual(recovered.withheld,initial.withheld);
  assert.deepEqual(recovered.placeholders,initial.placeholders);
  assert.equal(await request(),recovered);
  assert.equal(attempt,3);
 }finally{globalThis.fetch=prev;}
});

test('candidate atlas supports changed sheet count and native placeholder PathID without changing production pins',async()=>{
 const v={schema:'HKIA.InventoryNativeArt.1',version:'9.1.0',definitionsSha256:'a'.repeat(64),atlasSha256:'b'.repeat(64),size:96,columns:12,count:2,withheldCount:2,
 sheets:Array.from({length:11},(_,i)=>({name:'sheet-'+String(i).padStart(3,'0')+'.webp',sha256:'c'.repeat(64),bytes:12})),
 records:[[42,10,0,'123'],[43,10,0,'123']],withheld:[[44,'234','source-placeholder'],[45,'345','dynamic-color']]};
 const data=Buffer.from(JSON.stringify(v)),pin={version:v.version,indexFileSha256:createHash('sha256').update(data).digest('hex'),definitionsSha256:v.definitionsSha256,atlasSha256:v.atlasSha256};
 const art=decodeCandidateInventoryNativeArt(v,'/candidate/',pin);
 assert.equal(art.entries.get(42).nativeSheet.file,'sheet-010.webp');assert.deepEqual([...art.placeholders],[44]);assert.deepEqual([...art.withheld],[44,45]);
 assert.throws(()=>decodeInventoryNativeArt(v,'/'));
 for(const mutate of [x=>{x.version='9.2.0'},x=>{x.records[1][2]=1},x=>{x.withheld[1][0]=42},x=>{x.sheets[10].name='../sheet.webp'},x=>{x.count=3}]){
  const x=structuredClone(v);mutate(x);assert.throws(()=>decodeCandidateInventoryNativeArt(x,'/candidate/',pin),/INVENTORY_ART_INVALID/);
 }
 const old=globalThis.fetch;let calls=0;
 globalThis.fetch=async url=>{assert.equal(url,'/candidate/inventory-art/index.json');return new Response(++calls===1?Buffer.from('{}'):data);};
 try{
  const load=createVersionedInventoryNativeArtLoader('/candidate/',pin);
  await assert.rejects(load('9.2.0'),/INVENTORY_ART_INVALID/);assert.equal(calls,0);
  await assert.rejects(load(v.version),/DYNAMIC_ART_HASH/);
  const result=load(v.version);assert.equal(result,load(v.version));assert.deepEqual(await result,art);assert.equal(calls,2);
 }finally{globalThis.fetch=old;}
});

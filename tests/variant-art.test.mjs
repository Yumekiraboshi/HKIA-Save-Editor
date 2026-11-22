import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const {outputFiles}=await build({
 entryPoints:[fileURLToPath(new URL('../src/variant-art.ts',import.meta.url))],
 bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'
});
const {parseVariantArtIndex,loadVariantArtIndex}=await import(
 'data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64')
);
const read=(name)=>readFileSync(new URL(name,import.meta.url),'utf8');
const manifest=JSON.parse(read('../public/variant-art/index.json'));
const native=JSON.parse(read('../public/native-dye-palettes.json'));
const example={
 file:'704486536.png',sha256:'a'.repeat(64),
 provenance:'verified-game-capture',
 source:'https://hellokittyislandadventure.wiki.gg/wiki/File:Ice_Cream_Archer_Hat.png'
};
const wrap=(records)=>({schema:'HKIA.DyeVariantArt.1',version:'3.0.1',records});

test('only explicit same-origin per-Item-ID artwork can override source sprites',()=>{
 assert.deepEqual(parseVariantArtIndex(manifest,'/HKIA-Save-Editor/'),{});
 const r=parseVariantArtIndex(wrap({'704486536':example}),'/HKIA-Save-Editor/');
 assert.equal(r['704486536'],'/HKIA-Save-Editor/variant-art/704486536.png');
 assert.equal(Object.keys(r).length,1);
});

test('strict index rejects cross-origin links, wrong source IDs, traversal and missing provenance',()=>{
 for(const invalid of [
  {file:'https://example.com/img.png'},
  {file:'../../704486536.png'},
  {file:'585726126.png'},
  {file:'704486536.jpg'},
  {sha256:'short'},
  {provenance:'unverified-approximation'},
  {source:'oops'}
 ]){
  assert.throws(()=>parseVariantArtIndex(wrap({'704486536':{...example,...invalid}}),'/'),
   /VARIANT_ART_RECORD_INVALID/);
 }
 for(const base of ['https://example.org/','//evil.example/','/foo/../bar/','foo/']){
  assert.throws(()=>parseVariantArtIndex(wrap({'704486536':example}),base),
   /VARIANT_ART_BASE_INVALID/);
 }
 assert.throws(()=>parseVariantArtIndex(wrap({'0':example}),'/'),/VARIANT_ART_RECORD_INVALID/);
 assert.throws(()=>parseVariantArtIndex(wrap(Object.fromEntries([['__proto__',example]])),'/'),/VARIANT_ART_RECORD_INVALID/);
 assert.throws(()=>parseVariantArtIndex({...wrap({}),version:'1.0'},'/'),/VARIANT_ART_INDEX_INVALID/);
});

test('loader reads verified index through local deployment base only',async()=>{
 const previous=globalThis.fetch;
 const requests=[];
 try{
  globalThis.fetch=async (url,options)=>{
   requests.push({url,options});
   return {ok:true,json:async()=>wrap({'704486536':example})};
  };
  const record=await loadVariantArtIndex('/HKIA-Save-Editor/');
  assert.equal(record['704486536'],'/HKIA-Save-Editor/variant-art/704486536.png');
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,'/HKIA-Save-Editor/variant-art/index.json');
  assert.equal(requests[0].options.cache,'force-cache');
 }finally{
  globalThis.fetch=previous;
 }
});

test('every registered exact image is an audited, local, unmodified PNG or WebP',()=>{
 const indexed=parseVariantArtIndex(manifest,'/');
 const files=readdirSync(new URL('../public/variant-art/',import.meta.url))
  .filter(name=>name!=='index.json');
 assert.deepEqual(Object.keys(indexed).length,files.length,'no orphaned or untracked captures');
 for(const [id,record] of Object.entries(manifest.records)){
  assert.ok(native.records[id],'original game dye Item ID must exist');
  const data=readFileSync(new URL('../public/variant-art/'+record.file,import.meta.url));
  assert.ok(data.length>=40&&data.length<=2_000_000,'capture size budget');
  assert.equal(createHash('sha256').update(data).digest('hex'),record.sha256);
  if(record.file.endsWith('.png')){
   assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
   const width=data.readUInt32BE(16),height=data.readUInt32BE(20);
   assert.ok(width>=48&&height>=48&&width<=1024&&height<=1024);
  }else{
   assert.equal(data.toString('ascii',0,4),'RIFF');
   assert.equal(data.toString('ascii',8,12),'WEBP');
  }
 }
});

test('the collection selects exact captures first in all three places and never adds dye rings',()=>{
 const app=read('../src/App.svelte'),sprite=read('../src/DyeSprite.svelte');
 assert.match(app,/loadVariantArtIndex\(import\.meta\.env\.BASE_URL\)/);
 assert.equal((app.match(/exactArtUrl=\{/g)||[]).length,3);
 assert.match(app,/exactVariantArt\[String\(sub\.previewId\)\]/);
 assert.match(app,/exactVariantArt\[String\(item\[0\]\)\]/);
 assert.match(app,/exactVariantArt\[String\(dateDialogItem\[0\]\)\]/);
 assert.match(sprite,/picture\.decode\(\)\.then/);
 assert.match(sprite,/\.catch\(renderApproximation\)/);
 assert.match(sprite,/data-dye-source=\{imageSource\}/);
 assert.match(sprite,/imageSource='game-capture'/);
 assert.match(sprite,/background-size=\{imageSource==='game-capture'\?'contain'/);
 assert.match(sprite,/URL\.revokeObjectURL\(createdUrl\)/);
 for(const prohibited of [/native-dye-ring/,/native-dye-swatch/,/native-dye-preview/]){
  assert.doesNotMatch(app,prohibited);
 }
});

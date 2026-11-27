import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const {outputFiles}=await build({stdin:{contents:"export * from './src/native-icon-route';export * from './src/inventory-flower-display';export * from './src/inventory-chef-display';export * from './src/inventory-wand-display';",resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {nativeIconRoute,hasNativeFlowerArt,hasNativeChefArt,hasNativeWandArt,flowerGrowthKind}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const source=read('data/unityfs-audit/dynamic-uiicons.v3.0.1.json');
const sorted=ids=>[...ids].sort((a,b)=>a-b);
test('all 50 source dynamic flags map to the correct verified image families',()=>{
 const by=route=>sorted(source.rows.filter(r=>nativeIconRoute(r.itemId)===route).map(r=>r.itemId));
 const flowers=read('public/inventory-flower-art/flower-runtime-source-v3.0.1.json');
 const chef=read('public/dynamic-chef-art/chef-runtime-source-v3.0.1.json');
 const wand=read('public/dynamic-wand-art/wand-runtime-source-v3.0.1.json');
 const palette=read('public/dynamic-palette-art/palette-runtime-source-v3.0.1.json');
 assert.equal(source.flaggedDefinitionCount,50);
 assert.equal(source.rows.length,50);
 assert.equal(new Set(source.rows.map(r=>r.itemId)).size,50);
 assert.equal(by('flower').length,25);assert.deepEqual(by('flower'),sorted(flowers.rows.map(r=>r.itemId)));
 assert.equal(by('cafe').length,9);assert.equal(by('boba').length,1);
 assert.deepEqual(sorted([...by('cafe'),...by('boba')]),sorted(chef.rows.map(r=>r.itemId)));
 assert.equal(by('wand').length,9);assert.deepEqual(by('wand'),sorted(wand.rows.map(r=>r.itemId)));
 assert.deepEqual(by('palette'),[palette.itemId]);
 assert.deepEqual(by('instruction'),[664242277,697059779,906644716,1711005390,1946811711]);
 for(const row of source.rows){
  const route=nativeIconRoute(row.itemId);
  assert.ok(route);
  assert.equal(hasNativeFlowerArt(row.itemId),route==='flower');
  assert.equal(hasNativeChefArt(row.itemId),route==='cafe'||route==='boba');
  assert.equal(hasNativeWandArt(row.itemId),route==='wand');
 }
 for(const [id] of read('data/flower-creation-icon-source-v3.0.1.json')){
  assert.equal(nativeIconRoute(id),undefined);
  assert.equal(flowerGrowthKind(id,{growState:6,baseColor:1,pattern:0,patternColor:0}),null);
 }
 assert.equal(nativeIconRoute(0),undefined);
});
test('flower edit preview retains the source image if tint definitions are unavailable',()=>{
 const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 const marker='<DynamicFlowerSprite itemId={edit.itemId} flower={appearance} definitions={flowerDefinitions} fallback={inventoryOriginalSprite(edit.itemId)}/>';
 assert.ok(app.includes(marker));
 assert.ok(!app.includes('{#if flowerDefinitions}\n        '+marker));
});

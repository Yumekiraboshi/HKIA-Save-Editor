import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
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

test('native unique and dynamic flag census closes all 143 original definitions',()=>{
 const census=read('data/native-unique-icon-census-v3.0.1.json');
 assert.equal(census.scannedDefinitionCount,12163);
 const rows=census.groups.flatMap(([details,unique,dynamic,ids])=>ids.map(id=>({id,details,unique,dynamic}))).sort((a,b)=>a.id-b.id);
 assert.equal(rows.length,143);
 assert.equal(new Set(rows.map(r=>r.id)).size,143);
 const bytes=Buffer.alloc(rows.length*6);
 rows.forEach((r,i)=>{bytes.writeUInt32LE(r.id,i*6);bytes[i*6+4]=r.unique;bytes[i*6+5]=r.dynamic;});
 assert.equal(createHash('sha256').update(bytes).digest('hex'),census.rowsLittleEndianSha256);
 const unique=rows.filter(r=>r.unique),dynamic=rows.filter(r=>r.dynamic),ordinary=unique.filter(r=>!r.dynamic);
 assert.equal(unique.length,138);assert.equal(dynamic.length,50);assert.equal(ordinary.length,93);
 assert.equal(unique.filter(r=>r.dynamic).length,45);
 assert.deepEqual(dynamic.map(r=>r.id),sorted(source.rows.map(r=>r.itemId)));
 const rules=readFileSync(new URL('../core/src/inventory_source_data.rs',import.meta.url),'utf8').split('pub(super) const RULES:')[1].split('];')[0];
 assert.deepEqual(unique.map(r=>r.id),sorted([...rules.matchAll(/\((\d+),(\d+)\)/g)].filter(m=>Number(m[2])&2).map(m=>Number(m[1]))));
 const staticIds=new Set(read('data/flower-creation-icon-source-v3.0.1.json').map(r=>r[0]));
 assert.equal(ordinary.filter(r=>staticIds.has(r.id)).length,91);
 assert.deepEqual(ordinary.filter(r=>!staticIds.has(r.id)).map(r=>r.id),[1900000001,1900000002]);
 for(const r of ordinary)assert.equal(nativeIconRoute(r.id),undefined);
 for(const r of dynamic){
  const route=nativeIconRoute(r.id);
  assert.equal(route,r.details==='FlowerItemDetails'?'flower':r.details==='WandItemDetails'?'wand':r.details==='CafeFoodItemDetails'?(r.id===1798633565?'boba':'cafe'):r.unique?'palette':'instruction');
 }
 const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 assert.ok(app.includes("hasNativeFlowerArt(item.itemId)&&snapshot.version==='3.0.1'"));
 assert.ok(!app.includes('item.flower||hasNativeFlowerArt'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {collectNativeSprites} from '../scripts/original-icon-packs.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url));
const art=JSON.parse(read('data/inventory-decorator-art-v3.0.1.json'));
const sha=b=>createHash('sha256').update(b).digest('hex');
test('15 native decorator definitions, 14 original sprites and one original plate',()=>{
 assert.deepEqual(art.rows.map(r=>r.type),Array.from({length:15},(_,i)=>i+1));
 assert.equal(art.rows.filter(r=>r.sprite).length,14);
 assert.equal(art.rows[10].sprite,null);
 for(const a of [...art.rows.flatMap(r=>r.sprite?[r.sprite]:[]),art.plate]){
  const b=read('public/inventory-decorators/'+a.file);
  assert.equal(b.length,a.bytes);assert.equal(sha(b),a.sha256);
  assert.equal(b.toString('ascii',8,16),'WEBPVP8L');
  const packed=b.readUInt32LE(21);assert.equal((packed&0x3fff)+1,a.width);assert.equal(((packed>>>14)&0x3fff)+1,a.height);
 }
 assert.equal(art.rows[8].sprite.pathId,'-2011153620495332812');
 assert.deepEqual(art.rows[8].primary,[82,163,166,255].map(n=>Math.fround(n/255)));
 assert.deepEqual(art.rows[8].accent,[1,1,1,1]);
});
test('known material GUID references, not a unique row alone, select the customized decoration',async()=>{
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/inventory-furniture-display.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});
 const {furnitureHasCustomizedAppearance:f}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
 const d={materials:new Map([[524,{sourceName:'native',rgba:[1,1,1,1]}]]),defaults:new Map()};
 assert.equal(f(d,[0,0,0]),false);assert.equal(f(d,[524,0,0]),true);assert.equal(f(d,[0,0,524]),true);
 assert.equal(f(d,[999999,0,0]),false);assert.equal(f(d,[-1,0,0]),false);assert.equal(f(d,[524]),false);assert.equal(f(null,[524,0,0]),false);
 const app=read('src/App.svelte').toString();assert.match(app,/furnitureHasCustomizedAppearance\(furnitureDisplay,furnitureVariantOf\(item.unique\)\)/);assert.match(app,/<InventoryDecorator type=\{9\}/);
});
test('all five flagged chef instruction definitions have a normal original source pack route',()=>{
 const audit=JSON.parse(read('data/unityfs-audit/dynamic-uiicons.v3.0.1.json'));
 const ids=audit.rows.filter(r=>r.key.startsWith('item_instruction_chefcreation_')).map(r=>r.itemId).sort((a,b)=>a-b);
 assert.deepEqual(ids,[664242277,697059779,906644716,1711005390,1946811711]);
 const {sprites}=collectNativeSprites('collection_group_citytown');
 assert.ok(ids.every(id=>sprites.has(String(id))));
});

 test('native flower decorators preserve color-first order and original pattern refs',async()=>{
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/inventory-flower-display.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});
 const {flowerDecorators:f}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
 const defs=JSON.parse(read('public/inventory-ui/flowers.json'));
 const index=JSON.parse(read('public/inventory-ui/index.json'));
 const flower={growState:0,baseColor:1,pattern:0,patternColor:0};
 for(const growState of [0,6,7]){
  assert.deepEqual(f({...flower,growState},defs),[{type:12,primaryColor:'rgba(193,41,61,1)'}]);
  for(const pattern of Object.keys(defs.patterns).map(Number)){
   const file='pattern-'+pattern+'.webp';
   assert.equal(sha(read('public/inventory-ui/'+file)),index.files[file]);
   assert.deepEqual(f({...flower,growState,pattern,patternColor:2},defs),[{type:12,primaryColor:'rgba(193,41,61,1)'},{type:11,patternUrl:file}]);
  }
 }
 for(const baseColor of Object.keys(defs.colors).map(Number)){
  assert.equal(f({...flower,baseColor},defs).length,1);
 }
 assert.deepEqual(f({...flower,pattern:99},defs),[]);
 assert.deepEqual(f({...flower,patternColor:99},defs),[]);
 assert.deepEqual(f({...flower,baseColor:99},defs),[]);
 assert.deepEqual(f(flower,null),[]);
 });

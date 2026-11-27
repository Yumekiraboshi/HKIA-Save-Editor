import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=JSON.parse(read('data/native-inventory-icon-scale-v3.0.1.json'));
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/native-inventory-icon-scale.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {nativeInventoryIconScale}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
test('all 262 original provider definitions use their exact rules-backed scale',()=>{
 assert.deepEqual(source.groups.map(g=>g.length),[94,84,84]);
 assert.deepEqual(source.scales,[1,.8,.6]);
 assert.deepEqual(source.baseBindings.encodedRows,['iconsize.large:1','iconsize.medium:0.8','iconsize.small:0.6']);
 assert.equal(source.baseBindings.pathId,'2655');
 const pairs=source.groups.flatMap((ids,index)=>ids.map(id=>[id,index])).sort((a,b)=>a[0]-b[0]);
 assert.equal(new Set(pairs.map(r=>r[0])).size,262);
 const bytes=Buffer.alloc(pairs.length*8);
 const catalog=JSON.parse(read('public/catalog.json')),native=JSON.parse(read('public/inventory-art/index.json'));
 const all=new Set([...catalog.items.map(r=>r[0]),...native.records.map(r=>r[0]),...native.withheld.map(r=>r[0])]);
 for(const [i,[id,index]] of pairs.entries()){
  assert.ok(all.has(id));bytes.writeUInt32LE(id,8*i);bytes.writeUInt32LE(index,8*i+4);
  assert.equal(nativeInventoryIconScale(id,'3.0.1'),source.scales[index]);
  assert.equal(nativeInventoryIconScale(id,'3.0.0'),1);
 }
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'6a2df4f79198eb5730422a4379130f8cf98b95378d06a7c45aac0931e295e8c2');
 for(const id of all)if(!source.groups.some(g=>g.includes(id)))assert.equal(nativeInventoryIconScale(id,'3.0.1'),1);
 assert.equal(nativeInventoryIconScale(0,'3.0.1'),1);
 for(const [ids,scales] of [[[2064380032,1806222956,142358610],[1,.8,.6]],[[40272568,15761463,133325330],[1,.8,.6]]]){
  assert.deepEqual(ids.map(id=>nativeInventoryIconScale(id,'3.0.1')),scales);
 }
});
test('relative scale is restricted to inventory main sprite, not card or decorator',()=>{
 const app=read('src/App.svelte'),css=read('src/style.css');
 assert.ok(app.includes('style:--inventory-icon-scale={nativeInventoryIconScale(item.itemId,snapshot.version)}'));
 assert.ok(css.includes('.inventory-item-art .item-sprite{flex:0 0 96px;transform:scale(calc(.6666667 * var(--inventory-icon-scale,1)))}'));
 assert.equal((app.match(/style:--inventory-icon-scale=/g)||[]).length,1);
});

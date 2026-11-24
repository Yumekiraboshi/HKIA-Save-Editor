import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/inventory-native-art.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {decodeInventoryNativeArt}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const raw=readFileSync(new URL('../public/inventory-art/index.json',import.meta.url));
const manifest=JSON.parse(raw);
test('all additional original inventory definitions have a verified native 2D sprite or an explicit reason to withhold art',()=>{
 const art=decodeInventoryNativeArt(manifest,'/editor/');
 assert.equal(createHash('sha256').update(raw).digest('hex'),'a5cb833211120f94c59e0bd31b6a0ae27e4d58149406fdc0269ab5274ffa13e9');
 const names=JSON.parse(readFileSync(new URL('../public/inventory-names/en.json',import.meta.url))).names;
 assert.equal(art.entries.size,1747);assert.equal(art.withheld.size,154);
 assert.deepEqual(new Set([...art.entries.keys(),...art.withheld].map(String)),new Set(Object.keys(names)));
 assert.deepEqual(art.entries.get(427689),{url:'/editor/inventory-art/sheet-005.webp',x:576,y:192,sheet:5,cell:30});
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

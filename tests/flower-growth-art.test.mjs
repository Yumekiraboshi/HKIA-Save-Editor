import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/flower-growth-art.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,define:{'import.meta.env.BASE_URL':JSON.stringify('/')},logLevel:'silent'});
const {decodeFlowerGrowthCells,resolveFlowerGrowthCell}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const read=name=>readFileSync(new URL('../public/inventory-flower-art/'+name,import.meta.url));
const raw=read('flower-growth-source-v3.0.1.json'),manifest=JSON.parse(raw);
const sha=b=>createHash('sha256').update(b).digest('hex');
const defs=JSON.parse(readFileSync(new URL('../core/data/inventory-flower-definitions-v3.0.1.json',import.meta.url)));
test('all 25 source species have distinct seed and grown-troweled source sprites',()=>{
 assert.equal(sha(raw),'bf99336e9eaf20de7d2f81f57f00fd2a514e59db03c2e161219f528fed59ff48');
 assert.equal(manifest.rows.length,50);
 assert.equal(new Set(manifest.rows.map(r=>r.texturePathId)).size,25);
 assert.deepEqual([...new Set(manifest.rows.map(r=>r.itemId))].sort((a,b)=>a-b),defs.flowers.map(r=>r.itemId).sort((a,b)=>a-b));
 for(const row of manifest.rows){
  assert.equal(row.name.endsWith(row.state===0?'_seed':'_troweled'),true);
  assert.match(row.cropSha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(row.atlasRef,[2,'5896659347915696894']);
 }
 const cells=decodeFlowerGrowthCells(manifest,'blob:test');
 assert.equal(cells.size,50);
 for(const row of manifest.rows){
  const cell=resolveFlowerGrowthCell(cells,row.itemId,{growState:row.state,baseColor:1,pattern:0,patternColor:0});
  assert.deepEqual(cell,{url:'blob:test',x:(row.cell%10)*96,y:Math.floor(row.cell/10)*96,cell:row.cell});
  assert.equal(resolveFlowerGrowthCell(cells,row.itemId,{growState:6,baseColor:1,pattern:0,patternColor:0}),undefined);
  assert.equal(resolveFlowerGrowthCell(cells,row.itemId,{growState:5,baseColor:1,pattern:0,patternColor:0}),undefined);
 }
 assert.equal(resolveFlowerGrowthCell(cells,108363489,{growState:0,baseColor:1,pattern:0,patternColor:0}),undefined);
});
test('published binary WebP retains exact source-derived bytes and full coverage',()=>{
 const bytes=read('flower-growth-icons-v3.0.1.webp');
 assert.equal(bytes.length,manifest.sheet.bytes);
 assert.equal(sha(bytes),manifest.sheet.sha256);
 assert.equal(bytes.subarray(0,4).toString(),'RIFF');
 assert.equal(bytes.subarray(8,12).toString(),'WEBP');
});
test('invalid source and duplicate state rows cannot produce a sprite',()=>{
 assert.throws(()=>decodeFlowerGrowthCells({...manifest,version:'3.0.2'},'blob:test'),/SOURCE/);
 const changed=structuredClone(manifest);
 changed.rows[1].state=changed.rows[0].state;
 assert.throws(()=>decodeFlowerGrowthCells(changed,'blob:test'),/ROW/);
});

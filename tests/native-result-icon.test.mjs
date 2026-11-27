import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=JSON.parse(read('data/native-result-icon-routes-v3.0.1.json'));
const catalog=JSON.parse(read('public/catalog.json'));
const extra=JSON.parse(read('public/inventory-art/index.json'));
const ids=new Set([...catalog.items.map(r=>r[0]),...extra.records.map(r=>r[0]),...extra.withheld.map(r=>r[0])]);
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/native-result-icon.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {nativeResultIconTarget}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

test('all 762 native recipe and schematic result routes retain exact definition IDs',()=>{
 assert.equal(source.version,'3.0.1');
 assert.equal(source.switchDefinitionsSha256,'660aba36ab6da5964180fe0d474696fc22dd806b2f5b19ce601222cb5a631afa');
 assert.deepEqual([source.count,source.schematics,source.recipes],[762,480,282]);
 assert.equal(source.rows.length,762);
 const b=Buffer.alloc(762*8),sources=new Set(source.rows.map(r=>r[0]));
 assert.equal(sources.size,762);
 assert.equal(new Set(source.rows.map(r=>r[1])).size,706);
 for(const [i,[id,target]] of source.rows.entries()){
  assert.ok(ids.has(id)&&ids.has(target)&&!sources.has(target));
  if(i)assert.ok(source.rows[i-1][0]<id);
  b.writeUInt32LE(id,8*i);b.writeUInt32LE(target,8*i+4);
  assert.equal(nativeResultIconTarget(id,'3.0.1'),target);
  assert.equal(nativeResultIconTarget(id,'3.0.0'),undefined);
 }
 assert.equal(createHash('sha256').update(b).digest('hex'),'99bae02e336d0957bedffab3b05b4c66c96b8d66ef0f685f2be8089744809be0');
 for(const id of ids)if(!sources.has(id))assert.equal(nativeResultIconTarget(id,'3.0.1'),undefined);
 const withheld=new Map(extra.withheld.map(r=>[r[0],r[2]]));
 assert.equal(source.rows.filter(r=>withheld.has(r[0])).length,0);
 assert.deepEqual(source.rows.filter(r=>withheld.has(r[1])).map(r=>[r[0],r[1],withheld.get(r[1])]),[
  [1217231008,108706458,'source-placeholder'],[1617706467,1254006907,'source-placeholder'],[2098620897,328475120,'source-placeholder']
 ]);
});
test('inventory loads result source groups before skipping the original row and keeps original identity',()=>{
 const app=read('src/App.svelte');
 assert.ok(app.includes('nativeResultIconTarget(row.itemId,snapshot.version)'));
 assert.ok(app.includes('nativeResultIconTarget(item.itemId,snapshot.version)'));
 assert.ok(app.includes('inventoryOriginalSprite(resultId)'));
 assert.ok(app.includes('originalVariantArt[String(resultId)]'));
 assert.ok(app.includes('inventoryNativeArt?.placeholders.has(resultId)'));
 assert.ok(app.includes('data-inventory-art="native-result"'));
 assert.ok(app.includes('inventoryName(item.itemId)'));
 assert.ok(app.includes('requestInventoryDelete([item],false'));
});

test('native result route cannot fall through to an unrelated source item icon',()=>{
 const app=read('src/App.svelte');
 const start=app.indexOf('{:else if resultId!==undefined&&resultOriginal}');
 const stop=app.indexOf('{:else if originalVariantArt[String(item.itemId)]',start);
 assert.ok(start>=0&&stop>start);
 const branch=app.slice(start,stop);
 assert.ok(branch.includes('{:else if resultPlaceholder}'));
 assert.ok(branch.includes('{:else if resultId!==undefined}'));
 assert.ok(branch.includes('data-inventory-art="native-result-unavailable"'));
 const preload=app.slice(app.indexOf('const resultId=nativeResultIconTarget(row.itemId,snapshot.version)'),app.indexOf('if(inventoryNativeArt?.entries.has(row.itemId)'));
 assert.ok(preload.includes('if(resultId!==undefined)')&&preload.includes('continue;'));
});

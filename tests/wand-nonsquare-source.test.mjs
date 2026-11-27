import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=new URL('../public/dynamic-wand-art/candidate-source/',import.meta.url);
const read=name=>readFileSync(new URL(name,root));
const sha=b=>createHash('sha256').update(b).digest('hex');
const raw=read('wand-nonsquare.json'),manifest=JSON.parse(raw);
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/wand-candidate-source.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent',define:{'import.meta.env.BASE_URL':'"/"'}});
const {decodeWandNonSquareSource,WAND_NON_SQUARE_SOURCE_SHA}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
test('all five non-square original UiIcon sources are bound to one lossless sample texture',()=>{
 assert.equal(sha(raw),WAND_NON_SQUARE_SOURCE_SHA);
 assert.equal(WAND_NON_SQUARE_SOURCE_SHA,'950095992ecb78341afb1cf6c5c2afaf16de8b6b365cf66c8fcb66c692d7096a');
 const m=decodeWandNonSquareSource(manifest),image=read(m.texture.file);
 assert.equal(image.length,6226);assert.equal(sha(image),m.texture.sha256);assert.equal(image.toString('ascii',8,16),'WEBPVP8L');
 assert.deepEqual(m.rows.map(r=>[r.itemId,r.spritePathId,...r.logicalSize,r.kind,r.format]),[
  [371479572,'-492977194539706592',439,512,1,3],
  [583339916,'-3372076709754934594',512,511,1,3],
  [803563219,'8567531733894422876',256,235.99998474121094,0,12],
  [1057045178,'3260434580939574635',512,511,1,3],
  [1314269583,'5636951348546939465',512,470,1,3]
 ]);
 const ordinary=JSON.parse(read('index.json'));
 for(const row of m.rows){assert.ok(!Object.hasOwn(ordinary.items,String(row.itemId)));assert.match(row.sourceTextureSha256,/^[a-f0-9]{64}$/);assert.match(row.rgbaSampleSha256,/^[a-f0-9]{64}$/);}
 for(const mutate of [m=>m.rows[0].itemId++,m=>m.rows[0].logicalSize=[512,512],m=>m.rows[0].cell=1,m=>m.rows[0].format=12,m=>m.texture.bytes++,m=>m.rows.pop(),m=>m.scale=.5]){
  const copy=structuredClone(manifest);mutate(copy);assert.throws(()=>decodeWandNonSquareSource(copy));
 }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=new URL('../public/dynamic-wand-art/mip-source/',import.meta.url);
const bytes=readFileSync(new URL('wand-mip-source.json',root)),manifest=JSON.parse(bytes);
const sha=b=>createHash('sha256').update(b).digest('hex');
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/wand-mip-source.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',define:{'import.meta.env.BASE_URL':'"/"'}});
const {decodeWandMipSource,hasWandMipSource,WAND_MIP_SOURCE_SHA}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
test('all 47 original mip sources are pinned and individually addressable',()=>{
 assert.equal(sha(bytes),WAND_MIP_SOURCE_SHA);
 assert.equal(decodeWandMipSource(manifest),manifest);
 assert.equal(manifest.rows.length,47);
 assert.ok(manifest.rows.every(r=>hasWandMipSource(r.itemId)));
 assert.equal(hasWandMipSource(0),false);
 const webp=readFileSync(new URL(manifest.texture.file,root));
 assert.equal(webp.length,manifest.texture.bytes);
 assert.equal(sha(webp),manifest.texture.sha256);
 const candidate=JSON.parse(readFileSync(new URL('../candidate-source/index.json',root)));
 assert.ok(manifest.rows.every(r=>!candidate.items[String(r.itemId)]&&!candidate.sprites.some(s=>s[0]===r.spritePathId)));
 for(const change of [m=>m.mipLevel=0,m=>m.rows[0].cell=1,m=>m.rows[0].spritePathId=m.rows[1].spritePathId,m=>m.rows.pop()]){
  const m=structuredClone(manifest);change(m);assert.throws(()=>decodeWandMipSource(m),/WAND_MIP/);
 }
});

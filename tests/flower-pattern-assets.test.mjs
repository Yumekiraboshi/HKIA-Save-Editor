import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/flower-pattern-assets.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {resolveFlowerPatternTexture,loadFlowerPatternTextureManifest}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const data=JSON.parse(readFileSync(new URL('../data/flower-pattern-source-index-v3.0.1.json',import.meta.url)));
test('native flower pattern index covers all 16 definitions and source bundles',()=>{
 const native=JSON.parse(readFileSync(new URL('../core/data/inventory-flower-definitions-v3.0.1.json',import.meta.url)));
 assert.equal(data.definitionsSha256,native.sha256);
 assert.deepEqual(data.patterns.map(r=>r[0]),native.patterns.map(r=>r.index).sort((a,b)=>a-b));
 assert.equal(data.patterns.reduce((n,r)=>n+r[2],0),218);
 assert.equal(data.bundles.length,14);
 assert.equal(data.bundles.reduce((n,r)=>n+r[1],0),77);
 assert.equal(data.bundles.reduce((n,r)=>n+r[2],0),17174204);
 assert.equal(data.duplicateOverride.rows.length,2);
 assert.deepEqual(data.duplicateOverride.rows.map(r=>r.slice(3)),[[0,1],[1,0]]);
 for(const row of data.bundles)assert.match(row[3],/^[a-f0-9]{64}$/);
});
test('blank textures with identical bytes retain original GUID-specific sampler and color space',()=>{
 const common={width:2,height:2,format:4,bytes:20,sha256:'9a8dcd3f9ff7aa3114e141f03c12989d363ea81fd74c02eea63c5f41489cb17a',mips:[[2,2,0,16,'5ac6a5945f16500911219129984ba8b387a06f24fe383ce4e81a73294065461b'],[1,1,16,4,'ad95131bc0b799c0b1af477fb14fcf26a6a9f76079e48bf090acb7e8367bfd0e']]};
 const a='158d4e21a7b5f474b93295b94b43ad54',b='507ffd4fc696e458c96231e026f49923';
 const manifest=new Map([[a,{...common,colorSpace:0,sampler:[1,2,0,0,0,0]}],[b,{...common,colorSpace:1,sampler:[1,0,0,0,0,0]}]]);
 assert.equal(resolveFlowerPatternTexture(manifest,a).colorSpace,0);
 assert.equal(resolveFlowerPatternTexture(manifest,b).colorSpace,1);
 assert.notDeepEqual(resolveFlowerPatternTexture(manifest,a).sampler,resolveFlowerPatternTexture(manifest,b).sampler);
 assert.throws(()=>resolveFlowerPatternTexture(manifest,'0'.repeat(32)),/MISSING/);
 assert.throws(()=>resolveFlowerPatternTexture(manifest,'../texture'),/GUID/);
});
test('runtime manifest cannot accept arbitrary bytes',async()=>{
 await assert.rejects(loadFlowerPatternTextureManifest(new ArrayBuffer(0)),/SIZE/);
 await assert.rejects(loadFlowerPatternTextureManifest(new ArrayBuffer(79838)),/HASH/);
});

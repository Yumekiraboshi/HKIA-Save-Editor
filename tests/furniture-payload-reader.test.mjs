import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {furniturePayloadPlan,packFurniturePayloads} from '../scripts/pack-furniture-native-payloads.mjs';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/furniture-payload-reader.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {createFurniturePayloadReader}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const data=Uint8Array.of(1,2,3,4),ref={kind:'geometry',sha256:sha(data),bytes:data.length};
const root=new URL('https://example.test/editor/furniture/');
test('verified reads coalesce, reuse immutable bytes and use only fixed source URLs',async()=>{
 const calls=[];
 const reader=createFurniturePayloadReader(root,[ref],async(url,opts)=>{calls.push([String(url),opts]);return new Response(data);});
 const [a,b]=await Promise.all([reader(ref),reader(ref)]);
 assert.equal(calls.length,1);assert.equal(calls[0][0],root.href+'geometry/'+ref.sha256+'.bin');
 assert.equal(calls[0][1].credentials,'omit');assert.equal(calls[0][1].redirect,'error');
 new Uint8Array(a)[0]=99;
 assert.deepEqual(new Uint8Array(b),data);assert.deepEqual(new Uint8Array(await reader(ref)),data);
 assert.equal(calls.length,1);
 for(const bad of [{...ref,bytes:5},{...ref,kind:'../texture'},{...ref,sha256:'0'.repeat(64)}])await assert.rejects(reader(bad),/UNKNOWN/);
 assert.equal(calls.length,1);
 assert.throws(()=>createFurniturePayloadReader(root,[ref,{...ref,bytes:5}]),/INDEX/);
 assert.throws(()=>createFurniturePayloadReader(new URL('https://example.test/editor/?x=1'),[ref]),/ROOT/);
});
test('overlong, truncated and corrupt source bytes reject and retry without poisoning cache',async()=>{
 const replies=[new Response(Uint8Array.of(1,2,3,4,5)),new Response(Uint8Array.of(1,2,3)),new Response(Uint8Array.of(9,2,3,4)),new Response(data)];
 const reader=createFurniturePayloadReader(root,[ref],async()=>replies.shift());
 await assert.rejects(reader(ref),/LENGTH/);await assert.rejects(reader(ref),/LENGTH/);await assert.rejects(reader(ref),/HASH/);
 assert.deepEqual(new Uint8Array(await reader(ref)),data);assert.equal(replies.length,0);
});
test('source pack includes existing geometry, base, pattern and cube receipts',()=>{
 const plan=furniturePayloadPlan('/stage','/patterns');
 assert.equal(plan.filter(x=>x.kind==='geometry').length,4);
 assert.equal(plan.filter(x=>x.kind==='texture').length,25);
 assert.equal(plan.filter(x=>x.kind==='cube').length,2);
 assert.ok(plan.some(x=>x.sha256==='61dc9dd44080824cccfd2966032eb21db1ada7d141418a4a590e0e58cc7c0810'));
});
test('packer copies only hash-matching bytes, deduplicates and leaves no partial output',()=>{
 const dir=mkdtempSync(join(tmpdir(),'hkia-furniture-pack-'));
 try{
  const path=join(dir,'original.bin');writeFileSync(path,data);
  const out=join(dir,'pack');
  const row={...ref,path};
  assert.deepEqual(packFurniturePayloads([row,row],out),{payloads:1,bytes:4});
  assert.deepEqual(readFileSync(join(out,'geometry',ref.sha256+'.bin')),Buffer.from(data));
  const index=JSON.parse(readFileSync(join(out,'index.json'),'utf8'));assert.deepEqual(index.payloads,[ref]);
  assert.throws(()=>packFurniturePayloads([row],out),/OUTPUT_EXISTS/);
  writeFileSync(path,Uint8Array.of(9,2,3,4));
  const bad=join(dir,'bad');assert.throws(()=>packFurniturePayloads([row],bad),/SOURCE_HASH/);assert.equal(existsSync(bad),false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

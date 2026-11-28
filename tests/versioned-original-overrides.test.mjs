import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/versioned-original-overrides.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {decodeCandidateOriginalOverrides,decodeOriginalOverrideZip,createVersionedOriginalOverrideProvider}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const arrayBuffer=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
const source=JSON.parse(readFileSync(new URL('../data/native-override-colorway-packs/index.json',import.meta.url)));
const sourcePack=source.packs[0],zip=readFileSync(new URL('../data/native-override-colorway-packs/'+sourcePack.file,import.meta.url));
const version='9.1.0',file='override-000.zip';
function fixture(){
 const records=Object.fromEntries(Object.entries(source.records).filter(([,r])=>r.pack===sourcePack.file).map(([k,r])=>[k,{
  file:r.file,sha256:r.sha256,pack:file,binding:{itemId:Number(k),itemKey:r.itemKey,assetGuid:r.assetGuid,serializedGuidBytes:Number(k).toString(16).padStart(32,'0')}
 }]));
 const ids=Object.keys(records).map(Number);
 const index={schema:'HKIA.OriginalOverridePackCandidate.1',packs:[{file,sha256:sha(zip),bytes:zip.length,count:ids.length}],records};
 const rawIndex=Buffer.from(JSON.stringify(index));
 const receipt={schema:'HKIA.IconReleaseCandidate.1',approval:'review-required',version,automaticReleaseActivationAuthorized:false,definitionCount:ids.length,completedOverrideCount:ids.length,
 routes:ids.map(itemId=>({itemId,kind:'original-override',sourceBlockers:[]})),
 outputFiles:{['original-override-packs/'+file]:{sha256:sha(zip),bytes:zip.length},'original-override-packs/index.json':{sha256:sha(rawIndex),bytes:rawIndex.length}}};
 const rawReceipt=Buffer.from(JSON.stringify(receipt)),pin={version,receiptFileSha256:sha(rawReceipt)};
 return {index,receipt,rawIndex,rawReceipt,pin,ids};
}
test('candidate original override descriptors close the exact pack and native item identity partition',()=>{
 const f=fixture(),decoded=decodeCandidateOriginalOverrides(f.receipt,f.index,f.pin);
 assert.equal(decoded.entries.size,sourcePack.count);assert.equal(decoded.packs.size,1);
 for(const mutate of [
  f=>{f.receipt.version='9.2.0'},f=>{f.index.packs[0].count--},
  f=>{f.index.records[f.ids[0]].binding.itemId=f.ids[1]},
  f=>{f.index.records[f.ids[0]].binding.assetGuid=f.index.records[f.ids[1]].binding.assetGuid},
  f=>{f.index.records[f.ids[0]].file='../x.webp'},
  f=>{delete f.index.records[f.ids[0]]},f=>{f.receipt.outputFiles['original-override-packs/other.zip']={bytes:10,sha256:'a'.repeat(64)}}
 ]){const f=fixture();mutate(f);assert.throws(()=>decodeCandidateOriginalOverrides(f.receipt,f.index,f.pin),/ORIGINAL_OVERRIDE_CANDIDATE_INVALID/);}
});
test('verified native WebPs are lazily fetched once per pack, with retry and no version fallback',async()=>{
 const f=fixture(),originalFetch=globalThis.fetch,requests=[];let corrupt=true;
 globalThis.fetch=async url=>{
  requests.push(url);
  if(url==='/candidate/release-candidate.json')return new Response(f.rawReceipt);
  if(url==='/candidate/original-override-packs/index.json')return new Response(f.rawIndex);
  assert.equal(url,'/candidate/original-override-packs/'+file);
  if(corrupt){const b=Buffer.from(zip);b[100]^=1;return new Response(b);}
  return new Response(zip);
 };
 try{
  const load=createVersionedOriginalOverrideProvider('/candidate/',f.pin);
  assert.equal(await load(f.ids[0],'9.2.0'),null);assert.equal(requests.length,0);
  assert.equal(await load(2147483647,version),null);assert.equal(requests.length,2);
  assert.equal(await load(f.ids[0],version),null);corrupt=false;
  const [a,b]=await Promise.all([load(f.ids[0],version),load(f.ids[1],version)]);
  assert.ok(a instanceof Blob&&b instanceof Blob);assert.equal(sha(Buffer.from(await a.arrayBuffer())),f.index.records[f.ids[0]].sha256);
  assert.equal(await load(f.ids[0],version),a);assert.equal(requests.length,4);
  const p=decodeCandidateOriginalOverrides(f.receipt,f.index,f.pin).packs.get(file);
  p.entries.set(f.ids[0],{...p.entries.get(f.ids[0]),sha256:'a'.repeat(64)});
  await assert.rejects(decodeOriginalOverrideZip(arrayBuffer(zip),p),/ORIGINAL_OVERRIDE_CANDIDATE_INVALID/);
 }finally{globalThis.fetch=originalFetch;}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root=new URL('../public/item-packs/',import.meta.url);
const catalog=JSON.parse(readFileSync(new URL('../public/catalog.json',import.meta.url),'utf8'));
function parseStoredZip(buffer){
 let offset=0;const files=new Map();
 while(offset+4<=buffer.length&&buffer.readUInt32LE(offset)===0x04034b50){
  assert.ok(offset+30<=buffer.length);
  const flags=buffer.readUInt16LE(offset+6),method=buffer.readUInt16LE(offset+8);
  const packed=buffer.readUInt32LE(offset+18),unpacked=buffer.readUInt32LE(offset+22);
  const namesize=buffer.readUInt16LE(offset+26),extra=buffer.readUInt16LE(offset+28);
  const start=offset+30+namesize+extra;
  assert.equal(flags&8,0);assert.equal(method,0);assert.equal(packed,unpacked);
  const name=buffer.toString('utf8',offset+30,offset+30+namesize);
  assert.ok(start+packed<=buffer.length);
  assert.ok(!files.has(name));
  files.set(name,buffer.subarray(start,start+packed));
  offset=start+packed;
 }
 return files;
}
test('all collection groups ship genuine mapped item thumbnails in lazy ZIP packs',()=>{
 const byGroup=new Map();
 for(const item of catalog.items){if(!byGroup.has(item[3]))byGroup.set(item[3],new Set);byGroup.get(item[3]).add(item[0])}
 let checked=0;
 for(const group of catalog.groups){
  const name=group[0];const num=name==='collections_group_events'?6:1;
  const sheets=new Map;let index=null;
  for(let i=0;i<num;i++){
   const p=new URL(name+(i?'-'+i:'')+'.zip',root);
   assert.ok(existsSync(p),name);
   const zip=parseStoredZip(readFileSync(p));
   if(i===0){assert.ok(zip.has('index.json'));index=JSON.parse(zip.get('index.json'))}
   else assert.ok(!zip.has('index.json'));
   for(const [key,data] of zip){
    if(!key.endsWith('.webp'))continue;
    assert.equal(data.toString('ascii',0,4),'RIFF');
    assert.equal(data.toString('ascii',8,12),'WEBP');
    assert.ok(!sheets.has(key),'duplicate sheet '+key);
    sheets.set(key,data);
   }
  }
  assert.equal(index.schema,'HKIA.SheetIcons.1');
  assert.equal(index.group,name);
  assert.equal(index.size,96);
  assert.equal(index.columns,12);
  const ids=new Set;
  for(const [id,sheet,cell] of index.records){
   assert.ok(byGroup.get(name).has(id),name+' unexpected item '+id);
   assert.ok(!ids.has(id));ids.add(id);
   assert.ok(Number.isInteger(cell)&&cell>=0&&cell<144);
   assert.ok(sheets.has('sheet-'+String(sheet).padStart(3,'0')+'.webp'));
   checked++;
  }
  assert.equal(ids.size,byGroup.get(name).size,name+' missing item image');
 }
 assert.equal(checked,catalog.items.length);
});
test('all item icons are local assets; no external requests',()=>{
 const c=readFileSync(new URL('../src/icon-packs.ts',import.meta.url),'utf8');
 assert.ok(c.includes("fetch(base+'item-packs/'"));
 assert.match(c,/URL\.revokeObjectURL/);
 assert.doesNotMatch(c,/raw\.githubusercontent\.com/);
});

const pinned=JSON.parse(readFileSync(new URL('../data/collection-icon-pack-digests-v3.0.1.json',import.meta.url),'utf8'));
test('all thirty deployed original image archives match the pinned Git blob bytes',()=>{
 assert.equal(pinned.schema,'HKIA.CollectionIconPackGitBlob.1');
 assert.equal(pinned.rows.length,30);
 assert.deepEqual(pinned.rows.map(r=>r[0]).sort(),readdirSync(root).filter(n=>n.endsWith('.zip')).sort());
 for(const [name,size,sha] of pinned.rows){
  const data=readFileSync(new URL(name,root));
  assert.equal(data.length,size,name);
  assert.equal(createHash('sha1').update('blob '+size+'\0').update(data).digest('hex'),sha,name);
 }
});
test('browser pack verification rejects modified, truncated and unregistered ZIP bytes before parsing',async()=>{
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/icon-packs.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});
 const {verifyIconPackBytes,loadIconPack}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
 const name='collection_group_fishalmanacs.zip',data=readFileSync(new URL(name,root));
 const bytes=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
 await verifyIconPackBytes(name,bytes);
 const broken=bytes.slice(0);new Uint8Array(broken)[100]^=1;
 await assert.rejects(verifyIconPackBytes(name,broken),/ICON_PACK_SOURCE_HASH/);
 await assert.rejects(verifyIconPackBytes(name,bytes.slice(0,-1)),/ICON_PACK_SOURCE_SIZE/);
 await assert.rejects(verifyIconPackBytes('other.zip',bytes),/ICON_PACK_SOURCE_SIZE/);
 const fetchBefore=globalThis.fetch,create=URL.createObjectURL,revoke=URL.revokeObjectURL;
 let requested=[],created=[],revoked=[],valid=false;
 globalThis.fetch=async url=>{requested.push(url);return new Response(valid?bytes:broken);};
 URL.createObjectURL=blob=>{created.push(blob);return 'blob:verified-'+created.length;};
 URL.revokeObjectURL=url=>revoked.push(url);
 try{
  await assert.rejects(loadIconPack('collection_group_fishalmanacs','/'),/ICON_PACK_SOURCE_HASH/);
  assert.equal(created.length,0);
  valid=true;const pack=await loadIconPack('collection_group_fishalmanacs','/');
  assert.ok(Object.keys(pack.entries).length>0);assert.ok(created.length>0);
  pack.dispose();assert.equal(revoked.length,created.length);
  assert.equal(requested.length,2);
 }finally{globalThis.fetch=fetchBefore;URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
});

test('versioned collection transport reuses real multipart ZIPs with explicit candidate file identity',async()=>{
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/icon-packs.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});
 const {decodeCandidateCollectionPacks,createVersionedCollectionPackLoader}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
 const group='collections_group_events',version='9.1.0',parts=new Map();
 const sha=data=>createHash('sha256').update(data).digest('hex');
 const receipt={schema:'HKIA.IconReleaseCandidate.1',version,approval:'review-required',automaticReleaseActivationAuthorized:false,
  collectionPackParts:{[group]:6},collectionPackDigests:[],outputFiles:{}};
 for(let i=0;i<6;i++){
  const file=group+(i?'-'+i:'')+'.zip',data=readFileSync(new URL(file,root));
  parts.set(file,data);receipt.outputFiles['item-packs/'+file]={bytes:data.length,sha256:sha(data)};
  receipt.collectionPackDigests.push([file,data.length,createHash('sha1').update('blob '+data.length+'\0').update(data).digest('hex')]);
 }
 const bytes=Buffer.from(JSON.stringify(receipt)),pin={version,receiptFileSha256:sha(bytes)};
 assert.equal(decodeCandidateCollectionPacks(receipt,pin).get(group).length,6);
 for(const mutate of [
  v=>{v.version='9.2.0'},v=>{v.collectionPackParts[group]=5},
  v=>{v.collectionPackDigests.pop()},v=>{v.collectionPackDigests.push(v.collectionPackDigests[0])},
  v=>{v.outputFiles['item-packs/'+group+'.zip'].bytes=0},
  v=>{v.outputFiles['item-packs/other.zip']={bytes:1,sha256:'a'.repeat(64)}}
 ]){const v=structuredClone(receipt);mutate(v);assert.throws(()=>decodeCandidateCollectionPacks(v,pin),/ICON_CANDIDATE_INVALID/);}
 const originalFetch=globalThis.fetch;const requested=[];let corruptReceipt=true,corruptPack=false;
 globalThis.fetch=async url=>{
  requested.push(url);
  if(url==='/candidate/release-candidate.json')return new Response(corruptReceipt?Buffer.from('{}'):bytes);
  const data=parts.get(url.slice('/candidate/item-packs/'.length));
  assert.ok(data);
  if(corruptPack&&url.endsWith(group+'.zip')){const broken=Buffer.from(data);broken[100]^=1;return new Response(broken);}
  return new Response(data);
 };
 try{
  const load=createVersionedCollectionPackLoader('/candidate/',pin);
  await assert.rejects(load(group,'9.2.0'),/ICON_CANDIDATE_INVALID/);assert.equal(requested.length,0);
  await assert.rejects(load(group,version),/DYNAMIC_ART_HASH/);assert.equal(requested.length,1);
  corruptReceipt=false;await assert.rejects(load('other',version),/ICON_CANDIDATE_INVALID/);assert.equal(requested.length,2);
  corruptPack=true;await assert.rejects(load(group,version),/DYNAMIC_ART_HASH/);
  corruptPack=false;const pack=await load(group,version);
  try{assert.deepEqual(Object.keys(pack.entries).map(Number).sort((a,b)=>a-b),catalog.items.filter(x=>x[3]===group).map(x=>x[0]).sort((a,b)=>a-b));}
  finally{pack.dispose();}
 }finally{globalThis.fetch=originalFetch;}
});

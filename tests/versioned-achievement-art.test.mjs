import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/versioned-achievement-art.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {decodeVersionedAchievementArt,resolveAchievementArtSource,createVersionedAchievementArt}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const read=f=>readFileSync(new URL('../public/'+f,import.meta.url));
const json=f=>JSON.parse(read(f));
const sha=b=>createHash('sha256').update(b).digest('hex');
const version='9.1.0',original=json('achievement-index.json'),groups=json('achievement-groups.json');
const index=new Map(original.records.map(([guid,key,titleId])=>[guid,{key,titleId}]));
const hierarchy={groups:groups.groups.map(([guid,children])=>({guid,children})),byGuid:new Map(groups.groups.map(([guid,children])=>[guid,{guid,children}])),owner:new Map(groups.groups.flatMap(([guid,children])=>children.map(c=>[c,guid])))};
function fixture(){
 const files=new Map(),pages=[],byKey=new Map();
 for(const [kind,field] of [['category','categories'],['individual','icons']]){
  const name='achievement-'+kind+'-atlas',m=json(name+'.json'),file=name+'.webp',bytes=read(file);
  assert.equal(sha(bytes),m.atlasSha256);files.set(file,bytes);
  pages.push({file,sha256:sha(bytes),bytes:bytes.length,...m.layout});
  for(const c of m[field])byKey.set(c.sourceKey,{kind:'sprite',sourceGuid:c.sourceGuid,sourceBundleSha256:original.sourceSha256,spritePathId:c.spritePathId,sourceSha256:c.sourceSha256,page:file,cell:c.index});
 }
 const rows=[...index].map(([saveGuid,r])=>({saveGuid,sourceKey:r.key,parent:hierarchy.owner.get(saveGuid)??null,icon:byKey.get(r.key)??{kind:'null'}}));
 const v={schema:'HKIA.AchievementArtCandidate.1',version,platform:'steam',definitionsSha256:original.sourceSha256,reviewedRouting:'native-local-achievement-direct-parent-v1',automaticReleaseActivationAuthorized:false,definitionCount:rows.length,nativeNullCount:559,unresolvedCount:0,pages,rows};
 return {v,files,pin:{version,platform:'steam',definitionsSha256:original.sourceSha256,manifestFileSha256:sha(JSON.stringify(v))}};
}
test('all original achievement category, individual and null source routes remain distinct',()=>{
 const f=fixture(),c=decodeVersionedAchievementArt(f.v,f.pin,index,hierarchy);
 let groups=0,own=0,none=0;
 for(const [guid,r] of c.rows){
  const list=resolveAchievementArtSource(c,guid,false),detail=resolveAchievementArtSource(c,guid,true);
  if(r.icon.kind==='null'){none++;assert.equal(list,null);assert.equal(detail.fidelity,'direct-parent');assert.equal(detail.row.saveGuid,r.parent);}
  else{assert.equal(list.fidelity,'original');assert.equal(detail.row.saveGuid,guid);if(r.parent===null)groups++;else own++;}
 }
 assert.deepEqual([groups,own,none],[63,198,559]);
 for(const mutate of [
  v=>{v.version='9.2.0'},v=>{v.rows.pop()},v=>{v.rows[0].sourceKey=v.rows[1].sourceKey},
  v=>{v.nativeNullCount--},v=>{v.rows.find(r=>r.parent!==null).parent=null},
  v=>{v.rows.find(r=>r.icon.kind==='sprite').icon.cell=99999},
  v=>{v.rows.find(r=>r.icon.kind==='null').icon.spritePathId='1'}
 ]){const f=fixture();mutate(f.v);assert.throws(()=>decodeVersionedAchievementArt(f.v,f.pin,index,hierarchy),/ACHIEVEMENT_ART_CANDIDATE_INVALID/);}
});
test('non-null but unresolved native icon never inherits its parent',()=>{
 const f=fixture(),r=f.v.rows.find(r=>r.parent!==null&&r.icon.kind==='sprite');
 r.icon={kind:'unresolved',sourceGuid:r.icon.sourceGuid,fileId:1,spritePathId:r.icon.spritePathId};f.v.unresolvedCount++;
 const c=decodeVersionedAchievementArt(f.v,f.pin,index,hierarchy);
 assert.equal(resolveAchievementArtSource(c,r.saveGuid,true),null);
});
test('version-pinned atlas delivery is lazy and retries independently of native null identity',async()=>{
 const f=fixture(),raw=Buffer.from(JSON.stringify(f.v)),old=globalThis.fetch,requests=[],released=[];let fail=true,failManifest=true;
 const none=f.v.rows.find(r=>r.icon.kind==='null'),own=f.v.rows.find(r=>r.parent!==null&&r.icon.kind==='sprite');
 globalThis.fetch=async url=>{
  requests.push(url);
  if(url==='/candidate/achievement-art.json')return new Response(failManifest?Buffer.from('{}'):raw);
  const file=url.slice('/candidate/'.length),bytes=f.files.get(file);assert.ok(bytes);
  return new Response(fail&&file.includes('individual')?Buffer.from('bad'):bytes);
 };
 const art=createVersionedAchievementArt('/candidate/',f.pin,index,hierarchy,{decodePage:async(data,p)=>({url:'blob:'+p.file,dispose(){released.push(p.file);}})});
 try{
  assert.equal(await art.artwork(none.saveGuid,'9.2.0',true),null);assert.equal(requests.length,0);
  assert.equal(await art.artwork(none.saveGuid,version,true),null);assert.equal(requests.length,1);failManifest=false;
  assert.equal(await art.artwork(none.saveGuid,version,false),null);assert.equal(requests.length,2);
  assert.equal(await art.artwork(own.saveGuid,version,true),null);
  const parent=await art.artwork(none.saveGuid,version,true);assert.equal(parent.sourceSaveGuid,none.parent);assert.equal(parent.fidelity,'direct-parent');
  fail=false;assert.equal((await art.artwork(own.saveGuid,version,true)).fidelity,'original');
  assert.equal(requests.filter(x=>x.includes('individual')).length,2);assert.equal(requests.filter(x=>x.includes('category')).length,1);
  art.dispose();await new Promise(setImmediate);assert.equal(released.length,2);
  assert.equal(await art.artwork(none.saveGuid,version,true),null);
 }finally{art.dispose();globalThis.fetch=old;}
});

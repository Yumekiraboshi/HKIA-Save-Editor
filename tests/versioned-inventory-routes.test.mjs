import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/versioned-inventory-routes.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {decodeInventoryRouteCandidate,createVersionedInventoryArtwork,createVersionedPlaceholderProvider}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const version='9.1.0';
const row=(itemId,kind,sourceBlockers=[],targetItemId)=>({itemId,kind,sourceBlockers,...(targetItemId===undefined?{}:{targetItemId})});
const fixture=()=>({schema:'HKIA.IconReleaseCandidate.1',version,approval:'review-required',automaticReleaseActivationAuthorized:false,
 definitionCount:13,routes:[
 row(1,'original-base'),row(2,'original-override'),row(3,'source-placeholder'),row(4,'native-result',[],2),
 row(5,'flower'),row(6,'cafe'),row(7,'boba'),row(8,'wand'),row(9,'palette'),
 row(10,'original-override',['missing-original-override']),row(11,'native-result',['missing-original-override'],10),
 row(12,'unknown',['unknown-dynamic-family']),row(13,'native-result',['unreviewed-dynamic-result-target'],5)],
 nativeResultRoutes:[[4,2],[11,10],[13,5]],unresolvedInventorySourceItemIds:[10,11,12,13]});
const sha=b=>createHash('sha256').update(b).digest('hex');
const pin=v=>({version,receiptFileSha256:sha(JSON.stringify(v))});
test('candidate route census proves complete result and unresolved partitions',()=>{
 const v=fixture();assert.equal(decodeInventoryRouteCandidate(v,pin(v)).size,13);
 for(const mutate of [
  x=>{x.version='9.2.0'},x=>{x.definitionCount++},x=>{x.routes[1].itemId=1},
  x=>{x.routes[3].targetItemId=4},x=>{x.nativeResultRoutes.pop()},
  x=>{x.routes[3].targetItemId=11;x.nativeResultRoutes[0][1]=11},
  x=>{x.unresolvedInventorySourceItemIds.pop()},x=>{x.routes[10].sourceBlockers=[];x.unresolvedInventorySourceItemIds.splice(1,1)},
  x=>{x.routes[12].sourceBlockers=[];x.unresolvedInventorySourceItemIds.pop()},
  x=>{x.routes[11].sourceBlockers=[];x.unresolvedInventorySourceItemIds.splice(2,1)}
 ]){const v=fixture();mutate(v);assert.throws(()=>decodeInventoryRouteCandidate(v,pin(v)),/INVENTORY_ROUTE_CANDIDATE_INVALID/);}
});
test('all supported artwork routes use same-release sources with no fallback substitution',async()=>{
 const v=fixture(),bytes=Buffer.from(JSON.stringify(v)),calls=[];
 let reads=0,missingOverride=false;
 const provider=kind=>async(id,ver,value)=>{calls.push([kind,id,ver,value]);return kind==='override'&&missingOverride?null:new Blob([kind+id]);};
 const providers={base:provider('base'),override:provider('override'),placeholder:provider('placeholder'),family:{
 original:provider('original'),flower:provider('flower'),chef:provider('chef'),wand:provider('wand'),palette:provider('palette')}};
 const load=async(root,file,hash)=>{assert.equal(root,'/candidate/');assert.equal(file,'release-candidate.json');assert.equal(hash,pin(v).receiptFileSha256);if(++reads===1)throw Error('offline');return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);};
 const render=createVersionedInventoryArtwork('/candidate/',pin(v),providers,load);
 assert.equal(await render(1,'9.2.0'),null);assert.equal(reads,0);
 assert.equal(await render(1,version),null);
 const base=await render(1,version);assert.equal(base.fidelity,'original');assert.equal(base.sourceItemId,1);
 assert.equal((await render(2,version)).kind,'original-override');
 assert.equal((await render(3,version)).fidelity,'source-placeholder');
 const recipe=await render(4,version);assert.equal(recipe.itemId,4);assert.equal(recipe.sourceItemId,2);
 assert.equal((await render(5,version)).fidelity,'original-base-only');
 for(const [id,kind] of [[5,'flower'],[6,'cafe'],[7,'boba'],[8,'wand'],[9,'palette']]){
  const value={test:id};const art=await render(id,version,{kind,value});assert.equal(art.kind,kind);assert.equal(art.fidelity,'dynamic');assert.deepEqual(calls.at(-1).slice(2),[version,value]);
 }
 const count=calls.length;
 for(const id of [10,11,12,13,999])assert.equal(await render(id,version),null);
 assert.equal(await render(5,version,{kind:'wand',value:{}}),null);assert.equal(calls.length,count);
 missingOverride=true;assert.equal(await render(4,version),null);
 assert.deepEqual(calls.at(-1).slice(0,3),['override',2,version]);assert.equal(reads,2);
});

test('native placeholder source uses exact receipt and asset pins, shares aliases and retries failed delivery',async()=>{
 const v=fixture();v.routes[0]=row(1,'source-placeholder');v.nativePlaceholderItemIds=[1,3];v.placeholderCount=2;
 // A real lossless WebP header is enough to exercise byte delivery here;
 // no assertion of game-image equivalence is made by this synthetic test.
 const data=Buffer.from('UklGRiIAAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=','base64');
 const hash=sha(data),file=hash+'.webp',r={file,sha256:hash,spritePathId:'-123'};
 const manifest=Buffer.from(JSON.stringify({records:{1:r,3:r}}));
 v.outputFiles={'original-placeholder-art/index.json':{sha256:sha(manifest),bytes:manifest.length},
  ['original-placeholder-art/'+file]:{sha256:hash,bytes:data.length}};
 const receipt=Buffer.from(JSON.stringify(v)),p=pin(v),old=globalThis.fetch;let requests=[],fail=true;
 globalThis.fetch=async url=>{
  requests.push(url);
  if(url==='/candidate/release-candidate.json')return new Response(receipt);
  if(url==='/candidate/original-placeholder-art/index.json')return new Response(manifest);
  assert.equal(url,'/candidate/original-placeholder-art/'+file);
  return new Response(fail?Buffer.from('bad'):data);
 };
 try{
  const load=createVersionedPlaceholderProvider('/candidate/',p);
  assert.equal(await load(3,'9.2.0'),null);assert.equal(requests.length,0);
  assert.equal(await load(2,version),null);assert.equal(requests.length,2);
  assert.equal(await load(3,version),null);fail=false;
  const [a,b]=await Promise.all([load(1,version),load(3,version)]);
  assert.ok(a instanceof Blob);assert.equal(a,b);assert.equal(requests.length,4);
 }finally{globalThis.fetch=old;}
});

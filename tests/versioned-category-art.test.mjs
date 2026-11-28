import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/versioned-category-art.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {decodeVersionedCategoryArt,createVersionedCategoryArt}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const h=c=>c.repeat(64),sha=b=>createHash('sha256').update(b).digest('hex'),version='9.1.0';
const image=readFileSync(new URL('../public/inventory-ui/pattern-1.webp',import.meta.url));
const scope={collectionKeys:new Set(['collections_group_food','collections_group_fish']),inventoryKeys:new Set(['food','fish','other']),itemIds:new Set([1,2])};
const source={kind:'sprite',asset:{file:sha(image)+'.webp',sha256:sha(image),bytes:image.length,width:54,height:54,mode:'RGBA',pixelSha256:h('f'),conversion:'native-resolution-lossless-webp-v1'},sourceBundleSha256:h('b'),spritePathId:'123',sourceSha256:h('c')};
function fixture(){
 const row=(domain,key,native,representativeItemId=null,collectionFallback=null)=>({domain,key,native,representativeItemId,collectionFallback});
 const v={schema:'HKIA.CategoryArtCandidate.2',artworkPolicy:'native-resolution-lossless-webp-v1',version,platform:'steam',definitionsSha256:h('a'),sourceBundles:{definitions:h('a'),l_inventoryview:h('b')},automaticReleaseActivationAuthorized:false,unresolvedCount:1,
 rows:[row('collection','collections_group_food',{...source}),row('collection','collections_group_fish',{kind:'unresolved'}),row('inventory','food',{...source},1,'collections_group_food'),row('inventory','fish',{...source},2,'collections_group_fish'),row('inventory','other',{kind:'null'})]};
 const raw=Buffer.from(JSON.stringify(v));
 return {v,raw,pin:{version,platform:'steam',definitionsSha256:h('a'),manifestFileSha256:sha(raw)}};
}
test('all reviewed category keys and source asset identities are required',()=>{
 const f=fixture();assert.equal(decodeVersionedCategoryArt(f.v,f.pin,scope).size,5);
 for(const mutate of [v=>v.rows.pop(),v=>v.version='9.2.0',v=>v.rows[2].representativeItemId=999,v=>v.rows[2].collectionFallback='unknown',v=>v.rows[0].representativeItemId=1,v=>v.rows[3].native.sourceBundleSha256=h('d'),v=>v.rows[3].native.sourceSha256=h('e'),v=>v.unresolvedCount=0]){
  const f=fixture();mutate(f.v);assert.throws(()=>decodeVersionedCategoryArt(f.v,f.pin,scope),/CATEGORY_ART_CANDIDATE_INVALID/);
 }
});
test('representative then approved collection fallback then native category image; retry without cross-version fallback',async()=>{
 const f=fixture(),old=globalThis.fetch,requests=[];let rep=true,fail=true;
 globalThis.fetch=async url=>{requests.push(url);if(url==='/category/category-art.json')return new Response(f.raw);
  assert.equal(url,'/category/'+source.asset.file);return new Response(fail?Buffer.from('bad'):image);};
 const service=createVersionedCategoryArt('/category/',f.pin,scope,async(id,v)=>{assert.equal(v,version);return rep&&id===1?new Blob(['representative']):null;});
 try{
  assert.equal(await service.artwork('inventory','food','9.2.0'),null);assert.equal(requests.length,0);
  assert.equal((await service.artwork('inventory','food',version)).source,'representative');assert.equal(requests.length,1);
  rep=false;assert.equal(await service.artwork('inventory','fish',version),null);
  fail=false;const [food,fish,collection]=await Promise.all([service.artwork('inventory','food',version),service.artwork('inventory','fish',version),service.artwork('collection','collections_group_food',version)]);
  assert.equal(food.source,'collection-category');assert.equal(fish.source,'native-category');assert.equal(collection.source,'native-category');assert.equal(food.art,fish.art);assert.equal(sha(Buffer.from(await fish.art.arrayBuffer())),source.asset.sha256);
  assert.equal(requests.length,3);assert.equal(await service.artwork('inventory','other',version),null);
  service.dispose();assert.equal(await service.artwork('inventory','food',version),null);
 }finally{service.dispose();globalThis.fetch=old;}
});
test('category staging uses a complete reviewed native pointer census',()=>{
 const r=spawnSync(process.env.PYTHON??'python3',[fileURLToPath(new URL('../scripts/stage-category-art.py',import.meta.url)),'--self-test'],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr??String(r.error));assert.match(r.stdout,/HKIA_CATEGORY_ART_STAGE_SELF_TEST_OK/);
});

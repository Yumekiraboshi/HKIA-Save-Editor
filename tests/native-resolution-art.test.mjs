import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
async function bundle(path){
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
}
const {rasterizeDynamicSprite,rasterGeometry}=await bundle('../src/dynamic-sprite-raster.ts');
const {encodeDynamicArtPng}=await bundle('../src/dynamic-art-png.ts');
const {verifyNativeWebPHeader,createNativeRasterLoader}=await bundle('../src/native-raster-art.ts');
const {decodeNativeItemArt,createVersionedItemArtService}=await bundle('../src/versioned-item-art-service.ts');
const hash=b=>createHash('sha256').update(b).digest('hex'),h=c=>c.repeat(64);
const raw=readFileSync(new URL('../public/inventory-decorators/plate.webp',import.meta.url));
const original=readFileSync(new URL('../public/inventory-ui/pattern-1.webp',import.meta.url));
const policy='native-resolution-lossless-webp-v1',version='9.1.0';
const arrayBuffer=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
function asset(bytes,width,height){return {file:hash(bytes)+'.webp',sha256:hash(bytes),bytes:bytes.length,width,height,mode:'RGBA',pixelSha256:h('a'),conversion:policy};}
const a=asset(raw,40,40),b=asset(original,54,54);
test('original lossless WebP dimensions and codec are verified independently of CSS size',async()=>{
 verifyNativeWebPHeader(arrayBuffer(raw),a);verifyNativeWebPHeader(arrayBuffer(original),b);
 assert.throws(()=>verifyNativeWebPHeader(arrayBuffer(raw),{...a,width:96}),/INVALID/);
 const bad=Buffer.from(raw);bad.write('VP8 ',12);assert.throws(()=>verifyNativeWebPHeader(arrayBuffer(bad),a),/INVALID/);
 let calls=0;const loader=createNativeRasterLoader('/art/',async()=>{calls++;return arrayBuffer(raw);});
 const [x,y]=await Promise.all([loader.image(a),loader.image(a)]);assert.equal(x,y);assert.equal(calls,1);
 assert.equal(await loader.image(a),x);loader.dispose();await assert.rejects(loader.image(a),/INVALID/);
});
test('dynamic composition and local PNG use the original non-square logical dimensions without normalized padding',async()=>{
 const base={width:2,height:4,rgba:new Uint8ClampedArray(32).fill(255)},mask={width:1,height:1,rgba:new Uint8ClampedArray([0,0,0,255])};
 const common={base,mask,baseRect:[0,0,2,2],maskRect:[0,0,1,1],alphaOffsetY:2,tints:[[1,1,1,1],[1,1,1,1],[1,1,1,1]]};
 for(const [w,height] of [[128,256],[256,256],[512,137]]){
  const input={...common,logicalSize:w,logicalHeight:height,trim:[0,0,w,height],resolution:'native'};
  const g=rasterGeometry(input);assert.deepEqual([g.width,g.height,g.left,g.top],[w,height,0,0]);
  const pixels=rasterizeDynamicSprite(input);assert.equal(pixels.length,w*height*4);
  assert.deepEqual([...pixels.slice(0,4)],[255,255,255,255]);
  assert.deepEqual([...pixels.slice(-4)],[255,255,255,255]);
  const png=Buffer.from(await (await encodeDynamicArtPng(pixels,w,height)).arrayBuffer());
  assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[w,height]);
 }
 assert.equal(rasterizeDynamicSprite({...common,logicalSize:2,trim:[0,0,2,2]}).length,96*96*4);
});
function fixture(){
 const own=[[1,'original-base',false],[2,'original-base',false],[3,'original-override',false],[4,'source-placeholder',false]];
 const catalog={schema:'HKIA.CollectionDisplayCatalog.2',version,groups:[['food']],items:[1,2,3,4].map(i=>[i,'item_'+i,0,'food'])};
 const native={schema:'HKIA.NativeResolutionItemArt.1',version,artworkPolicy:policy,assets:{[a.sha256]:a,[b.sha256]:b},base:{1:a.sha256,2:a.sha256,3:a.sha256,4:a.sha256},overrides:{3:b.sha256},collectionOwnRoutes:own};
 const files=new Map(),outputFiles={};
 const add=(path,bytes)=>{files.set('/release/'+path,bytes);outputFiles[path]={bytes:bytes.length,sha256:hash(bytes)};};
 add('native-art/'+a.file,raw);add('native-art/'+b.file,original);add('native-art/index.json',Buffer.from(JSON.stringify(native)));add('collection-catalog.json',Buffer.from(JSON.stringify(catalog)));
 const index=Buffer.from(JSON.stringify({schema:'HKIA.DynamicSourcePageCandidate.1',version,renderer:'guarded-native-rgb-alpha-v1',records:{},pages:[],unresolved:[]}));
 add('dynamic-source-pages/index.json',index);
 const bindings=Buffer.from(JSON.stringify({version,platform:'steam',definitionSnapshotSha256:h('b')}));
 files.set('/bindings/family-bindings.json',bindings);
 const receipt={schema:'HKIA.IconReleaseCandidate.1',version,platform:'steam',snapshotSha256:h('b'),approval:'review-required',automaticReleaseActivationAuthorized:false,
 artworkPolicy:policy,definitionCount:4,completedOverrideCount:1,nativeStaticAssetCount:2,nativeStaticImageBytes:a.bytes+b.bytes,placeholderCount:1,nativePlaceholderItemIds:[4],
 nativeResultRoutes:[[2,3]],unresolvedInventorySourceItemIds:[],collectionOwnRoutes:own,outputFiles,
 routes:[{itemId:1,kind:'original-base',sourceBlockers:[]},{itemId:2,kind:'native-result',targetItemId:3,sourceBlockers:[]},{itemId:3,kind:'original-override',sourceBlockers:[]},{itemId:4,kind:'source-placeholder',sourceBlockers:[]}]};
 const receiptBytes=Buffer.from(JSON.stringify(receipt));files.set('/release/release-candidate.json',receiptBytes);
 const d={version,indexSha256:hash(index),renderer:'guarded-native-rgb-alpha-v1',resolution:'native'};
 const pin={version,receiptFileSha256:hash(receiptBytes),family:{version,bindingsSha256:hash(bindings),dynamic:d,auxiliary:d}};
 return {native,receipt,catalog,pin,files};
}
test('native shared item transport keeps collection identity, recipe result and original placeholders distinct',async()=>{
 const f=fixture(),old=globalThis.fetch,requests=[];let bad=true;
 globalThis.fetch=async url=>{requests.push(url);const bytes=f.files.get(url);assert.ok(bytes,url);return new Response(bad&&url.endsWith(a.file)?Buffer.from('bad'):bytes);};
 const service=createVersionedItemArtService({release:'/release/',bindings:'/bindings/',auxiliary:'/aux/'},f.pin);
 try{
  assert.equal(await service.inventory(1,'9.2.0'),null);assert.equal(requests.length,0);
  assert.equal(await service.collection(1,version),null);bad=false;
  const [one,own,result,placeholder]=await Promise.all([service.collection(1,version),service.collection(2,version),service.inventory(2,version),service.inventory(4,version)]);
  assert.equal(one.art,own.art);assert.equal(own.art,placeholder.art);assert.equal(placeholder.fidelity,'source-placeholder');
  assert.equal(own.sourceItemId,2);assert.equal(result.sourceItemId,3);assert.equal(hash(Buffer.from(await result.art.arrayBuffer())),b.sha256);
  assert.equal(requests.filter(x=>x.endsWith(a.file)).length,2);
  assert.equal(requests.filter(x=>x.endsWith('release-candidate.json')).length,1);
  service.dispose();assert.equal(await service.collection(1,version),null);
 }finally{service.dispose();globalThis.fetch=old;}
 const v=fixture();v.native.artworkPolicy='resized';assert.throws(()=>decodeNativeItemArt(v.receipt,v.native,v.catalog,v.pin),/INVALID/);
});
test('offline native encoding checks exact source pixels and resolution when Pillow is available',t=>{
 const python=process.env.PYTHON??'python3';
 if(spawnSync(python,['-c','from PIL import Image'],{encoding:'utf8'}).status!==0){t.skip('Pillow required for original image generation');return;}
 const run=spawnSync(python,[fileURLToPath(new URL('../scripts/native-raster-webp.py',import.meta.url))],{encoding:'utf8'});
 assert.equal(run.status,0,run.stderr??String(run.error));assert.match(run.stdout,/HKIA_NATIVE_WEBP_SELF_TEST_OK/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/versioned-item-art-service.ts',import.meta.url)),fileURLToPath(new URL('../src/icon-packs.ts',import.meta.url))].slice(0,1),bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {createVersionedItemArtService,decodeNativeItemArt}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const h=c=>c.repeat(64),g=c=>c.repeat(32),version='9.1.0',group='collections_group_test';
const sha=b=>createHash('sha256').update(b).digest('hex');
const json=v=>Buffer.from(JSON.stringify(v));
const rawSheet=readFileSync(new URL('../public/inventory-decorators/plate.webp',import.meta.url));
const original=readFileSync(new URL('../public/inventory-ui/pattern-1.webp',import.meta.url));
const policy='native-resolution-lossless-webp-v1';
function fixture(){
 const files=new Map(),outputFiles={};
 const add=(path,bytes)=>{files.set('/release/'+path,bytes);outputFiles[path]={bytes:bytes.length,sha256:sha(bytes)};return outputFiles[path];};
 const catalog={schema:'HKIA.CollectionDisplayCatalog.2',version,groups:[[group]],items:[1,2,3,4].map(i=>[i,'item_'+i,0,group])};
 add('collection-catalog.json',json(catalog));
 const asset=(bytes,width)=>({file:sha(bytes)+'.webp',sha256:sha(bytes),bytes:bytes.length,width,height:width,mode:'RGBA',pixelSha256:h('a'),conversion:policy});
 const base=asset(rawSheet,40),override=asset(original,54);
 add('native-art/'+base.file,rawSheet);add('native-art/'+override.file,original);
 const own=[[1,'original-base',false],[2,'original-base',false],[3,'original-override',false],[4,'original-base-only',false]];
 const native={schema:'HKIA.NativeResolutionItemArt.1',version,artworkPolicy:policy,assets:{[base.sha256]:base,[override.sha256]:override},
 base:Object.fromEntries([1,2,3,4,5,6].map(i=>[i,base.sha256])),overrides:{3:override.sha256},collectionOwnRoutes:own};
 add('native-art/index.json',json(native));
 const packName=base.file;
 const a={file:'source-'+h('e')+'.webp',sha256:h('e'),rgbSha256:h('f'),width:4,height:8,bytes:100};
 const row={asset:a,texture:h('e'),sampleRect:[1,1,2,2],guardRect:[1,1,2,2],trimTopLeft:[0,0,2,2],logicalSize:2,alphaOffsetY:4,maskColorSpace:'srgb'};
 const renderer='guarded-native-rgb-alpha-v1';
 const d=add('dynamic-source-pages/index.json',json({schema:'HKIA.DynamicSourcePageCandidate.1',version,renderer,pages:[a],records:{'base:4':row,['mask:'+g('d')]:row},unresolved:[]}));
 const aux=json({schema:'HKIA.DynamicSourcePageCandidate.1',version,renderer,pages:[],records:{},unresolved:[]});
 files.set('/aux/index.json',aux);
 const bindings=json({schema:'HKIA.IconFamilyBindingsCandidate.1',version,platform:'steam',definitionSnapshotSha256:h('c'),dynamicIndexSha256:d.sha256,auxiliaryIndexSha256:sha(aux),automaticReleaseActivationAuthorized:false,
 knownCharacteristicIds:[],chefMappedIds:[],chefColors:[],magic:[],flecks:[],flowerColors:[{index:11,rgba:[1,0,0,1]}],flowerPatterns:[],growthItemIds:[],wandTransforms:[],
 rows:[{itemId:4,family:'flower',baseSpritePathId:'4',maskGuid:g('d'),flowerMasks:[{patternIndex:0,maskGuid:g('d')}]}]});
 files.set('/bindings/family-bindings.json',bindings);
 const receipt={schema:'HKIA.IconReleaseCandidate.1',version,platform:'steam',snapshotSha256:h('c'),approval:'review-required',automaticReleaseActivationAuthorized:false,
 sourceBundles:{definitions:h('a'),atlas_global:h('b')},artworkPolicy:policy,nativeStaticAssetCount:2,nativeStaticImageBytes:base.bytes+override.bytes,definitionCount:6,completedOverrideCount:1,placeholderCount:1,
 nativePlaceholderItemIds:[6],nativeResultRoutes:[[2,3]],unresolvedInventorySourceItemIds:[],missingCollectionBaseItemIds:[],
 collectionOwnRoutes:[[1,'original-base',false],[2,'original-base',false],[3,'original-override',false],[4,'original-base-only',false]],
 routes:['original-base','native-result','original-override','flower','original-base','source-placeholder'].map((kind,i)=>({itemId:i+1,kind,sourceBlockers:[],...(i===1?{targetItemId:3}:{})})),outputFiles};
 const receiptBytes=json(receipt);files.set('/release/release-candidate.json',receiptBytes);
 const pin={version,receiptFileSha256:sha(receiptBytes),family:{version,bindingsSha256:sha(bindings),dynamic:{version,indexSha256:d.sha256,renderer,resolution:'native'},auxiliary:{version,indexSha256:sha(aux),renderer,resolution:'native'}}};
 return {files,pin,receipt,catalog,packName,native};
}
test('collection own route table rejects catalog and missing route mismatches',()=>{
 const f=fixture();assert.equal(decodeNativeItemArt(f.receipt,f.native,f.catalog,f.pin).own.size,4);
 for(const mutate of [f=>f.catalog.items.pop(),f=>f.receipt.collectionOwnRoutes.pop(),f=>{f.native.collectionOwnRoutes[0][2]=true},f=>f.catalog.version='9.2.0']){
  const f=fixture();mutate(f);assert.throws(()=>decodeNativeItemArt(f.receipt,f.native,f.catalog,f.pin),/ITEM_ART_RELEASE_INVALID/);
 }
});
test('one shared release selects actual base, override, recipe, placeholder and dynamic image providers',async()=>{
 const f=fixture(),old=globalThis.fetch,requests=[];let corrupt=true;
 globalThis.fetch=async url=>{requests.push(url);const b=f.files.get(url);assert.ok(b,url);return new Response(corrupt&&url.endsWith(f.packName)?Buffer.from('bad'):b);};
 const service=createVersionedItemArtService({release:'/release/',bindings:'/bindings/',auxiliary:'/aux/'},f.pin,{
  loadTexture:async(root,a)=>({width:a.width,height:a.height,rgba:new Uint8ClampedArray(a.width*a.height*4).fill(255)})
 });
 try{
  assert.equal(await service.inventory(1,'9.2.0'),null);assert.equal(requests.length,0);
  assert.equal(await service.collection(1,version),null);corrupt=false;
  const [base,own,recipe]=await Promise.all([service.inventory(1,version),service.collection(2,version),service.inventory(2,version)]);
  assert.equal(base.kind,'original-base');assert.equal(own.sourceItemId,2);assert.equal(recipe.sourceItemId,3);
  assert.equal(recipe.kind,'original-override');assert.equal(sha(Buffer.from(await recipe.art.arrayBuffer())),sha(original));
  assert.equal((await service.collection(3,version)).kind,'original-override');
  assert.equal((await service.collection(4,version)).fidelity,'original-base-only');
  assert.ok((await service.inventory(4,version,{kind:'flower',value:{growState:6,baseColor:11,pattern:0,patternColor:0}})).art instanceof Blob);
  assert.equal((await service.inventory(5,version)).art,base.art);
  assert.equal((await service.inventory(6,version)).fidelity,'source-placeholder');
  assert.equal(requests.filter(x=>x==='/release/release-candidate.json').length,1);
  assert.equal(requests.filter(x=>x.endsWith(f.packName)).length,2);
  service.dispose();assert.equal(await service.collection(1,version),null);
 }finally{service.dispose();globalThis.fetch=old;}
});

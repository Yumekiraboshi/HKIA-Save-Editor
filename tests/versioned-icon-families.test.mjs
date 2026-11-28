import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/versioned-icon-families.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {decodeVersionedFamilyBindings,createVersionedFamilyRenderer}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const h=c=>c.repeat(64),g=c=>c.repeat(32),version='9.1.0';
const pin={version,bindingsSha256:h('a'),dynamic:{version,indexSha256:h('b'),renderer:'guarded-native-rgb-alpha-v1'},auxiliary:{version,indexSha256:h('c'),renderer:'guarded-native-rgb-alpha-v1'}};
const defs={schema:'HKIA.IconFamilyBindingsCandidate.1',version,dynamicIndexSha256:h('b'),auxiliaryIndexSha256:h('c'),automaticReleaseActivationAuthorized:false,
 knownCharacteristicIds:[901,902,903],chefMappedIds:[901],chefColors:[{characteristicId:901,rgba:[1,0,0,1]}],
 magic:[{characteristicId:902,rgba:[0,1,0,1]}],flecks:[{characteristicId:903,rgba:[0,0,1,1]}],
 flowerColors:[{index:11,rgba:[1,0,0,1]}],flowerPatterns:[],growthItemIds:[1],wandTransforms:[{itemId:4,scale:.4,offsetPercent:[0,0],rotation:0}],
 rows:['flower','cafe','palette','wand'].map((family,i)=>({itemId:i+1,family,baseSpritePathId:String(i+1),maskGuid:g('d'),flowerMasks:family==='flower'?[{patternIndex:0,maskGuid:g('d')}]:[]}))};
function pages(routes){
 const asset={file:'source-'+h('e')+'.webp',sha256:h('e'),rgbSha256:h('f'),width:4,height:8,bytes:100};
 return {schema:'HKIA.DynamicSourcePageCandidate.1',version,renderer:'guarded-native-rgb-alpha-v1',pages:[asset],unresolved:[],records:Object.fromEntries(routes.map(k=>[k,{asset,texture:h('e'),sampleRect:[1,1,2,2],guardRect:[1,1,2,2],trimTopLeft:[0,0,2,2],logicalSize:2,alphaOffsetY:4,maskColorSpace:'srgb'}]))};
}
test('family adapter rejects unpinned source identity and unknown color mappings',()=>{
 const b=decodeVersionedFamilyBindings(defs,pin);assert.equal(b.rows.size,4);
 assert.throws(()=>decodeVersionedFamilyBindings({...defs,version:'9.2.0'},pin),/INVALID/);
 assert.throws(()=>decodeVersionedFamilyBindings({...defs,chefColors:[{characteristicId:999,rgba:[0,0,0,1]}]},pin),/INVALID/);
});
test('candidate family sources reuse shared shader and original auxiliary image routes',async()=>{
 let calls=0;
 const load=async(root,file,sha)=>{
  calls++;
  const value=root==='/bindings/'?defs:root==='/dynamic/'?pages(['base:1','base:2','base:3','base:4','mask:'+g('d')]):pages(['growth:1:0','growth:1:7','magic:902']);
  return new TextEncoder().encode(JSON.stringify(value)).buffer;
 };
 const loadTexture=async(root,a)=>({width:a.width,height:a.height,rgba:new Uint8ClampedArray(a.width*a.height*4).fill(255)});
 const f=createVersionedFamilyRenderer({bindings:'/bindings/',dynamic:'/dynamic/',auxiliary:'/aux/'},pin,{load,loadTexture});
 assert.equal(await f.original(1,'9.2.0'),null);assert.equal(calls,0);
 for(const state of [0,1,2,3,4,5,6,7])assert.ok(await f.flower(1,version,{growState:state,baseColor:11,pattern:0,patternColor:0}) instanceof Blob);
 assert.equal(await f.flower(1,version,{growState:6,baseColor:999,pattern:0,patternColor:0}),null);
 assert.ok(await f.chef(2,version,{kind:'cafe',colors:[901]}) instanceof Blob);
 assert.ok(await f.chef(2,version,{kind:'cafe',colors:[902]}) instanceof Blob);
 assert.equal(await f.chef(2,version,{kind:'cafe',colors:[999]}),null);
 assert.ok(await f.palette(3,version,[[1,0,0,1],[0,1,0,1],[0,0,1,1]]) instanceof Blob);
 assert.ok(await f.wand(4,version,{magicCharacteristicId:902,fleckCharacteristicId:903,sourceItemId:0}) instanceof Blob);
 assert.ok(await f.wand(4,version,{magicCharacteristicId:901,fleckCharacteristicId:903,sourceItemId:0}) instanceof Blob);
 assert.equal(await f.wand(4,version,{magicCharacteristicId:999,fleckCharacteristicId:903,sourceItemId:0}),null);
 assert.ok(await f.wand(4,version,{magicCharacteristicId:902,fleckCharacteristicId:903,sourceItemId:1}) instanceof Blob);
 assert.equal(await f.wand(4,version,{magicCharacteristicId:902,fleckCharacteristicId:903,sourceItemId:999}),null);
 assert.equal(calls,3);
});
test('unresolved mapped chef swatch never becomes a neutral tint',async()=>{
 const missing={...defs,chefColors:[]};
 const load=async(root)=>new TextEncoder().encode(JSON.stringify(root==='/bindings/'?missing:pages(['base:2','mask:'+g('d')]))).buffer;
 const loadTexture=async(root,a)=>({width:a.width,height:a.height,rgba:new Uint8ClampedArray(a.width*a.height*4).fill(255)});
 const f=createVersionedFamilyRenderer({bindings:'/bindings/',dynamic:'/dynamic/',auxiliary:'/aux/'},pin,{load,loadTexture});
 assert.equal(await f.chef(2,version,{kind:'cafe',colors:[901]}),null);
 assert.ok(await f.chef(2,version,{kind:'cafe',colors:[902]}) instanceof Blob);
});
test('compiler keeps unavailable swatch mappings distinct from native neutral colors',()=>{
 const result=spawnSync(process.env.PYTHON??'python3',[fileURLToPath(new URL('../scripts/compile-icon-family-bindings.py',import.meta.url)),'--self-test'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr??String(result.error));
 assert.match(result.stdout,/HKIA_ICON_FAMILY_BINDINGS_SELF_TEST_OK/);
});

test('native absent magic overlay is not a missing mapped sprite',async()=>{
 const load=async(root)=>new TextEncoder().encode(JSON.stringify(root==='/bindings/'?defs:root==='/dynamic/'?pages(['base:4','mask:'+g('d')]):pages(['growth:1:0']))).buffer;
 const loadTexture=async(root,a)=>({width:a.width,height:a.height,rgba:new Uint8ClampedArray(a.width*a.height*4).fill(255)});
 const f=createVersionedFamilyRenderer({bindings:'/bindings/',dynamic:'/dynamic/',auxiliary:'/aux/'},pin,{load,loadTexture});
 assert.equal(await f.wand(4,version,{magicCharacteristicId:902,fleckCharacteristicId:903,sourceItemId:0}),null);
 assert.ok(await f.wand(4,version,{magicCharacteristicId:901,fleckCharacteristicId:903,sourceItemId:0}) instanceof Blob);
});
test('same-version original source provider is used if a dynamic base is unavailable',async()=>{
 const load=async(root)=>new TextEncoder().encode(JSON.stringify(root==='/bindings/'?defs:pages(['base:4','mask:'+g('d')]))).buffer;
 const loadTexture=async(root,a)=>({width:a.width,height:a.height,rgba:new Uint8ClampedArray(a.width*a.height*4).fill(255)});
 const calls=[];
 const f=createVersionedFamilyRenderer({bindings:'/bindings/',dynamic:'/dynamic/',auxiliary:'/aux/'},pin,{load,loadTexture,
  itemOverlay:async(i,v,transform)=>{
   calls.push([i,v]);
   if(i!==1&&i!==8)return null;
   return {version:i===8?'9.2.0':v,sourceHash:h('a'),route:'base:'+i,texture:h('b'),overlay:{
    texture:{width:2,height:4,rgba:new Uint8ClampedArray(32).fill(255)},sampleRect:[0,0,2,2],trim:[0,0,2,2],alphaOffsetY:2,logicalWidth:2,logicalHeight:2,sampleClamp:[.5,.5,1.5,1.5],...transform
   }};
  }});
 const appearance={magicCharacteristicId:902,fleckCharacteristicId:903};
 assert.ok(await f.wand(4,version,{...appearance,sourceItemId:1}) instanceof Blob);
 assert.equal(await f.wand(4,version,{...appearance,sourceItemId:8}),null);
 assert.deepEqual(calls,[[1,version],[8,version]]);
});

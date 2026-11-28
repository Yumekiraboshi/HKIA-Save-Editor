import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/versioned-dynamic-source.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {decodeVersionedDynamicSource,createVersionedDynamicSourceLoader}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const hash=c=>c.repeat(64);
const guid='a'.repeat(32);
const asset=c=>({file:'source-'+hash(c)+'.webp',sha256:hash(c),rgbSha256:hash('f'),bytes:100,width:4,height:8});
const row=(a,space='srgb')=>({asset:a,texture:hash('e'),sampleRect:[1,1,2,2],guardRect:[1,1,2,2],trimTopLeft:[0,0,2,2],logicalSize:2,alphaOffsetY:4,maskColorSpace:space});
const fixture=()=>({schema:'HKIA.DynamicSourcePageCandidate.1',version:'9.1.0',renderer:'guarded-native-rgb-alpha-v1',pages:[asset('b'),asset('c')],records:{'base:42':row(asset('b')),['mask:'+guid]:row(asset('c'),'linear')},unresolved:[]});
const pin=v=>({version:v.version,renderer:v.renderer,indexSha256:createHash('sha256').update(JSON.stringify(v)).digest('hex')});
const white=[[1,1,1,1],[1,1,1,1],[1,1,1,1]],red=[[1,0,0,1],white[1],white[2]];
test('source-page descriptors require exact version, page registration, guard and alpha bounds',()=>{
 const v=fixture(),p=pin(v);assert.equal(decodeVersionedDynamicSource(v,p).size,2);
 for(const mutate of [
  x=>{x.version='9.2.0'},x=>{x.records['base:42'].asset.bytes++},
  x=>{x.records['base:42'].guardRect=[0,0,2,2]},
  x=>{x.records['base:42'].sampleRect=[3,3,2,2]},
  x=>{x.records['base:42'].alphaOffsetY=3},
  x=>{x.records['base:42'].maskColorSpace='linear'},
  x=>{x.unresolved=[{key:'base:42',reason:'conflict'}]},
  x=>{x.pages.push(x.pages[0])}
 ]){const x=fixture();mutate(x);assert.throws(()=>decodeVersionedDynamicSource(x,p),/INVALID/);}
});
test('new source page transport uses the actual shared renderer, refuses wrong version and recovers fetch failure',async()=>{
 const v=fixture(),p=pin(v),bytes=new TextEncoder().encode(JSON.stringify(v)).buffer;
 let indexes=0,loads=0;
 const loadIndex=async(root,file,sha,max)=>{
  assert.equal(root,'/candidate/');assert.equal(file,'index.json');assert.equal(sha,p.indexSha256);
  assert.ok(bytes.byteLength<=max);if(++indexes===1)throw Error('temporary');return bytes;
 };
 const texture=async(root,a)=>{
  loads++;const rgba=new Uint8ClampedArray(a.width*a.height*4);
  for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){
   const i=(y*a.width+x)*4;
   rgba.set(a.sha256===hash('b')?[255,255,255,255]:[255,0,0,255],i);
  }
  return {width:a.width,height:a.height,rgba};
 };
 const loader=createVersionedDynamicSourceLoader('/candidate/',p,loadIndex,texture);
 assert.equal(await loader.original(42,'9.2.0'),null);assert.equal(indexes,0);
 assert.equal(await loader.original(42,v.version),null);
 const [a,b]=await Promise.all([loader.original(42,v.version),loader.render(42,v.version,guid,white)]);
 assert.ok(a instanceof Blob);assert.equal(a,b);assert.equal(indexes,2);
 const tinted=await loader.render(42,v.version,guid,red);
 assert.ok(tinted instanceof Blob);assert.notDeepEqual(new Uint8Array(await tinted.arrayBuffer()),new Uint8Array(await a.arrayBuffer()));
 assert.equal(await loader.render(42,v.version,'b'.repeat(32),red),null);
 assert.equal(await loader.original(999,v.version),null);
 const overlay=await loader.originalOverlay(42,v.version,{scale:.4,offsetPercent:[-.25,.25],rotation:0});
 assert.equal(overlay.sourceHash,p.indexSha256);assert.deepEqual(overlay.overlay.sampleClamp,[.5,.5,3.5,3.5]);assert.ok(loads>=3);
 assert.throws(()=>createVersionedDynamicSourceLoader('/../candidate/',p),/INVALID/);
});

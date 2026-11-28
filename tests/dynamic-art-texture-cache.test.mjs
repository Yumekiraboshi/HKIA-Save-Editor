import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/dynamic-art-assets.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {createOpaqueArtTextureLoader}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const asset=i=>({file:'source-'+i+'.webp',sha256:String(i).padStart(64,'0'),rgbSha256:'a'.repeat(64),width:1,height:1,bytes:1});
const buffer=i=>({width:1,height:1,rgba:new Uint8ClampedArray([i,0,0,255])});
test('concurrent source loads are shared beyond the completed texture cache limit',async()=>{
 const calls=[],resolve=new Map();
 const load=createOpaqueArtTextureLoader((_root,a)=>new Promise(r=>{calls.push(a.file);resolve.set(a.file,r);}));
 const requests=Array.from({length:12},(_,i)=>load('/',asset(i)));
 assert.equal(load('/',asset(0)),requests[0]);
 await Promise.resolve();
 assert.equal(calls.length,12);
 for(let i=0;i<12;i++)resolve.get(asset(i).file)(buffer(i));
 await Promise.all(requests);
 assert.equal(load('/',asset(11)),requests[11]);
 // The completed cache retains eight entries; evicted work can be reloaded.
 const again=load('/',asset(0));assert.notEqual(again,requests[0]);
 await Promise.resolve();assert.equal(calls.length,13);
 resolve.get(asset(0).file)(buffer(0));await again;
});
test('verified texture cache uses access recency and source fingerprints',async()=>{
 let calls=0;const load=createOpaqueArtTextureLoader(async()=>buffer(++calls));
 const first=await load('/',asset(0));
 for(let i=1;i<8;i++)await load('/',asset(i));
 assert.equal(await load('/',asset(0)),first);
 await load('/',asset(8));
 assert.equal(await load('/',asset(0)),first);
 await load('/',asset(1));assert.equal(calls,10);
 const changed={...asset(0),rgbSha256:'b'.repeat(64)};
 assert.notEqual(await load('/',changed),first);
 assert.notEqual(await load('/other/',asset(0)),first);
});
test('a shared failed decode is not retained and subsequent requests recover',async()=>{
 let calls=0;const load=createOpaqueArtTextureLoader(async()=>{if(++calls===1)throw Error('missing source');return buffer(1);});
 const a=load('/',asset(0)),b=load('/',asset(0));
 assert.equal(a,b);await assert.rejects(a,/missing source/);
 const next=load('/',asset(0));assert.notEqual(next,a);
 assert.equal(await next,await load('/',asset(0)));assert.equal(calls,2);
});

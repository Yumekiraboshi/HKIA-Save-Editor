import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/icon-pack-requests.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {createIconPackRequests}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
test('cross-view requests coalesce by exact group and share the three-slot loader',async()=>{
 const started=[],release=new Map();
 const loader=createIconPackRequests(group=>new Promise(resolve=>{started.push(group);release.set(group,()=>resolve({group,entries:{},dispose(){}}));}));
 const a=loader.request('a'),same=loader.request('a'),b=loader.request('b'),c=loader.request('c'),d=loader.request('d');
 assert.equal(a,same);
 await new Promise(setImmediate);assert.deepEqual(started,['a','b','c']);
 release.get('b')();await b;await new Promise(setImmediate);assert.deepEqual(started,['a','b','c','d']);
 for(const key of ['a','c','d'])release.get(key)();
 const packs=await Promise.all([a,same,c,d]);assert.equal(packs[0],packs[1]);
});
test('failed source load frees its slot and can be explicitly retried',async()=>{
 let count=0;
 const loader=createIconPackRequests(async group=>{if(++count===1)throw Error('missing source');return {group,entries:{},dispose(){}}});
 await assert.rejects(loader.request('a'),/missing source/);
 assert.equal((await loader.request('a')).group,'a');assert.equal(count,2);
});

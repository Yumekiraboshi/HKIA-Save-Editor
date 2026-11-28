import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/inventory-viewport.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {inventoryVirtualWindow:windowFor}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
test('full scroll height remains stable, including incomplete final row',()=>{
 const count=9921;
 for(const columns of [1,2,8,14]){
  const stride=210,rows=Math.ceil(count/columns),height=rows*stride-6;
  for(const top of [0,1000,height/2,height-800,height+1000]){
   const v=windowFor(count,{columns,rowHeight:204,gap:6,top,bottom:top+800});
   assert.equal(v.start%columns,0);
   assert.ok(v.end<=count&&v.end>v.start);
   assert.ok(v.end-v.start<=columns*12);
   const mounted=Math.ceil((v.end-v.start)/columns);
   assert.equal(v.before+v.after+mounted*stride-6,height);
   if(top>=height-800)assert.equal(v.end,count);
  }
 }
});
test('empty and small lists never allocate phantom rows',()=>{
 assert.deepEqual(windowFor(0,{columns:8,rowHeight:204,gap:6,top:0,bottom:800}),{start:0,end:0,before:0,after:0});
 assert.deepEqual(windowFor(3,{columns:8,rowHeight:204,gap:6,top:0,bottom:800}),{start:0,end:3,before:0,after:0});
});

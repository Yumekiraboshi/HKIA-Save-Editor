import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/inventory-boba-display.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {bobaSelectionForBase,bobaBaseKey,bobaFieldOptions,bobaFieldValue}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
test('changing a boba base preserves the selected attributes only for a native offered tuple',()=>{
 const before=[6,44,76,75,73],options=[[46,39,76,78,73],[46,39,79,78,71],[9,55,79,78,71],[9,55,76,78,72],[6,44,79,75,71]];
 assert.equal(bobaSelectionForBase(before,options,-1,bobaBaseKey(options[0])),0);
 assert.equal(bobaSelectionForBase(before,options,1,bobaBaseKey(options[2])),2);
 assert.equal(bobaSelectionForBase(before,options,2,bobaBaseKey(before)),4);
 assert.equal(bobaSelectionForBase(before,options,0,bobaBaseKey(before)),-1);
 assert.equal(bobaSelectionForBase(before,options,0,bobaBaseKey(options[2])),-1);
 assert.equal(bobaSelectionForBase(before,[],0,bobaBaseKey(options[0])),-1);
});

test('separate boba fields project only offered tuples and preserve unrelated attributes',()=>{
 const before=[6,44,76,75,73],options=[[46,39,76,78,73],[46,39,76,75,73],[46,39,79,78,73],[46,39,79,78,71],[9,55,79,78,71]];
 const flavors=bobaFieldOptions(before,options,-1,1);
 assert.deepEqual(flavors.map(x=>x.index),[-1,1]);
 const milk=bobaFieldOptions(before,options,1,3);
 assert.deepEqual(milk.map(x=>x.index),[0,1]);
 assert.deepEqual(bobaFieldOptions(before,options,0,2).map(x=>x.index),[0,2]);
 assert.deepEqual(bobaFieldOptions(before,options,2,4).map(x=>x.index),[2,3]);
 assert.deepEqual(bobaFieldOptions(before,options,3,1).map(x=>x.index),[3,4]);
 assert.deepEqual(bobaFieldOptions(before,options,1,1,true).map(x=>x.index),[1]);
 assert.equal(bobaFieldValue(options[0],before,1,'en',[[123,39,46]],()=> 'Tea'),'Tea · Without milk');
 assert.equal(bobaFieldValue(options[1],before,1,'en',[[123,39,46]],()=> 'Tea'),'Tea');
});

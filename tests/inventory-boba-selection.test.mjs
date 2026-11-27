import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/inventory-boba-display.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {bobaSelectionForBase,bobaBaseKey}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
test('changing a boba base preserves the selected attributes only for a native offered tuple',()=>{
 const before=[6,44,76,75,73],options=[[46,39,76,78,73],[46,39,79,78,71],[9,55,79,78,71],[9,55,76,78,72],[6,44,79,75,71]];
 assert.equal(bobaSelectionForBase(before,options,-1,bobaBaseKey(options[0])),0);
 assert.equal(bobaSelectionForBase(before,options,1,bobaBaseKey(options[2])),2);
 assert.equal(bobaSelectionForBase(before,options,2,bobaBaseKey(before)),4);
 assert.equal(bobaSelectionForBase(before,options,0,bobaBaseKey(before)),-1);
 assert.equal(bobaSelectionForBase(before,options,0,bobaBaseKey(options[2])),-1);
 assert.equal(bobaSelectionForBase(before,[],0,bobaBaseKey(options[0])),-1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const load=async path=>{
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
};
const {decodeInventoryUnique}=await load('../src/inventory-unique.ts');
const {diffInventory,safeInventoryPatches}=await load('../src/draft-store.ts');
const wire=xs=>{const b=new Uint8Array(xs.length*4),v=new DataView(b.buffer);xs.forEach((n,i)=>v.setUint32(i*4,n,true));return b};
test('unique snapshot preserves exact typed words and Rust-supplied flower options',()=>{
 const bytes=wire([3,1,1,42,7,4,4,6,6,0,0,3,6,8,16,2,1,43,6,3,12,...Array(12).fill(0x80000000),0,3,0,0,-1,0,0,0]);
 const rows=decodeInventoryUnique(bytes,new Set([1,2,3]));
 assert.deepEqual(rows.get(1),{uniqueId:42,tag:7,fieldCount:4,words:[6,6,0,0],flowerColors:[6,8,16]});
 assert.equal(rows.get(2).words[0],0x80000000);assert.equal(rows.get(3).tag,-1);
 assert.throws(()=>decodeInventoryUnique(bytes.slice(0,-1),new Set([1,2,3])));
 assert.throws(()=>decodeInventoryUnique(bytes,new Set([1,2,4])));
});
test('net color drafts are separate from ordinary stack changes',()=>{
 const a={documentId:1,itemId:1331175279,quantity:93,editable:false,flower:{growState:6,baseColor:6,pattern:0,patternColor:0}};
 const b={...a,flower:{...a.flower,baseColor:8}};
 const edits=diffInventory([a],[b]);
 assert.deepEqual(edits,[{documentId:1,before:6,after:8,kind:'flower-color'}]);
 assert.deepEqual(safeInventoryPatches(edits),edits);
 assert.throws(()=>safeInventoryPatches([...edits,...edits]));
 assert.throws(()=>safeInventoryPatches([{...edits[0],kind:'other'}]));
 assert.deepEqual(diffInventory([b],[b]),[]);
});

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
 const bytes=wire([3,1,1,42,7,4,4,6,6,0,0,1,2,1,43,6,3,12,...Array(12).fill(0x80000000),0,3,0,0,-1,0,0,0]);
 const rows=decodeInventoryUnique(bytes,new Set([1,2,3]));
 assert.deepEqual(rows.get(1),{uniqueId:42,tag:7,fieldCount:4,words:[6,6,0,0],flowerEditable:true});
 assert.equal(rows.get(2).words[0],0x80000000);assert.equal(rows.get(3).tag,-1);
 assert.throws(()=>decodeInventoryUnique(bytes.slice(0,-1),new Set([1,2,3])));
 assert.throws(()=>decodeInventoryUnique(bytes,new Set([1,2,4])));
});
test('net color drafts are separate from ordinary stack changes',()=>{
 const a={documentId:1,itemId:1331175279,quantity:93,editable:false,flower:{growState:6,baseColor:6,pattern:0,patternColor:0}};
 const b={...a,flower:{...a.flower,baseColor:8}};
 const edits=diffInventory([a],[b]);
 assert.deepEqual(edits,[{documentId:1,before:[6,6,0,0],after:[6,8,0,0],kind:'flower-variant'}]);
 assert.deepEqual(safeInventoryPatches(edits),edits);
 assert.throws(()=>safeInventoryPatches([...edits,...edits]));
 assert.throws(()=>safeInventoryPatches([{...edits[0],kind:'other'}]));
 assert.deepEqual(diffInventory([b],[b]),[]);
});

test('native options transport is bounded and preserves all four fields',async()=>{
 const {decodeFlowerVariants}=await load('../src/inventory-unique.ts');
 assert.deepEqual(decodeFlowerVariants(wire([2,6,8,10,16,6,8,3,0])),[[6,8,10,16],[6,8,3,0]]);
 assert.throws(()=>decodeFlowerVariants(wire([1,6,8,10])));
 assert.throws(()=>decodeFlowerVariants(wire([101])));
});

test('chef wire snapshot carries ordered tint IDs, not flavors or fabricated colors',async()=>{
 const {inventoryChefAppearance}=await load('../src/inventory-chef-display.ts');
 const rows=decodeInventoryUnique(wire([3,1,1,1,3,2,4,3,6,14,11,0,2,1,2,4,5,1,14,0,3,1,3,3,2,1,0,0]),new Set([1,2,3]));
 assert.deepEqual(inventoryChefAppearance(203331651,rows.get(1)),{kind:'cafe',colors:[6,14,11]});
 assert.deepEqual(inventoryChefAppearance(1798633565,rows.get(2)),{kind:'boba',colorId:14});
 assert.deepEqual(inventoryChefAppearance(203331651,rows.get(3)),{kind:'cafe',colors:[]});
 assert.equal(inventoryChefAppearance(1798633565,rows.get(1)),null);
 assert.equal(inventoryChefAppearance(315822,rows.get(1)),null);
 assert.throws(()=>decodeInventoryUnique(wire([1,1,1,1,3,2,2,3,6,0]),new Set([1])));
});

test('wand snapshot separates native source identity from its nested appearance',async()=>{
 const {inventoryWandAppearance}=await load('../src/inventory-wand-display.ts');
 const rows=decodeInventoryUnique(wire([3,
  1,1,1,9,5,6,315822,104,125,1,-1,0,0,
  2,1,2,9,5,10,1331175279,104,125,1,7,4,6,6,0,0,0,
  3,1,3,9,5,6,39246601,104,125,1,9,0,0
 ]),new Set([1,2,3]));
 assert.deepEqual(inventoryWandAppearance(39246601,rows.get(1)),{sourceItemId:315822,magicCharacteristicId:104,fleckCharacteristicId:125,styleCharacteristicId:1,sourceUnique:null});
 assert.deepEqual(inventoryWandAppearance(39246601,rows.get(2)).sourceUnique,{tag:7,words:[6,6,0,0]});
 assert.deepEqual(inventoryWandAppearance(39246601,rows.get(3)).sourceUnique,{tag:9,words:[]});
 assert.equal(inventoryWandAppearance(315822,rows.get(1)),null);
 assert.throws(()=>decodeInventoryUnique(wire([1,1,1,1,9,5,7,315822,104,125,1,9,1,0,0]),new Set([1])));
 assert.throws(()=>decodeInventoryUnique(wire([1,1,1,1,9,5,6,315822,104,125,1,7,4,0]),new Set([1])));
});

test('zero source Item ID is the native magic Sprite selector, not absent',async()=>{
 const {inventoryWandAppearance}=await load('../src/inventory-wand-display.ts');
 const row=decodeInventoryUnique(wire([1,1,1,1,9,5,6,0,104,125,1,-1,0,0]),new Set([1])).get(1);
 assert.equal(inventoryWandAppearance(39246601,row).sourceItemId,0);
});

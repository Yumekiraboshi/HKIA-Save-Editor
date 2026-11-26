import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const load=async path=>{
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
};
const {furnitureVariantTitle}=await load('../src/inventory-furniture-display.ts');
const {furnitureVariantOf}=await load('../src/inventory-unique.ts');
const {browseInventory,inventorySearchGroupCounts}=await load('../src/inventory-browse.ts');
const data=JSON.parse(readFileSync(new URL('../public/inventory-ui/furniture-customization-v3.0.1.json',import.meta.url),'utf8'));
const display={materials:new Map(data.materials.map(v=>[v[0],{sourceName:v[2],rgba:v[5]}])),defaults:new Map(data.items.map(v=>[v[0],new Map(v[4].map(s=>[s[0],s[2]]))]))};
const itemId=61381969;
test('furniture labels preserve native slot order and never invent unknown material names',()=>{
 assert.equal(furnitureVariantTitle(display,itemId,[13,2,0],'標準'),'Antique Metal 1 / Antique Lamp 2');
 assert.equal(furnitureVariantTitle(display,itemId,[502,2,0],'標準'),'Standard Metal 1 / Antique Lamp 2');
 assert.equal(furnitureVariantTitle(display,itemId,[0,0,0],'標準'),'標準 / 標準');
 assert.equal(furnitureVariantTitle(display,itemId,[99999999,2,0],'標準'),'— / Antique Lamp 2');
 assert.equal(furnitureVariantTitle(display,itemId,[13,2,99999999],'標準'),'Antique Metal 1 / Antique Lamp 2 / —');
 assert.equal(furnitureVariantTitle(null,itemId,[13,2,0],'標準'),'');
 assert.equal(furnitureVariantTitle(display,-1,[13,2,0],'標準'),'');
 assert.equal(furnitureVariantTitle(display,itemId,null,'標準'),'');
});
test('same-item furniture variants are searchable without conflating records',()=>{
 const row=(documentId,words)=>({documentId,itemId,quantity:1,editable:true,unique:{uniqueId:documentId,tag:8,fieldCount:3,words,flowerEditable:false}});
 const rows=[row(1,[13,2,0]),row(2,[502,2,0])];
 const names={[itemId]:'Desk Lamp'},items=new Map(),index=new Map([[itemId,{rawFlags:64,hasUiOverride:false}]]);
 const name=r=>furnitureVariantTitle(display,r.itemId,furnitureVariantOf(r.unique),'Default');
 const query='Desk Lamp Standard Metal';
 assert.deepEqual(browseInventory(rows,query,'furniture',false,names,items,index,'en',name).map(r=>r.documentId),[2]);
 assert.equal(inventorySearchGroupCounts(rows,query,false,names,items,index,name).get('furniture'),1);
 assert.equal(inventorySearchGroupCounts(rows,'Antique Lamp 2',false,names,items,index,name).get('furniture'),2);
});

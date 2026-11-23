import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const {outputFiles}=await build({
 entryPoints:[fileURLToPath(new URL('../src/inventory-browse.ts',import.meta.url))],
 bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'
});
const {browseInventory,inventoryGroupCounts,sourceCollectionGroup,OTHER_INVENTORY_GROUP}=
 await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const catalog=JSON.parse(readFileSync(new URL('../public/catalog.json',import.meta.url)));
const groups=new Set(catalog.groups.map(g=>g[0]));
const items=new Map(catalog.items.map(i=>[i[0],i]));
const rows=[
 {documentId:10,itemId:315822,quantity:4,editable:true},
 {documentId:11,itemId:517031,quantity:1,editable:false},
 {documentId:12,itemId:567052,quantity:8,editable:true},
 {documentId:13,itemId:0,quantity:1,editable:false},
 {documentId:14,itemId:315822,quantity:9,editable:true}
];
const names={'315822':'ミント色のストライプのパジャマシャツ','517031':'青の妖精の服',
 '567052':'サクラ・チーズケーキ'};
const filter=(term='',group=null,editable=false,locale='ja')=>
 browseInventory(rows,term,group,editable,names,items,groups,locale);

test('original collection groups are only assigned through verified item source IDs',()=>{
 assert.equal(sourceCollectionGroup(315822,items,groups),'collections_group_clothing');
 assert.equal(sourceCollectionGroup(567052,items,groups),'collections_group_food');
 assert.equal(sourceCollectionGroup(0,items,groups),OTHER_INVENTORY_GROUP);
 const totals=inventoryGroupCounts(rows,items,groups);
 assert.equal(totals.get('collections_group_clothing'),2,'counts native document stacks');
 assert.equal(totals.get('collections_group_events'),1);
 assert.equal(totals.get(OTHER_INVENTORY_GROUP),1,'never hide unknown native items');
});

test('category, localized native item names, fallback names, ID and editable-only compose safely',()=>{
 assert.deepEqual(filter('ミント','collections_group_clothing').map(r=>r.documentId),[10,14]);
 assert.equal(filter('blue','collections_group_events').length,1,'English catalog fallback is searchable');
 assert.equal(filter('315822').length,2,'expert ID search remains available but invisible in tiles');
 assert.deepEqual(filter('','collections_group_events',true),[],'read-only row is not silently editable');
 assert.deepEqual(filter('','__inventory_other__').map(r=>r.documentId),[13]);
 assert.equal(filter('','collections_group_food',true).length,1);
 assert.equal(rows[0].quantity,4,'filters are presentation-only');
});

test('UI reuses game source category art and existing native editor path',()=>{
 const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 assert.match(app,/inventoryGroupTotals=\$derived\(inventoryGroupCounts\(/);
 assert.match(app,/inventoryRows=\$derived\(browseInventory\(/);
 assert.match(app,/src=\{ICONS\+g\[5\]\}/);
 assert.match(app,/inventoryIconPacks\[definition\[3\]\]/);
 assert.match(app,/changeInventoryQuantity\(row.documentId,row.quantity,next\)/);
 assert.match(app,/class:inventory-readonly=\{!item.editable\}/);
 assert.match(app,/bind:this=\{inventoryLoadMoreSentinel\}/);
});

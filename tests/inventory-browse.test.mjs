import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const buildSource=async file=>{
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL(file,import.meta.url))],
  bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
};
const {decodeNativeInventoryIndex}=await buildSource('../src/inventory-native-data.ts');
const {FLOWER_CREATION_SOURCE_IDS}=await buildSource('../src/inventory-native-crafting.ts');
const {inventoryAddRows,inventoryDisplayRows,inventoryRefillable,nativeInventoryGroups,inventoryGroupCounts,browseInventory,inventorySearchGroupCounts,inventorySearchTarget,defaultInventoryGroup,NATIVE_INVENTORY_TABS,inventoryCategoryRepresentative,INVENTORY_CATEGORY_REPRESENTATIVES}=await buildSource('../src/inventory-browse.ts');
const catalog=JSON.parse(readFileSync(new URL('../public/catalog.json',import.meta.url)));
const items=new Map(catalog.items.map(x=>[x[0],x]));
const packed=JSON.parse(readFileSync(new URL('../public/inventory-native-categories.json',import.meta.url)));
const raw=gunzipSync(Buffer.from(packed.data,'base64'));
const names={'315822':'ミント色のストライプのパジャマシャツ','517031':'青の妖精の服','567052':'サクラ・チーズケーキ'};
const index=decodeNativeInventoryIndex(packed,raw);
const unknownId=0;
assert.equal(index.has(unknownId),false);
const rows=[
 {documentId:10,itemId:315822,quantity:4,editable:true},
 {documentId:11,itemId:517031,quantity:1,editable:false},
 {documentId:12,itemId:567052,quantity:8,editable:true},
 {documentId:13,itemId:unknownId,quantity:1,editable:false},
 {documentId:14,itemId:315822,quantity:9,editable:true}
];
const filter=(q='',group='clothes',editable=false)=>browseInventory(rows,q,group,editable,names,items,index,'ja');

test('original v3.0.1 item definition source covers every native inventory category and UI override',()=>{
 assert.equal(packed.schema,'HKIA.NativeInventoryCategoryIndex.1');
 assert.equal(packed.version,'3.0.1');
 assert.equal(packed.source.sha256,'ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0');
 assert.equal(createHash('sha256').update(raw).digest('hex'),packed.rawSha256);
 assert.equal(createHash('sha256').update(readFileSync(new URL('../public/inventory-native-categories.json',import.meta.url))).digest('hex'),'30116af6becce0b587d1613886a0191090792d2493e0a8367695b7096ea749bf');
 assert.equal(index.size,12163);
 assert.deepEqual(NATIVE_INVENTORY_TABS.map(t=>t.bit),[134217728,0,65536,4096,50331648,32,8,16384,256,64,67108864,2097152,8388608]);
 assert.deepEqual(nativeInventoryGroups(203331651,index),['food','chef-station']);
 assert.equal([...index.values()].filter(x=>x.hasUiOverride).length,1238);
 assert.deepEqual(index.get(315822),{rawFlags:1048832,hasUiOverride:false,uiOverrideFlags:0});
 assert.deepEqual(index.get(567052),{rawFlags:269557760,hasUiOverride:false,uiOverrideFlags:0});
 assert.equal(nativeInventoryGroups(315822,index)[0],'clothes');
 assert.equal(nativeInventoryGroups(567052,index)[0],'food');
 assert.equal(nativeInventoryGroups(216433,index)[0],'furniture');
 const overridden=[...index.entries()].find(([,r])=>r.hasUiOverride&&r.uiOverrideFlags===134217728);
 assert.ok(overridden,'source contains explicit KeyItem UI overrides');
 assert.equal(nativeInventoryGroups(overridden[0],index)[0],'key-items');
});

test('native categories never confuse Collection GUID categories with the InventoryItemDefinitionAsset flags',()=>{
 assert.ok(!NATIVE_INVENTORY_TABS.some(x=>x.key==='collection_group_clothing'));
 assert.equal(nativeInventoryGroups(unknownId,index)[0],'other');
 const counts=inventoryGroupCounts(rows,index);
 assert.equal(defaultInventoryGroup(counts),'food');
 assert.equal(defaultInventoryGroup(new Map([['clothes',1]])),'clothes');
 assert.equal(defaultInventoryGroup(new Map([['other',1]])),'other');
 assert.equal(defaultInventoryGroup(new Map()),'key-items');
 assert.equal(counts.get('clothes'),3);
 assert.equal(counts.get('food'),1);
 assert.equal(counts.get('other'),1);
 assert.deepEqual(filter('ミント','clothes').map(x=>x.documentId),[10,14]);
 assert.equal(filter('Blue','clothes').length,1,'English fallback remains searchable in Japanese');
 assert.equal(filter('315822').length,2);
 assert.deepEqual(filter('','clothes',true).map(x=>x.documentId),[10,14]);
 assert.deepEqual(filter('','other').map(x=>x.documentId),[13]);
 assert.equal(rows[0].quantity,4,'read-only classification never edits a save');
});

test('search finds native categories across the owned or absent inventory view without mutating selection or records',()=>{
 const counts=(q,editable=false)=>inventorySearchGroupCounts(rows,q,editable,names,items,index);
 assert.deepEqual([...counts('ミント')],[['clothes',2]]);
 assert.equal(inventorySearchTarget('food',counts('ミント')),'clothes');
 assert.equal(inventorySearchTarget('clothes',counts('サクラ')),'food');
 assert.equal(inventorySearchTarget('clothes',counts('315822')),'clothes');
 assert.equal(inventorySearchTarget('food',counts('no such item')),'food');
 assert.equal(counts('Blue',true).size,0);
 assert.equal(counts('',true).get('clothes'),2);
 assert.equal(counts('',true).has('other'),false);
 assert.equal(counts('0').get('other'),1);
 assert.equal(rows[0].quantity,4);
 const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 assert.match(app,/oninput=\{onInventorySearch\}/);
 assert.match(app,/inventoryMatchTotals\.get\(t\.key\)/);
});
test('variant-aware search distinguishes same-ID flower records by localized color and pattern',()=>{
 const id=43114910;
 const flowers=[{documentId:20,itemId:id,quantity:4,editable:true},{documentId:21,itemId:id,quantity:6,editable:true},{documentId:22,itemId:id,quantity:1,editable:false}];
 const labels={[String(id)]:'花'};
 const variants=new Map([[20,'赤 · 白 · グラデーション'],[21,'青'],[22,'赤 · ラメ']]);
 const variantName=row=>variants.get(row.documentId)??'';
 const search=(q,editable=false)=>browseInventory(flowers,q,'flowers',editable,labels,items,index,'ja',variantName).map(r=>r.documentId);
 const counts=(q,editable=false)=>inventorySearchGroupCounts(flowers,q,editable,labels,items,index,variantName);
 assert.deepEqual(search('花 赤'),[20,22]);
 assert.deepEqual(search('赤 白 グラデーション'),[20]);
 assert.deepEqual(search('花 青'),[21]);
 assert.deepEqual(search('赤 青'),[]);
 assert.deepEqual(search('赤',true),[20]);
 assert.equal(counts('赤').get('flowers'),2);
 assert.equal(counts('赤',true).get('flowers'),1);
 assert.equal(inventorySearchTarget('food',counts('花 青')),'flowers');
 assert.deepEqual(search('43114910'),[20,21,22]);
 assert.equal(flowers[0].quantity,4);
});
test('native specialized station filters use original crafting sources and raw chef category',()=>{
 assert.equal(FLOWER_CREATION_SOURCE_IDS.size,181);
 assert.equal(createHash('sha256').update([...FLOWER_CREATION_SOURCE_IDS].join(',')).digest('hex'),'422f19613ff4f3accfcb3810a4b1c806da5060fe008f58469d676e0026af1620');
 assert.ok([...FLOWER_CREATION_SOURCE_IDS].every(id=>index.has(id)));
 assert.deepEqual(nativeInventoryGroups(1873326,index),['creation-station']);
 assert.deepEqual(nativeInventoryGroups(30258712,index),['creation-station']);
 assert.deepEqual(nativeInventoryGroups(29444931,index),['clothes']);
 assert.deepEqual(nativeInventoryGroups(42361582,index),['food','chef-station']);
 assert.equal([...index.keys()].filter(id=>nativeInventoryGroups(id,index).includes('creation-station')).length,135);
 assert.equal([...index.keys()].filter(id=>nativeInventoryGroups(id,index).includes('chef-station')).length,33);
 assert.ok([...index.keys()].every(id=>nativeInventoryGroups(id,index).length>0));
});

test('tampered native index, unknown palette, truncated entries and unverified version are rejected',()=>{
 assert.throws(()=>decodeNativeInventoryIndex({...packed,version:'3.0.0'},raw));
 assert.throws(()=>decodeNativeInventoryIndex({...packed,source:{...packed.source,sha256:'0'.repeat(64)}},raw));
 assert.throws(()=>decodeNativeInventoryIndex({...packed,rawSha256:'0'.repeat(64)},raw));
 assert.throws(()=>decodeNativeInventoryIndex(packed,raw.subarray(0,raw.length-1)));
 assert.throws(()=>decodeNativeInventoryIndex({...packed,palette:[]},raw));
});

test('Inventory UI selects native source definitions, retains original game art packs and Rust CAS editing',()=>{
 const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 assert.match(app,/loadNativeInventoryIndex\(import\.meta\.env\.BASE_URL\)/);
 assert.match(app,/inventoryGroupTotals=\$derived\(inventoryGroupCounts\(/);
 assert.match(app,/inventoryRows=\$derived\(browseInventory\(/);
 assert.match(app,/inventoryGroupLabel\(locale,t\.key\)/);
 assert.match(app,/inventoryQuery,activeInventoryGroup,/);
 assert.doesNotMatch(app,/\{iCopy\.all\}/);
 assert.match(app,/inventoryIconPacks\[definition\[3\]\]/);
 assert.match(app,/changeInventoryQuantity\(row.documentId,row.quantity,next\)/);
 assert.match(app,/class:inventory-readonly=\{!item.editable&&!canFlower&&!canFurniture&&!canPalette&&!canBoba&&!canCafe&&!canWand&&!item.flowerCreatable\}/);
 assert.match(app,/changeInventoryFurnitureVariant\(selected.documentId,selected.before,next\)/);
 assert.match(app,/requestFurniturePreview\(row.documentId,before,before\)/);
 assert.match(app,/\{@const canFurniture=!!item.unique\?\.furnitureEditable\|\|!!item.furnitureCreatable\}/);
 assert.match(app,/changeInventoryFlowerVariant\(selected.documentId,selected.before,next\)/);
 assert.match(app,/requestFlowerVariants\(row.documentId\)/);
 assert.match(app,/bind:this=\{inventoryLoadMoreSentinel\}/);
 assert.doesNotMatch(app,/inventoryGroupTotals\(\s*\(snapshot.*inventorySourceItems/);
});

test('original native flower and furniture images are pinned',()=>{
 assert.equal(createHash('sha256').update(readFileSync(new URL('../public/icons/inventory-category-flowers.png',import.meta.url))).digest('hex'),'b4134139e5ba02972e4320e3ece8b598408b6decd3a88216d4d49d8ef990400d');
 assert.equal(createHash('sha256').update(readFileSync(new URL('../public/icons/inventory-category-furniture.png',import.meta.url))).digest('hex'),'f428d50dea3962fae65d6b3ae787aecf4b9ffccca45f86ac1089446e6db3e7ad');
});

test('compact inventory keeps quantity controls accessible and locks unsupported records',()=>{
 const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
 assert.match(css,/\.inventory-grid\{[^}]*minmax\(min\(136px,100%\),1fr\)/);
 assert.match(css,/\.inventory-item-art\{[^}]*width:64px;height:64px/);
 assert.match(css,/\.inventory-item-art \.item-sprite\{[^}]*transform:scale/);
 assert.match(app,/\{#if item\.editable\}\s*<form class="inventory-quantity-form"/);
 assert.match(app,/aria-label=\{iCopy\.apply\}/);
 assert.match(app,/class="inventory-readonly-quantity" title=\{iCopy\.readonly\}/);
 assert.match(app,/title=\{inventoryName\(item\.itemId\)\}/);
});

test('category representatives use source item IDs chosen by visual motif, not classification',()=>{
 const readJson=path=>JSON.parse(readFileSync(new URL(path,import.meta.url)));
 const art=readJson('../public/inventory-art/index.json');
 const available=new Set(art.records.map(row=>row[0]));
 const verifiedNames={...readJson('../public/source-names/en.json').names,...readJson('../public/inventory-names/en.json').names};
 const expected={
  'key-items':'Toolbox',items:'Mint Hiking Backpack',food:'Milk Bread',
  'chef-station':'Omelet',flowers:'Tulias','creation-station':'Friendship Bouquet',
  critters:'Phantom Flutterby',furniture:'Nordic Armchair',wands:"Lala's Magic Wand"
 };
 assert.equal(NATIVE_INVENTORY_TABS.length,13);
 assert.deepEqual(Object.keys(INVENTORY_CATEGORY_REPRESENTATIVES),Object.keys(expected));
 for(const tab of NATIVE_INVENTORY_TABS){
  const representative=inventoryCategoryRepresentative(tab.key,index);
  if(tab.art){
   assert.match(tab.art,/^collections_group_.+\.webp$/);
   assert.ok(readFileSync(new URL('../public/icons/'+tab.art,import.meta.url)).length>0);
  }
  if(representative!==undefined){
   assert.equal(verifiedNames[String(representative)],expected[tab.key]);
   assert.ok(available.has(representative)||items.has(representative),tab.key+' needs a source artwork record');
  }else assert.ok(tab.art,tab.key+' needs a readable image fallback');
 }
 assert.equal(inventoryCategoryRepresentative('items',new Map()),undefined);
 const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 assert.match(app,/inventoryCategoryRepresentative\(t\.key,nativeInventoryIndex\)/);
 assert.match(app,/inventoryNativeArt\?\.entries\.get\(representative\)/);
 assert.match(app,/inventoryIconPacks\[representativeSource\[3\]\]/);
 assert.match(app,/src=\{ICONS\+t\.art\}/);
 assert.doesNotMatch(app,/src=\{INVENTORY_UI\+t\.art\}/);
});

test('empty native stacks leave the owned grid but remain available to search and refill',()=>{
 const empty={documentId:30,itemId:315822,quantity:0,editable:true,quantityMinimum:0};
 const opaque={documentId:31,itemId:517031,quantity:0,editable:false,quantityMinimum:1};
 const positive={documentId:32,itemId:315822,quantity:2,editable:true,quantityMinimum:0};
 const absent={documentId:2147483649,itemId:567052,quantity:0,editable:true,quantityMinimum:1};
 const owned=[empty,opaque,positive];
 assert.equal(inventoryRefillable(empty),true);
 assert.equal(inventoryRefillable(opaque),false);
 assert.deepEqual(inventoryDisplayRows(owned,false,'').map(r=>r.documentId),[31,32]);
 assert.deepEqual(inventoryDisplayRows(owned,false,'  ').map(r=>r.documentId),[31,32]);
 assert.deepEqual(inventoryDisplayRows(owned,false,'315822'),owned);
 const add=inventoryAddRows(owned,[absent]);
 assert.deepEqual(add,[empty,absent]);
 assert.deepEqual(inventoryDisplayRows(add,true,''),add);
 assert.deepEqual(owned,[empty,opaque,positive]);
 assert.deepEqual(inventoryAddRows([opaque,positive],[absent]),[absent]);
});

test('inventory search normalizes Japanese width and kana without losing native identity or diacritics',()=>{
 assert.deepEqual(filter('みんと').map(r=>r.documentId),[10,14]);
 assert.deepEqual(filter('ﾐﾝﾄ').map(r=>r.documentId),[10,14]);
 assert.deepEqual(filter('３１５８２２').map(r=>r.documentId),[10,14]);
 assert.equal(filter('ＢＬＵＥ').length,1);
 const flowers=[{documentId:50,itemId:43114910,quantity:2,editable:true}];
 const variantName=()=> 'ピンク · グラデーション';
 const labels={'43114910':'花'};
 const search=q=>browseInventory(flowers,q,'flowers',false,labels,items,index,'ja',variantName);
 const counts=q=>inventorySearchGroupCounts(flowers,q,false,labels,items,index,variantName);
 for(const q of ['花　ﾋﾟﾝｸ','花 ぴんく','く\u3099らでーしょん']){
  assert.deepEqual(search(q),flowers);
  assert.equal(counts(q).get('flowers'),1);
 }
 assert.deepEqual(search('ひんく'),[]);
 assert.equal(counts('ひんく').size,0);
 assert.equal(variantName(),'ピンク · グラデーション');
 assert.equal(flowers[0].quantity,2);
});

test('Add exposes positive customization sources without enabling their quantity or batch edits',()=>{
 const base={documentId:32,itemId:315822,quantity:7,editable:true,quantityMinimum:0,furnitureCreatable:true};
 const flower={documentId:33,itemId:43114910,quantity:3,editable:true,unique:{flowerEditable:true}};
 const boba={documentId:34,itemId:1798633565,quantity:2,editable:true,boba:{editable:true}};
 const ordinary={documentId:35,itemId:567052,quantity:5,editable:true};
 const candidate={documentId:2147483648+43114910,itemId:43114910,quantity:0,editable:false,flowerCreatable:true};
 const rows=inventoryAddRows([base,flower,boba,ordinary],[candidate]);
 assert.deepEqual(rows.map(r=>r.documentId),[candidate.documentId,32,34]);
 assert.ok(rows.every(r=>!r.editable));assert.equal(rows[1].quantity,7);assert.equal(base.editable,true);
 assert.equal(inventoryAddRows([flower],[])[0].documentId,33);
});

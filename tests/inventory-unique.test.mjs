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

test('furniture snapshot and choices preserve three signed material indices and native edit hint',async()=>{
 const {decodeFurnitureVariants,furnitureVariantOf}=await load('../src/inventory-unique.ts');
 const b=wire([1,8,1,11,8,3,3,13,2,0,2]);
 const info=decodeInventoryUnique(b,new Set([8])).get(8);
 assert.equal(info.furnitureEditable,true);
 assert.equal(info.flowerEditable,false);
 assert.equal(info.uniqueId,11);
 assert.deepEqual(furnitureVariantOf(info),[13,2,0]);
 assert.deepEqual(decodeFurnitureVariants(wire([2,502,2,0,13,3,0])),[[502,2,0],[13,3,0]]);
 assert.throws(()=>decodeFurnitureVariants(wire([2635])));
 assert.throws(()=>decodeFurnitureVariants(wire([1,13,2])));
 assert.throws(()=>decodeInventoryUnique(wire([1,8,1,11,8,3,3,13,2,0,1]),new Set([8])));
 assert.throws(()=>decodeInventoryUnique(wire([1,8,1,11,7,4,4,6,1,0,0,2]),new Set([8])));
});
test('furniture variant draft carries native tuple independently of quantity',()=>{
 const a={documentId:8,itemId:61381969,quantity:93,editable:false,unique:{uniqueId:11,tag:8,fieldCount:3,words:[13,2,0],flowerEditable:false,furnitureEditable:true}};
 const b={...a,unique:{...a.unique,words:[502,2,0]}};
 const expected=[{documentId:8,before:[13,2,0],after:[502,2,0],kind:'furniture-variant'}];
 assert.deepEqual(diffInventory([a],[b]),expected);
 assert.deepEqual(safeInventoryPatches(expected),expected);
 assert.deepEqual(diffInventory([a],[a]),[]);
 assert.throws(()=>safeInventoryPatches([{...expected[0],after:[13,2,0]}]));
 assert.throws(()=>safeInventoryPatches([{...expected[0],after:[502,2]}]));
 assert.throws(()=>safeInventoryPatches([{...expected[0],after:[2147483648,2,0]}]));
 assert.throws(()=>safeInventoryPatches([...expected,...expected]));
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

test('growth labels distinguish native species states and never describe clothing as a flower',async()=>{
 const {flowerGrowthKind}=await load('../src/inventory-flower-display.ts');
 const {flowerGrowthLabel}=await load('../src/inventory-unique-copy.ts');
 const flower=growState=>({growState,baseColor:1,pattern:0,patternColor:0});
 for(const [state,kind,label] of [[0,'seed','種'],[1,'planted','植え付け済み'],[2,'seedling','苗'],[3,'grown','成長済み'],[4,'bud','つぼみ'],[5,'bloom','開花'],[6,'plucked','花'],[7,'uprooted','掘り起こした株'],[255,'unknown','状態未確認']]){
  assert.equal(flowerGrowthKind(43114910,flower(state)),kind);
  assert.equal(flowerGrowthLabel('ja',kind),label);
  assert.equal(flowerGrowthKind(1120342995,flower(state)),null);
 }
 const {readFileSync}=await import('node:fs');
 const source=JSON.parse(readFileSync(new URL('../core/data/inventory-flower-definitions-v3.0.1.json',import.meta.url)));
 for(const row of source.flowers)assert.equal(flowerGrowthKind(row.itemId,flower(0)),'seed');
 for(const locale of ['ar','de','en','en-GB','es','fr','fr-CA','it','ja','ko','nl','pt-BR','ru','tr','zh-Hans','zh-Hant']){
  const labels=['seed','planted','seedling','grown','bud','bloom','plucked','uprooted','unknown'].map(k=>flowerGrowthLabel(locale,k));assert.equal(new Set(labels).size,9);assert.ok(labels.every(Boolean));
 }
});

test('editable nil-source-payload wand accepts nonzero native source and draft compares identity',async()=>{
 const {wandVariantOf}=await load('../src/inventory-wand-display.ts');
 const {inventoryPatchesEqual}=await load('../src/draft-store.ts');
 const row=decodeInventoryUnique(wire([1,8,0,0,9,5,6,1185152302,104,125,0,-1,0,4]),new Set([8])).get(8);
 assert.equal(row.wandEditable,true);
 assert.deepEqual(wandVariantOf(row),[104,125]);
 const staged={documentId:2147483649,itemId:384749651,quantity:3,editable:true,unique:row};
 const patch=diffInventory([],[staged]);
 assert.deepEqual(patch,[{documentId:2147483649,itemId:384749651,variant:[104,125],quantity:3,kind:'wand-create',sourceItemId:1185152302}]);
 assert.ok(inventoryPatchesEqual(patch,safeInventoryPatches(patch)));
 assert.ok(!inventoryPatchesEqual(patch,[{...patch[0],sourceItemId:315822}]));
 assert.throws(()=>safeInventoryPatches([{...patch[0],sourceItemId:-1}]));
 assert.throws(()=>decodeInventoryUnique(wire([1,8,0,0,9,5,6,0xffffffff,104,125,0,-1,0,4]),new Set([8])));
 assert.throws(()=>decodeInventoryUnique(wire([1,8,0,0,9,5,10,1185152302,104,125,0,7,4,6,6,0,0,4]),new Set([8])));
});

test('existing wand source CAS net draft distinguishes source replacement from pair edit',async()=>{
 const {inventoryPatchesEqual}=await load('../src/draft-store.ts');
 const a={documentId:8,itemId:384749651,quantity:2,editable:true,unique:{uniqueId:21,tag:9,fieldCount:5,words:[1185152302,104,125,0,0xffffffff,0],flowerEditable:false,wandEditable:true}};
 const b={...a,unique:{...a.unique,words:[315822,106,127,0,0xffffffff,0]}};
 const patches=diffInventory([a],[b]);
 assert.deepEqual(patches,[{documentId:8,kind:'wand-identity',before:[1185152302,104,125],after:[315822,106,127]}]);
 assert.ok(inventoryPatchesEqual(patches,safeInventoryPatches(patches)));
 assert.ok(!inventoryPatchesEqual(patches,[{...patches[0],after:[315823,106,127]}]));
});

test('nested furniture wand snapshot and net draft preserve all three material words',async()=>{
 const {wandNestedOf,wandVariantOf}=await load('../src/inventory-wand-display.ts');
 const {inventoryPatchesEqual}=await load('../src/draft-store.ts');
 const row=decodeInventoryUnique(wire([1,8,1,21,9,5,9,61381969,104,125,0,8,3,13,2,0,4]),new Set([8])).get(8);
 assert.equal(row.wandEditable,true);assert.deepEqual(wandVariantOf(row),[104,125]);assert.deepEqual(wandNestedOf(row),[61381969,104,125,13,2,0]);
 const a={documentId:8,itemId:384749651,quantity:2,editable:true,unique:row};
 const b={...a,unique:{...row,words:[61381969,104,125,0,8,3,13,3,0]}};
 const patch=diffInventory([a],[b]);
 assert.deepEqual(patch,[{documentId:8,kind:'wand-nested',before:[61381969,104,125,13,2,0],after:[61381969,104,125,13,3,0]}]);
 assert.ok(inventoryPatchesEqual(patch,safeInventoryPatches(patch)));
 const add=diffInventory([],[{...b,documentId:2147483649,unique:{...b.unique,uniqueId:null}}]);
 assert.deepEqual(add,[{documentId:2147483649,itemId:384749651,variant:[104,125],quantity:2,kind:'wand-create',sourceItemId:61381969,nestedMaterials:[13,3,0]}]);
 assert.ok(inventoryPatchesEqual(add,safeInventoryPatches(add)));
 assert.ok(!inventoryPatchesEqual(add,[{...add[0],nestedMaterials:[13,2,0]}]));
 assert.throws(()=>decodeInventoryUnique(wire([1,8,1,21,9,5,10,61381969,104,125,0,7,4,6,6,0,0,4]),new Set([8])));
});


test('special identity metadata preserves UTF-8 names and both Int64 words without edit hints',async()=>{
 const {inventorySavedHomeName}=await load('../src/inventory-unique.ts');
 const pack=s=>{const b=Buffer.from(s,'utf8'),p=Buffer.alloc(Math.ceil(b.length/4)*4);b.copy(p);return [b.length,...Array.from({length:p.length/4},(_,i)=>p.readUInt32LE(i*4))]};
 const layout=[0x89abcdef,0x01234567,1,...pack('間取り🌸')],kit=[12345,...pack('ホームキット')];
 const rows=decodeInventoryUnique(wire([3,1,1,21,0,1,4,0x12345678,0xffffffff,0,0x80000000,0,2,1,22,10,1,layout.length,...layout,0,3,1,23,11,2,kit.length,...kit,0]),new Set([1,2,3]));
 assert.equal(inventorySavedHomeName(rows.get(2)),'間取り🌸');assert.equal(inventorySavedHomeName(rows.get(3)),'ホームキット');
 assert.equal((BigInt(rows.get(2).words[1])<<32n)|BigInt(rows.get(2).words[0]),0x0123456789abcdefn);
 assert.equal(inventorySavedHomeName(rows.get(1)),null);
 for(const bad of [[0,0,2,0],[0,0,0,126],[0,0,0,1,0xffffffff],[0,0,0,1,0x1000041]])assert.throws(()=>decodeInventoryUnique(wire([1,2,1,22,10,1,bad.length,...bad,0]),new Set([2])));
 assert.throws(()=>decodeInventoryUnique(wire([1,2,1,22,10,1,layout.length,...layout,2]),new Set([2])));
});

test('all 25 native flower species distinguish all eight states from out-of-range values without changing artwork routes',async()=>{
 const {readFileSync}=await import('node:fs');
 const {flowerGrowthKind,flowerGrowthSpriteState,flowerUsesDefinitionIcon}=await load('../src/inventory-flower-display.ts');
 const source=JSON.parse(readFileSync(new URL('../public/inventory-flower-art/index.json',import.meta.url),'utf8'));
 assert.equal(source.items.length,25);
 for(const {itemId} of source.items){
  for(const [growState,kind] of ['seed','planted','seedling','grown','bud','bloom','plucked','uprooted'].entries()){
   const f={growState,baseColor:1,pattern:0,patternColor:0};
   assert.equal(flowerGrowthKind(itemId,f),kind);
   assert.equal(flowerGrowthSpriteState(itemId,f),growState===0?0:[3,7].includes(growState)?7:undefined);
   assert.equal(flowerUsesDefinitionIcon(itemId,f),[1,2,4,5,6].includes(growState));
  }
  for(const growState of [-1,8,255,1.5,NaN])assert.equal(flowerGrowthKind(itemId,{growState,baseColor:1,pattern:0,patternColor:0}),'unknown');
 }
});

test('all native chef Add starters use the same ordered appearance as saved rows and initial previews',async()=>{
 const {inventoryChefAppearance,chefDraftAppearance,hasNativeChefArt}=await load('../src/inventory-chef-display.ts');
 const {readFileSync}=await import('node:fs');
 const source=JSON.parse(readFileSync(new URL('../public/dynamic-chef-art/chef-runtime-source-v3.0.1.json',import.meta.url)));
 assert.equal(source.rows.length,10);
 for(const row of source.rows){
  const id=row.itemId;assert.ok(hasNativeChefArt(id));
  const variants=row.kind==='cafe'?[[48,49,48,9,46,9],[44,0,0,6,0,0],[44,49,0,6,46,0]]:[[8,99,79,78,71]];
  for(const variant of variants){
   const info=row.kind==='cafe'?{tag:3,fieldCount:2,words:[variant.slice(3).filter(n=>n>0).length,...variant.slice(3).filter(n=>n>0)]}:{tag:4,fieldCount:5,words:[variant[0]]};
   const candidate={variant,editable:true,creationOnly:true};
   const args=row.kind==='cafe'?[candidate,undefined]:[undefined,candidate];
   const expected=inventoryChefAppearance(id,info);
   assert.ok(expected);
   assert.deepEqual(chefDraftAppearance(id,variant),expected);
   assert.deepEqual(inventoryChefAppearance(id,undefined,...args),expected);
   assert.equal(inventoryChefAppearance(id,undefined),null);
   assert.equal(inventoryChefAppearance(id,{tag:-2,fieldCount:0,words:[]},...args),null);
   if(row.kind==='cafe')assert.equal(chefDraftAppearance(id,[48,0,49,9,0,46]),null);
  }
 }
 assert.equal(chefDraftAppearance(0,[48,49,48,9,46,9]),null);
});
test('palette Add default preserves exact source words and saved appearance wins',async()=>{
 const {inventoryPaletteCardAppearance,paletteFromWords,paletteArtKey,CUSTOM_PALETTE_ITEM_ID}=await load('../src/inventory-palette-display.ts');
 const words=[0x3f800000,0,0,0x3f800000,0,0x3f800000,0,0x3f800000,0,0,0x3f800000,0x3f800000];
 const expected=paletteFromWords(words),original=inventoryPaletteCardAppearance(undefined,words);
 assert.deepEqual(original,expected);
 assert.equal(paletteArtKey(CUSTOM_PALETTE_ITEM_ID,original),paletteArtKey(CUSTOM_PALETTE_ITEM_ID,expected));
 assert.equal(inventoryPaletteCardAppearance(expected,Array(12).fill(0)),expected);
 assert.equal(inventoryPaletteCardAppearance(undefined,undefined),undefined);
 assert.equal(inventoryPaletteCardAppearance(undefined,[0]),undefined);
});

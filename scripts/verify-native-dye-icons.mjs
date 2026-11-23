#!/usr/bin/env node
/** Integrity QA for generated *original 2D game UiIcon* colorway PNGs. */
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {collectNativeSprites} from './generate-native-dye-icons.mjs';

const folder=resolve(process.argv[2]??'dist/native-colorways');
const manifest=JSON.parse(readFileSync(join(folder,'index.json'),'utf8'));
assert.equal(manifest.schema,'HKIA.NativeColorwayIcons.1');
assert.equal(manifest.version,'3.0.1');
const records=manifest.records;
const files=readdirSync(folder).filter(x=>x.endsWith('.png'));
const indexedGroups=new Map();
const indexedSheetHashes=new Map();
const coverage=manifest.coverage;
assert.ok(coverage&&Number.isInteger(coverage.sourceGroups)&&coverage.sourceGroups>0);
assert.equal(coverage.uniqueCandidates,coverage.generated+coverage.uncolorable);
assert.equal(coverage.generated,files.length);
assert.ok(coverage.nativeMatches>=coverage.generated);
assert.ok(coverage.ambiguous>=0&&coverage.unmatched>=0);
assert.equal(files.length,Object.keys(records).length,'no untracked colorway images');
for(const [id,r] of Object.entries(records)){
 assert.match(id,/^[1-9][0-9]{0,9}$/);
 assert.equal(r.file,id+'.png');
 assert.equal(r.sourceType,'original-uiicon-pixel-recolor');
 if(!indexedGroups.has(r.group))indexedGroups.set(r.group,collectNativeSprites(r.group));
 const originalPack=indexedGroups.get(r.group);
 assert.deepEqual(originalPack.sprites.get(id),{sheet:r.sheet,cell:r.cell},
  'the image must be produced from the same item ID original game icon');
 const sheetFile='sheet-'+String(r.sheet).padStart(3,'0')+'.webp';
 const cacheKey=r.group+'/'+sheetFile;
 if(!indexedSheetHashes.has(cacheKey))indexedSheetHashes.set(cacheKey,
  createHash('sha256').update(originalPack.files.get(sheetFile)).digest('hex'));
 assert.equal(r.sourceSheetSha256,indexedSheetHashes.get(cacheKey),
  'source icon atlas fingerprint must match the original shipped game asset');
 assert.equal(r.fidelity,'approximate','never claim exact game shader rendering');
 assert.ok(r.changedPixels>8);
 assert.ok(r.channels.length>=1&&r.channels.every(n=>Number.isInteger(n)&&n>=1&&n<=5));
 const data=readFileSync(join(folder,r.file));
 assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(data.readUInt32BE(16),96);
 assert.equal(data.readUInt32BE(20),96);
 assert.equal(data[25],6,'actual RGBA PNG preserves transparent icon background');
 assert.equal(createHash('sha256').update(data).digest('hex'),r.sha256);
}
for(const [left,right] of [
 ['704486536','585726126'],
 ['1286846063','935642973'],
 ['237080181','556476907'],
 ['307168230','404567552'],
 ['156787090','351352504'],
 ['522640238','571486471'],
 ['396678160','984341911'],
 ['1542238429','643288523'],
 ['1645062322','114494397'],
 ['1962363087','2051283646'],
 ['60984945','1976756152'],
 ['1516271219','2089088060'],
 ['290453986','808145972'],
 ['290453986','911692875'],
 ['290453986','1473720360'],
 ['1265055643','1046324850'],
 ['1265055643','1893329026'],
 ['1265055643','535112962'],
 ['84070359','833990488'],
 ['426901455','747035598'],
 ['1676813114','849273304'],
 ['2051522529','744815526'],
 ['1266418586','1590676460'],
 ['1881281725','886333968'],
 ['1944643209','1039676870'],
 ['77149467','370872413'],
 ['77149467','2022277447']
]){
 if(!records[left]||!records[right])continue;
 assert.equal(records[left].group,records[right].group);
 assert.equal(records[left].sheet,records[right].sheet);
 assert.equal(records[left].cell,records[right].cell);
 assert.notEqual(records[left].sha256,records[right].sha256,
  'game source icon must have visibly distinct dyed pixel output for this variant pair');
}
// A distinct bitmap alone is insufficient if an unrelated channel changed.
 // All original Camp Counselor Skort samples must render palette channel 2.
 for(const id of ['1645062322','114494397','1962363087','2051283646',
  '60984945','1976756152','1516271219','2089088060']){
  if(!records[id])continue;
  assert.equal(records[id].group,'collections_group_events');
  assert.equal(records[id].sheet,1);
  assert.equal(records[id].cell,21);
  assert.ok(records[id].channels.includes(2),
   'source Camp Counselor Skort PNG must truly apply native channel 2: '+id);
 }
// Original Steam v3.0.1 UiIcon 000/101 must actually render both source
// dye channels, not just produce distinct hashes from unrelated pixels.
for(const id of ['290453986','808145972','911692875','1473720360']){
 if(!records[id])continue;
 assert.equal(records[id].group,'collection_group_teagarden');
 assert.equal(records[id].sheet,0);
 assert.equal(records[id].cell,101);
 assert.ok(records[id].channels.includes(2),
  'native Flower Clip PNG must apply original game palette channel 2: '+id);
}
// Same-first native palette on verified 000/004 Frilled Bonnet source.
for(const id of ['1265055643','1046324850','1893329026','535112962']){
 if(!records[id])continue;
 assert.equal(records[id].group,'collection_group_teagarden');
 assert.equal(records[id].sheet,0);
 assert.equal(records[id].cell,4);
 assert.ok(records[id].channels.includes(2),
  'native Frilled Bonnet PNG must use original second dye: '+id);
}
// All seven shared-primary Triangle Shades pairs must use the source's
// distinct second dye channel on real generated 96px icon pixels.
for(const id of ['84070359','833990488','426901455','747035598',
 '1676813114','849273304','2051522529','744815526',
 '1266418586','1590676460','1881281725','886333968',
 '1944643209','1039676870']){
 if(!records[id])continue;
 assert.equal(records[id].group,'collections_group_clothing');
 assert.equal(records[id].sheet,0);
 assert.equal(records[id].cell,38);
 assert.ok(records[id].channels.includes(2),
  'Triangle Shades native second dye must alter source pixels: '+id);
}
// Native High Tea Elegant Hat original icon, sheet 000 cell 031:
// same-primary game colorways must genuinely apply channel 2.
for(const id of ['77149467','370872413','2022277447']){
 if(!records[id])continue;
 assert.equal(records[id].group,'collection_group_teagarden');
 assert.equal(records[id].sheet,0);
 assert.equal(records[id].cell,31);
 assert.ok(records[id].channels.includes(2),
  'game-original Elegant Hat bitmap must use second dye channel: '+id);
}
// Batch source-audited two-tone families. The original item-pack index
// and per-colorway PNG signatures, not a manually curated palette list,
// determine precisely which native variants belong to each original cell.
const nativeTwoToneSources=[
 // Final source-native channel 2 gaps verified in the original v3.0.1
 // game UiIcon index; matching PNG pixels must differ, not just metadata.
 ['collections_group_events',4,139,15],
 ['collections_group_events',10,4,14],
 ['collections_group_events',2,84,11],
 ['collections_group_events',1,61,10],
 ['collections_group_events',1,119,8],
 ['collections_group_events',10,6,8],
 ['collections_group_events',5,32,8],
 ['collections_group_events',5,78,8],
 ['collections_group_events',6,103,8],
 ['collections_group_events',10,52,7],
 // Actual Steam v3.0.1 Pink/Purple Bee UiIcon sources. The original
 // 11-ID family and per-item source palette must render nonidentically.
 ['collections_group_events',3,122,11],
 ['collections_group_events',3,54,11],
 ['collections_group_events',3,75,11],
 ['collections_group_events',4,105,11],
 ['collections_group_events',4,142,11],
 ['collections_group_events',4,81,11],
 ['collections_group_events',5,139,11],
 ['collections_group_events',5,3,11],
 ['collections_group_events',5,96,11],
 ['collections_group_events',6,67,11],
 ['collections_group_events',7,117,11],
 ['collections_group_events',7,28,11],
 // Original v3.0.1 City Town, Clothing and Events game sprites;
 // one same-first/different-second genuine dye pair in each.
 ['collection_group_citytown',2,76,18],
 ['collection_group_citytown',2,94,18],
 ['collection_group_citytown',0,126,15],
 ['collection_group_citytown',1,67,15],
 ['collections_group_clothing',0,104,17],
 ['collections_group_clothing',1,28,13],
 ['collections_group_clothing',0,19,12],
 ['collections_group_events',6,98,12],
 ['collections_group_events',0,104,11],
 ['collections_group_events',10,10,11],
 ['collections_group_events',2,108,11],
 ['collections_group_events',2,59,11],
 // Genuine Steam v3.0.1 game atlas and dye-palette cell mappings.
 // Each original source contains exactly one shared-primary /
 // distinct-secondary native Item ID pair.
 ['collection_group_citytown',1,11,24],
 ['collection_group_citytown',0,65,20],
 ['collection_group_citytown',1,61,18],
 ['collections_group_events',0,122,19],
 ['collections_group_events',1,127,22],
 // Original game atlas cell and palette audit: 3 same-first / different-
 // second pairs per outfit family. Generated real pixels must differ.
 // Source-neutral game items with exact 22 colorways apiece:
 // Night Cap, Striped Pajama Pants, Striped Pajama Shirt.
 // Original source Mermaids: 21 colorways and two same-first source
 // palette pairs for each tail design.
 // Verified neutral 2D original costume/eyewear source icons:
 // two same-primary / different-secondary pairs each.
 ['collections_group_events',1,103,11],
 ['collections_group_events',3,107,11],
 ['collections_group_events',0,6,8],
 ['collections_group_events',8,91,8],
 ['collections_group_events',1,19,21],
 ['collections_group_events',5,141,21],
 ['collections_group_events',6,136,21],
 ['collections_group_events',6,5,21],
 ['collections_group_clothing',0,24,22],
 ['collections_group_clothing',0,44,22],
 ['collections_group_clothing',0,77,22],
 ['collection_group_citytown',2,65,22],
 ['collections_group_clothing',1,36,15],
 ['collection_group_teagarden',0,74,38],
 ['collections_group_events',0,38,13],
 ['collections_group_events',1,29,13],
 ['collections_group_events',1,92,13],
 ['collections_group_events',2,118,13],
 ['collections_group_events',2,64,13],
 ['collections_group_events',3,47,13],
 ['collections_group_events',4,111,13],
 ['collections_group_events',5,120,13],
 ['collections_group_events',5,34,13],
 ['collections_group_events',5,40,13],
 ['collections_group_events',5,91,13],
 ['collections_group_events',5,93,13],
 ['collections_group_events',6,72,13],
 ['collections_group_events',7,1,13],
 ['collections_group_events',7,11,13],
 ['collections_group_events',7,130,13],
 ['collections_group_events',7,34,13],
 ['collections_group_events',7,56,13],
 ['collections_group_events',8,56,13],
 ['collections_group_events',9,33,13],
 ['collections_group_events',9,122,13],
 ['collection_group_teagarden',0,28,42],
 ['collection_group_teagarden',0,25,40],
 ['collection_group_teagarden',0,63,40],
 ['collection_group_teagarden',0,95,40],
 ['collection_group_teagarden',0,107,38],
 ['collection_group_teagarden',0,106,38],
 ['collection_group_teagarden',0,52,36],
 ['collection_group_teagarden',0,105,34],
 ['collections_group_clothing',0,39,12],
 ['collections_group_events',2,81,18],
 ['collections_group_events',4,109,12],
 ['collections_group_events',5,74,11],
 ['collections_group_events',7,121,22],
 ['collections_group_events',1,48,20],
 ['collections_group_events',4,39,23],
 ['collections_group_events',10,18,23],
 ['collections_group_events',7,48,22],
 ['collections_group_events',4,45,23],
 ['collections_group_events',8,137,23],
 ['collections_group_events',7,139,18],
 ['collections_group_events',6,58,18],
 ['collections_group_events',8,59,11],
 ['collections_group_events',10,63,11],
 ['collections_group_events',5,10,17],
 ['collections_group_events',6,21,16],
 ['collections_group_events',10,89,20],
 ['collections_group_events',4,110,20],
 ['collections_group_events',3,19,17],
 ['collections_group_events',10,69,18],
 ['collections_group_events',9,116,17]
];
const originalPalette=JSON.parse(readFileSync('public/native-dye-palettes.json','utf8')).records;
const originalItemNames=JSON.parse(readFileSync('public/source-names/en.json','utf8')).names;
for(const [group,sheet,cell,total] of nativeTwoToneSources){
 const gamePack=indexedGroups.get(group);
 assert.ok(gamePack,'original source atlas must be available: '+group);
 const ids=[...gamePack.sprites].filter(([,origin])=>
  origin.sheet===sheet&&origin.cell===cell).map(([id])=>id);
 assert.equal(ids.length,total,'original Item ID family size '+group+'/'+sheet+'/'+cell);
 const familyRecords=ids.map(id=>{
  const r=records[id];
  assert.ok(r,'missing native PNG for original Item ID '+id);
  assert.equal(r.group,group);
  assert.equal(r.sheet,sheet);
  assert.equal(r.cell,cell);
  assert.ok(r.channels.includes(2),
   'source-native 2nd dye must recolor real icon pixels: '+id);
  return [id,r];
 });
 if(group==='collections_group_events'&&ids.every(id=>originalItemNames[id]?.includes('Marching Band'))){
  // Every 13-item Marching Band family has ONE shared dark source
  // primary dye but 13 distinct game-defined second dye colors.
  assert.deepEqual([...new Set(ids.map(id=>originalPalette[id].colors[0]))],
   ['#3a3840']);
  assert.equal(new Set(ids.map(id=>originalPalette[id].colors[1])).size,13);
  assert.equal(new Set(familyRecords.map(([,r])=>r.sha256)).size,13,
   'all 13 game variants must be visually distinguishable: '+sheet+'/'+cell);
 }else{
  // Every verified same-primary / distinct-second source variant pair
  // must be visibly distinct, even if other material channels are unknown.
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
   const a=originalPalette[ids[i]].colors,b=originalPalette[ids[j]].colors;
   if(a[0]===b[0]&&a[1]!==b[1])
    assert.notEqual(records[ids[i]].sha256,records[ids[j]].sha256,
     'native second-dye item icon collision '+group+'/'+sheet+'/'+cell+': '+ids[i]+'/'+ids[j]);
  }
 }
}
console.log('HKIA_ORIGINAL_UICON_COLORWAYS_VERIFIED '+files.length+
 ' / '+coverage.uniqueCandidates+' source-unique, '+coverage.ambiguous+
 ' ambiguous, '+coverage.unmatched+' unmapped, '+coverage.uncolorable+' uncolorable across '+
 coverage.sourceGroups+' game pack groups');

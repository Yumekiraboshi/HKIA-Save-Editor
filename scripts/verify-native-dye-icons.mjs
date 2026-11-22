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
console.log('HKIA_ORIGINAL_UICON_COLORWAYS_VERIFIED '+files.length+
 ' / '+coverage.uniqueCandidates+' source-unique, '+coverage.ambiguous+
 ' ambiguous, '+coverage.unmatched+' unmapped, '+coverage.uncolorable+' uncolorable across '+
 coverage.sourceGroups+' game pack groups');

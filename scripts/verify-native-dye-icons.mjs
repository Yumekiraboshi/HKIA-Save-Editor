#!/usr/bin/env node
/** Integrity QA for generated *original 2D game UiIcon* colorway PNGs. */
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';

const folder=resolve(process.argv[2]??'dist/native-colorways');
const manifest=JSON.parse(readFileSync(join(folder,'index.json'),'utf8'));
assert.equal(manifest.schema,'HKIA.NativeColorwayIcons.1');
assert.equal(manifest.version,'3.0.1');
const records=manifest.records;
const files=readdirSync(folder).filter(x=>x.endsWith('.png'));
assert.equal(files.length,Object.keys(records).length,'no untracked colorway images');
for(const [id,r] of Object.entries(records)){
 assert.match(id,/^[1-9][0-9]{0,9}$/);
 assert.equal(r.file,id+'.png');
 assert.equal(r.sourceType,'original-uiicon-pixel-recolor');
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
 ['307168230','404567552']
]){
 if(!records[left]||!records[right])continue;
 assert.equal(records[left].group,records[right].group);
 assert.equal(records[left].sheet,records[right].sheet);
 assert.equal(records[left].cell,records[right].cell);
 assert.notEqual(records[left].sha256,records[right].sha256,
  'game source icon must have visibly distinct dyed pixel output for this variant pair');
}
console.log('HKIA_ORIGINAL_UICON_COLORWAYS_VERIFIED '+files.length);

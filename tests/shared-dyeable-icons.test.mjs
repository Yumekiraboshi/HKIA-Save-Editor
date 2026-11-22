import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
function readStoredZip(buffer){
 const files=new Map();let offset=0;
 while(offset+30<=buffer.length&&buffer.readUInt32LE(offset)===0x04034b50){
  const method=buffer.readUInt16LE(offset+8),flags=buffer.readUInt16LE(offset+6);
  const length=buffer.readUInt32LE(offset+18),unpacked=buffer.readUInt32LE(offset+22);
  const nameSize=buffer.readUInt16LE(offset+26),extra=buffer.readUInt16LE(offset+28);
  assert.equal(method,0);assert.equal(flags&8,0);assert.equal(length,unpacked);
  const name=buffer.toString('utf8',offset+30,offset+30+nameSize);
  const start=offset+30+nameSize+extra;
  assert.ok(start+length<=buffer.length);
  files.set(name,buffer.subarray(start,start+length));
  offset=start+length;
 }
 return files;
}
const catalog=JSON.parse(read('../public/catalog.json'));
const eventZip=readFileSync(new URL('../public/item-packs/collections_group_events.zip',import.meta.url));
const zipped=readStoredZip(eventZip);
const index=JSON.parse(zipped.get('index.json').toString('utf8'));
const iconCells=new Map(index.records.map(([id,page,cell])=>[id,{page,cell}]));

test('game-source dyeable items have many IDs sharing one native icon, not true variant-specific imagery',()=>{
 const sourcePairs=[
  {base:'item_c_dyeable_icarcherhat_',icecream:704486536,orange:585726126,sourceSpritePathId:'7834849297367771244'},
  {base:'item_c_dyeable_icarcheroutfit_',icecream:1286846063,orange:935642973,sourceSpritePathId:'4470433174330146938'}
 ];
 for(const {base,icecream,orange,sourceSpritePathId} of sourcePairs){
  const a=catalog.items.find(item=>item[0]===icecream);
  const b=catalog.items.find(item=>item[0]===orange);
  assert.ok(a&&b,'game-source item IDs missing: '+base);
  assert.equal(a[1],base+'icecream');
  assert.equal(b[1],base+'orange');
  assert.equal(a[3],'collections_group_events');
  assert.equal(b[3],a[3]);
  assert.deepEqual(iconCells.get(icecream),iconCells.get(orange),
   'the native UiIcon PPtr '+sourceSpritePathId+' is reused by both original colour variants');
  assert.ok(iconCells.has(icecream),'shipped pack must show the native icon');
 }
 const dyeable=catalog.items.filter(item=>item[1].startsWith('item_c_dyeable_'));
 assert.equal(dyeable.length,5383);
 assert.equal(new Set(dyeable.map(item=>item[0])).size,5383);
});

test('shared original icons receive source-palette pixel rendering without rings, swatches or explanatory banner',()=>{
 const app=read('../src/App.svelte');
 const copy=read('../src/ui-copy.ts');
 const localized=read('../src/ui-locales.ts');
 const style=read('../src/style.css');
 assert.match(app,/class="item-art" aria-hidden="true"/);
 assert.match(app,/class="item-sprite" style:background-image=/);
 assert.equal((app.match(/<DyeSprite /g)||[]).length,3);
 for(const prohibited of [/native-dye-ring/,/native-dye-preview/,/native-dye-swatch/,/hasSharedDyeableIcon/,/sharedDyeableIcon/]){
  assert.doesNotMatch(app,prohibited);
  assert.doesNotMatch(style,prohibited);
 }
 assert.doesNotMatch(copy,/sharedDyeableIcon/);
 assert.doesNotMatch(localized,/sharedDyeableIcon/);
 assert.doesNotMatch(style,/\\.item-sprite\\{[^}]*filter:(?:grayscale|saturate)/);
 assert.ok(read('../src/icon-packs.ts').includes('entries[String(id)]={url,x:(cell%12)*96,y:Math.floor(cell/12)*96,group,sheet,cell}'));
 assert.match(read('../src/dye-recolor.ts'),/sourceIconDyeRegions\(sourceKey,pixels\.data,SIDE,SIDE,sprite\)/);
});

test('native icon pack contains one precise sprite location for both variants with no fabricated recolour',()=>{
 for(const pair of [[704486536,585726126],[1286846063,935642973]]){
  const [a,b]=pair.map(id=>iconCells.get(id));
  assert.ok(a&&b);
  assert.deepEqual(a,b);
  const pageName='sheet-'+String(a.page).padStart(3,'0')+'.webp';
  const sheetFiles=[
   zipped,
   ...Array.from({length:5},(_,i)=>readStoredZip(readFileSync(new URL('../public/item-packs/collections_group_events-'+(i+1)+'.zip',import.meta.url))))
  ];
  const sheet=sheetFiles.find(files=>files.has(pageName))?.get(pageName);
  assert.ok(sheet,'missing native icon art '+pageName);
  assert.equal(sheet.toString('ascii',0,4),'RIFF');
  assert.equal(sheet.toString('ascii',8,12),'WEBP');
 }
});

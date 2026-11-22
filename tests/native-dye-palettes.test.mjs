import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({
 entryPoints:[fileURLToPath(new URL('../src/native-dye-palettes.ts',import.meta.url))],
 bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'
});
const {decodeNativeDyePalettes}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const source=JSON.parse(readFileSync(new URL('../public/native-dye-palettes.json',import.meta.url),'utf8'));

test('all 5,383 game-defined dyeable item IDs have exact dye refs and 2–5 real color channels',()=>{
 const map=decodeNativeDyePalettes(source);
 assert.equal(Object.keys(map).length,5383);
 assert.equal(source.total_native_dyes,1356);
 assert.equal(source.total_native_swatches,556);
 let withUnused=0;
 for(const item of Object.values(map)){
  assert.equal(item.colors.length,5);
  assert.ok(item.colors.filter(x=>x!==null).length>=2);
  if(item.colors.includes(null))withUnused++;
  for(const x of item.colors)assert.ok(x===null||/^#[0-9a-f]{6}$/.test(x));
 }
 assert.ok(withUnused>1000);
});

test('two archer-hat colorways share native artwork but have distinct exact palettes',()=>{
 const palette=decodeNativeDyePalettes(source);
 const ice=palette['704486536'],orange=palette['585726126'];
 const iceOutfit=palette['1286846063'],orangeOutfit=palette['935642973'];
 assert.deepEqual(ice,{dye:284,colors:['#ffbbfa','#c2feff','#f9faff','#ffbbfa','#f9faff']});
 assert.deepEqual(orange,{dye:773,colors:['#feffbd','#ffb337','#fdd900','#ffc615','#fdd900']});
 assert.deepEqual(ice,iceOutfit);
 assert.deepEqual(orange,orangeOutfit);
 assert.notDeepEqual(ice.colors,orange.colors);
});

test('the game palette database remains intact for future image recoloring but generates no UI overlays',()=>{
 const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
 const indexed=readFileSync(new URL('../src/native-dye-palettes.ts',import.meta.url),'utf8');
 assert.ok(indexed.includes('native-dye-palettes.json'));
 assert.match(app,/class="item-sprite" style:background-image=/);
 assert.match(app,/class="subcategory-art" aria-hidden="true"/);
 assert.match(app,/class="item-art" aria-hidden="true"/);
 assert.match(app,/class="date-dialog-art" aria-hidden="true"/);
 for(const prohibited of [/nativeDyeRing/,/nativeDyePalettes/,/native-dye-ring/,/native-dye-swatch/,/native-dye-preview/,/hasSharedDyeableIcon/,/sharedDyeableIcon/]){
  assert.doesNotMatch(app,prohibited);
  assert.doesNotMatch(css,prohibited);
 }
 assert.doesNotMatch(css,/\\.item-sprite\\s*\\{[^}]*filter:/);
});

test('corrupt, incomplete, mismatched or fabricated dye colors fail closed',()=>{
 const changed=[
  {...source,version:'3.0.2'},
  {...source,total_native_dyes:1355},
  {...source,definitions_sha256:'0'.repeat(64)},
  {...source,dyeconfig_sha256:'0'.repeat(64)},
  {...source,records:{}},
  {...source,records:{...source.records,'704486536':{dye:284,colors:['#nope',null,null,null,null]}}},
  {...source,records:{...source.records,'704486536':{dye:0,colors:['#fffafa','#fffafa',null,null,null]}}}
 ];
 for(const s of changed)assert.throws(()=>decodeNativeDyePalettes(s),/DYE_MAP_/);
});

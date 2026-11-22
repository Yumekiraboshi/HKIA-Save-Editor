import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const {outputFiles}=await build({
 entryPoints:[fileURLToPath(new URL('../src/native-dye-ring.ts',import.meta.url))],
 bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'
});
const {nativeDyeRing}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const source=JSON.parse(readFileSync(new URL('../public/native-dye-palettes.json',import.meta.url),'utf8'));

test('every native dye variation has its own exact source-colour identification ring',()=>{
 const entries=Object.entries(source.records);
 assert.equal(entries.length,5383);
 for(const [itemId,palette] of entries){
  const colors=palette.colors.filter(color=>color!==null);
  const ring=nativeDyeRing(palette);
  assert.ok(ring?.startsWith('conic-gradient(from -90deg, '),itemId);
  assert.equal(ring.match(/#[0-9a-f]{6}/g)?.length,colors.length,itemId);
  assert.deepEqual(ring.match(/#[0-9a-f]{6}/g),colors,itemId);
  assert.equal(ring.includes('undefined'),false,itemId);
  assert.equal(ring.includes('null'),false,itemId);
 }
});

test('the original archer artwork can stay identical while its exact palette ring differs',()=>{
 const cream=nativeDyeRing(source.records['704486536']);
 const orange=nativeDyeRing(source.records['585726126']);
 assert.notEqual(cream,orange);
 assert.match(cream,/#ffbbfa 0\.0000deg 72\.0000deg/);
 assert.match(orange,/#feffbd 0\.0000deg 72\.0000deg/);
 assert.equal(nativeDyeRing(source.records['1286846063']),cream);
 assert.equal(nativeDyeRing(source.records['935642973']),orange);
});

test('absent palettes and too-few verified channels cannot show fictional rings',()=>{
 assert.equal(nativeDyeRing(undefined),undefined);
 assert.equal(nativeDyeRing({dye:5,colors:[null,null,null,null,null]}),undefined);
 assert.equal(nativeDyeRing({dye:5,colors:['#ffaabb',null,null,null,null]}),undefined);
 assert.equal(nativeDyeRing({dye:5,colors:['#nothex','#ffaabb',null,null,null]}),undefined);
 const sample={dye:5,colors:['#000001',null,'#ffffff',null,'#aaaaaa']};
 assert.deepEqual(nativeDyeRing(sample).match(/#[0-9a-f]{6}/g),['#000001','#ffffff','#aaaaaa']);
});

test('collection tiles, nested previews and dialog use palette rings without modifying shared native icon pixels',()=>{
 const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
 assert.match(app,/import \{nativeDyeRing\} from '\.\/native-dye-ring'/);
 assert.equal((app.match(/class:native-dye-preview=/g)??[]).length,3);
 assert.equal((app.match(/style:--native-dye-ring=/g)??[]).length,3);
 assert.match(app,/nativeDyeRing\(nativeDyePalettes\[String\(item\[0\]\)\]\)/);
 assert.match(app,/nativeDyeRing\(nativeDyePalettes\[String\(sub\.previewId\)\]\)/);
 assert.match(app,/nativeDyeRing\(nativeDyePalettes\[String\(dateDialogItem\[0\]\)\]\)/);
 assert.match(css,/\.native-dye-preview::before\{/);
 assert.match(css,/background-image:var\(--native-dye-ring\)/);
 assert.match(css,/mask-image:radial-gradient/);
 assert.doesNotMatch(css,/\.item-sprite\{[^}]*filter:/);
});

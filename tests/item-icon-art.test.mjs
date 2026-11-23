import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

const {outputFiles}=await build({
 entryPoints:[fileURLToPath(new URL('../src/item-icon-art.ts',import.meta.url))],
 bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'
});
const {resolveItemIconArt,displayedDyeIconFidelity}=await import(
 'data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64')
);
const sprite={url:'blob:original-sheet',x:384,y:576,
 group:'collections_group_clothing',sheet:0,cell:77};
const originalById={'1286846063':sprite,'935642973':sprite};
const byId=(dyeable,more={})=>({originalById,dyeable,...more});

test('Item ID source icons are exact only for non-dyeable game items',()=>{
 assert.deepEqual(resolveItemIconArt(1286846063,byId(false)),{
  itemId:'1286846063',fidelity:'game-original',origin:'original-uiicon',sprite
 });
 assert.deepEqual(resolveItemIconArt(1286846063,byId(true)),{
  itemId:'1286846063',fidelity:'approximate',origin:'shared-uiicon-template',sprite
 });
});

test('registered verified reconstruction wins over 2D recolor and template',()=>{
 const art=resolveItemIconArt('1286846063',byId(true,{
  verifiedById:{'1286846063':'/variant-art/1286846063.png'},
  approximateById:{'1286846063':'/native-colorways/1286846063.png'}
 }));
 assert.deepEqual(art,{itemId:'1286846063',fidelity:'verified-reconstruction',
  origin:'verified-variant',url:'/variant-art/1286846063.png'});
});

test('approximate static images do not turn into exact originals',()=>{
 const result=resolveItemIconArt(1286846063,byId(true,{
  approximateById:{'1286846063':'/native-colorways/1286846063.png'}
 }));
 assert.deepEqual(result,{itemId:'1286846063',fidelity:'approximate',
  origin:'original-uiicon-pixel-recolor',url:'/native-colorways/1286846063.png'});
 assert.equal(resolveItemIconArt(1286846063,byId(false,{
  approximateById:{'1286846063':'/native-colorways/1286846063.png'}
 })).fidelity,'game-original');
});

test('never manufacture unavailable artwork or accept invalid native Item IDs',()=>{
 assert.deepEqual(resolveItemIconArt(987654321,byId(true)),{
  itemId:'987654321',fidelity:'unsupported',origin:'missing'
 });
 for(const id of [0,-1,'01','100000000000',4294967296,'../icon','__proto__',NaN,1.1]){
  assert.throws(()=>resolveItemIconArt(id,byId(true)),/ITEM_ICON_ID_OR_DYEABILITY_INVALID/);
 }
 assert.throws(()=>resolveItemIconArt(1,{originalById,dyeable:'yes'}),/ITEM_ICON_ID_OR_DYEABILITY_INVALID/);
});

test('pre-rendered native-colorways and runtime recolor remain approximate in UI',()=>{
 for(const source of ['original','native-icon','approximation'])
  assert.equal(displayedDyeIconFidelity(source),'approximate');
 assert.equal(displayedDyeIconFidelity('game-render'),'verified-reconstruction');
 const component=readFileSync(new URL('../src/DyeSprite.svelte',import.meta.url),'utf8');
 assert.match(component,/data-icon-fidelity=\{displayedDyeIconFidelity\(imageSource\)\}/);
});

test('audited original striped masks are flower patterns, not clothing UiIcon masks',()=>{
 const audit=JSON.parse(readFileSync(new URL('../data/unityfs-audit/iconcolormasks.v3.0.1.json',import.meta.url),'utf8'));
 assert.equal(audit.unityfsBundle,'atlas_iconcolormasks');
 assert.equal(audit.spriteObjects,171);
 assert.equal(audit.classification,'flower-pattern-masks');
 assert.equal(audit.applicableToClothingStripes,false);
 assert.equal(audit.provesUiIconRenderingFidelity,false);
});

test('named original colorway sprites stay distinct from verified game runtime renders',()=>{
 const url='/HKIA-Save-Editor/source-colorways/379863484.webp';
 assert.deepEqual(resolveItemIconArt(379863484,byId(true,{
  verifiedById:{'379863484':url},approximateById:{'379863484':'/native-colorways/379863484.png'}
 })),{itemId:'379863484',fidelity:'game-original',origin:'original-colorway-sprite',url});
 assert.equal(displayedDyeIconFidelity('game-source-sprite'),'game-original');
 assert.match(readFileSync(new URL('../src/DyeSprite.svelte',import.meta.url),'utf8'),/imageSource='game-source-sprite'/);
});

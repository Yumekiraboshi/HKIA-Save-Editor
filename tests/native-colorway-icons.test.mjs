import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

const {outputFiles}=await build({
 entryPoints:[fileURLToPath(new URL('../src/native-colorway-icons.ts',import.meta.url))],
 bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'
});
const {parseNativeColorwayIcons,loadNativeColorwayIcons}=await import('data:text/javascript;base64,'+
 Buffer.from(outputFiles[0].text).toString('base64'));
const sample={
 file:'1286846063.png',sha256:'a'.repeat(64),sourceSheetSha256:'b'.repeat(64),
 group:'collections_group_events',sheet:10,cell:103,dye:284,changedPixels:1200,
 sourceType:'original-uiicon-pixel-recolor',fidelity:'approximate',channels:[1,2,3]
};
const wrap=(records)=>({schema:'HKIA.NativeColorwayIcons.1',version:'3.0.1',records});

test('source HKIA UiIcon colorways resolve only original static item thumbnails',()=>{
 assert.deepEqual(parseNativeColorwayIcons(wrap({}),'/HKIA-Save-Editor/'),{});
 const result=parseNativeColorwayIcons(wrap({'1286846063':sample}),'/HKIA-Save-Editor/');
 assert.deepEqual(result,{'1286846063':'/HKIA-Save-Editor/native-colorways/1286846063.png?v='+sample.sha256});
});
test('a new game-icon PNG digest invalidates the old browser cache URL',()=>{
 const first=parseNativeColorwayIcons(wrap({'1286846063':sample}),'/');
 const revised=parseNativeColorwayIcons(wrap({'1286846063':{...sample,sha256:'c'.repeat(64)}}),'/');
 assert.notEqual(first['1286846063'],revised['1286846063']);
 assert.match(first['1286846063'],/^\/native-colorways\/1286846063\.png\?v=[a-f0-9]{64}$/);
 assert.equal(first['1286846063'],parseNativeColorwayIcons(wrap({'1286846063':sample}),'/')['1286846063'],
  'unchanged source game sprite uses a reusable cache URL');
});
test('native colorway manifest is revalidated rather than permanently cached',async()=>{
 const prior=globalThis.fetch;
 const calls=[];
 globalThis.fetch=async (...args)=>{
  calls.push(args);
  return {ok:true,json:async()=>wrap({'1286846063':sample})};
 };
 try {
  const result=await loadNativeColorwayIcons('/HKIA-Save-Editor/');
  assert.equal(result['1286846063'],'/HKIA-Save-Editor/native-colorways/1286846063.png?v='+sample.sha256);
  assert.deepEqual(calls,[['/HKIA-Save-Editor/native-colorways/index.json',{cache:'no-cache'}]]);
 } finally {globalThis.fetch=prior}
});
test('refuse arbitrary images, remote sources, missing hashes and false accuracy labels',()=>{
 const mistakes=[
  {file:'https://example.com/1286846063.png'},
  {file:'../1286846063.png'},{file:'935642973.png'},
  {sha256:'bad'}, {sourceSheetSha256:'bad'},
  {group:'../../something'},{cell:144},{sheet:-1},
  {channels:[0,2]}, {channels:[6]}, {channels:[]},
  {fidelity:'verified-game-shader'}, {sourceType:'3d-render'},
  {changedPixels:0}
 ];
 for(const bad of mistakes){
  assert.throws(()=>parseNativeColorwayIcons(wrap({'1286846063':{...sample,...bad}}),'/'),
   /NATIVE_COLORWAY_RECORD_INVALID/);
 }
 for(const base of ['https://another.site/','//evil.test/','/a/../b/','foo/']){
  assert.throws(()=>parseNativeColorwayIcons(wrap({'1286846063':sample}),base),
   /NATIVE_COLORWAY_INDEX_INVALID/);
 }
});
test('all native colorway UI views use original game-icon assets and keep per-item fallback',()=>{
 const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 const sprite=readFileSync(new URL('../src/DyeSprite.svelte',import.meta.url),'utf8');
 const generator=readFileSync(new URL('../scripts/generate-native-dye-icons.mjs',import.meta.url),'utf8');
 assert.match(app,/loadNativeColorwayIcons\(import\.meta\.env\.BASE_URL\)/);
 assert.equal((app.match(/previewUrl=\{nativeColorwayIcons/g)||[]).length,5);
 assert.match(app,/previewUrl=\{nativeColorwayIcons\[String\(representative\)\]\}/);
 assert.match(app,/previewUrl=\{nativeColorwayIcons\[String\(item\.itemId\)\]\}/);
 assert.match(sprite,/imageSource='native-icon'/);
 assert.match(sprite,/\.catch\(renderApproximation\)/);
 assert.match(sprite,/URL\.revokeObjectURL\(createdUrl\)/);
 assert.match(generator,/collectNativeSprites/);
 assert.match(generator,/sourceIconDyeRegions/);
 assert.match(generator,/recolorDyePixels/);
 assert.match(generator,/DYE_ICON_SOURCE_ALPHA_CHANGED/);
 assert.doesNotMatch(generator,/wiki\.gg|ImageGen|UnityEditor|UnityEngine/);
 assert.match(generator,/fidelity:'approximate'/);
});


test('calibrated source-sprite previews outrank ordinary approximation but never claim exactness',()=>{
 const id='1286846063',family='fixture-dress';
 const record={file:id+'.png',sha256:'c'.repeat(64),family,
  sourceType:'original-named-sprite-fit',fidelity:'approximate'};
 const fits={schema:'HKIA.SourceSpriteFit.1',fidelity:'approximate',
  families:{[family]:{anchorIds:[1,2,3],anchorSha256:Array(3).fill('d'.repeat(64)),
   sharedUiIconPathId:'-3327772517825296899',group:sample.group,sheet:sample.sheet,cell:sample.cell,
   meanMae:4.8,worstMae:6.1,alphaIdentical:true,method:'bounded-two-channel-neutral-lighting-v1'}},
  records:{[id]:record}};
 const native=wrap({[id]:sample});
 const expected='/native-colorways/source-fit/'+id+'.png?v='+record.sha256;
 assert.equal(parseNativeColorwayIcons({...native,sourceFits:fits},'/')[id],expected);
 const fallback=parseNativeColorwayIcons(native,'/')[id];
 for(const bad of [
  {...fits,fidelity:'verified-reconstruction'},
  {...fits,records:{[id]:{...record,fidelity:'verified-reconstruction'}}},
  {...fits,records:{[id]:{...record,file:'../'+id+'.png'}}},
  {...fits,families:{[family]:{...fits.families[family],meanMae:12}}},
  {...fits,families:{[family]:{...fits.families[family],cell:0}}},
  {...fits,families:{[family]:{...fits.families[family],anchorIds:[1,2,Number(id)]}}}
 ]){
  assert.equal(parseNativeColorwayIcons({...native,sourceFits:bad},'/')[id],fallback);
 }
});

test('v2 calibration rejects a preview beyond its original palette distance bound',()=>{
 const id='1286846063',family='fixture-dress',record={file:id+'.png',sha256:'c'.repeat(64),family,
  sourceType:'original-named-sprite-fit',fidelity:'approximate',nearestPaletteDistance:.2};
 const f={anchorIds:[1,2,3],anchorSha256:Array(3).fill('d'.repeat(64)),sharedUiIconPathId:'-3327772517825296899',
  group:sample.group,sheet:sample.sheet,cell:sample.cell,meanMae:5.8,worstMae:7.2,alphaIdentical:true,
  method:'palette-multiply-v2',calibration:{method:'palette-multiply-v2',gamma:1.45,penalty:0,chromaPrior:0,channels:[0,1,2,3,4]},
  maxPaletteDistance:.25,excludedIds:[]};
 const fits={schema:'HKIA.SourceSpriteFit.1',fidelity:'approximate',families:{[family]:f},records:{[id]:record}};
 const native=wrap({[id]:sample});
 assert.match(parseNativeColorwayIcons({...native,sourceFits:fits},'/')[id],/source-fit/);
 for(const bad of [
  {...fits,records:{[id]:{...record,nearestPaletteDistance:.3}}},
  {...fits,families:{[family]:{...f,excludedIds:[Number(id)]}}},
  {...fits,families:{[family]:{...f,calibration:{...f.calibration,channels:[0,0]}}}}
 ])assert.equal(parseNativeColorwayIcons({...native,sourceFits:bad},'/')[id],parseNativeColorwayIcons(native,'/')[id]);
});

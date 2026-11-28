import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const {outputFiles}=await build({
 entryPoints:[fileURLToPath(new URL('../src/variant-art.ts',import.meta.url))],
 bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'
});
const {parseVariantArtIndex,parseSourceColorwayIndex,parseDynamicColorwayIndex,parseNamedOriginalItemSprites,loadVariantArtIndex,loadVariantArtSources,createVariantArtSourceLoader}=await import(
 'data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64')
);
const read=(name)=>readFileSync(new URL(name,import.meta.url),'utf8');
const manifest=JSON.parse(read('../public/variant-art/index.json'));
const native=JSON.parse(read('../public/native-dye-palettes.json'));
const sources=JSON.parse(read('../public/source-colorways/index.json'));
const catalog=JSON.parse(read('../public/catalog.json'));
const dynamic=JSON.parse(read('../public/dynamic-colorways/index.json'));
const namedItemSprites=JSON.parse(read('../data/named-original-item-sprites-v3.0.1.json'));
const itemKeys=new Map(catalog.items.map(r=>[String(r[0]),r[1]]));
const example={
 file:'704486536.png',sha256:'a'.repeat(64),
 provenance:'game-render',
 source:'unityfs:l_basicstyle_fullbody_imaginationarcher'
};
const wrap=(records)=>({schema:'HKIA.DyeVariantArt.1',version:'3.0.1',records});

test('only explicit same-origin per-Item-ID reconstructed artwork can be registered',()=>{
 assert.deepEqual(parseVariantArtIndex(manifest,'/HKIA-Save-Editor/'),{});
 const r=parseVariantArtIndex(wrap({'704486536':example}),'/HKIA-Save-Editor/');
 assert.equal(r['704486536'],'/HKIA-Save-Editor/variant-art/704486536.png');
 assert.equal(Object.keys(r).length,1);
});

test('strict index rejects cross-origin links, wrong source IDs, traversal and missing provenance',()=>{
 for(const invalid of [
  {file:'https://example.com/img.png'},
  {file:'../../704486536.png'},
  {file:'585726126.png'},
  {file:'704486536.jpg'},
  {sha256:'short'},
  {provenance:'unverified-approximation'},
  {source:'oops'},
  {source:'https://hellokittyislandadventure.wiki.gg/wiki/File:Ice_Cream_Archer_Hat.png'},
  {provenance:'verified-game-capture'}
 ]){
  assert.throws(()=>parseVariantArtIndex(wrap({'704486536':{...example,...invalid}}),'/'),
   /VARIANT_ART_RECORD_INVALID/);
 }
 for(const base of ['https://example.org/','//evil.example/','/foo/../bar/','foo/']){
  assert.throws(()=>parseVariantArtIndex(wrap({'704486536':example}),base),
   /VARIANT_ART_BASE_INVALID/);
 }
 assert.throws(()=>parseVariantArtIndex(wrap({'0':example}),'/'),/VARIANT_ART_RECORD_INVALID/);
 assert.throws(()=>parseVariantArtIndex(wrap(Object.fromEntries([['__proto__',example]])),'/'),/VARIANT_ART_RECORD_INVALID/);
 assert.throws(()=>parseVariantArtIndex({...wrap({}),version:'1.0'},'/'),/VARIANT_ART_INDEX_INVALID/);
});

test('loader reads verified index through local deployment base only',async()=>{
 const previous=globalThis.fetch;
 const requests=[];
 try{
  globalThis.fetch=async (url,options)=>{
   requests.push({url,options});
   return {ok:true,json:async()=>url.endsWith('/source-colorways/index.json')?sources:url.endsWith('/dynamic-colorways/index.json')?dynamic:wrap({'704486536':example})};
  };
  const record=await loadVariantArtIndex('/HKIA-Save-Editor/');
  assert.equal(record['704486536'],parseDynamicColorwayIndex(dynamic,'/HKIA-Save-Editor/')['704486536']??parseSourceColorwayIndex(sources,'/HKIA-Save-Editor/')['704486536']);
  assert.equal(record['379863484'],'/HKIA-Save-Editor/source-colorways/379863484.webp');
  assert.equal(requests.length,3);
  assert.deepEqual(requests.map(r=>r.url).sort(),['/HKIA-Save-Editor/dynamic-colorways/index.json','/HKIA-Save-Editor/source-colorways/index.json','/HKIA-Save-Editor/variant-art/index.json']);
  assert.ok(requests.every(r=>r.options.cache==='no-cache'));
 }finally{
  globalThis.fetch=previous;
 }
});

test('every registered exact image is an audited, local, unmodified PNG or WebP',()=>{
 const indexed=parseVariantArtIndex(manifest,'/');
 const files=readdirSync(new URL('../public/variant-art/',import.meta.url))
  .filter(name=>name!=='index.json');
 assert.deepEqual(Object.keys(indexed).length,files.length,'no orphaned or untracked captures');
 for(const [id,record] of Object.entries(manifest.records)){
  assert.ok(native.records[id],'original game dye Item ID must exist');
  const data=readFileSync(new URL('../public/variant-art/'+record.file,import.meta.url));
  assert.ok(data.length>=40&&data.length<=2_000_000,'capture size budget');
  assert.equal(createHash('sha256').update(data).digest('hex'),record.sha256);
  if(record.file.endsWith('.png')){
   assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
   const width=data.readUInt32BE(16),height=data.readUInt32BE(20);
   assert.ok(width>=48&&height>=48&&width<=1024&&height<=1024);
  }else{
   assert.equal(data.toString('ascii',0,4),'RIFF');
   assert.equal(data.toString('ascii',8,12),'WEBP');
  }
 }
});

test('Collection and Inventory select original images without inferred recoloring',()=>{
 const app=read('../src/App.svelte'),sprite=read('../src/DyeSprite.svelte');
 assert.match(app,/createVariantArtSourceLoader\(import\.meta\.env\.BASE_URL\)/);
 assert.match(app,/function openInventoryTab\(\)\{\s*refreshVariantArtwork\(\)/);
 assert.match(app,/function selectCategory\(key:string\)\{\s*refreshVariantArtwork\(\)/);
 assert.match(app,/function goHome\(\)\{\s*refreshVariantArtwork\(\)/);
 assert.match(app,/<DyeSprite sprite=\{resultSprite\}[^>]*originalArtUrl=\{resultOriginal\}/);
 assert.equal((app.match(/exactArtUrl=\{/g)||[]).length,6);
 assert.match(app,/exactArtUrl=\{exactVariantArt\[String\(representative\)\]\}/);
 assert.equal((app.match(/originalArtUrl=\{/g)||[]).length,7);
 assert.match(app,/originalArtUrl=\{originalVariantArt\[String\(representative\)\]\}/);
 const view=read('../src/original-art-view.ts');
 assert.match(sprite,/return startOriginalArtRequest\(original,exact,/);
 assert.match(view,/const primary=original\?\?exact/);
 assert.match(view,/await attempt\(primary,0\)/);
 assert.match(view,/await registered\(original,base\)/);
 assert.match(view,/await attempt\(fallback,1\)/);
 assert.match(view,/if\(original&&exact!==primary\)await attempt\(exact,2\)/);
 assert.match(sprite,/sprite\?:SpriteCell;palette\?:NativeDyePalette/);
 assert.match(view,/if\(canceled\)return false/);
 assert.match(app,/exactVariantArt\[String\(item\.itemId\)\]/);
 assert.match(app,/exactVariantArt\[String\(sub\.previewId\)\]/);
 assert.match(app,/exactVariantArt\[String\(item\[0\]\)\]/);
 assert.match(app,/exactVariantArt\[String\(dateDialogItem\[0\]\)\]/);
 assert.match(view,/await picture\.decode\(\)/);
 assert.doesNotMatch(sprite,/renderApproximation|renderDyeSprite|source-fit|native-icon/);
 assert.match(sprite,/data-dye-source=\{imageSource\}/);
 assert.match(sprite,/imageSource='game-render'/);
 assert.match(sprite,/background-size=\{imageSource==='game-render'\?'contain'/);
 assert.match(view,/return \(\)=>\{canceled=true;untrackUnavailableArt\(retry\);\}/);
 assert.doesNotMatch(view,/renderApproximation|renderDyeSprite|source-fit|createObjectURL/);
 for(const prohibited of [/native-dye-ring/,/native-dye-swatch/,/native-dye-preview/]){
  assert.doesNotMatch(app,prohibited);
 }
});

test('all 362 named original colorway sprites match native Item ID, source key and immutable WebP bytes',()=>{
 const urls=parseSourceColorwayIndex(sources,'/');
 assert.equal(sources.definitionsSha256,native.definitions_sha256);
 assert.equal(sources.runtimeUiIconReferenceMatches,false);
 assert.equal(Object.keys(urls).length,362);
 const files=readdirSync(new URL('../public/source-colorways/',import.meta.url)).filter(x=>x!=='index.json');
 assert.equal(files.length,362);
 let atlas=0,direct=0,atlasObjects=0;
 for(const [id,r] of Object.entries(sources.records)){
  assert.ok(native.records[id]);
  assert.equal(itemKeys.get(id),r.itemKey);
  assert.equal(r.sourceSpriteName,'icon_'+r.itemKey);
  assert.notEqual(r.sourceSpritePathId,r.sharedUiIconPathId);
  const data=readFileSync(new URL('../public/source-colorways/'+r.file,import.meta.url));
  assert.equal(createHash('sha256').update(data).digest('hex'),r.sha256);
  assert.equal(data.toString('ascii',0,4),'RIFF');
  assert.equal(data.toString('ascii',8,12),'WEBP');
  assert.equal(data.toString('ascii',12,16),'VP8L');
  assert.equal(data[20],0x2f);
  const packed=data.readUInt32LE(21);
  assert.equal((packed&0x3fff)+1,96);
  assert.equal(((packed>>>14)&0x3fff)+1,96);
  if(r.sourceKind==='atlas'){atlas++;assert.equal(r.sourceSpriteMeshApplied,true);}
  if(r.sourceSpriteBundle==='atlas_global'){atlasObjects++;assert.match(r.pack,/^atlas-colorways-\d{2}\.zip$/);}
  if(r.sourceKind==='direct'){direct++;assert.equal(r.textureName,r.sourceSpriteName);}
 }
 assert.equal(direct,39);assert.equal(atlas,323);assert.equal(atlasObjects,276);
 assert.equal(sources.atlasOriginalPacks.reduce((sum,p)=>sum+p.count,0),276);
 assert.equal(sources.nativeUiIconAlphaVerification.alphaPixelsMatchedPerControl,9216);
});

test('source sprite loader refuses wrong item source names, paths, and runtime-fidelity claims',()=>{
 const id='379863484',original=sources.records[id];
 for(const changed of [
  {file:'../379863484.webp'},{file:'1.webp'},{sourceSpriteName:'icon_unrelated'},
  {sourceSpritePathId:original.sharedUiIconPathId},{textureSha256:'invalid'},
  {sourceKind:'unverified'},{sourceSpriteBundle:'definitions'},{pack:'../other.zip'}
 ]){
  assert.throws(()=>parseSourceColorwayIndex({...sources,records:{[id]:{...original,...changed}}},'/'),
   /SOURCE_COLORWAY_RECORD_INVALID/);
 }
 assert.throws(()=>parseSourceColorwayIndex({...sources,runtimeUiIconReferenceMatches:true},'/'),/SOURCE_COLORWAY_INDEX_INVALID/);
});

test('original source art survives an absent exact-render index and takes precedence over reconstruction',async()=>{
 const prev=globalThis.fetch;
 try{
  globalThis.fetch=async url=>url.includes('/source-colorways/')?
   {ok:true,json:async()=>sources}:{ok:false};
  assert.equal((await loadVariantArtIndex('/'))['379863484'],'/source-colorways/379863484.webp');
  globalThis.fetch=async url=>({ok:true,json:async()=>url.includes('/source-colorways/')?
   sources:wrap({'379863484':{...example,file:'379863484.png'}})});
  assert.equal((await loadVariantArtIndex('/'))['379863484'],'/source-colorways/379863484.webp');
  assert.equal((await loadVariantArtSources('/')).reconstructions['379863484'],'/variant-art/379863484.png');
 }finally{globalThis.fetch=prev;}
});

test('the newly extracted mint striped pajama source sprites are original colored art',()=>{
 for(const id of ['315822','421906853']){
  const r=sources.records[id];assert.equal(r.sourceSpriteBundle,'atlas_global');
  assert.ok(r.itemKey.startsWith('item_c_dyeable_stripedpajama'));
  assert.equal(parseSourceColorwayIndex(sources,'/')[id],'/source-colorways/'+id+'.webp');
 }
});

test('all 5383 native dye IDs resolve to one genuine original sprite with a verified local digest',()=>{
 const urls=parseDynamicColorwayIndex(dynamic,'/');
 const originalUrls=parseSourceColorwayIndex(sources,'/');
 assert.equal(Object.keys(urls).length,5344);
 assert.equal(Object.keys(originalUrls).length,362);
 assert.deepEqual(Object.keys({...urls,...originalUrls}).sort(),Object.keys(native.records).sort());
 assert.equal(readdirSync(new URL('../public/dynamic-colorways/',import.meta.url)).filter(x=>x.endsWith('.webp')).length,5344);
 for(const [id,hash] of Object.entries(dynamic.records)){
  if(Object.hasOwn(originalUrls,id))assert.equal(sources.records[id].sourceKind,'atlas');
  const data=readFileSync(new URL('../public/dynamic-colorways/'+id+'.webp',import.meta.url));
  assert.equal(createHash('sha256').update(data).digest('hex'),hash);
  assert.equal(urls[id],'/dynamic-colorways/'+id+'.webp?v='+hash);
 }
 assert.throws(()=>parseDynamicColorwayIndex({...dynamic,records:{...dynamic.records,1700096245:'invalid'}},'/'),/DYNAMIC_COLORWAY_RECORD_INVALID/);
 assert.throws(()=>parseDynamicColorwayIndex({...dynamic,records:{}},'/'),/DYNAMIC_COLORWAY_INDEX_INVALID/);
});

test('original source remains primary and verified reconstruction is retained as a separate fallback',async()=>{
 const prev=globalThis.fetch;
 try{
  globalThis.fetch=async url=>({ok:true,json:async()=>url.includes('/source-colorways/')?sources:url.includes('/dynamic-colorways/')?dynamic:wrap({'585726126':{...example,file:'585726126.png'}})});
  const {primary,originals,reconstructions}=await loadVariantArtSources('/');
  assert.equal(reconstructions['585726126'],'/variant-art/585726126.png');
  assert.equal(primary['585726126'],originals['585726126']);
  assert.equal(originals['585726126'],'/dynamic-colorways/585726126.webp?v='+dynamic.records['585726126']);
  assert.equal(Object.keys(originals).length,5384);
  assert.equal(originals['315822'],'/dynamic-colorways/315822.webp?v='+dynamic.records['315822']);
  assert.equal(originals['1393962785'],'/source-item-art/1393962785.png?v='+namedItemSprites.records['1393962785'].sha256);
 }finally{globalThis.fetch=prev;}
});

test('named non-dye original item uses exact source identity, validated local image, and no reconstructed color claim',async()=>{
 const [id,r]=Object.entries(namedItemSprites.records)[0];
 assert.equal(id,'1393962785');assert.equal(itemKeys.get(id),r.itemKey);
 assert.equal(r.sourceSpriteName,'icon_'+r.itemKey);assert.ok(!native.records[id]);
 const bundles=JSON.parse(read('../data/dynamic-colorway-packs/index.json')).sourceBundles;
 assert.ok(bundles.some(b=>b.name===r.sourceSpriteBundle&&b.sha256===r.sourceBundleSha256&&b.cab===r.cab));
 assert.equal(parseNamedOriginalItemSprites(namedItemSprites,'/')[id],'/source-item-art/'+r.file+'?v='+r.sha256);
 const bytes=readFileSync(new URL('../public/source-item-art/'+r.file,import.meta.url));
 assert.equal(bytes.length,r.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),r.sha256);
 assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(bytes.readUInt32BE(16),256);assert.equal(bytes.readUInt32BE(20),256);
 assert.equal(bytes[24],8);assert.equal(bytes[25],6);
 const {inflateSync}=await import('node:zlib');const chunks=[];
 for(let pos=8;pos<bytes.length;){const n=bytes.readUInt32BE(pos);assert.ok(pos+12+n<=bytes.length);if(bytes.toString('ascii',pos+4,pos+8)==='IDAT')chunks.push(bytes.subarray(pos+8,pos+8+n));pos+=12+n;}
 const filtered=inflateSync(Buffer.concat(chunks));assert.equal(filtered.length,256*1025);
 const rgba=Buffer.alloc(256*256*4);const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c};
 for(let y=0;y<256;y++){const t=filtered[y*1025];assert.ok(t<=4);for(let j=0;j<1024;j++){const k=y*1024+j,a=j>=4?rgba[k-4]:0,b=y?rgba[k-1024]:0,c=y&&j>=4?rgba[k-1028]:0;rgba[k]=(filtered[y*1025+j+1]+(t===0?0:t===1?a:t===2?b:t===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;}}
 assert.equal(createHash('sha256').update(rgba).digest('hex'),r.rgbaSha256);
 let visible=0;for(let n=3;n<rgba.length;n+=4)if(rgba[n])visible++;
 assert.equal(visible,r.visiblePixels);assert.equal(65536-visible,r.transparentPixels);
 for(const changes of [{file:'../1393962785.png'},{sourceSpriteName:'icon_unrelated'},{itemKey:'item_c_dyeable_unrelated'},{textureSha256:'bad'},{width:128}])assert.throws(()=>parseNamedOriginalItemSprites({...namedItemSprites,records:{[id]:{...r,...changes}}},'/'),/NAMED_ITEM_SPRITE_RECORD_INVALID/);
 assert.throws(()=>parseNamedOriginalItemSprites({...namedItemSprites,runtimeUiIconReferenceMatches:true},'/'),/NAMED_ITEM_SPRITE_INDEX_INVALID/);
});

test('a transient index failure never loses already loaded originals and retries only that source',async()=>{
 const prev=globalThis.fetch;
 const calls={source:0,dynamic:0,verified:0};
 let online=false;
 try{
  globalThis.fetch=async url=>{
   if(url.includes('/source-colorways/')){calls.source++;return {ok:true,json:async()=>sources};}
   if(url.includes('/dynamic-colorways/')){calls.dynamic++;return online?{ok:true,json:async()=>dynamic}:{ok:false};}
   calls.verified++;return {ok:true,json:async()=>wrap({})};
  };
  const load=createVariantArtSourceLoader('/');
  const first=load();assert.equal(load(),first);
  const partial=await first;
  assert.equal(Object.keys(partial.originals).length,363);
  assert.equal(partial.originals['315822'],'/source-colorways/315822.webp');
  assert.equal(calls.dynamic,1);
  online=true;
  const retry=load();assert.equal(load(),retry);
  const full=await retry;
  assert.equal(Object.keys(full.originals).length,5384);
  assert.equal(full.originals['315822'],'/dynamic-colorways/315822.webp?v='+dynamic.records['315822']);
  assert.equal(full.originals['1393962785'],partial.originals['1393962785']);
  await load();
  assert.deepEqual(calls,{source:1,dynamic:2,verified:1});
 }finally{globalThis.fetch=prev;}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({stdin:{contents:"export * from './wand-appearance'; export * from './dynamic-sprite-raster';",resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {resolveWandBaseTints,rasterizeDynamicSprite,overlayPlacement,sourceOver}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const dir=new URL('../public/dynamic-wand-art/',import.meta.url),read=n=>readFileSync(new URL(n,dir)),sha=b=>createHash('sha256').update(b).digest('hex');
const raw=read('wand-runtime-source-v3.0.1.json'),m=JSON.parse(raw);
const magic=new Map(m.magic.map(r=>[r.characteristicId,r.rgba])),flecks=new Map(m.flecks.map(r=>[r.characteristicId,r.rgba]));
test('original wand Refresh maps magic to Tint0, flecks to Tint1, leaves Tint2 white',()=>{
 assert.equal(sha(raw),'5d4d42d95417c8e6222747433b784a32ee9aaebb91216366a70645a33085f0bb');
 assert.deepEqual([...magic.keys()],[104,105,106,107,108,109,110,111,112,113,114,115,132]);
 assert.deepEqual([...flecks.keys()],[127,126,125]);
 for(const [mid,c0] of magic)for(const [fid,c1] of flecks)assert.deepEqual(resolveWandBaseTints({magicCharacteristicId:mid,fleckCharacteristicId:fid},magic,flecks),[c0,c1,[1,1,1,1]]);
 assert.equal(resolveWandBaseTints({magicCharacteristicId:9999,fleckCharacteristicId:125},magic,flecks),null);
 assert.equal(resolveWandBaseTints({magicCharacteristicId:104,fleckCharacteristicId:9999},magic,flecks),null);
});
test('nine dynamic wand base Sprite and standalone mask GUIDs resolve exactly',()=>{
 const audit=JSON.parse(readFileSync(new URL('../data/unityfs-audit/dynamic-uiicons.v3.0.1.json',import.meta.url),'utf8'));
 const rows=audit.rows.filter(r=>r.key.startsWith('item_wandcreation_'));
 assert.equal(rows.length,9);assert.equal(m.rows.length,9);assert.equal(new Set(m.rows.map(r=>r.itemId)).size,9);
 assert.equal(new Set(m.rows.map(r=>r.mask.spritePathId)).size,9);
 for(const row of m.rows){
  const a=rows.find(r=>r.itemId===row.itemId);assert.ok(a);
  assert.equal(row.definitionPathId,a.definitionPathId);assert.equal(row.base.spritePathId,a.baseSpritePathId);
  assert.equal(row.maskGuid,a.maskGuid);assert.match(row.maskBundle,/^l_shared_wand_/);
  assert.match(row.maskBundleSha256,/^[0-9a-f]{64}$/);assert.equal(row.mask.colorSpace,0);assert.equal(row.mask.filterMode,2);
  assert.equal(row.mask.settingsRaw,64);assert.equal(row.mask.mipCount,1);
  const [x,y,w,h]=row.base.sampleRect,[gx,gy,gw,gh]=row.base.guardRect;
  assert.ok(x-gx>=.5&&y-gy>=.5&&gx+gw-x-w>=.5&&gy+gh-y-h>=.5);
  assert.ok(gx+gw<=m.base.width&&gy+gh<=m.alphaOffsetY);
  const [mx,my,mw,mh]=row.mask.sampleRect;assert.ok(mx>=1&&my>=1&&mx+mw<=m.mask.width-1&&my+mh<=m.mask.height-1);
 }
 for(const a of [m.base,m.mask]){const b=read(a.file);assert.equal(b.length,a.bytes);assert.equal(sha(b),a.sha256);assert.equal(b.toString('ascii',8,16),'WEBPVP8L');}
});
test('linear-data mask is sampled without sRGB decoding, existing sRGB path is unchanged',()=>{
 const px=(width,height,rgba)=>({width,height,rgba:new Uint8ClampedArray(rgba)});
 // Two opaque source planes: white base color and full alpha.
 const base=px(1,2,[255,255,255,255,255,255,255,255]);
 const mask=px(1,1,[128,0,0,255]);
 const input={base,mask,baseRect:[0,0,1,1],maskRect:[0,0,1,1],trim:[0,0,1,1],alphaOffsetY:1,logicalSize:1,tints:[[0,0,0,1],[1,1,1,1],[1,1,1,1]]};
 const a=rasterizeDynamicSprite(input),b=rasterizeDynamicSprite({...input,maskColorSpace:'linear'});
 const p=(47*96+47)*4;
 assert.deepEqual(a,rasterizeDynamicSprite({...input,maskColorSpace:'srgb'}));
 assert.ok(a[p]>b[p]);assert.ok(Math.abs(b[p]-187)<=1);assert.equal(a[p+3],255);assert.equal(b[p+3],255);
});

test('native magic icon source map and all nine item transforms use exact original source',()=>{
 const bytes=read('wand-subicon-source-v3.0.1.json'),sub=JSON.parse(bytes);
 assert.equal(sha(bytes),'e69a97ec439e0574a024aaf9ec4379cb83d6946adc460cc2d7c53ab7b617d1a6');
 assert.deepEqual(sub.magic.map(x=>x.characteristicId),[...magic.keys()]);
 assert.equal(new Set(sub.magic.map(x=>x.spritePathId)).size,13);
 assert.equal(sub.wands.length,9);
 for(const w of sub.wands){
  assert.equal(w.definitionPathId,m.rows.find(x=>x.itemId===w.itemId).definitionPathId);
  assert.equal(w.scale,Math.fround(.4));assert.deepEqual(w.offsetPercent,[-.25,.25]);assert.equal(w.rotation,0);
 }
 const data=read(sub.texture.file);assert.equal(data.length,sub.texture.bytes);assert.equal(sha(data),sub.texture.sha256);
 assert.deepEqual(overlayPlacement(84,84,{logicalWidth:256,logicalHeight:128,scale:.4,offsetPercent:[-.25,.25],rotation:0}),{width:33.6,height:16.8,cx:21,cy:21,radians:0});
 assert.deepEqual(sourceOver([0,0,1,1],[1,0,0,.5]),[.5,0,.5,1]);
 assert.deepEqual(sourceOver([0,0,0,0],[1,0,0,.5]),[1,0,0,.5]);
});

test('item-derived overlays bind exact source definition and Sprite identities, without nested recoloring',()=>{
 const bytes=read('wand-item-subicon-source-v3.0.1.json'),source=JSON.parse(bytes);
 assert.equal(sha(bytes),'c5dce47482496e6ddda8b82bebfa845b519a37449228c4a88e894bad2c65e5f3');
 assert.equal(source.rows.length,25);
 assert.equal(new Set(source.rows.map(r=>r.itemId)).size,25);
 assert.equal(source.rows.filter(r=>r.spriteName.startsWith('icon_item_critter_')).length,24);
 assert.equal(source.rows.find(r=>r.itemId===1185152302).spriteName,'icon_item_gen_stick');
 for(const row of source.rows){
  assert.match(row.definitionPathId,/^-?\d+$/);assert.match(row.spritePathId,/^-?\d+$/);
  const a=source.textures[row.pack];assert.ok(a);
  const [l,t,r,b]=row.sampleClamp,[x,y,w,h]=row.sampleRect;
  assert.ok(x>=l-.5&&y>=t-.5&&x+w<=r+.5&&y+h<=b+.5);
  assert.ok(r<a.width&&b<source.alphaOffsetY);
 }
 for(const a of source.textures){const data=read(a.file);assert.equal(data.length,a.bytes);assert.equal(sha(data),a.sha256);}
});

 test('normal original collection cells are reused by exact Item ID, never a named dye sprite',async()=>{
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/wand-original-subicon.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
 const {selectWandOriginalCell,selectInventoryWandOriginalCell,normalizedWandOverlayPixels}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
 const group='collections_group_events',cell={url:'blob:original-sheet',x:96,y:0,group,sheet:0,cell:1};
 assert.deepEqual(selectWandOriginalCell(315822,group,{'315822':cell}),{itemId:315822,cell});
 assert.equal(selectWandOriginalCell(315823,group,{'315822':cell}),undefined);
 assert.equal(selectWandOriginalCell(371479572,group,{'371479572':cell}),undefined);
 assert.equal(selectWandOriginalCell(315822,group,{'315822':{...cell,url:'/dynamic-colorways/315822.webp'}}),undefined);
 assert.equal(selectWandOriginalCell(315822,group,{'315822':{...cell,x:0}}),undefined);
 const rgba=new Uint8ClampedArray(84*84*4);rgba.set([23,45,67,89]);
 const p=normalizedWandOverlayPixels(rgba);
 assert.deepEqual([p.width,p.height],[84,168]);
 assert.deepEqual([...p.rgba.slice(0,4)],[23,45,67,255]);
 assert.deepEqual([...p.rgba.slice(84*84*4,84*84*4+4)],[89,89,89,255]);
 const nativeCell={url:'/HKIA-Save-Editor/inventory-art/sheet-003.webp',x:96,y:384,sheet:3,cell:49};
 assert.deepEqual(selectInventoryWandOriginalCell(15761463,new Map([[15761463,nativeCell]])),{itemId:15761463,cell:nativeCell,kind:'inventory'});
 assert.equal(selectInventoryWandOriginalCell(15761463,new Map([[15761463,{...nativeCell,url:'/dynamic-colorways/15761463.webp'}]])),undefined);
 assert.equal(selectInventoryWandOriginalCell(803563219,new Map([[803563219,nativeCell]])),undefined);
 const full=new Uint8ClampedArray(96*96*4);full.set([3,4,5,6],(96*96-1)*4);
 const fullPlanes=normalizedWandOverlayPixels(full,96);
 assert.deepEqual([fullPlanes.width,fullPlanes.height],[96,192]);
 assert.deepEqual([...fullPlanes.rgba.slice(-4)],[6,6,6,255]);
 assert.throws(()=>normalizedWandOverlayPixels(new Uint8ClampedArray(8)));
 assert.equal(sha(read('native-placeholder.webp')),'0adfe05aff08f9988167c8e8a04b47bfe01cfb1b955aee56a70a2c29edc638c2');
 });

 test('all original ordinary item-wand candidate IDs have one known source-art route',()=>{
 const rule=readFileSync(new URL('../core/src/inventory_source_data.rs',import.meta.url),'utf8').split('pub(super) const RULES:')[1].split('];')[0];
 const ids=[...rule.matchAll(/\((\d+),(\d+)\)/g)].map(x=>Number(x[1]));
 const raw=readFileSync(new URL('../core/src/inventory_wand_ingredient_data.rs',import.meta.url),'utf8').split('=&[')[1].split('];')[0];
 const bits=[...raw.matchAll(/0x([0-9a-f]{2})/g)].map(x=>parseInt(x[1],16));
 const candidates=ids.filter((id,i)=>bits[i>>3]&(1<<(i&7)));
 const native=JSON.parse(readFileSync(new URL('../public/inventory-art/index.json',import.meta.url)));
 const catalog=JSON.parse(readFileSync(new URL('../public/catalog.json',import.meta.url)));
 const cat=new Set(catalog.items.map(r=>r[0])),extra=new Set(native.records.map(r=>r[0]));
 const withheld=new Map(native.withheld.map(r=>[r[0],r[2]]));
 assert.equal(candidates.length,8601);
 assert.equal(candidates.filter(id=>cat.has(id)).length,8205);
 assert.equal(candidates.filter(id=>extra.has(id)).length,393);
 assert.deepEqual(candidates.filter(id=>withheld.has(id)),[328475120,1254006907,1731977601]);
 assert.ok(candidates.filter(id=>withheld.has(id)).every(id=>withheld.get(id)==='source-placeholder'));
 assert.equal(candidates.filter(id=>[371479572,583339916,803563219,1057045178,1314269583].includes(id)).length,0);
 assert.ok(candidates.every(id=>cat.has(id)||extra.has(id)||withheld.has(id)));
 });

test('all native shared placeholder identities are reused by saved wand source selection',async()=>{
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/native-placeholder-art.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent',define:{'import.meta.env.BASE_URL':'"/"'}});
 const {hasNativePlaceholderArt,NATIVE_PLACEHOLDER_SPRITE}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
 const source=JSON.parse(readFileSync(new URL('../data/native-placeholder-main-routes-v3.0.1.json',import.meta.url)));
 const catalog=JSON.parse(readFileSync(new URL('../public/catalog.json',import.meta.url)));
 const native=JSON.parse(readFileSync(new URL('../public/inventory-art/index.json',import.meta.url)));
 const known=new Set([...catalog.items.map(r=>r[0]),...native.records.map(r=>r[0]),...native.withheld.map(r=>r[0])]);
 assert.equal(known.size,12163);
 assert.equal(NATIVE_PLACEHOLDER_SPRITE,source.sourceSpritePathId);
 assert.equal(source.ids.length,152);
 for(const id of known)assert.equal(hasNativePlaceholderArt(id),source.ids.includes(id));
 assert.equal(hasNativePlaceholderArt(0),false);
 assert.equal(hasNativePlaceholderArt(315823),false);
 for(const id of source.dynamicExcludedIds)assert.equal(hasNativePlaceholderArt(id),false);
 const runtime=readFileSync(new URL('../src/wand-runtime-art.ts',import.meta.url),'utf8');
 assert.ok(runtime.includes('hasNativePlaceholderArt(appearance.sourceItemId)'));
 assert.ok(runtime.includes('if(!originalCell||originalCell.itemId!==appearance.sourceItemId)return null;'));
 const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 assert.ok(app.includes('if(hasNativeWandArt(row.itemId))addWandSource('));
 assert.ok(app.includes('if(wandEdit&&hasNativeWandArt(wandEdit.itemId))addWandSource('));
});

test('all 12163 native Item IDs resolve a source Sprite for all wand shapes, including the ramen recipe alias',async()=>{
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/wand-runtime-art.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent',define:{'import.meta.env.BASE_URL':'"/"'}});
 const {wandOriginalTemplate}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
 const {gunzipSync}=await import('node:zlib');
 const envelope=JSON.parse(readFileSync(new URL('../public/inventory-native-categories.json',import.meta.url)));
 const bytes=gunzipSync(Buffer.from(envelope.data,'base64'));
 assert.equal(sha(bytes),envelope.rawSha256);
 const originalIds=new Set();let offset=0,id=0;
 while(offset<bytes.length){
  let part,shift=0,delta=0;
  do{part=bytes[offset++];delta+=(part&127)*2**shift;shift+=7;}while(part&128);
  id+=delta;offset++;originalIds.add(id);
 }
 assert.equal(originalIds.size,12163);
 const candidate=JSON.parse(read('candidate-source/index.json')),remaining=JSON.parse(read('remaining-source/index.json'));
 const mip=JSON.parse(read('mip-source/wand-mip-source.json')),nonSquare=JSON.parse(read('candidate-source/wand-nonsquare.json'));
 const aliases=JSON.parse(readFileSync(new URL('../data/wand-original-sprite-aliases-v3.0.1.json',import.meta.url)));
 const placeholders=JSON.parse(readFileSync(new URL('../data/native-placeholder-main-routes-v3.0.1.json',import.meta.url)));
 const atlas=JSON.parse(readFileSync(new URL('../public/inventory-art/index.json',import.meta.url)));
 const chef=JSON.parse(readFileSync(new URL('../public/dynamic-chef-art/chef-runtime-source-v3.0.1.json',import.meta.url)));
 const palette=JSON.parse(readFileSync(new URL('../public/dynamic-palette-art/palette-runtime-source-v3.0.1.json',import.meta.url)));
 const ramen=chef.rows.find(r=>r.itemId===1061947263);
 const recipe=atlas.records.find(r=>r[0]===964128772);
 assert.equal(recipe[3],ramen.base.spritePathId);
 assert.equal(recipe[3],atlas.withheld.find(r=>r[0]===1061947263)[1]);
 assert.equal(palette.rows.find(r=>r.kind==='base').spritePathId,atlas.withheld.find(r=>r[0]===1835273963)[1]);
 assert.deepEqual(wandOriginalTemplate(964128772),wandOriginalTemplate(1061947263));
 assert.equal(wandOriginalTemplate(315823),undefined);
 const templateIds=[...originalIds].filter(id=>wandOriginalTemplate(id));
 assert.deepEqual(templateIds.sort((a,b)=>a-b),[964128772,1061947263,1835273963]);
 const covered=new Set([...Object.keys(candidate.items).map(Number),...Object.keys(remaining.items).map(Number),...mip.rows.map(r=>r.itemId),...nonSquare.rows.map(r=>r.itemId),...aliases.rows.map(r=>r[0]),...placeholders.ids,...templateIds]);
 assert.deepEqual(covered,originalIds);
 const sprites=new Set([...candidate.sprites.map(r=>r[0]),...remaining.sprites.map(r=>r[0]),...mip.rows.map(r=>r.spritePathId),...nonSquare.rows.map(r=>r.spritePathId),ramen.base.spritePathId,palette.rows.find(r=>r.kind==='base').spritePathId]);
 assert.equal(sprites.size,5020);
});

/** Browser fixture for the real runtime modules and actual original textures.
 * No synthetic save decoder, no exported game captures, no production test UI. */
import assert from 'node:assert/strict';
import {wandNonSquareSmoke} from './wand-nonsquare-smoke.mjs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
export async function wandRuntimeSmoke(browser,origin,base){
 await wandNonSquareSmoke(browser,origin,base);
 const {outputFiles}=await build({
  stdin:{contents:"export * from './wand-runtime-art'; export * from './wand-original-subicon'; export {initialInventoryNativeArt} from './inventory-native-art'; export {loadChefOriginalOverlay} from './chef-runtime-art'; export {loadPaletteOriginalOverlay} from './palette-runtime-art'; export {loadIconPack} from './icon-packs'; export {loadInventoryNativeArt} from './inventory-native-art';",resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'ts'},
  bundle:true,write:false,format:'esm',platform:'browser',define:{'import.meta.env.BASE_URL':JSON.stringify(base)}
 });
 const context=await browser.newContext();
 try{
  const page=await context.newPage();
  const root=origin+base;
  await page.route(root+'__wand_runtime_fixture__.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.route(root+'__wand_runtime_fixture__.mjs',r=>r.fulfill({contentType:'text/javascript',body:outputFiles[0].text}));
  await page.goto(root+'__wand_runtime_fixture__.html');
  const out=await page.evaluate(async base=>{
   const {renderWandBaseArt,renderWandOriginalBaseArt,renderWandMagicArt,renderWandArt,selectWandOriginalCell,selectInventoryWandOriginalCell,loadIconPack,loadInventoryNativeArt,initialInventoryNativeArt}=await import(base+'__wand_runtime_fixture__.mjs');
   const m=await (await fetch(base+'dynamic-wand-art/wand-runtime-source-v3.0.1.json')).json();
   const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
   const pixels=async blob=>{
    if(!blob)throw Error('missing generated blob');
    const im=await createImageBitmap(blob);
    const c=document.createElement('canvas');c.width=im.width;c.height=im.height;
    const ctx=c.getContext('2d');ctx.drawImage(im,0,0);im.close();
    const data=ctx.getImageData(0,0,c.width,c.height).data;
    const alpha=data.filter((_,i)=>i%4===3);
    return {width:c.width,height:c.height,alpha:await sha(alpha.buffer),rgba:await sha(data.buffer),visible:alpha.some(v=>v>200)};
   };
   const rows=[];
   for(const row of m.rows){
    const a={magicCharacteristicId:104,fleckCharacteristicId:125};
    const b={magicCharacteristicId:109,fleckCharacteristicId:127};
    const first=await renderWandBaseArt(row.itemId,a),second=await renderWandBaseArt(row.itemId,b);
    const original=await renderWandOriginalBaseArt(row.itemId);
    rows.push({id:row.itemId,a:await pixels(first),b:await pixels(second),original:await pixels(original),originalCache:original===await renderWandOriginalBaseArt(row.itemId),cache:first===await renderWandBaseArt(row.itemId,a)});
   }
   const composed=[];
   for(const magic of m.magic){
    const a={sourceItemId:0,magicCharacteristicId:magic.characteristicId,fleckCharacteristicId:125};
    const one=await renderWandMagicArt(39246601,a),baseArt=await renderWandBaseArt(39246601,a);
    composed.push({id:magic.characteristicId,pixels:await pixels(one),base:await pixels(baseArt),cached:one===await renderWandMagicArt(39246601,a)});
   }
   const itemManifest=await (await fetch(base+'dynamic-wand-art/wand-item-subicon-source-v3.0.1.json')).json();
   const itemRows=[];
   for(const icon of itemManifest.rows){
    const a={sourceItemId:icon.itemId,magicCharacteristicId:104,fleckCharacteristicId:125};
    const id=icon.itemId===1185152302?384749651:1304219546;
    const result=await renderWandArt(id,a),plain=await renderWandBaseArt(id,a);
    itemRows.push({id:icon.itemId,result:await pixels(result),plain:await pixels(plain),cache:result===await renderWandArt(id,{...a,sourceUnique:{tag:7,words:[6,1,0,0]}})});
   }
   // Use the actual original shared striped pajama Sprite, not its
   // completed mint colorway image. The existing catalog identifies its group.
   const catalog=await (await fetch(base+'catalog.json')).json();
   const definition=catalog.items.find(r=>r[0]===315822);
   const pack=await loadIconPack(definition[3],base);
   let added;
   try{
    const cell=selectWandOriginalCell(315822,definition[3],pack.entries);
    const a={sourceItemId:315822,magicCharacteristicId:104,fleckCharacteristicId:125};
    const first=await renderWandArt(384749651,a,cell);
    added={art:await pixels(first),plain:await pixels(await renderWandBaseArt(384749651,a)),
     cached:first===await renderWandArt(384749651,a,cell),
     mismatch:await renderWandArt(384749651,{...a,sourceItemId:315823},cell)===null,
     noCell:first===await renderWandArt(384749651,a)};
   }finally{pack.dispose();}
   const inventory=await loadInventoryNativeArt(base);
   const inventoryCell=selectInventoryWandOriginalCell(15761463,inventory.entries);
   const invAppearance={sourceItemId:15761463,magicCharacteristicId:104,fleckCharacteristicId:125};
   const invBlob=await renderWandArt(384749651,invAppearance,inventoryCell);
   const inv={art:await pixels(invBlob),plain:await pixels(await renderWandBaseArt(384749651,invAppearance)),
    cache:invBlob===await renderWandArt(384749651,invAppearance,inventoryCell)};
   const directSources=[];
   for(const sourceItemId of [608452994,750862373,42715431,1026094637,587092528,1787941842,33246451,1678725721,90977533]){
    const a={...invAppearance,sourceItemId};const blob=await renderWandArt(384749651,a);
    directSources.push({pixels:await pixels(blob),cached:blob===await renderWandArt(384749651,a)});
   }
   const placeholders=[];
   for(const sourceItemId of initialInventoryNativeArt().placeholders){
    const blob=await renderWandArt(384749651,{...invAppearance,sourceItemId});
    placeholders.push({pixels:await pixels(blob),same:blob===await renderWandArt(384749651,{...invAppearance,sourceItemId:328475120})});
   }
   // Nul Rug is a verified inventory-only UiIcon outside the sampled set.
   // Its display does not imply a legal wand creation ingredient.
   const outsideId=427689,cell=selectInventoryWandOriginalCell(outsideId,inventory.entries);
   const outside=[];
   for(const row of m.rows){
    const a={...invAppearance,sourceItemId:outsideId};
    const blob=await renderWandArt(row.itemId,a,cell);
    outside.push({id:row.itemId,art:await pixels(blob),plain:await pixels(await renderWandBaseArt(row.itemId,a)),
     cached:blob===await renderWandArt(row.itemId,a,cell),
     noCell:await renderWandArt(row.itemId,a)===null,
     mismatched:await renderWandArt(row.itemId,{...a,sourceItemId:315823},cell)===null});
   }
   // The native saved source selection is independent of the wand shape.
   // This proves rendering only, not creation eligibility for these pairs.
   const templateRows=[];
   for(const row of m.rows){
    const a={magicCharacteristicId:104,fleckCharacteristicId:125};
    const plain=await pixels(await renderWandBaseArt(row.itemId,a));
    for(const sourceItemId of [1061947263,1835273963]){
     const appearance={...a,sourceItemId};
     const blob=await renderWandArt(row.itemId,appearance);
     templateRows.push({id:row.itemId,sourceItemId,art:await pixels(blob),plain:plain.rgba,
      cached:blob===await renderWandArt(row.itemId,{...appearance,sourceUnique:{tag:6,words:[1,2,3]}})});
    }
   }
   const allShapes=[];
   for(const row of m.rows){
    const a={magicCharacteristicId:104,fleckCharacteristicId:125};
    const plain=await pixels(await renderWandBaseArt(row.itemId,a));
    for(const sourceItemId of [315822,15761463,328475120,608452994]){
     const appearance={...a,sourceItemId};
     const blob=await renderWandArt(row.itemId,appearance);
     allShapes.push({id:row.itemId,sourceItemId,art:await pixels(blob),plain:plain.rgba,cached:blob===await renderWandArt(row.itemId,appearance)});
    }
    if(await renderWandArt(row.itemId,{...a,sourceItemId:315823})!==null)throw Error('UNKNOWN_SOURCE_RENDERED');
   }
   return {rows,composed,itemRows,added,inv,directSources,placeholders,outside,allShapes,templateRows,unknownOriginal:await renderWandOriginalBaseArt(0)===null,unsupportedSource:await renderWandArt(39246601,{sourceItemId:315823,magicCharacteristicId:104,fleckCharacteristicId:125})===null,unknown:await renderWandBaseArt(39246601,{magicCharacteristicId:999999,fleckCharacteristicId:125})===null};
  },base);
  assert.equal(out.rows.length,9);assert.ok(out.unknown&&out.unknownOriginal);
  assert.equal(out.composed.length,13);assert.ok(out.unsupportedSource);
  assert.equal(out.templateRows.length,18);
  for(const row of out.templateRows){assert.ok(row.art.visible&&row.cached);assert.notEqual(row.art.rgba,row.plain);}
  for(const id of new Set(out.templateRows.map(r=>r.id)))assert.equal(new Set(out.templateRows.filter(r=>r.id===id).map(r=>r.art.rgba)).size,2);
  assert.equal(out.outside.length,9);
  for(const row of out.outside){assert.ok(row.art.visible&&row.cached&&row.noCell&&row.mismatched);assert.notEqual(row.art.rgba,row.plain.rgba);}
  assert.equal(out.allShapes.length,36);assert.equal(new Set(out.allShapes.map(r=>r.id)).size,9);
  for(const row of out.allShapes){assert.ok(row.art.visible&&row.cached);if(row.sourceItemId!==328475120)assert.notEqual(row.art.rgba,row.plain);}
  for(const id of new Set(out.allShapes.map(r=>r.id)))assert.equal(new Set(out.allShapes.filter(r=>r.id===id&&r.sourceItemId!==328475120).map(r=>r.art.rgba)).size,3);
  assert.equal(out.itemRows.length,25);
  assert.ok(out.added.art.visible&&out.added.cached&&out.added.mismatch&&out.added.noCell);
  assert.notEqual(out.added.art.rgba,out.added.plain.rgba);
  assert.ok(out.inv.art.visible&&out.inv.cache);assert.notEqual(out.inv.art.rgba,out.inv.plain.rgba);
  assert.equal(out.directSources.length,9);assert.ok(out.directSources.every(r=>r.pixels.visible&&r.cached));
  assert.equal(new Set(out.directSources.map(r=>r.pixels.rgba)).size,9);
  assert.equal(out.placeholders.length,152);assert.ok(out.placeholders.every(r=>r.pixels.visible&&r.same));
  assert.notEqual(out.placeholders[0].pixels.rgba,out.inv.plain.rgba);
  for(const r of out.itemRows){assert.ok(r.result.visible&&r.cache);assert.notEqual(r.result.rgba,r.plain.rgba);}
  assert.equal(new Set(out.itemRows.map(r=>r.result.rgba)).size,25);
  for(const c of out.composed){assert.ok(c.pixels.visible&&c.cached);assert.notEqual(c.pixels.rgba,c.base.rgba);}
  for(const row of out.rows){
   assert.equal(row.a.width,96);assert.equal(row.a.height,96);assert.ok(row.a.visible&&row.b.visible);
   assert.equal(row.a.alpha,row.b.alpha);assert.notEqual(row.a.rgba,row.b.rgba,'same item must render different original color inputs: '+row.id);
   assert.ok(row.cache&&row.originalCache&&row.original.visible);
   assert.equal(row.original.alpha,row.a.alpha);
   assert.equal(row.original.width,96);assert.equal(row.original.height,96);
  }
  // Fresh page modules ensure neither the manifest nor decoded textures
  // are cached before injecting failures in the optional guarded pack.
  for(const pattern of ['**/wand-item-subicon-source-v3.0.1.json','**/wand-item-overlay-v3.0.1-*.webp']){
   const failurePage=await context.newPage();
   try{
    await failurePage.route(root+'__wand_runtime_fixture__.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
    await failurePage.route(root+'__wand_runtime_fixture__.mjs',r=>r.fulfill({contentType:'text/javascript',body:outputFiles[0].text}));
    await failurePage.route(pattern,r=>r.fulfill({status:503,body:'unavailable'}));
    await failurePage.goto(root+'__wand_runtime_fixture__.html');
    const failed=await failurePage.evaluate(async base=>{
     const {renderWandArt,renderWandBaseArt}=await import(base+'__wand_runtime_fixture__.mjs');
     const a={magicCharacteristicId:104,fleckCharacteristicId:125};
     const render=id=>renderWandArt(384749651,{...a,sourceItemId:id});
     const first=await render(315822),guarded=await render(1185152302);
     const plain=await renderWandBaseArt(384749651,a);
     const bytes=async blob=>blob?Array.from(new Uint8Array(await blob.arrayBuffer())):null;
     return {first:await bytes(first),guarded:await bytes(guarded),plain:await bytes(plain),
      cached:first===await render(315822),
      unknown:await render(315823)===null,
      shaped:await bytes(await renderWandArt(1304219546,{...a,sourceItemId:315822})),
      shapedUnknown:await renderWandArt(1304219546,{...a,sourceItemId:7285157})===null};
    },base);
    assert.ok(failed.first&&failed.guarded&&failed.plain&&failed.cached&&failed.unknown&&failed.shaped&&failed.shapedUnknown,pattern);
    assert.notDeepEqual(failed.first,failed.plain,pattern);
    assert.notDeepEqual(failed.guarded,failed.plain,pattern);
    assert.notDeepEqual(failed.first,failed.guarded,pattern);
   }finally{await failurePage.close();}
  }
  // If the preferred sample index is unavailable, both already-published
  // original collection and inventory cells remain usable for every shape.
  const fallbackPage=await context.newPage();
  try{
   await fallbackPage.route(root+'__wand_runtime_fixture__.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
   await fallbackPage.route(root+'__wand_runtime_fixture__.mjs',r=>r.fulfill({contentType:'text/javascript',body:outputFiles[0].text}));
   await fallbackPage.route('**/dynamic-wand-art/candidate-source/index.json',r=>r.fulfill({status:503,body:'unavailable'}));
   await fallbackPage.goto(root+'__wand_runtime_fixture__.html');
   const results=await fallbackPage.evaluate(async base=>{
    const {renderWandArt,renderWandBaseArt,selectWandOriginalCell,selectInventoryWandOriginalCell,loadIconPack,loadInventoryNativeArt}=await import(base+'__wand_runtime_fixture__.mjs');
    const catalog=await (await fetch(base+'catalog.json')).json();
    const definition=catalog.items.find(r=>r[0]===315822),pack=await loadIconPack(definition[3],base);
    try{
     const native=await loadInventoryNativeArt(base);
     const cells=[selectWandOriginalCell(315822,definition[3],pack.entries),selectInventoryWandOriginalCell(15761463,native.entries)];
     const manifest=await (await fetch(base+'dynamic-wand-art/wand-runtime-source-v3.0.1.json')).json();
     const out=[];
     for(const row of manifest.rows)for(const cell of cells){
      if(!cell)throw Error('missing original cell');
      const a={sourceItemId:cell.itemId,magicCharacteristicId:104,fleckCharacteristicId:125};
      const blob=await renderWandArt(row.itemId,a,cell),plain=await renderWandBaseArt(row.itemId,a);
      if(!blob||!plain)throw Error('missing fallback art');
      const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer()))).join(',');
      out.push({different:await sha(blob)!==await sha(plain),cached:blob===await renderWandArt(row.itemId,a,cell),missing:await renderWandArt(row.itemId,a)===null});
     }
     return out;
    }finally{pack.dispose();}
   },base);
   assert.equal(results.length,18);assert.ok(results.every(r=>r.different&&r.cached&&r.missing));
  }finally{await fallbackPage.close();}
  // Untinted source overlay has no dependency on the source item's mask.
  const templatePage=await context.newPage();
  try{
   await templatePage.route(root+'__wand_runtime_fixture__.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
   await templatePage.route(root+'__wand_runtime_fixture__.mjs',r=>r.fulfill({contentType:'text/javascript',body:outputFiles[0].text}));
   const requestedMasks=[];
   await templatePage.route(/\/(?:inventory-flower-art\/flower-mask-rgb-v3\.0\.1|dynamic-palette-art\/palette-mask-rgb-v3\.0\.1)\.webp$/,r=>{requestedMasks.push(r.request().url());return r.fulfill({status:503,body:'unavailable'});});
   await templatePage.goto(root+'__wand_runtime_fixture__.html');
   const results=await templatePage.evaluate(async base=>{
    const {renderWandArt,loadChefOriginalOverlay,loadPaletteOriginalOverlay}=await import(base+'__wand_runtime_fixture__.mjs');
    const transform={scale:.4,offsetPercent:[-.25,.25],rotation:0};
    const chef=await loadChefOriginalOverlay(1061947263,transform),palette=await loadPaletteOriginalOverlay(1835273963,transform);
    const a={magicCharacteristicId:104,fleckCharacteristicId:125};
    return {chef:chef?.spritePathId,palette:palette?.spritePathId,
     chefRendered:!!await renderWandArt(39246601,{...a,sourceItemId:1061947263}),
     paletteRendered:!!await renderWandArt(39246601,{...a,sourceItemId:1835273963}),
     wrongChef:await loadChefOriginalOverlay(1835273963,transform)===null,
     wrongPalette:await loadPaletteOriginalOverlay(1061947263,transform)===null};
   },base);
   assert.deepEqual(results,{chef:'-3674899348677039372',palette:'4281893961233162555',chefRendered:true,paletteRendered:true,wrongChef:true,wrongPalette:true});
   assert.deepEqual(requestedMasks,[]);
  }finally{await templatePage.close();}
  console.log('CHROMIUM DYNAMIC WAND BASE PASS: 9 native wand base layers, color variants, alpha, shared cache and unknown-ID refusal');
 }finally{await context.close();}
}

/** Browser fixture for the real runtime modules and actual original textures.
 * No synthetic save decoder, no exported game captures, no production test UI. */
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
export async function wandRuntimeSmoke(browser,origin,base){
 const {outputFiles}=await build({
  stdin:{contents:"export * from './wand-runtime-art'; export * from './wand-original-subicon'; export {loadIconPack} from './icon-packs'; export {loadInventoryNativeArt} from './inventory-native-art';",resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'ts'},
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
   const {renderWandBaseArt,renderWandMagicArt,renderWandArt,selectWandOriginalCell,selectInventoryWandOriginalCell,loadIconPack,loadInventoryNativeArt}=await import(base+'__wand_runtime_fixture__.mjs');
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
    rows.push({id:row.itemId,a:await pixels(first),b:await pixels(second),cache:first===await renderWandBaseArt(row.itemId,a)});
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
     noCell:await renderWandArt(384749651,a)===null};
   }finally{pack.dispose();}
   const inventory=await loadInventoryNativeArt(base);
   const inventoryCell=selectInventoryWandOriginalCell(15761463,inventory.entries);
   const invAppearance={sourceItemId:15761463,magicCharacteristicId:104,fleckCharacteristicId:125};
   const invBlob=await renderWandArt(384749651,invAppearance,inventoryCell);
   const inv={art:await pixels(invBlob),plain:await pixels(await renderWandBaseArt(384749651,invAppearance)),
    cache:invBlob===await renderWandArt(384749651,invAppearance,inventoryCell)};
   const placeholders=[];
   for(const sourceItemId of [328475120,1254006907,1731977601]){
    const blob=await renderWandArt(384749651,{...invAppearance,sourceItemId});
    placeholders.push({pixels:await pixels(blob),same:blob===await renderWandArt(384749651,{...invAppearance,sourceItemId:328475120})});
   }
   return {rows,composed,itemRows,added,inv,placeholders,unsupportedSource:await renderWandArt(39246601,{sourceItemId:315822,magicCharacteristicId:104,fleckCharacteristicId:125})===null,unknown:await renderWandBaseArt(39246601,{magicCharacteristicId:999999,fleckCharacteristicId:125})===null};
  },base);
  assert.equal(out.rows.length,9);assert.ok(out.unknown);
  assert.equal(out.composed.length,13);assert.ok(out.unsupportedSource);
  assert.equal(out.itemRows.length,25);
  assert.ok(out.added.art.visible&&out.added.cached&&out.added.mismatch&&out.added.noCell);
  assert.notEqual(out.added.art.rgba,out.added.plain.rgba);
  assert.ok(out.inv.art.visible&&out.inv.cache);assert.notEqual(out.inv.art.rgba,out.inv.plain.rgba);
  assert.equal(out.placeholders.length,3);assert.ok(out.placeholders.every(r=>r.pixels.visible&&r.same));
  assert.notEqual(out.placeholders[0].pixels.rgba,out.inv.plain.rgba);
  for(const r of out.itemRows){assert.ok(r.result.visible&&r.cache);assert.notEqual(r.result.rgba,r.plain.rgba);}
  assert.equal(new Set(out.itemRows.map(r=>r.result.rgba)).size,25);
  for(const c of out.composed){assert.ok(c.pixels.visible&&c.cached);assert.notEqual(c.pixels.rgba,c.base.rgba);}
  for(const row of out.rows){
   assert.equal(row.a.width,96);assert.equal(row.a.height,96);assert.ok(row.a.visible&&row.b.visible);
   assert.equal(row.a.alpha,row.b.alpha);assert.notEqual(row.a.rgba,row.b.rgba,'same item must render different original color inputs: '+row.id);
   assert.ok(row.cache);
  }
  console.log('CHROMIUM DYNAMIC WAND BASE PASS: 9 native wand base layers, color variants, alpha, shared cache and unknown-ID refusal');
 }finally{await context.close();}
}

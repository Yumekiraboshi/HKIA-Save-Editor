import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

export async function wandRemainingSmoke(browser,origin,base){
 const {outputFiles}=await build({
  stdin:{contents:"export * from './wand-runtime-art'; export {loadRemainingWandOverlay} from './wand-remaining-source';",resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'ts'},
  bundle:true,write:false,format:'esm',platform:'browser',define:{'import.meta.env.BASE_URL':JSON.stringify(base)}
 });
 const context=await browser.newContext();
 try{
  const page=await context.newPage(),root=origin+base;
  await page.route(root+'__wand_remaining__.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.route(root+'__wand_remaining__.mjs',r=>r.fulfill({contentType:'text/javascript',body:outputFiles[0].text}));
  await page.route('**/dynamic-wand-art/candidate-source/index.json',r=>r.fulfill({status:503,body:'unavailable'}));
  await page.goto(root+'__wand_remaining__.html');
  const result=await page.evaluate(async base=>{
   const {renderWandBaseArt,renderWandArt,loadRemainingWandOverlay}=await import(base+'__wand_remaining__.mjs');
   const source=await (await fetch(base+'dynamic-wand-art/remaining-source/index.json')).json();
   const m=await (await fetch(base+'dynamic-wand-art/wand-runtime-source-v3.0.1.json')).json();
   const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
   const transform={scale:Math.fround(.4),offsetPercent:[-.25,.25],rotation:0};
   const ids=[609273492,1210096967,573152090,947052831];
   const hashes=[],rows=[];
   for(const id of ids){
    const r=source.sprites.find(r=>r[0]===source.items[String(id)]);
    const s=await loadRemainingWandOverlay(id,transform);
    if(!s||s.spritePathId!==r[0])throw Error('missing original remaining source');
    const {texture,alphaOffsetY,sampleRect}=s.overlay;
    const rgba=new Uint8Array(34*34*4);
    for(let y=0;y<34;y++)for(let x=0;x<34;x++){
     const i=(y*34+x)*4,src=((sampleRect[1]+y)*texture.width+sampleRect[0]+x)*4;
     rgba.set([texture.rgba[src],texture.rgba[src+1],texture.rgba[src+2],texture.rgba[src+alphaOffsetY*texture.width*4]],i);
    }
    hashes.push({pack:r[1],actual:await sha(rgba.buffer),expected:r[7]});
   }
   const bytes=async b=>b?sha(await b.arrayBuffer()):null;
   for(const row of m.rows){
    const a={magicCharacteristicId:104,fleckCharacteristicId:125},plain=await bytes(await renderWandBaseArt(row.itemId,a));
    for(const sourceItemId of ids){
     const appearance={...a,sourceItemId},blob=await renderWandArt(row.itemId,appearance);
     rows.push({id:row.itemId,sourceItemId,actual:await bytes(blob),plain,cached:blob===await renderWandArt(row.itemId,appearance)});
    }
   }
   return {hashes,rows,unknown:await loadRemainingWandOverlay(315823,transform)===null};
  },base);
  assert.deepEqual(result.hashes.map(r=>r.pack),[0,1,2,3]);
  assert.ok(result.hashes.every(r=>r.actual===r.expected));
  assert.equal(result.rows.length,36);
  assert.ok(result.rows.every(r=>r.actual&&r.cached&&r.actual!==r.plain));
  assert.ok(result.unknown);
  console.log('CHROMIUM WAND REMAINING SOURCE PASS: all four sheets, exact RGBA witness samples, all nine shape compositions');
 }finally{await context.close();}
}

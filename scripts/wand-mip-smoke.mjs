import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
export async function wandMipSmoke(browser,origin,base){
 const {outputFiles}=await build({stdin:{contents:"export * from './wand-runtime-art'; export {loadSampledWandOverlay} from './wand-candidate-source';",resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',define:{'import.meta.env.BASE_URL':JSON.stringify(base)}});
 const context=await browser.newContext();
 try{
  const page=await context.newPage(),root=origin+base;
  await page.route(root+'__wand_mip__.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.route(root+'__wand_mip__.mjs',r=>r.fulfill({contentType:'text/javascript',body:outputFiles[0].text}));
  const requests=[];
  await page.route('**/dynamic-wand-art/candidate-source/index.json',r=>{requests.push(r.request().url());return r.fulfill({status:503,body:'unavailable'});});
  await page.goto(root+'__wand_mip__.html');
  const out=await page.evaluate(async base=>{
   const {renderWandBaseArt,renderWandArt,loadSampledWandOverlay}=await import(base+'__wand_mip__.mjs');
   const manifest=await(await fetch(base+'dynamic-wand-art/mip-source/wand-mip-source.json')).json();
   const wands=await(await fetch(base+'dynamic-wand-art/wand-runtime-source-v3.0.1.json')).json();
   const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
   const transform={scale:Math.fround(.4),offsetPercent:[-.25,.25],rotation:0},samples=[],composed=[];
   for(const row of manifest.rows){
    const source=await loadSampledWandOverlay(row.itemId,transform);
    if(!source)throw Error('missing mip source');
    const {texture,alphaOffsetY,sampleRect}=source.overlay,rgba=new Uint8Array(34*34*4);
    for(let y=0;y<34;y++)for(let x=0;x<34;x++){
     const src=((sampleRect[1]+y)*texture.width+sampleRect[0]+x)*4;
     rgba.set([texture.rgba[src],texture.rgba[src+1],texture.rgba[src+2],texture.rgba[src+alphaOffsetY*texture.width*4]],(y*34+x)*4);
    }
    samples.push({id:row.itemId,identity:source.spritePathId===row.spritePathId,hash:await sha(rgba.buffer),expected:row.sampleRgbaSha256,wrong:await loadSampledWandOverlay(row.itemId,{...transform,rotation:1})===null});
   }
   const blobHash=async b=>b?sha(await b.arrayBuffer()):null;
   for(const wand of wands.rows){
    const a={magicCharacteristicId:104,fleckCharacteristicId:125},plain=await blobHash(await renderWandBaseArt(wand.itemId,a));
    for(const row of manifest.rows){
     const p={...a,sourceItemId:row.itemId},blob=await renderWandArt(wand.itemId,p);
     composed.push({wand:wand.itemId,id:row.itemId,hash:await blobHash(blob),plain,cached:blob===await renderWandArt(wand.itemId,p)});
    }
   }
   return {samples,composed};
  },base);
  assert.deepEqual(requests,[]);
  assert.equal(out.samples.length,47);
  assert.ok(out.samples.every(s=>s.identity&&s.hash===s.expected&&s.wrong));
  assert.equal(out.composed.length,423);
  assert.ok(out.composed.every(s=>s.hash&&s.plain&&s.hash!==s.plain&&s.cached));
  console.log('CHROMIUM WAND MIP SOURCE PASS: 47 exact source cells and 423 shape/source pairs');
 }finally{await context.close();}
}

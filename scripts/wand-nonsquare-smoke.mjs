import assert from 'node:assert/strict';
import {wandRemainingSmoke} from './wand-remaining-smoke.mjs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

export async function wandNonSquareSmoke(browser,origin,base){
 await wandRemainingSmoke(browser,origin,base);
 const {outputFiles}=await build({
  stdin:{contents:"export * from './wand-runtime-art'; export {loadSampledWandOverlay} from './wand-candidate-source';",resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'ts'},
  bundle:true,write:false,format:'esm',platform:'browser',define:{'import.meta.env.BASE_URL':JSON.stringify(base)}
 });
 const context=await browser.newContext();
 try{
  const page=await context.newPage(),root=origin+base;
  await page.route(root+'__wand_nonsquare__.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.route(root+'__wand_nonsquare__.mjs',r=>r.fulfill({contentType:'text/javascript',body:outputFiles[0].text}));
  // A rectangular source must not depend on the large ordinary candidate pack.
  const ordinaryRequests=[];
  await page.route('**/dynamic-wand-art/candidate-source/index.json',r=>{ordinaryRequests.push(r.request().url());return r.fulfill({status:503,body:'unavailable'});});
  await page.goto(root+'__wand_nonsquare__.html');
  const out=await page.evaluate(async base=>{
   const {renderWandBaseArt,renderWandArt,loadSampledWandOverlay}=await import(base+'__wand_nonsquare__.mjs');
   const m=await (await fetch(base+'dynamic-wand-art/wand-runtime-source-v3.0.1.json')).json();
   const source=await (await fetch(base+'dynamic-wand-art/candidate-source/wand-nonsquare.json')).json();
   const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
   const pixels=async blob=>{
    if(!blob)throw Error('missing generated blob');
    const im=await createImageBitmap(blob),c=document.createElement('canvas');c.width=im.width;c.height=im.height;
    const ctx=c.getContext('2d');ctx.drawImage(im,0,0);im.close();const data=ctx.getImageData(0,0,c.width,c.height).data;
    return {rgba:await sha(data.buffer),visible:data.some((v,i)=>i%4===3&&v>200),width:c.width,height:c.height};
   };
   const rows=[],transforms=[];
   for(const row of m.rows){
    const a={magicCharacteristicId:104,fleckCharacteristicId:125},plain=await pixels(await renderWandBaseArt(row.itemId,a));
    for(const s of source.rows){
     const appearance={...a,sourceItemId:s.itemId},blob=await renderWandArt(row.itemId,appearance);
     rows.push({id:row.itemId,sourceItemId:s.itemId,art:await pixels(blob),plain:plain.rgba,cached:blob===await renderWandArt(row.itemId,appearance)});
    }
   }
   const t={scale:Math.fround(.4),offsetPercent:[-.25,.25],rotation:0};
   for(const s of source.rows){
    const original=await loadSampledWandOverlay(s.itemId,t);if(!original)throw Error('missing non-square source');
    const {texture,alphaOffsetY,sampleRect}=original.overlay;
    const rgba=new Uint8Array(34*34*4),alpha=[];
    for(let y=0;y<34;y++)for(let x=0;x<34;x++){
     const i=(y*34+x)*4,src=(y*texture.width+x+sampleRect[0])*4,a=texture.rgba[((y+alphaOffsetY)*texture.width+x+sampleRect[0])*4];
     rgba.set([texture.rgba[src],texture.rgba[src+1],texture.rgba[src+2],a],i);alpha.push(a);
    }
    transforms.push({id:s.itemId,pid:original.spritePathId,sourceHash:original.sourceHash,alpha,sampleHash:await sha(rgba.buffer),expected:s.rgbaSampleSha256,wrongTransform:await loadSampledWandOverlay(s.itemId,{...t,rotation:1})===null});
   }
   return {rows,transforms};
  },base);
  assert.deepEqual(ordinaryRequests,[]);
  assert.equal(out.rows.length,45);
  for(const row of out.rows){assert.ok(row.art.visible&&row.cached);assert.deepEqual([row.art.width,row.art.height],[96,96]);assert.notEqual(row.art.rgba,row.plain);}
  for(const id of new Set(out.rows.map(r=>r.id)))assert.equal(new Set(out.rows.filter(r=>r.id===id).map(r=>r.art.rgba)).size,5);
  assert.equal(out.transforms.length,5);
  for(const r of out.transforms){assert.ok(r.wrongTransform);assert.equal(r.sourceHash,'950095992ecb78341afb1cf6c5c2afaf16de8b6b365cf66c8fcb66c692d7096a');assert.ok(r.alpha.some(a=>a>200));assert.equal(r.sampleHash,r.expected);}
  for(const [id,w,h] of [[371479572,439,512],[583339916,512,511],[1057045178,512,511],[1314269583,512,470]]){
   const r=out.transforms.find(r=>r.id===id),s=84*Math.fround(.4)/Math.max(w,h);
   for(let y=0;y<34;y++)for(let x=0;x<34;x++){
    const dx=x+4.5-21,dy=y+4.5-21;
    assert.equal(r.alpha[y*34+x],Math.abs(dx)<w*s/2&&Math.abs(dy)<h*s/2?255:0);
   }
  }
  console.log('CHROMIUM WAND NON-SQUARE SOURCE PASS: all five original sprites, 45 shape/source pairs, exact source samples and aspect geometry');
 }finally{await context.close();}
}

/** Browser fixture for the real runtime modules and actual original textures.
 * No synthetic save decoder, no exported game captures, no production test UI. */
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
export async function chefRuntimeSmoke(browser,origin,base){
 const {outputFiles}=await build({
  entryPoints:[fileURLToPath(new URL('../src/chef-runtime-art.ts',import.meta.url))],
  bundle:true,write:false,format:'esm',platform:'browser',define:{'import.meta.env.BASE_URL':JSON.stringify(base)}
 });
 const context=await browser.newContext();
 try{
  const page=await context.newPage();
  const root=origin+base;
  await page.route(root+'__chef_runtime_fixture__.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.route(root+'__chef_runtime_fixture__.mjs',r=>r.fulfill({contentType:'text/javascript',body:outputFiles[0].text}));
  await page.goto(root+'__chef_runtime_fixture__.html');
  const out=await page.evaluate(async base=>{
   const {renderChefArt,renderChefBaseArt}=await import(base+'__chef_runtime_fixture__.mjs');
   const m=await (await fetch(base+'dynamic-chef-art/chef-runtime-source-v3.0.1.json')).json();
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
    const appearance=id=>row.kind==='boba'?{kind:'boba',colorId:id}:{kind:'cafe',colors:[id,11,21]};
    // For cafe, change all slots, so we exercise whichever channels its mask uses.
    const a=row.kind==='boba'?appearance(6):{kind:'cafe',colors:[6,6,6]};
    const b=row.kind==='boba'?appearance(14):{kind:'cafe',colors:[14,14,14]};
    const first=await renderChefArt(row.itemId,a),second=await renderChefArt(row.itemId,b);
    const original=await renderChefBaseArt(row.itemId);
    const neutral=id=>row.kind==='boba'?{kind:'boba',colorId:id}:{kind:'cafe',colors:[id,id,id]};
    const unmapped=await renderChefArt(row.itemId,neutral(1));
    rows.push({id:row.itemId,a:await pixels(first),b:await pixels(second),original:await pixels(original),originalCache:original===await renderChefBaseArt(row.itemId),cache:first===await renderChefArt(row.itemId,a),neutral:await pixels(unmapped),neutralCache:unmapped!==null&&unmapped===await renderChefArt(row.itemId,neutral(2))});
   }
   return {rows,unknown:await renderChefArt(1798633565,{kind:'boba',colorId:999999})===null,unknownBase:await renderChefBaseArt(0)===null};
  },base);
  assert.equal(out.rows.length,10);assert.ok(out.unknown&&out.unknownBase);
  for(const row of out.rows){
   assert.equal(row.a.width,96);assert.equal(row.a.height,96);assert.ok(row.a.visible&&row.b.visible);
   assert.equal(row.a.alpha,row.b.alpha);assert.notEqual(row.a.rgba,row.b.rgba,'same item must render different original color inputs: '+row.id);
   assert.ok(row.cache&&row.originalCache&&row.original.visible);
   assert.equal(row.original.alpha,row.a.alpha);
   assert.equal(row.neutral.rgba,row.original.rgba);assert.ok(row.neutralCache);
   assert.equal(row.original.width,96);assert.equal(row.original.height,96);
  }
  console.log('CHROMIUM DYNAMIC CHEF PASS: 10 native source icons, color variants, alpha, shared cache and unknown-ID refusal');
 }finally{await context.close();}
}

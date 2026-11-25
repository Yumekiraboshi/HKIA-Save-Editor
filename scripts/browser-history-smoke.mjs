/**
 * Chromium end-to-end smoke for the exact Vite build shipped to Pages.
 * Uses a synthetic source-shaped HKIA save (never a real user's save).
 * Run after npm run build:
 *   node scripts/browser-history-smoke.mjs
 * To verify the actually published Pages build instead of local Vite:
 *   node scripts/browser-history-smoke.mjs --pages
 * Requires CI's locally installed Chrome and playwright-core.
 */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {chefRuntimeSmoke} from './chef-runtime-smoke.mjs';
import {wandRuntimeSmoke} from './wand-runtime-smoke.mjs';

const append=(...arrays)=>Uint8Array.from(arrays.flatMap(x=>Array.from(x)));
const u32=n=>append([0xce],Array.from({length:4},(_,i)=>n>>>(24-8*i)&255));
const f32=n=>{const a=new Uint8Array(5);a[0]=0xca;new DataView(a.buffer).setFloat32(1,n);return a};
const i64=n=>{const a=new Uint8Array(9);a[0]=0xd3;new DataView(a.buffer).setBigInt64(1,n,false);return a};
const arr=(...elements)=>{assert.ok(elements.length<16);return append([0x90|elements.length],...elements)};
const map=(...pairs)=>{assert.ok(pairs.length%2===0&&pairs.length/2<16);return append([0x80|pairs.length/2],...pairs)};
const hash=(...words)=>append(...words.map(u32));
const doc=(tag,body)=>arr([tag],body);
const str=text=>append([0xa0|text.length],new TextEncoder().encode(text));
const timestamp=(sec,nanos)=>append([0xc7,12,0xff],Array.from({length:4},(_,i)=>nanos>>>(24-8*i)&255),i64(BigInt(sec)).subarray(1));

function createSyntheticSlot({childCompleted=null,artInventory=false,flowerInventory=false,paletteInventory=false}={}){
 const version='3.0.1';
 const collection=doc(39,arr(map(),map([2],i64(638000000000000001n),[3],i64(9n))));
 const object=doc(32,arr([3],hash(0,0,0,3),[0],arr(collection)));
 const child=doc(16,arr([1],hash(1,0,0,1),arr([childCompleted?0xc3:0xc2],f32(1),childCompleted?timestamp(...childCompleted):[0xc0])));
 const parent=doc(16,arr([2],hash(2,0,0,1),arr([0xc2],f32(2),[0xc0])));
 const counter=doc(17,arr([1],hash(1,0,0,2),arr(f32(2),[0xc0],[0x90])));
 const inventory=doc(1,arr([4],u32(315822),[0],u32(6),[0xc0]));
 const color=(r,g,b)=>arr(f32(r),f32(g),f32(b),f32(1));
 const palette=(id,colors)=>doc(1,arr([id],u32(1835273963),u32(id),u32(1),arr([6],arr(...colors))));
 const originalArtItem=paletteInventory?palette(5,[color(1,0,0),color(0,1,0),color(0,0,1)]):doc(1,arr([5],u32(1286846063),[0],u32(3),[0xc0]));
 const sourceFitItem=paletteInventory?palette(6,[color(0,0,1),color(1,0,0),color(0,1,0)]):doc(1,arr([6],u32(54272482),[0],u32(2),[0xc0]));
 const nonCollectionItem=doc(1,arr([7],u32(427689),[0],u32(5),[0xc0]));
 const flower=(id,color,pattern,accent)=>doc(1,arr([id],u32(43114910),u32(id),u32(1),arr([7],arr([6],u32(color),u32(pattern),u32(accent)))));
 const model=arr([0],[4],arr(doc(18,arr([0],u32(87),str(version))),child,parent,counter,object,inventory,
  ...(artInventory?[originalArtItem,sourceFitItem,nonCollectionItem]:[]),
  ...(flowerInventory?[flower(8,1,0,0),flower(9,9,0,0),flower(10,1,10,16),flower(11,1,3,0),flower(12,1,9999,0)]:[])));
 const prefix=Uint8Array.from('135b4aa4f702a45d1cc562aeb5a386ed5d17e1fd588f424dcfc59d2e140cf597'.match(/../g).map(x=>parseInt(x,16)));
 const magic=Uint8Array.from('a1a2f8333c66ec455baa2dfc6325c2437a779c9906eecff0c022e5f6b6ca73b8'.match(/../g).map(x=>parseInt(x,16)));
 const lit=[0xf0];let remain=model.length-15;
 while(remain>=255){lit.push(255);remain-=255}lit.push(remain);
 const compressed=append(lit,model);
 const big=n=>Array.from({length:4},(_,i)=>n>>>(24-8*i)&255);
 return append(prefix,[0x98],u32(0),u32(0),u32(0),u32(0),str(version),u32(30001),
  [0x92,0xd6,0xff],big(1_750_000_000),[0,0,0x80,0x90,0x91,9],magic,
  [0x92,0xc8,0,3,98,0xcd,model.length>>8,model.length&255],
  [0xc6],big(compressed.length),compressed);
}

function installedChrome(){
 if(process.env.CHROME_BIN)return process.env.CHROME_BIN;
 for(const name of ['google-chrome-stable','google-chrome','chromium','chromium-browser']){
  try{return execFileSync('which',[name],{encoding:'utf8'}).trim()}catch{}
 }
 throw Error('CHROME_NOT_INSTALLED');
}
const livePages=process.argv.includes('--pages');
const origin=livePages?'https://yumekiraboshi.github.io':'http://127.0.0.1:4173';
const base=livePages||process.env.GITHUB_ACTIONS==='true'?'/HKIA-Save-Editor/':'/';
const service=livePages?null:spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173','--strictPort'],{
 env:process.env,stdio:['ignore','pipe','pipe']
});
let serviceLog='';
for(const stream of service?[service.stdout,service.stderr]:[])
 stream.on('data',chunk=>serviceLog+=String(chunk).slice(-2000));
let browser;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitForServer(){
 if(livePages){
  const response=await fetch(origin+base,{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('LIVE_PAGES_HTTP_'+response.status);
  console.log('Testing actual published Pages URL: '+origin+base);
  return;
 }
 for(let i=0;i<80;i++){
  if(service.exitCode!==null)throw Error('Vite exited: '+serviceLog);
  try{const r=await fetch(origin+base);if(r.ok)return}catch{}
  await sleep(250);
 }
 throw Error('Vite preview failed to start: '+serviceLog);
}
async function countHistory(page,n){
 await page.locator('.history-menu > summary').click();
 const steps=page.locator('.history-list button');
 await steps.first().waitFor();
 assert.equal(await steps.count(),n,'expected n native timeline positions');
 return steps;
}
async function chooseTab(page,tool){
 await page.locator(`.tools-nav button.tool-tab[data-tool="${tool}"]`).click();
}
async function localDraft(page){
 return page.evaluate(async()=>{
  return new Promise((resolve,reject)=>{
   const request=indexedDB.open('hkia-editor-local-session',1);
   request.onerror=()=>reject(request.error);
   request.onsuccess=()=>{
    const db=request.result;
    const transaction=db.transaction('unsaved-changes','readonly');
    const read=transaction.objectStore('unsaved-changes').get('current');
    read.onsuccess=()=>{db.close();const state=read.result;
     const bytes=state?.historyCheckpoint;
     resolve({
      changes:state?.patches?.length??-1,
      achievements:state?.achievementPatches?.length??-1,
      count:bytes instanceof Uint8Array&&bytes.byteLength>=16?
       new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(8,true):-1,
      applied:bytes instanceof Uint8Array&&bytes.byteLength>=16?
       new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(12,true):-1
     });
    };
    read.onerror=()=>reject(read.error);
   };
  });
 });
}

/** Actual user path: search an existing item, change its count, recover the
 * draft after refresh, export, and independently reparse Rust/WASM bytes. */
async function inventoryDynamicPaletteArtSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800}});
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({
   name:'synthetic-palette-appearances.save',mimeType:'application/octet-stream',
   buffer:Buffer.from(createSyntheticSlot({artInventory:true,paletteInventory:true}))
  });
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  await page.locator('.inventory-controls input[type="search"]').fill('1835273963');
  const sprites=page.locator('.inventory-card .item-sprite[data-dynamic-art-source="native-palette"]');
  await sprites.nth(1).waitFor({timeout:30_000});
  assert.equal(await sprites.count(),2);
  const images=await sprites.evaluateAll(async els=>Promise.all(els.map(async el=>{
   const url=getComputedStyle(el).backgroundImage.slice(5,-2);
   if(!url.startsWith('blob:'))throw Error('expected local generated blob');
   const im=await createImageBitmap(await (await fetch(url)).blob());
   const c=document.createElement('canvas');c.width=im.width;c.height=im.height;
   const ctx=c.getContext('2d');ctx.drawImage(im,0,0);im.close();
   const bytes=ctx.getImageData(0,0,c.width,c.height).data;
   return {width:c.width,height:c.height,alpha:Array.from(bytes.filter((_,i)=>i%4===3)),rgb:Array.from(bytes.filter((_,i)=>i%4!==3))};
  })));
  for(const im of images){assert.equal(im.width,96);assert.equal(im.height,96);assert.ok(im.alpha.some(a=>a>200));}
  assert.deepEqual(images[0].alpha,images[1].alpha);assert.notDeepEqual(images[0].rgb,images[1].rgb);
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM DYNAMIC PALETTE PASS: native unique Color1/2/3, original source sampling, local generation');
 }finally{await context.close();}
}
async function inventoryEditExportSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800},acceptDownloads:true});
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  const source=Buffer.from(createSyntheticSlot());
  await page.locator('input[type="file"]').setInputFiles({
   name:'synthetic-hkia-inventory.save',mimeType:'application/octet-stream',buffer:source
  });
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  assert.deepEqual(await page.locator('.tools-nav button.tool-tab').evaluateAll(tabs=>tabs.map(tab=>tab.dataset.tool)),['inventory','collections','achievements']);
  await chooseTab(page,'inventory');
  const search=page.locator('.inventory-controls input[type="search"]');
  await search.fill('315822');
  const card=page.locator('.inventory-card').first();
  await card.waitFor({timeout:20_000});
  const quantity=card.locator('input[name="quantity"]');
  assert.equal(await quantity.inputValue(),'6');
  assert.equal(await quantity.isDisabled(),false);
  await quantity.fill('25');
  await card.locator('button[type="submit"]').click();
  await page.locator('.inventory-card input[name="quantity"]').first().waitFor();
  // The filled DOM input already contains 25 before the native edit. Wait for
  // the completed CAS transaction and actual committed IndexedDB draft, not
  // just the input's value, before exercising recovery.
  await page.locator('.inventory-card button[type="submit"]:not([disabled])').first().waitFor();
  await page.locator('.state-dot.changed').waitFor();
  const storedInventory=await page.evaluate(()=>new Promise((resolve,reject)=>{
   const open=indexedDB.open('hkia-editor-local-session',1);
   open.onerror=()=>reject(open.error);
   open.onsuccess=()=>{
    const db=open.result;
    const request=db.transaction('unsaved-changes','readonly').objectStore('unsaved-changes').get('current');
    request.onsuccess=()=>{db.close();resolve(request.result?.inventoryPatches??[])};
    request.onerror=()=>{db.close();reject(request.error)};
   };
  }));
  assert.deepEqual(storedInventory,[{documentId:4,before:6,after:25}],'native quantity edit must be committed to IndexedDB before refresh');
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  await page.locator('.inventory-controls input[type="search"]').fill('315822');
  assert.equal(await page.locator('.inventory-card input[name="quantity"]').first().inputValue(),'25',
   'browser refresh must restore unsaved inventory changes locally');
  await page.locator('.file-menu > summary').click();
  const [download]=await Promise.all([
   page.waitForEvent('download',{timeout:30_000}),
   page.locator('.file-menu .menu-popover > button').nth(2).click()
  ]);
  const output=readFileSync(await download.path());
  const wasm=readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm');
  const {instance}=await WebAssembly.instantiate(wasm,{}),e=instance.exports;
  const ptr=e.hkia_stage(output.length);assert.ok(ptr>0);
  new Uint8Array(e.memory.buffer,ptr,output.length).set(output);
  assert.equal(e.hkia_open(),0);
  assert.equal(e.hkia_inventory_snapshot(),0);
  const iv=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
  assert.equal(iv.getUint32(0,true),1);
  assert.equal(iv.getUint32(4,true),4,'document ID unchanged');
  assert.equal(iv.getInt32(8,true),315822,'item ID unchanged');
  assert.equal(iv.getInt32(12,true),25,'edited stack count exported');
  assert.equal(iv.getUint32(16,true),1,'native edit eligibility retained');
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM INVENTORY EDIT/EXPORT PASS: search, CAS edit, local draft recovery, Rust/WASM reparse');
 }finally{await context.close();}
}

/** Existing native game UiIcon ZIP / colorway resolver must appear for a
 * source-mapped inventory item, not just its item name and quantity.
 * Colorway fidelity is inherited from the same shared Collection pipeline:
 * an approximate render is NEVER asserted to be an exact game shader image.
 */
async function inventoryDynamicFlowerArtSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800}});
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({
   name:'synthetic-flower-appearances.save',mimeType:'application/octet-stream',
   buffer:Buffer.from(createSyntheticSlot({flowerInventory:true}))
  });
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  await page.locator('.inventory-controls input[type="search"]').fill('43114910');
  const sprites=page.locator('.inventory-card .item-sprite[data-dynamic-art-source="native-flower"]');
  await sprites.nth(3).waitFor({timeout:30_000});
  assert.equal(await sprites.count(),4);
  await page.locator('.inventory-card .item-sprite[data-icon-fidelity="species-fallback"]').waitFor({timeout:30_000});
  await page.locator('.inventory-card img[src$="pattern-3.webp"]').waitFor({timeout:30_000});
  const images=await sprites.evaluateAll(async els=>Promise.all(els.map(async el=>{
   const url=getComputedStyle(el).backgroundImage.slice(5,-2);
   if(!url.startsWith('blob:'))throw Error('expected local generated blob');
   const im=await createImageBitmap(await (await fetch(url)).blob());
   const c=document.createElement('canvas');c.width=im.width;c.height=im.height;
   const ctx=c.getContext('2d');ctx.drawImage(im,0,0);im.close();
   const bytes=ctx.getImageData(0,0,c.width,c.height).data;
   return {width:c.width,height:c.height,alpha:Array.from(bytes.filter((_,i)=>i%4===3)),rgb:Array.from(bytes.filter((_,i)=>i%4!==3))};
  })));
  for(const im of images){assert.equal(im.width,96);assert.equal(im.height,96);assert.ok(im.alpha.some(a=>a>200));assert.equal(im.alpha[0],0);}
  assert.deepEqual(images[0].alpha,images[1].alpha);assert.deepEqual(images[0].alpha,images[2].alpha);assert.deepEqual(images[0].alpha,images[3].alpha);
  assert.notDeepEqual(images[0].rgb,images[1].rgb);assert.notDeepEqual(images[0].rgb,images[2].rgb);
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM DYNAMIC FLOWER PASS: original source sampling, distinct same-ID appearances, native effect-mask fallback, unknown pattern refusal, local blob generation');
 }finally{await context.close();}
}
async function inventoryOriginalArtSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800}});
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({
   name:'synthetic-inventory-game-icon.save',mimeType:'application/octet-stream',
   buffer:Buffer.from(createSyntheticSlot({artInventory:true}))
  });
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  await page.locator('.inventory-controls input[type="search"]').fill('1286846063');
  const card=page.locator('.inventory-card').first();
  await card.waitFor();
  const original=card.locator('.inventory-item-art .item-sprite[data-dye-source="game-source-sprite"]');
  await original.waitFor({timeout:30_000});
  assert.equal(await card.locator('input[name="quantity"]').inputValue(),'3');
  assert.equal(await original.getAttribute('data-icon-fidelity'),'game-original');
  const inventoryUrl=await original.evaluate(el=>getComputedStyle(el).backgroundImage);
  assert.match(inventoryUrl,/\/(?:dynamic-colorways|source-colorways)\/1286846063\.webp/);
  await chooseTab(page,'collections');
  await page.locator('.collection-controls input[type="search"]').fill('Ice Cream Archer Costume');
  await page.locator('.collection-search-result').first().click();
  const collectionArt=page.locator('#collection-item-1286846063 .item-sprite[data-dye-source="game-source-sprite"]');
  await collectionArt.waitFor({timeout:30_000});
  assert.equal(await collectionArt.evaluate(el=>getComputedStyle(el).backgroundImage),inventoryUrl,
   'one Item ID must display the same original image in both tabs');
  await chooseTab(page,'inventory');
  await page.locator('.inventory-controls input[type="search"]').fill('1286846063');
  await page.locator('.inventory-card .inventory-item-art .item-sprite').first().waitFor();
  await page.locator('.inventory-controls input[type="search"]').fill('54272482');
  const fitted=page.locator('.inventory-card .inventory-item-art .item-sprite[data-dye-source="game-source-sprite"]');
  await fitted.waitFor({timeout:30_000});
  assert.equal(await fitted.getAttribute('data-icon-fidelity'),'game-original');
  assert.ok((await fitted.evaluate(el=>getComputedStyle(el).backgroundImage))
   .includes('/dynamic-colorways/54272482.webp?v='));
  await page.locator('.inventory-controls input[type="search"]').fill('315822');
  const pajama=page.locator('.inventory-card .inventory-item-art .item-sprite[data-dye-source="game-source-sprite"]');
  await pajama.waitFor({timeout:30_000});
  assert.equal(await pajama.getAttribute('data-icon-fidelity'),'game-original');
  assert.ok((await pajama.evaluate(el=>getComputedStyle(el).backgroundImage)).includes('/source-colorways/315822.webp'));
  await page.locator('.inventory-group-option[data-inventory-group="furniture"]').click();
  await page.locator('.inventory-controls input[type="search"]').fill('427689');
  const extra=page.locator('.inventory-card .item-sprite[data-inventory-art="native"]');
  await extra.waitFor({timeout:30_000});
  await page.waitForFunction(()=>document.querySelector('.inventory-card .inventory-name')?.textContent?.trim()==='Nul Rug');
  assert.ok(await extra.evaluate(async el=>{
   const bg=getComputedStyle(el).backgroundImage;
   const url=bg.match(/^url\("(.+)"\)$/)?.[1];
   if(!url||!url.includes('/inventory-art/sheet-005.webp'))return false;
   const img=new Image();img.src=url;await img.decode();
   return img.naturalWidth===1152&&img.naturalHeight===1152;
  }),'original non-collection item atlas must be loaded');
  assert.equal(await page.locator('.inventory-card input[name="quantity"]').first().inputValue(),'5');
  await page.route('**/item-packs/**',route=>route.fulfill({status:404,body:'missing'}));
  await page.route('**/native-dye-palettes.json',route=>route.fulfill({status:404,body:'missing'}));
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  // Switch from furniture back to clothing using the real game's category
  // of the previously selected item if needed: a fresh import resets filters.
  await page.locator('.inventory-controls input[type="search"]').fill('1286846063');
  const independent=page.locator('.inventory-card .item-sprite[data-dye-source="game-source-sprite"]');
  await independent.waitFor({timeout:30_000});
  assert.equal(await independent.evaluate(el=>getComputedStyle(el).backgroundImage),inventoryUrl);
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM INVENTORY GAME ICON PASS: same Item ID across tabs, original independent of shared packs and palette');
 }finally{await context.close();}
}

/** Browser file upload → UI date edit → download → independent native reparse
 * → browser re-upload. This entire scenario uses a synthetic local save. */
async function achievementExportReopenRoundtrip(){
 const context=await browser.newContext({
  locale:'en-US',timezoneId:'UTC',viewport:{width:1280,height:800},acceptDownloads:true
 });
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const source=Buffer.from(createSyntheticSlot({childCompleted:[
   Math.floor(Date.UTC(2026,10,23,12,34,56)/1000),987654300
  ]}));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  const input=page.locator('input[type="file"]');
  await input.setInputFiles({name:'synthetic-hkia-3.0.1.save',
   mimeType:'application/octet-stream',buffer:source});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'achievements');
  await page.locator('.achievement-category-grid button.achievement-category-card').last().click();
  const dateButton=page.locator('.achievement-item-grid button.achievement-dialog-button').first();
  await dateButton.waitFor({timeout:20_000});
  const dialog=page.locator('dialog.achievement-dialog[open]');
  const field=page.locator('dialog.achievement-dialog input[type="datetime-local"]');
  await dateButton.click();
  await dialog.waitFor();
  assert.equal(await field.inputValue(),'2026-11-23T12:34:56');
  await page.locator('dialog.achievement-dialog button[type="submit"]').click();
  await dialog.waitFor({state:'hidden'});
  assert.equal(await page.locator('.bar-actions button[title="Undo"]').isDisabled(),true,
   'unchanged date must not create a native history step');
  await dateButton.click();
  await dialog.waitFor();
  await field.fill('2026-11-24T12:34:57');
  await page.locator('dialog.achievement-dialog button[type="submit"]').click();
  await dialog.waitFor({state:'hidden'});
  await page.locator('.bar-actions button[title="Undo"]:not([disabled])').waitFor();
  await page.locator('.file-menu > summary').click();
  const exportButton=page.locator('.file-menu .menu-popover > button').nth(2);
  assert.equal(await exportButton.isDisabled(),false);
  const [download]=await Promise.all([
   page.waitForEvent('download',{timeout:30_000}),exportButton.click()
  ]);
  assert.equal(download.suggestedFilename(),'synthetic-hkia-3.0.1-edited.save');
  const saved=readFileSync(await download.path());
  assert.notDeepEqual(saved,source);

  // Read exactly the ACTUAL browser-downloaded file with a clean Rust/WASM
  // instance; do not infer the on-disk state from the displayed date.
  const binary=readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm');
  const {instance}=await WebAssembly.instantiate(binary,{});
  const e=instance.exports;
  function nativeView(bytes){
   e.hkia_clear();
   const p=e.hkia_stage(bytes.length);assert.ok(p>0);
   new Uint8Array(e.memory.buffer,p,bytes.length).set(bytes);
   assert.equal(e.hkia_open(),0,'exported save must reparse in Rust/WASM');
   assert.equal(e.hkia_achievement_snapshot(),0);
   const a=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
   const count=a.getUint32(0,true),achievements=new Map();
   for(let i=0;i<count;i++){
    const at=4+i*34;
    const guid=Array.from({length:4},(_,j)=>a.getUint32(at+j*4,true)).join(':');
    achievements.set(guid,{
     complete:a.getUint8(at+16),progress:a.getFloat32(at+17,true),
     hasDate:a.getUint8(at+21),secs:a.getBigInt64(at+22,true),
     nanos:a.getUint32(at+30,true)
    });
   }
   assert.equal(e.hkia_snapshot(),0);
   const b=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
   const entries=new Map();
   for(let i=0;i<b.getUint32(13,true);i++){
    const at=17+i*12;
    entries.set(b.getInt32(at,true),b.getBigInt64(at+4,true));
   }
   return {achievements,entries};
  }
  const before=nativeView(source),after=nativeView(saved);
  assert.equal(after.achievements.size,2);
  assert.deepEqual(after.entries,before.entries,'unrelated collection timestamps changed');
  assert.deepEqual(after.achievements.get('2:0:0:1'),before.achievements.get('2:0:0:1'),
   'unrelated saved category achievement changed');
  const edited=after.achievements.get('1:0:0:1');
  assert.equal(edited.complete,1);
  assert.equal(edited.progress,1);
  assert.equal(edited.hasDate,1);
  assert.equal(edited.nanos,987654300,'exact 100-nanosecond fraction lost on export');
  assert.equal(edited.secs,BigInt(Math.floor(Date.UTC(2026,10,24,12,34,57)/1000)));

  // Open the saved bytes through the public file picker, not a direct engine
  // call; explicitly accept the discard-draft confirmation.
  page.once('dialog',prompt=>prompt.accept());
  await input.setInputFiles({name:download.suggestedFilename(),
   mimeType:'application/octet-stream',buffer:saved});
  await page.locator('.bar-actions button[title="Undo"][disabled]').waitFor({timeout:30_000});
  await chooseTab(page,'achievements');
  if(await page.locator('.achievement-category-grid').count())
   await page.locator('.achievement-category-grid button.achievement-category-card').last().click();
  await page.locator('.achievement-item-grid button.achievement-dialog-button').first().click();
  await dialog.waitFor();
  assert.equal(await field.inputValue(),'2026-11-24T12:34:57');
  await page.locator('dialog.achievement-dialog button.date-dialog-cancel').click();
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM ACHIEVEMENT EXPORT/REOPEN PASS: 100ns native date, unrelated data, download and file reimport');
 }finally{await context.close();}
}

/** The production UI must not shift a second-occurrence completion into
 * the earlier UTC occurrence when a user edits only one local minute.
 * The downloaded synthetic save is reparsed by the independent Rust/WASM core.
 */
async function achievementDstFoldExportSmoke(){
 const context=await browser.newContext({
  locale:'en-US',timezoneId:'America/New_York',
  viewport:{width:1280,height:800},acceptDownloads:true
 });
 try{
  const page=await context.newPage();
  const originalSeconds=Math.floor(Date.UTC(2026,10,1,6,30,15)/1000);
  const source=Buffer.from(createSyntheticSlot({childCompleted:[originalSeconds,987654300]}));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({
   name:'synthetic-hkia-dst-fold.save',mimeType:'application/octet-stream',buffer:source
  });
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'achievements');
  await page.locator('.achievement-category-grid button.achievement-category-card').last().click();
  await page.locator('.achievement-item-grid button.achievement-dialog-button').first().click();
  const field=page.locator('.achievement-dialog input[type="datetime-local"]');
  await field.waitFor();
  assert.equal(await field.inputValue(),'2026-11-01T01:30:15');
  await field.fill('2026-11-01T01:31:15');
  await page.locator('.achievement-dialog button[type="submit"]').click();
  await page.locator('dialog.achievement-dialog[open]').waitFor({state:'hidden'});
  await page.locator('.file-menu > summary').click();
  const [download]=await Promise.all([
   page.waitForEvent('download',{timeout:30_000}),
   page.locator('.file-menu .menu-popover > button').nth(2).click()
  ]);
  const bytes=readFileSync(await download.path());
  const wasm=readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm');
  const {instance}=await WebAssembly.instantiate(wasm,{});
  const engine=instance.exports;
  const ptr=engine.hkia_stage(bytes.length);
  assert.ok(ptr>0);
  new Uint8Array(engine.memory.buffer,ptr,bytes.length).set(bytes);
  assert.equal(engine.hkia_open(),0,'download must reparse independently');
  assert.equal(engine.hkia_achievement_snapshot(),0);
  const view=new DataView(engine.memory.buffer,engine.hkia_reply_ptr(),engine.hkia_reply_len());
  assert.equal(view.getUint32(0,true),2);
  const first=4;
  assert.deepEqual(Array.from({length:4},(_,i)=>view.getUint32(first+4*i,true)),
   [1,0,0,1]);
  assert.equal(view.getBigInt64(first+22,true),BigInt(originalSeconds+60),
   'date-only UI edit must not jump back into first DST occurrence');
  assert.equal(view.getUint32(first+30,true),987654300,
   'native 100ns timestamp fraction must survive editing and export');
  console.log('CHROMIUM DST FOLD EXPORT PASS: second-occurrence UI time, +60s native delta, exact 100ns');
 }finally{await context.close();}
}

/** A transient verified source-atlas failure must recover after revisiting
 * Achievements, without discarding/re-fetching an already-good category atlas.
 * Synthetic HTTP 503 is deliberately scoped to this isolated browser context.
 */
async function achievementAtlasRetrySmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800}});
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  let individualAttempts=0,categoryAttempts=0;
  await page.route('**/achievement-individual-atlas.json',async route=>{
   individualAttempts++;
   if(individualAttempts===1){
    await route.fulfill({status:503,contentType:'text/plain',body:'synthetic temporary failure'});
   }else await route.continue();
  });
  await page.route('**/achievement-category-atlas.json',async route=>{
   categoryAttempts++;
   await route.continue();
  });
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({
   name:'synthetic-hkia-3.0.1.save',mimeType:'application/octet-stream',
   buffer:Buffer.from(createSyntheticSlot())
  });
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'achievements');
  await page.locator('.compact-hint[role="status"]').waitFor({timeout:30_000});
  await page.locator('.achievement-category-sprite').first().waitFor({timeout:30_000});
  assert.equal(individualAttempts,1);
  assert.equal(categoryAttempts,1);
  const atlas=JSON.parse(readFileSync('public/achievement-individual-atlas.json','utf8'));
  const key=atlas.icons[0].sourceKey;
  const search=page.locator('.collection-controls input[type="search"]');
  await search.fill(key);
  await page.locator('.achievement-item-grid button.achievement-toggle').first().waitFor();
  assert.equal(await page.locator('.achievement-individual-sprite').count(),0,
   'failed native atlas must never be presented as game-original imagery');
  // A normal tab return retries the missing image only. No extra UI control.
  await chooseTab(page,'collections');
  await chooseTab(page,'achievements');
  await page.locator('.collection-controls input[type="search"]').fill(key);
  const recovered=page.locator('.achievement-item-grid .achievement-individual-sprite').first();
  await recovered.waitFor({timeout:30_000});
  assert.match(await recovered.evaluate(el=>getComputedStyle(el).backgroundImage),/blob:/,
   'recovered image must be actual hash-checked game source pixels');
  assert.equal(individualAttempts,2,'exactly one retry for missing individual atlas');
  assert.equal(categoryAttempts,1,'already verified category atlas is retained');
  assert.equal(await page.locator('.compact-hint[role="status"]').count(),0);
  assert.deepEqual(errors,[],'recovered images must not throw browser exceptions');
  console.log('CHROMIUM ACHIEVEMENT ATLAS RETRY PASS: transient failure, verified recovery, retained category art');
 }finally{await context.close();}
}

async function run(){
 await waitForServer();
 browser=await chromium.launch({headless:true,executablePath:installedChrome(),args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({locale:'en-US',viewport:{width:1360,height:840},acceptDownloads:true});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{
  if(response.status()>=500)errors.push('HTTP '+response.status()+' '+response.url());
 });
 await page.goto(origin+base,{waitUntil:'networkidle'});
 await page.locator('input[type="file"]').setInputFiles({
  name:'synthetic-hkia-3.0.1.save',mimeType:'application/octet-stream',
  buffer:Buffer.from(createSyntheticSlot())
 });
 await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});

 const search=page.locator('.collection-controls input[type="search"]');
 // A shared source sprite must become two different image bitmaps, not
 // an unchanged gray icon with a colored border or swatch beneath it.
 async function sampledSprite(locator){
  assert.equal(await locator.getAttribute('data-icon-fidelity'),'game-original');
  const source=JSON.parse(readFileSync('public/source-colorways/index.json','utf8')).records;
  const dynamic=JSON.parse(readFileSync('public/dynamic-colorways/index.json','utf8')).records;
  const result=await locator.evaluate(async el=>{
   const style=getComputedStyle(el).backgroundImage;
   const url=style.startsWith('url(')?style.slice(4,-1).replace(/^['\"]|['\"]$/g,''):null;
   if(!url)throw Error('DYE_IMAGE_STYLE_MISSING');
   const image=new Image();
   image.src=url;
   await image.decode();
   const canvas=document.createElement('canvas');
   canvas.width=96;canvas.height=96;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});
   ctx.drawImage(image,0,0,96,96);
   const px=ctx.getImageData(0,0,96,96).data;
   let hash=2166136261,r=0,g=0,b=0,n=0;
   for(let i=0;i<px.length;i+=4){
    if(px[i+3]<90)continue;
    hash=Math.imul(hash^px[i],16777619)>>>0;
    hash=Math.imul(hash^px[i+1],16777619)>>>0;
    hash=Math.imul(hash^px[i+2],16777619)>>>0;
    r+=px[i];g+=px[i+1];b+=px[i+2];n++;
   }
   function pixelAt(x,y){const i=(y*96+x)*4;return [px[i],px[i+1],px[i+2]];}
   const id=el.closest('[id^="collection-item-"]')?.id.slice('collection-item-'.length);
   const response=await fetch(url);
   if(!response.ok)throw Error('SOURCE_ICON_FETCH');
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await response.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');
   return {id,url,digest,hash,count:n};
  });
  const expected=source[result.id]?.sha256??dynamic[result.id];
  assert.ok(expected,'registered original item ID');
  assert.ok(result.url.includes('/'+result.id+'.webp'),'same item source URL');
  assert.equal(result.digest,expected,'actual bytes match the original-source image manifest');
  assert.ok(result.count>0,'decoded source sprite is not blank');
  return result;
 }
 await search.fill('Ice Cream Archer Hat');
 await page.locator('.collection-search-result').first().click();
 const iceSprite=page.locator('#collection-item-704486536 .item-sprite[data-dye-source="game-source-sprite"]');
 await iceSprite.waitFor({timeout:30_000});
 const icePixels=await sampledSprite(iceSprite);
 assert.equal(await iceSprite.getAttribute('data-icon-fidelity'),'game-original');
 await search.fill('Orange Archer Hat');
 await page.locator('.collection-search-result').first().click();
 const orangeSprite=page.locator('#collection-item-585726126 .item-sprite[data-dye-source="game-source-sprite"]');
 await orangeSprite.waitFor({timeout:30_000});
 const orangePixels=await sampledSprite(orangeSprite);
 assert.notEqual(icePixels.hash,orangePixels.hash,'shared native icon must produce separate dyed bitmap pixels');
 assert.equal(await page.locator('.native-dye-swatch,.native-dye-preview,.shared-dyeable-icon-note').count(),0);
 assert.equal(await page.locator('#collection-item-585726126 .item-art').evaluate(el=>
  getComputedStyle(el,'::before').backgroundImage),'none');
 
 // The game-source Archer Costume thumbnail has three distinct regions.
 // Verify channel 2 changes the existing ochre strap and channel 3 the
 // existing golden buckle, in addition to the already working tunic color.
 await search.fill('Ice Cream Archer Costume');
 await page.locator('.collection-search-result').first().click();
 const creamCostume=page.locator('#collection-item-1286846063 .item-sprite[data-dye-source="game-source-sprite"]');
 await creamCostume.waitFor({timeout:30_000});
 const creamPixels=await sampledSprite(creamCostume);
 await search.fill('Orange Archer Costume');
 await page.locator('.collection-search-result').first().click();
 const orangeCostume=page.locator('#collection-item-935642973 .item-sprite[data-dye-source="game-source-sprite"]');
 await orangeCostume.waitFor({timeout:30_000});
 const orangeCostumePixels=await sampledSprite(orangeCostume);
 assert.notEqual(creamPixels.hash,orangeCostumePixels.hash);

 // Both School families have same-primary variants whose differing
 // second palette channel must alter pixels of the V-shaped neckline.
 // This detects regression to the first-channel-only gray thumbnail logic.
 async function checkSchoolPair(search1,id1,search2,id2){
  await search.fill(search1);
  await page.locator('.collection-search-result').first().click();
  const first=page.locator('#collection-item-'+id1+' .item-sprite[data-dye-source="game-source-sprite"]');
  await first.waitFor({timeout:30_000});
  const image1=await sampledSprite(first);
  await search.fill(search2);
  await page.locator('.collection-search-result').first().click();
  const second=page.locator('#collection-item-'+id2+' .item-sprite[data-dye-source="game-source-sprite"]');
  await second.waitFor({timeout:30_000});
  const image2=await sampledSprite(second);
  assert.notEqual(image1.hash,image2.hash,'the secondary game dye must change real image pixels');
 }
 await checkSchoolPair('Gray and Pink School Jacket',237080181,
  'Gray and Yellow School Jacket',556476907);
 await checkSchoolPair('Gray and Blue School Sweater Vest',307168230,
  'Gray and Pink School Sweater Vest',404567552);

 // All 17 original Crew Medic Outfit colorways share first native dye
 // #ebe4e7. This must not collapse Blue/Maroon to the same neutral icon:
 // the original second dye channel defines the named game colorway.
 await search.fill('Blue Crew Medic Outfit');
 await page.locator('.collection-search-result').first().click();
 const blueMedic=page.locator('#collection-item-156787090 .item-sprite[data-dye-source="game-source-sprite"]');
 await blueMedic.waitFor({timeout:30_000});
 const blueMedicPixels=await sampledSprite(blueMedic);
 await search.fill('Maroon Crew Medic Outfit');
 await page.locator('.collection-search-result').first().click();
 const maroonMedic=page.locator('#collection-item-351352504 .item-sprite[data-dye-source="game-source-sprite"]');
 await maroonMedic.waitFor({timeout:30_000});
 const maroonMedicPixels=await sampledSprite(maroonMedic);
 assert.notEqual(blueMedicPixels.hash,maroonMedicPixels.hash,
  'native second channel must distinguish Crew Medic source UiIcon colorways');


 // These genuine banded hat colorways have the same first native dye
 // but distinct second dyes. Assert that the displayed original 96px PNG
 // changes, not that an added ring, chip or different 3D pose appears.
 async function checkBandedHatPair(name1,id1,name2,id2){
  // Selecting the first result is wrong for overlapping names such as
  // White Camp Counselor Skort / Off White Camp Counselor Skort.
  async function findNativeIcon(name,id){
   await search.fill(name);
   await page.locator('.collection-search-result-name')
    .filter({hasText:new RegExp('^'+name+'$')}).first().click();
   // The original named cyan wireframe hat outranks its old approximation.
   // Other cases still exercise the existing generated-colorway path.
   const source='game-source-sprite';
   const sprite=page.locator('#collection-item-'+id+' .item-sprite[data-dye-source="'+source+'"]');
   await sprite.waitFor({timeout:30_000});
   if(id===528999373){
    assert.equal(await sprite.getAttribute('data-icon-fidelity'),'game-original');
    assert.ok((await sprite.evaluate(el=>getComputedStyle(el).backgroundImage))
     .includes('/source-colorways/528999373.webp'));
   }

   return sampledSprite(sprite);
  }
  const firstPixels=await findNativeIcon(name1,id1);
  const secondPixels=await findNativeIcon(name2,id2);
  assert.notEqual(firstPixels.hash,secondPixels.hash,
   'original source icon pixels must distinguish native secondary dye colors');
 }
 await checkBandedHatPair('White and Yellow High Tea Banded Tophat',522640238,
  'White and Sky High Tea Banded Tophat',571486471);
 await checkBandedHatPair('White and Yellow Banded Mini Tophat',396678160,
  'White and Sky Banded Mini Tophat',984341911);

 // Original High Tea Tophat variants share a first dye but have a
 // different second native color. Inspect real bitmap pixels, not swatches.
 await checkBandedHatPair('White and Yellow High Tea Tophat',1542238429,
  'White and Sky High Tea Tophat',643288523);

 // All twenty-two original Camp Counselor Skort variants share the
 // same neutral game UiIcon. The actual second dye color distinguishes
 // same-primary two-tone skorts in the IMAGE pixels, not a UI swatch.
 await checkBandedHatPair('White Camp Counselor Skort',1645062322,
  'White and Black Camp Counselor Skort',114494397);
 await checkBandedHatPair('Green Camp Counselor Skort',1962363087,
  'Green and Brown Camp Counselor Skort',2051283646);

 // The same original Flower Clip UiIcon must show different native
 // second palette colors in the *image*, not a ring or color swatch.
 await checkBandedHatPair('White and Yellow High Tea Flower Clip',290453986,
  'White and Sky High Tea Flower Clip',808145972);

 // Original Frilled Bonnet sprite is shared by 41 variants. Confirm
 // distinct native second dyes change bitmap pixels, not a CSS swatch.
 await checkBandedHatPair('White and Yellow High Tea Frilled Bonnet',1265055643,
  'White and Sky High Tea Frilled Bonnet',1046324850);

 // Same-source Triangle Shades (34 native colorways) differ only in
 // the lens dye for these pairs. Check source PNG pixels, not CSS swatches.
 await checkBandedHatPair('White Triangle Shades',84070359,
  'White and Black Triangle Shades',833990488);
 await checkBandedHatPair('Blue Triangle Shades',1676813114,
  'Blue and Black Triangle Shades',849273304);
 await checkBandedHatPair('Black Triangle Shades',1944643209,
  'Full Black Triangle Shades',1039676870);

 // Original High Tea Elegant Hat shares one source icon across 44
 // native colorways. The distinct second dye must change the bitmap.
 await checkBandedHatPair('White and Green High Tea Elegant Hat',77149467,
  'White and Sky High Tea Elegant Hat',370872413);

 // Steam v3.0.1 native Empire Waist Dress (38 shared-icon colorways).
 await checkBandedHatPair('White and Sky High Tea Empire Waist Dress',17843192,
  'White and Green High Tea Empire Waist Dress',2042637840);

 // Nine Marching Band garment/accessory families (13 colors apiece):
 // representative hat, trousers, shirt and skirt shown using the same
 // game UiIcon artwork with native channel 2 altering the pixels.
 await checkBandedHatPair('Blue Marching Band Two Toned Feather Cap',379278661,
  'Orange Marching Band Two Toned Feather Cap',381629095);
 await checkBandedHatPair('Blue Marching Band Buttoned Pants',28017165,
  'Blush Marching Band Buttoned Pants',216882722);
 await checkBandedHatPair('Blue Marching Band Sashed Shirt',90804870,
  'Orange Marching Band Sashed Shirt',393663149);
 await checkBandedHatPair('Warm Pink Marching Band Buttoned Skirt',102581461,
  'Black Marching Band Buttoned Skirt',213537409);

 // Twelve further original Marching Band families, with the same
 // primary dye and distinct second dyes, must alter the source PNG,
 // not add a CSS ring/swatch. Representative accessory / garment cases:
 await checkBandedHatPair('Blue Marching Band Track Pants',31570178,
  'Red Marching Band Track Pants',436025902);
 await checkBandedHatPair('Light Gray Marching Band Shako Cap',55228784,
  'Green Marching Band Shako Cap',356308774);
 await checkBandedHatPair('Yellow Marching Band Drum',156094928,
  'Blue Marching Band Drum',273831612);
 await checkBandedHatPair('Light Gray Marching Band Cape',104020790,
  'Brown Marching Band Cape',137008390);
 await checkBandedHatPair('Cream Marching Band Lined Skirt',84626875,
  'Red Marching Band Lined Skirt',129517237);
 await checkBandedHatPair('Blue Marching Band Tall Feather Cap',325925840,
  'Violet Marching Band Tall Feather Cap',556290317);

 // Additional source-verified 2D colorways: check actual PNG pixels,
 // including neutral cloth, flower trim, glasses, athletic and event art.
 await checkBandedHatPair('White and Periwinkle High Tea Waistcoat',17354545,
  'White and Green High Tea Waistcoat',1147294046);
 await checkBandedHatPair('Teal High Tea Flower Bonnet',47018878,
  'Teal and Tan High Tea Flower Bonnet',470675088);
 await checkBandedHatPair('Tan & Cream Browline Glasses',107645723,
  'Tan & White Browline Glasses',1036340124);
 await checkBandedHatPair('Black Soccer Jersey',425986517,
  'Black and Red Soccer Jersey',711193726);
 await checkBandedHatPair('Orange Floral Grass Skirt',25506912,
  'Blush Floral Grass Skirt',83743124);
 await checkBandedHatPair('Orange and Black Vaporwave Eclectic Outfit',445316921,
  'Orange and Sky Vaporwave Eclectic Outfit',1117633216);

 // Additional real source icon two-tone categories: compare the
 // actual 96px game-pixel PNG, never visual rings/swatch overlays.
 await checkBandedHatPair('Black and Pink Sports Shorts',163071063,
  'Black and Green Sports Shorts',171970878);
 await checkBandedHatPair('Cyan and Magenta Vaporwave Wireframe Hat',20593879,
  'Cyan Vaporwave Wireframe Hat',528999373);
 await checkBandedHatPair('Cyan Vaporwave Wireframe Shirt',202845689,
  'Cyan and Magenta Vaporwave Wireframe Shirt',910147886);
 await checkBandedHatPair('Black and Green Basketball Jersey',149555759,
  'Black and Violet Basketball Jersey',353689638);
 await checkBandedHatPair('Black Feathered Wings',850228512,
  'Orange Feathered Wings',1128116806);
 await checkBandedHatPair('Dusky Twilight Origami Armor',739815033,
  'Purple Bee Origami Armor',1228749228);

 // Source-verified floorplan IDs can be added without a real-game asset file.
 await search.fill('Floorplan');
 const result=page.locator('.collection-search-result').first();
 await result.waitFor({timeout:20_000});
 await result.click();
 const item=page.locator('article.item-tile button.item-toggle:not([disabled])').first();
 await item.waitFor();
 await item.click();
 await page.locator('article.item-tile button.item-toggle[aria-pressed="true"]').first().waitFor();
 assert.equal(await page.locator('.bar-actions button[title="Undo"]').isDisabled(),false);
 // The date-dialog delete path must also be gated, with cancel preserving dates.
 await page.locator('article.item-tile button.date-button').first().click();
 await page.locator('dialog.date-dialog[open]').waitFor();
 await page.locator('dialog.date-dialog .date-dialog-clear').click();
 await page.locator('dialog.removal-confirm-dialog[open]').waitFor();
 assert.match(await page.locator('.removal-confirm-warning').innerText(),/date and time/i);
 await page.locator('.removal-cancel').click();
 await page.locator('dialog.removal-confirm-dialog[open]').waitFor({state:'hidden'});
 assert.equal(await item.getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('dialog.date-dialog[open]').count(),1);
 await page.locator('dialog.date-dialog .date-dialog-cancel').click();

 // A mistaken tile click can also be canceled without adding a history step.
 await item.click();
 await page.locator('dialog.removal-confirm-dialog[open]').waitFor();
 assert.equal(await item.getAttribute('aria-pressed'),'true');
 await page.locator('.removal-cancel').click();
 await page.locator('dialog.removal-confirm-dialog[open]').waitFor({state:'hidden'});
 assert.equal(await item.getAttribute('aria-pressed'),'true');
 await item.click();
 await page.locator('dialog.removal-confirm-dialog[open]').waitFor();
 await page.locator('.removal-confirm-action').click();
 await page.locator('article.item-tile button.item-toggle[aria-pressed="false"]').first().waitFor();
 const collectionSteps=await countHistory(page,3);
 assert.equal(await collectionSteps.filter({has:page.locator('.history-step')}).count(),3);
 await collectionSteps.nth(0).click();
 // goToHistory() persists to IndexedDB before clearing busy. The click returns
 // before that asynchronous transaction is complete, so wait for stable state.
 await page.locator('.bar-actions button[title="Redo"]:not([disabled])').waitFor({timeout:15_000});
 assert.equal(await page.locator('.bar-actions button[title="Undo"]').isDisabled(),true);

 // The synthetic unknown GUIDs must remain editable in the ungrouped category.
 await chooseTab(page,'achievements');
 const unknownCategory=page.locator('.achievement-category-grid button.achievement-category-card').last();
 await unknownCategory.waitFor({timeout:20_000});
 await unknownCategory.click();
 const achievement=page.locator('.achievement-item-grid button.achievement-toggle:not([disabled])').first();
 await achievement.waitFor();
 await achievement.click();
 await page.locator('.achievement-item-grid button.achievement-toggle[aria-pressed="true"]').first().waitFor();
 await achievement.click();
 await page.locator('dialog.removal-confirm-dialog[open]').waitFor();
 assert.match(await page.locator('.removal-confirm-warning').innerText(),/completion date and time/i);
 await page.locator('.removal-cancel').click();
 await page.locator('dialog.removal-confirm-dialog[open]').waitFor({state:'hidden'});
 assert.equal(await achievement.getAttribute('aria-pressed'),'true');
 let steps=await countHistory(page,2);
 assert.match(await steps.nth(1).getAttribute('class')??'',/active/);
 await page.locator('.history-menu > summary').click(); // close without altering state

 // Persist both redo-only Collections changes and one applied achievement.
 await page.waitForFunction(async()=>new Promise(resolve=>{
  const r=indexedDB.open('hkia-editor-local-session',1);
  r.onerror=()=>resolve(false);
  r.onsuccess=()=>{
   const d=r.result,t=d.transaction('unsaved-changes','readonly');
   const g=t.objectStore('unsaved-changes').get('current');
   g.onsuccess=()=>{
    const x=g.result,v=x?.historyCheckpoint;
    const ok=v instanceof Uint8Array&&v.byteLength>=16&&
     new DataView(v.buffer,v.byteOffset,v.byteLength).getUint32(8,true)===3&&
     new DataView(v.buffer,v.byteOffset,v.byteLength).getUint32(12,true)===1&&
     x?.patches?.length===0&&x?.achievementPatches?.length===1;
    d.close();resolve(ok);
   };
   g.onerror=()=>{d.close();resolve(false)};
  };
 }),null,{timeout:20_000});
 const before=await localDraft(page);
 assert.deepEqual(before,{changes:0,achievements:1,count:3,applied:1});

 await page.reload({waitUntil:'networkidle'});
 await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
 steps=await countHistory(page,3);
 assert.match(await steps.nth(0).getAttribute('class')??'',/active/);
 await steps.nth(1).click(); // redo one collection entry after recovery
 await page.locator('.bar-actions button[title="Undo"]:not([disabled])').waitFor({timeout:15_000});

 await chooseTab(page,'achievements');
 steps=await countHistory(page,2);
 assert.match(await steps.nth(1).getAttribute('class')??'',/active/);
 await steps.nth(0).click(); // independently undo saved achievement
 await chooseTab(page,'collections');
 await page.locator('.bar-actions button[title="Undo"]:not([disabled])').waitFor({timeout:15_000});
 assert.equal(await page.locator('.bar-actions button[title="Undo"]').isDisabled(),false,
  'achievement undo must not reset Collections cursor');

 // Verify history menu fits on the mobile viewport.
 await page.setViewportSize({width:390,height:844});
 await page.locator('.history-menu > summary').click();
 const bounds=await page.locator('.history-popover').boundingBox();
 assert.ok(bounds,'mobile history menu should be visible');
 assert.ok(bounds.x>=-2&&bounds.x+bounds.width<=392,
  'mobile history menu should not be clipped horizontally: '+JSON.stringify(bounds));

 await page.locator('.history-menu > summary').click();
 await page.locator('.file-menu > summary').click();
 const fileBounds=await page.locator('.file-menu .menu-popover').boundingBox();
 assert.ok(fileBounds,'mobile file menu should be visible');
 assert.ok(fileBounds.x>=-2&&fileBounds.x+fileBounds.width<=392,
  'mobile file menu should not be clipped horizontally: '+JSON.stringify(fileBounds));
 await page.locator('.file-menu > summary').click();

 // The separate confirmation path actually applies the destructive edits.
 // Undo/redo recovery assertions above are unaffected by this final smoke.
 await page.setViewportSize({width:1360,height:840});
 await search.fill('Floorplan');
 await page.locator('.collection-search-result').first().click();
 const dateButton=page.locator('article.item-tile button.date-button').first();
 await dateButton.waitFor();
 await dateButton.click();
 await page.locator('dialog.date-dialog[open]').waitFor();
 await page.locator('dialog.date-dialog .date-dialog-clear').click();
 await page.locator('dialog.removal-confirm-dialog[open]').waitFor();
 await page.locator('.removal-confirm-action').click();
 await page.locator('dialog.date-dialog[open]').waitFor({state:'hidden'});
 await page.locator('article.item-tile button.item-toggle[aria-pressed="false"]').first().waitFor();

 await chooseTab(page,'achievements');
 if(await page.locator('.achievement-category-grid').count()){
  await page.locator('.achievement-category-grid button.achievement-category-card').last().click();
 }
 const achievementsAfterReload=page.locator('.achievement-item-grid button.achievement-toggle:not([disabled])');
 await achievementsAfterReload.first().click(); // restore completed status
 await page.locator('.achievement-item-grid button.achievement-toggle[aria-pressed="true"]').first().waitFor();
 await achievementsAfterReload.first().click();
 await page.locator('dialog.removal-confirm-dialog[open]').waitFor();
 await page.locator('.removal-confirm-action').click();
 await page.locator('.achievement-item-grid button.achievement-toggle[aria-pressed="false"]').first().waitFor();

 // An original image must outrank a registered reconstruction. Supply
 // a synthetic reconstruction without shipping false game art, and block
 // the old atlas/palette to exercise the independent Item ID source path.
 const fakePng=Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR4nGP8JWfznwEPYMInOXwUAABpGAJjJPuaSQAAAABJRU5ErkJggg==',
  'base64'
 );
 const fakeRecord=id=>({
  file:id+'.png',sha256:'a'.repeat(64),
  provenance:'game-render',
  source:'unityfs:l_basicstyle_fullbody_imaginationarcher'
 });
 await page.route('**/variant-art/index.json',route=>route.fulfill({
  status:200,contentType:'application/json',
  body:JSON.stringify({
   schema:'HKIA.DyeVariantArt.1',version:'3.0.1',
   records:{'704486536':fakeRecord('704486536'),'585726126':fakeRecord('585726126')}
  })
 }));
 await page.route('**/variant-art/704486536.png',route=>route.fulfill({
  status:200,contentType:'image/png',body:fakePng
 }));
 await page.route('**/variant-art/585726126.png',route=>route.fulfill({status:404,body:'missing'}));
 await page.route('**/item-packs/**',route=>route.fulfill({status:404,body:'missing'}));
 await page.route('**/native-dye-palettes.json',route=>route.fulfill({status:404,body:'missing'}));
 await page.reload({waitUntil:'networkidle'});
 await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
 await chooseTab(page,'collections');
 const finalSearch=page.locator('.collection-controls input[type="search"]');
 await finalSearch.fill('Ice Cream Archer Hat');
 await page.locator('.collection-search-result').first().click();
 const originalFirst=page.locator('#collection-item-704486536 .item-sprite[data-dye-source="game-source-sprite"]');
 await originalFirst.waitFor({timeout:30_000});
 await sampledSprite(originalFirst);
 await finalSearch.fill('Orange Archer Hat');
 await page.locator('.collection-search-result').first().click();
 const originalFallback=page.locator('#collection-item-585726126 .item-sprite[data-dye-source="game-source-sprite"]');
 await originalFallback.waitFor({timeout:30_000});
 assert.equal(await originalFallback.getAttribute('data-icon-fidelity'),'game-original');
 assert.ok((await originalFallback.evaluate(el=>getComputedStyle(el).backgroundImage)).includes('/dynamic-colorways/585726126.webp?v='),
  'original artwork must display even when shared packs and palettes are unavailable');
 // When the original itself cannot decode, the separately registered
 // reconstruction remains a fallback, with its fidelity marked accordingly.
 await page.route(/\/(?:source-colorways|dynamic-colorways)\/704486536\.webp(?:\?.*)?$/,route=>route.fulfill({status:404,body:'missing'}));
 await page.reload({waitUntil:'networkidle'});
 await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
 await chooseTab(page,'collections');
 await page.locator('.collection-controls input[type="search"]').fill('Ice Cream Archer Hat');
 await page.locator('.collection-search-result').first().click();
 const captured=page.locator('#collection-item-704486536 .item-sprite[data-dye-source="game-render"]');
 await captured.waitFor({timeout:30_000});
 assert.equal(await captured.getAttribute('data-icon-fidelity'),'verified-reconstruction');
 assert.equal(await captured.evaluate(el=>getComputedStyle(el).backgroundSize),'contain');

 assert.deepEqual(errors,[],'no console exceptions or 5xx during browser replay');
 console.log('CHROMIUM UI HISTORY SMOKE PASS: guarded collection and achievement removals, timestamp dialog, history, IndexedDB reload, mobile menu');
 await context.close();
 await achievementExportReopenRoundtrip();
 await inventoryDynamicPaletteArtSmoke();
 await chefRuntimeSmoke(browser,origin,base);
 await wandRuntimeSmoke(browser,origin,base);
 await inventoryEditExportSmoke();
 await inventoryOriginalArtSmoke();
 await inventoryDynamicFlowerArtSmoke();
 await achievementDstFoldExportSmoke();
 await achievementAtlasRetrySmoke();
}
try{await run()}finally{
 await browser?.close();
 service?.kill('SIGTERM');
}

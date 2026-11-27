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
import {flowerRuntimeCoverage} from './flower-runtime-coverage.mjs';

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

function createSyntheticSlot({childCompleted=null,artInventory=false,flowerInventory=false,flowerGrowthInventory=false,paletteInventory=false,paletteCreationInventory=false,editableFlower=false,ownedRestrictedFlower=false,editableFurniture=false,batchInventory=false,chefInventory=false,chefQuantityInventory=false,bobaEditInventory=false,bobaCreateInventory=false,cafeEditInventory=false,cafeCreateInventory=false,wandEditInventory=false,nestedWandInventory=false,quantityBounds=false,emptyMaterialInventory=false,ordinaryFurnitureInventory=false,paletteRemovalInventory=false,ordinaryClothingInventory=false}={}){
 const version='3.0.1';
 const collection=doc(39,arr(map(),map([2],i64(638000000000000001n),[3],i64(9n))));
 const object=doc(32,arr([3],hash(0,0,0,3),[0],arr(collection)));
 const child=doc(16,arr([1],hash(1,0,0,1),arr([childCompleted?0xc3:0xc2],f32(1),childCompleted?timestamp(...childCompleted):[0xc0])));
 const parent=doc(16,arr([2],hash(2,0,0,1),arr([0xc2],f32(2),[0xc0])));
 const counter=doc(17,arr([1],hash(1,0,0,2),arr(f32(2),[0xc0],[0x90])));
 const inventory=doc(1,arr([4],u32(315822),[0],u32(6),[0xc0]));
 const color=(r,g,b)=>arr(f32(r),f32(g),f32(b),f32(1));
 const palette=(id,colors)=>doc(1,arr([id],u32(1835273963),u32(id),u32(1),arr([6],arr(...colors))));
 const nativeColor=words=>arr(...words.map(n=>append([0xca],u32(n).subarray(1))));
 const nativeColors=[[0x3f41c1c2,0x3e24a4a5,0x3e74f4f5,0x3f800000],[0x3f6cade3,0x3eb8b8b9,0x3ecacacb,0x3f800000],[0x3f73f3f4,0x3f20dbbe,0x3dd6adba,0x3f800000]].map(nativeColor);
 const originalArtItem=paletteCreationInventory?palette(5,nativeColors):paletteInventory?palette(5,[color(1,0,0),color(0,1,0),color(0,0,1)]):doc(1,arr([5],u32(1286846063),[0],u32(3),[0xc0]));
 const sourceFitItem=paletteInventory?palette(6,[color(0,0,1),color(1,0,0),color(0,1,0)]):doc(1,arr([6],u32(54272482),[0],u32(2),[0xc0]));
 const nonCollectionItem=doc(1,arr([7],u32(427689),[0],u32(5),[0xc0]));
 const flower=(id,color,pattern,accent,grow=6)=>doc(1,arr([id],u32(43114910),u32(id),u32(1),arr([7],arr([grow],u32(color),u32(pattern),u32(accent)))));
 const chef=(id,item,unique)=>doc(1,arr([id],u32(item),u32(id),u32(1),unique));
 const cafe=colors=>arr([3],arr(arr(u32(99)),arr(...colors.map(u32))));
 const boba=color=>arr([4],arr(u32(color),u32(6),u32(11),u32(19),u32(99)));
 const placedFurniture=arr(u32(3202680),u32(0),u32(0),u32(0),u32(0),u32(0),[0xc0],[0xc0],arr(),arr(),u32(0),arr(),u32(0));
 const furnitureHome=arr(hash(41,42,43,44),arr(),u32(0),u32(0),hash(0,0,0,0),i64(0n),[0xc0],[0xc2],[0xc0],arr(placedFurniture),[0xc0],[0xc0],u32(0),u32(0),arr());
 const furnitureHomeObject=doc(32,arr([10],hash(10,0,0,0),[0],arr(doc(8,arr(arr(furnitureHome))))));
 const model=arr([0],cafeCreateInventory?[10]:(editableFlower||editableFurniture||paletteCreationInventory||bobaCreateInventory||wandEditInventory||nestedWandInventory)?[8]:[4],arr(doc(18,arr([0],u32(87),str(version))),child,parent,counter,object,inventory,
  ...(artInventory?[originalArtItem,sourceFitItem,nonCollectionItem]:[]),
  ...(paletteRemovalInventory?[doc(10,arr([8],hash(1,2,3,4),arr(),arr(),arr(),hash(1,2,3,4),[0xc3],
   paletteRemovalInventory==='copied'?arr([6],arr(color(1,0,0),color(0,1,0),color(0,0,1))):[0xc0])),
   doc(22,arr([9],arr(),arr(),[0xc0],[0xc0],arr()))]:[]),
  ...(batchInventory?[doc(1,arr([8],u32(517031),[0],u32(9),[0xc0]))]:[]),
  ...(quantityBounds?[doc(1,arr([9],u32(413462588),[0],u32(2),[0xc0]))]:[]),
  ...(ordinaryFurnitureInventory?[doc(1,arr([8],u32(427689),[0],u32(5),[0xc0])),doc(1,arr([9],u32(3202680),[0],u32(6),[0xc0])),furnitureHomeObject]:[]),
  ...(ordinaryClothingInventory?[doc(10,arr([8],hash(1,2,3,4),
   ordinaryClothingInventory==='equipped'?arr(hash(0x6ae79913,0x4dfd99ac,0xe020e4be,0x0f6869ef)):ordinaryClothingInventory==='flower-equipped'?arr(hash(0x7f2bd4e4,0x4c45f5cf,0x7f4ec1b4,0xa1107995)):arr(),
   ordinaryClothingInventory==='preset'?arr(hash(11,22,33,44)):arr(),arr(),hash(1,2,3,4),[0xc3],[0xc0])),
   doc(22,arr([9],arr(),arr(),[0xc0],[0xc0],arr())),
   ...(['flower','flower-equipped'].includes(ordinaryClothingInventory)?[doc(1,arr([8],u32(897617923),u32(11),u32(6),arr([7],arr([6],u32(6),u32(0),u32(0)))))]:[])]:[]),
  ...(emptyMaterialInventory?[doc(1,arr([9],u32(emptyMaterialInventory==='currency'?348154640:1877756618),[0],u32(6),[0xc0])),doc(1,arr([10],u32(emptyMaterialInventory==='currency'?1774854033:627013240),[0],u32(0),[0xc0]))]:[]),
  ...(wandEditInventory?[chef(8,1429161083,arr([9],arr([0],[0xc0],u32(104),u32(125),u32(118))))]:[]),
  ...(nestedWandInventory?[chef(8,384749651,arr([9],arr(u32(61381969),arr([8],arr(u32(13),u32(2),u32(0))),u32(104),u32(125),u32(0))))]:[]),
  ...(editableFlower?[flower(8,1,ownedRestrictedFlower?6:0,0)]:[]),
  ...(chefInventory?[chef(8,203331651,cafe([6,14,11])),chef(9,203331651,cafe([14,6,11])),chef(10,1798633565,boba(6)),chef(11,1798633565,boba(14))]:[]),
  ...(cafeCreateInventory?[chef(8,1338995084,arr([3],arr(arr(u32(44),u32(49),u32(48)),arr(u32(6),u32(46),u32(9))))),chef(9,1932639321,arr([3],arr(arr(u32(44),u32(137)),arr(u32(6),u32(10))))),doc(1,arr([10],u32(1643431747),[0],u32(1),[0xc0]))]:[]),
  ...(cafeEditInventory?[chef(8,203331651,arr([3],arr(arr(u32(44),u32(49),u32(48)),arr(u32(6),u32(46),u32(9)))))]:[]),
  ...(bobaCreateInventory?[chef(8,1798633565,arr([4],arr(u32(6),u32(44),u32(76),u32(75),u32(73))))]:[]),
  ...(bobaEditInventory?[chef(8,1798633565,arr([4],arr(u32(6),u32(44),u32(76),u32(75),u32(73))))]:[]),
  ...(chefQuantityInventory?[chef(8,203331651,cafe([6,14,11,19])),chef(9,1798633565,boba(14)),chef(10,203331651,cafe([6,14,11,20])),chef(11,1798633565,arr([4],arr(u32(14),u32(6),u32(11),u32(19),u32(98))))]:[]),
  ...(editableFurniture?[doc(1,arr([8],u32(61381969),u32(11),u32(93),arr([8],arr(u32(13),u32(2),u32(0)))))]:[]),
  ...(flowerInventory?[flower(8,1,0,0),flower(9,9,0,0),flower(10,1,10,16),flower(11,1,3,0),flower(12,1,9999,0)]:[]),
  ...(flowerGrowthInventory?[flower(8,1,0,0,0),flower(9,1,0,0,6),flower(10,1,0,0,7)]:[])));
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
  const inputs=page.locator('.inventory-card input[name="quantity"]');
  assert.deepEqual(await inputs.evaluateAll(rows=>rows.map(r=>r.min)),['1','1']);
  await inputs.first().fill('4');await page.locator('.inventory-card button[type="submit"]').first().click();
  await page.locator('.inventory-card button[type="submit"]:not([disabled])').nth(1).waitFor();
  await inputs.nth(1).fill('7');await page.locator('.inventory-card button[type="submit"]').nth(1).click();
  await page.locator('.inventory-card button[type="submit"]:not([disabled])').nth(1).waitFor();
  await page.locator('.inventory-card .inventory-unique-edit-button').first().click();
  const editor=page.locator('dialog[aria-labelledby="palette-editor-title"]');
  await editor.waitFor();await editor.locator('.inventory-palette-option').first().click();
  await editor.locator('button[type="submit"]:not([disabled])').click();await editor.waitFor({state:'hidden'});
  await page.locator('button[title="Undo"]:not([disabled])').click();
  await page.locator('button[title="Redo"]:not([disabled])').click();
  await page.locator('.inventory-card button[type="submit"]:not([disabled])').nth(1).waitFor();
  await page.reload({waitUntil:'networkidle'});await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await page.locator('.inventory-controls input[type="search"]').fill('1835273963');
  await inputs.nth(1).waitFor();
  assert.deepEqual(await inputs.evaluateAll(rows=>rows.map(r=>r.value)),['4','7']);
  // The source-only preview must survive an unavailable mask without
  // pretending that the original base is the selected individual color.
  await page.route('**/dynamic-palette-art/palette-mask-rgb-v3.0.1.webp',route=>route.fulfill({status:404,body:''}));
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await page.locator('.inventory-controls input[type="search"]').fill('1835273963');
  const originals=page.locator('.inventory-card .item-sprite[data-dynamic-art-source="native-palette"][data-icon-fidelity="source-derived-base-only"]');
  await originals.nth(1).waitFor({timeout:30_000});
  const originalPixels=await originals.evaluateAll(async els=>Promise.all(els.map(async el=>{
   const im=await createImageBitmap(await (await fetch(getComputedStyle(el).backgroundImage.slice(5,-2))).blob());
   const canvas=document.createElement('canvas');canvas.width=im.width;canvas.height=im.height;
   const ctx=canvas.getContext('2d');ctx.drawImage(im,0,0);im.close();
   return Array.from(ctx.getImageData(0,0,canvas.width,canvas.height).data);
  })));
  assert.equal(originalPixels.length,2);assert.deepEqual(originalPixels[0],originalPixels[1]);
  assert.deepEqual(originalPixels[0].filter((_,i)=>i%4===3),images[0].alpha);
  await page.locator('.file-menu > summary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),page.locator('.file-menu .menu-popover > button').nth(2).click()]);
  const output=readFileSync(await download.path());
  const {instance}=await WebAssembly.instantiate(readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm'),{}),e=instance.exports;
  const ptr=e.hkia_stage(output.length);assert.ok(ptr>0);new Uint8Array(e.memory.buffer,ptr,output.length).set(output);
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_palettes_snapshot(),0);
  const v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
  assert.equal(v.getUint32(0,true),2);
  assert.deepEqual(Array.from({length:4},(_,i)=>v.getUint32(8+i*4,true)),[0x3f41c1c2,0x3e24a4a5,0x3e74f4f5,0x3f800000]);
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM DYNAMIC PALETTE PASS: native unique Color1/2/3, independent quantities, draft recovery and local generation');
 }finally{await context.close();}
}
async function inventoryPaletteRemovalSmoke(){
 for(const state of [true,'copied']){
  const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800}});
  try{
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+base,{waitUntil:'networkidle'});
   await page.locator('input[type="file"]').setInputFiles({name:'synthetic-palette-removal.save',mimeType:'application/octet-stream',
    buffer:Buffer.from(createSyntheticSlot({artInventory:true,paletteInventory:true,paletteRemovalInventory:state}))});
   await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
   await chooseTab(page,'inventory');
   const search=page.locator('.inventory-controls input[type="search"]');
   await search.fill('1835273963');
   const cards=page.locator('.inventory-card');
   await page.waitForFunction(()=>document.querySelectorAll('.inventory-card input[name="quantity"]').length===2);
   assert.equal(await cards.locator('input[name="quantity"][min="0"]').count(),state===true?2:1);
   assert.equal(await cards.locator('.inventory-stack-delete:not([disabled])').count(),state===true?2:1);
   await cards.locator('.inventory-stack-delete:not([disabled])').first().click();
   const modal=page.locator('.removal-confirm-dialog');await modal.waitFor({state:'visible'});
   assert.equal(await modal.locator('.inventory-removal-swatch').count(),3);
   const swatches=await modal.locator('.inventory-removal-swatch').evaluateAll(els=>els.map(el=>el.getAttribute('aria-label')));
   assert.ok(swatches.every(v=>v?.startsWith('rgba(')));
   await modal.locator('.removal-confirm-action').click();
   await page.locator('.inventory-empty-stack').waitFor();
   assert.equal(await page.locator('.inventory-empty-stack input[name="quantity"]').inputValue(),'0');
   await page.reload({waitUntil:'networkidle'});
   await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
   await chooseTab(page,'inventory');await search.fill('1835273963');
   await page.locator('.inventory-empty-stack').waitFor();
   await page.locator('button[title="Undo"]:not([disabled])').click();
   await page.locator('.inventory-empty-stack').waitFor({state:'hidden'});
   await page.waitForFunction(expected=>document.querySelectorAll('.inventory-card .inventory-stack-delete:not([disabled])').length===expected,state===true?2:1);
   assert.equal(await cards.locator('.inventory-stack-delete:not([disabled])').count(),state===true?2:1);
   assert.deepEqual(errors,[]);
  }finally{await context.close()}
 }
 console.log('CHROMIUM PALETTE REMOVAL PASS: copied avatar palette protected; zero, recovery and undo');
}
async function inventoryFirstPaletteSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800},acceptDownloads:true});
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-first-palette.save',mimeType:'application/octet-stream',buffer:Buffer.from(createSyntheticSlot())});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await page.locator('.inventory-add-toggle').click();
  const search=page.locator('.inventory-controls input[type="search"]');await search.fill('1835273963');
  const card=page.locator('.inventory-card'),dialog=page.locator('dialog[aria-labelledby="palette-editor-title"]');
  await card.locator('.inventory-unique-edit-button').click();await dialog.waitFor();
  assert.equal(await dialog.locator('button[type="submit"]').count(),0);
  await dialog.locator('.inventory-palette-option:not([disabled])').first().click();
  await dialog.locator('[data-palette-slot="1"]:not([disabled])').click();
  await dialog.locator('.inventory-palette-option:not([disabled])').first().click();
  await dialog.locator('input[name="variant-add-quantity"]:not([disabled])').fill('2');
  await dialog.locator('.inventory-create-palette:not([disabled])').click();await dialog.waitFor({state:'hidden'});
  await card.locator('.inventory-add-source').waitFor();
  await page.locator('.inventory-add-toggle:not([disabled])').click();await search.fill('1835273963');
  const qty=card.locator('input[name="quantity"]');await qty.waitFor();assert.equal(await qty.inputValue(),'2');
  await page.locator('button[title="Undo"]:not([disabled])').click();await card.waitFor({state:'detached'});
  await page.locator('button[title="Redo"]:not([disabled])').click();await qty.waitFor();
  await page.reload({waitUntil:'networkidle'});await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await search.fill('1835273963');await qty.waitFor();assert.equal(await qty.inputValue(),'2');
  await page.locator('.file-menu > summary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),page.locator('.file-menu .menu-popover > button').nth(2).click()]);
  const output=readFileSync(await download.path());
  const {instance}=await WebAssembly.instantiate(readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm'),{}),e=instance.exports;
  const ptr=e.hkia_stage(output.length);assert.ok(ptr>0);new Uint8Array(e.memory.buffer,ptr,output.length).set(output);
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_absent_palette_default(),0);
  assert.equal(new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len()).getUint32(0,true),0);
  assert.equal(e.hkia_inventory_palettes_snapshot(),0);
  const v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());assert.equal(v.getUint32(0,true),1);
  assert.deepEqual(errors,[]);console.log('CHROMIUM FIRST PALETTE PASS: absent chooser, history, recovery and export');
 }finally{await context.close()}
}
async function inventoryPaletteCreationSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800}});
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-palette-create.save',mimeType:'application/octet-stream',buffer:Buffer.from(createSyntheticSlot({artInventory:true,paletteCreationInventory:true}))});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await page.locator('.inventory-controls input[type="search"]').fill('1835273963');
  const rows=page.locator('.inventory-card input[name="quantity"]'),dialog=page.locator('dialog[aria-labelledby="palette-editor-title"]');
  await rows.first().waitFor();assert.equal(await rows.count(),1);
  await page.locator('.inventory-card .inventory-unique-edit-button').first().click();
  await dialog.waitFor();await dialog.locator('.inventory-palette-option').first().click();
  await dialog.locator('[data-palette-slot="1"]').click();await dialog.locator('.inventory-palette-option').first().click();
  await dialog.locator('[data-palette-slot="0"]').click();await dialog.locator('.inventory-palette-reset').waitFor();
  await dialog.locator('input[name="variant-add-quantity"]').fill('3');
  await dialog.locator('.inventory-create-palette:not([disabled])').click();await dialog.waitFor({state:'hidden'});
  await rows.nth(1).waitFor();assert.deepEqual(await rows.evaluateAll(els=>els.map(e=>e.value)),['1','3']);
  await page.locator('button[title="Undo"]:not([disabled])').click();await rows.nth(1).waitFor({state:'detached'});
  await page.locator('button[title="Redo"]:not([disabled])').click();await rows.nth(1).waitFor();
  await page.locator('.inventory-card button[type="submit"]:not([disabled])').nth(1).waitFor();
  await page.reload({waitUntil:'networkidle'});await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await page.locator('.inventory-controls input[type="search"]').fill('1835273963');
  await rows.nth(1).waitFor();assert.deepEqual(await rows.evaluateAll(els=>els.map(e=>e.value)),['1','3']);
  await page.locator('.file-menu > summary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),page.locator('.file-menu .menu-popover > button').nth(2).click()]);
  const output=readFileSync(await download.path());
  const {instance}=await WebAssembly.instantiate(readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm'),{}),e=instance.exports;
  const ptr=e.hkia_stage(output.length);assert.ok(ptr>0);new Uint8Array(e.memory.buffer,ptr,output.length).set(output);
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_palettes_snapshot(),0);
  const v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
  assert.equal(v.getUint32(0,true),2);
  const words=at=>Array.from({length:12},(_,i)=>v.getUint32(at+i*4,true));
  assert.deepEqual(words(8),[0x3f41c1c2,0x3e24a4a5,0x3e74f4f5,0x3f800000,0x3f6cade3,0x3eb8b8b9,0x3ecacacb,0x3f800000,0x3f73f3f4,0x3f20dbbe,0x3dd6adba,0x3f800000]);
  assert.notDeepEqual(words(60).slice(0,4),words(8).slice(0,4));
  assert.notDeepEqual(words(60).slice(4,8),words(8).slice(4,8));
  assert.deepEqual(words(60).slice(8),words(8).slice(8));
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM PALETTE ADD PASS: independent stack, quantity, history, draft and export reparse');
 }finally{await context.close()}
}
async function inventoryFirstWandSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800},acceptDownloads:true});
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-first-wand.save',mimeType:'application/octet-stream',buffer:Buffer.from(createSyntheticSlot())});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await page.locator('.inventory-add-toggle').click();
  const search=page.locator('.inventory-controls input[type="search"]');
  await search.fill('1429161083');
  const card=page.locator('.inventory-card'),dialog=page.locator('dialog[aria-labelledby="wand-editor-title"]');
  await card.locator('.inventory-unique-edit-button').click();await dialog.waitFor();
  assert.equal(await dialog.locator('button[type="submit"]').count(),0);
  const select=dialog.locator('select[name="wand-variant"]');
  assert.equal(await select.locator('option').count(),36);
  const value=await select.locator('option[data-wand-variant="106:127"]').getAttribute('value');assert.ok(value!==null);
  await select.selectOption(value);
  await dialog.locator('input[name="variant-add-quantity"]').fill('2');
  await dialog.locator('.inventory-create-wand:not([disabled])').click();await dialog.waitFor({state:'hidden'});
  await card.locator('.inventory-add-source').waitFor();
  await page.locator('.inventory-add-toggle:not([disabled])').click();await search.fill('1429161083');
  await card.locator('input[name="quantity"]').waitFor();
  assert.equal(await card.locator('input[name="quantity"]').inputValue(),'2');
  await card.locator('.inventory-unique-edit-button').click();await dialog.waitFor();
  assert.equal(await select.locator('option[data-wand-variant="106:127"]').count(),0);
  await dialog.locator('.date-dialog-cancel').click();await dialog.waitFor({state:'hidden'});
  await page.locator('button[title="Undo"]:not([disabled])').click();await card.waitFor({state:'detached'});
  await page.locator('button[title="Redo"]:not([disabled])').click();await card.locator('input[name="quantity"]').waitFor();
  await page.reload({waitUntil:'networkidle'});await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await search.fill('1429161083');await card.locator('input[name="quantity"]').waitFor();
  assert.equal(await card.locator('input[name="quantity"]').inputValue(),'2');
  await page.locator('.file-menu > summary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),page.locator('.file-menu .menu-popover > button').nth(2).click()]);
  const output=readFileSync(await download.path());
  const {instance}=await WebAssembly.instantiate(readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm'),{}),e=instance.exports;
  const ptr=e.hkia_stage(output.length);assert.ok(ptr>0);new Uint8Array(e.memory.buffer,ptr,output.length).set(output);
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_absent_wand_ids(),0);
  const v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());assert.equal(v.getUint32(0,true),6);
  assert.equal(e.hkia_inventory_snapshot(),0);const iv=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
  const rows=Array.from({length:iv.getUint32(0,true)},(_,i)=>[iv.getInt32(4+i*16+4,true),iv.getInt32(4+i*16+8,true)]);
  assert.ok(rows.some(([id,q])=>id===1429161083&&q===2));
  assert.deepEqual(errors,[]);console.log('CHROMIUM FIRST MAGIC WAND PASS: absent chooser, history, recovery and export');
 }finally{await context.close()}
}
async function inventoryFirstItemWandSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800},acceptDownloads:true});
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-first-item-wand.save',mimeType:'application/octet-stream',buffer:Buffer.from(createSyntheticSlot())});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await page.locator('.inventory-add-toggle').click();
  const search=page.locator('.inventory-controls input[type="search"]');
  await search.fill('384749651');
  const card=page.locator('.inventory-card'),dialog=page.locator('dialog[aria-labelledby="wand-editor-title"]');
  await card.locator('.inventory-unique-edit-button').click();await dialog.waitFor();
  const add=dialog.locator('.inventory-create-wand');assert.equal(await add.isEnabled(),false);
  await dialog.locator('input[name="wand-source-search"]').fill('1185152302');
  await dialog.locator('select[name="wand-source"]').selectOption('1185152302');
  const select=dialog.locator('select[name="wand-variant"]');
  const option=await select.locator('option[data-wand-variant="106:127"]').getAttribute('value');
  assert.ok(option!==null);await select.selectOption(option);
  await dialog.locator('input[name="variant-add-quantity"]').fill('2');
  await add.click();await dialog.waitFor({state:'hidden'});
  await card.locator('.inventory-unique-edit-button').click();await dialog.waitFor();
  await dialog.locator('input[name="wand-source-search"]').fill('1185152302');
  await dialog.locator('select[name="wand-source"]').selectOption('1185152302');
  await page.waitForFunction(()=>document.querySelector('select[name="wand-variant"]')?.options.length===35);
  assert.equal(await select.locator('option[data-wand-variant="106:127"]').count(),0);
  await dialog.locator('input[name="wand-source-search"]').fill('315822');
  await dialog.locator('select[name="wand-source"]').selectOption('315822');
  await page.waitForFunction(()=>document.querySelector('select[name="wand-variant"]')?.options.length===36);
  await select.selectOption(await select.locator('option[data-wand-variant="106:127"]').getAttribute('value'));
  await dialog.locator('input[name="variant-add-quantity"]').fill('4');
  await add.click();await dialog.waitFor({state:'hidden'});
  await page.locator('.inventory-add-toggle:not([disabled])').click();await search.fill('384749651');
  await card.locator('input[name="quantity"]').nth(1).waitFor();
  assert.deepEqual((await card.locator('input[name="quantity"]').evaluateAll(els=>els.map(e=>e.value))).sort(),['2','4']);
  const firstIndex=(await card.locator('input[name="quantity"]').evaluateAll(els=>els.map(e=>e.value))).indexOf('2');
  assert.ok(firstIndex>=0);
  await card.nth(firstIndex).locator('.inventory-unique-edit-button').click();await dialog.waitFor();
  await dialog.locator('input[name="wand-source-search"]').fill('315822');
  await dialog.locator('select[name="wand-source"]').selectOption('315822');
  await page.waitForFunction(()=>document.querySelector('select[name="wand-variant"]')?.options.length===35);
  assert.equal(await select.locator('option[data-wand-variant="106:127"]').count(),0);
  await select.selectOption(await select.locator('option[data-wand-variant="104:125"]').getAttribute('value'));
  await dialog.locator('button[type="submit"]:not([disabled])').click();await dialog.waitFor({state:'hidden'});
  await page.reload({waitUntil:'networkidle'});await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await search.fill('384749651');
  await card.locator('input[name="quantity"]').nth(1).waitFor();
  assert.deepEqual((await card.locator('input[name="quantity"]').evaluateAll(els=>els.map(e=>e.value))).sort(),['2','4']);
  await page.locator('.file-menu > summary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),page.locator('.file-menu .menu-popover > button').nth(2).click()]);
  const output=readFileSync(await download.path());
  const {instance}=await WebAssembly.instantiate(readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm'),{}),e=instance.exports;
  const ptr=e.hkia_stage(output.length);assert.ok(ptr>0);new Uint8Array(e.memory.buffer,ptr,output.length).set(output);
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_unique_snapshot(),0);
  const v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());let at=0;
  const u=()=>{const n=v.getUint32(at,true);at+=4;return n};const count=u(),rows=[];
  for(let i=0;i<count;i++){const id=u(),present=u(),uid=u(),tag=u()|0,fields=u(),n=u();const words=Array.from({length:n},()=>u()|0);u();if(tag===9)rows.push(words)}
  assert.ok(rows.some(w=>w.join(':')==='315822:104:125:0:-1:0'));
  assert.ok(!rows.some(w=>w.join(':')==='1185152302:106:127:0:-1:0'));
  assert.ok(rows.some(w=>w.join(':')==='315822:106:127:0:-1:0'));
  assert.deepEqual(errors,[]);console.log('CHROMIUM FIRST ITEM WAND PASS: explicit source selection, recovery and reparse');
 }finally{await context.close()}
}
async function inventoryFirstFurnitureWandSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800},acceptDownloads:true});
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-first-furniture-wand.save',mimeType:'application/octet-stream',buffer:Buffer.from(createSyntheticSlot({editableFurniture:true}))});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');const search=page.locator('.inventory-controls input[type="search"]');
  await page.locator('.inventory-add-toggle:not([disabled])').click();await search.fill('384749651');
  const card=page.locator('.inventory-card'),dialog=page.locator('dialog[aria-labelledby="wand-editor-title"]');
  await card.locator('.inventory-unique-edit-button:not([disabled])').click();await dialog.waitFor();
  const source=dialog.locator('select[name="wand-owned-furniture"]');
  await source.selectOption('8');
  const pair=dialog.locator('select[name="wand-variant"]:not([disabled])');
  const choice=await pair.locator('option[data-wand-variant="106:127"]').getAttribute('value');assert.ok(choice!==null);
  await pair.selectOption(choice);
  await dialog.locator('input[name="variant-add-quantity"]').fill('3');
  await dialog.locator('.inventory-create-wand:not([disabled])').click();await dialog.waitFor({state:'hidden'});
  await page.locator('.inventory-add-toggle:not([disabled])').click();
  await search.fill('61381969');assert.equal(await card.locator('input[name="quantity"]').inputValue(),'93');
  await page.reload({waitUntil:'networkidle'});await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await search.fill('384749651');assert.equal(await card.locator('input[name="quantity"]').inputValue(),'3');
  await page.locator('.file-menu > summary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),page.locator('.file-menu .menu-popover > button').nth(2).click()]);
  const output=readFileSync(await download.path());
  const {instance}=await WebAssembly.instantiate(readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm'),{}),e=instance.exports;
  const ptr=e.hkia_stage(output.length);assert.ok(ptr>0);new Uint8Array(e.memory.buffer,ptr,output.length).set(output);
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_unique_snapshot(),0);
  const v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());let at=0;
  const u=()=>{const n=v.getUint32(at,true);at+=4;return n};const count=u(),rows=[];
  for(let i=0;i<count;i++){const id=u(),present=u(),uid=u(),tag=u()|0,fields=u(),n=u();const words=Array.from({length:n},()=>u()|0);u();rows.push({id,tag,words})}
  assert.ok(rows.some(r=>r.id===8&&r.tag===8&&r.words.join(':')==='13:2:0'));
  assert.ok(rows.some(r=>r.tag===9&&r.words.join(':')==='61381969:106:127:0:8:3:13:2:0'));
  assert.deepEqual(errors,[]);console.log('CHROMIUM FIRST FURNITURE WAND PASS: copied owned customization, source unchanged, recovery and reparse');
 }finally{await context.close()}
}
async function inventoryNestedWandSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800},acceptDownloads:true});
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-nested-wand.save',mimeType:'application/octet-stream',buffer:Buffer.from(createSyntheticSlot({nestedWandInventory:true}))});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');const search=page.locator('.inventory-controls input[type="search"]');await search.fill('384749651');
  const card=page.locator('.inventory-card'),dialog=page.locator('dialog[aria-labelledby="wand-editor-title"]');
  await card.locator('.inventory-unique-edit-button:not([disabled])').click();await dialog.waitFor();
  const materials=dialog.locator('select[name="wand-nested-material"]');
  const material=await materials.locator('option[data-wand-material="13:3:0"]').getAttribute('value');assert.ok(material!==null);
  await materials.selectOption(material);
  await dialog.locator('button[type="submit"]:not([disabled])').click();await dialog.waitFor({state:'hidden'});
  await card.locator('.inventory-unique-edit-button:not([disabled])').click();await dialog.waitFor();
  const pair=dialog.locator('select[name="wand-variant"]');
  const choice=await pair.locator('option[data-wand-variant="106:127"]').getAttribute('value');assert.ok(choice!==null);
  await pair.selectOption(choice);
  const combinedOption=dialog.locator('select[name="wand-nested-material"]:not([disabled]) option[data-wand-material="502:3:0"]');
  await page.waitForFunction(()=>{const dialog=document.querySelector('dialog[aria-labelledby="wand-editor-title"]');return Boolean(dialog?.querySelector('select[name="wand-variant"]:not([disabled])'))});
  assert.equal(await dialog.locator('[role="alert"]').count(),0,await dialog.locator('[role="alert"]').allTextContents().then(v=>v.join(' ')));
  await combinedOption.waitFor({state:'attached'});
  const combinedChoice=await combinedOption.getAttribute('value');assert.ok(combinedChoice!==null);
  await materials.selectOption(combinedChoice);
  await dialog.locator('input[name="variant-add-quantity"]').fill('3');
  await dialog.locator('.inventory-create-wand:not([disabled])').click();await dialog.waitFor({state:'hidden'});
  await page.locator('.inventory-add-toggle:not([disabled])').click();await search.fill('384749651');
  await card.locator('.inventory-add-source:not([disabled])').first().click();await dialog.waitFor();
  const materialOnly=materials.locator('option[data-wand-material]').first();
  const materialOnlyKey=await materialOnly.getAttribute('data-wand-material'),materialOnlyValue=await materialOnly.getAttribute('value');
  assert.ok(materialOnlyKey&&materialOnlyValue!==null);
  await materials.selectOption(materialOnlyValue);
  assert.equal(await pair.inputValue(),'-1');
  await dialog.locator('input[name="variant-add-quantity"]').fill('4');
  assert.equal(await dialog.locator('button[type="submit"]').count(),0);
  await dialog.locator('.inventory-create-wand:not([disabled])').click();await dialog.waitFor({state:'hidden'});
  await page.locator('.inventory-add-toggle:not([disabled])').click();await search.fill('384749651');
  const quantities=card.locator('input[name="quantity"]');
  await quantities.nth(2).waitFor();
  assert.deepEqual((await quantities.evaluateAll(els=>els.map(e=>e.value))).sort(),['1','3','4']);
  await page.reload({waitUntil:'networkidle'});await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await search.fill('384749651');await quantities.nth(2).waitFor();
  assert.deepEqual((await quantities.evaluateAll(els=>els.map(e=>e.value))).sort(),['1','3','4']);
  await page.locator('.file-menu > summary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),page.locator('.file-menu .menu-popover > button').nth(2).click()]);
  const output=readFileSync(await download.path());
  const {instance}=await WebAssembly.instantiate(readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm'),{}),e=instance.exports;
  const ptr=e.hkia_stage(output.length);assert.ok(ptr>0);new Uint8Array(e.memory.buffer,ptr,output.length).set(output);
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_unique_snapshot(),0);
  const v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());let at=0;
  const u=()=>{const n=v.getUint32(at,true);at+=4;return n};const count=u(),rows=[];
  for(let i=0;i<count;i++){const id=u(),present=u(),uid=u(),tag=u()|0,fields=u(),n=u();const words=Array.from({length:n},()=>u()|0);u();if(tag===9)rows.push(words)}
  assert.ok(rows.some(w=>w.join(':')==='61381969:104:125:0:8:3:13:3:0'));
  assert.ok(rows.some(w=>w.join(':')==='61381969:106:127:0:8:3:502:3:0'));
  assert.ok(rows.some(w=>w[0]===61381969&&w[4]===8&&w.slice(6).join(':')===materialOnlyKey));
  assert.equal(rows.length,3);
  assert.deepEqual(errors,[]);console.log('CHROMIUM NESTED FURNITURE WAND PASS: material edit, new pair, material-only Add, recovery and reparse');
 }finally{await context.close()}
}
async function inventoryWandEditSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800}});
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-wand-edit.save',mimeType:'application/octet-stream',buffer:Buffer.from(createSyntheticSlot({wandEditInventory:true}))});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await page.locator('.inventory-controls input[type="search"]').fill('1429161083');
  const card=page.locator('.inventory-card').first(),dialog=page.locator('dialog[aria-labelledby="wand-editor-title"]');
  await card.locator('.inventory-stack-delete:not([disabled])').click();await confirmInventoryRemoval(page,false);
  assert.equal(await card.locator('input[name="quantity"]').inputValue(),'1');
  await card.locator('.inventory-stack-delete:not([disabled])').click();await confirmInventoryRemoval(page);
  await page.locator('.inventory-empty-stack').waitFor();
  assert.equal(await card.locator('input[name="quantity"]').inputValue(),'0');
  await page.locator('button[title="Undo"]:not([disabled])').click();
  await page.locator('.inventory-empty-stack').waitFor({state:'hidden'});
  assert.equal(await card.locator('input[name="quantity"]').inputValue(),'1');
  await card.locator('.inventory-unique-edit-button').click();await dialog.waitFor();
  const select=dialog.locator('select[name="wand-variant"]');
  assert.equal(await select.locator('option').count(),36);
  const value=await select.locator('option[data-wand-variant="106:127"]').getAttribute('value');assert.ok(value!==null);
  await select.selectOption(value);
  await dialog.locator('button[type="submit"]:not([disabled])').click();await dialog.waitFor({state:'hidden'});
  await page.locator('button[title="Undo"]:not([disabled])').click();await page.locator('button[title="Redo"]:not([disabled])').click();
  await card.locator('button[type="submit"]:not([disabled])').waitFor();
  await page.reload({waitUntil:'networkidle'});await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await page.locator('.inventory-controls input[type="search"]').fill('1429161083');
  await card.locator('.inventory-unique-edit-button').click();await dialog.waitFor();
  assert.equal(await select.locator('option[data-wand-variant="106:127"]').count(),0);
  const addValue=await select.locator('option[data-wand-variant="110:126"]').getAttribute('value');assert.ok(addValue!==null);
  await select.selectOption(addValue);
  await dialog.locator('input[name="variant-add-quantity"]').fill('3');
  await dialog.locator('.inventory-create-wand:not([disabled])').click();await dialog.waitFor({state:'hidden'});
  const rows=page.locator('.inventory-card input[name="quantity"]');
  await rows.nth(1).waitFor();assert.deepEqual(await rows.evaluateAll(els=>els.map(e=>e.value)),['1','3']);
  await page.locator('button[title="Undo"]:not([disabled])').click();await rows.nth(1).waitFor({state:'detached'});
  await page.locator('button[title="Redo"]:not([disabled])').click();await rows.nth(1).waitFor();
  await page.locator('.inventory-card button[type="submit"]:not([disabled])').nth(1).waitFor();
  await page.reload({waitUntil:'networkidle'});await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await page.locator('.inventory-controls input[type="search"]').fill('1429161083');
  await rows.nth(1).waitFor();assert.deepEqual(await rows.evaluateAll(els=>els.map(e=>e.value)),['1','3']);
  await page.locator('.file-menu > summary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),page.locator('.file-menu .menu-popover > button').nth(2).click()]);
  const output=readFileSync(await download.path());
  const {instance}=await WebAssembly.instantiate(readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm'),{}),e=instance.exports;
  const ptr=e.hkia_stage(output.length);assert.ok(ptr>0);new Uint8Array(e.memory.buffer,ptr,output.length).set(output);
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_wand_variants(8),0);
  const v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
  assert.equal(v.getUint32(0,true),34);
  const options=Array.from({length:34},(_,i)=>[v.getInt32(4+i*8,true),v.getInt32(8+i*8,true)]);
  assert.ok(options.some(([m,f])=>m===104&&f===125));assert.ok(!options.some(([m,f])=>m===106&&f===127));assert.ok(!options.some(([m,f])=>m===110&&f===126));
  assert.equal(e.hkia_inventory_snapshot(),0);
  const iv=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());assert.equal(iv.getUint32(0,true),3);
  assert.equal(iv.getInt32(4+2*16+4,true),1429161083);assert.equal(iv.getInt32(4+2*16+8,true),3);
  assert.deepEqual(errors,[]);console.log('CHROMIUM MAGIC WAND PASS: source material edit, independent addition, history, recovery and export');
 }finally{await context.close()}
}
async function inventoryBobaEditSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800}});
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-boba-variant.save',mimeType:'application/octet-stream',buffer:Buffer.from(createSyntheticSlot({bobaEditInventory:true}))});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await page.locator('.inventory-controls input[type="search"]').fill('1798633565');
  const card=page.locator('.inventory-card').first(),dialog=page.locator('dialog[aria-labelledby="boba-editor-title"]');
  await card.locator('.inventory-unique-edit-button').click();await dialog.waitFor();
  await dialog.locator('select[name="boba-variant"]').selectOption({label:'Without tapioca · Unsweetened'});
  await dialog.locator('button[type="submit"]:not([disabled])').click();await dialog.waitFor({state:'hidden'});
  await card.locator('.inventory-flower-variant-name').filter({hasText:'Without tapioca · Unsweetened'}).waitFor();
  await page.locator('button[title="Undo"]:not([disabled])').click();
  await card.locator('.inventory-flower-variant-name').filter({hasText:'With tapioca · Sweet'}).waitFor();
  await page.locator('button[title="Redo"]:not([disabled])').click();
  await card.locator('.inventory-flower-variant-name').filter({hasText:'Without tapioca · Unsweetened'}).waitFor();
  await card.locator('button[type="submit"]:not([disabled])').waitFor();
  await page.reload({waitUntil:'networkidle'});await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await page.locator('.inventory-controls input[type="search"]').fill('1798633565');
  await card.locator('.inventory-flower-variant-name').filter({hasText:'Without tapioca · Unsweetened'}).waitFor();
  await page.locator('.file-menu > summary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),page.locator('.file-menu .menu-popover > button').nth(2).click()]);
  const output=readFileSync(await download.path());
  const {instance}=await WebAssembly.instantiate(readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm'),{}),e=instance.exports;
  const ptr=e.hkia_stage(output.length);assert.ok(ptr>0);new Uint8Array(e.memory.buffer,ptr,output.length).set(output);
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_boba_snapshot(),0);
  const v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
  assert.equal(v.getUint32(0,true),1);
  assert.deepEqual(Array.from({length:5},(_,i)=>v.getInt32(12+i*4,true)),[6,44,79,75,71]);
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM BOBA VARIANT PASS: independent pearls and sweetness, draft, history and export');
 }finally{await context.close()}
}
async function inventoryFirstChefSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800},acceptDownloads:true});
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-first-chef.save',mimeType:'application/octet-stream',buffer:Buffer.from(createSyntheticSlot())});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await page.locator('.inventory-add-toggle').click();
  const search=page.locator('.inventory-controls input[type="search"]'),card=page.locator('.inventory-card');
  await search.fill('1798633565');await card.locator('.inventory-unique-edit-button').click();
  const boba=page.locator('dialog[aria-labelledby="boba-editor-title"]');await boba.waitFor();
  assert.equal(await boba.locator('button[type="submit"]').count(),0);
  const bs=boba.locator('select[name="boba-base"]'),vs=boba.locator('select[name="boba-variant"]');
  assert.equal(await bs.locator('option').count(),19);
  assert.equal(await vs.locator('option').count(),8);
  await bs.selectOption('46:39:78');await vs.selectOption({label:'With tapioca · Semi-sweet'});
  await boba.locator('input[name="variant-add-quantity"]').fill('2');
  await boba.locator('.inventory-create-boba:not([disabled])').click();await boba.waitFor({state:'hidden'});
  await card.locator('.inventory-add-source').waitFor();
  await search.fill('1338995084');await card.locator('.inventory-unique-edit-button').click();
  const cafe=page.locator('dialog[aria-labelledby="cafe-editor-title"]');await cafe.waitFor();
  assert.equal(await cafe.locator('button[type="submit"]').count(),0);
  assert.equal(await cafe.locator('.inventory-cafe-slot').count(),3);
  const select=cafe.locator('select[name="cafe-variant"]');
  const ingredient=await select.locator('option[data-ingredient-id]').first().getAttribute('value');assert.ok(ingredient!==null);
  await select.selectOption(ingredient);await cafe.locator('[data-cafe-slot="1"]').click();
  const next=await select.locator('option[data-ingredient-id]').last().getAttribute('value');assert.ok(next!==null);
  await select.selectOption(next);
  await cafe.locator('input[name="variant-add-quantity"]').fill('3');
  await cafe.locator('.inventory-create-cafe:not([disabled])').click();await cafe.waitFor({state:'hidden'});
  await card.locator('.inventory-add-source').waitFor();
  await page.locator('.inventory-add-toggle:not([disabled])').click();await search.fill('1338995084');
  const qty=card.locator('input[name="quantity"]');await qty.waitFor();assert.equal(await qty.inputValue(),'3');
  await page.locator('button[title="Undo"]:not([disabled])').click();await card.waitFor({state:'detached'});
  await page.locator('button[title="Redo"]:not([disabled])').click();await qty.waitFor();
  await page.reload({waitUntil:'networkidle'});await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await search.fill('1338995084');await qty.waitFor();assert.equal(await qty.inputValue(),'3');
  await search.fill('1798633565');await qty.waitFor();assert.equal(await qty.inputValue(),'2');
  await page.locator('.file-menu > summary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),page.locator('.file-menu .menu-popover > button').nth(2).click()]);
  const output=readFileSync(await download.path());
  const {instance}=await WebAssembly.instantiate(readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm'),{}),e=instance.exports;
  const ptr=e.hkia_stage(output.length);assert.ok(ptr>0);new Uint8Array(e.memory.buffer,ptr,output.length).set(output);
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_boba_snapshot(),0);
  let v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());assert.equal(v.getUint32(0,true),1);
  assert.deepEqual(Array.from({length:5},(_,i)=>v.getInt32(12+i*4,true)),[46,39,76,78,72]);
  assert.equal(e.hkia_inventory_cafe_snapshot(),0);v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());assert.equal(v.getUint32(0,true),1);
  assert.equal(e.hkia_inventory_absent_chef_defaults(),0);v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());assert.equal(v.getUint32(0,true),0);assert.equal(v.getUint32(4,true),8);
  assert.deepEqual(errors,[]);console.log('CHROMIUM FIRST CHEF PASS: unowned Boba and composed cafe selection, undo, recovery and reparse');
 }finally{await context.close()}
}
async function inventoryBobaFullCreationSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800}});
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-boba-create.save',mimeType:'application/octet-stream',buffer:Buffer.from(createSyntheticSlot({bobaCreateInventory:true}))});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');const search=page.locator('.inventory-controls input[type="search"]');await search.fill('1798633565');
  const rows=page.locator('.inventory-card input[name="quantity"]'),dialog=page.locator('dialog[aria-labelledby="boba-editor-title"]');
  await rows.first().waitFor();assert.equal(await rows.count(),1);
  await page.locator('.inventory-card .inventory-unique-edit-button').first().click();await dialog.waitFor();
  const baseSelect=dialog.locator('select[name="boba-base"]'),select=dialog.locator('select[name="boba-variant"]');
  assert.equal(await baseSelect.locator('option').count(),19);
  await baseSelect.selectOption('46:39:78');
  assert.equal(await select.locator('option:checked').textContent(),'With tapioca · Sweet');
  await select.selectOption({label:'Without tapioca · Unsweetened'});
  await dialog.locator('button[type="submit"]:not([disabled])').click();await dialog.waitFor({state:'hidden'});
  await page.locator('.inventory-card .inventory-unique-edit-button').first().click();await dialog.waitFor();
  await baseSelect.selectOption('9:55:78');
  assert.equal(await select.locator('option:checked').textContent(),'Without tapioca · Unsweetened');
  await select.selectOption({label:'With tapioca · Semi-sweet'});
  await dialog.locator('input[name="variant-add-quantity"]').fill('3');
  await dialog.locator('.inventory-create-boba:not([disabled])').click();await dialog.waitFor({state:'hidden'});
  await rows.nth(1).waitFor();assert.deepEqual(await rows.evaluateAll(els=>els.map(e=>e.value)),['1','3']);
  await page.locator('button[title="Undo"]:not([disabled])').click();await rows.nth(1).waitFor({state:'detached'});
  await page.locator('button[title="Redo"]:not([disabled])').click();await rows.nth(1).waitFor();
  await page.locator('.inventory-card button[type="submit"]:not([disabled])').nth(1).waitFor();
  await page.reload({waitUntil:'networkidle'});await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await search.fill('1798633565');await rows.nth(1).waitFor();
  assert.deepEqual(await rows.evaluateAll(els=>els.map(e=>e.value)),['1','3']);
  await page.locator('.file-menu > summary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),page.locator('.file-menu .menu-popover > button').nth(2).click()]);
  const output=readFileSync(await download.path());
  const {instance}=await WebAssembly.instantiate(readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm'),{}),e=instance.exports;
  const ptr=e.hkia_stage(output.length);assert.ok(ptr>0);new Uint8Array(e.memory.buffer,ptr,output.length).set(output);
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_boba_snapshot(),0);
  const v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
  assert.equal(v.getUint32(0,true),2);
  const words=at=>Array.from({length:5},(_,i)=>v.getInt32(at+i*4,true));
  assert.deepEqual(words(12),[46,39,79,78,71]);assert.deepEqual(words(40),[9,55,76,78,72]);
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM FULL BOBA PASS: base change, additional stack, native dynamic color, history, reload and export');
 }finally{await context.close()}
}
async function inventoryCafeEditSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800}});
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-cafe-variant.save',mimeType:'application/octet-stream',buffer:Buffer.from(createSyntheticSlot({cafeEditInventory:true}))});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await page.locator('.inventory-controls input[type="search"]').fill('203331651');
  const card=page.locator('.inventory-card').first(),dialog=page.locator('dialog[aria-labelledby="cafe-editor-title"]');
  await card.locator('.inventory-unique-edit-button').click();await dialog.waitFor();
  const select=dialog.locator('select[name="cafe-variant"]');
  const option=select.locator('option[data-ingredient-id="1622861092"]');
  const value=await option.getAttribute('value');assert.ok(value!==null);
  await select.selectOption(value);
  await dialog.locator('[data-cafe-slot="1"]').click();
  const second=await select.locator('option[data-ingredient-id]:not([data-ingredient-id="0"])').first().getAttribute('value');assert.ok(second!==null);
  await select.selectOption(second);
  await dialog.locator('[data-cafe-slot="0"]').click();assert.equal(await select.inputValue(),value);
  await dialog.locator('button[type="submit"]:not([disabled])').click();await dialog.waitFor({state:'hidden'});
  await page.locator('button[title="Undo"]:not([disabled])').click();
  await page.locator('button[title="Redo"]:not([disabled])').click();
  await card.locator('button[type="submit"]:not([disabled])').waitFor();
  await page.reload({waitUntil:'networkidle'});await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await page.locator('.inventory-controls input[type="search"]').fill('203331651');
  await card.locator('.inventory-unique-edit-button').waitFor();
  await page.locator('.file-menu > summary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),page.locator('.file-menu .menu-popover > button').nth(2).click()]);
  const output=readFileSync(await download.path());
  const {instance}=await WebAssembly.instantiate(readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm'),{}),e=instance.exports;
  const ptr=e.hkia_stage(output.length);assert.ok(ptr>0);new Uint8Array(e.memory.buffer,ptr,output.length).set(output);
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_cafe_snapshot(),0);
  const v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
  assert.equal(v.getUint32(0,true),1);const final=Array.from({length:6},(_,i)=>v.getInt32(12+i*4,true));
  assert.equal(final[0],48);assert.equal(final[3],9);assert.notDeepEqual([final[1],final[4]],[49,46]);assert.equal(final[2],48);assert.equal(final[5],9);
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM CAFE VARIANT PASS: native ingredient pair, history, recovery and export');
 }finally{await context.close()}
}
async function inventoryCafeCreationAndOptionalSideSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800}});
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-cafe-create.save',mimeType:'application/octet-stream',buffer:Buffer.from(createSyntheticSlot({cafeCreateInventory:true}))});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');const search=page.locator('.inventory-controls input[type="search"]');
  await search.fill('1338995084');
  const rows=page.locator('.inventory-card input[name="quantity"]'),dialog=page.locator('dialog[aria-labelledby="cafe-editor-title"]');
  await rows.first().waitFor();assert.equal(await rows.count(),1);
  await page.locator('.inventory-card .inventory-unique-edit-button').first().click();await dialog.waitFor();
  const select=dialog.locator('select[name="cafe-variant"]');
  await select.selectOption(await select.locator('option[data-ingredient-id="1240730051"]').getAttribute('value'));
  await dialog.locator('input[name="variant-add-quantity"]').fill('3');
  await dialog.locator('.inventory-create-cafe:not([disabled])').click();await dialog.waitFor({state:'hidden'});
  await rows.nth(1).waitFor();assert.deepEqual(await rows.evaluateAll(els=>els.map(e=>e.value)),['1','3']);
  await page.locator('button[title="Undo"]:not([disabled])').click();await rows.nth(1).waitFor({state:'detached'});
  await page.locator('button[title="Redo"]:not([disabled])').click();await rows.nth(1).waitFor();
  await search.fill('1932639321');await page.locator('.inventory-card .inventory-unique-edit-button').first().click();await dialog.waitFor();
  await dialog.locator('[data-cafe-slot="1"]').click();
  const none=select.locator('option[data-ingredient-id="0"]');
  await select.selectOption(await none.getAttribute('value'));
  await dialog.locator('button[type="submit"]:not([disabled])').click();await dialog.waitFor({state:'hidden'});
  await page.locator('.inventory-card button[type="submit"]:not([disabled])').first().waitFor();
  await page.reload({waitUntil:'networkidle'});await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await search.fill('1338995084');await rows.nth(1).waitFor();
  assert.deepEqual(await rows.evaluateAll(els=>els.map(e=>e.value)),['1','3']);
  await page.locator('.file-menu > summary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),page.locator('.file-menu .menu-popover > button').nth(2).click()]);
  const output=readFileSync(await download.path());
  const {instance}=await WebAssembly.instantiate(readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm'),{}),e=instance.exports;
  const ptr=e.hkia_stage(output.length);assert.ok(ptr>0);new Uint8Array(e.memory.buffer,ptr,output.length).set(output);
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_cafe_snapshot(),0);
  const v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
  assert.equal(v.getUint32(0,true),3);
  const words=at=>Array.from({length:6},(_,i)=>v.getInt32(at+i*4,true));
  assert.deepEqual(words(12),[44,49,48,6,46,9]);
  assert.deepEqual(words(44),[44,0,0,6,0,0]);
  assert.deepEqual(words(76),[62,49,48,6,46,9]);
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM CAFE ADD AND NIGIRI SIDE PASS: source preserved, staged stack, optional native list, reload, reparse');
 }finally{await context.close()}
}
async function inventoryChefArtSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800}});
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-chef.save',mimeType:'application/octet-stream',buffer:Buffer.from(createSyntheticSlot({chefInventory:true}))});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  for(const id of ['203331651','1798633565']){
   await page.locator('.inventory-controls input[type="search"]').fill(id);
   const sprites=page.locator('.inventory-card .item-sprite[data-dynamic-art-source="native-chef"]');
   await sprites.nth(1).waitFor({timeout:30_000});
   assert.equal(await sprites.count(),2);
   const images=await sprites.evaluateAll(async els=>Promise.all(els.map(async el=>{
    const url=getComputedStyle(el).backgroundImage.slice(5,-2);
    if(!url.startsWith('blob:'))throw Error('expected local chef artwork');
    const im=await createImageBitmap(await (await fetch(url)).blob());
    const c=document.createElement('canvas');c.width=im.width;c.height=im.height;
    const ctx=c.getContext('2d');ctx.drawImage(im,0,0);im.close();
    return Array.from(ctx.getImageData(0,0,c.width,c.height).data);
   })));
   assert.notDeepEqual(images[0],images[1]);
  }
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
}
async function inventoryChefQuantitySmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800},acceptDownloads:true});
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-chef-quantity.save',mimeType:'application/octet-stream',buffer:Buffer.from(createSyntheticSlot({chefQuantityInventory:true}))});
  const openInventory=async()=>{
   await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
   await chooseTab(page,'inventory');
  };
  const inputFor=async id=>{
   await page.locator('.inventory-controls input[type="search"]').fill(String(id));
   const inputs=page.locator('.inventory-card input[name="quantity"]');await inputs.nth(1).waitFor();return inputs;
  };
  const apply=(index=0)=>page.locator('.inventory-card button[type="submit"]').nth(index).click();
  const settled=()=>page.locator('.inventory-card button[type="submit"]:not([disabled])').nth(1).waitFor();
  await openInventory();
  let inputs=await inputFor(203331651);
  assert.deepEqual(await inputs.evaluateAll(rows=>rows.map(r=>r.min)),['0','0']);
  await inputs.nth(1).fill('7');await apply(1);await settled();
  inputs=await inputFor(1798633565);
  assert.deepEqual(await inputs.evaluateAll(rows=>rows.map(r=>r.min)),['0','0']);
  await inputs.nth(1).fill('8');await apply(1);await settled();
  inputs=await inputFor(203331651);await inputs.first().fill('0');
  await apply();await confirmInventoryRemoval(page);
  await settled();
  inputs=await inputFor(1798633565);
  await inputs.first().fill('0');await apply();await confirmInventoryRemoval(page);
  await settled();
  await page.reload({waitUntil:'networkidle'});await openInventory();
  assert.deepEqual(await (await inputFor(203331651)).evaluateAll(rows=>rows.map(r=>r.value)),['0','7']);
  assert.deepEqual(await (await inputFor(1798633565)).evaluateAll(rows=>rows.map(r=>r.value)),['0','8']);
  await page.locator('button[title="Undo"]:not([disabled])').click();
  await page.locator('button[title="Redo"]:not([disabled])').waitFor();
  assert.deepEqual(await (await inputFor(1798633565)).evaluateAll(rows=>rows.map(r=>r.value)),['1','8']);
  await page.locator('button[title="Redo"]:not([disabled])').click();
  await page.locator('button[title="Redo"]:disabled').waitFor();
  await page.locator('button[title="Undo"]:not([disabled])').waitFor();
  assert.deepEqual(await (await inputFor(1798633565)).evaluateAll(rows=>rows.map(r=>r.value)),['0','8']);
  await page.locator('.file-menu > summary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),page.locator('.file-menu .menu-popover > button').nth(2).click()]);
  const output=readFileSync(await download.path());
  const {instance}=await WebAssembly.instantiate(readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm'),{}),e=instance.exports;
  const ptr=e.hkia_stage(output.length);assert.ok(ptr>0);new Uint8Array(e.memory.buffer,ptr,output.length).set(output);
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_unique_snapshot(),0);
  const v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());let at=0;
  const u=()=>{const n=v.getUint32(at,true);at+=4;return n};const count=u(),rows=[];
  for(let i=0;i<count;i++){const id=u(),present=u(),uid=u(),tag=u()|0,fields=u(),n=u();const words=Array.from({length:n},()=>u()|0);u();if(tag===3||tag===4)rows.push({id,uid,tag,words});}
  assert.equal(rows.length,4);assert.deepEqual(rows.map(r=>r.uid),[8,9,10,11]);
  assert.deepEqual(rows.map(r=>r.tag),[3,4,3,4]);
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM CHEF ZERO PASS: confirmed zero, draft, history and native export reparse');
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
async function confirmInventoryRemoval(page,accept=true){
 const modal=page.locator('.removal-confirm-dialog');
 await modal.waitFor({state:'visible'});
 await modal.locator(accept?'.removal-confirm-action':'.removal-cancel').click();
 await modal.waitFor({state:'hidden'});
}
async function inventoryBatchQuantitySmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800},acceptDownloads:true});
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({
   name:'synthetic-inventory-batch.save',mimeType:'application/octet-stream',
   buffer:Buffer.from(createSyntheticSlot({batchInventory:true}))
  });
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  const search=page.locator('.inventory-controls input[type="search"]');
  await search.fill('315822');
  await page.locator('.inventory-card').first().waitFor();
  await page.locator('.inventory-batch-toggle').click();
  await page.locator('.inventory-select-visible').click();
  assert.equal(await page.locator('.inventory-batch-checkbox:checked').count(),1);
  // Both IDs are ordinary clothing records in the source category index.
  await search.fill('517031');
  await page.locator('.inventory-select-visible').click();
  assert.equal(await page.locator('.inventory-batch-checkbox:checked').count(),1);
  assert.match(await page.locator('.inventory-batch-form .inventory-total').innerText(),/^2\s*\//);
  await page.locator('.inventory-batch-form input[type="number"]').fill('20');
  await page.locator('.inventory-batch-form button[type="submit"]').click();
  await page.locator('.state-dot.changed').waitFor();
  await page.locator('.inventory-batch-form button[type="submit"]:disabled').waitFor();
  await page.locator('.inventory-select-visible:not([disabled])').waitFor();
  assert.match(await page.locator('.inventory-batch-form .inventory-total').innerText(),/^0\s*\//);
  assert.equal(await page.locator('.inventory-batch-checkbox:checked').count(),0);
  await page.locator('.inventory-batch-toggle').click();
  await page.locator('.inventory-batch-form').waitFor({state:'hidden'});
  await page.locator('.inventory-card button[type="submit"]:not([disabled])').first().waitFor();
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  const check=async(id,count)=>{
   await page.locator('.inventory-controls input[type="search"]').fill(String(id));
   const q=page.locator('.inventory-card input[name="quantity"]').first();
   await q.waitFor();assert.equal(await q.inputValue(),String(count));
  };
  await check(315822,20);await check(517031,20);
  // A pending batch must not be silently carried into a different history revision.
  await page.locator('.inventory-batch-toggle').click();
  await page.locator('.inventory-select-visible').click();
  await page.locator('.inventory-batch-form input[type="number"]').fill('21');
  assert.match(await page.locator('.inventory-batch-form .inventory-total').innerText(),/^1\s*\//);
  await page.locator('button[title="Undo"]').click();
  await page.locator('button[title="Undo"]:disabled').waitFor();
  await page.locator('button[title="Redo"]:not([disabled])').waitFor();
  assert.match(await page.locator('.inventory-batch-form .inventory-total').innerText(),/^0\s*\//);
  assert.equal(await page.locator('.inventory-batch-form input[type="number"]').inputValue(),'');
  assert.equal(await page.locator('.inventory-batch-checkbox:checked').count(),0);
  await check(315822,6);await check(517031,9);
  await page.locator('.inventory-select-visible').click();
  await page.locator('.inventory-batch-form input[type="number"]').fill('22');
  await page.locator('button[title="Redo"]').click();
  await page.locator('button[title="Redo"]:disabled').waitFor();
  // A disabled button also means the Worker request is in flight. Require the
  // opposite history control to be enabled after the native snapshot and draft write.
  await page.locator('button[title="Undo"]:not([disabled])').waitFor();
  assert.match(await page.locator('.inventory-batch-form .inventory-total').innerText(),/^0\s*\//);
  assert.equal(await page.locator('.inventory-batch-form input[type="number"]').inputValue(),'');
  assert.equal(await page.locator('.inventory-batch-checkbox:checked').count(),0);
  await page.locator('.inventory-batch-toggle').click();
  await check(315822,20);await check(517031,20);
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
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_snapshot(),0);
  const iv=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
  assert.equal(iv.getUint32(0,true),2);
  const rows=[];
  for(let i=0;i<2;i++){const p=4+i*16;rows.push([iv.getUint32(p,true),iv.getInt32(p+4,true),iv.getInt32(p+8,true)])}
  assert.deepEqual(rows,[[4,315822,20],[8,517031,20]]);
  assert.deepEqual(errors,[]);
  // Add candidates far exceed the incremental 40-card display limit.
  await page.locator('.inventory-add-toggle').click();
  await page.locator('[data-inventory-group="furniture"]').click();
  await page.locator('.inventory-batch-toggle').click();
  const selectedTotal=page.locator('.inventory-batch-form .inventory-total');
  const limit=Number((await selectedTotal.innerText()).split('/')[1].replace(/[,\s]/g,''));
  assert.ok(limit>=40);
  await page.locator('.inventory-select-visible').click();
  assert.equal(Number((await selectedTotal.innerText()).split('/')[0].replace(/[,\s]/g,'')),limit);
  await page.locator('.inventory-deselect-visible').click();
  assert.equal(Number((await selectedTotal.innerText()).split('/')[0].replace(/[,\s]/g,'')),0);
  await page.locator('.inventory-select-visible').click();
  assert.equal(Number((await selectedTotal.innerText()).split('/')[0].replace(/[,\s]/g,'')),limit);
  await page.locator('.inventory-batch-toggle').click();
  assert.equal(await page.locator('.inventory-batch-form').count(),0);
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM INVENTORY BATCH PASS: explicit selection, atomic CAS, reload, grouped undo/redo and WASM reparse');
 }finally{await context.close()}
}
async function inventoryQuantityBoundsSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800}});
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({
   name:'synthetic-quantity-bounds.save',mimeType:'application/octet-stream',
   buffer:Buffer.from(createSyntheticSlot({quantityBounds:true}))
  });
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  const search=page.locator('.inventory-controls input[type="search"]');
  await page.locator('[data-inventory-group="items"]').click();
  await search.fill('413462588');
  const input=page.locator('.inventory-card input[name="quantity"]');
  await input.waitFor({timeout:30_000});
  assert.equal(await input.getAttribute('max'),'3');
  await input.fill('4');
  assert.equal(await input.evaluate(el=>el.validity.rangeOverflow),true);
  await input.fill('3');
  await page.locator('.inventory-card button[type="submit"]').click();
  await page.locator('.state-dot.changed').waitFor();
  await page.locator('.inventory-card button[type="submit"]:not([disabled])').waitFor();
  assert.equal(await input.inputValue(),'3');
  await page.locator('.inventory-batch-toggle').click();
  await page.locator('.inventory-batch-checkbox').check();
  await page.locator('[data-inventory-group="clothes"]').click();
  await search.fill('315822');
  await page.locator('.inventory-batch-checkbox').check();
  const batch=page.locator('.inventory-batch-form input[type="number"]');
  assert.equal(await batch.getAttribute('max'),'3');
  await batch.fill('4');
  assert.equal(await batch.evaluate(el=>el.validity.rangeOverflow),true);
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM INVENTORY BOUNDS PASS: native single and mixed batch maximum');
 }finally{await context.close()}
}
async function inventoryEmptyMaterialSmoke(currency=false){
 const first=currency?348154640:1877756618,second=currency?1774854033:627013240;
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800},acceptDownloads:true});
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({
   name:currency?'synthetic-empty-currency.save':'synthetic-empty-material.save',mimeType:'application/octet-stream',
   buffer:Buffer.from(createSyntheticSlot({emptyMaterialInventory:currency?'currency':true}))
  });
  const openItems=async()=>{
   await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
   await chooseTab(page,'inventory');
   await page.locator('[data-inventory-group="items"]').click();
  };
  const inputFor=async id=>{
   await page.locator('.inventory-controls input[type="search"]').fill(String(id));
   const input=page.locator('.inventory-card input[name="quantity"]');
   await input.waitFor({timeout:30_000});
   return input;
  };
  const apply=()=>page.locator('.inventory-card button[type="submit"]').click();
  await openItems();
  let input=await inputFor(first);
  assert.equal(await input.getAttribute('min'),'0');
  const deleteButton=page.locator('.inventory-stack-delete');
  const removal=page.locator('.removal-confirm-dialog');
  const initial=await input.inputValue();
  await deleteButton.click();await removal.waitFor({state:'visible'});
  await removal.locator('.removal-cancel').click();await removal.waitFor({state:'hidden'});
  assert.equal(await input.inputValue(),initial);
  assert.equal(await page.locator('.state-dot.changed').count(),0);
  await deleteButton.click();await removal.waitFor({state:'visible'});
  await removal.locator('.removal-confirm-action').click();
  await page.locator('.state-dot.changed').waitFor();
  await page.locator('.inventory-card button[type="submit"]:not([disabled])').waitFor();
  input=await inputFor(second);
  assert.equal(await input.inputValue(),'0');
  await input.fill('5');
  await apply();
  await page.locator('.inventory-card button[type="submit"]:not([disabled])').waitFor();
  await page.reload({waitUntil:'networkidle'});
  await openItems();
  assert.equal(await (await inputFor(first)).inputValue(),'0');
  assert.equal(await (await inputFor(second)).inputValue(),'5');
  await page.locator('button[title="Undo"]').click();
  await page.locator('button[title="Redo"]:not([disabled])').waitFor();
  assert.equal(await (await inputFor(second)).inputValue(),'0');
  await page.locator('button[title="Redo"]').click();
  await page.locator('button[title="Redo"]:disabled').waitFor();
  await page.locator('button[title="Undo"]:not([disabled])').waitFor();
  assert.equal(await (await inputFor(second)).inputValue(),'5');
  input=await inputFor(first);await input.fill('6');await apply();
  await page.locator('.inventory-card button[type="submit"]:not([disabled])').waitFor();
  await page.locator('.inventory-batch-toggle').click();
  const firstName=await page.locator('.inventory-card .inventory-name').innerText();
  await page.locator('.inventory-batch-checkbox').check();
  await inputFor(second);const secondName=await page.locator('.inventory-card .inventory-name').innerText();
  await page.locator('.inventory-batch-checkbox').check();
  const batchDelete=page.locator('.inventory-batch-delete');
  await batchDelete.click();await removal.waitFor({state:'visible'});
  assert.equal(await removal.locator('.removal-confirm-name').innerText(),'2');
  const listed=await removal.locator('.inventory-removal-targets li').allTextContents();
  assert.equal(listed.length,2);
  assert.ok(listed.some(text=>text.includes(firstName)&&text.includes('× 6')));
  assert.ok(listed.some(text=>text.includes(secondName)&&text.includes('× 5')));
  await removal.locator('.removal-cancel').click();await removal.waitFor({state:'hidden'});
  assert.equal(await (await inputFor(first)).inputValue(),'6');
  assert.equal(await (await inputFor(second)).inputValue(),'5');
  await page.locator('.inventory-batch-form input[type="number"]').fill('0');
  await page.locator('.inventory-batch-form button[type="submit"]').click();
  await confirmInventoryRemoval(page);
  await page.waitForFunction(()=>document.querySelector('.inventory-batch-form .inventory-total')?.textContent?.trim().startsWith('0 /'));
  assert.equal(await (await inputFor(first)).inputValue(),'0');
  assert.equal(await (await inputFor(second)).inputValue(),'0');
  await page.locator('.inventory-batch-toggle').click();
  await page.locator('button[title="Undo"]').click();
  await page.locator('button[title="Redo"]:not([disabled])').waitFor();
  assert.equal(await (await inputFor(first)).inputValue(),'6');
  assert.equal(await (await inputFor(second)).inputValue(),'5');
  await page.locator('button[title="Undo"]').click();
  await page.locator('.inventory-card button[type="submit"]:not([disabled])').waitFor();
  assert.equal(await (await inputFor(first)).inputValue(),'0');
  assert.equal(await (await inputFor(second)).inputValue(),'5');
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
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_snapshot(),0);
  const iv=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
  assert.equal(iv.getUint32(0,true),3);
  const rows=[];
  for(let i=0;i<3;i++){const p=4+i*16;rows.push([iv.getUint32(p,true),iv.getInt32(p+4,true),iv.getInt32(p+8,true)])}
  assert.deepEqual(rows,[[4,315822,6],[9,first,0],[10,second,5]]);
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM INVENTORY '+(currency?'CURRENCY':'MATERIAL')+' EMPTY PASS: confirmation, empty/refill, reload, undo/redo and preserved native records');
 }finally{await context.close()}
}
async function ordinaryClothingRemovalSmoke(){
 for(const state of [true,'equipped','preset','flower','flower-equipped']){
  const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800}});
  try{
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+base,{waitUntil:'networkidle'});
   await page.locator('input[type="file"]').setInputFiles({name:'synthetic-ordinary-clothing.save',mimeType:'application/octet-stream',
    buffer:Buffer.from(createSyntheticSlot({ordinaryClothingInventory:state}))});
   await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
   await chooseTab(page,'inventory');
   const flower=['flower','flower-equipped'].includes(state),allowed=state===true||state==='flower';
   await page.locator('.inventory-controls input[type="search"]').fill(flower?'897617923':'315822');
   const card=page.locator('.inventory-card'),input=card.locator('input[name="quantity"]'),remove=card.locator('.inventory-stack-delete');
   await input.waitFor();assert.equal(await input.getAttribute('min'),allowed?'0':'1');
   assert.equal(await remove.isEnabled(),allowed);
   if(allowed){
    await remove.click();const modal=page.locator('.removal-confirm-dialog');await modal.waitFor({state:'visible'});
    await modal.locator('.removal-confirm-action').click();await page.locator('.inventory-empty-stack').waitFor();
    assert.equal(await input.inputValue(),'0');await page.locator('button[title="Undo"]:not([disabled])').click();
    await page.locator('.inventory-empty-stack').waitFor({state:'hidden'});assert.equal(await input.inputValue(),'6');
   }
   assert.deepEqual(errors,[]);
  }finally{await context.close()}
 }
 console.log('CHROMIUM CLOTHING REMOVAL PASS: ordinary and flower-crafted, clear avatar, equipped piece and unresolved preset');
}
async function ordinaryFurnitureRemovalSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800}});
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-ordinary-furniture.save',mimeType:'application/octet-stream',
   buffer:Buffer.from(createSyntheticSlot({ordinaryFurnitureInventory:true}))});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  const search=page.locator('.inventory-controls input[type="search"]');
  const input=page.locator('.inventory-card input[name="quantity"]');
  const remove=page.locator('.inventory-card .inventory-stack-delete');
  await search.fill('3202680');await input.waitFor();
  assert.equal(await input.getAttribute('min'),'1');assert.equal(await remove.isDisabled(),true);
  await search.fill('427689');await input.waitFor();
  assert.equal(await input.getAttribute('min'),'0');assert.equal(await remove.isEnabled(),true);
  await remove.click();
  const modal=page.locator('.removal-confirm-dialog');
  await modal.waitFor({state:'visible'});await modal.locator('.removal-confirm-action').click();
  await page.locator('.inventory-empty-stack').waitFor();
  assert.equal(await input.inputValue(),'0');
  await page.locator('button[title="Undo"]:not([disabled])').click();
  await page.locator('.inventory-empty-stack').waitFor({state:'hidden'});
  assert.equal(await input.inputValue(),'5');
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM ORDINARY FURNITURE REMOVAL PASS: unreferenced stack zero/undo; placed stack protected');
 }finally{await context.close()}
}
async function inventoryEmptyBrowseSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800}});
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({
   name:'synthetic-empty-browse.save',mimeType:'application/octet-stream',
   buffer:Buffer.from(createSyntheticSlot({emptyMaterialInventory:true}))
  });
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  await page.locator('[data-inventory-group="items"]').click();
  const cards=page.locator('.inventory-card'),search=page.locator('.inventory-controls input[type="search"]');
  await cards.first().waitFor();
  assert.equal(await cards.count(),1);
  await search.fill('627013240');
  await page.locator('.inventory-empty-stack').waitFor();
  assert.equal(await cards.locator('input[name="quantity"]').inputValue(),'0');
  await search.clear();
  await page.locator('.inventory-empty-stack').waitFor({state:'hidden'});
  await page.locator('.inventory-add-toggle').click();
  await search.fill('627013240');
  const input=cards.locator('input[name="quantity"]');
  await input.waitFor();
  assert.equal(await input.inputValue(),'1');
  assert.equal(await input.getAttribute('min'),'1');
  await input.fill('0');
  assert.equal(await input.evaluate(el=>el.validity.rangeUnderflow),true);
  await page.locator('.inventory-batch-toggle').click();
  await cards.locator('.inventory-batch-checkbox').check();
  const batchInput=page.locator('.inventory-batch-form input[type="number"]');
  assert.equal(await batchInput.getAttribute('min'),'1');
  await batchInput.fill('0');
  assert.equal(await batchInput.evaluate(el=>el.validity.rangeUnderflow),true);
  await page.locator('.inventory-batch-toggle').click();
  await input.fill('7');
  await cards.locator('button[type="submit"]').click();
  await cards.waitFor({state:'hidden'});
  await page.locator('.inventory-add-toggle:not([disabled])').click();
  await search.fill('627013240');
  await input.waitFor();
  assert.equal(await input.inputValue(),'7');
  await page.locator('button[title="Undo"]').click();
  await page.locator('.inventory-empty-stack').waitFor();
  assert.equal(await input.inputValue(),'0');
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM INVENTORY EMPTY BROWSE PASS: hide unowned, search, refill, undo');
 }finally{await context.close()}
}
async function inventoryCreateMaterialSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800},acceptDownloads:true});
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({
   name:'synthetic-create-material.save',mimeType:'application/octet-stream',
   buffer:Buffer.from(createSyntheticSlot())
  });
  const openInventory=async()=>{
   await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
   await chooseTab(page,'inventory');
  };
  const search=page.locator('.inventory-controls input[type="search"]');
  const chooseItems=()=>page.locator('[data-inventory-group="items"]').click();
  const inputFor=async id=>{
   await search.fill(String(id));
   const input=page.locator('.inventory-card input[name="quantity"]');
   await input.waitFor({timeout:30_000});return input;
  };
  await openInventory();
  await page.locator('.inventory-add-toggle').click();
  await chooseItems();
  const apple=await inputFor(1877756618);
  assert.equal(await apple.inputValue(),'1');
  await apple.fill('6');
  await page.locator('.inventory-card button[type="submit"]').click();
  await page.locator('.state-dot.changed').waitFor();
  await page.locator('.inventory-card').waitFor({state:'hidden'});
  // Select two absent materials in the same transaction.
  await page.locator('.inventory-batch-toggle').click();
  await search.fill('627013240');await page.locator('.inventory-batch-checkbox').check();
  await search.fill('1400142412');await page.locator('.inventory-batch-checkbox').check();
  await page.locator('.inventory-batch-form input[type="number"]').fill('9');
  await page.locator('.inventory-batch-form button[type="submit"]').click();
  await page.locator('.inventory-card').waitFor({state:'hidden'});
  assert.match(await page.locator('.inventory-batch-form .inventory-total').innerText(),/^0\s*\//);
  await page.locator('.inventory-batch-toggle').click();
  await page.locator('.inventory-batch-form').waitFor({state:'hidden'});
  await page.locator('.inventory-add-toggle:not([disabled])').waitFor();
  await page.reload({waitUntil:'networkidle'});
  await openInventory();await chooseItems();
  assert.equal(await (await inputFor(1877756618)).inputValue(),'6');
  assert.equal(await (await inputFor(627013240)).inputValue(),'9');
  assert.equal(await (await inputFor(1400142412)).inputValue(),'9');
  await page.locator('button[title="Undo"]').click();
  await page.locator('button[title="Redo"]:not([disabled])').waitFor();
  await search.fill('627013240');await page.locator('.inventory-card').waitFor({state:'hidden'});
  await page.locator('button[title="Redo"]').click();
  await page.locator('button[title="Undo"]:not([disabled])').waitFor();
  assert.equal(await (await inputFor(627013240)).inputValue(),'9');
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
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_snapshot(),0);
  const iv=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
  assert.equal(iv.getUint32(0,true),4);
  const rows=[];
  for(let i=0;i<4;i++){const p=4+i*16;rows.push([iv.getUint32(p,true),iv.getInt32(p+4,true),iv.getInt32(p+8,true)])}
  assert.deepEqual(rows,[[4,315822,6],[5,627013240,9],[6,1400142412,9],[7,1877756618,6]]);
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM INVENTORY CREATE PASS: individual/batch add, local recovery, undo/redo, native ID allocation and export reparse');
 }finally{await context.close()}
}
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
  const sprites=page.locator('.inventory-card .item-sprite[data-dynamic-art-source="native-flower"][data-icon-fidelity="source-derived-runtime"]');
  await sprites.nth(3).waitFor({timeout:30_000});
  assert.equal(await sprites.count(),4);
  await page.locator('.inventory-card .item-sprite[data-dynamic-art-source="native-flower"][data-icon-fidelity="source-derived-base-only"]').waitFor({timeout:30_000});
  await page.locator('.inventory-card [data-native-decorator="11"] img[src$="pattern-3.webp"]').waitFor({timeout:30_000});
  const effectCard=page.locator('.inventory-card').filter({has:page.locator('[data-native-decorator="11"] img[src$="pattern-3.webp"]')});
  assert.deepEqual(await effectCard.locator('[data-native-decorator]').evaluateAll(els=>els.map(e=>e.getAttribute('data-native-decorator'))),['12','11']);
  await page.locator('.inventory-card [data-native-decorator="12"] img[src$="decorator-12.webp"]').first().waitFor({timeout:30_000});
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
  await page.locator('.inventory-flower-variant-name').filter({hasText:'Ombre'}).waitFor({timeout:30_000});
  const search=page.locator('.inventory-controls input[type="search"]');
  await search.fill('43114910 Blue');
  await page.waitForFunction(()=>document.querySelectorAll('.inventory-card').length===1&&document.querySelector('.inventory-flower-variant-name')?.textContent?.includes('Blue'));
  await search.fill('Red Ombre');
  await page.waitForFunction(()=>document.querySelectorAll('.inventory-card').length===1&&document.querySelector('.inventory-flower-variant-name')?.textContent?.includes('Ombre'));
  await search.fill('43114910 Blue Cosmic');
  await page.locator('.inventory-card').first().waitFor({state:'detached'});
  await search.fill('43114910');
  await page.waitForFunction(()=>document.querySelectorAll('.inventory-card').length===5);
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM DYNAMIC FLOWER PASS: original source sampling, distinct same-ID appearances, native effect-mask fallback, unknown pattern refusal, local blob generation');
 }finally{await context.close();}
}
async function inventoryFlowerGrowthDisplaySmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800}});
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-flower-growth.save',mimeType:'application/octet-stream',buffer:Buffer.from(createSyntheticSlot({flowerGrowthInventory:true}))});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  const search=page.locator('.inventory-controls input[type="search"]');
  await search.fill('43114910');
  const cards=page.locator('.inventory-card');
  await cards.nth(2).waitFor();
  assert.equal(await cards.count(),3);
  const growthCells=[];
  for(const [kind,label] of [['seed','Seed'],['plucked','Flower'],['uprooted','Uprooted plant']]){
   const card=cards.filter({has:page.locator('[data-flower-growth="'+kind+'"]')});
   await card.locator('.inventory-flower-variant-name').filter({hasText:label+' · Red'}).waitFor({timeout:30_000});
   const badge=card.locator('[data-native-decorator="12"]');
   await badge.waitFor({timeout:30_000});
   assert.equal(await badge.evaluate(e=>getComputedStyle(e).getPropertyValue('--primary').trim()),'rgba(193,41,61,1)');
   assert.equal(await card.locator('[data-native-decorator="11"]').count(),0);
   if(kind!=='plucked'){
    const sprite=card.locator('[data-flower-state-art="native-state-sprite"]');
    await sprite.waitFor({timeout:30_000});
    assert.equal(await sprite.count(),1);
    assert.equal(await card.locator('[data-flower-state-art="species-reference"]').count(),0);
    const art=await sprite.evaluate(async el=>{
     const css=getComputedStyle(el),url=css.backgroundImage.match(/^url\("?(blob:[^")]+)"?\)$/)?.[1];
     if(!url)throw Error('Expected verified shared blob');
     const bitmap=await createImageBitmap(await (await fetch(url)).blob());
     try{
      const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;
      const ctx=canvas.getContext('2d'),x=0-parseFloat(css.backgroundPositionX),y=0-parseFloat(css.backgroundPositionY);
      ctx.drawImage(bitmap,x,y,96,96,0,0,96,96);
      const pixels=ctx.getImageData(0,0,96,96).data;
      return {url,x,y,width:bitmap.width,height:bitmap.height,visible:pixels.filter((v,i)=>i%4===3&&v>0).length};
     }finally{bitmap.close();}
    });
    assert.equal(art.width,960);assert.equal(art.height,480);assert.ok(art.visible>0);
    assert.equal(art.x,kind==='seed'?0:96);assert.equal(art.y,0);
    growthCells.push(art);
   }else assert.equal(await card.locator('[data-flower-state-art="native-state-sprite"]').count(),0);
  }
  assert.equal(growthCells.length,2);assert.equal(growthCells[0].url,growthCells[1].url);
  await search.fill('43114910 Seed Red');
  await page.waitForFunction(()=>document.querySelectorAll('.inventory-card').length===1&&document.querySelector('[data-flower-growth="seed"]'));
  await search.fill('43114910 Uprooted plant Red');
  await page.waitForFunction(()=>document.querySelectorAll('.inventory-card').length===1&&document.querySelector('[data-flower-growth="uprooted"]'));
  for(const [query,kind] of [['43114910 Seed Red','seed'],['43114910 Uprooted plant Red','uprooted']]){
   await search.fill(query);
   await page.waitForFunction(k=>document.querySelectorAll('.inventory-card').length===1&&document.querySelector('[data-flower-growth="'+k+'"]'),kind);
   const card=cards.first(),quantity=card.locator('input[name="quantity"]'),apply=card.locator('.inventory-quantity-form button[type="submit"]');
   assert.equal(await quantity.getAttribute('min'),'0');
   await quantity.fill('0');await apply.click();await confirmInventoryRemoval(page);
   await apply.waitFor({state:'visible'});
   await card.locator('.inventory-quantity-form button[type="submit"]:not([disabled])').waitFor();
   assert.equal(await quantity.inputValue(),'0');
   await page.locator('button[title="Undo"]:not([disabled])').click();
   await page.locator('button[title="Redo"]:not([disabled])').waitFor();
   await page.waitForFunction(()=>document.querySelector('.inventory-card input[name="quantity"]')?.value==='1');
   await page.locator('button[title="Redo"]:not([disabled])').click();
   await page.locator('button[title="Undo"]:not([disabled])').waitFor();
   await page.waitForFunction(()=>document.querySelector('.inventory-card input[name="quantity"]')?.value==='0');
  }
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM FLOWER GROWTH PASS: native seed/troweled art, localized search, zero and Undo/Redo');
 }finally{await context.close();}
}
async function inventoryFlowerVariantEditSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800},acceptDownloads:true});
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({
   name:'synthetic-flower-edit.save',mimeType:'application/octet-stream',
   buffer:Buffer.from(createSyntheticSlot({editableFlower:true}))
  });
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  await page.locator('.inventory-controls input[type="search"]').fill('43114910');
  const button=page.locator('.inventory-card .inventory-unique-edit-button');
  await button.waitFor({timeout:30_000});
  await button.click();
  const dialog=page.locator('dialog[aria-labelledby="flower-editor-title"]');
  await dialog.waitFor();
  const select=dialog.locator('select');
  const firstPattern=select.locator('optgroup').nth(1).locator('option').first();
  const value=await firstPattern.getAttribute('value');
  assert.ok(value!==null);
  await select.selectOption(value);
  await dialog.locator('.inventory-flower-reset:not([disabled])').waitFor();
  const second=await select.locator('optgroup').first().locator('option').first().getAttribute('value');assert.ok(second!==null);
  await select.selectOption(second);
  await dialog.locator('button[type="submit"]:not([disabled])').click();
  await dialog.waitFor({state:'hidden'});
  await page.locator('.state-dot.changed').waitFor();
  await page.waitForFunction(()=>!document.querySelector('.inventory-unique-edit-button')?.disabled);
  const patch=await page.evaluate(()=>new Promise((resolve,reject)=>{
   const open=indexedDB.open('hkia-editor-local-session',1);
   open.onerror=()=>reject(open.error);
   open.onsuccess=()=>{
    const db=open.result;
    const request=db.transaction('unsaved-changes','readonly').objectStore('unsaved-changes').get('current');
    request.onsuccess=()=>{db.close();resolve(request.result?.inventoryPatches??[])};
    request.onerror=()=>{db.close();reject(request.error)};
   };
  }));
  assert.equal(patch.length,1);
  assert.equal(patch[0].kind,'flower-variant');
  assert.equal(patch[0].documentId,8);
  assert.deepEqual(patch[0].before,[6,1,0,0]);
  assert.equal(patch[0].after[0],6);
  assert.notEqual(patch[0].after[1],1);
  assert.ok(patch[0].after[2]>0);
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  await page.locator('.inventory-controls input[type="search"]').fill('43114910');
  await page.locator('.inventory-card img[src$="pattern-'+patch[0].after[2]+'.webp"]').waitFor();
  const quantity=page.locator('.inventory-card input[name="quantity"]');
  await quantity.waitFor();assert.equal(await quantity.getAttribute('min'),'0');
  await quantity.fill('0');await page.locator('.inventory-card .inventory-quantity-form button[type="submit"]').click();await confirmInventoryRemoval(page);
  await page.locator('button[title="Undo"]:not([disabled])').waitFor();
  await page.locator('.inventory-card .inventory-quantity-form button[type="submit"]:not([disabled])').waitFor();
  assert.equal(await quantity.inputValue(),'0');
  await quantity.fill('25');await page.locator('.inventory-card .inventory-quantity-form button[type="submit"]').click();
  await page.locator('.inventory-card .inventory-quantity-form button[type="submit"]:not([disabled])').waitFor();
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  await page.locator('.inventory-controls input[type="search"]').fill('43114910');
  await quantity.waitFor();assert.equal(await quantity.inputValue(),'25');
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
  assert.equal(e.hkia_inventory_flowers_snapshot(),0);
  const v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
  assert.equal(v.getUint32(0,true),1);
  assert.equal(v.getUint32(4,true),8);
  assert.deepEqual(Array.from({length:4},(_,i)=>v.getInt32(8+i*4,true)),patch[0].after);
  assert.equal(e.hkia_inventory_snapshot(),0);
  const iv=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
  assert.equal(iv.getUint32(0,true),2);assert.equal(iv.getUint32(20,true),8);assert.equal(iv.getInt32(28,true),25);
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM FLOWER VARIANT EDIT PASS: native choices, CAS, local draft and exported payload reparse');
 }finally{await context.close();}
}
async function inventoryOwnedFlowerEffectSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800},acceptDownloads:true});
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-owned-flower-effect.save',mimeType:'application/octet-stream',buffer:Buffer.from(createSyntheticSlot({editableFlower:true,ownedRestrictedFlower:true}))});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await page.locator('.inventory-controls input[type="search"]').fill('43114910');
  await page.locator('.inventory-card .inventory-unique-edit-button:not([disabled])').click();
  const dialog=page.locator('dialog[aria-labelledby="flower-editor-title"]');await dialog.waitFor();
  const select=dialog.locator('select'),option=select.locator('option[data-flower-variant="6,8,6,0"]');
  const value=await option.getAttribute('value');assert.ok(value!==null);
  assert.equal(await select.locator('option[data-flower-variant$=",15,0"]').count(),0);
  await select.selectOption(value);
  await dialog.locator('button[type="submit"]:not([disabled])').waitFor();
  assert.equal(await dialog.locator('.inventory-create-flower:not([disabled])').count(),0);
  await dialog.locator('button[type="submit"]').click();await dialog.waitFor({state:'hidden'});
  await page.reload({waitUntil:'networkidle'});await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await page.locator('.inventory-controls input[type="search"]').fill('43114910');
  await page.locator('.file-menu > summary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),page.locator('.file-menu .menu-popover > button').nth(2).click()]);
  const output=readFileSync(await download.path());
  const {instance}=await WebAssembly.instantiate(readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm'),{}),e=instance.exports;
  const ptr=e.hkia_stage(output.length);assert.ok(ptr>0);new Uint8Array(e.memory.buffer,ptr,output.length).set(output);
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_flowers_snapshot(),0);
  const v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
  assert.equal(v.getUint32(0,true),1);assert.equal(v.getUint32(4,true),8);
  assert.deepEqual(Array.from({length:4},(_,i)=>v.getInt32(8+i*4,true)),[6,8,6,0]);
  assert.deepEqual(errors,[]);console.log('CHROMIUM OWNED FLOWER EFFECT PASS: original retained, no new restricted effect, recovery and reparse');
 }finally{await context.close()}
}
async function inventoryFlowerCreationSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800},acceptDownloads:true});
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-flower-add.save',mimeType:'application/octet-stream',buffer:Buffer.from(createSyntheticSlot({editableFlower:true}))});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  const search=page.locator('.inventory-controls input[type="search"]');
  await search.fill('43114910');
  const cards=page.locator('.inventory-card');
  const edit=cards.first().locator('.inventory-unique-edit-button');
  await edit.waitFor({timeout:30_000});await edit.click();
  const dialog=page.locator('dialog[aria-labelledby="flower-editor-title"]');
  await dialog.waitFor();
  const select=dialog.locator('select');
  const value=await select.locator('optgroup').first().locator('option').first().getAttribute('value');
  assert.ok(value!==null);await select.selectOption(value);
  const create=dialog.locator('.inventory-create-flower');
  const addQuantity=dialog.locator('input[name="variant-add-quantity"]');
  assert.equal(await addQuantity.inputValue(),'1');
  for(const invalid of ['0','2147483648','1.5','']){
   await addQuantity.fill(invalid);assert.equal(await create.isDisabled(),true);
  }
  await addQuantity.fill('5');
  await dialog.locator('.inventory-create-flower:not([disabled])').click();
  await dialog.waitFor({state:'hidden'});
  const added=cards.nth(1).locator('input[name="quantity"]');
  await added.waitFor();assert.equal(await added.inputValue(),'5');
  assert.equal(await cards.first().locator('input[name="quantity"]').inputValue(),'1');
  await added.fill('7');await cards.nth(1).locator('.inventory-quantity-form button[type="submit"]').click();
  await cards.nth(1).locator('.inventory-quantity-form button[type="submit"]:not([disabled])').waitFor();
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await search.fill('43114910');
  await added.waitFor();assert.equal(await added.inputValue(),'7');
  const undo=page.locator('.bar-actions button[title="Undo"]:not([disabled])');
  const redo=page.locator('.bar-actions button[title="Redo"]:not([disabled])');
  await undo.click();await page.waitForFunction(()=>document.querySelectorAll('.inventory-card input[name="quantity"]')[1]?.value==='5');
  await undo.click();await cards.nth(1).waitFor({state:'detached'});
  await redo.click();await added.waitFor();assert.equal(await added.inputValue(),'5');
  await redo.click();await page.waitForFunction(()=>document.querySelectorAll('.inventory-card input[name="quantity"]')[1]?.value==='7');
  await page.locator('.file-menu > summary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),page.locator('.file-menu .menu-popover > button').nth(2).click()]);
  const output=readFileSync(await download.path());
  const wasm=readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm');
  const {instance}=await WebAssembly.instantiate(wasm,{}),e=instance.exports;
  const ptr=e.hkia_stage(output.length);assert.ok(ptr>0);new Uint8Array(e.memory.buffer,ptr,output.length).set(output);
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_flowers_snapshot(),0);
  const v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
  assert.equal(v.getUint32(0,true),2);assert.equal(v.getUint32(4,true),8);assert.equal(v.getUint32(24,true),9);
  assert.deepEqual(Array.from({length:4},(_,i)=>v.getInt32(8+i*4,true)),[6,1,0,0]);
  assert.notDeepEqual(Array.from({length:4},(_,i)=>v.getInt32(28+i*4,true)),[6,1,0,0]);
  assert.equal(e.hkia_inventory_snapshot(),0);
  const iv=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
  assert.equal(iv.getUint32(0,true),3);assert.equal(iv.getUint32(36,true),9);assert.equal(iv.getInt32(44,true),7);
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM FLOWER CREATION PASS: distinct native identity, source preserved, quantity, draft recovery, Undo/Redo, exported reparse');
 }finally{await context.close();}
}
async function inventoryAbsentFlowerCreationSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800},acceptDownloads:true});
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-unowned-flower.save',mimeType:'application/octet-stream',buffer:Buffer.from(createSyntheticSlot())});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  await page.locator('.inventory-add-toggle').click();
  const search=page.locator('.inventory-controls input[type="search"]');
  await search.fill('43114910');
  const card=page.locator('.inventory-card');
  await card.locator('.inventory-unique-edit-button').click();
  const dialog=page.locator('dialog[aria-labelledby="flower-editor-title"]');
  await dialog.waitFor();
  assert.equal(await dialog.locator('button[type="submit"]').count(),0);
  await dialog.locator('[data-flower-grow="0"]:not([disabled])').click();
  await dialog.locator('[data-flower-grow="0"][aria-pressed="true"]').waitFor();
  await dialog.locator('[data-flower-grow="7"]:not([disabled])').click();
  await dialog.locator('[data-flower-grow="7"][aria-pressed="true"]').waitFor();
  await dialog.locator('[data-flower-grow="6"]:not([disabled])').click();
  await dialog.locator('[data-flower-grow="6"][aria-pressed="true"]').waitFor();
  const firstPattern=await dialog.locator('option[data-flower-variant="6,2,1,16"]').getAttribute('value');assert.ok(firstPattern!==null);
  await dialog.locator('select').selectOption(firstPattern);
  await dialog.locator('[data-native-decorator="11"] img[src$="pattern-1.webp"]').waitFor({timeout:30_000});
  assert.deepEqual(await dialog.locator('[data-native-decorator]').evaluateAll(els=>els.map(e=>e.getAttribute('data-native-decorator'))),['12','11']);
  const reset=dialog.locator('.inventory-flower-reset:not([disabled])');
  await reset.waitFor();
  await reset.click();
  await dialog.locator('.inventory-flower-reset').waitFor({state:'hidden'});
  await dialog.locator('[data-native-decorator="11"]').waitFor({state:'detached'});
  await dialog.locator('[data-native-decorator="12"]').waitFor();
  const restoredPattern=await dialog.locator('option[data-flower-variant="6,2,1,16"]').getAttribute('value');
  assert.ok(restoredPattern!==null);
  await dialog.locator('select').selectOption(restoredPattern);
  await reset.waitFor();
  await dialog.locator('.inventory-create-flower:not([disabled])').click();
  await dialog.waitFor({state:'hidden'});
  await page.locator('.inventory-add-toggle:not([disabled])').click();
  await search.fill('43114910');
  await card.locator('input[name="quantity"]').waitFor();
  assert.equal(await card.locator('input[name="quantity"]').inputValue(),'1');
  // The first stack already has the selected pattern, without an intermediate edit.
  await card.locator('.inventory-unique-edit-button:not([disabled])').waitFor();
  await card.locator('.inventory-unique-edit-button').click();await dialog.waitFor();
  const color=await dialog.locator('select optgroup').first().locator('option').first().getAttribute('value');assert.ok(color!==null);
  await dialog.locator('select').selectOption(color);
  await dialog.locator('.inventory-create-flower:not([disabled])').click();await dialog.waitFor({state:'hidden'});
  await card.nth(1).waitFor();
  await card.nth(1).locator('.inventory-unique-edit-button:not([disabled])').waitFor();
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await search.fill('43114910');
  await card.nth(1).waitFor();
  assert.deepEqual(await card.locator('input[name="quantity"]').evaluateAll(rows=>rows.map(r=>r.value)),['1','1']);
  await page.locator('.file-menu > summary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),page.locator('.file-menu .menu-popover > button').nth(2).click()]);
  const output=readFileSync(await download.path());
  const {instance}=await WebAssembly.instantiate(readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm'),{}),e=instance.exports;
  const ptr=e.hkia_stage(output.length);assert.ok(ptr>0);new Uint8Array(e.memory.buffer,ptr,output.length).set(output);
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_flowers_snapshot(),0);
  const v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
  assert.equal(v.getUint32(0,true),2);assert.equal(v.getUint32(4,true),5);assert.equal(v.getUint32(24,true),6);
  assert.deepEqual(Array.from({length:4},(_,i)=>v.getInt32(8+i*4,true)),[6,2,1,16]);
  assert.notDeepEqual(Array.from({length:4},(_,i)=>v.getInt32(28+i*4,true)),[6,2,1,16]);
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM UNOWNED FLOWER PASS: native default choices, staged appearance edit, draft recovery, exported reparse');
 }finally{await context.close();}
}
async function inventoryRareCandleSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800},acceptDownloads:true});
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-rare-candle.save',mimeType:'application/octet-stream',buffer:Buffer.from(createSyntheticSlot())});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await page.locator('.inventory-add-toggle').click();
  const search=page.locator('.inventory-controls input[type="search"]'),card=page.locator('.inventory-card');
  await search.fill('22657460');await card.locator('.inventory-unique-edit-button').click();
  const dialog=page.locator('dialog[aria-labelledby="flower-editor-title"]');await dialog.waitFor();
  assert.equal(await dialog.locator('button[type="submit"]').count(),0);
  assert.equal(await dialog.locator('[data-flower-grow]').count(),0);
  const choices=await dialog.locator('option[data-flower-variant]').evaluateAll(rows=>rows.map(row=>row.getAttribute('data-flower-variant').split(',').map(Number)));
  assert.ok(choices.length>0);assert.ok(choices.every(v=>v[0]===6&&([1,2,10,11,12,13,14,16].includes(v[2])?v[3]!==0&&v[3]!==v[1]:[3,4,5,7,8,9].includes(v[2])&&v[3]===0)));
  for(const pattern of [3,4,5,7,8,9])assert.ok(choices.some(v=>v[2]===pattern&&v[3]===0));
  const target=choices.find(v=>v[2]===3&&v[3]===0);assert.ok(target);
  const value=await dialog.locator('option[data-flower-variant="'+target.join(',')+'"]').getAttribute('value');assert.ok(value!==null);
  await dialog.locator('select').selectOption(value);
  await dialog.locator('[data-native-decorator="11"] img[src$="pattern-3.webp"]').waitFor({timeout:30_000});
  await dialog.locator('[data-inventory-art="native-static-route"].item-sprite').waitFor({timeout:30_000});
  await dialog.locator('input[name="variant-add-quantity"]').fill('3');
  await dialog.locator('.inventory-create-flower:not([disabled])').click();await dialog.waitFor({state:'hidden'});
  await page.locator('.inventory-add-toggle:not([disabled])').click();await search.fill('22657460');
  await card.locator('input[name="quantity"]').waitFor();assert.equal(await card.locator('input[name="quantity"]').inputValue(),'3');
  await page.reload({waitUntil:'networkidle'});await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await search.fill('22657460');await card.locator('input[name="quantity"]').waitFor();
  assert.equal(await card.locator('input[name="quantity"]').inputValue(),'3');
  await page.locator('.file-menu > summary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),page.locator('.file-menu .menu-popover > button').nth(2).click()]);
  const output=readFileSync(await download.path());
  const {instance}=await WebAssembly.instantiate(readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm'),{}),e=instance.exports;
  const ptr=e.hkia_stage(output.length);assert.ok(ptr>0);new Uint8Array(e.memory.buffer,ptr,output.length).set(output);
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_flowers_snapshot(),0);
  const v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
  assert.equal(v.getUint32(0,true),1);assert.deepEqual(Array.from({length:4},(_,i)=>v.getInt32(8+i*4,true)),target);
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM RARE CANDLE PASS: native effect-pattern selection, recovery, export reparse');
 }finally{await context.close();}
}
async function inventoryFlowerClothingCreationSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800},acceptDownloads:true});
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-unowned-flower-clothing.save',mimeType:'application/octet-stream',buffer:Buffer.from(createSyntheticSlot())});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  await page.locator('.inventory-add-toggle').click();
  const search=page.locator('.inventory-controls input[type="search"]');
  await search.fill('1120342995');
  const card=page.locator('.inventory-card');
  await card.locator('.inventory-unique-edit-button').click();
  const dialog=page.locator('dialog[aria-labelledby="flower-editor-title"]');
  await dialog.waitFor();
  const crownColor=await dialog.locator('option[data-flower-variant="6,5,0,0"]').getAttribute('value');assert.ok(crownColor!==null);
  await dialog.locator('select').selectOption(crownColor);
  await dialog.locator('.inventory-create-flower:not([disabled])').click();
  await dialog.waitFor({state:'hidden'});
  await page.locator('.inventory-add-toggle:not([disabled])').click();
  await search.fill('1120342995');
  await card.locator('input[name="quantity"]').waitFor();
  assert.equal(await card.locator('input[name="quantity"]').inputValue(),'1');
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await search.fill('1120342995');
  await card.locator('input[name="quantity"]').waitFor();
  assert.equal(await card.locator('input[name="quantity"]').inputValue(),'1');
  await page.locator('.file-menu > summary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),page.locator('.file-menu .menu-popover > button').nth(2).click()]);
  const output=readFileSync(await download.path());
  const {instance}=await WebAssembly.instantiate(readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm'),{}),e=instance.exports;
  const ptr=e.hkia_stage(output.length);assert.ok(ptr>0);new Uint8Array(e.memory.buffer,ptr,output.length).set(output);
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_flowers_snapshot(),0);
  const v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
  assert.equal(v.getUint32(0,true),1);assert.equal(v.getUint32(4,true),5);
  assert.deepEqual(Array.from({length:4},(_,i)=>v.getInt32(8+i*4,true)),[6,5,0,0]);
  assert.equal(e.hkia_inventory_snapshot(),0);
  const iv=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
  assert.equal(iv.getUint32(0,true),2);assert.equal(iv.getInt32(24,true),1120342995);
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM FLOWER CLOTHING CREATION PASS: exact crown default, local recovery, output reparse');
 }finally{await context.close();}
}
async function inventoryDefaultFurnitureCreationSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800},acceptDownloads:true});
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-default-furniture.save',mimeType:'application/octet-stream',buffer:Buffer.from(createSyntheticSlot())});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  await page.locator('.inventory-add-toggle').click();
  const search=page.locator('.inventory-controls input[type="search"]');await search.fill('61381969');
  const card=page.locator('.inventory-card');
  await card.locator('input[name="quantity"]').fill('3');
  await card.locator('.inventory-quantity-form button[type="submit"]').click();
  await card.locator('.inventory-add-source').waitFor();
  assert.equal(await card.locator('input[name="quantity"]').count(),0);
  await page.locator('.inventory-batch-toggle').click();
  assert.equal(await card.locator('.inventory-batch-checkbox').count(),0);
  await page.locator('.inventory-batch-toggle').click();
  await card.locator('.inventory-add-source').click();
  const dialog=page.locator('dialog[aria-labelledby="furniture-editor-title"]');
  await dialog.waitFor();
  const value=await dialog.locator('select option').filter({hasText:'Antique Lamp 2'}).getAttribute('value');assert.ok(value!==null);
  await dialog.locator('select').selectOption(value);
  await dialog.locator('.inventory-create-furniture:not([disabled])').click();
  await dialog.waitFor({state:'hidden'});
  await page.locator('.inventory-add-toggle:not([disabled])').click();
  await search.fill('61381969');
  await card.nth(1).waitFor();
  const quantities=await card.locator('input[name="quantity"]').evaluateAll(rows=>rows.map(r=>r.value));
  const customIndex=quantities.indexOf('1');assert.ok(customIndex>=0);
  await card.nth(customIndex).locator('.inventory-unique-edit-button').click();
  await dialog.waitFor();
  const next=await dialog.locator('select option').filter({hasText:'Antique Lamp 3'}).getAttribute('value');assert.ok(next!==null);
  await dialog.locator('select').selectOption(next);
  await dialog.locator('.inventory-create-furniture:not([disabled])').click();
  await dialog.waitFor({state:'hidden'});
  await card.nth(2).locator('.inventory-unique-edit-button:not([disabled])').waitFor();
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await search.fill('61381969');
  await card.nth(2).waitFor();
  assert.deepEqual((await card.locator('input[name="quantity"]').evaluateAll(rows=>rows.map(r=>Number(r.value)))).sort((a,b)=>a-b),[1,1,3]);
  await page.locator('.file-menu > summary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),page.locator('.file-menu .menu-popover > button').nth(2).click()]);
  const output=readFileSync(await download.path());
  const {instance}=await WebAssembly.instantiate(readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm'),{}),e=instance.exports;
  const ptr=e.hkia_stage(output.length);assert.ok(ptr>0);new Uint8Array(e.memory.buffer,ptr,output.length).set(output);
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_unique_snapshot(),0);
  const v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());let at=0;
  const u=()=>{const n=v.getUint32(at,true);at+=4;return n};const count=u(),rows=[];
  for(let i=0;i<count;i++){const id=u(),present=u(),uid=u(),tag=u()|0,fields=u(),n=u();const words=Array.from({length:n},()=>u()|0);u();if(tag===8)rows.push({id,present,uid,fields,words});}
  assert.equal(count,4);assert.equal(rows.length,2);assert.equal(rows[0].uid,1);assert.equal(rows[1].uid,2);assert.deepEqual(rows[0].words,[0,2,0]);assert.deepEqual(rows[1].words,[0,3,0]);
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM DEFAULT FURNITURE CREATION PASS: ordinary source retained, draft and native export reparse');
 }finally{await context.close();}
}
async function inventoryAbsentFurnitureCreationSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800},acceptDownloads:true});
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-unowned-furniture.save',mimeType:'application/octet-stream',buffer:Buffer.from(createSyntheticSlot())});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  await page.locator('.inventory-add-toggle').click();
  const search=page.locator('.inventory-controls input[type="search"]');await search.fill('61381969');
  const card=page.locator('.inventory-card');
  await card.locator('.inventory-unique-edit-button').click();
  const dialog=page.locator('dialog[aria-labelledby="furniture-editor-title"]');await dialog.waitFor();
  const value=await dialog.locator('select option').filter({hasText:'Antique Lamp 2'}).getAttribute('value');assert.ok(value!==null);
  await dialog.locator('select').selectOption(value);
  await dialog.locator('.inventory-create-furniture:not([disabled])').click();
  await dialog.waitFor({state:'hidden'});
  await page.locator('.inventory-add-toggle:not([disabled])').click();
  await search.fill('61381969');
  await card.locator('input[name="quantity"]').waitFor();assert.equal(await card.locator('input[name="quantity"]').inputValue(),'1');
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await search.fill('61381969');
  await card.locator('input[name="quantity"]').waitFor();assert.equal(await card.locator('input[name="quantity"]').inputValue(),'1');
  const quantity=card.locator('input[name="quantity"]');
  assert.equal(await quantity.getAttribute('min'),'0');
  await quantity.fill('0');await card.locator('.inventory-quantity-form button[type="submit"]').click();
  await confirmInventoryRemoval(page,false);
  assert.equal(await card.count(),1);
  await card.locator('.inventory-quantity-form button[type="submit"]').click();
  await confirmInventoryRemoval(page);
  await card.waitFor({state:'hidden'});
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await search.fill('61381969');
  await card.waitFor({state:'hidden'});
  await page.locator('button[title="Undo"]:not([disabled])').click();
  // The restored match must be visible without manually switching categories.
  await quantity.waitFor();assert.equal(await quantity.inputValue(),'1');
  assert.equal(await page.locator('[data-inventory-group="furniture"]').getAttribute('aria-pressed'),'true');
  await page.locator('button[title="Redo"]:not([disabled])').click();
  await card.waitFor({state:'hidden'});
  await page.locator('button[title="Undo"]:not([disabled])').click();
  await quantity.waitFor();
  await page.locator('.file-menu > summary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),page.locator('.file-menu .menu-popover > button').nth(2).click()]);
  const output=readFileSync(await download.path());
  const {instance}=await WebAssembly.instantiate(readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm'),{}),e=instance.exports;
  const ptr=e.hkia_stage(output.length);assert.ok(ptr>0);new Uint8Array(e.memory.buffer,ptr,output.length).set(output);
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_unique_snapshot(),0);
  const v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());let at=0;
  const u=()=>{const n=v.getUint32(at,true);at+=4;return n};const count=u(),rows=[];
  for(let i=0;i<count;i++){const id=u(),present=u(),uid=u(),tag=u()|0,fields=u(),n=u();const words=Array.from({length:n},()=>u()|0);u();if(tag===8)rows.push({id,present,uid,fields,words});}
  assert.deepEqual(rows,[{id:5,present:1,uid:1,fields:3,words:[0,2,0]}]);
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM UNOWNED FURNITURE PASS: source-authorized candidate, local draft, native output reparse');
 }finally{await context.close();}
}
async function inventoryFurnitureCreationSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800},acceptDownloads:true});
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-furniture-add.save',mimeType:'application/octet-stream',buffer:Buffer.from(createSyntheticSlot({editableFurniture:true}))});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  const search=page.locator('.inventory-controls input[type="search"]');await search.fill('61381969');
  const cards=page.locator('.inventory-card');
  await cards.first().locator('.inventory-unique-edit-button').click();
  const dialog=page.locator('dialog[aria-labelledby="furniture-editor-title"]');await dialog.waitFor();
  const value=await dialog.locator('select optgroup option').first().getAttribute('value');assert.ok(value!==null);
  await dialog.locator('select').selectOption(value);
  const create=dialog.locator('.inventory-create-furniture');
  const addQuantity=dialog.locator('input[name="variant-add-quantity"]');
  assert.equal(await addQuantity.inputValue(),'1');
  for(const invalid of ['0','2147483648','1.5','']){
   await addQuantity.fill(invalid);assert.equal(await create.isDisabled(),true);
  }
  await addQuantity.fill('4');
  await dialog.locator('.inventory-create-furniture:not([disabled])').click();await dialog.waitFor({state:'hidden'});
  const added=cards.nth(1).locator('input[name="quantity"]');
  await added.waitFor();assert.equal(await added.inputValue(),'4');
  assert.equal(await cards.first().locator('input[name="quantity"]').inputValue(),'93');
  await cards.nth(1).locator('.inventory-unique-edit-button').click();await dialog.waitFor();
  const next=await dialog.locator('select optgroup option').first().getAttribute('value');assert.ok(next!==null);
  await dialog.locator('select').selectOption(next);
  await dialog.locator('button[type="submit"]').click();await dialog.waitFor({state:'hidden'});
  await added.fill('7');await cards.nth(1).locator('.inventory-quantity-form button[type="submit"]').click();
  await cards.nth(1).locator('.inventory-quantity-form button[type="submit"]:not([disabled])').waitFor();
  await page.reload({waitUntil:'networkidle'});await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await search.fill('61381969');
  await added.waitFor();assert.equal(await added.inputValue(),'7');
  await page.locator('.file-menu > summary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),page.locator('.file-menu .menu-popover > button').nth(2).click()]);
  const output=readFileSync(await download.path());
  const {instance}=await WebAssembly.instantiate(readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm'),{}),e=instance.exports;
  const ptr=e.hkia_stage(output.length);assert.ok(ptr>0);new Uint8Array(e.memory.buffer,ptr,output.length).set(output);
  assert.equal(e.hkia_open(),0);assert.equal(e.hkia_inventory_unique_snapshot(),0);
  const v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());let at=0;
  const u=()=>{const n=v.getUint32(at,true);at+=4;return n};const count=u(),rows=[];
  for(let i=0;i<count;i++){const id=u(),present=u(),uid=u(),tag=u()|0,fields=u(),n=u();const words=Array.from({length:n},()=>u()|0);u();if(tag===8)rows.push({id,present,uid,fields,words});}
  assert.equal(rows.length,2);assert.deepEqual(rows[0],{id:8,present:1,uid:11,fields:3,words:[13,2,0]});
  assert.equal(rows[1].id,9);assert.equal(rows[1].uid,12);assert.notDeepEqual(rows[1].words,rows[0].words);
  assert.equal(e.hkia_inventory_snapshot(),0);
  const iv=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
  assert.equal(iv.getUint32(0,true),3);assert.equal(iv.getUint32(36,true),9);assert.equal(iv.getInt32(44,true),7);
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM FURNITURE CREATION PASS: source retained, staged customization, quantity, recovery and native output reparse');
 }finally{await context.close();}
}
async function customizedFurnitureRemovalSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800}});
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic-custom-furniture-zero.save',mimeType:'application/octet-stream',
   buffer:Buffer.from(createSyntheticSlot({editableFurniture:true}))});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  const search=page.locator('.inventory-controls input[type="search"]');
  const card=page.locator('.inventory-card'),input=card.locator('input[name="quantity"]');
  await search.fill('61381969');await input.waitFor();
  assert.equal(await input.getAttribute('min'),'0');
  await card.locator('.inventory-stack-delete').click();
  const modal=page.locator('.removal-confirm-dialog');await modal.waitFor({state:'visible'});
  await modal.locator('.removal-confirm-action').click();
  await page.locator('.inventory-empty-stack').waitFor();assert.equal(await input.inputValue(),'0');
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');await search.fill('61381969');
  await page.locator('.inventory-empty-stack').waitFor();assert.equal(await input.inputValue(),'0');
  await page.locator('button[title="Undo"]:not([disabled])').click();
  await page.locator('.inventory-empty-stack').waitFor({state:'hidden'});
  assert.equal(await input.inputValue(),'93');
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM CUSTOMIZED FURNITURE REMOVAL PASS: zero, reload, undo');
 }finally{await context.close()}
}
async function inventoryFurnitureVariantEditSmoke(){
 const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800},acceptDownloads:true});
 try{
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+base,{waitUntil:'networkidle'});
  await page.locator('input[type="file"]').setInputFiles({
   name:'synthetic-furniture-edit.save',mimeType:'application/octet-stream',
   buffer:Buffer.from(createSyntheticSlot({editableFurniture:true}))
  });
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  await page.locator('.inventory-group-option[data-inventory-group="furniture"]').click();
  await page.locator('.inventory-controls input[type="search"]').fill('61381969');
  const button=page.locator('.inventory-card .inventory-unique-edit-button');
  await button.waitFor({timeout:30_000});
  const quantity=page.locator('.inventory-card input[name="quantity"]');
  await quantity.waitFor();assert.equal(await quantity.inputValue(),'93');
  assert.equal(await quantity.getAttribute('min'),'0');
  await button.click();
  const dialog=page.locator('dialog[aria-labelledby="furniture-editor-title"][open]');
  await dialog.waitFor();
  const select=dialog.locator('select');
  const value=await select.locator('optgroup').first().locator('option[data-material-index="502"]').getAttribute('value');
  assert.ok(value!==null);
  await select.selectOption(value);
  const second=await select.locator('optgroup').nth(1).locator('option[data-material-index="3"]').getAttribute('value');assert.ok(second!==null);
  await select.selectOption(second);
  assert.equal(await dialog.locator('.inventory-furniture-reset').count(),2);
  await dialog.locator('button[type="submit"]').click();
  await dialog.waitFor({state:'hidden'});
  await page.locator('.state-dot.changed').waitFor();
  await page.waitForFunction(()=>!document.querySelector('.inventory-unique-edit-button')?.disabled);
  const patches=await page.evaluate(()=>new Promise((resolve,reject)=>{
   const open=indexedDB.open('hkia-editor-local-session',1);
   open.onerror=()=>reject(open.error);
   open.onsuccess=()=>{
    const db=open.result;
    const request=db.transaction('unsaved-changes','readonly').objectStore('unsaved-changes').get('current');
    request.onsuccess=()=>{db.close();resolve(request.result?.inventoryPatches??[])};
    request.onerror=()=>{db.close();reject(request.error)};
   };
  }));
  assert.equal(patches.length,1);
  const patch=patches[0];
  assert.equal(patch.kind,'furniture-variant');
  assert.equal(patch.documentId,8);
  assert.deepEqual(patch.before,[13,2,0]);
  assert.equal(patch.after.filter((v,i)=>v!==patch.before[i]).length,2);
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  await page.locator('.inventory-group-option[data-inventory-group="furniture"]').click();
  await page.locator('.inventory-controls input[type="search"]').fill('61381969');
  await button.waitFor();
  const undo=page.locator('.bar-actions button[title="Undo"]');
  const redo=page.locator('.bar-actions button[title="Redo"]');
  await undo.click();
  await page.locator('.bar-actions button[title="Redo"]:not([disabled])').waitFor();
  await redo.click();
  await page.locator('.bar-actions button[title="Undo"]:not([disabled])').waitFor();
  assert.equal(await quantity.inputValue(),'93');
  await quantity.fill('42');
  await page.locator('.inventory-card .inventory-quantity-form button[type="submit"]').click();
  await page.locator('.inventory-card .inventory-quantity-form button[type="submit"]:not([disabled])').waitFor();
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
  await chooseTab(page,'inventory');
  await page.locator('.inventory-group-option[data-inventory-group="furniture"]').click();
  await page.locator('.inventory-controls input[type="search"]').fill('61381969');
  await quantity.waitFor();assert.equal(await quantity.inputValue(),'42');
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
  assert.equal(e.hkia_inventory_unique_snapshot(),0);
  const v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
  let at=0;
  const u=()=>{const n=v.getUint32(at,true);at+=4;return n};
  const count=u();let furniture;
  for(let i=0;i<count;i++){
   const id=u(),present=u(),uid=u(),tag=u()|0,fields=u(),n=u();
   const words=Array.from({length:n},()=>u()|0);u();
   if(id===8)furniture={present,uid,tag,fields,words};
  }
  assert.equal(at,v.byteLength);
  assert.deepEqual(furniture,{present:1,uid:11,tag:8,fields:3,words:patch.after});
  assert.equal(e.hkia_inventory_snapshot(),0);
  const iv=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
  assert.equal(iv.getUint32(0,true),2);assert.equal(iv.getUint32(20,true),8);assert.equal(iv.getInt32(28,true),42);
  assert.deepEqual(errors,[]);
  console.log('CHROMIUM FURNITURE VARIANT EDIT PASS: native choices, CAS, draft, Undo/Redo and exported payload reparse');
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
 // The snapshot can render while the asynchronous history/draft write is
 // still busy. Wait for the actual enabled Undo control, not a transient
 // disabled state; missing history still times out and fails the test.
 await page.locator('.bar-actions button[title="Undo"]:not([disabled])').waitFor({timeout:20_000});
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
 await inventoryPaletteCreationSmoke();
 await inventoryFirstPaletteSmoke();
 await inventoryPaletteRemovalSmoke();
 await chefRuntimeSmoke(browser,origin,base);
 await inventoryChefArtSmoke();
 await inventoryBobaEditSmoke();
 await inventoryWandEditSmoke();
 await inventoryFirstWandSmoke();
 await inventoryFirstItemWandSmoke();
 await inventoryFirstFurnitureWandSmoke();
 await inventoryNestedWandSmoke();
 await inventoryBobaFullCreationSmoke();
 await inventoryFirstChefSmoke();
 await inventoryCafeEditSmoke();
 await inventoryCafeCreationAndOptionalSideSmoke();
 await inventoryChefQuantitySmoke();
 await wandRuntimeSmoke(browser,origin,base);
 await inventoryEditExportSmoke();
 await inventoryBatchQuantitySmoke();
 await inventoryQuantityBoundsSmoke();
 await inventoryEmptyMaterialSmoke();
 await inventoryEmptyMaterialSmoke(true);
 await inventoryEmptyBrowseSmoke();
 await ordinaryFurnitureRemovalSmoke();
 await ordinaryClothingRemovalSmoke();
 await inventoryCreateMaterialSmoke();
 await inventoryOriginalArtSmoke();
 await inventoryDynamicFlowerArtSmoke();
 await inventoryFlowerGrowthDisplaySmoke();
 await flowerRuntimeCoverage(browser,origin,base);
 await inventoryFlowerVariantEditSmoke();
 await inventoryOwnedFlowerEffectSmoke();
 await inventoryFlowerCreationSmoke();
 await inventoryAbsentFlowerCreationSmoke();
 await inventoryRareCandleSmoke();
 await inventoryFlowerClothingCreationSmoke();
 await inventoryFurnitureVariantEditSmoke();
 await customizedFurnitureRemovalSmoke();
 await inventoryFurnitureCreationSmoke();
 await inventoryAbsentFurnitureCreationSmoke();
 await inventoryDefaultFurnitureCreationSmoke();
 await achievementDstFoldExportSmoke();
 await achievementAtlasRetrySmoke();
}
try{await run()}finally{
 await browser?.close();
 service?.kill('SIGTERM');
}

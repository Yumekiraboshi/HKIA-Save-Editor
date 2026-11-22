/**
 * Chromium end-to-end smoke for the exact Vite build shipped to Pages.
 * Uses a synthetic source-shaped HKIA save (never a real user's save).
 * Run after npm run build:
 *   node scripts/browser-history-smoke.mjs
 * Requires CI's locally installed Chrome and playwright-core.
 */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {chromium} from 'playwright-core';

const append=(...arrays)=>Uint8Array.from(arrays.flatMap(x=>Array.from(x)));
const u32=n=>append([0xce],Array.from({length:4},(_,i)=>n>>>(24-8*i)&255));
const f32=n=>{const a=new Uint8Array(5);a[0]=0xca;new DataView(a.buffer).setFloat32(1,n);return a};
const i64=n=>{const a=new Uint8Array(9);a[0]=0xd3;new DataView(a.buffer).setBigInt64(1,n,false);return a};
const arr=(...elements)=>{assert.ok(elements.length<16);return append([0x90|elements.length],...elements)};
const map=(...pairs)=>{assert.ok(pairs.length%2===0&&pairs.length/2<16);return append([0x80|pairs.length/2],...pairs)};
const hash=(...words)=>append(...words.map(u32));
const doc=(tag,body)=>arr([tag],body);
const str=text=>append([0xa0|text.length],new TextEncoder().encode(text));

function createSyntheticSlot(){
 const version='3.0.1';
 const collection=doc(39,arr(map(),map([2],i64(638000000000000001n),[3],i64(9n))));
 const object=doc(32,arr([3],hash(0,0,0,3),[0],arr(collection)));
 const child=doc(16,arr([1],hash(1,0,0,1),arr([0xc2],f32(1),[0xc0])));
 const parent=doc(16,arr([2],hash(2,0,0,1),arr([0xc2],f32(2),[0xc0])));
 const counter=doc(17,arr([1],hash(1,0,0,2),arr(f32(2),[0xc0],[0x90])));
 const model=arr([0],[4],arr(doc(18,arr([0],u32(87),str(version))),child,parent,counter,object));
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
const origin='http://127.0.0.1:4173';
const base=process.env.GITHUB_ACTIONS==='true'?'/HKIA-Save-Editor/':'/';
const service=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173','--strictPort'],{
 env:process.env,stdio:['ignore','pipe','pipe']
});
let serviceLog='';
for(const stream of [service.stdout,service.stderr])
 stream.on('data',chunk=>serviceLog+=String(chunk).slice(-2000));
let browser;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitForServer(){
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
async function chooseTab(page,index){
 await page.locator('.tools-nav button.tool-tab').nth(index).click();
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
  return locator.evaluate(async el=>{
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
   return {hash,r:r/n,g:g/n,b:b/n,count:n,strap:pixelAt(47,30),buckle:pixelAt(43,50),neck:pixelAt(40,45),body:pixelAt(47,56)};
  });
 }
 await search.fill('Ice Cream Archer Hat');
 await page.locator('.collection-search-result').first().click();
 const iceSprite=page.locator('#collection-item-704486536 .item-sprite[data-dye-rendered="true"]');
 await iceSprite.waitFor({timeout:30_000});
 const icePixels=await sampledSprite(iceSprite);
 assert.ok(icePixels.count>75&&icePixels.r>icePixels.g+8,'Ice Cream Archer Hat should recolor its gray fabric pink');
 await search.fill('Orange Archer Hat');
 await page.locator('.collection-search-result').first().click();
 const orangeSprite=page.locator('#collection-item-585726126 .item-sprite[data-dye-rendered="true"]');
 await orangeSprite.waitFor({timeout:30_000});
 const orangePixels=await sampledSprite(orangeSprite);
 assert.ok(orangePixels.g>orangePixels.b+6,'Orange Archer Hat should recolor its gray fabric yellow');
 assert.notEqual(icePixels.hash,orangePixels.hash,'shared native icon must produce separate dyed bitmap pixels');
 assert.equal(await page.locator('.native-dye-swatch,.native-dye-preview,.shared-dyeable-icon-note').count(),0);
 assert.equal(await page.locator('#collection-item-585726126 .item-art').evaluate(el=>
  getComputedStyle(el,'::before').backgroundImage),'none');
 
 // The game-source Archer Costume thumbnail has three distinct regions.
 // Verify channel 2 changes the existing ochre strap and channel 3 the
 // existing golden buckle, in addition to the already working tunic color.
 await search.fill('Ice Cream Archer Costume');
 await page.locator('.collection-search-result').first().click();
 const creamCostume=page.locator('#collection-item-1286846063 .item-sprite[data-dye-rendered="true"]');
 await creamCostume.waitFor({timeout:30_000});
 const creamPixels=await sampledSprite(creamCostume);
 await search.fill('Orange Archer Costume');
 await page.locator('.collection-search-result').first().click();
 const orangeCostume=page.locator('#collection-item-935642973 .item-sprite[data-dye-rendered="true"]');
 await orangeCostume.waitFor({timeout:30_000});
 const orangeCostumePixels=await sampledSprite(orangeCostume);
 assert.notEqual(creamPixels.hash,orangeCostumePixels.hash);
 assert.ok(creamPixels.strap[2]>creamPixels.strap[0]+15,'source ochre band becomes cyan in Ice Cream');
 assert.ok(orangeCostumePixels.strap[0]>orangeCostumePixels.strap[2]+40,'source band becomes orange in Orange');
 assert.ok(creamPixels.buckle[2]>creamPixels.buckle[0]*.65,'source buckle becomes pale with Ice Cream');
 assert.ok(orangeCostumePixels.buckle[0]>orangeCostumePixels.buckle[2]+50,'source buckle becomes gold with Orange');

 // Both School families have same-primary variants whose differing
 // second palette channel must alter pixels of the V-shaped neckline.
 // This detects regression to the first-channel-only gray thumbnail logic.
 async function checkSchoolPair(search1,id1,search2,id2){
  await search.fill(search1);
  await page.locator('.collection-search-result').first().click();
  const first=page.locator('#collection-item-'+id1+' .item-sprite[data-dye-rendered="true"]');
  await first.waitFor({timeout:30_000});
  const image1=await sampledSprite(first);
  await search.fill(search2);
  await page.locator('.collection-search-result').first().click();
  const second=page.locator('#collection-item-'+id2+' .item-sprite[data-dye-rendered="true"]');
  await second.waitFor({timeout:30_000});
  const image2=await sampledSprite(second);
  assert.notEqual(image1.hash,image2.hash,'the secondary game dye must change real image pixels');
  const neckDelta=image1.neck.reduce((sum,c,i)=>sum+Math.abs(c-image2.neck[i]),0);
  assert.ok(neckDelta>35,'V-neckline must display different secondary source colors: '+neckDelta);
  const bodyDelta=image1.body.reduce((sum,c,i)=>sum+Math.abs(c-image2.body[i]),0);
  assert.ok(bodyDelta<35,'main fabric uses identical native primary dye: '+bodyDelta);
 }
 await checkSchoolPair('Gray and Pink School Jacket',237080181,
  'Gray and Yellow School Jacket',556476907);
 await checkSchoolPair('Gray and Blue School Sweater Vest',307168230,
  'Gray and Pink School Sweater Vest',404567552);

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
 await chooseTab(page,1);
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

 await chooseTab(page,1);
 steps=await countHistory(page,2);
 assert.match(await steps.nth(1).getAttribute('class')??'',/active/);
 await steps.nth(0).click(); // independently undo saved achievement
 await chooseTab(page,0);
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

 await chooseTab(page,1);
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

 // Exact, same-origin 8x8 red capture must outrank approximation. Supply
 // a synthetic capture via a browser route without shipping false game art.
 // A missing second capture must fall back to local source-dye rendering.
 const fakePng=Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR4nGP8JWfznwEPYMInOXwUAABpGAJjJPuaSQAAAABJRU5ErkJggg==',
  'base64'
 );
 const fakeRecord=id=>({
  file:id+'.png',sha256:'a'.repeat(64),
  provenance:'verified-game-capture',
  source:'https://hellokittyislandadventure.wiki.gg/wiki/File:Test_Colorway.png'
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
 await page.reload({waitUntil:'networkidle'});
 await page.locator('.tools-nav button.tool-tab').first().waitFor({timeout:30_000});
 await chooseTab(page,0);
 const finalSearch=page.locator('.collection-controls input[type="search"]');
 await finalSearch.fill('Ice Cream Archer Hat');
 await page.locator('.collection-search-result').first().click();
 const captured=page.locator('#collection-item-704486536 .item-sprite[data-dye-source="game-capture"]');
 await captured.waitFor({timeout:30_000});
 assert.equal(await captured.evaluate(el=>getComputedStyle(el).backgroundSize),'contain',
  'verified colorway assets preserve their natural aspect ratio');
 assert.match(await captured.evaluate(el=>getComputedStyle(el).backgroundImage),/704486536\\.png/,
  'verified image uses direct static item-specific pixels rather than a recolored Blob');
 await finalSearch.fill('Orange Archer Hat');
 await page.locator('.collection-search-result').first().click();
 await page.locator('#collection-item-585726126 .item-sprite[data-dye-source="approximation"]').waitFor({timeout:30_000});

 assert.deepEqual(errors,[],'no console exceptions or 5xx during browser replay');
 console.log('CHROMIUM UI HISTORY SMOKE PASS: guarded collection and achievement removals, timestamp dialog, history, IndexedDB reload, mobile menu');
 await context.close();
}
try{await run()}finally{
 await browser?.close();
 service.kill('SIGTERM');
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
const {outputFiles}=await build({
 entryPoints:[fileURLToPath(new URL('../src/removal-confirmation.ts',import.meta.url))],
 bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'
});
const {removalConfirmationCopy}=await import(
 'data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64')
);
const {supportedLocales}=await import('data:text/javascript;base64,'+
 Buffer.from((await build({
  entryPoints:[fileURLToPath(new URL('../src/locales.ts',import.meta.url))],
  bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'
 })).outputFiles[0].text).toString('base64')
);

test('all 16 game locales have clear, complete removal and timestamp warnings',()=>{
 assert.equal(supportedLocales.length,16);
 for(const locale of supportedLocales){
  const m=removalConfirmationCopy(locale.code);
  for(const key of ['collectionTitle','achievementTitle','collectionWarning','achievementWarning','cancel','remove','stale']){
   assert.ok(typeof m[key]==='string'&&m[key].trim().length>=2,locale.code+' '+key);
  }
  assert.notEqual(m.collectionTitle,m.achievementTitle);
  assert.notEqual(m.cancel,m.remove);
 }
 const ja=removalConfirmationCopy('ja');
 assert.match(ja.collectionWarning,/日時/);
 assert.match(ja.achievementWarning,/達成日時/);
 assert.match(ja.achievementWarning,/カテゴリー/);
 const en=removalConfirmationCopy('en');
 assert.match(en.collectionWarning,/date and time/);
 assert.match(en.achievementWarning,/category/);
});

test('all destructive UI flows require modal confirmation, while additions do not',()=>{
 const app=read('../src/App.svelte');
 assert.match(app,/async function toggleCollection\(id:number,name:string,opener:HTMLElement\)/);
 assert.match(app,/if\(before!==undefined\)\{[\s\S]*?await requestRemoval\(/);
 assert.match(app,/else await change\(id,EPOCH\+BigInt\(Date\.now\(\)\)\*10000n\)/);
 assert.match(app,/async function clearDate\(opener:HTMLElement\)/);
 assert.match(app,/async function clearDate\([\s\S]*?await requestRemoval\(\{/);
 assert.match(app,/if\(live\?\.value\.complete&&!confirmed\)\{/);
 assert.match(app,/if\(opener\)await requestRemoval\(\{/);
 assert.match(app,/onclick=\{e=>void toggleCollection\(item\[0\],nameFor\(item\),e\.currentTarget\)\}/);
 assert.match(app,/onclick=\{e=>void clearDate\(e\.currentTarget\)\}/);
 assert.match(app,/onclick=\{e=>void quickToggleAchievement\(item,e\.currentTarget,title\)\}/);
 assert.doesNotMatch(app,/onclick=\{\(\)=>void change\(item\[0\],direct\?null/);
});

test('confirmation checks save identity, revision and current recorded/completed state before dispatch',()=>{
 const app=read('../src/App.svelte');
 assert.match(app,/if\(snapshot\.revision!==target\.revision\|\|original!==removalOriginal/);
 assert.match(app,/recorded\[String\(target\.id\)\]!==target\.before/);
 assert.match(app,/\.value\.complete!==true/);
 assert.match(app,/closeRemovalConfirmation\(\);error=removalCopy\.stale;return/);
 assert.match(app,/if\(target\.kind==='collections'\)\{[\s\S]*?await change\(target\.id,null\)/);
 assert.match(app,/else if\(target\.kind==='achievements'\)await quickToggleAchievement\(target\.item,undefined,undefined,true\)/);
 assert.match(app,/target\.requests\.some\(\(\[id,before\]\)=>\{/);
 assert.match(app,/const row=liveInventory\?\.get\(id\)/);
 assert.match(app,/return isInventoryLocked\(id\)\|\|!row\|\|row\.quantity!==before\|\|!\(physical\?row\.removable:zeroRows\?\(before===0\|\|zeroRows\.has\(id\)\):row\.editable&&row\.quantityMinimum===0\)/);
 assert.match(app,/if\(target\.batch\|\|target\.requests\.some\(\(\[id\]\)=>liveInventory\?\.get\(id\)\?\.batchZeroOnly\)\)\{update\(await changeInventoryQuantities\(target\.requests\.filter\(\(\[,before\]\)=>before!==0\)\)\)/);
 assert.match(app,/requestRemoval\(\{kind:'inventory',requests,physical,zero,batch,name,targets:details,revision:snapshot\.revision\},opener\)/);
 assert.match(app,/if\(next===0\)\{requestInventoryDelete\(rows,true,/);
 assert.match(app,/if\(next===0\)\{requestInventoryDelete\(\[row\],false,/);
 assert.doesNotMatch(app,/confirm\(inventoryEmptyCopy\(locale\)\)/);
 assert.match(app,/<dialog class="removal-confirm-dialog"/);
 assert.match(app,/aria-labelledby="removal-confirm-title"/);
 assert.match(app,/class="date-dialog-cancel removal-cancel" autofocus/);
 assert.match(app,/onclick=\{closeRemovalConfirmation\}/);
 assert.match(app,/onclose=\{onRemovalConfirmationClosed\}/);
 assert.match(app,/oncancel=\{e=>\{if\(busy\)e\.preventDefault\(\)\}\}/);
 const style=read('../src/style.css');
 assert.match(style,/\.removal-confirm-dialog::backdrop/);
 assert.match(style,/\.removal-confirm-action\{background:var\(--danger\)/);
});

test('batch removal preview includes zero records only for physical removal and uses the exact native CAS targets',()=>{
 const app=read('../src/App.svelte');
 assert.match(app,/const targets=physical\?rows:rows\.filter\(row=>row\.quantity>0\)/);
 assert.match(app,/const requests:InventoryQuantityRequest\[\]=targets\.map\(row=>\[row\.documentId,row\.quantity,0\]\)/);
 assert.match(app,/const details=targets\.slice\(0,BATCH_SIZE\)\.map\(row=>\(\{documentId:row\.documentId,name:/);
 assert.match(app,/\{#each pendingRemoval\.targets as target \(target\.documentId\)\}/);
 assert.match(app,/target\.quantity\.toLocaleString\(locale\)/);
 assert.match(app,/removeInventoryEntries\(target\.requests\.map\(\(\[id,before\]\)=>\[id,before\]\)\)/);
 assert.match(app,/onclick=\{\(\)=>void confirmRemoval\(true\)\}/);
});

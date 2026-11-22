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
   assert.ok(typeof m[key]==='string'&&m[key].trim().length>3,locale.code+' '+key);
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
 assert.match(app,/else await quickToggleAchievement\(target\.item,undefined,undefined,true\)/);
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

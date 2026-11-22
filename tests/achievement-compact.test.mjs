import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

async function imported(path){
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
}
const [quick,copy]=await Promise.all([imported('../src/achievement-quick.ts'),imported('../src/achievement-compact-ui.ts')]);
const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');

test('one click earns a source-defined achievement at its exact goal and time',()=>{
 const before={complete:false,current:2.25,completed:null};
 const after=quick.toggleAchievementState(before,1795251723456,10);
 assert.deepEqual(after,{complete:true,current:10,completed:[1795251723n,456000000]});
 assert.deepEqual(before,{complete:false,current:2.25,completed:null});
 assert.equal(quick.toggleAchievementState({complete:false,current:0,completed:null},0,1).current,1);
 assert.throws(()=>quick.toggleAchievementState(before,-1,10),/ACH_QUICK_TOGGLE_INVALID/);
 assert.throws(()=>quick.toggleAchievementState(before,Number.NaN,10),/ACH_QUICK_TOGGLE_INVALID/);
 assert.throws(()=>quick.toggleAchievementState({...before,current:-1},Date.now(),10),/ACH_QUICK_TOGGLE_INVALID/);
 assert.throws(()=>quick.toggleAchievementState(before,Date.now(),0),/ACH_QUICK_TOGGLE_INVALID/);
});

test('revoking completion keeps partial progress but clamps overflow below goal; Undo retains saved snapshot',()=>{
 const source={complete:true,current:12.5,completed:[1795251723n,123456700]};
 const changed=quick.toggleAchievementState(source,1800000000000,10);
 assert.deepEqual(changed,{complete:false,current:9,completed:null});
 assert.deepEqual(source,{complete:true,current:12.5,completed:[1795251723n,123456700]});
 const once=quick.toggleAchievementState(changed,1795251723456,10);
 assert.deepEqual(once,{complete:true,current:10,completed:[1795251723n,456000000]});
 assert.equal(quick.toggleAchievementState({complete:true,current:3,completed:null},Date.now(),10).current,3);
 assert.equal(quick.toggleAchievementState({complete:true,current:1,completed:null},Date.now(),1).current,0);
 assert.equal(quick.toggleAchievementState(source,1800000000000).current,source.current,'unknown source goal must not be invented');
 assert.equal(quick.toggleAchievementState(changed,1795251723456).current,changed.current,'unknown source goal must not be invented');
});

test('collection-like achievement cards create source-defined absent records on user click and keep a separate date popup',()=>{
 for(const mark of [
   'class="category-grid achievement-category-grid"',
   'class="category-card achievement-category-card"',
   'class="item-grid achievement-grid achievement-item-grid"',
   'class="item-tile achievement-tile"',
   'class="item-toggle achievement-toggle"',
   'class="date-button achievement-dialog-button"',
   'onclick={e=>void quickToggleAchievement(item,e.currentTarget,title)}',
   'if(item.row)void openAchievement(item.row',
   'disabled={busy||(!item.row&&(snapshot.version',
   'toggleAchievementState(prior,Date.now(),target)',
   'changeAchievement(live.guid,live.value,next)',
   'await persistDraft()',
   'bind:this={achievementDialogEl}',
   'bind:value={achievementDate}',
   'class="achievement-modal-source"',
   'compactCopy.scope'
 ])assert.ok(app.includes(mark),mark);
 assert.ok(!app.includes('class="achievement-card"'));
 assert.ok(!app.includes('achievementComplete=row.value.complete'));
 assert.ok(!app.includes('class="achievement-check"'));
 assert.doesNotMatch(app,/bind:value=\{achievementProgress\}|let achievementProgress=|inputmode="decimal"/);
 assert.match(app,/current:selected\.value\.current,completed/);
 assert.match(app,/\{#if editingAchievement\.value\.complete\}[\s\S]*?<button type="submit" class="primary"/);
 assert.ok(css.includes('.achievement-item-grid'));
 assert.ok(css.includes('.achievement-dialog-button')||css.includes('.item-tile .date-button'));
});

test('no new root or progress ordering is introduced; advanced counter/reward detail is popup-only',()=>{
 assert.match(app,/nativeAchievementOrder\(achievementGroupHierarchy,sourceAchievementRows,achievementFacts\)/);
 assert.match(app,/groupRows\(achievementGroupHierarchy,achievementGroupSelection,sourceAchievementRows,achievementFacts\)/);
 const segment=app.substring(app.indexOf('class="item-grid achievement-grid achievement-item-grid"'),app.indexOf('<dialog class="achievement-dialog"'));
 assert.doesNotMatch(segment,/achievement-fact-details|achievement-fact-list|sourceThreshold|rewardQuantity/);
 assert.match(app,/class="achievement-modal-source"/);
 assert.match(app,/factCopy\.receiptUnverified/);
});

test('one-click and popup controls are localized to all 16 game locales',()=>{
 const locales=['ar','de','en','en-GB','es','fr','fr-CA','it','ja','ko','nl','pt-BR','ru','tr','zh-Hans','zh-Hant'];
 for(const locale of locales){
  const data=copy.compactAchievementCopy(locale);
  for(const key of ['unlock','relock','date','details','source','scope']){
   assert.equal(typeof data[key],'string');
   assert.ok(data[key].trim(),locale+' '+key);
  }
 }
 assert.equal(copy.compactAchievementCopy('ja').unlock,'達成済みにする');
 assert.equal(copy.compactAchievementCopy('fr-CA').date,copy.compactAchievementCopy('fr').date);
});

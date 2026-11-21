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

test('one click completes an existing achievement and sets an exact UTC millisecond timestamp without inventing progress',()=>{
 const before={complete:false,current:2.25,completed:null};
 const after=quick.toggleAchievementState(before,1795251723456);
 assert.deepEqual(after,{complete:true,current:2.25,completed:[1795251723n,456000000]});
 assert.deepEqual(before,{complete:false,current:2.25,completed:null});
 assert.equal(quick.toggleAchievementState({complete:false,current:0,completed:null},0).completed[0],0n);
 assert.throws(()=>quick.toggleAchievementState(before,-1),/ACH_QUICK_TOGGLE_INVALID/);
 assert.throws(()=>quick.toggleAchievementState(before,Number.NaN),/ACH_QUICK_TOGGLE_INVALID/);
 assert.throws(()=>quick.toggleAchievementState({...before,current:-1},Date.now()),/ACH_QUICK_TOGGLE_INVALID/);
});

test('a second click clears the completion date but preserves exact saved CurrentValue and prior source snapshot',()=>{
 const source={complete:true,current:12.5,completed:[1795251723n,123456700]};
 const changed=quick.toggleAchievementState(source,1800000000000);
 assert.deepEqual(changed,{complete:false,current:12.5,completed:null});
 assert.deepEqual(source,{complete:true,current:12.5,completed:[1795251723n,123456700]});
 const once=quick.toggleAchievementState(changed,1795251723456);
 assert.deepEqual(once,{complete:true,current:12.5,completed:[1795251723n,456000000]});
});

test('collection-like achievement cards use one click, a separate date popup, and do not fabricate missing records',()=>{
 for(const mark of [
   'class="category-grid achievement-category-grid"',
   'class="category-card achievement-category-card"',
   'class="item-grid achievement-grid achievement-item-grid"',
   'class="item-tile achievement-tile"',
   'class="item-toggle achievement-toggle"',
   'class="date-button achievement-dialog-button"',
   'if(item.row)void quickToggleAchievement(item.row)',
   'if(item.row)void openAchievement(item.row',
   'disabled={busy||!item.row}',
   'toggleAchievementState(live.value,Date.now())',
   'changeAchievement(live.guid,live.value,next)',
   'await persistDraft()',
   'bind:this={achievementDialogEl}',
   'bind:value={achievementDate}',
   'bind:value={achievementProgress}',
   'class="achievement-modal-advanced"',
   'class="achievement-modal-source"',
   'compactCopy.scope'
 ])assert.ok(app.includes(mark),mark);
 assert.ok(!app.includes('class="achievement-card"'));
 assert.ok(!app.includes('achievementComplete=row.value.complete'));
 assert.ok(!app.includes('class="achievement-check"'));
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
  for(const key of ['unlock','relock','date','details','advanced','source','scope']){
   assert.equal(typeof data[key],'string');
   assert.ok(data[key].trim(),locale+' '+key);
  }
 }
 assert.equal(copy.compactAchievementCopy('ja').unlock,'達成済みにする');
 assert.equal(copy.compactAchievementCopy('fr-CA').date,copy.compactAchievementCopy('fr').date);
});

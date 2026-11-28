import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

async function imported(path){
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
}
const copy=await imported('../src/achievement-compact-ui.ts');
const core=readFileSync(new URL('../core/src/achievement.rs',import.meta.url),'utf8');
const wasm=readFileSync(new URL('../wasm/src/lib.rs',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');

test('one-click state, source goal and original timestamp are planned in Rust, not TS',()=>{
 assert.match(core,/pub fn plan_toggle_v301\(/);
 assert.match(core,/crate::achievement_keys::progress_goal_v301\(guid\)/);
 assert.match(core,/completed:Some\(\(now_ms\/1000,\(now_ms%1000\) as u32\*1_000_000\)\)/);
 assert.match(wasm,/pub extern "C" fn hkia_achievement_toggle_plan\(/);
 assert.match(wasm,/if version!="3\.0\.0"&&version!="3\.0\.1"\{return 1\}/);
 assert.doesNotMatch(app,/from '.\/achievement-quick'/);
});

test('revocation and missing-source handling are Rust-defined, existing CAS and Undo remain native',()=>{
 assert.match(core,/before\.current\.min\(goal-1\.0\)/);
 assert.match(core,/let goal=crate::achievement_keys::progress_goal_v301\(guid\)\.ok_or\(Error::Schema\)\?/);
 assert.match(wasm,/e\.achievement_value\(guid\)/);
 assert.match(wasm,/a\.reply=bytes;0/);
 assert.match(app,/planAchievementToggle\(guid,Date\.now\(\)\)/);
 assert.match(app,/editAchievementAuto\(guid,live\?\.value\?\?null,next\)/);
});

test('collection-like achievement cards create source-defined absent records on user click and keep a separate date popup',()=>{
 for(const mark of [
   'class="category-grid achievement-category-grid"',
   'class="category-card achievement-category-card"',
   'class="item-grid achievement-grid achievement-item-grid editor-virtual-grid"',
   'class="item-tile achievement-tile"',
   'class="item-toggle achievement-toggle"',
   'class="date-button achievement-dialog-button"',
   'onclick={e=>void quickToggleAchievement(item,e.currentTarget,title)}',
   'if(item.row)void openAchievement(item.row',
   'disabled={busy||(!item.row&&(snapshot.version',
   'planAchievementToggle(guid,Date.now())',
   'editAchievementAuto(guid,live?.value??null,next)',
   'await persistDraft()',
   'bind:this={achievementDialogEl}',
   'bind:value={achievementDate}',
   'if(busy||!row.value.complete)return;'
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

test('source progress order stays native while nonactionable facts and incomplete popups are absent',()=>{
 assert.match(app,/nativeAchievementOrder\(achievementGroupHierarchy,sourceAchievementRows,achievementFacts\)/);
 assert.match(app,/groupRows\(achievementGroupHierarchy,achievementGroupSelection,sourceAchievementRows,achievementFacts\)/);
 assert.match(app,/\{#if item\.row\?\.value\.complete\}[\s\S]*?class="date-button achievement-dialog-button"/);
 assert.doesNotMatch(app,/achievement-fact-list|achievement-modal-source|factCopy\.|achievement-modal-scope/);
 assert.doesNotMatch(app,/class="data-note achievement-info-note"/);
 assert.doesNotMatch(app,/item\.row\.value\.complete\?'◷':'⋯'/);
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

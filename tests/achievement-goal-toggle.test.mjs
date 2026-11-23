import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const facts=JSON.parse(read('../public/achievement-facts-index.json'));
const groups=JSON.parse(read('../public/achievement-groups.json'));
const rootIds=new Set(groups.groups.map(([guid])=>guid));

const keys=read('../core/src/achievement_keys.rs');
const guidsMatch=keys.match(/const V301:\[\[u32;4\];820\]=\[\n([\s\S]*?)\n\];/);
const goalsMatch=keys.match(/const SOURCE_GOALS_V301:\[u32;820\]=\[\n([\s\S]*?)\n\];/);
assert.ok(guidsMatch&&goalsMatch,'native source achievements and thresholds must exist');
const words=[...guidsMatch[1].matchAll(/^\s*\[(\d+),(\d+),(\d+),(\d+)\],?$/gm)]
 .map(x=>x.slice(1).map(Number).map(n=>n.toString(16).padStart(8,'0')).join(':'));
const goalNumbers=goalsMatch[1].match(/\d+/g).map(Number);
const gameFacts=new Map(facts.records.map(([guid,,,,goal])=>[guid,goal]));
const childCounts=new Map(groups.groups.map(([guid,children])=>[guid,children.length]));

test('Rust-owned goal table matches all 820 Steam v3.0.1 native achievement thresholds',()=>{
 assert.equal(words.length,820);
 assert.equal(new Set(words).size,820);
 assert.equal(goalNumbers.length,820);
 assert.equal(gameFacts.size,820);
 for(let i=0;i<820;i++){
  const guid=words[i];
  assert.equal(goalNumbers[i],gameFacts.get(guid),'native Rust goal must match game source '+guid);
  assert.ok(Number.isSafeInteger(goalNumbers[i])&&goalNumbers[i]>0);
 }
});

test('63 native category goals override source sentinel by exact verified direct child counts',()=>{
 assert.equal(childCounts.size,63);
 assert.equal([...childCounts.values()].reduce((n,x)=>n+x,0),757);
 for(const [guid,count] of childCounts){
  assert.equal(gameFacts.get(guid),1,'native category threshold remains a source sentinel');
  assert.ok(count>0);
 }
 const rust=read('../core/src/achievement_keys.rs');
 assert.match(rust,/parent_size_v301\(guid\)\.unwrap_or\(SOURCE_GOALS_V301\[index\]/);
 assert.match(rust,/pub fn progress_goal_v301\(/);
});

test('click state is planned only by Rust/WASM, then applied through native CAS',()=>{
 const app=read('../src/App.svelte');
 const core=read('../core/src/achievement.rs');
 const worker=read('../src/editor.worker.ts');
 const wasm=read('../wasm/src/lib.rs');
 assert.match(core,/pub fn plan_toggle_v301\(/);
 assert.match(core,/let goal=crate::achievement_keys::progress_goal_v301\(guid\)/);
 assert.match(wasm,/pub extern "C" fn hkia_achievement_toggle_plan\(/);
 assert.match(worker,/case 'achievement-plan-toggle'/);
 assert.match(app,/planAchievementToggle\(guid,Date\.now\(\)\)/);
 assert.doesNotMatch(app,/toggleAchievementState\(|from '.\/achievement-quick'/);
 assert.match(app,/changeAchievementWithParent\(live,next\)/);
 assert.match(app,/createAchievementWithParent\(guid,next,parent\)/);
});

test('achievement detail popup no longer accepts arbitrary progress or changes it while editing a date',()=>{
 const app=read('../src/App.svelte');
 const ui=read('../src/achievement-compact-ui.ts');
 assert.doesNotMatch(app,/bind:value=\{achievementProgress\}|let achievementProgress=|inputmode="decimal"/);
 assert.doesNotMatch(ui,/進捗を調整|Adjust saved progress|Edit progress and date/);
 assert.match(app,/const next:AchievementValue=\{complete:selected\.value\.complete,current:selected\.value\.current,completed\}/);
 assert.match(app,/planAchievementToggle\(guid,Date\.now\(\)\)/);
 assert.match(app,/achievementProgressTarget\(/);
 assert.match(app,/\{#if facts\}\s*<details class="achievement-modal-source">/);
 assert.match(app,/linkedCounter\?linkedCounter\.current\.toLocaleString/);
 assert.match(app,/factCopy\.receiptUnverified/);
 assert.match(app,/editAchievementAuto\(guid,live\?\.value\?\?null,next\)/);
});

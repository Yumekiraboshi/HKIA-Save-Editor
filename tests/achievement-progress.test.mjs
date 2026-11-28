import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const [i,f,g]=['../public/achievement-index.json','../public/achievement-facts-index.json',
 '../public/achievement-groups.json'].map(p=>JSON.parse(read(p)));
const lookup=new Map(i.records.map(([guid,key])=>[guid,key]));
const facts=new Map(f.records.map(([guid,,,,threshold])=>[guid,threshold]));
const keys=read('../core/src/achievement_keys.rs');
const guidString=words=>words.map(w=>w.toString(16).padStart(8,'0')).join(':');
const sourceGuidList=keys.match(/const V301:\[\[u32;4\];820\]=\[([\s\S]*?)\];/)?.[1]
 .matchAll(/^ \[(\d+),(\d+),(\d+),(\d+)\],$/gm);
const sourceGuids=[...sourceGuidList].map(m=>guidString(m.slice(1).map(Number)));
const originalGoals=keys.match(/const SOURCE_GOALS_V301:\[u32;820\]=\[([\s\S]*?)\];/)?.[1]
 .match(/\d+/g).map(Number);
const nativeParents=[...keys.match(/const PARENT_SIZES:\[\(\[u32;4\],usize\);63\]=\[([\s\S]*?)\];/)?.[1]
 .matchAll(/^ \(\[(\d+),(\d+),(\d+),(\d+)\],(\d+)\),$/gm)]
 .map(m=>[guidString(m.slice(1,5).map(Number)),Number(m[5])]);
const parentCounts=new Map(nativeParents);
const actualGoals=new Map(sourceGuids.map((guid,j)=>[guid,parentCounts.get(guid)??originalGoals[j]]));
const app=read('../src/App.svelte');
const css=read('../src/style.css');

test('all 820 Rust-source-native display goals match the verified v3.0.1 source thresholds',()=>{
 assert.equal(sourceGuids.length,820);
 assert.equal(originalGoals.length,820);
 assert.equal(parentCounts.size,63);
 assert.equal(actualGoals.size,820);
 assert.equal(facts.size,820);
 for(const guid of sourceGuids){
  const got=actualGoals.get(guid);
  const expected=parentCounts.get(guid)??facts.get(guid);
  assert.equal(got,expected,guid);
  assert.ok(Number.isSafeInteger(got)&&got>0&&got<=1_000_000);
 }
 assert.equal(sourceGuids[0]!==sourceGuids.at(-1),true);
 for(let j=1;j<sourceGuids.length;j++)assert.ok(sourceGuids[j-1]<sourceGuids[j]);
});

test('all 63 native category goals use exact direct-child counts, not the source sentinel threshold 1',()=>{
 const explorer=g.groups.find(([guid])=>lookup.get(guid)==='collection_explorer');
 assert.ok(explorer);
 assert.equal(explorer[1].length,19);
 assert.equal(facts.get(explorer[0]),1);
 assert.equal(actualGoals.get(explorer[0]),19);
 for(const [guid,children] of g.groups){
  assert.equal(facts.get(guid),1);
  assert.equal(parentCounts.get(guid),children.length);
  assert.equal(actualGoals.get(guid),children.length);
 }
 assert.equal(g.groups.reduce((n,[,children])=>n+children.length,0),757);
});

test('757 leaf achievements display the exact native source goals, including multi-step and single-step',()=>{
 const categories=new Set(g.groups.map(([guid])=>guid));
 const leaves=f.records.filter(([guid])=>!categories.has(guid));
 assert.equal(leaves.length,757);
 for(const [guid,,,,sourceGoal] of leaves)
  assert.equal(actualGoals.get(guid),sourceGoal,guid);
 assert.equal(actualGoals.get('00000000:00000000:00000000:00000000'),undefined);
});

test('progress footers render Rust/WASM snapshot goals, not TypeScript game-specific progress planning',()=>{
 assert.match(keys,/pub fn source_progress_goals_v301\(/);
 assert.match(read('../core/src/collection.rs'),/pub fn source_achievement_progress_goals\(/);
 assert.match(read('../wasm/src/lib.rs'),/pub extern "C" fn hkia_achievement_goals_snapshot\(/);
 assert.match(read('../src/editor.worker.ts'),/e\.hkia_achievement_goals_snapshot\(\)/);
 assert.match(read('../src/editor.worker.ts'),/version==='3\.0\.1'\?goalCount!==820:goalCount!==0/);
 assert.match(read('../src/worker-client.ts'),/achievementGoals:Array<\[string,number\]>/);
 assert.match(app,/const achievementGoalsByGuid=\$derived\(new Map\(/);
 assert.match(app,/\{@const progressGoal=achievementGoalsByGuid\.get\(item\.guid\)\?\?null\}/);
 assert.match(app,/class="item-status achievement-compact-status"/);
 assert.match(app,/\{achCopy\.progress\}: \{\(item\.row\?\.value\.current\?\?0\)\.toLocaleString\(locale\)\} \/ \{progressGoal\.toLocaleString\(locale\)\}/);
 assert.equal(existsSync(new URL('../src/achievement-progress.ts',import.meta.url)),false);
 const content=app.slice(app.indexOf('class="item-grid achievement-grid achievement-item-grid editor-virtual-grid"'),app.indexOf('<dialog class="achievement-dialog"'));
 assert.doesNotMatch(content,/achievement-compact-progress|\{achCopy\.incomplete\}[\s\S]*<span class="achievement-compact-progress"/);
 assert.match(content,/\{#if item\.row\?\.value\.complete\}/);
 assert.match(content,/\{\(item\.row\?\.value\.current\?\?0\)\.toLocaleString\(locale\)\}/);
});

test('completed, incomplete, and missing achievement cards keep fixed desktop and mobile heights',()=>{
 assert.match(css,/\.achievement-tile\{height:224px;min-height:224px\}/);
 assert.match(css,/\.achievement-toggle\{height:100%;min-height:0\}/);
 assert.match(css,/\.achievement-compact-status\{display:block;width:100%;min-height:17px/);
 assert.match(css,/@media\(max-width:730px\)\{\s*\.achievement-item-grid[\s\S]*?\.achievement-tile\{height:211px;min-height:211px\}/);
 assert.doesNotMatch(css,/\.achievement-compact-progress\{font-size/);
});

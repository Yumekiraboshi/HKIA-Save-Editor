import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const {outputFiles}=await build({
 entryPoints:[fileURLToPath(new URL('../src/achievement-quick.ts',import.meta.url))],
 bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'
});
const {toggleAchievementState}=await import(
 'data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64')
);
const facts=JSON.parse(read('../public/achievement-facts-index.json'));
const groups=JSON.parse(read('../public/achievement-groups.json'));
const rootIds=new Set(groups.groups.map(([guid])=>guid));

test('all 757 game-defined individual goals produce bounded, correctly toggled complete/incomplete states',()=>{
 let checked=0;
 for(const [guid,,,,threshold] of facts.records){
  if(rootIds.has(guid))continue;
  assert.ok(Number.isSafeInteger(threshold)&&threshold>0);
  const originallyIncomplete={complete:false,current:threshold+100,completed:null};
  const complete=toggleAchievementState(originallyIncomplete,1795251723456,threshold);
  assert.equal(complete.complete,true,guid);
  assert.equal(complete.current,threshold,guid);
  assert.deepEqual(complete.completed,[1795251723n,456000000],guid);
  const reverted=toggleAchievementState(complete,1795251723999,threshold);
  assert.equal(reverted.complete,false,guid);
  assert.equal(reverted.current,threshold-1,guid);
  assert.equal(reverted.completed,null,guid);
  assert.equal(originallyIncomplete.current,threshold+100,'original state is not mutated');
  checked++;
 }
 assert.equal(checked,757);
});

test('all 63 category goals are their number of children, not the native sentinel threshold',()=>{
 const source=new Map(facts.records.map(([guid,,,,threshold])=>[guid,threshold]));
 let checked=0;
 for(const [guid,children] of groups.groups){
  assert.equal(source.get(guid),1,'game counter sentinel must not replace child count');
  const total=children.length;
  const next=toggleAchievementState({complete:false,current:0,completed:null},1795251723456,total);
  assert.equal(next.current,total);
  assert.equal(next.complete,true);
  assert.equal(toggleAchievementState(next,1795251723466,total).current,total-1);
  checked++;
 }
 assert.equal(checked,63);
});

test('achievement detail popup no longer accepts arbitrary progress or changes it while editing a date',()=>{
 const app=read('../src/App.svelte');
 const ui=read('../src/achievement-compact-ui.ts');
 assert.doesNotMatch(app,/bind:value=\{achievementProgress\}|let achievementProgress=|inputmode="decimal"/);
 assert.doesNotMatch(ui,/進捗を調整|Adjust saved progress|Edit progress and date/);
 assert.match(app,/const next:AchievementValue=\{complete:selected\.value\.complete,current:selected\.value\.current,completed\}/);
 assert.match(app,/toggleAchievementState\(live\.value,Date\.now\(\),target\)/);
 assert.match(app,/achievementProgressTarget\(/);
 assert.match(app,/\{#if facts\}\s*<details class="achievement-modal-source">/);
 assert.match(app,/linkedCounter\?linkedCounter\.current\.toLocaleString/);
 assert.match(app,/factCopy\.receiptUnverified/);
 assert.match(app,/planCategoryParentCompletion\(/);
});

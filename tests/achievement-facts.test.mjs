import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const indexData=JSON.parse(read('../public/achievement-index.json'));
const factsData=JSON.parse(read('../public/achievement-facts-index.json'));
const index=new Map(indexData.records.map(([guid,key,titleId])=>[guid,{key,titleId}]));
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/achievement-facts.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const facts=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const labelsTs=read('../src/achievement-facts-ui.ts');
const labelsJs=await import('data:text/javascript;base64,'+Buffer.from((await build({entryPoints:[fileURLToPath(new URL('../src/achievement-facts-ui.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'})).outputFiles[0].text).toString('base64'));

test('all 820 verified achievement definitions have source-pinned counter links, thresholds and reward quantities',()=>{
 const decoded=facts.decodeAchievementFacts(factsData,index);
 assert.equal(decoded.size,820);
 assert.equal([...decoded.values()].filter(x=>x.descriptionId!==null).length,720);
 assert.equal([...decoded.values()].filter(x=>x.rewardQuantity>0).length,264);
 assert.equal([...decoded.values()].filter(x=>x.groupCondition).length,63);
 assert.equal([...decoded.values()].filter(x=>x.hasDlcCondition).length,24);
 assert.equal(new Set([...decoded.values()].map(x=>x.counterGuid)).size,820);
 assert.equal(decoded.get('691edeb3:f7434408:97075486:697c5327').threshold,100);
 const reward=decoded.get('691edeb3:f7434408:97075486:697c5327');
 assert.equal(reward.rewardId,269627780);
 assert.equal(reward.rewardQuantity,3);
 assert.equal(reward.rewardKey,'item_gen_dyepouch_violet');
 const sample=decoded.get('5cc234d0:46449dfc:b85b6a92:eb03d8ee');
 assert.equal(sample.descriptionId,'385633684623974401');
 assert.equal(sample.rewardQuantity,0);
 assert.equal(sample.rewardId,null);
});

test('malformed, duplicated, fabricated or mismatched source links are rejected',()=>{
 const good=facts.decodeAchievementFacts(factsData,index);
 assert.equal(good.size,820);
 const duplicate=structuredClone(factsData);duplicate.records[1][0]=duplicate.records[0][0];
 assert.throws(()=>facts.decodeAchievementFacts(duplicate,index),/ACH_FACTS_INVALID/);
 const counter=structuredClone(factsData);counter.records[1][2]=counter.records[0][2];
 assert.throws(()=>facts.decodeAchievementFacts(counter,index),/ACH_FACTS_INVALID/);
 const corrupt=structuredClone(factsData);corrupt.records[0][7]=5;
 assert.throws(()=>facts.decodeAchievementFacts(corrupt,index),/ACH_FACTS_INVALID/);
 const removed=structuredClone(factsData);removed.records.pop();
 assert.throws(()=>facts.decodeAchievementFacts(removed,index),/ACH_FACTS_INVALID/);
});

test('counter records are read-only observations: missing remains unknown and no completion is inferred',()=>{
 const x=facts.decodeAchievementFacts(factsData,index).get('691edeb3:f7434408:97075486:697c5327');
 assert.deepEqual(facts.describeSourceProgress(x,null),{state:'absent',value:null,threshold:100,derivedCompletion:false});
 const source={guid:[0,0,0,1],current:125,countedValues:null,countedGuids:0};
 assert.deepEqual(facts.describeSourceProgress(x,source),{state:'recorded',value:125,threshold:100,derivedCompletion:false});
 assert.equal(facts.counterIndex([source]).size,1);
 assert.throws(()=>facts.counterIndex([source,source]),/COUNTER_DUPLICATE/);
 assert.match(read('../core/src/collection.rs'),/pub fn counters\(&self\)/);
 assert.match(read('../wasm/src/lib.rs'),/hkia_counter_snapshot/);
 assert.match(read('../src/editor.worker.ts'),/hkia_counter_snapshot\(\)/);
 assert.doesNotMatch(read('../src/editor.worker.ts'),/hkia_counter_change|set_counter_state/);
});

test('all 16 languages have non-claim condition and reward notices',()=>{
 const langs=['ar','de','en','en-GB','es','fr','fr-CA','it','ja','ko','nl','pt-BR','ru','tr','zh-Hans','zh-Hant'];
 for(const locale of langs){
  const copy=labelsJs.achievementFactsCopy(locale);
  for(const key of ['condition','threshold','savedCounter','noCounter','counterKind','reward','noReward','receiptUnverified','dlc','group','descriptionUnavailable'])
   assert.ok(typeof copy[key]==='string'&&copy[key].trim(),locale+': '+key);
 }
 assert.match(labelsTs,/未確認/);
 const app=read('../src/App.svelte');
 assert.match(app,/achievementFacts\.get\(achievementGuid\(editingAchievement\.guid\)\)/);
 assert.match(app,/gameCounters\.get\(facts\.counterGuid\)/);
 assert.match(app,/factCopy\.receiptUnverified/);
 assert.match(app,/facts\.groupCondition/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

async function load(path){
 const source=readFileSync(new URL(path,import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 return import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
}
const draft=await load('../src/achievement-draft.ts');
const labels=await load('../src/achievement-ui.ts');
const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/editor.worker.ts',import.meta.url),'utf8');
const wasm=readFileSync(new URL('../wasm/src/lib.rs',import.meta.url),'utf8');

test('sixteen game locales have readable achievement controls',()=>{
 const locales=['ar','de','en','en-GB','es','fr','fr-CA','it','ja','ko','nl','pt-BR','ru','tr','zh-Hans','zh-Hant'];
 for(const locale of locales){
  const t=labels.achievementCopy(locale);
  for(const key of ['title','completed','incomplete','missing','progress','completedAt','edit','save','unknown','notice','invalid'])
   assert.ok(typeof t[key]==='string'&&t[key].trim(),locale+' '+key);
 }
 assert.equal(labels.achievementCopy('ja').title,'アチーブメント');
 assert.equal(labels.achievementCopy('fr-CA').title,'Succès');
});

test('achievement drafts retain exact GUID and 100ns timestamp through recovery',()=>{
 const guid=[1,2,3,4],before={complete:false,current:1.5,completed:null};
 const after={complete:true,current:2.5,completed:[1750000000n,123456700]};
 const original=[{guid,value:before}],now=[{guid,value:after}];
 const edits=draft.diffAchievements(original,now);
 assert.deepEqual(edits,[{guid,before:{complete:false,current:1.5,completed:null},after:{complete:true,current:2.5,completed:['1750000000',123456700]}}]);
 const restored=draft.decodeAchievementDraft(edits,original);
 assert.deepEqual(restored,[{guid,before,after}]);
 assert.deepEqual(draft.diffAchievements(original,original),[]);
 assert.throws(()=>draft.decodeAchievementDraft([edits[0],edits[0]],original),/DRAFT_CONFLICT/);
 assert.throws(()=>draft.decodeAchievementDraft([{...edits[0],guid:[9,9,9,9]}],original),/DRAFT_CONFLICT/);
 assert.throws(()=>draft.decodeAchievementDraft([{...edits[0],after:{...edits[0].after,completed:['1750000000',123456789]}}],original),/DRAFT_INVALID/);
});

test('achievement tab supports mutations without exposing native GUIDs',()=>{
 for(const mark of ['achievementRows','achievementLoadMoreSentinel','openAchievement(','saveAchievement(','diffAchievements(','decodeAchievementDraft(','changeAchievement(','achievement-grid'])
  assert.ok(app.includes(mark),mark);
 assert.doesNotMatch(app,/achievementFilter/);
 assert.match(wasm,/hkia_achievement_snapshot/);
 assert.match(wasm,/hkia_achievement_change/);
 assert.match(worker,/100000\|\|a\.length!==4\+total\*34/);
 assert.doesNotMatch(app,/\{item\.row\.guid\}/);
});

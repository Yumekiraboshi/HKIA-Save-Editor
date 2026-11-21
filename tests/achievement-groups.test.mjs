import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const raw=readFileSync(new URL('../public/achievement-groups.json',import.meta.url),'utf8');
const data=JSON.parse(raw);
const keySource=JSON.parse(readFileSync(new URL('../public/achievement-index.json',import.meta.url),'utf8'));
const index=new Map(keySource.records.map(([guid,key,titleId])=>[guid,{key,titleId}]));
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/achievement-groups.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const groups=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const labelBuild=await build({entryPoints:[fileURLToPath(new URL('../src/achievement-group-ui.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const labels=await import('data:text/javascript;base64,'+Buffer.from(labelBuild.outputFiles[0].text).toString('base64'));
const saved=(guid,complete)=>({guid:guid.split(':').map(n=>parseInt(n,16)),value:{complete,current:complete?1:0,completed:null}});
const sourceRows=keySource.records.map(([guid],i)=>({guid,row:null,index:i+1}));

test('root counter defines 63 categories and exactly 757 child achievements with zero deeper groups',()=>{
 const hierarchy=groups.decodeAchievementGroups(data,index);
 assert.equal(hierarchy.groups.length,63);
 assert.equal(hierarchy.byGuid.size,63);
 assert.equal(hierarchy.owner.size,757);
 assert.equal(hierarchy.groups.reduce((n,g)=>n+g.children.length,0),757);
 const known=new Set([...hierarchy.byGuid.keys(),...hierarchy.owner.keys()]);
 assert.equal(known.size,820);
 assert.deepEqual(known,new Set(index.keys()));
 assert.equal([...hierarchy.owner.keys()].filter(guid=>hierarchy.byGuid.has(guid)).length,0);
 const root=hierarchy.groups.map(group=>index.get(group.guid).key);
 assert.equal(root[0],'collection_islandMystery');
 assert.equal(root[11],'collection_puzzle');
 assert.equal(root.length,63);
});

test('group view includes category achievement itself plus source-ordered leaf records',()=>{
 const hierarchy=groups.decodeAchievementGroups(data,index);
 const target=hierarchy.groups[11];
 const rows=groups.groupRows(hierarchy,target.guid,sourceRows);
 assert.equal(rows.length,1+target.children.length);
 assert.equal(rows[0].guid,target.guid);
 assert.deepEqual(rows.slice(1).map(x=>x.guid),target.children);
 assert.equal(groups.ungroupedRows(hierarchy,sourceRows).length,0);
 const unknown={guid:'ffffffff:ffffffff:ffffffff:ffffffff',row:saved('ffffffff:ffffffff:ffffffff:ffffffff',false),index:821};
 assert.deepEqual(groups.ungroupedRows(hierarchy,[...sourceRows,unknown]),[unknown]);
 assert.deepEqual(groups.groupRows(hierarchy,'ffffffff:ffffffff:ffffffff:ffffffff',sourceRows),[]);
});

test('category card counts saved leaf values only; missing remains unknown, parent status separate',()=>{
 const hierarchy=groups.decodeAchievementGroups(data,index);
 const category=hierarchy.groups[0];
 const rows=sourceRows.map(r=>({...r}));
 const byGuid=new Map(rows.map(x=>[x.guid,x]));
 byGuid.get(category.guid).row=saved(category.guid,true);
 byGuid.get(category.children[0]).row=saved(category.children[0],true);
 byGuid.get(category.children[1]).row=saved(category.children[1],false);
 const summary=groups.groupSummaries(hierarchy,rows)[0];
 assert.deepEqual(summary,{guid:category.guid,total:category.children.length,recorded:2,completed:1,missing:category.children.length-2,parentComplete:true});
 const missing=groups.groupSummaries(hierarchy,sourceRows)[0];
 assert.equal(missing.parentComplete,null);
 assert.equal(missing.completed,0);
 assert.equal(missing.missing,category.children.length);
});

test('invalid crosswalks, group recursion and missing leaves fail closed',()=>{
 const good=groups.decodeAchievementGroups(data,index);
 assert.equal(good.groups.length,63);
 const duplicate=structuredClone(data);
 duplicate.groups[1][1][0]=duplicate.groups[0][1][0];
 assert.throws(()=>groups.decodeAchievementGroups(duplicate,index),/ACH_GROUPS_INVALID/);
 const cycle=structuredClone(data);
 cycle.groups[0][1][0]=cycle.groups[1][0];
 assert.throws(()=>groups.decodeAchievementGroups(cycle,index),/ACH_GROUPS_CYCLE/);
 const dropped=structuredClone(data);
 dropped.groups[0][1].pop();
 assert.throws(()=>groups.decodeAchievementGroups(dropped,index),/ACH_GROUPS_INCOMPLETE/);
 const forged=structuredClone(data);
 forged.groups[0][0]='ffffffff:ffffffff:ffffffff:ffffffff';
 assert.throws(()=>groups.decodeAchievementGroups(forged,index),/ACH_GROUPS_INVALID/);
});

test('group category navigation retains save search/status filters and is localized for all sixteen locales',()=>{
 const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 for(const token of [
  'loadAchievementGroups(','summarizeAchievementGroups(','showAchievementGroup(',
  'achievementGroupHierarchy && achievementGroupSelection===null',
  "achievementGroupSelection==='__unmapped'",'groupRows(','ungroupedRows(',
  'achievementQuery.trim()','achievementFilter===','achievementName(stat.guid,0)',
  'if(item.row)void openAchievement(item.row'
 ])assert.ok(app.includes(token),token);
 const all=['ar','de','en','en-GB','es','fr','fr-CA','it','ja','ko','nl','pt-BR','ru','tr','zh-Hans','zh-Hant'];
 for(const locale of all){
  const copy=labels.achievementGroupCopy(locale);
  for(const key of ['categories','back','showAll','uncategorized','groupRecord','memberCount','savedMembers','groupNote'])
   assert.ok(typeof copy[key]==='string'&&copy[key].trim(),locale+' '+key);
 }
 assert.equal(labels.achievementGroupCopy('ja').categories,'実績カテゴリー');
});

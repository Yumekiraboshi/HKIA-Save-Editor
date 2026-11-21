import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const raw=readFileSync(new URL('../public/achievement-groups.json',import.meta.url),'utf8');
const data=JSON.parse(raw);
const keySource=JSON.parse(readFileSync(new URL('../public/achievement-index.json',import.meta.url),'utf8'));
const factsData=JSON.parse(readFileSync(new URL('../public/achievement-facts-index.json',import.meta.url),'utf8'));
const sourceOrder=new Map(factsData.records.map(([guid,desc,counter,kind,threshold,rewardId,rewardKey,rewardQty,dlc,type,order])=>[guid,{order}]));
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

test('group view contains only source-ordered children; the category parent is not a tile',()=>{
 const hierarchy=groups.decodeAchievementGroups(data,index);
 const target=hierarchy.groups[11];
 const rows=groups.groupRows(hierarchy,target.guid,sourceRows);
 assert.equal(rows.length,target.children.length);
 assert.equal(rows[0].guid,target.children[0]);
 assert.deepEqual(rows.map(x=>x.guid),target.children);
 assert.ok(rows.every(x=>x.guid!==target.guid));
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

test('group category navigation retains name search, omits redundant achievement status filters, and is localized for all sixteen locales',()=>{
 const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 for(const token of [
  'loadAchievementGroups(','summarizeAchievementGroups(','showAchievementGroup(',
  'achievementGroupHierarchy && achievementGroupSelection===null',
  "achievementGroupSelection==='__unmapped'",'groupRows(','ungroupedRows(',
  'achievementQuery.trim()','achievementName(stat.guid,0)',
  'if(item.row)void openAchievement(item.row'
 ])assert.ok(app.includes(token),token);
 assert.doesNotMatch(app,/achievementFilter|showEveryAchievement/);
 assert.match(app,/bind:this=\{achievementLoadMoreSentinel\}/);
 const all=['ar','de','en','en-GB','es','fr','fr-CA','it','ja','ko','nl','pt-BR','ru','tr','zh-Hans','zh-Hant'];
 for(const locale of all){
  const copy=labels.achievementGroupCopy(locale);
  for(const key of ['categories','back','showAll','uncategorized','groupRecord','memberCount','savedMembers','groupNote'])
   assert.ok(typeof copy[key]==='string'&&copy[key].trim(),locale+' '+key);
 }
 assert.equal(labels.achievementGroupCopy('ja').categories,'実績カテゴリー');
});

test('game source field Order defines individual progression, not localized/alphabetic title order',()=>{
 const hierarchy=groups.decodeAchievementGroups(data,index);
 const leaf=hierarchy.groups.flatMap(g=>g.children);
 assert.equal(leaf.length,757);
 const allOrders=leaf.map(guid=>sourceOrder.get(guid).order);
 assert.equal(allOrders.filter(n=>n>0).length,757);
 assert.equal(Math.min(...allOrders),1);
 assert.equal(Math.max(...allOrders),756);
 assert.equal(allOrders.filter(n=>n===42).length,2);
 assert.equal([...sourceOrder.values()].filter(x=>x.order===0).length,63);
 // The game-native order isn't a locale-dependent alphabetical order.
 const first=hierarchy.groups[0];
 assert.deepEqual(first.children.slice(0,3).map(guid=>index.get(guid).key),[
  'achievement_happyLanding','achievement_dinosaursNotIncluded','achievement_bogChamp'
 ]);
 const ordered=groups.groupRows(hierarchy,first.guid,sourceRows,sourceOrder);
 assert.deepEqual(ordered.map(x=>sourceOrder.get(x.guid).order),[1,2,3,4,5,6,7,8,9,10,11,12]);
});

test('all-achievements search and group drill-down follow game category and progress order, not GUID index',()=>{
 const hierarchy=groups.decodeAchievementGroups(data,index);
 const ordered=groups.nativeAchievementOrder(hierarchy,sourceRows,sourceOrder);
 assert.equal(ordered.length,757);
 assert.equal(new Set(ordered.map(x=>x.guid)).size,757);
 assert.deepEqual(ordered.slice(0,3).map(x=>index.get(x.guid).key),[
  'achievement_happyLanding','achievement_dinosaursNotIncluded','achievement_bogChamp'
 ]);
 assert.equal(ordered[12].guid,hierarchy.groups[1].children[0]);
 assert.ok(ordered.every(x=>!hierarchy.byGuid.has(x.guid)));
 // Native category order is deliberately distinct from a global numeric Order sort.
 assert.equal(index.get(hierarchy.groups[1].guid).key,'collection_explorer');
 assert.equal(index.get(hierarchy.groups[2].guid).key,'collection_friendForever');
 assert.equal(sourceOrder.get(hierarchy.groups[1].children[0]).order,22);
 assert.equal(sourceOrder.get(hierarchy.groups[2].children[0]).order,13);
 const extra={guid:'ffffffff:ffffffff:ffffffff:ffffffff',row:saved('ffffffff:ffffffff:ffffffff:ffffffff',false),index:821};
 const withExtra=groups.nativeAchievementOrder(hierarchy,[...sourceRows,extra],sourceOrder);
 assert.equal(withExtra.length,758);
 assert.equal(withExtra.at(-1),extra);
});

test('ranked children sort numerically and same-rank items use source reference order, not names',()=>{
 const hierarchy=groups.decodeAchievementGroups(data,index);
 const group=hierarchy.groups[0],guid=group.guid;
 const shuffled=new Map(sourceOrder);
 const [first,second,third]=group.children;
 shuffled.set(first,{order:999});shuffled.set(second,{order:2});shuffled.set(third,{order:2});
 const rows=groups.groupRows(hierarchy,guid,sourceRows,shuffled);
 assert.equal(rows[0].guid,second);
 assert.deepEqual(rows.slice(0,2).map(x=>x.guid),[second,third]);
 assert.equal(rows.at(-1).guid,first);
 // If the source Order metadata is not loaded, the verified references remain the fallback.
 assert.deepEqual(groups.groupRows(hierarchy,guid,sourceRows).map(x=>x.guid),group.children);
 assert.deepEqual(groups.nativeAchievementOrder(null,sourceRows,sourceOrder),sourceRows);
 const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 assert.match(app,/nativeAchievementOrder\(achievementGroupHierarchy,sourceAchievementRows,achievementFacts\)/);
 assert.match(app,/groupRows\(achievementGroupHierarchy,achievementGroupSelection,sourceAchievementRows,achievementFacts\)/);
});

test('all 63 saved category records are hidden from individual cards while remaining in source state',()=>{
 const hierarchy=groups.decodeAchievementGroups(data,index);
 const allRoots=new Set(hierarchy.groups.map(g=>g.guid));
 const groupTiles=hierarchy.groups.flatMap(g=>groups.groupRows(hierarchy,g.guid,sourceRows,sourceOrder));
 const allTiles=groups.nativeAchievementOrder(hierarchy,sourceRows,sourceOrder);
 assert.equal(groupTiles.length,757);
 assert.deepEqual(groupTiles.map(x=>x.guid),allTiles.map(x=>x.guid));
 assert.ok(allTiles.every(x=>!allRoots.has(x.guid)));
 assert.equal(sourceRows.length,820,'the underlying achievement source state remains unchanged');
 const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 assert.match(app,/class:is-recorded=\{stat\.parentComplete===true\}/);
 assert.match(app,/stat\.parentComplete===true\} · ✓/);
 assert.match(app,/sourceOrderedAchievementRows\.filter\(r=>r\.row\?\.value\.complete===true\)/);
 assert.doesNotMatch(app,/class:achievement-group-parent=/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
async function loadModule(path){
 const output=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
  bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
}
const [catalog,groups,individual,category,labels]=await Promise.all([
 loadModule('../src/achievement-catalog.ts'),loadModule('../src/achievement-groups.ts'),
 loadModule('../src/achievement-individual-icons.ts'),loadModule('../src/achievement-category-icons.ts'),
 loadModule('../src/achievement-ui.ts')
]);
const indexData=JSON.parse(read('../public/achievement-index.json'));
const groupData=JSON.parse(read('../public/achievement-groups.json'));
const indivData=JSON.parse(read('../public/achievement-individual-atlas.json'));
const categoryData=JSON.parse(read('../public/achievement-category-atlas.json'));
const index=new Map(indexData.records.map(([guid,key,titleId])=>[guid,{key,titleId}]));
const hierarchy=groups.decodeAchievementGroups(groupData,index);

test('gallery with no save keeps all 820 native definitions strictly read-only and UNKNOWN',()=>{
 const rows=catalog.joinAchievementCatalog(index,[]);
 assert.equal(rows.length,820);
 assert.equal(rows.filter(x=>x.row===null).length,820);
 assert.deepEqual(new Set(rows.map(x=>x.guid)),new Set(index.keys()));
 const native=groups.nativeAchievementOrder(hierarchy,rows);
 assert.equal(native.length,820);
 const summaries=groups.groupSummaries(hierarchy,rows);
 assert.equal(summaries.length,63);
 assert.equal(summaries.reduce((n,x)=>n+x.total,0),757);
 assert.ok(summaries.every(x=>x.completed===0&&x.recorded===0&&x.parentComplete===null));
});

test('gallery displays only exact 198 individual and 63 category original source icons',()=>{
 const indiv=individual.decodeAchievementIndividualAtlas(indivData,index,'/HKIA-Save-Editor/');
 const cat=category.decodeAchievementCategoryAtlas(categoryData,index,hierarchy,'/HKIA-Save-Editor/');
 const individualKeys=new Set(indiv.bySaveGuid.keys());
 const categoryKeys=new Set(cat.bySaveGuid.keys());
 assert.equal(individualKeys.size,198);
 assert.equal(categoryKeys.size,63);
 assert.equal([...individualKeys].filter(g=>categoryKeys.has(g)).length,0);
 assert.equal([...index.keys()].filter(g=>!individualKeys.has(g)&&!categoryKeys.has(g)).length,559);
});

test('public gallery has a no-save route, local file-open action, and cannot edit absent rows',()=>{
 const app=read('../src/App.svelte');
 const css=read('../src/style.css');
 assert.match(app,/\{#if !snapshot&&activeTool!=='achievements'\}/);
 assert.match(app,/activeTool='achievements';showAchievementGroup\(null\)/);
 assert.match(app,/\{#if snapshot\|\|activeTool==='achievements'\}<nav/);
 assert.match(app,/\{#if !snapshot\}[\s\S]*?class="achievement-gallery-notice"/);
 assert.match(app,/\{#if snapshot\}<span class="category-count"/);
 assert.match(app,/\{#if snapshot\}<div class="status-filter"/);
 assert.match(app,/class:achievement-preview-only=\{!snapshot\}/);
 assert.match(app,/disabled=\{busy\|\|!item.row\}/);
 assert.match(app,/if\(!snapshot\|\|busy\)return;/);
 assert.match(app,/onclick=\{askFile\}/);
 assert.match(css,/\.achievement-preview-only \.achievement-toggle:disabled\{opacity:1;cursor:default\}/);
 assert.match(app,/\{:else if art\}/);
 assert.match(app,/<span class="item-art-empty">✧<\/span>/);
});

test('browse action and no-save explanation are translated in all 16 game locales',()=>{
 const locales=['ar','de','en','en-GB','es','fr','fr-CA','it','ja','ko','nl','pt-BR','ru','tr','zh-Hans','zh-Hant'];
 for(const locale of locales){
  const copy=labels.achievementCopy(locale);
  assert.ok(copy.browse?.trim(),locale+' browse');
  assert.ok(copy.browseHint?.trim(),locale+' browseHint');
 }
 assert.match(labels.achievementCopy('ja').browse,/セーブなし/);
});

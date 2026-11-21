import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const catalog=JSON.parse(readFileSync(new URL('../public/catalog.json',import.meta.url),'utf8'));
const component=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
const i18nSource=readFileSync(new URL('../src/ui-copy.ts',import.meta.url),'utf8');
const langs=JSON.parse(i18nSource.split('export const messages=')[1].split(' as const;')[0]);
test('game taxonomy is complete and sorted',()=>{
 assert.equal(catalog.schema,'HKIA.CollectionDisplayCatalog.2');
 assert.equal(catalog.groups.length,25);
 const groupIds=new Set(catalog.groups.map(g=>g[0]));
 assert.equal(groupIds.size,25);
 for(let i=1;i<catalog.groups.length;i++)assert.ok(catalog.groups[i][4]>catalog.groups[i-1][4]);
 for(const group of catalog.groups){
  assert.ok(group[1].trim()&&group[2].trim()&&group[5].endsWith('.webp'));
  const icon=new URL('../public/icons/'+group[5],import.meta.url);
  assert.ok(existsSync(icon),'missing category icon '+group[5]);
  const bytes=readFileSync(icon);
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.toString('ascii',8,12),'WEBP');
 }
 for(const item of catalog.items)assert.ok(groupIds.has(item[3]));
});
test('source catalog IDs remain exact and unknown names use clearly marked placeholders',()=>{
 const ids=new Set;
 let matched=0,unknown=0;
 for(const item of catalog.items){
  assert.equal(item.length,8);
  assert.ok(Number.isInteger(item[7])&&item[7]>0);
  assert.ok(Number.isInteger(item[0])&&item[0]>0&&!ids.has(item[0]));
  ids.add(item[0]);
  assert.ok(typeof item[1]==='string'&&typeof item[2]==='string');
  if(item[5]&&item[6]){assert.ok(typeof item[5]==='string'&&typeof item[6]==='string');matched++}
  else{assert.equal(item[5],null);assert.equal(item[6],null);unknown++}
 }
 assert.ok(matched>8000);
 assert.ok(unknown>0);
 assert.doesNotMatch(component,/!nameFor\(item\)/);
 assert.match(component,/filterCollectionItems\(/);
 assert.match(component,/collectionDisplayName\(/);
 assert.doesNotMatch(component,/\{item\[0\]\}|\{item\[1\]\}|\{item\[2\]\}/);
});
test('header commands, local recovery, image tiles and continuous listing have real handlers',()=>{
 for(const symbol of ['openSave','exportSave','backup()','closeSave()','actHistory(','setLanguage(','setTheme(','persistDraft(', 'restoreSession(', 'loadIconPack(','selectCategory(','change(','fileInput?.click()'])assert.ok(component.includes(symbol),symbol);
 assert.ok(component.includes('const BATCH_SIZE=40'));
 assert.match(component,/category-grid/);
 assert.doesNotMatch(component,/raw\.githubusercontent\.com/);
 assert.match(component,/loadMoreSentinel/);
 assert.match(component,/aria-pressed=\{has\}/);
 assert.match(component,/\{#if snapshot\}<nav/);
 assert.match(component,/cat\.count\.toLocaleString/);
 assert.doesNotMatch(component,/page-control/);
});
test('Japanese and English editor copy have matching keys',()=>{
 assert.deepEqual(Object.keys(langs.ja).sort(),Object.keys(langs.en).sort());
 for(const [loc,values] of Object.entries(langs))for(const [key,value] of Object.entries(values))assert.ok(value.trim(),loc+':'+key);
});

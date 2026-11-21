import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
 }
 for(const item of catalog.items)assert.ok(groupIds.has(item[3]));
});
test('source IDs remain internal; only matched bilingual labels can be listed',()=>{
 const ids=new Set;
 let matched=0,unknown=0;
 for(const item of catalog.items){
  assert.equal(item.length,7);
  assert.ok(Number.isInteger(item[0])&&item[0]>0&&!ids.has(item[0]));
  ids.add(item[0]);
  assert.ok(typeof item[1]==='string'&&typeof item[2]==='string');
  if(item[5]&&item[6]){assert.ok(typeof item[5]==='string'&&typeof item[6]==='string');matched++}
  else{assert.equal(item[5],null);assert.equal(item[6],null);unknown++}
 }
 assert.ok(matched>8000);
 assert.ok(unknown>0);
 assert.match(component,/!item\[5\]\|\|!item\[6\]/);
 assert.match(component,/item\[5\]!\.toLocaleLowerCase\(\)/);
 assert.doesNotMatch(component,/\{item\[0\]\}|\{item\[1\]\}|\{item\[2\]\}/);
});
test('header commands and paging have real handlers',()=>{
 for(const symbol of ['openSave','exportSave','backup()','closeSave()','actHistory(','setLanguage(','setTheme(','jumpPage(','selectCategory(','change(','fileInput?.click()'])assert.ok(component.includes(symbol),symbol);
 assert.ok(component.includes('const PAGE_SIZE=24'));
 assert.match(component,/category-grid/);
 assert.match(component,/page-control/);
});
test('Japanese and English editor copy have matching keys',()=>{
 assert.deepEqual(Object.keys(langs.ja).sort(),Object.keys(langs.en).sort());
 for(const [loc,values] of Object.entries(langs))for(const [key,value] of Object.entries(values))assert.ok(value.trim(),loc+':'+key);
});

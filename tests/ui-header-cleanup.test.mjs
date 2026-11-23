import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const app=read('../src/App.svelte');
const css=read('../src/style.css');
const copy=read('../src/ui-copy.ts');
const html=read('../index.html');

test('achievement landing view contains only search and native category cards, not redundant headings or summary counts',()=>{
 const section=app.split("{:else if activeTool==='achievements'}")[1]?.split("{:else}\n   <div class=\"collection-controls collection-search-controls\">")[0];
 assert.ok(section,'Achievements section exists');
 assert.doesNotMatch(section,/<h2>\{groupCopy\.categories\}<\/h2>/);
 assert.doesNotMatch(section,/\{achCopy\.completed\}:.*\{achCopy\.missing\}:/);
 assert.doesNotMatch(section,/achCopy\.title\}<\/h1>/);
 assert.match(section,/\{#if achievementGroupHierarchy && achievementGroupSelection!==null && !achievementQuery\.trim\(\)\}\s*<div class="section-heading">/);
 assert.match(section,/placeholder=\{achCopy\.search\}/);
 assert.match(section,/class="category-grid achievement-category-grid"/);
 assert.match(section,/class="item-grid achievement-grid achievement-item-grid"/);
});

test('topbar and HTML identity refer to HKIA Save Editor, never the parent project name',()=>{
 assert.equal((copy.match(/"brand": "HKIA Save Editor"/g)??[]).length,2);
 assert.match(app,/<span class="brand-name">\{copy\.brand\}<\/span>/);
 assert.match(html,/<title>HKIA Save Editor<\/title>/);
 assert.match(app,/'HKIA Save Editor'\}<\/title>/);
 for(const content of [app,html,copy]){
  assert.doesNotMatch(content,/夢綺羅星|Yumekiraboshi/);
 }
});

test('file menu chevron and both search magnifiers are centered source-independent SVGs',()=>{
 assert.equal((app.match(/<svg class="search-symbol" viewBox="0 0 24 24"/g)??[]).length,3);
 assert.match(app,/<summary class="bar-button icon-button file-action" title=\{copy\.file\} aria-label=\{copy\.file\}>/);
 assert.match(app,/<svg class="header-icon"[^>]*>[\s\S]*?<\/svg><svg class="chevron"/);
 assert.doesNotMatch(app,/<span class="chevron">|<span class="search-symbol"/);
 assert.match(css,/\.search-symbol\{[^}]*top:50%;transform:translateY\(-50%\);width:18px;height:18px/);
 assert.match(css,/\.chevron\{display:block;width:12px;height:12px;flex:none/);
 assert.match(css,/\.file-menu>summary\{[^}]*gap:6px/);
 assert.match(css,/\.search-field input\{[^}]*padding:12px 14px 12px 36px/);
});

test('SVG toolbar actions remain keyboard accessible and per-tab history is selectable',()=>{
 assert.match(app,/class="history-menu" bind:this=\{historyMenu\}/);
 assert.match(app,/onclick=\{\(\)=>void goToHistory\(0\)\}/);
 assert.match(app,/onclick=\{\(\)=>void goToHistory\(i\+1\)\}/);
 assert.match(app,/disabled=\{busy\|\|tabHistoryCursor===0\}/);
 assert.match(app,/disabled=\{busy\|\|tabHistoryCursor>=tabHistory.length\}/);
 assert.match(app,/class="header-icon" viewBox="0 0 24 24"/);
 assert.match(app,/class="select-icon" viewBox="0 0 24 24"/);
 assert.match(app,/class="menu-icon" viewBox="0 0 24 24"/);
 assert.doesNotMatch(app,/\>↶<\/button>|\>↷<\/button>/);
 assert.match(css,/\.history-list button\.active\{/);
});

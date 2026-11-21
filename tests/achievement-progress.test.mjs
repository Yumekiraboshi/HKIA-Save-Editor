import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const [i,f,g]=['../public/achievement-index.json','../public/achievement-facts-index.json','../public/achievement-groups.json'].map(p=>JSON.parse(read(p)));
const lookup=new Map(i.records.map(([guid,key])=>[guid,key]));
const facts=new Map(f.records.map(([guid,,,,threshold])=>[guid,threshold]));
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/achievement-progress.ts',import.meta.url))],
 bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {achievementProgressTarget}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const app=read('../src/App.svelte');
const css=read('../src/style.css');

test('category progress uses the true game-native direct child count rather than counter sentinel threshold=1',()=>{
 const explorer=g.groups.find(([guid])=>lookup.get(guid)==='collection_explorer');
 assert.ok(explorer);
 assert.equal(explorer[1].length,19);
 assert.equal(facts.get(explorer[0]),1);
 assert.equal(achievementProgressTarget(explorer[1].length,facts.get(explorer[0])),19);
 for(const [guid,children] of g.groups){
  const sourceThreshold=facts.get(guid);
  assert.equal(sourceThreshold,1);
  assert.equal(achievementProgressTarget(children.length,sourceThreshold),children.length);
 }
 const groups=new Set(g.groups.map(([guid])=>guid));
 assert.equal(groups.size,63);
 assert.equal(g.groups.reduce((n,[,children])=>n+children.length,0),757);
});
test('all 757 leaf achievements use their exact source-defined goal, including multi-step and single-step thresholds',()=>{
 const groups=new Set(g.groups.map(([guid])=>guid));
 const examples=f.records.filter(([guid])=>!groups.has(guid));
 assert.equal(examples.length,757);
 for(const [guid,,,,threshold] of examples){
  assert.ok(threshold>0&&Number.isSafeInteger(threshold));
  assert.equal(achievementProgressTarget(null,threshold),threshold,guid);
 }
 assert.equal(achievementProgressTarget(null,100),100);
 assert.equal(achievementProgressTarget(null,1),1);
 assert.equal(achievementProgressTarget(null,null),null);
 for(const invalid of [0,-1,Number.NaN,Infinity,0.5])assert.equal(achievementProgressTarget(null,invalid),null);
});

test('incomplete achievement uses a single A/B footer instead of an extra row; completed/missing remain distinct',()=>{
 assert.match(app,/\{@const progressGoal=achievementProgressTarget\(/);
 assert.match(app,/achievementGroupHierarchy\?\.byGuid\.get\(item\.guid\)\?\.children\.length\?\?null/);
 assert.match(app,/achievementFacts\.get\(item\.guid\)\?\.threshold\?\?null/);
 assert.match(app,/class="item-status achievement-compact-status"/);
 assert.match(app, /\{achCopy\.progress\}: \{item\.row\.value\.current\.toLocaleString\(locale\)\} \/ \{progressGoal\.toLocaleString\(locale\)\}/);
 const content=app.slice(app.indexOf('class="item-grid achievement-grid achievement-item-grid"'),app.indexOf('<dialog class="achievement-dialog"'));
 assert.doesNotMatch(content,/achievement-compact-progress|\{achCopy\.incomplete\}[\s\S]*<span class="achievement-compact-progress"/);
 assert.match(content, /\{:else if item\.row\.value\.complete\}/);
 assert.match(content, /\{achCopy\.missing\}/);
});
test('completed, incomplete, and missing achievement cards all have matching fixed heights in desktop and mobile',()=>{
 assert.match(css,/\.achievement-tile\{height:224px;min-height:224px\}/);
 assert.match(css,/\.achievement-toggle\{height:100%;min-height:0\}/);
 assert.match(css,/\.achievement-compact-status\{display:block;width:100%;min-height:17px/);
 assert.match(css,/@media\(max-width:730px\)\{\s*\.achievement-item-grid[\s\S]*?\.achievement-tile\{height:211px;min-height:211px\}/);
 assert.doesNotMatch(css,/\.achievement-compact-progress\{font-size/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
async function compiled(path){
 const r=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
  bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
}
const {planCategoryParentCompletion,planMissingCategoryParentCompletion}=await compiled('../src/achievement-parent-auto.ts');
const {decodeAchievementGroups}=await compiled('../src/achievement-groups.ts');
const indexData=JSON.parse(read('../public/achievement-index.json'));
const index=new Map(indexData.records.map(([guid,key,titleId])=>[guid,{key,titleId}]));
const hierarchy=decodeAchievementGroups(JSON.parse(read('../public/achievement-groups.json')),index);
const example=hierarchy.groups[0];
const words=guid=>guid.split(':').map(x=>parseInt(x,16));
const value=(complete,current=1,completed=null)=>({complete,current,completed});
const row=(guid,complete,current=1,completed=null)=>({guid:words(guid),value:value(complete,current,completed)});
const oldRows=[
 row(example.guid,false,example.children.length-1),
 ...example.children.map((g,i)=>row(g,i!==example.children.length-1,1,i!==example.children.length-1?
  [1750000000n+BigInt(i%3),i*100]:null))
];
const last=oldRows.at(-1);
const edited=value(true,7,[1750000002n,987654300]);

test('all 63 source-defined categories have an independent parent and native children',()=>{
 assert.equal(hierarchy.groups.length,63);
 assert.equal(hierarchy.owner.size,757);
 assert.equal(hierarchy.groups.reduce((n,g)=>n+g.children.length,0),757);
 assert.ok(hierarchy.groups.every(g=>g.children.every(c=>hierarchy.owner.get(c)===g.guid)));
});

test('finishing the last child atomically plans parent completion with exact latest 100ns date',()=>{
 const patch=planCategoryParentCompletion(hierarchy,oldRows,last.guid,edited);
 assert.ok(patch);
 assert.deepEqual(patch.guid,words(example.guid));
 assert.deepEqual(patch.before,oldRows[0].value);
 assert.equal(patch.after.complete,true);
 assert.equal(patch.after.current,example.children.length);
 assert.deepEqual(patch.after.completed,[1750000002n,987654300]);
 assert.equal(oldRows[0].value.complete,false,'planner is side-effect-free');
 assert.equal(oldRows.at(-1).value.complete,false,'child stays unchanged until CAS');
});

test('the latest timestamp compares seconds and subsecond nanoseconds rather than array order',()=>{
 const a=oldRows.map(row=>({...row,value:{...row.value}}));
 for(const member of a.slice(1,-1))member.value.completed=[1750000100n,100];
 a[2].value.completed=[1750000100n,999999900];
 const patch=planCategoryParentCompletion(hierarchy,a,last.guid,value(true,0,[1750000100n,999999800]));
 assert.deepEqual(patch.after.completed,[1750000100n,999999900]);
});

test('a missing child/parent, incomplete member or already completed parent never receives a synthetic edit',()=>{
 const cases=[
  oldRows.filter(row=>row!==oldRows[2]),
  oldRows.slice(1),
  oldRows.map((r,i)=>i===2?{...r,value:value(false)}:r),
  oldRows.map((r,i)=>i===0?{...r,value:value(true,9,[1760000000n,0])}:r)
 ];
 for(const entries of cases){
  assert.equal(planCategoryParentCompletion(hierarchy,entries,last.guid,edited),null);
 }
 assert.equal(planCategoryParentCompletion(hierarchy,oldRows,words(example.guid),edited),null,'parent itself is not a child');
 assert.equal(planCategoryParentCompletion(null,oldRows,last.guid,edited),null);
 assert.equal(planCategoryParentCompletion(hierarchy,oldRows,last.guid,value(false)),null);
});

test('unknown child completion dates do not generate a fabricated latest date',()=>{
 const rows=oldRows.map((r,i)=>i===1?{...r,value:{...r.value,completed:null}}:r);
 const patch=planCategoryParentCompletion(hierarchy,rows,last.guid,edited);
 assert.equal(patch.after.complete,true);
 assert.equal(patch.after.completed,null);
});

test('source parent links cannot hide duplicated saved GUIDs or malformed timestamps',()=>{
 const copied=[...oldRows,oldRows[0]];
 assert.throws(()=>planCategoryParentCompletion(hierarchy,copied,last.guid,edited),/ACH_GROUP_DUPLICATE/);
 const corrupt=value(true,2,[1750000002n,987654321]);
 assert.throws(()=>planCategoryParentCompletion(hierarchy,oldRows,last.guid,corrupt),/ACH_GROUP_DATE_INVALID/);
});

test('both UI edit paths use a single parent/child WASM transaction and do not mutate on open',()=>{
 const app=read('../src/App.svelte');
 const client=read('../src/worker-client.ts');
 const worker=read('../src/editor.worker.ts');
 const wasm=read('../wasm/src/lib.rs');
 const core=read('../core/src/collection.rs');
 assert.match(app,/planCategoryParentCompletion\(achievementGroupHierarchy,snapshot\?\.achievements\?\?\[\],live\.guid,next\)/);
 assert.match(app,/changeAchievementPair\(child,parent\)/);
 assert.match(app,/update\(await changeAchievementWithParent\(live,next\)\)/);
 assert.match(app,/update\(await changeAchievementWithParent\(selected,next\)\)/);
 assert.match(client,/rpc\('achievement-pair'/);
 assert.match(worker,/case 'achievement-pair'/);
 assert.match(worker,/hkia_achievement_pair_change\(\.\.\.a,\.\.\.b\)/);
 assert.match(wasm,/pub extern "C" fn hkia_achievement_pair_change/);
 assert.match(core,/pub fn change_achievement_pair/);
 assert.match(core,/Change::AchievementPair/);
 assert.doesNotMatch(app,/load\(file:File\)[\s\S]{0,500}planCategoryParentCompletion\(/);
 const gui=read('../src/achievement-compact-ui.ts');
 assert.match(gui,/最後の日時をコピー/);
});

test('missing source-defined category is created only when all child records become complete',()=>{
 const single=hierarchy.groups.find(g=>g.children.length===1);
 assert.ok(single);
 const child=words(single.children[0]),date=[1750000500n,123456700];
 const done=value(true,1,date);
 const planned=planMissingCategoryParentCompletion(hierarchy,[],child,done);
 assert.deepEqual(planned,{guid:words(single.guid),after:{complete:true,current:1,completed:date}});
 assert.equal(planCategoryParentCompletion(hierarchy,[],child,done),null,'existing-parent planner never invents before value');
 assert.equal(planMissingCategoryParentCompletion(hierarchy,[],child,value(false,0)),null);
 assert.equal(planMissingCategoryParentCompletion(hierarchy,[row(single.guid,true,1,date)],child,done),null);
 assert.equal(planMissingCategoryParentCompletion(hierarchy,[row(single.guid,false,0)],child,done),null,
  'existing parent must use CAS update path');
 const multiple=hierarchy.groups.find(g=>g.children.length>2);
 assert.ok(multiple);
 assert.equal(planMissingCategoryParentCompletion(hierarchy,[],words(multiple.children[0]),done),null,
  'missing siblings never silently count as completed');
});

test('missing parent exact timestamp and 100ns precision follow latest saved child, without guessing absent dates',()=>{
 const children=oldRows.slice(1).map(r=>({...r,value:{...r.value}}));
 const plan=planMissingCategoryParentCompletion(hierarchy,children,last.guid,edited);
 assert.deepEqual(plan.guid,words(example.guid));
 assert.equal(plan.after.current,example.children.length);
 assert.deepEqual(plan.after.completed,[1750000002n,987654300]);
 const withUnknown=children.map((row,i)=>i===0?
  {...row,value:{...row.value,completed:null}}:row);
 const nullDate=planMissingCategoryParentCompletion(hierarchy,withUnknown,last.guid,edited);
 assert.ok(nullDate);
 assert.equal(nullDate.after.completed,null);
 assert.deepEqual(children,oldRows.slice(1),'planner has no save mutation side effects');
});

test('missing-parent Rust/WASM transaction is wired to both existing and absent final-child UI paths',()=>{
 const app=read('../src/App.svelte'),client=read('../src/worker-client.ts');
 const worker=read('../src/editor.worker.ts'),wasm=read('../wasm/src/lib.rs');
 const core=read('../core/src/collection.rs'),keys=read('../core/src/achievement_keys.rs');
 assert.match(app,/planMissingCategoryParentCompletion\(achievementGroupHierarchy,snapshot\?\.achievements\?\?\[\],live\.guid,next\)/);
 assert.match(app,/completeChildWithNewParent\(\{guid:live\.guid,before:live\.value,after:next\},missingParent\)/);
 assert.match(app,/completeChildWithNewParent\(\{guid,before:null,after:next\},missingParent\)/);
 assert.match(client,/rpc\('achievement-parent-create'/);
 assert.match(worker,/case 'achievement-parent-create'/);
 assert.match(worker,/hkia_achievement_parent_create\(\.\.\.args\)/);
 assert.match(wasm,/pub extern "C" fn hkia_achievement_parent_create/);
 assert.match(core,/pub fn complete_child_and_create_parent/);
 assert.match(core,/Change::AchievementParentNew/);
 assert.match(keys,/PARENT_SIZES/);
});

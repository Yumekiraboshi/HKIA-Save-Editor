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
const {planCategoryParentCompletion,planMissingCategoryParentCompletion,planCategoryParentRevocation,planCategoryParentDateSync}=await compiled('../src/achievement-parent-auto.ts');
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

test('relocking one source child atomically revokes an earned category without changing siblings',()=>{
 const source=hierarchy.groups.find(g=>g.children.length>2);
 assert.ok(source);
 const stamp=[1750000300n,123456700];
 const saved=[
  row(source.guid,true,source.children.length,stamp),
  ...source.children.map(g=>row(g,true,1,stamp))
 ];
 const before=saved[1].value;
 const after=value(false,0,null);
 const planned=planCategoryParentRevocation(hierarchy,saved,saved[1].guid,before,after);
 assert.ok(planned);
 assert.deepEqual(planned.guid,words(source.guid));
 assert.deepEqual(planned.before,saved[0].value);
 assert.deepEqual(planned.after,{complete:false,current:source.children.length-1,completed:null});
 assert.deepEqual(saved[0].value,value(true,source.children.length,stamp),'planning never mutates source parent');
 assert.deepEqual(saved[1].value,before,'planning never mutates the original child');
});

test('parent revocation respects saved child membership, existing state and stale progress',()=>{
 const source=hierarchy.groups.find(g=>g.children.length>2);
 const stamp=[1750000300n,0];
 const children=source.children.map((g,i)=>row(g,i<2,1,i<2?stamp:null));
 const parent=row(source.guid,true,source.children.length,stamp);
 const saved=[parent,...children];
 const before=children[0].value;
 const after=value(false,0,null);
 const p=planCategoryParentRevocation(hierarchy,saved,children[0].guid,before,after);
 assert.equal(p.after.current,1,'only the one remaining complete sibling counts');
 const lower=[{...parent,value:value(true,0,stamp)},...children];
 assert.equal(planCategoryParentRevocation(hierarchy,lower,children[0].guid,before,after).after.current,0,
  'never increase an inconsistent original parent progress value');
 assert.equal(planCategoryParentRevocation(hierarchy,saved,children[0].guid,value(false,0),after),null);
 assert.equal(planCategoryParentRevocation(hierarchy,saved,children[0].guid,before,value(true,1,stamp)),null);
 assert.equal(planCategoryParentRevocation(hierarchy,saved,words(source.guid),before,after),null);
 assert.equal(planCategoryParentRevocation(null,saved,children[0].guid,before,after),null);
 assert.equal(planCategoryParentRevocation(hierarchy,saved.slice(1),children[0].guid,before,after),null);
 assert.equal(planCategoryParentRevocation(hierarchy,[{...parent,value:value(false,0)},...children],children[0].guid,before,after),null);
 assert.throws(()=>planCategoryParentRevocation(hierarchy,[...saved,saved[0]],children[0].guid,before,after),/ACH_GROUP_DUPLICATE/);
});

test('relocking uses the existing atomic pair RPC, is v3.0.1 gated and preserves a single undo',()=>{
 const app=read('../src/App.svelte');
 assert.match(app,/snapshot\?\.version==='3\.0\.1'\?planCategoryParentRevocation\(/);
 assert.match(app,/if\(revocation\)return changeAchievementPair\(\{guid:live\.guid,before:live\.value,after:next\},revocation\)/);
 assert.match(app,/update\(await changeAchievementWithParent\(live,next\)\)/);
 const backend=read('../core/src/collection.rs');
 assert.match(backend,/Change::AchievementPair/);
 assert.match(backend,/pub fn change_achievement_pair/);
 assert.match(backend,/self\.undo\.push\(Change::AchievementPair/);
});

const datedSource=hierarchy.groups.find(g=>g.children.length>2);
const at=(secs,nanos=0)=>[BigInt(secs),nanos];
const datedChildren=dates=>[
 row(datedSource.guid,true,datedSource.children.length,dates.reduce((max,d)=>d[0]>max[0]||d[0]===max[0]&&d[1]>max[1]?d:max,dates[0])),
 ...datedSource.children.map((g,i)=>row(g,true,1,dates[i]))
];

test('date correction of the latest child updates only the matching source-derived parent date',()=>{
 const dates=datedSource.children.map((_,i)=>at(1750000000+i,123456700));
 const saved=datedChildren(dates);
 const index=dates.length-1, old=saved[index+1].value;
 const newTime=at(1750005000,987654300);
 const edited=value(true,old.current,newTime);
 const plan=planCategoryParentDateSync(hierarchy,saved,saved[index+1].guid,old,edited);
 assert.ok(plan);
 assert.deepEqual(plan.guid,words(datedSource.guid));
 assert.deepEqual(plan.before,saved[0].value);
 assert.deepEqual(plan.after,{
  complete:true,current:datedSource.children.length,completed:newTime
 });
 assert.deepEqual(saved[0].value.completed,dates[index],'planner must not mutate parent');
 assert.deepEqual(saved[index+1].value.completed,dates[index],'planner must not mutate child');
});

test('moving latest child to an earlier time chooses the next latest sibling with full 100ns precision',()=>{
 const dates=datedSource.children.map((_,i)=>at(1750005000+i,100));
 const saved=datedChildren(dates),lastIndex=dates.length-1;
 const before=saved[lastIndex+1].value;
 const patch=planCategoryParentDateSync(
  hierarchy,saved,saved[lastIndex+1].guid,before,value(true,before.current,at(1749990000,0))
 );
 assert.ok(patch);
 assert.deepEqual(patch.after.completed,dates[lastIndex-1]);
});

test('changing a non-latest child date does not rewrite the category if the latest is unchanged',()=>{
 const dates=datedSource.children.map((_,i)=>at(1750000000+i,500));
 const saved=datedChildren(dates);
 assert.equal(planCategoryParentDateSync(
  hierarchy,saved,saved[1].guid,saved[1].value,value(true,1,at(1750000000,900))
 ),null);
 const first=datedSource.children.map((_,i)=>i===0?at(1750009000,100):at(1750000000+i,100));
 const repeated=datedChildren(first);
 assert.equal(planCategoryParentDateSync(
  hierarchy,repeated,repeated[2].guid,repeated[2].value,value(true,1,at(1750001000,0))
 ),null);
});

test('preserves independent native parent timestamps and incomplete, undated, missing or inconsistent rows',()=>{
 const dates=datedSource.children.map((_,i)=>at(1750000000+i,0));
 const saved=datedChildren(dates),last=saved.at(-1);
 const edited=value(true,1,at(1750010000,0));
 const plan=(rows,before=last.value,after=edited,guid=last.guid)=>
  planCategoryParentDateSync(hierarchy,rows,guid,before,after);
 assert.equal(plan([{...saved[0],value:value(true,datedSource.children.length,at(1750009000))},...saved.slice(1)]),null,
  'an independently recorded parent timestamp must not be rewritten');
 assert.equal(plan([{...saved[0],value:value(true,datedSource.children.length,null)},...saved.slice(1)]),null);
 assert.equal(plan([{...saved[0],value:value(false,datedSource.children.length,dates.at(-1))},...saved.slice(1)]),null);
 assert.equal(plan([{...saved[0],value:value(true,2,dates.at(-1))},...saved.slice(1)]),null);
 assert.equal(plan(saved.slice(1)),null,'missing category is never created by a date edit');
 assert.equal(plan(saved.filter(x=>x!==saved[2])),null,'missing sibling cannot be assumed complete');
 assert.equal(plan(saved.map((r,i)=>i===2?{...r,value:{...r.value,complete:false}}:r)),null);
 assert.equal(plan(saved.map((r,i)=>i===2?{...r,value:{...r.value,completed:null}}:r)),null);
 assert.equal(plan(saved.map((r,i)=>i===2?{...r,value:{...r.value,completed:at(1750000002,111)}}:r)),null);
 assert.equal(plan(saved,value(true,2,dates.at(-1))),null,'stale child progress must not drive a parent write');
 assert.equal(plan(saved,value(false,1,dates.at(-1))),null,'date edit requires a completed old child');
 assert.equal(plan(saved,last.value,value(false,0,null)),null,'revoke uses a separate rule');
 assert.equal(plan(saved,last.value,value(true,1,null)),null,'missing new timestamp cannot be invented');
 assert.equal(plan(saved,last.value,last.value),null,'same timestamp must be a no-op');
 assert.equal(plan(saved,last.value,value(true,3,edited.completed)),null,'progress edit alone is not timestamp sync');
 assert.equal(plan(saved,last.value,value(true,1,at(1750010000,123456789))),null,
  'invalid source precision must never be written');
 assert.equal(plan(saved,last.value,edited,words(datedSource.guid)),null,'parents cannot be edited as children');
 assert.equal(planCategoryParentDateSync(null,saved,last.guid,last.value,edited),null);
 assert.throws(()=>plan([...saved,saved[0]]),/ACH_GROUP_DUPLICATE/);
});

test('date sync is reachable only on v3.0.1 and uses paired Rust/WASM CAS and one Undo',()=>{
 const app=read('../src/App.svelte');
 assert.match(app,/snapshot\?\.version==='3\.0\.1'\?planCategoryParentDateSync\(/);
 assert.match(app,/planCategoryParentDateSync\(\s*achievementGroupHierarchy,snapshot\.achievements,live\.guid,live\.value,next/);
 assert.match(app,/if\(dateSync\)return changeAchievementPair\(\{guid:live\.guid,before:live\.value,after:next\},dateSync\)/);
 assert.match(app,/update\(await changeAchievementWithParent\(selected,next\)\)/);
 const core=read('../core/src/collection.rs');
 assert.match(core,/self\.undo\.push\(Change::AchievementPair/);
});

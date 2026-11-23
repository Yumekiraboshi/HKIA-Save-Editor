import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
const source=JSON.parse(readFileSync(new URL('../public/achievement-index.json',import.meta.url),'utf8'));
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/achievement-catalog.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {joinAchievementCatalog}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const index=new Map(source.records.map(([guid,key,titleId])=>[guid,{key,titleId}]));
const saved=(guid,complete)=>({guid:guid.split(':').map(x=>parseInt(x,16)),value:{complete,current:complete?1:2,completed:null}});

test('820 source definitions remain visible without creating absent save rows',()=>{
 const first=saved(source.records[0][0],true),second=saved(source.records[1][0],false);
 const rows=joinAchievementCatalog(index,[first,second]);
 assert.equal(rows.length,820);
 assert.equal(rows[0].guid,source.records[0][0]);assert.equal(rows[0].row,first);
 assert.equal(rows[1].row,second);
 assert.equal(rows.filter(r=>r.row===null).length,818);
 for(const row of rows.filter(r=>r.row===null)){
  assert.deepEqual(Object.keys(row).sort(),['guid','index','row']);
  assert.equal(row.row,null);
 }
 assert.equal(joinAchievementCatalog(new Map(),[first,second]).length,2);
});

test('unknown-version saved GUIDs remain readable and editable rather than disappearing',()=>{
 const extra=saved('ffffffff:ffffffff:ffffffff:ffffffff',false);
 const rows=joinAchievementCatalog(index,[extra]);
 assert.equal(rows.length,821);
 assert.equal(rows[820].row,extra);
 assert.equal(rows.filter(r=>r.row===null).length,820);
 assert.throws(()=>joinAchievementCatalog(index,[extra,extra]),/ACH_DUPLICATE_SAVE_GUID/);
});

test('absent source entries display 0/goal and can be created only from verified source keys',()=>{
 assert.match(app,/\(item\.row\?\.value\.current\?\?0\)\.toLocaleString\(locale\)/);
 assert.doesNotMatch(app,/achievementFilter/);
 assert.match(app,/editAchievementAuto\(guid,live\?\.value\?\?null,next\)/);
 assert.match(app,/snapshot\.version!=='3\.0\.1'/);
 assert.match(app,/if\(item\.row\)void openAchievement/);
});

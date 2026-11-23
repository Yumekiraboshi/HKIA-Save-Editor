import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const {outputFiles}=await build({
 entryPoints:[fileURLToPath(new URL('../src/achievement-search.ts',import.meta.url))],
 bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'
});
const {searchAchievementRows}=await import('data:text/javascript;base64,'+
 Buffer.from(outputFiles[0].text).toString('base64'));

const first={guid:'first',index:1,row:null};
const second={guid:'second',index:2,row:null};
const extra={guid:'extra',index:3,row:null};
const all=[first,second,extra];
const names={first:'Island Mystery',second:'City Celebration',extra:'未登録の実績'};
const source={first:'achievement_islandMystery',second:'achievement_cityCelebration',extra:'achievement_unknown'};
const nameFor=guid=>names[guid];
const keyFor=guid=>source[guid];

test('category browsing stays scoped when search is empty',()=>{
 assert.deepEqual(searchAchievementRows('',all,[first],nameFor,keyFor),[first]);
 assert.deepEqual(searchAchievementRows('   ',all,[second],nameFor,keyFor),[second]);
});

test('typing in a category searches every native leaf, never just the chosen category',()=>{
 assert.deepEqual(searchAchievementRows(' CITY ',all,[first],nameFor,keyFor),[second]);
 assert.deepEqual(searchAchievementRows('islandmystery',all,[second],nameFor,keyFor),[first]);
 assert.deepEqual(searchAchievementRows('未登録',all,[first],nameFor,keyFor),[extra]);
 assert.deepEqual(searchAchievementRows('no match',all,[first],nameFor,keyFor),[]);
});

test('search never alters original rows, hierarchy membership or source ordering',()=>{
 const copy=structuredClone(all);
 const scoped=[second];
 const matches=searchAchievementRows('achievement',all,scoped,nameFor,keyFor);
 assert.deepEqual(matches,all);
 assert.deepEqual(all,copy);
 assert.deepEqual(scoped,[second]);
 assert.notStrictEqual(matches,all);
});

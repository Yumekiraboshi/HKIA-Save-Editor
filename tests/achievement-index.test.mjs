import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const raw=readFileSync(new URL('../public/achievement-index.json',import.meta.url),'utf8');
const data=JSON.parse(raw);
const source=readFileSync(new URL('../src/achievement-index.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const index=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));

test('820 verified source keys map to distinct four-word save GUIDs without player data',()=>{
 const entries=index.decodeAchievementIndex(data);
 assert.equal(entries.size,820);
 const sample='5cc234d0:46449dfc:b85b6a92:eb03d8ee';
 assert.equal(index.achievementGuid([0x5cc234d0,0x46449dfc,0xb85b6a92,0xeb03d8ee]),sample);
 assert.equal(entries.get(sample).key,'acheivement_falsePeakCircuit');
 assert.equal(entries.get(sample).titleId,'385633684623974400');
 assert.equal(index.readableSourceKey(entries.get(sample).key),'false Peak Circuit');
 assert.equal(index.readableSourceKey('achievement_100Fwishes'),'100 Fwishes');
 assert.throws(()=>index.achievementGuid([-1,0,0,0]),/ACH_GUID_INVALID/);
 assert.throws(()=>index.achievementGuid([1,2,3]),/ACH_GUID_INVALID/);
 const variants=JSON.parse(raw);variants.records[0][0]=variants.records[1][0];
 assert.throws(()=>index.decodeAchievementIndex(variants),/ACH_INDEX_INVALID/);
 assert.doesNotMatch(raw,/"IsComplete"|"CurrentValue"|"CompletedTime"|"CountedGuids"|"Rewards"|"item_gen_"/);
});

test('achievement UI searches sourced internal keys and prefers a localized title when available',()=>{
 const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 for(const token of ['loadAchievementIndex(','achievementGuid(','readableSourceKey(','achievementQuery','achievementName(item.row,item.index)','gameLabels.strings[meta.titleId]'])assert.ok(app.includes(token),token);
});

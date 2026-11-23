import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../src/achievement-date.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
}).outputText;
const {toAchievementDateTimeValue,fromAchievementDateTimeValue}=
 await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));

const atLocal=(year,month,day,hour,minute,second,nanos=0)=>{
 const millis=new Date(year,month-1,day,hour,minute,second).getTime();
 return [BigInt(Math.floor(millis/1000)),nanos];
};

test('existing 100-nanosecond fractions survive unchanged achievement date editing',()=>{
 for(const nanos of [0,100,123456700,987654300,999999900]){
  const original=atLocal(2026,11,23,12,34,56,nanos);
  const displayed=toAchievementDateTimeValue(original);
  assert.equal(displayed,'2026-11-23T12:34:56');
  assert.deepEqual(fromAchievementDateTimeValue(displayed,original),original);
 }
});

test('changing the calendar date changes seconds but preserves original nanoseconds exactly',()=>{
 const original=atLocal(2026,11,23,12,34,56,987654300);
 const updated=fromAchievementDateTimeValue('2026-11-24T12:34:56',original);
 assert.equal(updated[1],987654300);
 assert.equal(toAchievementDateTimeValue(updated),'2026-11-24T12:34:56');
 const changedSecond=fromAchievementDateTimeValue('2026-11-23T12:34:57',original);
 assert.equal(changedSecond[0]-original[0],1n);
 assert.equal(changedSecond[1],original[1]);
});

test('missing native date stays blank; an explicitly entered value may create a date',()=>{
 assert.equal(toAchievementDateTimeValue(null),'');
 const typed='2026-11-23T12:34:56';
 const selected=fromAchievementDateTimeValue(typed,null);
 assert.deepEqual(selected,atLocal(2026,11,23,12,34,56,0));
 assert.equal(toAchievementDateTimeValue(selected),typed);
});

test('invalid dates or unsupported time bounds are rejected, not normalized',()=>{
 const original=atLocal(2026,11,23,12,34,56,987654300);
 for(const input of [
  '', '2026-02-30T12:00:00','2026-11-23T25:00:00',
  '2026-11-23T12:60:00','2026-11-23T12:34:60',
  '1969-12-31T23:59:59', '10000-01-01T00:00:00'
 ])assert.throws(()=>fromAchievementDateTimeValue(input,original),/INVALID_ACHIEVEMENT_DATE/,input);
 assert.equal(toAchievementDateTimeValue([-1n,0]),'');
 assert.equal(toAchievementDateTimeValue([253402300800n,0]),'');
 assert.equal(toAchievementDateTimeValue([1000000000n,50]),'');
 assert.throws(()=>fromAchievementDateTimeValue('2026-11-24T12:34:56',[0n,50]),
  /INVALID_ACHIEVEMENT_DATE/);
});

test('achievement modal never silently inserts Date.now or loses native subsecond precision',()=>{
 const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 assert.match(app,/achievementDate=toAchievementDateTimeValue\(row\.value\.completed\)/);
 assert.match(app,/fromAchievementDateTimeValue\(achievementDate,selected\.value\.completed\)/);
 assert.doesNotMatch(app,/achievementDate=formatAchievementDate|formatAchievementDate\(\{complete:true/);
 assert.doesNotMatch(app,/Math\.round\(\(ms-seconds\*1000\)\*1_000_000\)/);
 assert.match(app,/editAchievementAuto\(selected\.guid,selected\.value,next\)/);
 assert.match(app,/const next:AchievementValue=\{complete:selected\.value\.complete,current:selected\.value\.current,completed\}/);
});

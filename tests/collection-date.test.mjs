import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../src/collection-date.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
}).outputText;
const {toDateTimeValue,fromDateTimeValue}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const EPOCH=621355968000000000n;

function ticksAt(utcMilliseconds,fraction=0n){return EPOCH+BigInt(utcMilliseconds)*10000n+fraction}

test('unchanged display input preserves exact 100-nanosecond save ticks',()=>{
 for(const fraction of [0n,1n,1234567n,9876543n]){
  const original=ticksAt(Date.UTC(2026,10,21,12,34,56),fraction);
  assert.equal(fromDateTimeValue(toDateTimeValue(original),original),original);
 }
});

test('changing displayed seconds retains original subsecond tick precision',()=>{
 const original=ticksAt(Date.UTC(2026,10,21,12,34,56),9876543n);
 const input=toDateTimeValue(original);
 assert.match(input,/:56$/);
 const changed=fromDateTimeValue(input.replace(/:56$/,':57'),original);
 assert.equal(changed-original,10000000n);
});

test('timestamps before Unix epoch and invalid calendar input are handled safely',()=>{
 const original=ticksAt(-1,9999n);
 assert.equal(fromDateTimeValue(toDateTimeValue(original),original),original);
 for(const input of ['', '2026-02-30T12:00:00','2026-11-21T25:00:00','2026-11-21T12:60:00']){
  assert.throws(()=>fromDateTimeValue(input,original),/INVALID_RECORD_DATE/);
 }
});

test('collection UI uses second-precision input and skips unchanged timestamps',()=>{
 const component=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 assert.match(component,/type="datetime-local" step="1"/);
 assert.match(component,/dateValue!==toDateTimeValue\(dateDialogTick\)/);
 assert.match(component,/!dateChanged\)return/);
 assert.match(component,/fromDateTimeValue\(dateValue,dateDialogTick\)/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const {outputFiles}=await build({
 entryPoints:[fileURLToPath(new URL('../src/collection-date.ts',import.meta.url))],
 bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'
});
const {toDateTimeValue,fromDateTimeValue}=
 await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
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

test('collection date edits keep the source DST occurrence and exact saved tick fraction',()=>{
 const saved=process.env.TZ;
 try{
  process.env.TZ='America/New_York';
  for(const hour of [5,6]){
   const original=ticksAt(Date.UTC(2026,10,1,hour,30,15),9876543n);
   const displayed=toDateTimeValue(original);
   assert.equal(displayed,'2026-11-01T01:30:15');
   assert.equal(fromDateTimeValue(displayed,original),original);
   const updated=fromDateTimeValue('2026-11-01T01:31:15',original);
   assert.equal(updated-original,600_000_000n,'one-minute local edit should be one UTC minute');
   assert.equal((updated-EPOCH)%10_000_000n,9876543n);
  }
  const before=ticksAt(Date.UTC(2026,2,8,6,30,15),1234567n);
  assert.throws(()=>fromDateTimeValue('2026-03-08T02:30:15',before),
   /INVALID_RECORD_DATE/);
 }finally{
  if(saved===undefined)delete process.env.TZ;else process.env.TZ=saved;
 }
});

test('collection date edits retain thirty-minute DST fold identity',()=>{
 const saved=process.env.TZ;
 try{
  process.env.TZ='Australia/Lord_Howe';
  for(const hour of [14,15]){
   const original=ticksAt(Date.UTC(2026,3,4,hour,35,15),9876543n);
   assert.equal(toDateTimeValue(original),'2026-04-05T01:35:15');
   const updated=fromDateTimeValue('2026-04-05T01:36:15',original);
   assert.equal(updated-original,600_000_000n);
  }
 }finally{
  if(saved===undefined)delete process.env.TZ;else process.env.TZ=saved;
 }
});

test('collection UI uses second-precision input and skips unchanged timestamps',()=>{
 const component=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 assert.match(component,/type="datetime-local" step="1"/);
 assert.match(component,/dateValue!==toDateTimeValue\(dateDialogTick\)/);
 assert.match(component,/!dateChanged\)return/);
 assert.match(component,/fromDateTimeValue\(dateValue,dateDialogTick\)/);
});

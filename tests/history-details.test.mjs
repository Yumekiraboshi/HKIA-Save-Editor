import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
async function compiled(path){
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
  bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
}
const {decodeHistoryDetails,formatHistoryChange}=await compiled('../src/history-details.ts');
const {historyDetailCopy,historyCopy}=await compiled('../src/history-copy.ts');
const bytes=(parts)=>Uint8Array.from(parts.flatMap(x=>Array.from(x)));
const u8=n=>Uint8Array.of(n);
const i32=n=>{const b=new Uint8Array(4);new DataView(b.buffer).setInt32(0,n,true);return b};
const u32=n=>{const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n,true);return b};
const i64=n=>{const b=new Uint8Array(8);new DataView(b.buffer).setBigInt64(0,n,true);return b};
const f32=n=>{const b=new Uint8Array(4);new DataView(b.buffer).setFloat32(0,n,true);return b};
const guid=words=>bytes(words.map(u32));
const tick=x=>bytes([u8(x===null?0:1),i64(x??0n)]);
const value=(complete,current,sec=null,nanos=0)=>bytes([
 u8(Number(complete)),f32(current),u8(sec===null?0:1),i64(sec??0n),u32(nanos)
]);
const log=(ops,applied)=>bytes([new TextEncoder().encode('HKIAHS01'),u32(ops.length),u32(applied),...ops]);
const collection=(id,a,b)=>bytes([u8(0),i32(id),tick(a),tick(b)]);
const leaf=[1,0,0,1],parent=[2,0,0,1],first=638000000000000001n,second=638000000000000010n;
const meta=(scope,itemId,guid,paired=false,applied=true)=>({scope,itemId,guid,paired,applied});

test('native collection history displays exact recorded/missing changes and timestamps',()=>{
 const j=log([
  collection(2,null,first),
  collection(2,first,second),
  collection(2,second,null)
 ],2);
 const m=[meta('collections',2,null),meta('collections',2,null),meta('collections',2,null,false,false)];
 const decoded=decodeHistoryDetails(j,m);
 assert.equal(decoded.length,3);
 assert.deepEqual(decoded[0],{scope:'collections',itemId:2,before:null,after:first});
 assert.equal(formatHistoryChange(decoded[0],'ja',historyDetailCopy('ja')),'未記録 → 記録済み');
 assert.match(formatHistoryChange(decoded[1],'ja',historyDetailCopy('ja')),/日時: .* → .*/);
 assert.equal(formatHistoryChange(decoded[2],'ja',historyDetailCopy('ja')),'記録済み → 未記録');
});

test('native achievement status, date and progress are distinguished, not guessed',()=>{
 const before=value(false,1);
 const completed=value(true,1,1_750_000_000n,123_456_700);
 const dated=value(true,1,1_750_000_010n,223_456_700);
 const partial=value(true,1.5,1_750_000_010n,223_456_700);
 const ops=[
  bytes([u8(1),guid(leaf),before,completed]),
  bytes([u8(1),guid(leaf),completed,dated]),
  bytes([u8(1),guid(leaf),dated,partial])
 ];
 const m=ops.map(()=>meta('achievements',null,leaf));
 const result=decodeHistoryDetails(log(ops,ops.length),m);
 assert.equal(result.length,3);
 const ja=historyDetailCopy('ja');
 assert.match(formatHistoryChange(result[0],'ja',ja),/^未達成 → 達成済み · 日時: — → /);
 assert.match(formatHistoryChange(result[1],'ja',ja),/^日時:/);
 assert.equal(formatHistoryChange(result[2],'ja',ja),'進捗: 1 → 1.5');
});

test('source-gated creation and each native grouped transaction remain single descriptions',()=>{
 const done=value(true,1,1_750_000_000n,123_456_700),incomplete=value(false,1);
 const none=bytes([u8(0),new Uint8Array(18)]);
 const ops=[
  bytes([u8(2),guid(leaf),done]),
  bytes([u8(3),guid(leaf),done,guid(parent),incomplete,done]),
  bytes([u8(4),guid(leaf),none,done,guid(parent),done]),
  bytes([u8(5),guid(leaf),incomplete,done,guid(parent),incomplete,done])
 ];
 const m=[meta('achievements',null,leaf,false),
  ...[0,1,2].map(()=>meta('achievements',null,leaf,true))];
 const d=decodeHistoryDetails(log(ops,4),m);
 assert.equal(d.length,4);
 assert.deepEqual(d[0].before,null);
 assert.equal(d[1].parentGuid?.[0],2);
 assert.equal(d[2].parentGuid?.[0],2);
 assert.equal(d[3].parentGuid?.[0],2);
 assert.equal(d[1].parentBefore.complete,false);
 assert.equal(d[1].parentAfter.complete,true);
 assert.equal(d[2].parentBefore,null);
 assert.deepEqual(d[2].parentAfter,{complete:true,current:1,completed:[1750000000n,123456700]});
 assert.equal(d[3].parentBefore.complete,false);
 assert.equal(d[3].parentAfter.complete,true);
 const label=historyCopy('ja').paired;
 const message=formatHistoryChange(d[3],'ja',historyDetailCopy('ja'),label);
 assert.match(message,/^未達成 → 達成済み/);
 assert.match(message,/カテゴリーを含む: 未達成 → 達成済み/);
 assert.match(message,/日時:/);
 assert.match(formatHistoryChange(d[2],'ja',historyDetailCopy('ja'),label),/カテゴリーを含む: 新規記録 · 達成済み/);
});

test('created achievements show exact native progress and 100ns date in undo history',()=>{
 const completed=value(true,12,1_750_000_000n,987_654_300);
 const noDate=value(false,0);
 const parentCompleted=value(true,7,1_750_000_001n,123_456_700);
 const noPrior=bytes([u8(0),new Uint8Array(18)]);
 const ops=[
  bytes([u8(2),guid(leaf),completed]),
  bytes([u8(2),guid(parent),noDate]),
  bytes([u8(4),guid(leaf),noPrior,completed,guid(parent),parentCompleted])
 ];
 const records=[
  meta('achievements',null,leaf),
  meta('achievements',null,parent),
  meta('achievements',null,leaf,true)
 ];
 const details=decodeHistoryDetails(log(ops,ops.length),records);
 assert.equal(details.length,3);
 const copy=historyDetailCopy('ja'),paired=historyCopy('ja').paired;
 const created=formatHistoryChange(details[0],'ja',copy);
 assert.match(created,/^新規記録 · 達成済み · 進捗: 12 · 日時: /);
 assert.match(created,/\.9876543$/,'100ns fraction must be visible without rounding');
 const absent=formatHistoryChange(details[1],'ja',copy);
 assert.equal(absent,'新規記録 · 未達成 · 進捗: 0');
 assert.doesNotMatch(absent,/日時|Date|2026/,'no native timestamp means no inferred date');
 const pairedChange=formatHistoryChange(details[2],'ja',copy,paired);
 assert.match(pairedChange,/^新規記録 · 達成済み · 進捗: 12 · 日時: /);
 assert.match(pairedChange,/カテゴリーを含む: 新規記録 · 達成済み · 進捗: 7 · 日時: /);
 assert.match(pairedChange,/\.1234567$/,'category date must preserve its own native fraction');
 for(const locale of ['ja','en','ar','de','es','fr','it','ko','nl','pt-BR','ru','tr','zh-Hans','zh-Hant','fr-CA']){
  const localized=formatHistoryChange(details[0],locale,historyDetailCopy(locale));
  assert.match(localized,/\.9876543$/,locale);
  assert.ok(localized.includes('12'),locale);
 }
});

test('mismatched scope, GUID, trailing bytes or bad optional-value markers fail closed',()=>{
 const valid=log([collection(2,null,first)],1);
 const m=[meta('collections',2,null)];
 assert.equal(decodeHistoryDetails(valid,m).length,1);
 const wrong=[meta('collections',3,null)];
 assert.deepEqual(decodeHistoryDetails(valid,wrong),[]);
 assert.deepEqual(decodeHistoryDetails(bytes([valid,u8(0)]),m),[]);
 assert.deepEqual(decodeHistoryDetails(null,m),[]);
 assert.deepEqual(decodeHistoryDetails(valid,[]),[]);
 const bad=valid.slice();bad[16]=6;assert.deepEqual(decodeHistoryDetails(bad,m),[]);
 const opt=bytes([u8(4),guid(leaf),u8(0),new Uint8Array(18),value(true,1,1n),guid(parent),value(true,1,1n)]);
 const corrupt=log([opt],1);corrupt[16+1+16+1]=1;
 assert.deepEqual(decodeHistoryDetails(corrupt,[meta('achievements',null,leaf,true)]),[]);
 for(const l of ['ja','en','ar','de','es','fr','it','ko','nl','pt-BR','ru','tr','zh-Hans','zh-Hant','fr-CA']){
  const copy=historyDetailCopy(l);
  assert.ok(copy.added&&copy.removed&&copy.date&&copy.progress,l);
 }
});

test('single achievement action reports status, progress and completion timestamp together',()=>{
 const from=value(false,0),to=value(true,4,1_750_000_000n,123_456_700);
 const op=bytes([u8(1),guid(leaf),from,to]);
 const [row]=decodeHistoryDetails(log([op],1),[meta('achievements',null,leaf)]);
 const text=formatHistoryChange(row,'ja',historyDetailCopy('ja'));
 assert.match(text,/^未達成 → 達成済み · 進捗: 0 → 4 · 日時: — → /);
 assert.equal(text.match(/日時:/g)?.length,1);
});

test('combined progress and date corrections and parent-only dates are reported',()=>{
 const before=value(true,1,1_750_000_000n,123_456_700);
 const after=value(true,3,1_750_000_010n,123_456_700);
 const parentBefore=value(true,9,1_750_000_000n,123_456_700);
 const parentAfter=value(true,9,1_750_000_010n,123_456_700);
 const op=bytes([u8(5),guid(leaf),before,after,guid(parent),parentBefore,parentAfter]);
 const [row]=decodeHistoryDetails(log([op],1),[meta('achievements',null,leaf,true)]);
 const label=historyCopy('ja').paired;
 const text=formatHistoryChange(row,'ja',historyDetailCopy('ja'),label);
 assert.match(text,/^進捗: 1 → 3 · 日時:/);
 assert.match(text,/カテゴリーを含む: 日時:/);
 assert.equal(text.match(/日時:/g)?.length,2);
 assert.doesNotMatch(text,/未達成 → 達成済み/);
});

test('inventory batch is one native history step with every stack change retained',()=>{
 const batch=bytes([u8(10),u32(2),u32(4),i32(6),i32(20),u32(8),i32(9),i32(20)]);
 const records=[meta('inventory',4,null)];
 const [detail]=decodeHistoryDetails(log([batch],1),records);
 assert.deepEqual(detail,{scope:'inventory',documentId:4,batch:[{documentId:4,before:6,after:20},{documentId:8,before:9,after:20}]});
 assert.equal(formatHistoryChange(detail,'en',historyDetailCopy('en'),'','Quantity',undefined,undefined,id=>'Item '+id),'Item 4: 6 → 20 · Item 8: 9 → 20');
 for(const invalid of [
  bytes([u8(10),u32(0)]),bytes([u8(10),u32(41)]),
  bytes([u8(10),u32(2),u32(4),i32(6),i32(20),u32(4),i32(9),i32(20)]),
  bytes([u8(10),u32(1),u32(4),i32(6),i32(0)]),
  bytes([u8(10),u32(1),u32(4),i32(6),i32(6)]),
  batch.slice(0,-1)
 ])assert.deepEqual(decodeHistoryDetails(log([invalid],1),records),[]);
});

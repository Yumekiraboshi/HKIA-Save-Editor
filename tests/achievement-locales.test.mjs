import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';
import ts from 'typescript';

const require=createRequire(import.meta.url);
const {inflateGzip,b64bytes,extractTitleStrings}=require('../scripts/babel-asset-decoder.cjs');
const index=JSON.parse(readFileSync(new URL('../public/achievement-index.json',import.meta.url),'utf8'));
const titleIds=new Set(index.records.map(row=>row[2]));
const locales=['ar','de','en','en-GB','es','fr','fr-CA','it','ja','ko','nl','pt-BR','ru','tr','zh-Hans','zh-Hant'];
const source=readFileSync(new URL('../src/achievement-localization.ts',import.meta.url),'utf8');
const javascript=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const decoder=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'));
const map=new Map(index.records.map(r=>[r[0],{key:r[1],titleId:r[2]}]));

test('every shipped game locale contains 820 exact source-joined achievement titles',()=>{
 assert.equal(titleIds.size,820);
 for(const locale of locales){
  const pack=JSON.parse(readFileSync(new URL('../public/achievement-locales/'+locale+'.json',import.meta.url),'utf8'));
  assert.equal(pack.schema,'HKIA.AchievementTitles.1');
  assert.equal(pack.locale,locale);
  assert.equal(Object.keys(pack.strings).length,820,locale);
  assert.deepEqual(new Set(Object.keys(pack.strings)),titleIds,locale);
  for(const [id,value] of Object.entries(pack.strings)){
   assert.ok(typeof value==='string'&&value.trim()&&value.length<=1024,locale+' '+id);
  }
  assert.deepEqual(decoder.decodeAchievementTitles(pack,locale,map),pack.strings);
 }
 const en=JSON.parse(readFileSync(new URL('../public/achievement-locales/en.json',import.meta.url),'utf8'));
 const ja=JSON.parse(readFileSync(new URL('../public/achievement-locales/ja.json',import.meta.url),'utf8'));
 assert.equal(en.strings['385633684623974400'],'False Peak Circuit');
 assert.equal(ja.strings['385633684623974400'],'偽物ピーク・サーキット');
});

test('title decoder rejects missing, extra, wrong-language or tampered strings',()=>{
 const pack=JSON.parse(readFileSync(new URL('../public/achievement-locales/en.json',import.meta.url),'utf8'));
 assert.throws(()=>decoder.decodeAchievementTitles(pack,'ja',map),/ACH_TITLES_INVALID/);
 const missing=structuredClone(pack);delete missing.strings[Object.keys(missing.strings)[0]];
 assert.throws(()=>decoder.decodeAchievementTitles(missing,'en',map),/ACH_TITLES_INCOMPLETE/);
 const extra=structuredClone(pack);extra.strings['99999999999999999999']='Fabricated';
 assert.throws(()=>decoder.decodeAchievementTitles(extra,'en',map),/ACH_TITLES_INCOMPLETE/);
 const tampered=structuredClone(pack);tampered.strings[Object.keys(tampered.strings)[0]]=null;
 assert.throws(()=>decoder.decodeAchievementTitles(tampered,'en',map),/ACH_TITLES_INVALID/);
});

test('native gzip decoder matches Node gzip and respects source manifest offsets',()=>{
 const sample=Buffer.from('native HKIA Babel table '+('Repeated text multilingual 日本語 العربية '.repeat(100)),'utf8');
 const compressed=gzipSync(sample,{level:9});
 assert.deepEqual(Buffer.from(inflateGzip(b64bytes(compressed.toString('base64')))),sample);
 const manifest=Buffer.alloc(12+2*20+12),view=new DataView(manifest.buffer,manifest.byteOffset,manifest.byteLength);
 view.setUint32(0,6000,true);view.setUint32(4,1,true);view.setUint32(8,2,true);
 const strings=[['100','Hello'],['101','こんにちは']],bytes=Buffer.concat(strings.map(x=>Buffer.from(x[1])));
 let off=0;strings.forEach(([id,value],i)=>{
  view.setBigUint64(12+i*20,BigInt(id),true);
  view.setUint32(12+i*20+8,off,true);
  view.setUint32(12+i*20+12,Buffer.byteLength(value),true);
  off+=Buffer.byteLength(value);
 });
 view.setUint32(52,300,true);view.setUint32(56,0,true);view.setUint32(60,2,true);
 assert.deepEqual(extractTitleStrings(manifest,bytes,'en',new Set(['100','101'])),{'100':'Hello','101':'こんにちは'});
});

test('UI loads only the active achievement language with stale response guard',()=>{
 const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 assert.match(app,/loadAchievementTitles\(current,import\.meta\.env\.BASE_URL,index\)/);
 assert.match(app,/epoch===achievementTitleEpoch/);
 assert.match(app,/achievementTitles\[meta\.titleId\]/);
 assert.match(app,/achievementName\(item\.row,item\.index\)/);
});

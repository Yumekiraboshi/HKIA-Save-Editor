import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/source-names.ts',import.meta.url))],
 bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {decodeSourceItemNames,decodeInventoryAdditionalNames}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const locales=['ar','zh-Hans','zh-Hant','nl','en-GB','en','fr-CA','fr','de','it','ja','ko','pt-BR','ru','es','tr'];
const source='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0';

test('all 16 original v3.0.1 Babel localized item lists resolve 10,262 exact source IDs',()=>{
 const rawItems=new Set();
 for(const locale of locales){
  const path=new URL('../public/source-names/'+locale+'.json',import.meta.url);
  const record=JSON.parse(readFileSync(path,'utf8'));
  assert.equal(record.schema,'HKIA.SourceVerifiedItemNames.1');
  assert.equal(record.version,'3.0.1');
  assert.equal(record.source_sha256,source);
  assert.equal(record.count,10262);
  const names=decodeSourceItemNames(record,locale);
  assert.equal(Object.keys(names).length,10262);
  assert.ok(names['315822'].length>=3,locale);
  assert.ok(names['517031'].length>=3,locale);
  assert.ok(names['216433'].length>=3,locale);
  if(!rawItems.size)for(const id of Object.keys(names))rawItems.add(id);
  else assert.deepEqual(new Set(Object.keys(names)),rawItems,'all locales must cover identical item IDs');
 }
 assert.equal(rawItems.size,10262);
});

test('source item titles agree with authoritative name strings for exact IDs, never guessed homonyms',()=>{
 const en=decodeSourceItemNames(JSON.parse(readFileSync(new URL('../public/source-names/en.json',import.meta.url))), 'en');
 const ja=decodeSourceItemNames(JSON.parse(readFileSync(new URL('../public/source-names/ja.json',import.meta.url))), 'ja');
 assert.equal(en['216433'],'TOPHAT Holiday Stocking');
 assert.equal(ja['216433'],'トップハットのホリデーソックス');
 assert.equal(en['315822'],'Mint Striped Pajama Shirt');
 assert.equal(ja['315822'],'ミント色のストライプのパジャマシャツ');
 assert.equal(en['517031'],'Blue Fairy Outfit');
 assert.equal(ja['517031'],'青の妖精の服');
 assert.equal(en['1392669'],'Denim Wrapped Waist Towel');
 assert.equal(ja['1392669'],'デニムの腰巻きタオル');
 for(const altered of [
  {locale:'en-GB'},
  {count:10261},
  {source_sha256:'0'.repeat(64)},
  {names:{}}
 ])assert.throws(()=>decodeSourceItemNames({...JSON.parse(readFileSync(new URL('../public/source-names/en.json',import.meta.url))),...altered},'en'));
});

test('UI prefers exact native names while retaining existing fallback if external data is unavailable',()=>{
 const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 assert.match(app,/loadSourceItemNames\(import\.meta\.env\.BASE_URL,language\)/);
 assert.match(app,/sourceNames\[String\(item\[0\]\)\]\?\?verifiedFloorplanName/);
 assert.match(app,/if\(epoch===sourceNameEpoch\)sourceNames=names/);
 assert.match(app,/if\(epoch===sourceNameEpoch\)sourceNames=\{\}/);
});


test('additional native inventory names cover all 12,163 original IDs in 15 source-verified locales',()=>{
 const packed=JSON.parse(readFileSync(new URL('../public/inventory-native-categories.json',import.meta.url),'utf8'));
 const data=gunzipSync(Buffer.from(packed.data,'base64'));
 const ids=new Set();let id=0,pos=0;
 for(let i=0;i<packed.count;i++){
  let delta=0,shift=0,byte=0;
  do{byte=data[pos++];delta+=(byte&127)*2**shift;shift+=7;}while(byte&128);
  id+=delta;pos++;ids.add(String(id));
 }
 assert.equal(pos,data.length);assert.equal(ids.size,12163);
 for(const locale of locales.filter(x=>x!=='ar')){
  const base=decodeSourceItemNames(JSON.parse(readFileSync(new URL('../public/source-names/'+locale+'.json',import.meta.url))),locale);
  const raw=JSON.parse(readFileSync(new URL('../public/inventory-names/'+locale+'.json',import.meta.url)));
  const extra=decodeInventoryAdditionalNames(raw,locale,base);
  assert.equal(Object.keys(extra).length,1901);
  assert.deepEqual(new Set([...Object.keys(base),...Object.keys(extra)]),ids,locale);
  assert.throws(()=>decodeInventoryAdditionalNames({...raw,locale:'ar'},locale,base));
  assert.throws(()=>decodeInventoryAdditionalNames(raw,locale,{...base,[Object.keys(extra)[0]]:'collision'}));
 }
 const ja=JSON.parse(readFileSync(new URL('../public/inventory-names/ja.json',import.meta.url))).names;
 const en=JSON.parse(readFileSync(new URL('../public/inventory-names/en.json',import.meta.url))).names;
 assert.equal(en['427689'],"Nul Rug");
 assert.equal(ja['427689'],"ヌルのしきもの");
 assert.equal(ja['5365022'],"ホラガイ");
});

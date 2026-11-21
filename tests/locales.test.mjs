import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';

const localeText=readFileSync(new URL('../src/locales.ts',import.meta.url),'utf8');
const js=ts.transpileModule(localeText,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const locales=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
const loader=readFileSync(new URL('../src/game-localization.ts',import.meta.url),'utf8');

test('sixteen game locales are selectable, canonicalised and persisted',()=>{
 assert.equal(locales.supportedLocales.length,16);
 const codes=new Set(locales.supportedLocales.map(row=>row.code));
 assert.equal(codes.size,16);
 for(const code of codes)assert.equal(locales.resolveLocale(code),code);
 assert.equal(locales.resolveLocale('zh-TW'),'zh-Hant');
 assert.equal(locales.resolveLocale('zh-CN'),'zh-Hans');
 assert.equal(locales.resolveLocale('en-AU'),'en-GB');
 assert.equal(locales.resolveLocale('pt-PT'),'pt-BR');
 assert.equal(locales.detectLocale(['xq-XY','ar-EG']),'ar');
 assert.equal(locales.detectLocale(['xx-YY']),'en');
 assert.equal(locales.isRtl('ar'),true);
 assert.equal(locales.isRtl('ja'),false);
 assert.match(app,/supportedLocales as language/);
 assert.match(app,/localStorage\.setItem\('hkia-display-locale'/);
 assert.match(app,/document\.documentElement\.dir=isRtl\(locale\)/);
});

test('game names load from one shared Babel ID crosswalk on demand',()=>{
 assert.match(loader,/HKIA\.BabelItemKeys\.1/);
 assert.match(loader,/HKIA\.BabelStrings\.1/);
 assert.match(loader,/strings\[key\]/);
 assert.match(app,/gameLabels\.names\[String\(item\[0\]\)\]/);
 assert.match(app,/loadGameLabels\(current,import\.meta\.env\.BASE_URL\)/);
 assert.match(app,/if\(epoch===languageLoadEpoch\)/);
});

test('native Babel v5000 extractor produces mapped labels without copying unrelated strings',()=>{
 const temp=mkdtempSync(join(tmpdir(),'hkia-babel-'));
 try{
  const source=join(temp,'Babel'),out=join(temp,'output');
  const phrases=[
   {id:100n,table:100,en:'Header',ja:'見出し',fr:'En-tête'},
   {id:200n,table:200,en:'Unused dialogue',ja:'未使用の会話',fr:'Dialogue non utilisé'},
   {id:300n,table:300,en:'Blue Fairy Outfit',ja:'青い妖精の服',fr:'Tenue de fée bleue'},
   {id:301n,table:300,en:'Sakura Cheesecake',ja:'桜のチーズケーキ',fr:'Cheesecake sakura'},
   {id:302n,table:300,en:'Duplicate',ja:'重複A',fr:'Doublon A'},
   {id:303n,table:300,en:'Duplicate',ja:'重複B',fr:'Doublon B'}
  ];
  for(const locale of ['en','ja','fr']){
   const dir=join(source,locale);mkdirSync(dir,{recursive:true});
   const manifest=Buffer.alloc(12+phrases.length*20+3*12);
   manifest.writeUInt32LE({en:6000,ja:11000,fr:8000}[locale],0);manifest.writeUInt32LE(3,4);manifest.writeUInt32LE(phrases.length,8);
   let i=0;
   for(const table of [100,200,300]){
    const rows=phrases.filter(row=>row.table===table);
    let offset=0,bytes=[];
    for(const row of rows){
     const txt=Buffer.from(row[locale]);bytes.push(txt);
     manifest.writeBigUInt64LE(row.id,12+i*20);
     manifest.writeUInt32LE(offset,12+i*20+8);
     manifest.writeUInt32LE(txt.length,12+i*20+12);
     manifest.writeUInt32LE(0,12+i*20+16);
     offset+=txt.length;i++;
    }
    const index=[100,200,300].indexOf(table),start=phrases.filter(x=>x.table<table).length;
    manifest.writeUInt32LE(table,12+phrases.length*20+index*12);
    manifest.writeUInt32LE(start,12+phrases.length*20+index*12+4);
    manifest.writeUInt32LE(rows.length,12+phrases.length*20+index*12+8);
    writeFileSync(join(dir,locale+'.'+table+'.txt'),gzipSync(Buffer.concat(bytes)));
   }
   writeFileSync(join(dir,locale+'.manifest'),gzipSync(manifest));
  }
  const items=[
   [10,'x','x','x',0,'Blue Fairy Outfit','青い妖精の服',10],
   [20,'y','y','y',0,'Sakura Cheesecake','桜のチーズケーキ',20],
   [30,'z','z','z',0,'Duplicate','重複',30]
  ];
  const catalog=join(temp,'catalog.json');writeFileSync(catalog,JSON.stringify({items}));
  const script=new URL('../scripts/extract-babel-items.py',import.meta.url).pathname;
  const p=spawnSync('python3',[script,'--babel-dir',source,'--catalog',catalog,'--out',out,'--locales','en,ja,fr'],{encoding:'utf8'});
  assert.equal(p.status,0,p.stderr);
  const keys=JSON.parse(readFileSync(join(out,'item-keys.json'),'utf8'));
  assert.deepEqual(keys.keys,{'10':'300','20':'301'});
  const ja=JSON.parse(readFileSync(join(out,'ja.json'),'utf8'));
  assert.deepEqual(ja.strings,{'300':'青い妖精の服','301':'桜のチーズケーキ'});
  const fr=JSON.parse(readFileSync(join(out,'fr.json'),'utf8'));
  assert.deepEqual(fr.strings,{'300':'Tenue de fée bleue','301':'Cheesecake sakura'});
  const index=JSON.parse(readFileSync(join(out,'index.json'),'utf8'));
  assert.deepEqual(index.available,['en','ja','fr']);
  assert.ok(!JSON.stringify(fr).includes('Dialogue non utilisé'));
 }finally{rmSync(temp,{recursive:true,force:true})}
});

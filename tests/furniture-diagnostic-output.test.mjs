import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,existsSync,readFileSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {furnitureDiagnosticCases,diagnosticOutputPath,exportFurnitureDiagnostic} from '../scripts/furniture-diagnostic-output.mjs';
const catalog=JSON.parse(readFileSync(new URL('../public/inventory-ui/furniture-customization-v3.0.1.json',import.meta.url)));
test('diagnostic cases match original catalog slot choices, with authored fit for the rug',()=>{
 for(const item of ['rug','chair']){
  const {itemId,cases,useAuthored}=furnitureDiagnosticCases(item);
  const row=catalog.items.find(x=>x[0]===itemId);
  assert.equal(cases.length,item==='rug'?6:10);assert.equal(useAuthored,item==='rug');
  assert.equal(new Set(cases.map(x=>x.join(','))).size,cases.length);
  for(const indices of cases)for(let slot=0;slot<3;slot++){
   const s=row[4].find(x=>x[0]===slot);
   if(!s)assert.equal(indices[slot],0);
   else assert.ok([s[2],...s[3].flatMap(k=>catalog.sets.find(x=>x[0]===k)[2])].includes(indices[slot]));
  }
 }
 assert.equal(furnitureDiagnosticCases('chair',true).useAuthored,true);
 assert.throws(()=>furnitureDiagnosticCases('unverified'),/--item/);
});
test('diagnostic export refuses source tree targets, malformed or duplicate PNG rows without partial files',()=>{
 const dir=mkdtempSync(join(tmpdir(),'hkia-diagnostic-output-'));
 try{
  const source=join(dir,'source');mkdirSync(source);
  assert.throws(()=>diagnosticOutputPath(join(source,'out'),[source]),/outside/);
  const bytes=Buffer.from([137,80,78,71,13,10,26,10,1]),row={indices:[207,0,0],png:bytes.toString('base64')};
  const result=[{indices:row.indices,visible:1,sha256:'0'.repeat(64)}];
  const report={itemId:32709745,renderFidelity:'unverified',result};
  const target=diagnosticOutputPath(join(dir,'out'),[source]);
  assert.throws(()=>exportFurnitureDiagnostic(target,report,[{...row,png:'AA=='}]),/PNG signature/);
  assert.equal(existsSync(target),false);
  assert.throws(()=>exportFurnitureDiagnostic(target,{...report,result:[...result,...result]},[row,row]),/EEXIST/);
  assert.deepEqual(readdirSync(dir),['source']);
  const actual=exportFurnitureDiagnostic(target,report,[row]);
  assert.deepEqual(readFileSync(join(target,'32709745-207-0-0.png')),bytes);
  assert.equal(actual.result[0].pngSha256,createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(JSON.parse(readFileSync(join(target,'report.json'))),actual);
  assert.throws(()=>diagnosticOutputPath(target,[source]),/already exists/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

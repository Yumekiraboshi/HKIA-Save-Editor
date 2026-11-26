import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/furniture-material-treatment.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {nativeFurnitureTreatment,furnitureTreatmentScale,createFurnitureTreatmentResolver}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const catalog=read('public/inventory-ui/furniture-customization-v3.0.1.json'),variants=read('data/furniture-material-render-source-v3.0.1.json');
test('all 649 original customizable items and 1089 slots resolve defaults and every source-defined choice',()=>{
 const resolve=createFurnitureTreatmentResolver(catalog,variants),sets=new Map(catalog.sets.map(r=>[r[0],r[2]]));
 let slots=0,choices=0;
 for(const item of catalog.items){
  const defaults=resolve(item[0],[0,0,0]);assert.equal(defaults.length,item[4].length);
  for(const slot of item[4]){
   slots++;
   assert.equal(defaults.find(x=>x.slot===slot[0]).selectedIndex,slot[2]);
   const allowed=new Set([slot[2],...slot[3].flatMap(id=>sets.get(id))]);
   for(const index of allowed){
    const selected=[0,0,0];selected[slot[0]]=index;
    const plan=resolve(item[0],selected);assert.equal(plan.find(x=>x.slot===slot[0]).selectedIndex,index);
    for(const other of plan.filter(x=>x.slot!==slot[0]))assert.equal(other.selectedIndex,other.sourceDefault);
    choices++;
   }
  }
 }
 assert.equal(slots,1089);assert.equal(choices,26274);
 console.log('HKIA_FURNITURE_SLOT_SOURCE_COVERAGE '+JSON.stringify({items:649,slots,choices}));
 assert.throws(()=>resolve(32709745,[0,1,0]),/UNASSIGNED_SLOT/);
 assert.throws(()=>resolve(32709745,[1,0,0]),/SLOT_MATERIAL/);
 assert.throws(()=>resolve(0,[0,0,0]),/ITEM/);
 assert.throws(()=>resolve(32709745,[0,0]),/TUPLE/);
});
test('all 877 original material records preserve setter args, except native null-pattern alpha',()=>{
 let noMap=0,corrected=0,mirrors=0;
 for(const row of variants.rows){
  const p=nativeFurnitureTreatment(row,row[5]);
  assert.deepEqual(p.baseColor,[...row[3].slice(0,3),row[5]===null?1:row[3][3]]);
  assert.deepEqual(p.patternST,[...row[6],...row[7]]);
  assert.deepEqual(p.patternTint,row[8]);assert.deepEqual(p.rotationCenter,row[10].slice(0,2));
  assert.deepEqual([p.patternSmoothnessShift,p.patternMetallicShift,p.smoothnessShift,p.metallicShift],row.slice(11,15));
  if(row[5]===null){noMap++;if(row[3][3]!==1)corrected++;}
  else assert.throws(()=>nativeFurnitureTreatment(row,null),/PATTERN_REFERENCE/);
  if(p.mirrored)mirrors++;
  for(const s of [[2,3,4],[-2,3,4]]){
   const expected=[p.mirrored?-2:2,3,4];
   assert.deepEqual(furnitureTreatmentScale(s,p.mirrored),expected);
   assert.deepEqual(furnitureTreatmentScale(expected,p.mirrored),expected);
  }
 }
 assert.deepEqual([noMap,corrected,mirrors],[13,12,2]);
});
test('mismatched source crosswalk cannot select materials',()=>{
 const changed=structuredClone(variants);changed.rows[0][1]='0'.repeat(32);
 assert.throws(()=>createFurnitureTreatmentResolver(catalog,changed),/MATERIAL_LINK/);
});

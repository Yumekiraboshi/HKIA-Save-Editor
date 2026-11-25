import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const path=p=>fileURLToPath(new URL('../'+p,import.meta.url));
const read=p=>JSON.parse(readFileSync(path(p)));
const {outputFiles}=await build({stdin:{contents:'export * from '+JSON.stringify(path('src/furniture-rug-source.ts'))+';export * from '+JSON.stringify(path('src/furniture-rug-diagnostic.ts'))+';',resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {resolveNativeRugMaterial,drawNativeRugDiagnostic}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
function sources(){return {
 catalog:read('public/inventory-ui/furniture-customization-v3.0.1.json'),
 geometry:read('data/furniture-mesh-source-sample-v3.0.1.json'),
 base:read('data/furniture-base-material-source-v3.0.1.json'),
 variants:read('data/furniture-material-render-source-v3.0.1.json'),
 patterns:read('data/furniture-pattern-texture-sample-v3.0.1.json')
};}
test('all six native Colorblaze Splash rug material choices resolve to original renderer, exact pattern GUID and raw shader fields',()=>{
 const d=sources(),patterns=new Set(),base=new Set(),normals=new Set(),combos=new Set();
 for(let i=207;i<=212;i++){
  const plan=resolveNativeRugMaterial(d,32709745,i),v=d.variants.rows.find(r=>r[0]===i),p=d.patterns.rows.find(r=>r.materialIndex===i);
  assert.equal(plan.itemId,32709745);assert.equal(plan.materialIndex,i);assert.equal(plan.materialGuid,v[1]);assert.equal(plan.materialRecordSha256,v[17]);
  assert.equal(plan.meshId,'7428035252678368996');assert.equal(plan.rendererPathId,'1024914232395800857');
  assert.equal(plan.geometry.geometryBytes,7680);assert.equal(plan.geometry.meshes[plan.meshId].indexCount,540);
  assert.equal(plan.textures.patternMap.guid,v[5]);assert.equal(plan.textures.patternMap.sha256,p.sha256);
  assert.deepEqual(plan.material.baseColor,v[3]);assert.deepEqual(plan.material.patternTint,v[8]);assert.equal(plan.material.useBaseMapMask,v[4]);
  assert.deepEqual(plan.material.patternST,[...v[6],...v[7]]);assert.equal(plan.material.rotationTurns,v[9]);
  assert.deepEqual(plan.material.rotationCenter,v[10].slice(0,2));
  assert.deepEqual([plan.material.patternSmoothnessShift,plan.material.patternMetallicShift,plan.material.smoothnessShift,plan.material.metallicShift],v.slice(11,15));
  assert.equal(plan.renderFidelity,'unverified');assert.equal(plan.material.worldUV,false);
  patterns.add(plan.textures.patternMap.sha256);base.add(plan.textures.baseMap.sha256);normals.add(plan.textures.normalMap.sha256);combos.add(plan.textures.comboMap.sha256);
 }
 assert.equal(patterns.size,6);assert.equal(base.size,1);assert.equal(normals.size,1);assert.equal(combos.size,1);
 assert.equal(resolveNativeRugMaterial(d,32709745,208).material.baseColor[3],0);
 assert.equal(resolveNativeRugMaterial(d,32709745,210).material.rotationTurns,d.variants.rows.find(x=>x[0]===210)[9]);
});
test('rejects other items, unauthorized source slot selections, mismatched GUIDs, materials and shader features',()=>{
 let d=sources();
 assert.throws(()=>resolveNativeRugMaterial(d,34770598,207),/ITEM_UNSUPPORTED/);
 assert.throws(()=>resolveNativeRugMaterial(d,32709745,1),/MATERIAL_NOT_IN_SLOT/);
 d.patterns.rows[0].guid=d.patterns.rows[1].guid;assert.throws(()=>resolveNativeRugMaterial(d,32709745,207),/PATTERN/);
 d=sources();d.base.rows[0].bindings[0][0]='wrong';assert.throws(()=>resolveNativeRugMaterial(d,32709745,207),/BASE_LINK/);
 d=sources();d.variants.rows.find(x=>x[0]===207)[15]=true;assert.throws(()=>resolveNativeRugMaterial(d,32709745,207),/VARIANT_LINK/);
 d=sources();d.catalog.source.definitionSha256='0'.repeat(64);assert.throws(()=>resolveNativeRugMaterial(d,32709745,207),/VERSION/);
 d=sources();d.base.materials[d.base.rows[0].bindings[0][1]].floats.GLIMMER=1;assert.throws(()=>resolveNativeRugMaterial(d,32709745,207),/FEATURES/);
});
test('GPU bridge requests exact original geometry by digest and rejects unavailable or wrong-size payload before GPU allocation',async()=>{
 const d=sources(),plan=resolveNativeRugMaterial(d,32709745,207),requests=[];
 await assert.rejects(drawNativeRugDiagnostic({},d,{itemId:32709745,materialIndex:207},async ref=>{requests.push(ref);return new ArrayBuffer(0);}),/RUG_DRAW_PAYLOAD_LENGTH/);
 assert.deepEqual(requests,[{kind:'geometry',sha256:plan.geometry.geometrySha256,bytes:7680}]);
 await assert.rejects(drawNativeRugDiagnostic({},d,{itemId:32709745,materialIndex:1},async()=>{throw Error('UNEXPECTED_READ');}),/MATERIAL_NOT_IN_SLOT/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {prepareNativePilot,resolveNativeBundle} from '../scripts/run-native-dye-pilot.mjs';

const bytes=Buffer.from('synthetic pilot preflight fixture');
const sha256=createHash('sha256').update(bytes).digest('hex');

test('native pilot preflight rejects missing, ambiguous and substituted source bundles',()=>{
 const root=mkdtempSync(join(tmpdir(),'hkia-native-pilot-'));
 try{
  const job={itemId:1,nativeBinding:{},nativeMaterial:{},publishable:false,
   originalUnityFS:{bundle:'root',sha256},
   dependencyBundleNames:['materials','definitions'],
   dependencyHashes:[{bundle:'materials',sha256},{bundle:'definitions',sha256}],
   outputRelative:'staging/variant-art/1.png'};
  writeFileSync(join(root,'root.bin'),bytes);
  writeFileSync(join(root,'materials'),bytes);
  assert.throws(()=>prepareNativePilot(job,root,root,join(root,'Unity.exe')),/MISSING_OR_AMBIGUOUS_BUNDLE definitions/);
  writeFileSync(join(root,'definitions.bin'),bytes);
  const p=prepareNativePilot(job,root,root,join(root,'Unity.exe'));
  assert.equal(p.args.filter(x=>x==='--hkia-dependency').length,2);
  assert.ok(p.args.includes('--hkia-allow-unverified-preview'));
  assert.ok(p.preview.endsWith(join('staging','variant-art','1.png')));
  assert.throws(()=>prepareNativePilot({...job,publishable:true},root,root,'Unity.exe'),/UNSUPPORTED_JOB/);
  writeFileSync(join(root,'definitions.bin'),'substitution');
  assert.throws(()=>prepareNativePilot(job,root,root,'Unity.exe'),/DEPENDENCY_SHA256 definitions/);
  writeFileSync(join(root,'root'),bytes);
  assert.throws(()=>resolveNativeBundle(root,'root'),/MISSING_OR_AMBIGUOUS_BUNDLE/);
  assert.throws(()=>resolveNativeBundle(root,'../outside'),/INVALID_BUNDLE_NAME/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

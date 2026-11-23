#!/usr/bin/env node
/** Run the original native Unity shader in an explicitly unverified staging job.
 * Usage: node scripts/run-native-dye-pilot.mjs --item-id 317580042
 *   --bundle-root <original StandaloneWindows64> --project <Unity project>
 *   --unity <Unity.exe> [--dry-run]
 *
 * Use a disposable Unity project compatible with the game's Unity version,
 * render pipeline and Windows target. Never touches the game installation.
 */
import {mkdirSync,copyFileSync,readFileSync,writeFileSync,existsSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {prepareDyeRender,originalJobInputs} from './prepare-dye-render.mjs';
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');

export function resolveNativeBundle(root,name){
 if(!/^[a-zA-Z0-9_-]+$/.test(name))throw Error('NATIVE_PILOT_INVALID_BUNDLE_NAME');
 const candidates=[join(root,name),join(root,name+'.bin')].filter(p=>existsSync(p)&&statSync(p).isFile());
 if(candidates.length!==1)throw Error('NATIVE_PILOT_MISSING_OR_AMBIGUOUS_BUNDLE '+name);
 return candidates[0];
}
export function prepareNativePilot(job,root,project,unity){
 if(!job.nativeBinding||!job.nativeMaterial||job.publishable!==false)
  throw Error('NATIVE_PILOT_UNSUPPORTED_JOB');
 root=resolve(root);project=resolve(project);unity=resolve(unity);
 const bundle=resolveNativeBundle(root,job.originalUnityFS.bundle);
 if(sha(bundle)!==job.originalUnityFS.sha256)throw Error('NATIVE_PILOT_ROOT_SHA256');
 const dependencies=job.dependencyBundleNames.map(name=>resolveNativeBundle(root,name));
 for(const expected of job.dependencyHashes){
  const dependency=resolveNativeBundle(root,expected.bundle);
  if(sha(dependency)!==expected.sha256)throw Error('NATIVE_PILOT_DEPENDENCY_SHA256 '+expected.bundle);
 }
 const jobPath=resolve(ROOT,'staging/native-pilot/'+job.itemId+'.json');
 const preview=resolve(ROOT,job.outputRelative);
 const args=['-batchmode','-quit','-projectPath',project,'-executeMethod',
  'HKIADyeVariantPilot.Run','--hkia-job',jobPath,'--hkia-bundle',bundle,
  '--hkia-preview',preview,'--hkia-allow-unverified-preview',
  ...dependencies.flatMap(p=>['--hkia-dependency',p])];
 return {unity,args,jobPath,preview,project};
}
const invoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 try{
  const args=process.argv.slice(2);
  function required(key){const i=args.indexOf(key);if(i<0||!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing '+key);return args[i+1];}
  const job=prepareDyeRender(required('--item-id'),originalJobInputs());
  const plan=prepareNativePilot(job,required('--bundle-root'),required('--project'),required('--unity'));
  if(args.includes('--dry-run'))console.log(JSON.stringify(plan,null,2));
  else{
   if(!existsSync(plan.unity)||!existsSync(join(plan.project,'ProjectSettings/ProjectVersion.txt')))
    throw Error('NATIVE_PILOT_UNITY_PROJECT_REQUIRED');
   const editorScript=join(plan.project,'Assets/Editor/HKIADyeVariantPilot.cs');
   mkdirSync(dirname(editorScript),{recursive:true});
   // Do not replace a locally modified editor script silently.
   const source=resolve(ROOT,'tools/unity/Editor/HKIADyeVariantPilot.cs');
   if(existsSync(editorScript)&&sha(source)!==sha(editorScript))
    throw Error('NATIVE_PILOT_EXISTING_EDITOR_SCRIPT_DIFFERS');
   copyFileSync(source,editorScript);
   mkdirSync(dirname(plan.jobPath),{recursive:true});
   writeFileSync(plan.jobPath,JSON.stringify(job,null,2)+'\n');
   if(existsSync(plan.preview))throw Error('NATIVE_PILOT_REMOVE_PREVIOUS_STAGING_PREVIEW');
   const run=spawnSync(plan.unity,plan.args,{stdio:'inherit',windowsHide:false});
   if(run.error||run.status!==0||!existsSync(plan.preview))throw Error('NATIVE_PILOT_RENDER_FAILED');
   console.log('Diagnostic only (not a verified game UiIcon): '+plan.preview);
  }
 }catch(e){console.error(String(e.message||e));process.exitCode=2;}
}

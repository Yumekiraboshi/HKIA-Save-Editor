#!/usr/bin/env node
// Cheap, deterministic architecture gate. No network, npm install or build required.
// This enforces objectively testable boundaries; semantic game-rule reviews remain mandatory.
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {join, relative, resolve, sep} from 'node:path';

const root=resolve(process.argv[2]??'.');
const errors=[];
const pathOf=p=>join(root,p);
const read=p=>readFileSync(pathOf(p),'utf8');
const requireFile=p=>{
 if(!existsSync(pathOf(p)))errors.push('Missing required architecture file: '+p);
};
function files(dir){
 const base=pathOf(dir);
 if(!existsSync(base))return [];
 const result=[];
 const visit=p=>{
  for(const entry of readdirSync(p,{withFileTypes:true})){
   if(entry.isSymbolicLink())continue;
   const next=join(p,entry.name);
   if(entry.isDirectory())visit(next);
   else if(entry.isFile())result.push(relative(root,next).split(sep).join('/'));
  }
 };
 visit(base);
 return result.sort();
}

const mustExist=[
 'src/main.ts','src/App.svelte','src/worker-client.ts','src/editor.worker.ts',
 'core/src/lib.rs','core/src/collection.rs','core/src/achievement.rs',
 'wasm/src/lib.rs','scripts/build-wasm.mjs','package.json','Cargo.toml'
];
mustExist.forEach(requireFile);

const source=files('src');
const illegalRuntimeJs=source.filter(p=>/\.(?:js|jsx|mjs|cjs)$/i.test(p));
for(const p of illegalRuntimeJs)
 errors.push('Production JS source is prohibited: '+p+' (use TS for UI or Rust for save operations)');

// Migrated: source-defined achievement parent mutations now live in Rust.
const legacyRules=new Map([
 ['src/achievement-progress.ts',new Set(['achievementProgressTarget'])],
 ['src/collection-eligibility.ts',new Set(['mayCreateCollectionHistory'])]
]);
// Current transport/draft-display adapters are not authoritative game-state writers.
const transportAdapters=new Set([
 'src/editor.worker.ts','src/worker-client.ts','src/achievement-draft.ts',
 'src/achievement-worker-payload.ts','src/history-details.ts'
]);
// Read-only metadata decoding is allowed in TypeScript; native save codecs are not.
const mutationName=/\b(?:export\s+)?(?:async\s+)?function\s+((?:(?:plan|toggle|mutate|patch|apply)\w*(?:Achievement|Collection|Parent|Save)\w*|(?:decode|encode|parse|serialize)(?:Save|SaveGame|Archive|Schema|MessagePack|LZ4)\w*))\s*\(/g;
const mutationVariable=/\b(?:export\s+)?(?:const|let)\s+((?:(?:plan|toggle|mutate|patch|apply)\w*(?:Achievement|Collection|Parent|Save)\w*|(?:decode|encode|parse|serialize)(?:Save|SaveGame|Archive|Schema|MessagePack|LZ4)\w*))\s*=/g;

for(const p of source){
 if(!/\.(?:ts|svelte)$/i.test(p))continue;
 const s=read(p);
 if(/(?:from\s*['"]node:|require\s*\(|\bprocess\.env\b)/.test(s))
  errors.push('Node/server-only runtime API in '+p);
 if(/\bfetch\s*\(\s*['"`]https?:\/\//.test(s)||
    /\b(?:XMLHttpRequest|WebSocket|EventSource)\s*\(/.test(s)||
    /\b(?:sendBeacon)\s*\(/.test(s))
  errors.push('Network endpoint in browser editor: '+p+' (save processing must remain local)');
 if(/\bWebAssembly\s*\./.test(s)&&p!=='src/editor.worker.ts')
  errors.push('Only src/editor.worker.ts may instantiate/access WASM: '+p);
 if(/\bnew\s+Worker\s*\(/.test(s)&&p!=='src/worker-client.ts')
  errors.push('Only src/worker-client.ts may create the native Worker: '+p);
 if(p.endsWith('.svelte')||transportAdapters.has(p))continue;
 const found=[...s.matchAll(mutationName),...s.matchAll(mutationVariable)].map(m=>m[1]);
 const permitted=legacyRules.get(p);
 for(const name of found)
  if(!permitted?.has(name))
   errors.push('Game-specific save mutation planning must be Rust-owned: '+p+'::'+name);
 // Building native AchievementValue triples in ordinary TS modules is a strong
 // signal of an unauthorized second domain-editing layer. Known debt is isolated.
 if(p.endsWith('.ts')&&!permitted&&
    /\bcomplete\s*:/.test(s)&&/\bcurrent\s*:/.test(s)&&/\bcompleted\s*:/.test(s))
  errors.push('Native achievement-state construction outside Rust/transport: '+p);
}

if(existsSync(pathOf('src/worker-client.ts'))){
 const s=read('src/worker-client.ts');
 if(!/new\s+Worker\s*\(/.test(s)||!/editor\.worker\.ts/.test(s))
  errors.push('Worker-client must use the typed module Worker');
}
if(existsSync(pathOf('src/editor.worker.ts'))){
 const s=read('src/editor.worker.ts');
 if(!/WebAssembly\.instantiate/.test(s)||!/editor\.wasm/.test(s))
  errors.push('Worker must load the Rust editor.wasm, not a JS fallback');
}
if(existsSync(pathOf('core/src/collection.rs'))){
 const s=read('core/src/collection.rs');
 for(const symbol of ['pub fn change(','pub fn change_achievement(','pub fn undo(',
   'pub fn redo(','pub fn export(']){
  if(!s.includes(symbol))errors.push('Missing authoritative Rust entrypoint: '+symbol);
 }
}
if(existsSync(pathOf('package.json'))){
 const pkg=JSON.parse(read('package.json'));
 if(!pkg.scripts?.build?.includes('build:wasm')||!pkg.scripts?.check?.includes('svelte-check'))
  errors.push('The release build must compile WASM and typecheck Svelte');
}
const sensitive=files('src').concat(files('public'),files('data'),files('tests'))
 .filter(p=>/(^|\/)\.env(?:\..*)?$|\.(?:sav|save|hks|hks1)$|(^|\/)profile\.json$/i.test(p));
for(const p of sensitive)errors.push('Potential private save/secret committed in repo: '+p);

if(errors.length){
 console.error('ARCHITECTURE CONTRACT FAILED ('+errors.length+' issue(s))');
 errors.forEach(e=>console.error(' - '+e));
 console.error('See docs/ENGINEERING_CONTRACT.md. Fix the code, not this check.');
 process.exitCode=1;
}else{
 console.log('Architecture contract passed (runtime languages, Rust/Worker boundary, no browser save-network, legacy debt isolated).');
}

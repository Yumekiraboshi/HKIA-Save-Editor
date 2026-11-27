/** Local original-asset smoke across an independently pinned staged pack.
 * No server upload, production thumbnails or native scene fidelity claim.
 * node scripts/furniture-pack-native-smoke.mjs --pack /tmp/staged-pack
 *   --manifest-sha256 <independent digest> --manifest-bytes <independent length>
 *   --item 302413286 --limit 64
 * Omit --item to scan staged models. Use --defaults-only for one case per model.
 * Use --offset to resume bounded windows. --preflight-only verifies the pack
 * and plans all cases by default, without launching a browser or rendering.
 */
import assert from 'node:assert/strict';
import {readFileSync,statSync,realpathSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {furniturePackDiagnosticCases,furniturePackDiagnosticWindow} from './furniture-pack-diagnostic-cases.mjs';
const {values:a}=parseArgs({options:{pack:{type:'string'},'manifest-sha256':{type:'string'},'manifest-bytes':{type:'string'},item:{type:'string'},'defaults-only':{type:'boolean',default:false},offset:{type:'string',default:'0'},limit:{type:'string'},'preflight-only':{type:'boolean',default:false},size:{type:'string',default:'160'},'ldr-output':{type:'string'}}});
assert.ok(a.pack&&/^[0-9a-f]{64}$/.test(a['manifest-sha256']??''),'independent manifest SHA-256 required');
const integer=(v,min,max)=>{assert.ok(typeof v==='string'&&/^\d+$/.test(v),'integer argument');const n=Number(v);assert.ok(Number.isSafeInteger(n)&&n>=min&&n<=max,'argument bounds');return n;};
const ldrOutput=a['ldr-output']??null;
assert.ok(ldrOutput===null||['linear','gamma20','srgb'].includes(ldrOutput),'explicit diagnostic LDR output');
assert.ok(!a['preflight-only']||ldrOutput===null,'LDR requires rendering');
const expected={sha256:a['manifest-sha256'],bytes:integer(a['manifest-bytes'],1,32*1024*1024)};
const size=integer(a.size,32,512),root=realpathSync(a.pack);
assert.ok(statSync(root).isDirectory(),'pack directory');
function readBounded(key,max){
 const p=realpathSync(join(root,key)),rel=relative(root,p);
 assert.ok(rel!==''&&!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('../')&&!rel.startsWith('..\\'),'outside staged pack');
 const s=statSync(p);assert.ok(s.isFile()&&s.size>0&&s.size<=max,'payload size');
 const bytes=readFileSync(p);assert.equal(bytes.length,s.size);return bytes;
}
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=readBounded('sources.json',expected.bytes);assert.equal(manifest.length,expected.bytes);assert.equal(hash(manifest),expected.sha256);
const p=JSON.parse(manifest.toString('utf8'));
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url)));
const source={catalog:read('public/inventory-ui/furniture-customization-v3.0.1.json'),variants:read('data/furniture-material-render-source-v3.0.1.json')};
const visual=read('data/furniture-visual-source-v3.0.1.json'),addressables=read('data/furniture-addressables-v3.0.1.json'),authored=read('data/furniture-preview-camera-v3.0.1.json');
const cases=furniturePackDiagnosticCases(source.catalog,p.geometry.rows.map(x=>x.itemId),a.item===undefined?undefined:integer(a.item,1,Number.MAX_SAFE_INTEGER),a['defaults-only']);
const offset=integer(a.offset,0,Number.MAX_SAFE_INTEGER);
assert.ok(offset<cases.length,'case offset');
const window=a['preflight-only']&&a.limit===undefined?{total:cases.length,offset,cases:cases.slice(offset),nextOffset:null}:furniturePackDiagnosticWindow(cases,offset,integer(a.limit??'64',1,256));
const allow=new Map();
const add=(kind,sha,bytes)=>{
 assert.ok(/^[0-9a-f]{64}$/.test(sha)&&Number.isSafeInteger(bytes)&&bytes>0&&bytes<=96*1024*1024,'payload metadata');
 const key=kind+'/'+sha+'.bin';assert.ok(!allow.has(key)||allow.get(key)===bytes,'payload collision');allow.set(key,bytes);
};
for(const g of p.geometry.rows)add('geometry',g.geometrySha256,g.geometryBytes);
for(const t of [...Object.values(p.base.textures),...p.patterns.rows,...p.additionalPatterns.rows])add('texture',t.sha256,t.bytes);
for(const t of Object.values(p.cubemaps))add('cube',t.sha256,t.bytes);
const {outputFiles}=await build({stdin:{contents:"export {fetchFurnitureSourcePack} from './src/furniture-source-pack';export {fitFurnitureMultiStaticBounds,resolveFurnitureMultiDiagnostic,furnitureNullPatternRequiresOpacity,verifyFurnitureNullPatternOpacity} from './src/furniture-multi-diagnostic';export {furniturePayloadReferences} from './src/furniture-payload-reader';export {furniturePackDiagnosticCommon,furniturePackPreflight} from './scripts/furniture-pack-preflight.mjs';export {authoredPreviewCamera} from './src/furniture-authored-transforms';export {renderFurnitureDiagnosticFrame} from './src/furniture-diagnostic-image';export {prepareDefaultFurnitureLdrDiagnostic,applyFurnitureLdrDiagnostic,applyFurnitureLdrGpuDiagnostic,compareFurnitureLdrDiagnostic} from './src/furniture-ldr-preview-diagnostic';",resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,...(a['preflight-only']?{format:'esm',platform:'node'}:{format:'iife',globalName:'NativeFurniture',platform:'browser'}),write:false,logLevel:'silent'});
if(a['preflight-only']){
 const api=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
 const base=new URL('http://127.0.0.1:4193/pack/');
 const fetchAsset=async(url,init)=>{
  assert.ok(url instanceof URL&&url.origin===base.origin&&!url.search&&!url.hash&&url.pathname.startsWith(base.pathname)&&init.method==='GET'&&init.credentials==='omit'&&init.redirect==='error','local preflight request');
  const key=url.pathname.slice(base.pathname.length);
  if(key==='sources.json')return new Response(manifest);
  const bytes=allow.get(key);assert.ok(bytes,'unlisted payload');
  const body=readBounded(key,bytes);assert.equal(body.length,bytes);
  return new Response(body);
 };
 const pack=await api.fetchFurnitureSourcePack(base,expected,source,visual,addressables,fetchAsset);
 const result=await api.furniturePackPreflight(api,pack,window.cases,authored);
 console.log(JSON.stringify({schema:'HKIA.FurniturePackPreflight.1',manifestPin:expected,sourceVersion:'3.0.1',models:p.geometry.rows.length,caseMode:a['defaults-only']?'defaults-only':'default-and-independent-slots',totalCases:window.total,offset:window.offset,nextOffset:window.nextOffset,...result},null,2));
 if(result.rejected||!result.prepared)process.exitCode=1;
}else{
 const {chromium}=await import('playwright-core');
function chrome(){if(process.env.CHROME_BIN)return process.env.CHROME_BIN;for(const n of ['google-chrome-stable','google-chrome','chromium','chromium-browser'])try{return execFileSync('which',[n],{encoding:'utf8'}).trim()}catch{}throw Error('CHROME_NOT_INSTALLED');}
const browser=await chromium.launch({headless:true,executablePath:chrome(),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage(),origin='http://127.0.0.1:4193';
 const requests=new Set(),routeFailures=[];
 await page.route('**/*',async route=>{
  try{
   const url=new URL(route.request().url());
   if(url.origin!==origin||url.search||url.hash||route.request().method()!=='GET')return await route.abort();
   if(url.pathname==='/')return await route.fulfill({contentType:'text/html',body:'<!doctype html><title>Original furniture pack diagnostic</title>'});
   if(url.pathname==='/pack/sources.json')return await route.fulfill({contentType:'application/json',body:manifest});
   if(!url.pathname.startsWith('/pack/'))return await route.abort();
   const key=url.pathname.slice(6),bytes=allow.get(key);if(!bytes)return await route.abort();
   const body=readBounded(key,bytes);assert.equal(body.length,bytes);assert.equal(hash(body),key.split('/')[1].slice(0,-4));
   requests.add(key);return await route.fulfill({contentType:'application/octet-stream',body});
  }catch(e){routeFailures.push(String(e).slice(0,300));await route.abort();}
 });
 await page.goto(origin+'/');await page.addScriptTag({content:outputFiles[0].text});
 const result=await page.evaluate(async({expected,source,visual,addressables,authored,cases,size,ldrOutput})=>{
  const api=globalThis.NativeFurniture;
  const pack=await api.fetchFurnitureSourcePack(new URL('/pack/',location.href),expected,source,visual,addressables);
  const {sources,read,cubemaps}=pack;
  const common=api.furniturePackDiagnosticCommon(api,sources,cubemaps,authored);
  const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
  // Explicitly diagnostic profile, reused for all requested tuples. The live
  // camera's effective profile, LUT format and vignette remain unresolved.
  const plan=ldrOutput===null?null:api.prepareDefaultFurnitureLdrDiagnostic(16,45,{vignetteColor:[0,0,0],vignetteAspect:1,vignetteCenter:[.5,.5],vignetteIntensity:0,vignetteSmoothness:1,output:ldrOutput});
  const out=[];
  for(const c of cases){
   let raw=null;
   try{
    const fit=api.fitFurnitureMultiStaticBounds(sources,{...common,...c});
    const frame=await api.renderFurnitureDiagnosticFrame(sources,fit.request,read,size);
    raw={sha256:await digest(frame.rgba),visiblePixels:frame.visiblePixels,hiddenRgbPixels:frame.hiddenRgbPixels,partialAlphaPixels:frame.partialAlphaPixels,changedPixels:frame.changedPixels,hiddenChangedPixels:frame.hiddenChangedPixels,renderers:frame.renderers,uniqueTextures:frame.uniqueTextures};
    if(!plan){out.push({...c,status:'rendered-diagnostic',...raw});continue;}
    // Both paths grade the identical raw readback; never redraw geometry for
    // the CPU comparison, discard hidden RGB, or silently fall back to CPU.
    const cpu=api.applyFurnitureLdrDiagnostic(frame,plan),gpu=api.applyFurnitureLdrGpuDiagnostic(frame,plan);
    const parity=api.compareFurnitureLdrDiagnostic(cpu,gpu);
    const ldr={sha256:await digest(gpu.rgba),cpuSha256:await digest(cpu.rgba),...parity,visiblePixels:gpu.visiblePixels,hiddenRgbPixels:gpu.hiddenRgbPixels,partialAlphaPixels:gpu.partialAlphaPixels,gradedChangedPixels:gpu.gradedChangedPixels,gradedHiddenChangedPixels:gpu.gradedHiddenChangedPixels};
    out.push({...c,...raw,ldr,status:parity.maxRgbError<=3?'rendered-diagnostic':'failed',...(parity.maxRgbError<=3?{}:{stage:'ldr',reason:'FURNITURE_LDR_RGB_TOLERANCE'})});
   }catch(e){out.push({...c,...(raw??{}),status:'failed',stage:raw?'ldr':'forward',reason:String(e instanceof Error?e.message:e).slice(0,300)});}
  }
  return out;
 },{expected,source,visual,addressables,authored,cases:window.cases,size,ldrOutput});
 assert.equal(result.length,window.cases.length);
 const rendered=result.filter(x=>x.status==='rendered-diagnostic'),failures=result.filter(x=>x.status==='failed');
 const reasonCounts=Object.create(null);for(const x of failures)reasonCounts[x.reason]=(reasonCounts[x.reason]??0)+1;
 console.log(JSON.stringify({schema:'HKIA.FurniturePackDiagnostic.1',manifestPin:expected,sourceVersion:'3.0.1',models:p.geometry.rows.length,caseMode:a['defaults-only']?'defaults-only':'default-and-independent-slots',totalCases:window.total,offset:window.offset,nextOffset:window.nextOffset,size,camera:'authored-relative-diagnostic',lighting:'synthetic-diagnostic',cubeOrientation:'unverified',bc1Mode:'rgb-diagnostic',runtimeRoot:'identity-diagnostic',clear:'transparent-black-diagnostic',ldr:ldrOutput===null?null:{profile:'serialized-default-only',lutSize:16,curveFormat:45,vignetteIntensity:0,output:ldrOutput,maxAllowedRgbError:3,alpha:'exact',distinctGradedFrames:new Set(rendered.map(x=>x.ldr.sha256)).size},renderFidelity:'unverified',rendered:rendered.length,failed:failures.length,distinctRawFrames:new Set(rendered.map(x=>x.sha256)).size,requests:requests.size,reasonCounts,routeFailures,result},null,2));
 if(failures.length||routeFailures.length||!rendered.length)process.exitCode=1;
}finally{await browser.close();}
}

/** End-to-end diagnostic PNG generation using original staged assets.
 * The scene remains synthetic and the output is not a native game icon.
 * node scripts/furniture-png-native-smoke.mjs --stage /tmp/furniture-stage --patterns /tmp/chair-patterns
 * Optional --pack /tmp/furniture-payload-pack exercises same-origin content-addressed transport (PR #202).
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
const {values:args}=parseArgs({options:{stage:{type:'string'},patterns:{type:'string'},pack:{type:'string'}}});
assert.ok(args.pack||args.stage&&args.patterns,'--pack or --stage and --patterns required');
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const sources={catalog:read('public/inventory-ui/furniture-customization-v3.0.1.json'),geometry:read('data/furniture-mesh-source-sample-v3.0.1.json'),base:read('data/furniture-base-material-source-v3.0.1.json'),variants:read('data/furniture-material-render-source-v3.0.1.json'),patterns:read('data/furniture-pattern-texture-sample-v3.0.1.json'),additionalPatterns:read('data/furniture-chair-pattern-sources-v3.0.1.json')};
const lights=read('data/furniture-light-region-source-v3.0.1.json');
const paths=new Map();
if(!args.pack){
const add=(kind,sha,bytes,path)=>paths.set(kind+':'+sha,{bytes,path});
for(const g of sources.geometry.rows)add('geometry',g.geometrySha256,g.geometryBytes,join(args.stage,'mesh',g.itemId+'.geometry.bin'));
for(const t of Object.values(sources.base.textures))add('texture',t.sha256,t.bytes,join(args.stage,'base',t.sha256+'.texture.bin'));
for(const t of sources.patterns.rows)add('texture',t.sha256,t.bytes,join(args.stage,'pattern',t.guid+'.texture.bin'));
for(const t of sources.additionalPatterns.rows)add('texture',t.sha256,t.bytes,join(args.patterns,t.guid+'.texture.bin'));
for(const t of Object.values(lights.cubemaps))add('cube',t.sha256,t.bytes,join(args.stage,'cube',t.sha256+'.cubemap.bin'));
}
const readPayload=p=>{const f=paths.get(p.kind+':'+p.sha256);assert.ok(f);assert.equal(f.bytes,p.bytes);const b=readFileSync(f.path);assert.equal(b.length,p.bytes);return b.toString('base64');};
const contents="export * from './src/furniture-diagnostic-image';"+(args.pack?"export * from './src/furniture-payload-reader';":"");
const {outputFiles}=await build({stdin:{contents,resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,format:'iife',globalName:'FurnitureMulti',platform:'browser',write:false,logLevel:'silent'});
function chrome(){if(process.env.CHROME_BIN)return process.env.CHROME_BIN;for(const n of ['google-chrome-stable','google-chrome','chromium','chromium-browser'])try{return execFileSync('which',[n],{encoding:'utf8'}).trim()}catch{}throw Error('CHROME_NOT_INSTALLED');}
const browser=await chromium.launch({headless:true,executablePath:chrome(),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();
 const origin='http://127.0.0.1:4192';
 const allow=new Map();
 for(const [kind,rows] of [['geometry',sources.geometry.rows.map(x=>({sha256:x.geometrySha256,bytes:x.geometryBytes}))],['texture',[...Object.values(sources.base.textures),...sources.patterns.rows,...sources.additionalPatterns.rows]],['cube',Object.values(lights.cubemaps)]])for(const row of rows)allow.set(kind+'/'+row.sha256+'.bin',row.bytes);
 const requests=[];
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==origin||url.search||url.hash||route.request().method()!=='GET')return route.abort();
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Native furniture diagnostic PNG</title>'});
  if(args.pack&&url.pathname.startsWith('/pack/')){
   const key=url.pathname.slice(6),bytes=allow.get(key);if(!bytes)return route.abort();
   const b=readFileSync(join(args.pack,key));
   assert.equal(b.length,bytes);assert.equal(createHash('sha256').update(b).digest('hex'),key.split('/')[1].slice(0,-4));
   requests.push(key);
   return route.fulfill({contentType:'application/octet-stream',body:b});
  }
  return route.abort();
 });
 await page.goto('http://127.0.0.1:4192/');if(!args.pack)await page.exposeFunction('readFurniturePayload',readPayload);await page.addScriptTag({content:outputFiles[0].text});
 const result=await page.evaluate(async({sources,lights,usePack})=>{
  if(!crypto.subtle)throw Error('WEBCRYPTO_UNAVAILABLE');
  const read=usePack?globalThis.FurnitureMulti.createFurniturePayloadReader(new URL('/pack/',location.href),globalThis.FurnitureMulti.furniturePayloadReferences(sources,Object.values(lights.cubemaps))):async p=>Uint8Array.from(atob(await globalThis.readFurniturePayload(p)),x=>x.charCodeAt(0)).buffer;
  const cube=source=>({source,orientation:{sourceSha256:source.sha256,sourceFaceForTarget:[0,1,2,3,4,5],texelOrientation:'native-webgl',evidence:'Explicit diagnostic orientation; native face parity unverified'},bc1Mode:'rgb'});
  const cubes=Object.values(lights.cubemaps).map(cube);
  const bc1Modes=Object.fromEntries([...Object.values(sources.base.textures),...sources.patterns.rows,...sources.additionalPatterns.rows].filter(t=>t.format===10).map(t=>[t.sha256,'rgb']));
  const camera=[2,1.65,3],center=[0,.43,.12],unit=a=>{const n=Math.hypot(...a);return a.map(x=>x/n);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0);
  const z=unit(camera.map((x,i)=>x-center[i])),x=unit(cross([0,1,0],z)),y=cross(z,x);
  const viewProjection=[x[0]/.71,y[0]/.71,-.2*z[0],0,x[1]/.71,y[1]/.71,-.2*z[1],0,x[2]/.71,y[2]/.71,-.2*z[2],0,-dot(x,camera)/.71,-dot(y,camera)/.71,.2*dot(z,camera)-1,1];
  const request={itemId:90163601,mountWorld:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],runtimeRoot:{position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]},fit:{extents:[.4,.5,.4],lossyScale:[1,1,1],maxObjectSize:2,considerLossyScale:false},bc1Modes,reflectionPrimary:cubes[0],reflectionSecondary:cubes[1],scene:{viewProjection,cameraPosition:camera,mainLightDirection:[.4,.8,.447213595499958],mainLightColor:[1,.9,.8],ambient:[.5,.5,.5],ambientMain:[0,0,0],ambientFill:[0,0,0],screenOcclusion:1,screenOcclusionStrength:0,reflectionBlendWeight:.5,reflectionIntensity:1,emissionMask:0,fogVarying:0,fogMultiplier:0}};
  const variants=[[364,532],[366,532],[18,532],[234,532],[235,532],[232,532],[518,532],[518,519],[518,520],[520,519]],out=[];let firstAlpha;
  
  for(const [seat,frame] of variants){
   const outcome=await globalThis.FurnitureMulti.renderFurnitureDiagnosticImage(sources,{...request,indices:[seat,frame,0]},read,160);
   if(outcome.renderers!==3)throw Error('MISSING_RENDERER');
   const img=await createImageBitmap(outcome.blob);
   const canvas=document.createElement('canvas');canvas.width=160;canvas.height=160;
   let pixels;try{if(img.width!==160||img.height!==160)throw Error('PNG_SIZE');const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);pixels=ctx.getImageData(0,0,160,160).data;}finally{img.close();canvas.width=0;canvas.height=0;}
   const alpha=pixels.filter((v,i)=>i%4===3);if(!alpha.some(v=>v>0)||!alpha.some(v=>v===0)||alpha.filter(v=>v>0).length!==outcome.visiblePixels)throw Error('PNG_ALPHA');
   if(firstAlpha&&alpha.some((v,i)=>v!==firstAlpha[i]))throw Error('ALPHA_CHANGED');
   firstAlpha??=alpha;
   const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels)),b=>b.toString(16).padStart(2,'0')).join('');
   out.push({seat,frame,sha256,visible:alpha.filter(v=>v>0).length,renderers:outcome.renderers});
  }
  if(new Set(out.map(x=>x.sha256)).size!==out.length)throw Error('IDENTICAL_VARIANTS');
  return out;
 },{sources,lights,usePack:!!args.pack});
 assert.equal(result.length,10);if(args.pack)assert.ok(requests.length>0);console.log('HKIA_CHAIR_PNG_DIAGNOSTIC_OK '+JSON.stringify({transport:args.pack?'content-addressed':'stage',requests:requests.length,result}));
}finally{await browser.close();}

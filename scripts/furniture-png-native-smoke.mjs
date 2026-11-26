/** End-to-end diagnostic PNG generation using original staged assets.
 * The scene remains synthetic and the output is not a native game icon.
 * node scripts/furniture-png-native-smoke.mjs --stage /tmp/furniture-stage --patterns /tmp/chair-patterns
 * Optional --pack exercises same-origin content-addressed transport.
 * --item rug selects the six original rug variants and uses the authored camera.
 * --authored-camera uses the source rig for chair too. --out <new directory>
 * exports diagnostic PNGs and a provenance report only after successful checks.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,realpathSync,mkdtempSync,renameSync,rmSync} from 'node:fs';
import {join,resolve,dirname,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
const {values:args}=parseArgs({options:{stage:{type:'string'},patterns:{type:'string'},pack:{type:'string'},item:{type:'string',default:'chair'},'authored-camera':{type:'boolean',default:false},out:{type:'string'}}});
assert.ok(args.pack||args.stage&&args.patterns,'--pack or --stage and --patterns required');
assert.ok(['chair','rug'].includes(args.item),'--item must be chair or rug');
const useAuthored=args['authored-camera']||args.item==='rug';
const itemId=args.item==='rug'?32709745:90163601;
const cases=args.item==='rug'?Array.from({length:6},(_,i)=>[207+i,0,0]):[[364,532,0],[366,532,0],[18,532,0],[234,532,0],[235,532,0],[232,532,0],[518,532,0],[518,519,0],[518,520,0],[520,519,0]];
let target;
if(args.out){
 const parent=realpathSync(dirname(resolve(args.out)));
 target=join(parent,resolve(args.out).split(/[\\/]/).at(-1));
 assert.ok(!existsSync(target),'output already exists');
 const roots=[fileURLToPath(new URL('../',import.meta.url)),...([args.pack,args.stage,args.patterns].filter(Boolean).map(x=>realpathSync(x)))];
 for(const root of roots){const rel=relative(root,target);assert.ok(rel!==''&&(isAbsolute(rel)||rel==='..'||rel.startsWith('../')||rel.startsWith('..\\')),'output must be outside repo and source directories');}
}
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const sources={catalog:read('public/inventory-ui/furniture-customization-v3.0.1.json'),geometry:read('data/furniture-mesh-source-sample-v3.0.1.json'),base:read('data/furniture-base-material-source-v3.0.1.json'),variants:read('data/furniture-material-render-source-v3.0.1.json'),patterns:read('data/furniture-pattern-texture-sample-v3.0.1.json'),additionalPatterns:read('data/furniture-chair-pattern-sources-v3.0.1.json')};
const lights=read('data/furniture-light-region-source-v3.0.1.json');
const authored=read('data/furniture-preview-camera-v3.0.1.json');
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
const contents="export * from './src/furniture-diagnostic-image';export {fitFurnitureMultiStaticBounds} from './src/furniture-multi-diagnostic';export {authoredPreviewCamera} from './src/furniture-authored-transforms';"+(args.pack?"export * from './src/furniture-payload-reader';":"");
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
 const result=await page.evaluate(async({sources,lights,authored,usePack,useAuthored,itemId,cases,exportPng})=>{
  if(!crypto.subtle)throw Error('WEBCRYPTO_UNAVAILABLE');
  const read=usePack?globalThis.FurnitureMulti.createFurniturePayloadReader(new URL('/pack/',location.href),globalThis.FurnitureMulti.furniturePayloadReferences(sources,Object.values(lights.cubemaps))):async p=>Uint8Array.from(atob(await globalThis.readFurniturePayload(p)),x=>x.charCodeAt(0)).buffer;
  const cube=source=>({source,orientation:{sourceSha256:source.sha256,sourceFaceForTarget:[0,1,2,3,4,5],texelOrientation:'native-webgl',evidence:'Explicit diagnostic orientation; native face parity unverified'},bc1Mode:'rgb'});
  const cubes=Object.values(lights.cubemaps).map(cube);
  const bc1Modes=Object.fromEntries([...Object.values(sources.base.textures),...sources.patterns.rows,...sources.additionalPatterns.rows].filter(t=>t.format===10).map(t=>[t.sha256,'rgb']));
  const camera=[2,1.65,3],center=[0,.43,.12],unit=a=>{const n=Math.hypot(...a);return a.map(x=>x/n);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0);
  const z=unit(camera.map((x,i)=>x-center[i])),x=unit(cross([0,1,0],z)),y=cross(z,x);
  const viewProjection=[x[0]/.71,y[0]/.71,-.2*z[0],0,x[1]/.71,y[1]/.71,-.2*z[1],0,x[2]/.71,y[2]/.71,-.2*z[2],0,-dot(x,camera)/.71,-dot(y,camera)/.71,.2*dot(z,camera)-1,1];
  const request={itemId,mountWorld:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],runtimeRoot:{position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]},fit:{extents:[.4,.5,.4],lossyScale:[1,1,1],maxObjectSize:2,considerLossyScale:false},bc1Modes,reflectionPrimary:cubes[0],reflectionSecondary:cubes[1],scene:{viewProjection,cameraPosition:camera,mainLightDirection:[.4,.8,.447213595499958],mainLightColor:[1,.9,.8],ambient:[.5,.5,.5],ambientMain:[0,0,0],ambientFill:[0,0,0],screenOcclusion:1,screenOcclusionStrength:0,reflectionBlendWeight:.5,reflectionIntensity:1,emissionMask:0,fogVarying:0,fogMultiplier:0}};
  const preview=useAuthored?globalThis.FurnitureMulti.authoredPreviewCamera(authored,1):null;
  const out=[];let firstAlpha;
  for(const indices of cases){
   let candidate={...request,indices};
   if(preview){
    candidate={...candidate,mountWorld:preview.mountWorld,scene:{...candidate.scene,viewProjection:preview.viewProjection,cameraPosition:preview.cameraPosition},
     fit:{...candidate.fit,maxObjectSize:authored.rig.maxObjectSize,considerLossyScale:authored.rig.considerLossyScale}};
    candidate=globalThis.FurnitureMulti.fitFurnitureMultiStaticBounds(sources,candidate).request;
   }
   const outcome=await globalThis.FurnitureMulti.renderFurnitureDiagnosticImage(sources,candidate,read,160);
   if(outcome.renderers!==(itemId===32709745?1:3))throw Error('MISSING_RENDERER');
   const img=await createImageBitmap(outcome.blob);
   const canvas=document.createElement('canvas');canvas.width=160;canvas.height=160;
   let pixels;try{if(img.width!==160||img.height!==160)throw Error('PNG_SIZE');const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);pixels=ctx.getImageData(0,0,160,160).data;}finally{img.close();canvas.width=0;canvas.height=0;}
   const alpha=pixels.filter((v,i)=>i%4===3);if(!alpha.some(v=>v>0)||!alpha.some(v=>v===0)||alpha.filter(v=>v>0).length!==outcome.visiblePixels)throw Error('PNG_ALPHA');
   if(firstAlpha&&alpha.some((v,i)=>v!==firstAlpha[i]))throw Error('ALPHA_CHANGED');
   firstAlpha??=alpha;
   const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels)),b=>b.toString(16).padStart(2,'0')).join('');
   const png=exportPng?await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('PNG_EXPORT'));reader.readAsDataURL(outcome.blob);}):null;
   out.push({indices,sha256,visible:alpha.filter(v=>v>0).length,renderers:outcome.renderers,png});
  }
  if(new Set(out.map(x=>x.sha256)).size!==out.length)throw Error('IDENTICAL_VARIANTS');
  return out;
 },{sources,lights,authored,usePack:!!args.pack,useAuthored,itemId,cases,exportPng:!!target});
 assert.equal(result.length,cases.length);if(args.pack)assert.ok(requests.length>0);
 const report={itemId,transport:args.pack?'content-addressed':'stage',camera:useAuthored?'authored-preview-diagnostic':'synthetic-diagnostic',lighting:'synthetic-diagnostic',cubeOrientation:'unverified',runtimeRoot:'identity-diagnostic',renderFidelity:'unverified',requests:requests.length,result:result.map(({png,...row})=>row)};
 if(target){
  const temp=mkdtempSync(join(dirname(target),'.furniture-diagnostic-'));
  try{
   for(const [i,row] of result.entries()){
    const bytes=Buffer.from(row.png,'base64');
    assert.ok(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'PNG signature');
    const file=itemId+'-'+row.indices.join('-')+'.png';
    writeFileSync(join(temp,file),bytes,{flag:'wx'});
    Object.assign(report.result[i],{file,pngSha256:createHash('sha256').update(bytes).digest('hex')});
   }
   writeFileSync(join(temp,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
   assert.ok(!existsSync(target),'output appeared');
   renameSync(temp,target);
  }finally{rmSync(temp,{recursive:true,force:true});}
 }
 console.log((args.item==='rug'?'HKIA_RUG_PNG_DIAGNOSTIC_OK ':'HKIA_CHAIR_PNG_DIAGNOSTIC_OK ')+JSON.stringify(report));
}finally{await browser.close();}

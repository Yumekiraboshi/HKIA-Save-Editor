/** Offline diagnostic only. Original staged assets are read locally, never
 * served by the production editor. Explicit scene and cube orientation JSON
 * is required; no screenshot fitting and no native fidelity claim.
 *
 * node scripts/furniture-rug-native-smoke.mjs --request /tmp/rug-scene.json \
 *   --mesh-dir /tmp/mesh --base-dir /tmp/base --pattern-dir /tmp/pattern \
 *   --cube-dir /tmp/cubes [--out /tmp/rug.png]
 * Requires playwright-core and a local Chromium installation.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
const {values:args}=parseArgs({options:{request:{type:'string'},'mesh-dir':{type:'string'},'base-dir':{type:'string'},'pattern-dir':{type:'string'},'cube-dir':{type:'string'},out:{type:'string'}}});
for(const k of ['request','mesh-dir','base-dir','pattern-dir','cube-dir'])assert.ok(args[k],'Missing --'+k);
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const sources={
 catalog:read('public/inventory-ui/furniture-customization-v3.0.1.json'),
 geometry:read('data/furniture-mesh-source-sample-v3.0.1.json'),
 base:read('data/furniture-base-material-source-v3.0.1.json'),
 variants:read('data/furniture-material-render-source-v3.0.1.json'),
 patterns:read('data/furniture-pattern-texture-sample-v3.0.1.json')
};
const lights=read('data/furniture-light-region-source-v3.0.1.json');
assert.equal(lights.schema,'HKIA.FurnitureLightRegionSource.1');assert.equal(lights.version,'3.0.1');
const request=JSON.parse(readFileSync(resolve(args.request),'utf8'));
assert.equal(request.itemId,32709745);
function cube(spec){
 const source=lights.cubemaps[spec.pathId];assert.ok(source,'Unknown native cube PathID');
 return {source,orientation:spec.orientation,bc1Mode:spec.bc1Mode};
}
const drawRequest={itemId:request.itemId,materialIndex:request.materialIndex,scene:request.scene,patternBc1Mode:request.patternBc1Mode,reflectionPrimary:cube(request.reflectionPrimary),reflectionSecondary:cube(request.reflectionSecondary)};
const paths=new Map();
function add(kind,sha,bytes,path){paths.set(kind+':'+sha,{bytes,path});}
for(const g of sources.geometry.rows)add('geometry',g.geometrySha256,g.geometryBytes,join(args['mesh-dir'],g.itemId+'.geometry.bin'));
for(const t of Object.values(sources.base.textures))add('texture',t.sha256,t.bytes,join(args['base-dir'],t.sha256+'.texture.bin'));
for(const t of sources.patterns.rows)add('texture',t.sha256,t.bytes,join(args['pattern-dir'],t.guid+'.texture.bin'));
for(const t of Object.values(lights.cubemaps))add('cube',t.sha256,t.bytes,join(args['cube-dir'],t.sha256+'.cubemap.bin'));
const readPayload=ref=>{
 const p=paths.get(ref.kind+':'+ref.sha256);assert.ok(p,'Unknown native payload');
 assert.equal(ref.bytes,p.bytes);const b=readFileSync(p.path);assert.equal(b.byteLength,ref.bytes);return b.toString('base64');
};
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/furniture-rug-diagnostic.ts',import.meta.url))],bundle:true,format:'iife',globalName:'RugDiagnostic',platform:'browser',write:false,logLevel:'silent'});
function chrome(){
 if(process.env.CHROME_BIN)return process.env.CHROME_BIN;
 for(const name of ['google-chrome-stable','google-chrome','chromium','chromium-browser'])try{return execFileSync('which',[name],{encoding:'utf8'}).trim()}catch{}
 throw Error('CHROME_NOT_INSTALLED');
}
const browser=await chromium.launch({headless:true,executablePath:chrome(),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();
 // A synthetic, intercepted localhost document provides a secure context for
 // Web Crypto; no asset bytes are sent to a server.
 await page.route('**/*',route=>route.request().url()==='http://127.0.0.1:4189/'?route.fulfill({contentType:'text/html',body:'<canvas width="512" height="512"></canvas>'}):route.abort());
 await page.goto('http://127.0.0.1:4189/');
 await page.exposeFunction('readRugPayload',readPayload);
 await page.addScriptTag({content:outputFiles[0].text});
 const result=await page.evaluate(async({sources,request})=>{
  const gl=document.querySelector('canvas').getContext('webgl2',{alpha:true,antialias:false,preserveDrawingBuffer:true});
  if(!gl||!crypto.subtle)throw Error('WEBGL2_OR_WEBCRYPTO_UNAVAILABLE');
  gl.viewport(0,0,512,512);gl.clearColor(0,0,0,0);gl.enable(gl.DEPTH_TEST);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  const outcome=await globalThis.RugDiagnostic.drawNativeRugDiagnostic(gl,sources,request,async ref=>Uint8Array.from(atob(await globalThis.readRugPayload(ref)),x=>x.charCodeAt(0)).buffer);
  const rgba=new Uint8Array(512*512*4);gl.readPixels(0,0,512,512,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
  if(gl.getError()!==gl.NO_ERROR)throw Error('READBACK_FAILED');
  let visible=0;for(let i=3;i<rgba.length;i+=4)if(rgba[i]>0)visible++;
  if(visible===0)throw Error('EMPTY_NATIVE_RUG_DIAGNOSTIC');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',rgba)),x=>x.toString(16).padStart(2,'0')).join('');
  return {...outcome,visiblePixels:visible,rgbaSha256:digest};
 },{sources,request:drawRequest});
 console.log(JSON.stringify(result,null,2));
 if(args.out)await page.locator('canvas').screenshot({path:resolve(args.out)});
}finally{await browser.close();}

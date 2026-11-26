/** Local-only browser diagnostic. No original assets are sent to a server.
 * node scripts/flower-surface-smoke.mjs --manifest /tmp/flower-surface.json --stage /tmp/stage
 * Explicit top-down diagnostic camera and synthetic tints, not a native icon.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
const {values:args}=parseArgs({options:{manifest:{type:'string'},stage:{type:'string'}}});
assert.ok(args.manifest&&args.stage,'--manifest and --stage required');
const raw=readFileSync(args.manifest);
assert.equal(createHash('sha256').update(raw).digest('hex'),'5d6781ee543214858e4d4e5b0f6cb9f5fbc86f542e8a61c662805bef7d39243a');
const rows=JSON.parse(raw.toString('utf8'));assert.equal(rows.length,25);
const paths=new Map();
for(const row of rows){
 paths.set('geometry:'+row.geometry.geometrySha256,row.geometry.geometryBytes);
 for(const t of Object.values(row.textures))paths.set('texture:'+t.sha256,t.bytes);
}
const readPayload=p=>{
 assert.match(p.sha256,/^[a-f0-9]{64}$/);assert.equal(paths.get(p.kind+':'+p.sha256),p.bytes);
 const b=readFileSync(join(args.stage,p.sha256+'.'+p.kind+'.bin'));assert.equal(b.length,p.bytes);return b.toString('base64');
};
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/flower-surface-gpu.ts',import.meta.url))],bundle:true,format:'iife',globalName:'FlowerSurface',platform:'browser',write:false,logLevel:'silent'});
function chrome(){
 if(process.env.CHROME_BIN)return process.env.CHROME_BIN;
 for(const n of ['google-chrome-stable','google-chrome','chromium','chromium-browser'])try{return execFileSync('which',[n],{encoding:'utf8'}).trim()}catch{}
 throw Error('CHROME_NOT_INSTALLED');
}
const browser=await chromium.launch({headless:true,executablePath:chrome(),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();
 await page.route('**/*',route=>route.request().url()==='http://127.0.0.1:4190/'?route.fulfill({contentType:'text/html',body:'<canvas width="128" height="128"></canvas>'}):route.abort());
 await page.goto('http://127.0.0.1:4190/');
 await page.exposeFunction('readFlowerPayload',readPayload);
 await page.addScriptTag({content:outputFiles[0].text});
 const result=await page.evaluate(async rows=>{
  const gl=document.querySelector('canvas').getContext('webgl2',{alpha:true,antialias:false,preserveDrawingBuffer:true});
  if(!gl||!crypto.subtle)throw Error('WEBGL2_OR_WEBCRYPTO_UNAVAILABLE');
  const out=[];gl.viewport(0,0,128,128);gl.clearColor(0,0,0,0);gl.enable(gl.DEPTH_TEST);
  for(const row of rows){
   const meshId=Object.keys(row.geometry.meshes)[0],m=row.geometry.meshes[meshId],[x,y,z,ex,ey,ez]=m.bounds[0],s=.9/Math.max(ex,ez);
   const clipFromObject=[s,0,0,0,0,0,-s,0,0,-s,0,0,-s*x,s*z,s*y,1];
   const source={geometry:row.geometry,meshId,textures:{baseMap:row.textures._BaseMap,patternMap:row.textures._PatternMap,comboMap:row.textures._MetallicGlossMap}};
   const draw={clipFromObject,baseST:row.baseST,patternST:row.patternST,surface:{...row.surface,baseColor:[1,1,1,1],patternColor1:[.1,.8,.2],patternColor2:[.1,.2,.9]},mipBias:0,output:'albedo'};
   const draws=[draw,{...draw,surface:{...draw.surface,patternColor1:[.8,.1,.2],patternColor2:[.8,.7,.1]}},{...draw,output:'material'}],frames=[];
   await globalThis.FlowerSurface.drawFlowerSurfaceDiagnostic(gl,source,draws,async ref=>Uint8Array.from(atob(await globalThis.readFlowerPayload(ref)),x=>x.charCodeAt(0)).buffer,{patternMap:'rgb'},()=>gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT),()=>{
    const rgba=new Uint8Array(128*128*4);gl.readPixels(0,0,128,128,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
    if(gl.getError()!==gl.NO_ERROR)throw Error('READBACK');frames.push(rgba);
   });
   let visible=0,changed=false,materialChanged=false;
   for(let i=0;i<frames[0].length;i++){
    if(i%4===3){if(frames[0][i])visible++;if(frames[0][i]!==frames[1][i])throw Error('ALPHA_CHANGED');}
    else{changed||=frames[0][i]!==frames[1][i];materialChanged||=frames[0][i]!==frames[2][i];}
   }
   if(!visible||!changed||!materialChanged)throw Error('EMPTY_OR_IDENTICAL_DRAW '+row.itemId);
   const hashes=await Promise.all(frames.map(async f=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',f)),x=>x.toString(16).padStart(2,'0')).join('')));
   out.push({itemId:row.itemId,visible,hashes});
  }
  return out;
 },rows);
 assert.equal(result.length,25);console.log('HKIA_FLOWER_SURFACE_BROWSER_OK '+JSON.stringify(result));
}finally{await browser.close();}

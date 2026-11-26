/** Offline diagnostic: actual staged native assets, explicit synthetic
 * scene and cube orientation. Not an inventory icon equivalence test.
 * node scripts/flower-forward-smoke.mjs --manifest /tmp/forward.json --stage /tmp/crown-stage
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
const {values:args}=parseArgs({options:{manifest:{type:'string'},stage:{type:'string'}}});
assert.ok(args.manifest&&args.stage,'--manifest and --stage required');
const manifest=JSON.parse(readFileSync(args.manifest,'utf8'));
assert.equal(manifest.schema,'HKIA.FlowerForwardDiagnostic.1');assert.equal(manifest.version,'3.0.1');assert.equal(manifest.rows.length,25);
const index=JSON.parse(readFileSync(new URL('../data/flower-crown-source-index-v3.0.1.json',import.meta.url)));
const ids=new Map(index.rows.map(r=>[r[0],r]));
for(const row of manifest.rows){const src=ids.get(row.itemId);assert.ok(src);assert.equal(row.guid,src[2]);assert.equal(row.geometry.geometrySha256,src[8]);ids.delete(row.itemId);}
assert.equal(ids.size,0);
const lights=JSON.parse(readFileSync(new URL('../data/furniture-light-region-source-v3.0.1.json',import.meta.url)));
const cubeSource=lights.cubemaps['-2018151570093324821'];assert.equal(cubeSource.sha256,'c2e13b5e37d9f212820201e3521dbc8aed27b695549bc4186b709efb774b7fd6');
const cube={source:cubeSource,sourceRef:['CAB-6ef5e40a482b00b1d462fae2060592ab','-2018151570093324821'],orientation:{sourceSha256:cubeSource.sha256,sourceFaceForTarget:[0,1,2,3,4,5],texelOrientation:'native-webgl',evidence:'Explicit local diagnostic orientation; game orientation not verified'},bc1Mode:'rgb'};
const paths=new Map([['cube:'+cubeSource.sha256,cubeSource.bytes]]);
for(const r of manifest.rows){
 paths.set('geometry:'+r.geometry.geometrySha256,r.geometry.geometryBytes);
 for(const t of Object.values(r.textures))paths.set('texture:'+t.sha256,t.bytes);
}
const readPayload=p=>{
 assert.match(p.sha256,/^[a-f0-9]{64}$/);assert.equal(paths.get(p.kind+':'+p.sha256),p.bytes);
 const b=readFileSync(join(args.stage,p.sha256+'.'+(p.kind==='cube'?'cubemap':p.kind)+'.bin'));assert.equal(b.length,p.bytes);return b.toString('base64');
};
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/flower-forward-diagnostic.ts',import.meta.url))],bundle:true,format:'iife',globalName:'FlowerForward',platform:'browser',write:false,logLevel:'silent'});
function chrome(){if(process.env.CHROME_BIN)return process.env.CHROME_BIN;for(const n of ['google-chrome-stable','google-chrome','chromium','chromium-browser'])try{return execFileSync('which',[n],{encoding:'utf8'}).trim()}catch{}throw Error('CHROME_NOT_INSTALLED');}
const browser=await chromium.launch({headless:true,executablePath:chrome(),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();
 await page.route('**/*',route=>route.request().url()==='http://127.0.0.1:4191/'?route.fulfill({contentType:'text/html',body:'<canvas width="128" height="128"></canvas>'}):route.abort());
 await page.goto('http://127.0.0.1:4191/');await page.exposeFunction('readFlowerPayload',readPayload);await page.addScriptTag({content:outputFiles[0].text});
 const result=await page.evaluate(async({rows,cube})=>{
  const gl=document.querySelector('canvas').getContext('webgl2',{alpha:true,antialias:false,preserveDrawingBuffer:true});
  if(!gl||!crypto.subtle||!gl.getExtension('EXT_color_buffer_float'))throw Error('WEBGL2_FLOAT_UNAVAILABLE');
  const fbo=gl.createFramebuffer(),color=gl.createTexture(),depth=gl.createRenderbuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.bindTexture(gl.TEXTURE_2D,color);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,128,128,0,gl.RGBA,gl.FLOAT,null);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,color,0);
  gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,128,128);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('FBO');
  gl.viewport(0,0,128,128);gl.clearColor(0,0,0,0);gl.enable(gl.DEPTH_TEST);const out=[];
  try{
   for(const row of rows){
    const [x,y,z,ex,ey,ez]=row.geometry.meshes[row.meshId].bounds[0],s=.9/Math.max(ex,ez);
    const scene={model:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],viewProjection:[s,0,0,0,0,0,-s,0,0,-s,0,0,-s*x,s*z,s*y,1],normalMatrix:[1,0,0,0,1,0,0,0,1],tangentParity:1,cameraPosition:[x,y+3,z],lightDirection:[.4,.8,.447213595499958],lightColor:[1,.7,.5],ambient:[.3,.5,.6],fogMain:[0,0,0],fogFill:[0,0,0],screenOcclusion:1,screenOcclusionStrength:0,fogVarying:0,fogMultiplier:0,mipBias:0};
    const material={...row.material,patternColor1:[.1,.8,.2],patternColor2:[.1,.2,.9]};
    const draws=[{scene,material},{scene:{...scene,lightDirection:[-.4,.8,.447213595499958],lightColor:[.5,.7,1],ambient:[.6,.3,.5]},material}];
    const frames=[];
    await globalThis.FlowerForward.drawFlowerForwardDiagnostic(gl,row,draws,cube,async p=>Uint8Array.from(atob(await globalThis.readFlowerPayload(p)),x=>x.charCodeAt(0)).buffer,{baseMap:'rgb',patternMap:'rgb',comboMap:'rgb',normalMap:'rgb'},()=>gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT),()=>{
     const b=new Float32Array(128*128*4);gl.readPixels(0,0,128,128,gl.RGBA,gl.FLOAT,b);if(gl.getError()!==gl.NO_ERROR||!b.every(Number.isFinite))throw Error('READBACK');frames.push(b);
    });
    let visible=0,changed=false;
    for(let i=0;i<frames[0].length;i++){if(i%4===3){if(frames[0][i])visible++;if(frames[0][i]!==frames[1][i])throw Error('ALPHA_CHANGED');}else changed||=frames[0][i]!==frames[1][i];}
    if(!visible||!changed)throw Error('EMPTY_OR_IDENTICAL '+row.itemId);
    out.push({itemId:row.itemId,visible,authoredReflectionAssigned:row.authoredReflectionRef!==null});
   }
   return out;
  }finally{gl.deleteFramebuffer(fbo);gl.deleteRenderbuffer(depth);gl.deleteTexture(color);}
 },{rows:manifest.rows,cube});
 assert.equal(result.length,25);assert.equal(result.filter(r=>r.authoredReflectionAssigned).length,22);
 console.log('HKIA_FLOWER_FORWARD_BROWSER_OK '+JSON.stringify(result));
}finally{await browser.close();}

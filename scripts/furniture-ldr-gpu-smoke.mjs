/** Real browser parity diagnostic for the LDR GPU path; synthetic source frames only. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
const entry=fileURLToPath(new URL('../src/furniture-ldr-preview-diagnostic.ts',import.meta.url));
const {outputFiles}=await build({entryPoints:[entry],bundle:true,format:'iife',globalName:'HKIAGrade',platform:'browser',write:false,logLevel:'silent'});
function chrome(){if(process.env.CHROME_BIN)return process.env.CHROME_BIN;for(const n of ['google-chrome-stable','google-chrome','chromium','chromium-browser'])try{return execFileSync('which',[n],{encoding:'utf8'}).trim()}catch{}throw Error('CHROME_NOT_INSTALLED');}
const browser=await chromium.launch({headless:true,executablePath:chrome(),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();await page.setContent('<title>LDR GPU diagnostic</title>');
 await page.addScriptTag({content:outputFiles[0].text});
 const results=await page.evaluate(()=>{
  const H=globalThis.HKIAGrade,size=32,clearRgba=[49,77,121,0],rgba=new Uint8Array(size*size*4);
  for(let i=0;i<rgba.length;i+=4)rgba.set(clearRgba,i);
  rgba.set([80,90,100,0,10,20,30,255,50,100,150,128],4);
  const frame={width:size,height:size,rgba,rowOrder:'bottom-up',clearRgba,changedPixels:3,hiddenChangedPixels:1,visiblePixels:2,hiddenRgbPixels:1022,partialAlphaPixels:1,renderers:2,uniqueTextures:6,fidelity:'forward-diagnostic-only'};
  const atlasRgba=new Uint8Array(32);
  for(let y=0;y<2;y++)for(let x=0;x<4;x++)atlasRgba.set([(x%2)*255,y*255,Math.floor(x/2)*255,255],4*(y*4+x));
  const identity={width:4,height:2,rgba:atlasRgba,parameters:[.25,.5,1],rowOrder:'bottom-up',fidelity:'diagnostic-only'};
  const rows=[];
  for(const output of ['linear','gamma20','srgb'])for(const vignetteIntensity of [0,1]){
   const post={vignetteColor:[0,0,0],vignetteAspect:1,vignetteCenter:[.5,.5],vignetteIntensity,vignetteSmoothness:1,output,exposureMultiplier:1};
   for(const [label,plan] of [['identity',{atlas:identity,post}],['serialized-default',H.prepareDefaultFurnitureLdrDiagnostic(16,45,post)]]){
    const cpu=H.applyFurnitureLdrDiagnostic(frame,plan),gpu=H.applyFurnitureLdrGpuDiagnostic(frame,plan);
    let maxRgbError=0;
    for(let i=0;i<rgba.length;i++){
     if(i%4===3){if(gpu.rgba[i]!==rgba[i])throw Error('ALPHA_CHANGED');}
     else maxRgbError=Math.max(maxRgbError,Math.abs(cpu.rgba[i]-gpu.rgba[i]));
    }
    rows.push({label,output,vignetteIntensity,maxRgbError,changed:gpu.gradedChangedPixels,hidden:gpu.gradedHiddenChangedPixels,visible:gpu.visiblePixels,partial:gpu.partialAlphaPixels});
   }
  }
  return rows;
 });
 assert.equal(results.length,12);
 for(const row of results){
  assert.ok(row.maxRgbError<=3,JSON.stringify(row));
  assert.equal(row.visible,2);assert.equal(row.partial,1);
  if(row.label==='identity'){assert.equal(row.changed,3);assert.equal(row.hidden,1);}
 }
 console.log('FURNITURE LDR GPU SYNTHETIC DIAGNOSTIC PASS',JSON.stringify(results));
}finally{await browser.close();}

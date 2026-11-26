/** Isolated real-WebGL2 diagnostic. Synthetic textures and geometry only.
 * Run after npm ci + installing playwright-core as in existing Chromium smoke:
 * node scripts/furniture-forwardlit-gpu-smoke.mjs
 * No game parity, native scene defaults, source asset publishing or save logic. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
const entry=fileURLToPath(new URL('../src/furniture-forwardlit-gpu.ts',import.meta.url));
const surface=fileURLToPath(new URL('../src/furniture-surface-v3.0.1.ts',import.meta.url));
const lighting=fileURLToPath(new URL('../src/furniture-lighting-v3.0.1.ts',import.meta.url));
const {outputFiles}=await build({stdin:{contents:'export * from '+JSON.stringify(entry)+';export * from '+JSON.stringify(surface)+';export * from '+JSON.stringify(lighting)+';',resolveDir:process.cwd()},bundle:true,format:'iife',globalName:'HKIADiagnostic',platform:'browser',write:false,logLevel:'silent'});
function chrome(){
 if(process.env.CHROME_BIN)return process.env.CHROME_BIN;
 for(const name of ['google-chrome-stable','google-chrome','chromium','chromium-browser'])try{return execFileSync('which',[name],{encoding:'utf8'}).trim()}catch{}
 throw Error('CHROME_NOT_INSTALLED');
}
const browser=await chromium.launch({headless:true,executablePath:chrome(),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();
 await page.setContent('<canvas width="33" height="33"></canvas>');
 await page.addScriptTag({content:outputFiles[0].text});
 const results=await page.evaluate(()=>{
  const gl=document.querySelector('canvas').getContext('webgl2',{alpha:true,antialias:false,preserveDrawingBuffer:true});
  if(!gl)throw Error('WEBGL2_REQUIRED');
  const H=globalThis.HKIADiagnostic;
  const renderer=H.createFurnitureForwardRenderer(gl);
  const vao=gl.createVertexArray(),buffer=gl.createBuffer(),index=gl.createBuffer();
  gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  const vertex=(x,y)=>[x,y,0,0,0,1,1,0,0,1,0.5,0.5,0.5,0.5];
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([...vertex(-1,-1),...vertex(3,-1),...vertex(-1,3)]),gl.STATIC_DRAW);
  for(const [location,dim,offset] of [[0,3,0],[1,3,12],[2,4,24],[4,2,40],[5,2,48]]){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,dim,gl.FLOAT,false,56,offset);}
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,index);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array([0,1,2]),gl.STATIC_DRAW);
  const tex2d=rgba=>{
   const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(rgba));
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);return t;
  };
  const cube=rgba=>{
   const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_CUBE_MAP,t);
   for(let i=0;i<6;i++)gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X+i,0,gl.RGBA8,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(rgba));
   gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
   gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MAX_LEVEL,0);return t;
  };
  const b=[100,80,50,128],p=[20,160,80,255],c=[140,50,230,255],nm=[128,128,255,255],rp=[50,90,30,255],rs=[120,40,100,255];
  const textures={baseMap:tex2d(b),patternMap:tex2d(p),comboMap:tex2d(c),normalMap:tex2d(nm),reflectionPrimary:cube(rp),reflectionSecondary:cube(rs)};
  const norm=a=>a.map(x=>x/255),identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const scene={model:identity,viewProjection:identity,normalMatrix:[1,0,0,0,1,0,0,0,1],tangentParity:1,cameraPosition:[0,0,2],mainLightDirection:[0,0,1],mainLightColor:[.5,.4,.3],ambient:[.2,.3,.4],emissionColor:[.05,.04,.03],ambientMain:[.2,.2,.2],ambientFill:[.3,.3,.3],screenOcclusion:.8,screenOcclusionStrength:.5,reflectionBlendWeight:.4,reflectionIntensity:1,reflectionStrength:1,emissionMask:.5,fogVarying:.1,fogMultiplier:.2};
  const mat={baseColor:[.8,.9,1,1],patternTint:[.7,1,.6,1],baseST:[1,1,0,0],patternST:[1,1,0,0],useBaseMapMask:true,worldUV:false,smoothnessShift:.1,metallicShift:.05,patternSmoothnessShift:.02,patternMetallicShift:.03,occlusionStrength:.9,rotationTurns:0,rotationCenter:[.5,.5]};
  const rows=[];
  gl.viewport(0,0,33,33);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.disable(gl.DITHER);
  for(const [label,material,s] of [['mixed',mat,scene],['base',{...mat,useBaseMapMask:false},scene],['pattern',{...mat,baseColor:[.8,.9,1,0]},scene],['reflection-off',mat,{...scene,reflectionStrength:0}],['reflection-secondary',mat,{...scene,reflectionBlendWeight:1}],['rim',{...mat,rim:{power:1.5,feathering:.167,intensity:1,coloring:0}}, {...scene,cameraPosition:[2,0,1]}]]){
   gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
   renderer.draw({vao,indexCount:3},textures,s,material);
   const pixels=new Uint8Array(4);gl.readPixels(16,16,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   if(gl.getError()!==gl.NO_ERROR)throw Error('READBACK_FAILED');
   const surface=H.furnitureSurface(norm(b),norm(p),norm(c),material);
   const result=H.furnitureLighting({...s,...surface,normal:H.furnitureTangentNormal(norm(nm),true),view:s.cameraPosition,rim:material.rim,reflectionPrimary:norm(rp).slice(0,3),reflectionSecondary:norm(rs).slice(0,3)});
   const expected=[...result.color.map(v=>Math.round(Math.min(1,Math.max(0,v))*255)),255];
   rows.push({label,actual:[...pixels],expected});
  }
  renderer.dispose();for(const t of Object.values(textures))gl.deleteTexture(t);gl.deleteVertexArray(vao);gl.deleteBuffer(buffer);gl.deleteBuffer(index);
  return rows;
 });
 for(const {label,actual,expected} of results){assert.equal(actual[3],255,label);assert.ok(actual.every((v,i)=>Math.abs(v-expected[i])<=2),JSON.stringify({label,actual,expected}));}
 assert.notDeepEqual(results[1].actual,results[2].actual);
 assert.notDeepEqual(results[0].actual,results[3].actual);
 console.log('FURNITURE FORWARDLIT SYNTHETIC GPU PASS',JSON.stringify(results));
}finally{await browser.close();}

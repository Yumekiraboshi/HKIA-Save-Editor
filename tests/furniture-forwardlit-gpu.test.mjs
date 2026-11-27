import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/furniture-forwardlit-gpu.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {createFurnitureForwardRenderer,validateFurnitureForwardInputs,furnitureForwardVertex,furnitureForwardFragment}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const s={model:identity,viewProjection:identity,normalMatrix:[1,0,0,0,1,0,0,0,1],tangentParity:1,cameraPosition:[0,0,2],mainLightDirection:[0,0,1],mainLightColor:[1,1,1],ambient:[.2,.2,.2],emissionColor:[0,0,0],ambientMain:[0,0,0],ambientFill:[0,0,0],screenOcclusion:1,screenOcclusionStrength:0,reflectionBlendWeight:.5,reflectionIntensity:1,reflectionStrength:1,emissionMask:0,fogVarying:0,fogMultiplier:0};
const m={baseColor:[1,1,1,1],patternTint:[1,1,1,1],baseST:[1,1,0,0],patternST:[1,1,0,0],useBaseMapMask:true,worldUV:false,smoothnessShift:0,metallicShift:0,patternSmoothnessShift:0,patternMetallicShift:0,occlusionStrength:1,rotationTurns:0,rotationCenter:[.5,.5]};
const textures=Object.fromEntries(['baseMap','patternMap','comboMap','normalMap','reflectionPrimary','reflectionSecondary'].map(k=>[k,{k}]));
const mesh={vao:{},indexCount:540};
test('requires explicit camera, lighting, transform, and source material inputs',()=>{
 assert.doesNotThrow(()=>validateFurnitureForwardInputs(s,m));
 for(const bad of [{...s,normalMatrix:[1]},{...s,mainLightDirection:[0,0,0]},{...s,tangentParity:0},{...s,reflectionBlendWeight:2},{...s,fogMultiplier:NaN}])assert.throws(()=>validateFurnitureForwardInputs(bad,m),/FURNITURE_FORWARD_INPUT/);
 for(const bad of [{...m,baseST:[1,1,0]},{...m,rotationTurns:Infinity},{...m,worldUV:1}])assert.throws(()=>validateFurnitureForwardInputs(s,bad),/FURNITURE_FORWARD_INPUT/);
});
function fake({missing='',compile=true,link=true,drawError=false}={}){
 const calls=[],deleted=[],program={},gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,NO_ERROR:0,TEXTURE0:10,TEXTURE_2D:20,TEXTURE_CUBE_MAP:21,TRIANGLES:30,UNSIGNED_SHORT:31,UNSIGNED_INT:32,
 createProgram:()=>program,createShader:type=>({type}),shaderSource:(...a)=>calls.push(['source',...a]),compileShader(){},getShaderParameter:()=>compile,getShaderInfoLog:()=>'',attachShader(){},linkProgram(){},getProgramParameter:()=>link,getProgramInfoLog:()=>'',getUniformLocation:(_p,n)=>n===missing?null:n,deleteShader:s=>deleted.push(s),deleteProgram:p=>deleted.push(p),
 isVertexArray:v=>v===mesh.vao,isTexture:t=>Object.values(textures).includes(t),getError:()=>drawError&&calls.some(c=>c[0]==='draw')?1:0,useProgram(){},bindVertexArray(){},uniformMatrix4fv(){},uniformMatrix3fv(){},uniform1f:(...a)=>calls.push(['float',...a]),uniform3fv(){},uniform4fv(){},uniform2fv(){},uniform1i:(...a)=>calls.push(['int',...a]),activeTexture:i=>calls.push(['active',i]),bindTexture:(...a)=>calls.push(['bind',...a]),drawElements:(...a)=>calls.push(['draw',...a])};
 return {gl,calls,deleted,program};
}
test('one GPU draw binds both UV paths, four material textures and two environment cubes',()=>{
 const a=fake(),renderer=createFurnitureForwardRenderer(a.gl);
 renderer.draw(mesh,textures,s,m);
 assert.deepEqual(a.calls.filter(x=>x[0]==='source').map(x=>x[2]),[furnitureForwardVertex,furnitureForwardFragment]);
 assert.deepEqual(a.calls.filter(x=>x[0]==='bind').map(x=>[x[1],x[2].k]),Object.keys(textures).map((k,i)=>[i<4?20:21,k]));
 assert.deepEqual(a.calls.filter(x=>x[0]==='draw'),[['draw',30,540,31,0]]);
 assert.throws(()=>renderer.draw(mesh,{...textures,normalMap:null},s,m),/FURNITURE_FORWARD_RESOURCES/);
 renderer.dispose();renderer.dispose();assert.equal(a.deleted.filter(x=>x===a.program).length,1);
 assert.throws(()=>renderer.draw(mesh,textures,s,m),/FURNITURE_FORWARD_DISPOSED/);
});
test('program cleanup on compile, link or missing uniforms and explicit GPU draw error',()=>{
 for(const opts of [{compile:false},{link:false},{missing:'reflectionPrimary'}]){
  const a=fake(opts);assert.throws(()=>createFurnitureForwardRenderer(a.gl),/FURNITURE_FORWARD_/);assert.ok(a.deleted.includes(a.program));
 }
 const a=fake({drawError:true}),renderer=createFurnitureForwardRenderer(a.gl);assert.throws(()=>renderer.draw(mesh,textures,s,m),/FURNITURE_FORWARD_DRAW/);renderer.dispose();
});

test('rim uniforms reset on each draw, invalid parameters refuse',()=>{
 const a=fake(),r=createFurnitureForwardRenderer(a.gl),rim={power:1.5,feathering:.167,intensity:1,coloring:0};
 r.draw(mesh,textures,s,{...m,rim});r.draw(mesh,textures,s,m);
 assert.deepEqual(a.calls.filter(x=>x[0]==='int'&&x[1]==='rimEnabled'),[['int','rimEnabled',1],['int','rimEnabled',0]]);
 assert.throws(()=>r.draw(mesh,textures,s,{...m,rim:{...rim,power:NaN}}),/FURNITURE_RIM_PARAMETERS/);
 r.dispose();
});

test('explicit ordered submesh draw uses original index count and byte offset',()=>{
 const a=fake(),renderer=createFurnitureForwardRenderer(a.gl);
 const sub={...mesh,indexCount:540,submeshes:[{firstByte:0,indexCount:300},{firstByte:600,indexCount:240}]};
 assert.throws(()=>renderer.draw(sub,textures,s,m),/DRAW_SUBMESH/);
 assert.throws(()=>renderer.draw(sub,textures,s,m,2),/DRAW_SUBMESH/);
 assert.throws(()=>renderer.draw({...sub,submeshes:[...sub.submeshes.slice(0,1),{firstByte:598,indexCount:240}]},textures,s,m,1),/DRAW_RANGE/);
 assert.equal(a.calls.filter(x=>x[0]==='draw').length,0);
 renderer.draw(sub,textures,s,m,0);renderer.draw(sub,textures,s,m,1);
 assert.deepEqual(a.calls.filter(x=>x[0]==='draw'),[['draw',30,300,31,0],['draw',30,240,31,600]]);
 renderer.dispose();
});

test('CustomLit and original combo emission switches reset between submesh draws',()=>{
 const a=fake(),r=createFurnitureForwardRenderer(a.gl);
 const sub={...mesh,indexCount:540,submeshes:[{firstByte:0,indexCount:300},{firstByte:600,indexCount:240}]};
 r.draw(sub,textures,s,{...m,worldUV:false,useBaseMapMask:false,customLit:{materialAlpha:0}},1);
 r.draw(mesh,textures,s,{...m,useComboEmissionMask:true});r.draw(mesh,textures,s,m);
 assert.deepEqual(a.calls.filter(x=>x[0]==='int'&&x[1]==='customLit').map(x=>x[2]),[1,0,0]);
 assert.deepEqual(a.calls.filter(x=>x[0]==='int'&&x[1]==='useComboEmissionMask').map(x=>x[2]),[0,1,0]);
 assert.throws(()=>r.draw(mesh,textures,s,{...m,customLit:{materialAlpha:1}}),/INPUT/);
 r.dispose();
});

test('explicit CustomLit alpha sampling is bound and resets; unknown alpha mode rejects',()=>{
 const a=fake(),r=createFurnitureForwardRenderer(a.gl),material={...m,useBaseMapMask:false,customLit:{materialAlpha:1}};
 r.draw(mesh,textures,s,material);r.draw(mesh,textures,s,m);
 assert.deepEqual(a.calls.filter(x=>x[0]==='float'&&x[1]==='materialAlpha').map(x=>x[2]),[1,0]);
 assert.throws(()=>r.draw(mesh,textures,s,{...material,customLit:{materialAlpha:.5}}),/INPUT/);
 r.dispose();
});

test('Terrain branch resets between draws and rejects incompatible modes',()=>{
 const a=fake(),r=createFurnitureForwardRenderer(a.gl),terrain={blend:.915,topTiling:.6,sideTiling:.6,topTint:[.63,.85,.33],sideTint:[.54,.69,.32],topNormalScale:.5,sideNormalScale:.5,topSmoothShift:-.5,sideSmoothShift:-.5};
 const material={...m,useBaseMapMask:false,terrain};
 r.draw(mesh,textures,s,material);r.draw(mesh,textures,s,m);
 assert.deepEqual(a.calls.filter(x=>x[0]==='int'&&x[1]==='terrainEnabled').map(x=>x[2]),[1,0]);
 assert.throws(()=>r.draw(mesh,textures,s,{...material,customLit:{materialAlpha:0}}),/TERRAIN_INPUT/);
 assert.throws(()=>r.draw(mesh,textures,s,{...material,terrain:{...terrain,blend:0}}),/TERRAIN_PARAMETERS/);
 r.dispose();
});

test('CustomLit transparent tint alpha is bounded; opaque source still requires one',()=>{
 const material={...m,useBaseMapMask:false,customLit:{materialAlpha:1}};
 for(const alpha of [0,.38,1])assert.doesNotThrow(()=>validateFurnitureForwardInputs(s,{...material,baseColor:[1,1,1,alpha]}));
 for(const alpha of [-.1,1.1,NaN])assert.throws(()=>validateFurnitureForwardInputs(s,{...material,baseColor:[1,1,1,alpha]}),/FURNITURE_FORWARD_INPUT/);
 assert.throws(()=>validateFurnitureForwardInputs(s,{...material,customLit:{materialAlpha:0},baseColor:[1,1,1,.38]}),/FURNITURE_FORWARD_INPUT/);
});

test('UInt32 draw uses original four-byte submesh offsets and unsigned-int type',()=>{
 const a=fake(),r=createFurnitureForwardRenderer(a.gl),sub={...mesh,indexFormat:1,submeshes:[{firstByte:0,indexCount:300},{firstByte:1200,indexCount:240}]};
 r.draw(sub,textures,s,m,0);r.draw(sub,textures,s,m,1);r.draw({...mesh,indexFormat:1},textures,s,m);r.draw(mesh,textures,s,m);
 assert.deepEqual(a.calls.filter(x=>x[0]==='draw'),[['draw',30,300,32,0],['draw',30,240,32,1200],['draw',30,540,32,0],['draw',30,540,31,0]]);
 r.dispose();
});

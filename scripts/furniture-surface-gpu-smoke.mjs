// Offline diagnostic only: deliberately does not implement native lighting or final icon parity.
async function runFurnitureSurfaceGpuSmoke(source,readStaged,uploadNativeGeometry,uploadNativeTexture){
const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2',{alpha:true,preserveDrawingBuffer:true});
const result={textures:[],meshes:[],variants:[]};
try{
if(!gl)throw Error('no WebGL2');const d=source;const bytes=async p=>Uint8Array.from(atob(await readStaged(p)),c=>c.charCodeAt(0)).buffer;
const textures=new Map();for(const t of [...Object.values(d.base.textures),...d.patterns.rows]){const name=(t.guid??t.sha256)+'.texture.bin';const tex=await uploadNativeTexture(gl,t,await bytes(name),t.format===10?'rgb':undefined);textures.set(t.sha256,tex);result.textures.push(t.sha256);}
const geo=[];for(const s of d.geometry.rows){const loc=Object.fromEntries(Object.entries(s.meshes).map(([id,m])=>[id,Object.fromEntries(m.channels.flatMap((c,i)=>(c[3]&15)?[[i,i]]:[]))]));const g=await uploadNativeGeometry(gl,s,await bytes(s.itemId+'.geometry.bin'),loc);geo.push(g);result.meshes.push(...g.meshes.keys());}
const vertex=`#version 300 es
precision highp float;layout(location=0) in vec3 p;layout(location=4) in vec2 uv0;layout(location=5) in vec2 uv1;uniform mat4 mvp;uniform vec4 bst,pst;uniform float rotation;uniform vec2 center;out vec2 bUv,pUv;
void main(){gl_Position=mvp*vec4(p,1.);bUv=uv0*bst.xy+bst.zw;vec2 q=uv1*pst.xy+pst.zw-center;float s=sin(rotation*6.283185307179586),c=cos(rotation*6.283185307179586);pUv=vec2(c*q.x+s*q.y,-s*q.x+c*q.y)+center;}`;
const frag=`#version 300 es
precision highp float;in vec2 bUv,pUv;uniform sampler2D baseMap,patternMap;uniform vec4 baseColor,patternTint;uniform bool useMask;out vec4 color;
void main(){vec4 b=texture(baseMap,bUv),p=texture(patternMap,pUv);float w=baseColor.a>0.?(useMask?b.a:1.):0.;vec3 v=mix(p.rgb*patternTint.rgb,b.rgb*baseColor.rgb,w);color=vec4(mix(12.92*v,1.055*pow(max(v,vec3(0)),vec3(1./2.4))-.055,step(vec3(.0031308),v)),1.);}`;
const compile=(type,src)=>{let s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};const p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,frag));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.useProgram(p);const u=n=>gl.getUniformLocation(p,n);
// Diagnostic only: original prefab camera in rig-local coordinates, original mount spawn
// position, source AABB diagonal fit; actual runtime mount and scene lighting unverified.
const cam=d.camera.transformChain[0],q=cam.rotation,[x,y,z,w]=q;
const R=[[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w],[2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w],[2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y]];
const mesh=d.geometry.rows[0],m=Object.values(mesh.meshes)[0],e=m.bounds[0].slice(3),localY=mesh.nodes[1].scale[1]*mesh.nodes[2].scale[1],fit=Math.min(1,2/Math.hypot(2*e[0],2*e[1]*localY,2*e[2]));
const pos=d.camera.mount.position,near=d.camera.camera.near,far=d.camera.camera.far,f=1/Math.tan(Math.PI*d.camera.camera.fov/360);
// Unity +Z camera forward, WebGL clip -Z. Explicit rigid inverse in rig-local space.
const view=Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>i===3?(j===3?1:0):j===3?R.reduce((sum,row,k)=>sum-row[i]*cam.position[k],0)*(i===2?-1:1):R[j][i]*(i===2?-1:1)));
const model=[[fit,0,0,pos[0]],[0,fit*localY,0,pos[1]],[0,0,fit,pos[2]],[0,0,0,1]],proj=[[f,0,0,0],[0,f,0,0],[0,0,(far+near)/(near-far),2*far*near/(near-far)],[0,0,-1,0]];const mul=(a,b)=>a.map(row=>row.map((_,j)=>row.reduce((s,v,k)=>s+v*b[k][j],0)));const mvp=mul(proj,mul(view,model));gl.uniformMatrix4fv(u('mvp'),false,Float32Array.from(mvp.flatMap((_,i)=>mvp.map(row=>row[i]))));
const base=d.base.materials[d.base.rows[0].bindings[0][1]],tex=d.base.textures[base.textures._BaseMap.texture];gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures.get(tex.sha256));gl.uniform1i(u('baseMap'),0);gl.uniform1i(u('patternMap'),1);gl.uniform4f(u('bst'),...base.textures._BaseMap.scale,...base.textures._BaseMap.offset);const gm=geo[0].meshes.get(Object.keys(mesh.meshes)[0]);gl.bindVertexArray(gm.vao);gl.enable(gl.DEPTH_TEST);gl.viewport(0,0,512,512);
for(const r of d.materials){const t=d.patterns.rows.find(t=>t.materialIndex===r[0]);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,textures.get(t.sha256));gl.uniform4fv(u('baseColor'),r[3]);gl.uniform4fv(u('patternTint'),r[8]);gl.uniform1i(u('useMask'),Number(r[4]));gl.uniform4f(u('pst'),...r[6],...r[7]);gl.uniform1f(u('rotation'),r[9]);gl.uniform2fv(u('center'),r[10].slice(0,2));gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.drawElements(gl.TRIANGLES,gm.indexCount,gl.UNSIGNED_SHORT,0);let pixels=new Uint8Array(512*512*4);gl.readPixels(0,0,512,512,gl.RGBA,gl.UNSIGNED_BYTE,pixels);if(gl.getError()!==gl.NO_ERROR)throw Error('draw');let opaque=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])opaque++;if(opaque===0)throw Error('empty render');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels)),v=>v.toString(16).padStart(2,'0')).join('');result.variants.push({id:r[0],opaque,hash});}
if(new Set(result.variants.map(v=>v.hash)).size!==6)throw Error('identical variants');for(const g of geo)g.dispose();for(const t of textures.values())gl.deleteTexture(t);result.status='ok';
}catch(e){result.status='error';result.error=String(e);}
return result;
}

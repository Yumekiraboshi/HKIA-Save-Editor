/** Browser GPU implementation of the source-derived LDR UberPost diagnostic.
 * No HDR, user LUT, bloom or native runtime profile selection. */
import {NATIVE_LDR_LUT_GLSL} from './furniture-preview-ldr-v3.0.1';
import type {FurnitureDiagnosticFrame} from './furniture-diagnostic-image';
import type {FurnitureLdrDiagnosticPlan} from './furniture-ldr-preview-diagnostic';
const VERTEX=`#version 300 es
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);}`;
const FRAGMENT=`#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D rawFrame,internalLut;
uniform vec3 lutParameters,vignetteColor;
uniform vec4 vignette,clearColor;
uniform vec2 dimensions;
uniform float exposure,vignetteSmoothness;
uniform int outputMode;
layout(location=0) out vec4 graded;
layout(location=1) out vec4 baseline;
${NATIVE_LDR_LUT_GLSL}
float toSrgb(float c){return c<=0.0031308?c*12.923210144042969:pow(abs(c),0.4166666567325592)*1.0549999475479126-0.054999999701976776;}
vec4 grade(vec4 sampleColor,vec2 uv){
 vec3 c=sampleColor.rgb;
 if(vignette.w>0.){
  vec2 q=abs(uv-vignette.xy)*vignette.w*vec2(vignette.z,1.);
  float w=vignetteSmoothness==0.?1.:pow(max(0.,1.-dot(q,q)),vignetteSmoothness);
  c*=vignetteColor+w*(1.-vignetteColor);
 }
 c=nativeLdrLut(internalLut,clamp(c*exposure,0.,1.),lutParameters);
 if(outputMode==1)c=sqrt(c);
 if(outputMode==2)c=vec3(toSrgb(c.r),toSrgb(c.g),toSrgb(c.b));
 return vec4(c,sampleColor.a);
}
void main(){vec2 uv=gl_FragCoord.xy/dimensions;graded=grade(texelFetch(rawFrame,ivec2(gl_FragCoord.xy),0),uv);baseline=grade(clearColor,uv);}`;
const fail=(s:string):never=>{throw Error('FURNITURE_LDR_GPU_'+s);};
/** Draw both the source and spatially varying clear through the identical
 * shader. The caller validates the frame and LUT; no alpha repair is applied. */
export function gradeFurnitureLdrGpu(frame:FurnitureDiagnosticFrame,plan:FurnitureLdrDiagnosticPlan,
 createCanvas:()=>HTMLCanvasElement=()=>document.createElement('canvas')){
 const p=plan.post,a=plan.atlas,{width,height}=frame;
 if(p.userLut!==undefined)fail('USER_LUT_UNSUPPORTED');
 if(!['linear','gamma20','srgb'].includes(p.output)||p.vignetteColor.length!==3||p.vignetteCenter.length!==2||
 ![...p.vignetteColor,...p.vignetteCenter,p.vignetteAspect,p.vignetteIntensity,p.vignetteSmoothness,p.exposureMultiplier].every(Number.isFinite)||
 p.vignetteIntensity<0||p.vignetteSmoothness<0||p.exposureMultiplier<0)fail('UNIFORMS');
 const canvas=createCanvas();canvas.width=width;canvas.height=height;
 let gl:WebGL2RenderingContext|null=null;
 try{
  const g=canvas.getContext('webgl2',{alpha:true,antialias:false,premultipliedAlpha:false});gl=g;
  if(!g||g.isContextLost())return fail('CONTEXT');
  if(g.getParameter(g.MAX_TEXTURE_SIZE)<Math.max(a.width,a.height,width,height))fail('TEXTURE_SIZE');
  const shader=(kind:number,code:string)=>{
   const s=g.createShader(kind);if(!s)return fail('SHADER');g.shaderSource(s,code);g.compileShader(s);
   if(!g.getShaderParameter(s,g.COMPILE_STATUS))return fail('COMPILE');return s;
  };
  const program=g.createProgram();if(!program)return fail('PROGRAM');
  g.attachShader(program,shader(g.VERTEX_SHADER,VERTEX));g.attachShader(program,shader(g.FRAGMENT_SHADER,FRAGMENT));g.linkProgram(program);
  if(!g.getProgramParameter(program,g.LINK_STATUS))fail('LINK');g.useProgram(program);
  const u=(name:string)=>{const loc=g.getUniformLocation(program,name);if(loc===null)return fail('UNIFORM');return loc;};
  const texture=(unit:number,w:number,h:number,data:Uint8Array,filter:number)=>{
   const t=g.createTexture();if(!t)return fail('TEXTURE');g.activeTexture(g.TEXTURE0+unit);g.bindTexture(g.TEXTURE_2D,t);
   g.texImage2D(g.TEXTURE_2D,0,g.RGBA8,w,h,0,g.RGBA,g.UNSIGNED_BYTE,data);
   g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,filter);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,filter);
   g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);
  };
  texture(0,width,height,frame.rgba,g.NEAREST);texture(1,a.width,a.height,a.rgba,g.LINEAR);
  g.uniform1i(u('rawFrame'),0);g.uniform1i(u('internalLut'),1);g.uniform3f(u('lutParameters'),...a.parameters);
  g.uniform3f(u('vignetteColor'),...p.vignetteColor);g.uniform4f(u('vignette'),...p.vignetteCenter,p.vignetteAspect,p.vignetteIntensity);
  g.uniform1f(u('vignetteSmoothness'),p.vignetteSmoothness);g.uniform1f(u('exposure'),p.exposureMultiplier);
  g.uniform2f(u('dimensions'),width,height);g.uniform4f(u('clearColor'),frame.clearRgba[0]/255,frame.clearRgba[1]/255,frame.clearRgba[2]/255,0);
  g.uniform1i(u('outputMode'),p.output==='linear'?0:p.output==='gamma20'?1:2);
  const fbo=g.createFramebuffer();if(!fbo)return fail('FRAMEBUFFER');g.bindFramebuffer(g.FRAMEBUFFER,fbo);
  const attachments=[g.COLOR_ATTACHMENT0,g.COLOR_ATTACHMENT1];
  for(const attachment of attachments){const b=g.createRenderbuffer();if(!b)return fail('BUFFER');g.bindRenderbuffer(g.RENDERBUFFER,b);
   g.renderbufferStorage(g.RENDERBUFFER,g.RGBA8,width,height);g.framebufferRenderbuffer(g.FRAMEBUFFER,attachment,g.RENDERBUFFER,b);}
  g.drawBuffers(attachments);if(g.checkFramebufferStatus(g.FRAMEBUFFER)!==g.FRAMEBUFFER_COMPLETE)fail('FRAMEBUFFER');
  const vao=g.createVertexArray();if(!vao)return fail('VAO');g.bindVertexArray(vao);
  g.viewport(0,0,width,height);g.disable(g.BLEND);g.disable(g.DITHER);g.disable(g.DEPTH_TEST);g.disable(g.CULL_FACE);g.disable(g.SCISSOR_TEST);
  g.drawArrays(g.TRIANGLES,0,3);
  const rgba=new Uint8Array(width*height*4),baseline=new Uint8Array(rgba.length);
  g.readBuffer(attachments[0]);g.readPixels(0,0,width,height,g.RGBA,g.UNSIGNED_BYTE,rgba);
  g.readBuffer(attachments[1]);g.readPixels(0,0,width,height,g.RGBA,g.UNSIGNED_BYTE,baseline);
  if(g.isContextLost()||g.getError()!==g.NO_ERROR)fail('READBACK');
  return {rgba,baseline};
 }finally{try{gl?.getExtension('WEBGL_lose_context')?.loseContext();}finally{canvas.width=0;canvas.height=0;}}
}

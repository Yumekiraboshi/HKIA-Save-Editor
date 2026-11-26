/** Isolated diagnostic raster output for source furniture variants.
 * The keyword-free shader emits linear values. This exports the diagnostic
 * framebuffer without claiming Unity output color conversion or icon parity. */
import {drawFurnitureMultiDiagnostic,type FurnitureMultiSources,type FurnitureMultiRequest} from './furniture-multi-diagnostic';
import type {ReadRugPayload} from './furniture-rug-diagnostic';
type Draw=typeof drawFurnitureMultiDiagnostic;
export type FurnitureDiagnosticImage={blob:Blob;visiblePixels:number;renderers:number;uniqueTextures:number;fidelity:'forward-diagnostic-only'};
export type FurnitureDiagnosticFrame={
 rgba:Uint8Array;width:number;height:number;rowOrder:'bottom-up';
 visiblePixels:number;hiddenRgbPixels:number;partialAlphaPixels:number;
 renderers:number;uniqueTextures:number;fidelity:'forward-diagnostic-only';
};
export function inspectFurnitureDiagnosticRgba(rgba:Uint8Array){
 if(rgba.length===0||rgba.length%4!==0)throw Error('FURNITURE_DIAGNOSTIC_RGBA');
 let visiblePixels=0,hiddenRgbPixels=0,partialAlphaPixels=0;
 for(let i=0;i<rgba.length;i+=4){
  if(rgba[i+3]){visiblePixels++;if(rgba[i+3]!==255)partialAlphaPixels++;}
  else if(rgba[i]||rgba[i+1]||rgba[i+2])hiddenRgbPixels++;
 }
 return {visiblePixels,hiddenRgbPixels,partialAlphaPixels};
}
/** Share one isolated context, including resource cleanup. Raw output preserves
 * all four native channel values; it is not a browser-compositable image. */
async function renderDiagnostic<T>(sources:FurnitureMultiSources,request:FurnitureMultiRequest,read:ReadRugPayload,size:number,
 createCanvas:()=>HTMLCanvasElement,draw:Draw,finish:(canvas:HTMLCanvasElement,gl:WebGL2RenderingContext,frame:FurnitureDiagnosticFrame)=>Promise<T>):Promise<T>{
 if(!Number.isInteger(size)||size<32||size>512)throw Error('FURNITURE_DIAGNOSTIC_SIZE');
 const canvas=createCanvas();canvas.width=size;canvas.height=size;
 let gl:WebGL2RenderingContext|null=null;
 try{
  gl=canvas.getContext('webgl2',{alpha:true,depth:true,antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:true});
  if(!gl||gl.isContextLost()||gl.drawingBufferWidth!==size||gl.drawingBufferHeight!==size)throw Error('FURNITURE_DIAGNOSTIC_CONTEXT');
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  gl.viewport(0,0,size,size);
  gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.disable(gl.SCISSOR_TEST);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);
  gl.colorMask(true,true,true,true);gl.clearColor(0,0,0,0);gl.clearDepth(1);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  const outcome=await draw(gl,sources,request,read);
  if(gl.isContextLost()||gl.getError()!==gl.NO_ERROR)throw Error('FURNITURE_DIAGNOSTIC_DRAW');
  const rgba=new Uint8Array(size*size*4);
  gl.readPixels(0,0,size,size,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
  if(gl.isContextLost()||gl.getError()!==gl.NO_ERROR)throw Error('FURNITURE_DIAGNOSTIC_READ');
  const counts=inspectFurnitureDiagnosticRgba(rgba);
  if(!counts.visiblePixels&&!counts.hiddenRgbPixels)throw Error('FURNITURE_DIAGNOSTIC_EMPTY');
  return await finish(canvas,gl,{rgba,width:size,height:size,rowOrder:'bottom-up',...counts,
   renderers:outcome.renderers,uniqueTextures:outcome.uniqueTextures,fidelity:'forward-diagnostic-only'});
 }finally{
  // A fresh canvas owns its context; never exhaust a browser's context limit
  // after a long sequence of individual appearance renders.
  try{gl?.getExtension('WEBGL_lose_context')?.loseContext();}finally{canvas.width=0;canvas.height=0;}
 }
}

/** Diagnostic raw frame for glass/additive materials. The RGB in zero-alpha
 * pixels is essential source evidence and must not be discarded or forced
 * opaque. No PNG or user-facing thumbnail is produced here. */
export async function renderFurnitureDiagnosticFrame(sources:FurnitureMultiSources,request:FurnitureMultiRequest,read:ReadRugPayload,size=160,
 createCanvas:()=>HTMLCanvasElement=()=>document.createElement('canvas'),draw:Draw=drawFurnitureMultiDiagnostic):Promise<FurnitureDiagnosticFrame>{
 return renderDiagnostic(sources,request,read,size,createCanvas,draw,async(_canvas,_gl,frame)=>frame);
}
export async function renderFurnitureDiagnosticImage(sources:FurnitureMultiSources,request:FurnitureMultiRequest,read:ReadRugPayload,size=160,
 createCanvas:()=>HTMLCanvasElement=()=>document.createElement('canvas'),draw:Draw=drawFurnitureMultiDiagnostic):Promise<FurnitureDiagnosticImage>{
 return renderDiagnostic(sources,request,read,size,createCanvas,draw,async(canvas,gl,frame)=>{
  // Source-authored blend modes can write RGB while retaining zero alpha.
  // Conventional PNG/browser compositing would erase these contributions.
  // Until native preview output resolution is reproduced, refuse this
  // lossy representation rather than falsely publishing an incomplete icon.
  if(frame.hiddenRgbPixels)throw Error('FURNITURE_DIAGNOSTIC_ALPHA_RESOLVE_UNVERIFIED');
  if(!frame.visiblePixels)throw Error('FURNITURE_DIAGNOSTIC_EMPTY');
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob||blob.type!=='image/png'||!blob.size||gl.isContextLost())throw Error('FURNITURE_DIAGNOSTIC_PNG');
  return {blob,visiblePixels:frame.visiblePixels,renderers:frame.renderers,uniqueTextures:frame.uniqueTextures,fidelity:'forward-diagnostic-only'};
 });
}

/** Isolated diagnostic raster output for source furniture variants.
 * The keyword-free shader emits linear values. This exports the diagnostic
 * framebuffer without claiming Unity output color conversion or icon parity. */
import {drawFurnitureMultiDiagnostic,type FurnitureMultiSources,type FurnitureMultiRequest} from './furniture-multi-diagnostic';
import type {ReadRugPayload} from './furniture-rug-diagnostic';
type Draw=typeof drawFurnitureMultiDiagnostic;
export type FurnitureDiagnosticImage={blob:Blob;visiblePixels:number;renderers:number;uniqueTextures:number;fidelity:'forward-diagnostic-only'};
export async function renderFurnitureDiagnosticImage(sources:FurnitureMultiSources,request:FurnitureMultiRequest,read:ReadRugPayload,size=160,
 createCanvas:()=>HTMLCanvasElement=()=>document.createElement('canvas'),draw:Draw=drawFurnitureMultiDiagnostic):Promise<FurnitureDiagnosticImage>{
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
  let visiblePixels=0;
  for(let i=3;i<rgba.length;i+=4)if(rgba[i])visiblePixels++;
  if(!visiblePixels)throw Error('FURNITURE_DIAGNOSTIC_EMPTY');
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob||blob.type!=='image/png'||!blob.size||gl.isContextLost())throw Error('FURNITURE_DIAGNOSTIC_PNG');
  return {blob,visiblePixels,renderers:outcome.renderers,uniqueTextures:outcome.uniqueTextures,fidelity:'forward-diagnostic-only'};
 }finally{
  // A fresh canvas owns its context; never exhaust a browser's context limit
  // after a long sequence of individual appearance renders.
  try{gl?.getExtension('WEBGL_lose_context')?.loseContext();}finally{canvas.width=0;canvas.height=0;}
 }
}

/** Connect the existing source-derived LDR stages to the actual common
 * furniture draw entry point. This is a diagnostic path, not a native icon
 * renderer: live volume, HDR, final pass, color target and AA remain unverified.
 * Never force alpha or publish an incomplete transparent PNG. */
import {renderFurnitureDiagnosticFrame,inspectFurnitureDiagnosticRgba,type FurnitureDiagnosticFrame,type FurnitureDiagnosticClearRgb} from './furniture-diagnostic-image';
import {drawFurnitureMultiDiagnostic,type FurnitureMultiSources,type FurnitureMultiRequest} from './furniture-multi-diagnostic';
import type {ReadRugPayload} from './furniture-rug-diagnostic';
import {buildNativeLdrLut,sampleNativeLdrAtlas} from './furniture-ldr-lut-builder-v3.0.1';
import {prepareNativeSerializedDefaultGrade} from './furniture-grade-uniforms-v3.0.1';
import {createNativeDefaultGradeCurveSampler,type GradeCurveFormat,DEFAULT_GRADE_CURVE_SOURCE} from './furniture-default-grade-curves-v3.0.1';
import {nativeLdrPost,type LdrPostInput,type LutRgba,type LutUv} from './furniture-preview-ldr-v3.0.1';
import {gradeFurnitureLdrGpu} from './furniture-ldr-gpu';
import {nativePreviewUiPixel,nativePreviewUiBlend,type PreviewRGB,type PreviewRGBA} from './furniture-preview-output-v3.0.1';
type Atlas=ReturnType<typeof buildNativeLdrLut>;
type Post=Omit<LdrPostInput,'color'|'uv'|'internalLut'>;
export type FurnitureLdrDiagnosticPlan={atlas:Atlas;post:Post};
export type FurnitureLdrDiagnosticFrame={
 source:FurnitureDiagnosticFrame;rgba:Uint8Array;
 gradedChangedPixels:number;gradedHiddenChangedPixels:number;
 visiblePixels:number;hiddenRgbPixels:number;partialAlphaPixels:number;
 fidelity:'ldr-uber-diagnostic-only';
};
const fail=(s:string):never=>{throw Error('FURNITURE_LDR_DIAGNOSTIC_'+s);};
const byte=(v:number)=>Number.isFinite(v)?Math.round(255*Math.max(0,Math.min(1,v))):fail('VALUE');
const normalized=(v:readonly number[],n:number)=>v.length===n&&v.every(x=>Number.isFinite(x)&&x>=0&&x<=1);
const bytes=(v:readonly number[],n:number)=>v.length===n&&v.every(x=>Number.isInteger(x)&&x>=0&&x<=255);
function checkFrame(frame:FurnitureDiagnosticFrame){
 const {width,height,rgba,clearRgba}=frame;
 if(frame.fidelity!=='forward-diagnostic-only'||frame.rowOrder!=='bottom-up'||!Number.isInteger(width)||
 width<32||width>512||height!==width||!(rgba instanceof Uint8Array)||rgba.length!==width*height*4||
 !bytes(clearRgba,4)||clearRgba[3]!==0)fail('FRAME');
}
function checkAtlas(a:Atlas){
 if(a.fidelity!=='diagnostic-only'||a.rowOrder!=='bottom-up'||!Number.isInteger(a.height)||a.height<2||a.height>65||
 a.width!==a.height*a.height||!(a.rgba instanceof Uint8Array)||a.rgba.length!==a.width*a.height*4||
 a.parameters.length!==3||a.parameters[0]!==1/a.width||a.parameters[1]!==1/a.height||a.parameters[2]!==a.height-1)fail('ATLAS');
}
/** Explicit diagnostic choice, not inferred camera values. No automatic
 * selection of the default profile for real inventory thumbnails. */
export function prepareDefaultFurnitureLdrDiagnostic(size:number,curveFormat:GradeCurveFormat,post:Omit<Post,'exposureMultiplier'|'userLut'>){
 const grade=prepareNativeSerializedDefaultGrade();
 return {atlas:buildNativeLdrLut(size,grade.uniforms,createNativeDefaultGradeCurveSampler(curveFormat)),
  post:{...post,exposureMultiplier:grade.exposureMultiplier},source:DEFAULT_GRADE_CURVE_SOURCE,curveFormat} satisfies FurnitureLdrDiagnosticPlan&{source:typeof DEFAULT_GRADE_CURVE_SOURCE;curveFormat:GradeCurveFormat};
}
/** Apply original UberPost (LDR, no bloom/tonemap) to quantized forward
 * readback. Preserve both original raw channels and graded channels.
 * Compare graded hidden RGB to a per-pixel graded clear, since vignette
 * can make even the undrawn background nonuniform. */
export function applyFurnitureLdrDiagnostic(frame:FurnitureDiagnosticFrame,plan:FurnitureLdrDiagnosticPlan):FurnitureLdrDiagnosticFrame{
 checkFrame(frame);checkAtlas(plan.atlas);
 const {width,height,clearRgba}=frame,rgba=new Uint8Array(frame.rgba.length);
 const sample=(uv:LutUv)=>sampleNativeLdrAtlas(plan.atlas,uv);
 const grade=(color:LutRgba,uv:LutUv)=>{
  const c=nativeLdrPost({...plan.post,color,uv,internalLut:plan.atlas.parameters},sample);
  return [byte(c[0]),byte(c[1]),byte(c[2]),byte(c[3])] as const;
 };
 const clear:LutRgba=[clearRgba[0]/255,clearRgba[1]/255,clearRgba[2]/255,0];
 const uniformClear=plan.post.vignetteIntensity===0?grade(clear,[.5,.5]):undefined;
 let gradedChangedPixels=0,gradedHiddenChangedPixels=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=4*(y*width+x),a=frame.rgba,uv:LutUv=[(x+.5)/width,(y+.5)/height];
  const baseline=uniformClear??grade(clear,uv);
  const same=a[i]===clearRgba[0]&&a[i+1]===clearRgba[1]&&a[i+2]===clearRgba[2]&&a[i+3]===0;
  const c=same?baseline:grade([a[i]/255,a[i+1]/255,a[i+2]/255,a[i+3]/255],uv);
  rgba.set(c,i);
  if(c[3]!==a[i+3])fail('ALPHA');
  if(c.some((v,j)=>v!==baseline[j])){
   gradedChangedPixels++;if(c[3]===0)gradedHiddenChangedPixels++;
  }
 }
 return {source:frame,rgba,gradedChangedPixels,gradedHiddenChangedPixels,...inspectFurnitureDiagnosticRgba(rgba),fidelity:'ldr-uber-diagnostic-only'};
}
/** Optional opaque comparison view. The caller explicitly chooses all UI
 * values, backdrop and the transfer functions between stored, blend and
 * display spaces. This never changes the raw or graded framebuffer. */
export function compositeFurnitureLdrDiagnostic(frame:FurnitureLdrDiagnosticFrame,ui:{
 vertex:PreviewRGBA;sampleAdd:PreviewRGBA;backdrop:PreviewRGB;
 storedToBlend:(v:PreviewRGB)=>PreviewRGB;blendToDisplay:(v:PreviewRGB)=>PreviewRGB;
}){
 checkFrame(frame.source);
 if(frame.fidelity!=='ldr-uber-diagnostic-only'||frame.rgba.length!==frame.source.rgba.length||
 !normalized(ui.vertex,4)||!normalized(ui.backdrop,3)||!ui.sampleAdd.every(Number.isFinite)||ui.sampleAdd.length!==4||
 typeof ui.storedToBlend!=='function'||typeof ui.blendToDisplay!=='function')return fail('COMPOSITE');
 const out=new Uint8Array(frame.rgba.length),dst:PreviewRGBA=[...ui.backdrop,1];
 for(let i=0;i<out.length;i+=4){
  const a=frame.rgba,c=ui.storedToBlend([a[i]/255,a[i+1]/255,a[i+2]/255]);
  if(c.length!==3||!c.every(Number.isFinite))fail('COMPOSITE_SPACE');
  const src=nativePreviewUiPixel([...c,a[i+3]/255],ui.vertex,ui.sampleAdd);
  const b=nativePreviewUiBlend(src,dst),d=ui.blendToDisplay([b[0],b[1],b[2]]);
  if(d.length!==3||!d.every(Number.isFinite))fail('COMPOSITE_SPACE');
  out.set([byte(d[0]),byte(d[1]),byte(d[2]),byte(b[3])],i);
 }
 return {rgba:out,width:frame.source.width,height:frame.source.height,rowOrder:'bottom-up' as const,fidelity:'opaque-backdrop-diagnostic-only' as const};
}
/** The shared forward renderer is the default draw implementation.
 * Explicit clear and grading choices are required; no production UI call. */
export async function renderFurnitureLdrDiagnostic(sources:FurnitureMultiSources,request:FurnitureMultiRequest,read:ReadRugPayload,
 plan:FurnitureLdrDiagnosticPlan,options:{size:number;clearRgb:FurnitureDiagnosticClearRgb},
 createCanvas:()=>HTMLCanvasElement=()=>document.createElement('canvas'),draw=drawFurnitureMultiDiagnostic){
 checkAtlas(plan.atlas);
 if(!normalized(options.clearRgb,3))fail('CLEAR');
 const frame=await renderFurnitureDiagnosticFrame(sources,request,read,options.size,createCanvas,draw,options.clearRgb);
 return applyFurnitureLdrDiagnostic(frame,plan);
}

/** GPU alternative for the explicit LDR diagnostic. The source and clear
 * are processed by the same shader, including spatial vignette. Alpha must
 * match raw readback exactly; never use this as a production icon gate. */
export function applyFurnitureLdrGpuDiagnostic(frame:FurnitureDiagnosticFrame,plan:FurnitureLdrDiagnosticPlan,
 createCanvas?:()=>HTMLCanvasElement):FurnitureLdrDiagnosticFrame{
 checkFrame(frame);checkAtlas(plan.atlas);
 const {rgba,baseline}=gradeFurnitureLdrGpu(frame,plan,createCanvas);
 let gradedChangedPixels=0,gradedHiddenChangedPixels=0;
 for(let i=0;i<rgba.length;i+=4){
  if(rgba[i+3]!==frame.rgba[i+3]||baseline[i+3]!==0)fail('ALPHA');
  if(rgba[i]!==baseline[i]||rgba[i+1]!==baseline[i+1]||rgba[i+2]!==baseline[i+2]||rgba[i+3]!==baseline[i+3]){
   gradedChangedPixels++;if(rgba[i+3]===0)gradedHiddenChangedPixels++;
  }
 }
 return {source:frame,rgba,gradedChangedPixels,gradedHiddenChangedPixels,...inspectFurnitureDiagnosticRgba(rgba),fidelity:'ldr-uber-diagnostic-only'};
}
export async function renderFurnitureLdrGpuDiagnostic(sources:FurnitureMultiSources,request:FurnitureMultiRequest,read:ReadRugPayload,
 plan:FurnitureLdrDiagnosticPlan,options:{size:number;clearRgb:FurnitureDiagnosticClearRgb},
 createCanvas:()=>HTMLCanvasElement=()=>document.createElement('canvas'),draw=drawFurnitureMultiDiagnostic){
 checkAtlas(plan.atlas);
 if(plan.post.userLut!==undefined)fail('GPU_USER_LUT_UNSUPPORTED');
 if(!normalized(options.clearRgb,3))fail('CLEAR');
 const frame=await renderFurnitureDiagnosticFrame(sources,request,read,options.size,createCanvas,draw,options.clearRgb);
 return applyFurnitureLdrGpuDiagnostic(frame,plan,createCanvas);
}

/** Compare the two implementations on the identical source frame. This is a
 * numerical diagnostic, not a measurement against a native game screenshot.
 * Alpha must exactly equal the original, including zero-alpha RGB pixels. */
export function compareFurnitureLdrDiagnostic(cpu:FurnitureLdrDiagnosticFrame,gpu:FurnitureLdrDiagnosticFrame){
 const source=cpu.source;checkFrame(source);
 if(gpu.source!==source||cpu.fidelity!=='ldr-uber-diagnostic-only'||gpu.fidelity!==cpu.fidelity||
 !(cpu.rgba instanceof Uint8Array)||!(gpu.rgba instanceof Uint8Array)||
 cpu.rgba.length!==source.rgba.length||gpu.rgba.length!==source.rgba.length)fail('COMPARE_FRAME');
 let maxRgbError=0,changedRgbPixels=0,hiddenMaxRgbError=0;
 for(let i=0;i<source.rgba.length;i+=4){
  const alpha=source.rgba[i+3];
  if(cpu.rgba[i+3]!==alpha||gpu.rgba[i+3]!==alpha)fail('COMPARE_ALPHA');
  const error=Math.max(Math.abs(cpu.rgba[i]-gpu.rgba[i]),Math.abs(cpu.rgba[i+1]-gpu.rgba[i+1]),Math.abs(cpu.rgba[i+2]-gpu.rgba[i+2]));
  maxRgbError=Math.max(maxRgbError,error);
  if(error)changedRgbPixels++;
  if(!alpha)hiddenMaxRgbError=Math.max(hiddenMaxRgbError,error);
 }
 return {maxRgbError,changedRgbPixels,hiddenMaxRgbError};
}

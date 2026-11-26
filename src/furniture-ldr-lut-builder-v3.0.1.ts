/** Steam 3.0.1 LutBuilderLdr, D3D pixel program 2.
 * Read-only display arithmetic. Inputs are prepared shader uniforms, not
 * inferred volume overrides. No HDR/tonemap selection or identity curve fallback.
 */
type V3=readonly [number,number,number];
type V4=readonly [number,number,number,number];
type V2=readonly [number,number];
type I=0|1|2;
export type NativeLdrCurve=0|1|2|3|4|5|6|7;
export type NativeLdrCurveSample=(curve:NativeLdrCurve,x:number)=>number;
export type NativeLdrBuilderUniforms={
 balance:V3;filter:V3;mixer:readonly [V3,V3,V3];hueSatContrast:V3;
 lift:V3;gamma:V3;gain:V3;shadows:V3;midtones:V3;highlights:V3;
 limits:V4;splitShadows:V4;splitHighlights:V3;
};
const f=Math.fround,sat=(x:number)=>Math.min(1,Math.max(0,x));
const rgb=(fn:(i:I)=>number):V3=>[fn(0),fn(1),fn(2)];
const dot=(a:V3,b:V3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const lum=(x:V3)=>dot(x,[f(.2126729),f(.7151522),f(.072175)]);
const valid=(v:readonly number[],n:number)=>v.length===n&&v.every(Number.isFinite);
const fail=(s:string):never=>{throw Error('FURNITURE_LDR_BUILDER_'+s);};
function validate(u:NativeLdrBuilderUniforms){
 if(![u.balance,u.filter,...u.mixer,u.hueSatContrast,u.lift,u.gamma,u.gain,u.shadows,u.midtones,u.highlights,u.splitHighlights].every(v=>valid(v,3))||
 u.mixer.length!==3||!valid(u.limits,4)||!valid(u.splitShadows,4)||u.gamma.some(x=>x<=0)||u.hueSatContrast[2]<=0||
 u.limits[1]<=u.limits[0]||u.limits[3]<=u.limits[2])fail('UNIFORMS');
}
const soft=(x:number,t:number)=>t<.5?2*t*x+(1-2*t)*x*x:2*(1-t)*x+(2*t-1)*Math.sqrt(x);
const smooth=(x:number,a:number,b:number)=>{const t=sat((x-a)/(b-a));return t*t*(3-2*t);};
const fract=(x:number)=>x-Math.floor(x);
/** First source range 49–957: flattened atlas coordinate to signed LGG RGB. */
function pregrade(uv:V2,p:V4,u:NativeLdrBuilderUniforms):V3{
 const x=uv[0]*p[0],z=Math.floor(x);
 let c:V3=[(x-z-p[2])*p[3],(uv[1]-p[2])*p[3],z*p[2]*p[3]*2];
 c=[dot(c,[f(.390405),f(.549941),f(.00892632)]),dot(c,[f(.0708416),f(.963172),f(.00135775)]),dot(c,[f(.0231082),f(.128021),f(.936245)])];
 {const v=c;c=rgb(i=>v[i]*u.balance[i]);}
 c=[dot(c,[f(2.85847),f(-1.62879),f(-.024891)]),dot(c,[f(-.210182),f(1.1582),f(.000324281)]),dot(c,[f(-.041812),f(-.118169),f(1.06867)])];
 {const v=c;c=rgb(i=>{
  const log=Math.log2(Math.max(0,v[i]*f(5.555555820465088)+f(.047995999455451965)));
  const code=log*f(.07349978387355804)-f(.027552396059036255);
  const linear=(2**((code*u.hueSatContrast[2]+f(.027552396059036255))*f(13.60548210144043))-f(.047995999455451965))*f(.17999999225139618);
  return Math.pow(Math.max(0,linear*u.filter[i]),f(.4545454680919647));
 });}
 const t=sat(lum(rgb(i=>Math.min(1,c[i])))+u.splitShadows[3]);
 {const v=c;c=rgb(i=>soft(v[i],.5+(u.splitShadows[i]-.5)*(1-t)));}
 {const v=c;c=rgb(i=>Math.pow(Math.abs(soft(v[i],.5+(u.splitHighlights[i]-.5)*t)),f(2.2)));}
 c=[dot(c,u.mixer[0]),dot(c,u.mixer[1]),dot(c,u.mixer[2])];
 const l=lum(c),a=1-smooth(l,u.limits[0],u.limits[1]),b=smooth(l,u.limits[2],u.limits[3]);
 return rgb(i=>{
  const x=c[i]*(u.shadows[i]*a+u.midtones[i]*(1-a-b)+u.highlights[i]*b)*u.gain[i]+u.lift[i];
  return Math.sign(x)*Math.pow(Math.abs(x),u.gamma[i]);
 });
}
function grade(uv:V2,p:V4,u:NativeLdrBuilderUniforms,curve:NativeLdrCurveSample):V4{
 const c=pregrade(uv,p,u),[r,g,b]=c;
 const k=f(2/3),s0=g>=b?[g,b,0,k-1]:[b,g,-1,k];
 const q=r>=s0[0]?[r,s0[1],s0[2],s0[0]]:[s0[0],s0[1],s0[3],r];
 const d=q[0]-Math.min(q[1],q[3]),eps=f(.0001);
 const h=Math.abs(q[2]+(q[3]-q[1])/(6*d+eps)),s=d/(q[0]+eps);
 const sample=(slot:NativeLdrCurve,x:number)=>{
  if(!Number.isFinite(x))return fail('CURVE_COORDINATE');
  const y=curve(slot,x);if(!Number.isFinite(y))return fail('CURVE_SAMPLE');return sat(y);
 };
 const shifted=h+u.hueSatContrast[0];
 const hueCurve=sample(4,shifted),lumCurve=sample(7,lum(c));
 let h2=shifted+hueCurve-.5;
 if(h2>1)h2-=1;else if(h2<0)h2+=1;
 const offsets=[1,k,f(1/3)];
 const out=rgb(i=>q[0]*(1+s*(sat(Math.abs(fract(h2+offsets[i])*6-3)-1)-1)));
 const l=lum(out),mult=2*lumCurve*2*sample(5,h)*2*sample(6,s)*u.hueSatContrast[1];
 const master=rgb(i=>sample(0,l+mult*(out[i]-l)+1/256));
 const channels=rgb(i=>sample((i+1) as 1|2|3,master[i]+1/256));
 return [...channels,1];
}
export function nativeLdrBuilderPixel(uv:V2,p:V4,u:NativeLdrBuilderUniforms,curve:NativeLdrCurveSample):V4{
 validate(u);
 if(!valid(uv,2)||!valid(p,4)||p[0]<2||p[2]<=0||p[3]<=0||uv.some(x=>x<0||x>1))return fail('COORDINATE');
 return grade(uv,p,u,curve);
}
/** LDR target is R8G8B8A8_UNorm in original Switch constructor.
 * CPU byte quantization is diagnostic; do not claim GPU exact rounding.
 * Explicit bounded resolution and source curve samples are required. */
export function buildNativeLdrLut(size:number,u:NativeLdrBuilderUniforms,curve:NativeLdrCurveSample){
 if(!Number.isInteger(size)||size<2||size>65)return fail('SIZE');
 validate(u);
 const width=size*size,height=size,p:V4=[size,.5/width,.5/height,size/(size-1)];
 const rgba=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const c=grade([(x+.5)/width,(y+.5)/height],p,u,curve);
  const i=4*(y*width+x);for(let j=0;j<4;j++)rgba[i+j]=Math.round(sat(c[j])*255);
 }
 return {width,height,rgba,parameters:[1/width,1/height,size-1] as V3,
  rowOrder:'bottom-up' as const,fidelity:'diagnostic-only' as const};
}
/** Explicit clamp/bilinear sampler for the generated diagnostic UNorm atlas.
 * Uses the same flattened layout consumed by nativeLdrLutSample. */
export function sampleNativeLdrAtlas(atlas:ReturnType<typeof buildNativeLdrLut>,uv:V2):V3{
 const {width,height,rgba}=atlas;
 if(!Number.isInteger(height)||height<2||height>65||width!==height*height||rgba.length!==width*height*4||!valid(uv,2))return fail('ATLAS');
 const x=sat(uv[0])*width-.5,y=sat(uv[1])*height-.5;
 const x0=Math.floor(x),y0=Math.floor(y),tx=fract(x),ty=fract(y);
 const get=(xx:number,yy:number,i:I)=>rgba[4*(Math.max(0,Math.min(height-1,yy))*width+Math.max(0,Math.min(width-1,xx)))+i]/255;
 return rgb(i=>{
  const a=get(x0,y0,i),b=get(x0+1,y0,i),c=get(x0,y0+1,i),d=get(x0+1,y0+1,i);
  const lo=a+(b-a)*tx,hi=c+(d-c)*tx;return lo+(hi-lo)*ty;
 });
}

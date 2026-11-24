/** Source-calibrated per-pixel palette transfer. Original colored sprites
 * supply the RGB texture and exact alpha; no invented region geometry.
 * Gamma is a fit parameter, not a claim about the native shader. */
const SIZE=96*96*4, PIXELS=96*96;
const HEX=/^#[0-9a-f]{6}$/;
export const CALIBRATION_METHODS=['palette-delta-v2','palette-multiply-v2'];
export function calibratedPalette(colors,channels){
 if(!Array.isArray(colors)||colors.length!==5||!colors.every(v=>v===null||typeof v==='string'&&HEX.test(v))||
  !Array.isArray(channels)||channels.length<1||new Set(channels).size!==channels.length||
  channels.some(i=>!Number.isInteger(i)||i<0||i>4||colors[i]===null))throw Error('SOURCE_FIT_REQUIRED_PALETTE_CHANNEL');
 return colors.map(v=>v===null?null:[1,3,5].map(i=>parseInt(v.slice(i,i+2),16)/255));
}
function optionsOK(o){return o&&CALIBRATION_METHODS.includes(o.method)&&Number.isFinite(o.gamma)&&o.gamma>=1&&o.gamma<=2.2&&
 Number.isFinite(o.penalty)&&o.penalty>=0&&o.penalty<=.01&&Number.isFinite(o.chromaPrior)&&o.chromaPrior>=0&&o.chromaPrior<=1&&
 Array.isArray(o.channels)&&o.channels.length>0&&o.channels.length<=5&&new Set(o.channels).size===o.channels.length&&o.channels.every(c=>Number.isInteger(c)&&c>=0&&c<5);}
export function fitCalibratedModel(input,o){
 if(!optionsOK(o)||!Array.isArray(input)||input.length<2)throw Error('SOURCE_FIT_CALIBRATION_OPTIONS');
 // Sort to make accumulation and collinear tie-breaking deterministic.
 const samples=[...input].sort((a,b)=>a.id-b.id), n=samples.length*3,delta=o.method==='palette-delta-v2',gamma=o.gamma;
 const alpha=new Uint8Array(PIXELS);
 for(let p=0;p<PIXELS;p++)alpha[p]=samples[0].rgba[p*4+3];
 for(const s of samples){
  if(s.rgba.length!==SIZE||o.channels.some(c=>!Array.isArray(s.palette[c])||s.palette[c].length!==3||s.palette[c].some(x=>!Number.isFinite(x)||x<0||x>1)))throw Error('SOURCE_FIT_CALIBRATION_DIMENSIONS');
  for(let p=0;p<PIXELS;p++)if(s.rgba[4*p+3]!==alpha[p])throw Error('SOURCE_FIT_ALPHA_MISMATCH');
 }
 const powers=samples.map(s=>s.palette.map(v=>v===null?null:v.map(x=>x**gamma)));
 const mean=Array.from({length:5},(_,i)=>o.channels.includes(i)?[0,1,2].map(c=>powers.reduce((v,s)=>v+s[i][c],0)/samples.length):null);
 const designs=[];
 for(let ai=0;ai<o.channels.length;ai++)for(let bi=ai;bi<o.channels.length;bi++){
  const a=o.channels[ai],b=ai===bi?-1:o.channels[bi];
  const x=powers.flatMap(s=>s[a].map((v,c)=>delta?v-mean[a][c]:v));
  const z=b<0?null:powers.flatMap(s=>s[b].map((v,c)=>delta?v-mean[b][c]:v));
  const ridge=delta?.0005:0;
  let xx=ridge,zz=ridge,xz=0;
  for(let k=0;k<n;k++){xx+=x[k]*x[k];if(z){zz+=z[k]*z[k];xz+=x[k]*z[k];}}
  const det=xx*zz-xz*xz;
  if(xx<1e-10||z&&det<1e-10)continue;
  designs.push({a,b,x,z,xx,zz,xz,det});
 }
 const mode=new Int8Array(PIXELS*2).fill(-1), weights=new Float64Array(PIXELS*2),base=new Float64Array(PIXELS*3),values=new Float64Array(n),y=new Float64Array(n),avg=new Float64Array(3);
 for(let p=0;p<PIXELS;p++){
  if(!alpha[p])continue;
  const at=4*p,off=3*p;avg.fill(0);
  for(let k=0;k<n;k++){values[k]=(samples[Math.floor(k/3)].rgba[at+k%3]/255)**gamma;avg[k%3]+=values[k]/samples.length;}
  let best=.001;
  for(let k=0;k<n;k++){y[k]=delta?values[k]-avg[k%3]:values[k];best+=(values[k]-avg[k%3])**2/n;}
  base.set(avg,off);
  for(const d of designs){
   let xy=0,zy=0;
   for(let k=0;k<n;k++){xy+=d.x[k]*y[k];if(d.z)zy+=d.z[k]*y[k];}
   const a=d.z?(d.zz*xy-d.xz*zy)/d.det:xy/d.xx;
   const b=d.z?(d.xx*zy-d.xz*xy)/d.det:0;
   if(a<0||b<0||a+b>1.8)continue;
   let error=d.z?o.penalty:0;
   for(let k=0;k<n;k++)error+=(d.x[k]*a+(d.z?d.z[k]*b:0)-y[k])**2/n;
   const bias=delta?[0,1,2].map(c=>avg[c]-a*mean[d.a][c]-(d.b<0?0:b*mean[d.b][c])):[0,0,0];
   if(delta){const m=(bias[0]+bias[1]+bias[2])/3;error+=o.chromaPrior*bias.reduce((v,x)=>v+(x-m)**2,0)/3;}
   if(error>=best)continue;
   best=error;mode[2*p]=d.a;mode[2*p+1]=d.b;weights[2*p]=a;weights[2*p+1]=b;base.set(bias,off);
  }
 }
 return {alpha,mode,weights,base,gamma,channels:[...o.channels]};
}
export function renderCalibratedModel(model,palette){
 const rgba=new Uint8ClampedArray(SIZE),powered=palette.map(x=>x===null?null:x.map(v=>v**model.gamma));
 if(model.channels.some(i=>!powered[i]))throw Error('SOURCE_FIT_REQUIRED_PALETTE_CHANNEL');
 for(let p=0;p<PIXELS;p++){
  if(!model.alpha[p])continue;
  const a=model.mode[p*2],b=model.mode[p*2+1];
  for(let c=0;c<3;c++){
   const v=model.base[p*3+c]+(a<0?0:model.weights[p*2]*powered[a][c])+(b<0?0:model.weights[p*2+1]*powered[b][c]);
   rgba[p*4+c]=Math.round(Math.max(0,Math.min(1,v))**(1/model.gamma)*255);
  }
  rgba[p*4+3]=model.alpha[p];
 }
 return rgba;
}
export function calibratedHoldouts(samples,options){
 if(samples.length<3)throw Error('SOURCE_FIT_THREE_ANCHORS_REQUIRED');
 return samples.map((s,i)=>{
  const predicted=renderCalibratedModel(fitCalibratedModel(samples.filter((_,j)=>j!==i),options),s.palette);let sum=0,count=0;
  for(let p=0;p<PIXELS;p++){
   if(predicted[4*p+3]!==s.rgba[4*p+3])throw Error('SOURCE_FIT_HOLDOUT_ALPHA');
   if(s.rgba[4*p+3]<128)continue;
   for(let c=0;c<3;c++){sum+=Math.abs(predicted[4*p+c]-s.rgba[4*p+c]);count++;}
  }
  if(!count)throw Error('SOURCE_FIT_EMPTY_ICON');
  return {id:s.id,mae:Math.round(sum/count*1000)/1000};
 });
}

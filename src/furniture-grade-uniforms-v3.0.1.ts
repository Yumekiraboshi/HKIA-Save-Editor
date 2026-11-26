/** Switch 3.0.1 ColorUtils / ColorGradingLutPass uniform preparation.
 * Display-only. Explicit effective volume values and Unity gamma converter
 * are required; the serialized defaults are not a camera volume fallback. */
type V3=readonly [number,number,number];
type V4=readonly [number,number,number,number];
type I=0|1|2;
export type GradeProfile={
 temperature:number;tint:number;hueShift:number;saturation:number;contrast:number;
 postExposure:number;filter:V4;mixer:readonly [V3,V3,V3];
 lift:V4;gamma:V4;gain:V4;shadows:V4;midtones:V4;highlights:V4;
 limits:V4;splitShadows:V4;splitHighlights:V4;splitBalance:number;
};
export type GammaToLinear=(value:number)=>number;
const f=Math.fround,add=(a:number,b:number)=>f(a+b),sub=(a:number,b:number)=>f(a-b),mul=(a:number,b:number)=>f(a*b),div=(a:number,b:number)=>f(a/b);
const rgb=(fn:(i:I)=>number):V3=>[fn(0),fn(1),fn(2)];
const valid=(v:readonly number[],n:number)=>v.length===n&&v.every(x=>Number.isFinite(x)&&Number.isFinite(f(x)));
const fail=(s:string):never=>{throw Error('FURNITURE_GRADE_'+s);};
const lum=(v:V3)=>add(add(mul(v[0],f(.2126729)),mul(v[1],f(.7151522))),mul(v[2],f(.072175)));
export function nativeGradeWhiteBalance(temperature:number,tint:number):V3{
 if(!valid([temperature,tint],2)||Math.abs(temperature)>100||Math.abs(tint)>100)return fail('WHITE_BALANCE');
 const t=div(f(temperature),65),ti=div(f(tint),65);
 const x=sub(f(.31271),mul(t,t<0?f(.1):f(.05)));
 const y=add(sub(sub(mul(f(2.87),x),mul(mul(3,x),x)),f(.2750950753688812)),mul(ti,f(.05)));
 const X=div(x,y),Z=div(sub(sub(1,x),y),y);
 const L=add(add(mul(f(.7328),X),f(.4296)),mul(f(-.1624),Z));
 // The native CIExyToLMS returns L, M, S; recover these directly from
 // its constants rather than using the separate shader RGB-to-LMS matrix.
 const nativeL=add(add(mul(f(.7328),X),f(.4296)),mul(f(-.1624),Z));
 const nativeM=add(add(mul(f(-.7036),X),f(1.6975)),mul(f(.0061),Z));
 const nativeS=add(add(mul(f(.003),X),f(.0136)),mul(f(.9834),Z));
 const out:V3=[div(f(.949237),nativeL),div(f(1.03542),nativeM),div(f(1.08728),nativeS)];
 if(!valid(out,3)||out.some(v=>v<=0))return fail('WHITE_BALANCE');
 return out;
}
function convert(v:V4,linear:GammaToLinear):V3{
 if(!valid(v,4))return fail('VECTOR');
 const out=rgb(i=>f(linear(f(v[i]))));
 if(!valid(out,3))return fail('GAMMA');
 return out;
}
export function nativePrepareSmh(v:V4,linear:GammaToLinear):V3{
 const c=convert(v,linear),w=f(v[3]),delta=mul(w,w<0?1:4);
 return rgb(i=>Math.max(0,add(c[i],delta)));
}
export function nativePrepareLiftGammaGain(lift:V4,gamma:V4,gain:V4,linear:GammaToLinear){
 const l=convert(lift,linear).map(x=>mul(x,f(.15))) as unknown as V3;
 const g=convert(gamma,linear).map(x=>mul(x,f(.8))) as unknown as V3;
 const a=convert(gain,linear).map(x=>mul(x,f(.8))) as unknown as V3;
 const ll=lum(l),gl=lum(g),al=lum(a);
 return {lift:rgb(i=>add(sub(l[i],ll),f(lift[3]))),
  gamma:rgb(i=>div(1,Math.max(f(.001),add(sub(g[i],gl),add(f(gamma[3]),1))))),
  gain:rgb(i=>add(sub(a[i],al),add(f(gain[3]),1)))};
}
export function nativePrepareGradeProfile(p:GradeProfile,linear:GammaToLinear){
 if(typeof linear!=='function'||!valid([p.temperature,p.tint,p.hueShift,p.saturation,p.contrast,p.postExposure,p.splitBalance],7)||
 ![p.filter,p.lift,p.gamma,p.gain,p.shadows,p.midtones,p.highlights,p.limits,p.splitShadows,p.splitHighlights].every(v=>valid(v,4))||
 p.mixer.length!==3||!p.mixer.every(v=>valid(v,3))||
 Math.abs(p.hueShift)>180||Math.abs(p.saturation)>100||Math.abs(p.contrast)>100||Math.abs(p.splitBalance)>100||
 p.limits[1]<=p.limits[0]||p.limits[3]<=p.limits[2])return fail('PROFILE');
 const uniforms={balance:nativeGradeWhiteBalance(p.temperature,p.tint),filter:convert(p.filter,linear),
  mixer:p.mixer.map(v=>rgb(i=>div(f(v[i]),100))) as unknown as readonly [V3,V3,V3],
  hueSatContrast:[div(f(p.hueShift),360),add(1,div(f(p.saturation),100)),add(1,div(f(p.contrast),100))] as V3,
  ...nativePrepareLiftGammaGain(p.lift,p.gamma,p.gain,linear),
  shadows:nativePrepareSmh(p.shadows,linear),midtones:nativePrepareSmh(p.midtones,linear),highlights:nativePrepareSmh(p.highlights,linear),
  limits:p.limits.map(f) as unknown as V4,
  splitShadows:[f(p.splitShadows[0]),f(p.splitShadows[1]),f(p.splitShadows[2]),div(f(p.splitBalance),100)] as V4,
  splitHighlights:rgb(i=>f(p.splitHighlights[i]))};
 const exposureMultiplier=f(2**f(p.postExposure));
 if(!Number.isFinite(exposureMultiplier))return fail('EXPOSURE');
 return {uniforms,exposureMultiplier};
}
/** Exact serialized values recovered from Steam DefaultVolumeProfile.
 * Returned fresh to avoid callers changing the source defaults. */
export function nativeSerializedDefaultGradeProfile():GradeProfile{
 return {temperature:0,tint:0,hueShift:0,saturation:0,contrast:0,postExposure:0,
 filter:[1,1,1,1],mixer:[[100,0,0],[0,100,0],[0,0,100]],
 lift:[1,1,1,0],gamma:[1,1,1,0],gain:[1,1,1,0],shadows:[1,1,1,0],midtones:[1,1,1,0],highlights:[1,1,1,0],
 limits:[0,f(.3),f(.55),1],splitShadows:[.5,.5,.5,1],splitHighlights:[.5,.5,.5,1],splitBalance:0};
}
/** Default profile gamma conversion only needs the native endpoint 1→1.
 * Reject any other input: do not invent the platform's native Mathf curve. */
export function prepareNativeSerializedDefaultGrade(){
 return nativePrepareGradeProfile(nativeSerializedDefaultGradeProfile(),v=>{
  if(v!==1)return fail('DEFAULT_GAMMA');return 1;
 });
}

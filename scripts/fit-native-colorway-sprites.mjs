/** Offline source-based reconstruction. No save editing, no network or guessed
 * region coordinates. Fit bounded, per-pixel one/two native palette channels
 * plus neutral lighting from genuine, aligned, already-colored game sprites.
 * These are approximate images, NOT verified native shader renders. */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const SIDE=96, PIXELS=SIDE*SIDE, SIZE=PIXELS*4;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hex=/^#[0-9a-f]{6}$/;
const clamp=x=>Math.min(255,Math.max(0,Math.round(x*255)));
export const FIT_RECIPES=[
 {family:'high-tea-long-sleeved-dress',prefix:'item_c_dyeable_tglongsleeveddress_',uiIcon:'-3327772517825296899',anchors:[936308070,980933319,993727524,1283525591,1666503382,2097599525],penalty:0.0002,count:36,meanLimit:6,worstLimit:9},
 {family:'high-tea-open-tailcoat',prefix:'item_c_dyeable_tgopentailcoat_',uiIcon:'23107242593078785',anchors:[805349350,1254337078,1274039998,2062703116],penalty:0.001,count:40,meanLimit:6,worstLimit:8}
];
export function paletteVector(colors){
 if(!Array.isArray(colors)||colors.length!==5||!colors.every(x=>typeof x==='string'&&hex.test(x)))throw Error('SOURCE_FIT_FULL_PALETTE_REQUIRED');
 return colors.map(c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255));
}
function invert(matrix){
 const n=matrix.length,a=matrix.map((r,i)=>[...r,...Array.from({length:n},(_,j)=>Number(i===j))]);
 for(let k=0;k<n;k++){
  let p=k;for(let j=k+1;j<n;j++)if(Math.abs(a[j][k])>Math.abs(a[p][k]))p=j;
  if(Math.abs(a[p][k])<1e-10)return null;
  [a[k],a[p]]=[a[p],a[k]];const v=a[k][k];for(let j=0;j<2*n;j++)a[k][j]/=v;
  for(let i=0;i<n;i++)if(i!==k){const q=a[i][k];for(let j=0;j<2*n;j++)a[i][j]-=q*a[k][j];}
 }
 return a.map(r=>r.slice(n));
}
function design(samples,channels){
 const rows=samples.flatMap(s=>[0,1,2].map(c=>[...channels.map(k=>s.palette[k][c]),1]));
 const n=channels.length+1;
 const gram=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>rows.reduce((v,r)=>v+r[i]*r[j],0)));
 const inv=invert(gram);if(!inv)return null;
 const pinv=inv.map(r=>rows.map(x=>x.reduce((v,y,i)=>v+y*r[i],0)));
 return {channels,rows,pinv};
}
export function fitColorwayModel(samples,penalty){
 if(!Array.isArray(samples)||samples.length<2||!Number.isFinite(penalty)||penalty<0)throw Error('SOURCE_FIT_SAMPLES');
 const alpha=new Uint8Array(PIXELS);
 for(let p=0;p<PIXELS;p++)alpha[p]=samples[0].rgba[p*4+3];
 for(const s of samples){
  if(s.rgba.length!==SIZE||s.palette.length!==5)throw Error('SOURCE_FIT_DIMENSIONS');
  for(let p=0;p<PIXELS;p++)if(s.rgba[p*4+3]!==alpha[p])throw Error('SOURCE_FIT_ALPHA_MISMATCH');
 }
 const choices=[];for(let i=0;i<5;i++)choices.push([i]);for(let i=0;i<5;i++)for(let j=i+1;j<5;j++)choices.push([i,j]);
 const designs=choices.map(c=>design(samples,c)).filter(Boolean);
 // Per pixel: constant RGB, or up to two nonnegative native palette
 // weights + a common neutral lighting offset. Penalize unnecessary pairs.
 const mode=new Int8Array(PIXELS*2).fill(-1),weights=new Float64Array(PIXELS*3);
 const values=new Float64Array(samples.length*3);
 for(let p=0;p<PIXELS;p++){
  if(!alpha[p])continue;
  const at=p*4,off=p*3;let k=0;
  for(const s of samples)for(let c=0;c<3;c++)values[k++]=s.rgba[at+c]/255;
  for(let c=0;c<3;c++){
   let sum=0;for(let i=c;i<values.length;i+=3)sum+=values[i];weights[off+c]=sum/samples.length;
  }
  let best=0.001;for(let i=0;i<values.length;i++)best+=(values[i]-weights[off+i%3])**2/values.length;
  for(const d of designs){
   const w=d.pinv.map(row=>row.reduce((v,x,i)=>v+x*values[i],0));
   const count=d.channels.length,bias=w[count];
   if(w.slice(0,count).some(v=>v<0)||w.slice(0,count).reduce((a,b)=>a+b,0)>1.8||bias<-.3||bias>.65)continue;
   let err=count===2?penalty:0;
   for(let i=0;i<values.length;i++)err+=(d.rows[i].reduce((v,x,j)=>v+x*w[j],0)-values[i])**2/values.length;
   if(err>=best)continue;
   best=err;mode[p*2]=d.channels[0];mode[p*2+1]=d.channels[1]??-1;
   weights[off]=w[0];weights[off+1]=count===2?w[1]:0;weights[off+2]=bias;
  }
 }
 return {alpha,mode,weights};
}
export function renderColorwayModel(model,palette){
 const rgba=new Uint8ClampedArray(SIZE);
 for(let p=0;p<PIXELS;p++){
  const a=model.alpha[p];if(!a)continue;
  const first=model.mode[p*2],second=model.mode[p*2+1],w=p*3;
  for(let c=0;c<3;c++)rgba[p*4+c]=clamp(first<0?model.weights[w+c]:
   model.weights[w]*palette[first][c]+(second<0?0:model.weights[w+1]*palette[second][c])+model.weights[w+2]);
  rgba[p*4+3]=a;
 }
 return rgba;
}
export function holdoutErrors(samples,penalty){
 return samples.map((s,i)=>{
  const model=fitColorwayModel(samples.filter((_,j)=>i!==j),penalty);
  const predicted=renderColorwayModel(model,s.palette);let sum=0,count=0;
  for(let p=0;p<PIXELS;p++){
   if(predicted[p*4+3]!==s.rgba[p*4+3])throw Error('SOURCE_FIT_HOLDOUT_ALPHA');
   if(s.rgba[p*4+3]<128)continue;
   for(let c=0;c<3;c++){sum+=Math.abs(predicted[p*4+c]-s.rgba[p*4+c]);count++;}
  }
  if(!count)throw Error('SOURCE_FIT_EMPTY_ICON');
  return {id:s.id,mae:Math.round(sum/count*1000)/1000};
 });
}
const cellKey=s=>s.group+':'+s.sheet+':'+s.cell;
export async function generateSourceFits({root,out,page,selected,palette,itemKeys,records,allGroups}){
 const source=JSON.parse(readFileSync(join(root,'public/source-colorways/index.json'),'utf8'));
 if(source.version!=='3.0.1'||source.schema!=='HKIA.NamedNativeColorwaySprite.1'||
  source.runtimeUiIconReferenceMatches!==false||source.definitionsSha256!==palette.definitions_sha256)throw Error('SOURCE_FIT_SOURCE_VERSION');
 const families={},result={};
 for(const recipe of FIT_RECIPES){
  // Resolve complete source family even when requested IDs are a subset.
  // Full exports must have all original Item IDs. Partial exports retain the
  // established recolor pipeline rather than fitting on an incomplete group.
  const members=[...selected].filter(([id])=>String(itemKeys.get(id)).startsWith(recipe.prefix));
  if(members.length!==recipe.count){if(allGroups)throw Error('SOURCE_FIT_FAMILY_COUNT '+recipe.family);continue;}
  const sourceCell=selected.get(String(recipe.anchors[0]));
  if(!sourceCell||members.some(([,s])=>cellKey(s)!==cellKey(sourceCell)))throw Error('SOURCE_FIT_SHARED_CELL '+recipe.family);
  const samples=[];
  for(const id of recipe.anchors){
   const ref=source.records[id];
   if(!ref||ref.sharedUiIconPathId!==recipe.uiIcon||ref.itemKey!==itemKeys.get(String(id))||
    ref.sourceSpriteName!=='icon_'+ref.itemKey||ref.file!==id+'.webp'||!ref.itemKey.startsWith(recipe.prefix))throw Error('SOURCE_FIT_ORIGINAL_BINDING '+id);
   const bytes=readFileSync(join(root,'public/source-colorways',ref.file));
   if(sha(bytes)!==ref.sha256)throw Error('SOURCE_FIT_ORIGINAL_HASH '+id);
   const rgba=await page.evaluate(async data=>{
    const image=new Image();image.src='data:image/webp;base64,'+data;await image.decode();
    if(image.naturalWidth!==96||image.naturalHeight!==96)throw Error('SOURCE_FIT_ORIGINAL_SIZE');
    const c=document.createElement('canvas');c.width=c.height=96;
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    return Array.from(ctx.getImageData(0,0,96,96).data);
   },bytes.toString('base64'));
   samples.push({id,palette:paletteVector(palette.records[id].colors),rgba});
  }
  const errors=holdoutErrors(samples,recipe.penalty),mean=errors.reduce((a,b)=>a+b.mae,0)/errors.length;
  const worst=Math.max(...errors.map(x=>x.mae));
  if(mean>recipe.meanLimit||worst>recipe.worstLimit)throw Error('SOURCE_FIT_HOLDOUT_LIMIT '+recipe.family+' '+JSON.stringify(errors));
  families[recipe.family]={anchorIds:recipe.anchors,anchorSha256:recipe.anchors.map(id=>source.records[id].sha256),
   sharedUiIconPathId:recipe.uiIcon,group:sourceCell.group,sheet:sourceCell.sheet,cell:sourceCell.cell,
   meanMae:Math.round(mean*1000)/1000,worstMae:worst,holdout:errors,alphaIdentical:true,method:'bounded-two-channel-neutral-lighting-v1'};
  const model=fitColorwayModel(samples,recipe.penalty);
  for(const [id,sprite] of members){
   if(source.records[id])continue; // Never replace an actual colored original.
   if(!records[id])throw Error('SOURCE_FIT_NO_BASE_PREVIEW '+id);
   const rgba=renderColorwayModel(model,paletteVector(palette.records[id].colors));
   const png=await page.evaluate(data=>{
    const c=document.createElement('canvas');c.width=c.height=96;
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.putImageData(new ImageData(new Uint8ClampedArray(data),96,96),0,0);
    return c.toDataURL('image/png').split(',')[1];
   },Array.from(rgba));
   const bytes=Buffer.from(png,'base64');
   if(bytes.toString('hex',0,8)!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==96||bytes.readUInt32BE(20)!==96||bytes[25]!==6)throw Error('SOURCE_FIT_PNG');
   mkdirSync(join(out,'source-fit'),{recursive:true});writeFileSync(join(out,'source-fit',id+'.png'),bytes);
   result[id]={file:id+'.png',sha256:sha(bytes),family:recipe.family,sourceType:'original-named-sprite-fit',fidelity:'approximate'};
  }
  console.log('HKIA_SOURCE_FIT '+JSON.stringify({family:recipe.family,anchors:recipe.anchors.length,variants:members.length,meanMae:mean,worstMae:worst}));
 }
 return {schema:'HKIA.SourceSpriteFit.1',fidelity:'approximate',families,records:result};
}

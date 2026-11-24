// Experimental offline calibration. Not native shader masks or publishable artwork.
export function fitNeutralAnchor(neutral, anchor, palette) {
 const size=96*96*4;
 if(neutral.length!==size||anchor.length!==size||palette.length!==5||palette.some(x=>x!==null&&(!Array.isArray(x)||x.length!==3||x.some(v=>!Number.isFinite(v)||v<0||v>1))))throw Error('NEUTRAL_ANCHOR_INPUT');
 const chroma=v=>{const m=(v[0]+v[1]+v[2])/3;return v.map(x=>x-m)};
 const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
 const basis=palette.map(c=>c===null?null:chroma(c));
 const channel=new Int8Array(size/4).fill(-1),weight=new Float32Array(size/4);
 let visible=0,changed=0,ambiguous=0,assigned=0;
 for(let p=0;p<size/4;p++){
  const at=p*4;
  if(neutral[at+3]!==anchor[at+3])throw Error('NEUTRAL_ANCHOR_ALPHA_MISMATCH');
  if(anchor[at+3]<128)continue;
  visible++;
  const d=chroma([0,1,2].map(c=>(anchor[at+c]-neutral[at+c])/255));
  const strength=Math.sqrt(dot(d,d));
  if(strength<.035)continue;
  changed++;
  const options=[];
  for(let k=0;k<5;k++){
   const b=basis[k];if(!b)continue;
   const norm=dot(b,b);if(norm<.0036)continue;
   const w=dot(d,b)/norm;
   if(w<.05||w>1.8)continue;
   const error=Math.sqrt(d.reduce((s,v,c)=>s+(v-w*b[c])**2,0));
   if(error<=Math.max(.025,.18*strength))options.push({k,w,error});
  }
  options.sort((a,b)=>a.error-b.error||a.k-b.k);
  if(!options.length||options[1]&&options[1].error-options[0].error<Math.max(.012,.12*strength)){ambiguous++;continue;}
  channel[p]=options[0].k;weight[p]=options[0].w;assigned++;
 }
 if(!visible)throw Error('NEUTRAL_ANCHOR_EMPTY');
 return {channel,weight,palette,anchor:Uint8ClampedArray.from(anchor),visible,changed,ambiguous,assigned};
}
export function renderNeutralAnchor(model,target){
 if(!Array.isArray(target)||target.length!==5||target.some(x=>x!==null&&(!Array.isArray(x)||x.length!==3||x.some(v=>!Number.isFinite(v)||v<0||v>1))))throw Error('NEUTRAL_ANCHOR_TARGET');
 const pixels=model.anchor.slice();
 for(let p=0;p<model.channel.length;p++){
  const k=model.channel[p];if(k<0)continue;
  if(!target[k])throw Error('NEUTRAL_ANCHOR_MISSING_TARGET_CHANNEL');
  for(let c=0;c<3;c++)pixels[p*4+c]=Math.round(Math.max(0,Math.min(255,model.anchor[p*4+c]+255*model.weight[p]*(target[k][c]-model.palette[k][c]))));
 }
 return pixels;
}

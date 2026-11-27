/** Exercise the actual flower compositor and published source pixels across
 * all species/colors and each exact native mask. No game capture parity claim. */
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
export async function flowerRuntimeCoverage(browser,origin,base){
 const {outputFiles}=await build({
  entryPoints:[fileURLToPath(new URL('../src/flower-runtime-art.ts',import.meta.url))],
  bundle:true,write:false,format:'esm',platform:'browser',define:{'import.meta.env.BASE_URL':JSON.stringify(base)}
 });
 const context=await browser.newContext();
 try{
  const page=await context.newPage(),root=origin+base;
  await page.route(root+'__flower_coverage__.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.route(root+'__flower_coverage__.mjs',r=>r.fulfill({contentType:'text/javascript',body:outputFiles[0].text}));
  await page.goto(root+'__flower_coverage__.html');
  const out=await page.evaluate(async base=>{
   const {renderFlowerArt,renderFlowerOriginalBaseArt}=await import(base+'__flower_coverage__.mjs');
   const [defs,index]=await Promise.all(['inventory-ui/flowers.json','inventory-flower-art/index.json'].map(async p=>{
    const r=await fetch(base+p);if(!r.ok)throw Error(p);return r.json();
   }));
   const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
   const canvas=document.createElement('canvas');canvas.width=canvas.height=96;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});
   const pixels=async blob=>{
    if(!blob)return null;
    const im=await createImageBitmap(blob);
    try{
     if(im.width!==96||im.height!==96)throw Error('FLOWER_DIMENSIONS');
     ctx.clearRect(0,0,96,96);ctx.drawImage(im,0,0);
     const data=ctx.getImageData(0,0,96,96).data;
     const alpha=data.filter((_,i)=>i%4===3);
     return {rgba:await sha(data.buffer),alpha:await sha(alpha.buffer),visible:alpha.some(a=>a>200)};
    }finally{im.close();}
   };
   const colors=Object.keys(defs.colors).map(Number),patterns=[0,...Object.keys(defs.patterns).map(Number)];
   const missing=[],primaryCollisions=[],patternPrimaryCollisions=[],accentCollisions=[],alphaMismatches=[],stateResults=[];
   let plainCases=0,patternCases=0,exactAccentCases=0;
   const originalFailures=[];
   for(const item of index.items){
    const draw=async(color,pattern,accent,state=6)=>{
     const p=await pixels(await renderFlowerArt(item.itemId,{growState:state,baseColor:color,pattern,patternColor:accent},defs));
     if(state===6&&(!p||!p.visible))missing.push({itemId:item.itemId,color,pattern,accent});
     return p;
    };
    const hashes=new Map();let alpha;
    for(const color of colors){
     plainCases++;
     const p=await draw(color,0,0);if(!p)continue;
     if(alpha&&p.alpha!==alpha)alphaMismatches.push({itemId:item.itemId,color,pattern:0});
     alpha=p.alpha;
     if(hashes.has(p.rgba))primaryCollisions.push({itemId:item.itemId,colors:[hashes.get(p.rgba),color]});
     else hashes.set(p.rgba,color);
    }
    for(const pattern of patterns.filter(p=>p!==0)){
     const a=await draw(1,pattern,16),b=await draw(9,pattern,16);patternCases+=2;
     if(a&&b){
      if(a.rgba===b.rgba)patternPrimaryCollisions.push({itemId:item.itemId,pattern});
      if(a.alpha!==b.alpha||alpha&&a.alpha!==alpha)alphaMismatches.push({itemId:item.itemId,pattern});
     }
     if(item.patterns.some(p=>p.patternIndex===pattern)){
      exactAccentCases++;
      const c=await draw(1,pattern,9);
      if(a&&c&&a.rgba===c.rgba)accentCollisions.push({itemId:item.itemId,pattern});
      if(a&&c&&a.alpha!==c.alpha)alphaMismatches.push({itemId:item.itemId,pattern,accent:true});
     }
    }
    const originalFields={growState:6,baseColor:9999,pattern:9999,patternColor:9999};
    const original=await renderFlowerOriginalBaseArt(item.itemId,originalFields),p=await pixels(original);
    if(!p?.visible||p.alpha!==alpha||original!==await renderFlowerOriginalBaseArt(item.itemId,{...originalFields,baseColor:1}))originalFailures.push(item.itemId);
    const states=[];
    for(const state of [0,7])states.push({state,generated:!!await draw(1,0,0,state),original:!!await renderFlowerOriginalBaseArt(item.itemId,{...originalFields,growState:state})});
    stateResults.push({itemId:item.itemId,states});
   }
   return {species:index.items.length,colors:colors.length,plainCases,patternCases,exactAccentCases,missing,primaryCollisions,patternPrimaryCollisions,accentCollisions,alphaMismatches,stateResults,originalFailures,unknownOriginal:await renderFlowerOriginalBaseArt(0,{growState:6,baseColor:1,pattern:0,patternColor:0})===null};
  },base);
  console.log('CHROMIUM FLOWER PIXEL COVERAGE '+JSON.stringify(out));
  assert.equal(out.species,25);assert.equal(out.colors,30);assert.equal(out.plainCases,750);
  assert.equal(out.patternCases,800);assert.equal(out.exactAccentCases,136);
  assert.deepEqual(out.missing,[],'known plucked inputs must render');
  assert.deepEqual(out.alphaMismatches,[],'tint must not alter silhouette');
  assert.deepEqual(out.primaryCollisions,[],'plain colors must yield distinct pixels within each species');
  assert.deepEqual(out.patternPrimaryCollisions,[],'primary color must remain visible with known patterns');
  // Exact accent collisions are reported, not automatically deemed defects:
  // source masks can contain no visible green channel. Native fallback and
  // effect sprites can also intentionally share the same image.
  assert.deepEqual(out.originalFailures,[]);assert.ok(out.unknownOriginal);
  assert.ok(out.stateResults.every(r=>r.states.every(s=>!s.generated&&!s.original)),'non-plucked states use the documented native fallback');
  // An unavailable mask index or texture must not suppress the separately
  // verified original base for any of the 25 species.
  for(const pattern of ['**/inventory-flower-art/index.json','**/inventory-flower-art/flower-mask-rgb-v3.0.1.webp']){
   const failure=await context.newPage();
   try{
    await failure.route(root+'__flower_coverage__.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
    await failure.route(root+'__flower_coverage__.mjs',r=>r.fulfill({contentType:'text/javascript',body:outputFiles[0].text}));
    await failure.route(pattern,r=>r.fulfill({status:503,body:'unavailable'}));
    await failure.goto(root+'__flower_coverage__.html');
    const result=await failure.evaluate(async base=>{
     const {renderFlowerArt,renderFlowerOriginalBaseArt,renderFlowerDefinitionBaseArt}=await import(base+'__flower_coverage__.mjs');
     const manifest=await (await fetch(base+'inventory-flower-art/flower-runtime-source-v3.0.1.json')).json();
     const defs=await (await fetch(base+'inventory-ui/flowers.json')).json();
     const rows=[];
     for(const {itemId} of manifest.rows){
      const fields={growState:6,baseColor:1,pattern:0,patternColor:0};
      const complete=await renderFlowerArt(itemId,fields,defs);
      const original=await renderFlowerOriginalBaseArt(itemId,fields);
      let visible=false;
      if(original){
       const im=await createImageBitmap(original);
       try{
        const c=document.createElement('canvas');c.width=96;c.height=96;
        const ctx=c.getContext('2d');ctx.drawImage(im,0,0);
        const rgba=ctx.getImageData(0,0,96,96).data;
        visible=im.width===96&&im.height===96&&rgba.some((v,i)=>i%4===3&&v>200);
       }finally{im.close();}
      }
      rows.push({complete:complete===null,visible,cached:!!original&&original===await renderFlowerDefinitionBaseArt(itemId),
       seed:await renderFlowerOriginalBaseArt(itemId,{...fields,growState:0})===null,
       uprooted:await renderFlowerOriginalBaseArt(itemId,{...fields,growState:7})===null});
     }
     return rows;
    },base);
    assert.equal(result.length,25);
    assert.ok(result.every(r=>r.complete&&r.visible&&r.cached&&r.seed&&r.uprooted),pattern);
   }finally{await failure.close();}
  }

 }finally{await context.close();}
}

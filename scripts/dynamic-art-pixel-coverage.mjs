/** Factorized pixel coverage through the real production render functions.
 * Do not rasterize every equivalent saved tuple or publish generated files.
 * Verify decoded dimensions, visible alpha, tint attenuation and channel
 * independence. Equal colors and unused native mask channels are reported,
 * not treated as missing art. This is not a game framebuffer comparison. */
import assert from 'node:assert/strict';

export async function dynamicArtPixelCoverage(page,base){
 const out=await page.evaluate(async base=>{
  const {renderChefArt,renderChefBaseArt,renderPaletteArt,renderPaletteBaseArt,renderWandBaseArt,renderWandOriginalBaseArt,renderWandArt}=await import(base+'__wand_runtime_fixture__.mjs');
  const json=async path=>{const r=await fetch(base+path);if(!r.ok)throw Error(path);return r.json();};
  const [chef,wand,flowerDefs,palette]=await Promise.all([
   json('dynamic-chef-art/chef-runtime-source-v3.0.1.json'),
   json('dynamic-wand-art/wand-runtime-source-v3.0.1.json'),
   json('inventory-ui/flowers.json'),
   json('dynamic-palette-art/palette-runtime-source-v3.0.1.json')]);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=96;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const white=[1,1,1,1],missing=[],geometry=[],unexpected=[],collisions=[];
  const counts={chef:0,wandBase:0,wandComposite:0,palette:0};
  const hash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data.buffer)),n=>n.toString(16).padStart(2,'0')).join('');
  async function pixels(blob,key){
   if(!blob){missing.push(key);return null;}
   const im=await createImageBitmap(blob);
   try{
    if(im.width!==96||im.height!==96){geometry.push(key+':dimensions');return null;}
    ctx.clearRect(0,0,96,96);ctx.drawImage(im,0,0);
    const data=ctx.getImageData(0,0,96,96).data;
    if(!data.some((v,i)=>i%4===3&&v>200)){geometry.push(key+':invisible');return null;}
    // Both original and generated icons use the same six-pixel padding.
    for(let y=0;y<96;y++)for(let x=0;x<96;x++)if((x<6||x>=90||y<6||y>=90)&&data[(y*96+x)*4+3]!==0){geometry.push(key+':padding');return null;}
    return data;
   }finally{im.close();}
  }
  function compareTint(original,actual,key){
   if(!original||!actual)return;
   for(let i=0;i<actual.length;i+=4){
    if(actual[i+3]!==original[i+3]){unexpected.push(key+':alpha');return;}
    // On opaque pixels, the native white-to-color mask lerp can only
    // attenuate original RGB. Allow one byte of final quantization.
    if(actual[i+3]===255&&[0,1,2].some(c=>actual[i+c]>original[i+c]+1)){unexpected.push(key+':rgb-increase');return;}
   }
  }
  async function checkTint(family,key,original,blob){
   counts[family]++;const data=await pixels(blob,key);
   compareTint(original,data,key);return data;
  }
  // Every original chef swatch in every used display position. The
  // white class represents all original unmapped characteristics.
  const chefColors=[...chef.colors.map(c=>c.characteristicId),1];
  for(const row of chef.rows){
   const id=row.itemId,original=await pixels(await renderChefBaseArt(id),'chef-original:'+id);
   for(let slot=0;slot<(row.kind==='boba'?1:3);slot++){
    const seen=new Set();
    for(const color of chefColors){
     const colors=[1,1,1];colors[slot]=color;
     const a=row.kind==='boba'?{kind:'boba',colorId:color}:{kind:'cafe',colors};
     const data=await checkTint('chef','chef:'+id+':'+slot+':'+color,original,await renderChefArt(id,a));
     if(data)seen.add(await hash(data));
    }
    if(seen.size<chefColors.length)collisions.push({family:'chef',id,slot,distinct:seen.size,inputs:chefColors.length});
   }
  }
  // All source-known magic/fleck display classes and every shape.
  // Native sourceItemId==0 maps either to a magic sub-icon or no sub-icon.
  const magics=[1,...wand.magic.map(c=>c.characteristicId)],flecks=[1,...wand.flecks.map(c=>c.characteristicId)];
  const mappedMagic=new Set(wand.magic.map(c=>c.characteristicId));
  for(const row of wand.rows){
   const id=row.itemId,original=await pixels(await renderWandOriginalBaseArt(id),'wand-original:'+id);
   for(const magicCharacteristicId of magics)for(const fleckCharacteristicId of flecks){
    const a={magicCharacteristicId,fleckCharacteristicId},key='wand:'+id+':'+magicCharacteristicId+':'+fleckCharacteristicId;
    const baseBlob=await renderWandBaseArt(id,a),plain=await checkTint('wandBase',key,original,baseBlob);
    const fullBlob=await renderWandArt(id,{...a,sourceItemId:0});
    counts.wandComposite++;
    const full=await pixels(fullBlob,key+':composite');
    if(!plain||!full)continue;
    if(!mappedMagic.has(magicCharacteristicId)){
     if(fullBlob!==baseBlob)unexpected.push(key+':unexpected-overlay');
    }else{
     // An overlay is source-over: it cannot remove base coverage.
     for(let i=3;i<full.length;i+=4)if(full[i]+1<plain[i]){unexpected.push(key+':overlay-alpha');break;}
     if(await hash(full)===await hash(plain))unexpected.push(key+':missing-overlay');
    }
   }
  }
  // Every source flower color in each palette slot, plus explicit
  // black and white channel endpoints. RGB must not depend on saved alpha.
  const sourceColors=[...Object.values(flowerDefs.colors).map(v=>v.rgba),[0,0,0,1],white];
  const id=palette.itemId,original=await pixels(await renderPaletteBaseArt(id),'palette-original');
  for(let slot=0;slot<3;slot++){
   const seen=new Set();
   for(const [index,color] of sourceColors.entries()){
    const a=[white,white,white];a[slot]=color;
    const key='palette:'+slot+':'+index,blob=await renderPaletteArt(id,a);
    const data=await checkTint('palette',key,original,blob);
    if(data)seen.add(await hash(data));
    const b=a.map((c,i)=>[...c.slice(0,3),i/2]);
    if(blob&&await renderPaletteArt(id,b)!==blob)unexpected.push(key+':alpha-cache-key');
   }
   if(seen.size<sourceColors.length)collisions.push({family:'palette',slot,distinct:seen.size,inputs:sourceColors.length});
  }
  canvas.width=canvas.height=0;
  return {counts,missing,geometry,unexpected,collisions};
 },base);
 console.log('CHROMIUM FACTORIZED ART PIXEL COVERAGE '+JSON.stringify(out));
 assert.deepEqual(out.counts,{chef:980,wandBase:504,wandComposite:504,palette:96});
 assert.deepEqual(out.missing,[],'Every verified display input must generate an image');
 assert.deepEqual(out.geometry,[],'Generated images must be visible, 96px and padded');
 assert.deepEqual(out.unexpected,[],'Native tint/overlay invariants must hold');
}

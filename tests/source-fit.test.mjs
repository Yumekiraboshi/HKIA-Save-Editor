import test from 'node:test';
import assert from 'node:assert/strict';
import {fitColorwayModel,renderColorwayModel,holdoutErrors,paletteVector,FIT_RECIPES} from '../scripts/fit-native-colorway-sprites.mjs';

import {calibratedPalette,fitCalibratedModel,renderCalibratedModel,calibratedHoldouts} from '../scripts/fit-native-colorway-calibration.mjs';

const makeSample=(id,colors)=>{
 const palette=paletteVector(colors),rgba=new Uint8ClampedArray(96*96*4);
 for(let p=0;p<96*96;p++){
  if(p<100||p>9000)continue;
  const color=palette[p%2?0:2];
  for(let c=0;c<3;c++)rgba[4*p+c]=Math.round((.8*color[c]+.1)*255);
  rgba[4*p+3]=p%3?255:180;
 }
 return {id,palette,rgba};
};
test('recover source-native channel colors from held-out aligned original pixels',()=>{
 const samples=[
  makeSample(1,['#ff0000','#888888','#00ff00','#abcdef','#123456']),
  makeSample(2,['#0000ff','#222222','#ff8800','#aaaaaa','#eeeeee']),
  makeSample(3,['#bb77cc','#222233','#55aaff','#000000','#ffffff']),
  makeSample(4,['#36d0c4','#a3d9cc','#6d5e52','#239a9a','#a5f4e9'])
 ];
 const errors=holdoutErrors(samples,.001);
 assert.ok(errors.every(x=>x.mae<1),JSON.stringify(errors));
 const predicted=renderColorwayModel(fitColorwayModel(samples,.001),samples[3].palette);
 assert.ok(predicted.every((v,i)=>Math.abs(v-samples[3].rgba[i])<=1));
 assert.throws(()=>paletteVector(['#ff0000',null,null,null,null]),/SOURCE_FIT_FULL_PALETTE_REQUIRED/);
 const changed={...samples[0],rgba:samples[0].rgba.slice()};changed.rgba[3]=128;
 assert.throws(()=>fitColorwayModel([changed,samples[1]],.001),/SOURCE_FIT_ALPHA_MISMATCH/);
});
test('four native families contain 120 admitted calibrated previews',()=>{
 assert.equal(FIT_RECIPES.reduce((s,r)=>s+r.expectedPreviews,0),120);
 assert.ok(FIT_RECIPES.every(r=>r.anchors.length>=3&&r.meanLimit<=6&&r.worstLimit<=9));
 assert.equal(FIT_RECIPES.find(r=>r.family==='high-tea-waistcoat').options.channels.length,2);
 assert.equal(FIT_RECIPES.find(r=>r.family==='high-tea-empire-waist-dress').maxPaletteDistance,.25);
});
test('calibration preserves original alpha and permits only actually present sparse channels',()=>{
 const options={method:'palette-delta-v2',gamma:1,penalty:.0002,chromaPrior:.1,channels:[0,1]};
 const colors=[['#ff0000','#00ff00',null,null,null],['#0000ff','#ffaa00',null,null,null],['#aa44cc','#006699',null,null,null]];
 const samples=colors.map((c,i)=>{
  const palette=calibratedPalette(c,options.channels),rgba=new Uint8ClampedArray(96*96*4);
  for(let p=100;p<9000;p++){
   const color=palette[p%2];
   for(let k=0;k<3;k++)rgba[p*4+k]=Math.round((.7*color[k]+.12)*255);
   rgba[p*4+3]=p%3?255:180;
  }
  return {id:i+1,palette,rgba};
 });
 const errors=calibratedHoldouts(samples,options);
 assert.ok(errors.every(x=>x.mae<2),JSON.stringify(errors));
 const model=fitCalibratedModel(samples,options);
 const predicted=renderCalibratedModel(model,samples[0].palette);
 assert.ok(predicted.every((v,i)=>Math.abs(v-samples[0].rgba[i])<=1));
 assert.throws(()=>calibratedPalette(colors[0],[0,4]),/SOURCE_FIT_REQUIRED_PALETTE_CHANNEL/);
 const changed={...samples[0],rgba:samples[0].rgba.slice()};changed.rgba[3]=128;
 assert.throws(()=>fitCalibratedModel([changed,samples[1]],options),/SOURCE_FIT_ALPHA_MISMATCH/);
});

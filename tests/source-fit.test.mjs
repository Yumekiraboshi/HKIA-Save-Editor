import test from 'node:test';
import assert from 'node:assert/strict';
import {fitColorwayModel,renderColorwayModel,holdoutErrors,paletteVector,FIT_RECIPES} from '../scripts/fit-native-colorway-sprites.mjs';

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
test('initial supported native families contain 66 new calibrated previews, not exact renders',()=>{
 assert.equal(FIT_RECIPES.reduce((s,r)=>s+r.count-r.anchors.length,0),66);
 assert.ok(FIT_RECIPES.every(r=>r.anchors.length>=4&&r.meanLimit<=6&&r.worstLimit<=9));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {fitNeutralAnchor,renderNeutralAnchor} from '../scripts/fit-neutral-anchor.mjs';
function fixture(){
 const neutral=new Uint8ClampedArray(96*96*4),anchor=neutral.slice();
 for(let i=0;i<96*96;i++){
  const at=i*4;if(i<10)continue;
  neutral.set([100,100,100,255],at);anchor.set(i%2?[180,60,60,255]:[60,180,60,255],at);
 }
 return {neutral,anchor,palette:[[1,0,0],[0,1,0],null,null,null]};
}
test('neutral control identifies separately colored pixels and preserves alpha and texture residual',()=>{
 const {neutral,anchor,palette}=fixture();const m=fitNeutralAnchor(neutral,anchor,palette);
 assert.equal(m.assigned,96*96-10);assert.equal(m.channel[11],0);assert.equal(m.channel[12],1);
 assert.deepEqual(renderNeutralAnchor(m,palette),anchor);
 const v=renderNeutralAnchor(m,[[0,0,1],[0,1,0],null,null,null]);
 assert.deepEqual(Array.from(v.slice(44,48)),[60,60,180,255]);assert.deepEqual(Array.from(v.slice(48,52)),[60,180,60,255]);
 assert.deepEqual(Array.from(v.slice(0,4)),[0,0,0,0]);
});
test('same hue channels are ambiguous, not arbitrarily assigned',()=>{
 const {neutral,anchor,palette}=fixture();palette[2]=[1,0,0];
 const m=fitNeutralAnchor(neutral,anchor,palette);assert.equal(m.channel[11],-1);assert.equal(m.channel[12],1);assert.ok(m.ambiguous>0);
});
test('misalignment and missing target channel fail closed',()=>{
 const {neutral,anchor,palette}=fixture();const m=fitNeutralAnchor(neutral,anchor,palette);
 assert.throws(()=>renderNeutralAnchor(m,[null,palette[1],null,null,null]),/MISSING_TARGET_CHANNEL/);
 anchor[3]=255;assert.throws(()=>fitNeutralAnchor(neutral,anchor,palette),/ALPHA_MISMATCH/);
});

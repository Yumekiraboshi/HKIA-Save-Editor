import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
test('six original centerpiece items have exactly 207 original palette/atlas choices',()=>{
 const c=read('public/inventory-ui/furniture-customization-v3.0.1.json'),v=read('data/furniture-material-render-source-v3.0.1.json'),a=read('data/furniture-centerpiece-pattern-source-v3.0.1.json').rows[0];
 const ids=[1084153252,1415214992,16221227,1951204007,712392454,746070047],extra=new Map([[746070047,277],[712392454,278],[1084153252,279]]);
 const all=Array.from({length:33},(_,i)=>518+i).concat(683);let total=0;
 for(const id of ids){const item=c.items.find(x=>x[0]===id),s=item[4][0];assert.equal(item[4].length,1);assert.equal(s[2],533);
 const allowed=[...new Set([s[2],...s[3].flatMap(k=>c.sets.find(x=>x[0]===k)[2])])].sort((x,y)=>x-y);
 assert.deepEqual(allowed,[...all,...(extra.has(id)?[extra.get(id)]:[])].sort((x,y)=>x-y));total+=allowed.length;
 for(const i of allowed){const r=v.rows.find(x=>x[0]===i);assert.equal(r[5],i<518?a.guid:'507ffd4fc696e458c96231e026f49923');assert.deepEqual(r[6],[1,1]);assert.deepEqual(r[7],i<518?[1,1]:[0,0]);}
 }
 assert.equal(total,207);const loc=v.patterns.find(x=>x[0]===a.guid);assert.ok(loc[3].some(i=>v.bundleNames[i]===a.bundle));
 let n=0;for(const [w,h,o,b] of a.mips){assert.equal(o,n);assert.equal(b,Math.ceil(w/4)*Math.ceil(h/4)*8);n+=b;}assert.equal(n,a.bytes);
});

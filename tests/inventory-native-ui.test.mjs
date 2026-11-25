import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir=new URL('../public/inventory-ui/',import.meta.url);
const read=n=>readFileSync(new URL(n,dir));
const json=n=>JSON.parse(read(n));
const digest=b=>createHash('sha256').update(b).digest('hex');
test('original inventory sprites are native-sized lossless WebP',()=>{
 const index=json('index.json');
 const sizes={flowers:128,music:93,comics:93};
 assert.equal(Object.keys(index.unresolvedCategorySprites).length,0);
 for(const [name,sha] of Object.entries(index.files)){
  const b=read(name);assert.equal(digest(b),sha,name);
  if(!name.endsWith('.webp'))continue;
  assert.equal(b.toString('ascii',0,4),'RIFF');
  assert.equal(b.toString('ascii',8,16),'WEBPVP8L');
  assert.equal(b[20],47);
  const bits=b.readUInt32LE(21);
  const size=name.startsWith('pattern-')?54:sizes[name.slice(9,-5)]??152;
  assert.equal((bits&16383)+1,size,name);
  assert.equal(((bits>>>14)&16383)+1,size,name);
 }
 assert.equal(Object.keys(index.files).filter(n=>n.startsWith('category-')).length,13);
 assert.equal(Object.keys(index.files).filter(n=>n.startsWith('pattern-')).length,16);
});
test('native labels cover all source color and pattern definitions in 16 locales',()=>{
 const defs=json('flowers.json'),labels=json('flower-labels.json');
 assert.equal(digest(read('flower-labels.json')),'06519628a93327d82ef66ccc336c29244c5e91f433169ac9cb1b290ea6063a0b');
 const ids=[...Object.values(defs.colors),...Object.values(defs.patterns)].map(d=>d.labelId);
 assert.equal(ids.length,46);
 assert.equal(Object.keys(labels.locales).length,16);
 for(const [locale,strings] of Object.entries(labels.locales))for(const id of ids)assert.ok(strings[id],locale+': '+id);
});

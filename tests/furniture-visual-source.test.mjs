import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const raw=readFileSync(new URL('../data/furniture-visual-source-v3.0.1.json',import.meta.url));
const source=JSON.parse(raw),catalog=JSON.parse(readFileSync(new URL('../public/inventory-ui/furniture-customization-v3.0.1.json',import.meta.url),'utf8'));
test('all customizable furniture and floorplan records retain exact original visual references',()=>{
 assert.equal(createHash('sha256').update(raw).digest('hex'),'0d42521f81b7f8a0a295a8e3c9d0c6ca713d5b34ad572517a7ddf3118293a691');
 assert.equal(source.version,catalog.gameVersion);assert.equal(source.rows.length,649);assert.equal(catalog.items.length,649);
 assert.deepEqual(source.rows.map(r=>[r[0],r[1],r[2]]),catalog.items.map(r=>[r[0],r[2],r[3]]));
 assert.equal(new Set(source.rows.map(r=>r[0])).size,649);assert.equal(new Set(source.rows.map(r=>r[3])).size,648);
 assert.equal(source.rows.filter(r=>r[6]!==null).length,44);assert.equal(source.rows.filter(r=>r[2]===1).length,28);
 for(const r of source.rows){assert.equal(r.length,8);assert.match(r[1],/^-?\\d+$/);assert.match(r[3],/^-?\\d+$/);for(const guid of r.slice(4,6))assert.match(guid,/^[a-f0-9]{32}$/);if(r[6]!==null)assert.match(r[6],/^[a-f0-9]{32}$/);assert.match(r[7],/^[a-f0-9]{64}$/);}
});

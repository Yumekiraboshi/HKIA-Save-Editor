import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const load = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const d = load('../data/native-cooking-recipes-v3.0.1.json');
const r = load('../data/native-result-icon-routes-v3.0.1.json');
const digest = value => createHash('sha256').update(JSON.stringify(value)+'\n').digest('hex');

test('ordinary cooking recipes retain the complete native ingredient alternatives', () => {
  assert.equal(d.schema,'HKIA.NativeCookingRecipes.1');
  assert.equal(d.version,r.version);
  assert.equal(d.switchDefinitionsSha256,r.switchDefinitionsSha256);
  assert.equal(d.rowsSha256,'4c70fe0cc2cfdf2378ddd848a0b85c7d94ff89e987eaa1e667c568c9b54c7e83');
  assert.equal(d.stationsSha256,'663b3ad61589d32ba598dcafd28dc41249d1f73c2ac8e53813cb5f4126161914');
  assert.equal(digest(d.rows),d.rowsSha256);
  assert.equal(digest(d.stations),d.stationsSha256);
  assert.equal(d.rows.length,d.recipeCount);
  assert.equal(d.recipeCount,282);
  assert.equal(new Set(d.rows.map(row=>row[1])).size,d.resultCount);
  assert.equal(d.resultCount,232);
  assert.equal(new Set(d.rows.flatMap(row=>row.slice(2))).size,d.ingredientCount);
  assert.equal(d.ingredientCount,64);
  assert.equal(d.rows.filter(row=>row.length===4).length,158);
  assert.equal(d.rows.filter(row=>row.length===5).length,124);
  const routes=new Map(r.rows);
  const bases=new Set(d.stations.map(s=>s[1]));
  assert.equal(bases.size,9);
  const outputs=new Set(d.rows.map(row=>row[1]));
  assert.equal(d.stations.filter(s=>outputs.has(s[2])).length,0);
  d.rows.forEach((row,index)=>{
    assert.ok(row.every(id=>Number.isSafeInteger(id)&&id>0));
    assert.equal(routes.get(row[0]),row[1]);
    if(index)assert.ok(row[0]>d.rows[index-1][0]);
    assert.ok(bases.has(row[2]));
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/inventory-palette-display.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {decodeInventoryPalettes,resolvePaletteTints,CUSTOM_PALETTE_ITEM_ID}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
test('native palette snapshot preserves three ordered Color fields by document identity',()=>{
 const bytes=new Uint8Array(108),v=new DataView(bytes.buffer);v.setUint32(0,2,true);
 const a=[1,0,0,1,0,1,0,1,0,0,1,1],b=[0,0,1,1,1,0,0,1,0,1,0,1];
 for(const [i,colors] of [a,b].entries()){const p=4+52*i;v.setUint32(p,i+10,true);for(const [j,value] of colors.entries())v.setFloat32(p+4+4*j,value,true);}
 const rows=decodeInventoryPalettes(bytes,new Set([10,11]));
 assert.deepEqual(rows.get(10),[[1,0,0,1],[0,1,0,1],[0,0,1,1]]);
 assert.deepEqual(rows.get(11),[[0,0,1,1],[1,0,0,1],[0,1,0,1]]);
 assert.equal(resolvePaletteTints(CUSTOM_PALETTE_ITEM_ID,rows.get(10)),rows.get(10));
 assert.equal(resolvePaletteTints(315822,rows.get(10)),null);
 assert.throws(()=>decodeInventoryPalettes(bytes,new Set([10])),/PALETTE_SNAPSHOT_INVALID/);
 v.setUint32(56,10,true);assert.throws(()=>decodeInventoryPalettes(bytes,new Set([10,11])),/PALETTE_SNAPSHOT_INVALID/);
 assert.equal(resolvePaletteTints(CUSTOM_PALETTE_ITEM_ID,[[NaN,0,0,1],[0,1,0,1],[0,0,1,1]]),null);
});
test('custom palette uses exact definition Sprite, atlas mask and opaque guarded source crops',()=>{
 const dir=new URL('../public/dynamic-palette-art/',import.meta.url),read=n=>readFileSync(new URL(n,dir)),sha=b=>createHash('sha256').update(b).digest('hex');
 const raw=read('palette-runtime-source-v3.0.1.json'),m=JSON.parse(raw);
 assert.equal(sha(raw),'c25b4775b46e460136f0c5dd8e0d7b24088cd92660451f535488f0b25f9cc386');
 const audit=JSON.parse(readFileSync(new URL('../data/unityfs-audit/dynamic-uiicons.v3.0.1.json',import.meta.url),'utf8'));
 const row=audit.rows.find(r=>r.itemId===CUSTOM_PALETTE_ITEM_ID);
 assert.equal(m.rows[0].spritePathId,row.baseSpritePathId);assert.equal(m.rows[1].spritePathId,row.maskSpritePathId);assert.equal(m.maskGuid,row.maskGuid);
 for(const a of [m.base,m.mask]){const b=read(a.file);assert.equal(b.length,a.bytes);assert.equal(sha(b),a.sha256);assert.equal(b.toString('ascii',8,16),'WEBPVP8L');}
});

test('palette icon ignores finite tint alpha without altering the snapshot',()=>{
 const palette=[[0.25,0.5,0.75,0],[1,0,0,2],[0,1,0,-1]];
 const before=structuredClone(palette);
 const normalized=[[0.25,0.5,0.75,1],[1,0,0,1],[0,1,0,1]];
 assert.deepEqual(resolvePaletteTints(CUSTOM_PALETTE_ITEM_ID,palette),normalized);
 assert.equal(JSON.stringify(resolvePaletteTints(CUSTOM_PALETTE_ITEM_ID,palette)),JSON.stringify(resolvePaletteTints(CUSTOM_PALETTE_ITEM_ID,normalized)));
 assert.deepEqual(palette,before);
 assert.equal(resolvePaletteTints(CUSTOM_PALETTE_ITEM_ID,[[2,0,0,1],...palette.slice(1)]),null);
 assert.equal(resolvePaletteTints(CUSTOM_PALETTE_ITEM_ID,[[0,0,0,Infinity],...palette.slice(1)]),null);
});

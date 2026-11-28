import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync,crc32} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {encodeDynamicArtPng} from '../src/dynamic-art-png.ts';

function decodePng(bytes){
 assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 let offset=8;const chunks=[];
 while(offset<bytes.length){
  const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),end=offset+8+length;
  assert.ok(end+4<=bytes.length);
  assert.equal(bytes.readUInt32BE(end),crc32(bytes.subarray(offset+4,end)));
  chunks.push({type,data:bytes.subarray(offset+8,end)});offset=end+4;
 }
 assert.equal(offset,bytes.length);
 assert.deepEqual(chunks.map(c=>c.type),['IHDR','IDAT','IEND']);
 const h=chunks[0].data;
 assert.equal(h.readUInt32BE(0),96);assert.equal(h.readUInt32BE(4),96);
 assert.deepEqual([...h.subarray(8)],[8,6,0,0,0]);
 assert.equal(chunks[2].data.length,0);
 const raw=inflateSync(chunks[1].data),out=Buffer.alloc(96*96*4);
 assert.equal(raw.length,96*385);
 for(let y=0;y<96;y++){
  assert.equal(raw[y*385],1);
  for(let x=0;x<384;x++)out[y*384+x]=(raw[y*385+x+1]+(x<4?0:out[y*384+x-4]))&255;
 }
 return out;
}
test('generated local PNG preserves every straight-alpha RGB byte, including invisible texels',async()=>{
 const source=new Uint8ClampedArray(96*96*4);
 for(let i=0;i<source.length;i+=4)source.set([(i*17/4)%256,255-(i/4)%256,173,(i/4)%256],i);
 const blob=await encodeDynamicArtPng(source);
 assert.equal(blob.type,'image/png');
 const bytes=Buffer.from(await blob.arrayBuffer());
 assert.deepEqual(decodePng(bytes),Buffer.from(source));
 assert.deepEqual(decodePng(Buffer.from(await (await encodeDynamicArtPng(new Uint8ClampedArray(source.length))).arrayBuffer())),Buffer.alloc(source.length));
 await assert.rejects(encodeDynamicArtPng(new Uint8ClampedArray(4)),/DYNAMIC_PNG_LENGTH/);
});
test('all dynamic and original base images use the same lossless straight-alpha output path',()=>{
 const source=readFileSync(new URL('../src/dynamic-art-assets.ts',import.meta.url),'utf8');
 assert.ok(source.includes('encodeDynamicArtPng(rasterizeDynamicSprite(input))'));
 assert.ok(source.includes("return renderCachedDynamicArt(JSON.stringify(['original-base-only',key])"));
 assert.ok(!source.includes('canvas.toBlob('));
 assert.ok(!source.includes('putImageData('));
});

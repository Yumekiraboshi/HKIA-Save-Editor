import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const root=new URL('../public/item-packs/',import.meta.url);
const catalog=JSON.parse(readFileSync(new URL('../public/catalog.json',import.meta.url),'utf8'));
function parseStoredZip(buffer){
 let offset=0;const files=new Map();
 while(offset+4<=buffer.length&&buffer.readUInt32LE(offset)===0x04034b50){
  assert.ok(offset+30<=buffer.length);
  const flags=buffer.readUInt16LE(offset+6),method=buffer.readUInt16LE(offset+8);
  const packed=buffer.readUInt32LE(offset+18),unpacked=buffer.readUInt32LE(offset+22);
  const namesize=buffer.readUInt16LE(offset+26),extra=buffer.readUInt16LE(offset+28);
  const start=offset+30+namesize+extra;
  assert.equal(flags&8,0);assert.equal(method,0);assert.equal(packed,unpacked);
  const name=buffer.toString('utf8',offset+30,offset+30+namesize);
  assert.ok(start+packed<=buffer.length);
  assert.ok(!files.has(name));
  files.set(name,buffer.subarray(start,start+packed));
  offset=start+packed;
 }
 return files;
}
test('all collection groups ship genuine mapped item thumbnails in lazy ZIP packs',()=>{
 const byGroup=new Map();
 for(const item of catalog.items){if(!byGroup.has(item[3]))byGroup.set(item[3],new Set);byGroup.get(item[3]).add(item[0])}
 let checked=0;
 for(const group of catalog.groups){
  const name=group[0];const num=name==='collections_group_events'?6:1;
  const sheets=new Map;let index=null;
  for(let i=0;i<num;i++){
   const p=new URL(name+(i?'-'+i:'')+'.zip',root);
   assert.ok(existsSync(p),name);
   const zip=parseStoredZip(readFileSync(p));
   if(i===0){assert.ok(zip.has('index.json'));index=JSON.parse(zip.get('index.json'))}
   else assert.ok(!zip.has('index.json'));
   for(const [key,data] of zip){
    if(!key.endsWith('.webp'))continue;
    assert.equal(data.toString('ascii',0,4),'RIFF');
    assert.equal(data.toString('ascii',8,12),'WEBP');
    assert.ok(!sheets.has(key),'duplicate sheet '+key);
    sheets.set(key,data);
   }
  }
  assert.equal(index.schema,'HKIA.SheetIcons.1');
  assert.equal(index.group,name);
  assert.equal(index.size,96);
  assert.equal(index.columns,12);
  const ids=new Set;
  for(const [id,sheet,cell] of index.records){
   assert.ok(byGroup.get(name).has(id),name+' unexpected item '+id);
   assert.ok(!ids.has(id));ids.add(id);
   assert.ok(Number.isInteger(cell)&&cell>=0&&cell<144);
   assert.ok(sheets.has('sheet-'+String(sheet).padStart(3,'0')+'.webp'));
   checked++;
  }
  assert.equal(ids.size,byGroup.get(name).size,name+' missing item image');
 }
 assert.equal(checked,catalog.items.length);
});
test('all item icons are local assets; no external requests',()=>{
 const c=readFileSync(new URL('../src/icon-packs.ts',import.meta.url),'utf8');
 assert.match(c,/BASE_URL|base\+'item-packs'/);
 assert.match(c,/URL\.revokeObjectURL/);
 assert.doesNotMatch(c,/raw\.githubusercontent\.com/);
});

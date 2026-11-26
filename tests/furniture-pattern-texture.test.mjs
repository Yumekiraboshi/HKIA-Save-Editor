import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL('../'+p,import.meta.url));
test('all six rug patterns retain exact original texture GUID, BC1 mip chain and sampler metadata',()=>{
 const raw=read('data/furniture-pattern-texture-sample-v3.0.1.json'),d=JSON.parse(raw);
 assert.equal(createHash('sha256').update(raw).digest('hex'),'24c6110b33ea80e8990f6017e7010350e36c6b1638d24956908c9f34915a8d78');
 const source=JSON.parse(read('data/furniture-material-render-source-v3.0.1.json')),catalog=JSON.parse(read('public/inventory-ui/furniture-customization-v3.0.1.json'));
 assert.equal(d.version,source.version);assert.equal(d.itemId,32709745);
 const item=catalog.items.find(r=>r[0]===d.itemId),slot=item[4][0];
 const indices=new Set([slot[2],...slot[3].flatMap(p=>catalog.sets.find(s=>s[0]===p)[2])]);
 assert.deepEqual(new Set(d.rows.map(r=>r.materialIndex)),indices);
 assert.equal(d.rows.length,6);assert.equal(new Set(d.rows.map(r=>r.guid)).size,6);
 for(const t of d.rows){
  assert.equal(t.guid,source.rows.find(r=>r[0]===t.materialIndex)[5]);
  assert.ok(source.patterns.find(r=>r[0]===t.guid)[3].map(i=>source.bundleNames[i]).includes(t.bundle));
  assert.match(t.pathId,/^-?[0-9]+$/);assert.match(t.cab,/^CAB-[a-f0-9]{32}$/);
  assert.equal(t.format,10);assert.equal(t.colorSpace,1);assert.equal(t.width,512);assert.equal(t.height,512);
  assert.deepEqual(t.sampler,[1,2,0,0,0,0]);assert.equal(t.mips.length,10);
  let cursor=0;
  for(let i=0;i<t.mips.length;i++){const [w,h,off,len,sha]=t.mips[i];assert.equal(w,512>>i);assert.equal(h,w);assert.equal(off,cursor);assert.equal(len,Math.ceil(w/4)*Math.ceil(h/4)*8);assert.match(sha,/^[a-f0-9]{64}$/);cursor+=len;}
  assert.equal(cursor,t.bytes);assert.equal(t.bytes,174776);
  for(const hash of [t.bundleSha256,t.objectSha256,t.sha256])assert.match(hash,/^[a-f0-9]{64}$/);
 }
 assert.equal(d.rows.reduce((s,r)=>s+r.bytes,0),1048656);
});

test('streamed RGBA32 patterns preserve native alpha and every mip byte; malformed ranges refuse',()=>{
 const py=String.raw`
import importlib.util,struct,hashlib
spec=importlib.util.spec_from_file_location('pattern','scripts/extract-furniture-pattern-texture.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def st(s):
    b=s.encode();v=struct.pack('<I',len(b))+b;return v+bytes((-len(v))%4)
guid='1'*32;cab='CAB-'+'2'*32;bundle='synthetic'
container=st('bundle')+struct.pack('<II',0,1)+st(guid)+struct.pack('<iiiq',0,0,0,123)
payload=bytes(range(32))+bytes([0,1,2,3,4,5,6,7])+bytes([8,9,10,11])
def tex(fmt=4,size=len(payload),stream_len=len(payload),offset=3):
    return (st('pattern')+struct.pack('<7I',1,4,2,size,0,fmt,3)+bytes(8)+struct.pack('<4I',0,0,1,2)+struct.pack('<iifiii',1,2,0,0,0,0)+struct.pack('<4I',0,1,0,0)+struct.pack('<QI',offset,stream_len)+st('archive:/'+cab+'/'+cab+'.resS'))
def run(t,data):
    return m.extract(b'bundle',bundle,cab,[(142,'1',container,'<'),(28,'123',t,'<')],data,{guid})
metadata,blobs=run(tex(),b'abc'+payload)
r=metadata[guid];assert blobs[guid]==payload and r['format']==4 and r['bytes']==44
assert r['sha256']==hashlib.sha256(payload).hexdigest()
assert [x[:4] for x in r['mips']]==[[4,2,0,32],[2,1,32,8],[1,1,40,4]]
for row in r['mips']:
    assert row[4]==hashlib.sha256(payload[row[2]:row[2]+row[3]]).hexdigest()
for t,data in [(tex(fmt=5),b'abc'+payload),(tex(size=43,stream_len=43),b'abc'+payload),(tex(),b'abc'+payload[:-1]),(tex(offset=4),b'abc'+payload)]:
    try:run(t,data);raise AssertionError('invalid stream accepted')
    except ValueError:pass
`;
 execFileSync(process.env.PYTHON_BIN||'python3',['-c',py],{cwd:fileURLToPath(new URL('../',import.meta.url))});
});

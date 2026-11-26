#!/usr/bin/env python3
"""Recover isolated high-quality refraction screen sampling from the pinned
Steam 3.0.1 original Shader. Emit synthetic shader-space values only."""
import argparse, hashlib, importlib.util, json, random, struct
from pathlib import Path
def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def require(ok,msg):
    if not ok:raise ValueError(msg)
def sha(b):return hashlib.sha256(b).hexdigest()
def source(path):
    a=module('audit-native-dye-materials');s=module('audit-native-character-shader')
    raw=path.read_bytes()
    require(sha(raw)=='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0','definitions hash')
    cab=dict(a.auditor.extract_nodes(raw)[1])['CAB-46b8f8fe122147493b3113f7c1c8cd0f']
    obj=next(o for c,p,o,e in a.serialized_objects(cab,classes=(48,)) if p=='-245959077359590779' and e=='<')
    require(sha(obj)=='39080ec3a7154ee8032ee36bab5f861630dfe745b3bd1e35ad275662b1c6e332','shader object hash')
    r=s.Reader(obj,28460);require(r.string()=='Sunblink/Lynx/CustomLitRefractive','shader name')
    r.string();r.string();r.array(lambda:(r.string(),r.string()));r.array(lambda:(r.string(),r.string()));r.take('B');r.align()
    require(r.array(lambda:r.take('I'))==[4],'platform')
    offsets,sizes,expanded=[r.array(lambda:r.array(lambda:r.take('I')))[0] for _ in range(3)]
    require(expanded==[6520,519732,516740,515272,523968,515000,505264] and len(offsets)==len(sizes)==7,'segment layout')
    n=r.take('I');blob=obj[r.pos:r.pos+n];segments=[];cursor=0
    for off,z,e in zip(offsets,sizes,expanded):
        require(off==cursor and 0<z<=n-off,'segment range')
        segments.append(a.auditor.decompress(blob[off:off+z],e,2));cursor+=z
    require(cursor==n and struct.unpack_from('<I',segments[0])[0]==543,'table')
    def block(i):
        off,n,seg=struct.unpack_from('<III',segments[0],4+12*i)
        require(0<seg<len(segments) and 0<n<=len(segments[seg])-off,'block bounds')
        return segments[seg][off:off+n]
    p=block(192);require(struct.unpack_from('<II',p)==(0x0c0a75ba,18),'pixel header')
    r=s.Reader(p,24);require(r.array(r.string)==['MATERIAL_QUALITY_HIGH','REFRACTION_ON'],'keywords')
    programs=s.containers(p);require(len(programs)==1 and programs[0]['stage']=='pixel','DXBC coverage')
    pr=programs[0];d=p[pr['offset']:pr['offset']+pr['bytes']]
    require(len(d)==5712 and sha(d)=='ca0b39203242be902a8a59924d544467f4866571743618636189db55360b88dc','program hash')
    require(sha(block(36))=='f4ee5ab5457059e38deb7ddee2f67ff4bf6dc7d58f6c56ff7b0f0b75b8ef6d31','parameter hash')
    o=next(i for i in struct.unpack_from('<'+'I'*struct.unpack_from('<I',d,28)[0],d,32) if d[i:i+4]==b'SHEX')
    w=struct.unpack_from('<'+'I'*(struct.unpack_from('<I',d,o+4)[0]//4),d,o+8)
    for lo,hi,dig in [(1126,1143,'b4da0bfdd5069fe9959ff3b685e0e358d0052fa48a063b1c44f99a643cd2d664'),(1157,1173,'98894d69ccf78426a02e3c84be0d60c32b9245fe8cd219c36ada1e293ae71731'),(1187,1204,'0ec0cac057649519be4ef63444f8c07cd27335aca35faf49b36c6e3d0fe9c23e'),(1218,1266,'aed66b9ff7039669b0cbcb2d474828e4ea058f49c3077eaa33c0db6a4b3774b1')]:
        require(sha(struct.pack('<'+'I'*(hi-lo),*w[lo:hi]))==dig,'token block')
    return w
def vectors(w):
    evaluate=module('extract-furniture-shader-bindings').evaluate
    rng=random.Random(192);cases=[];error=0.
    for i in range(512):
        uv=[rng.uniform(-.2,1.2) for _ in range(2)];disp=[rng.uniform(-.8,.8) for _ in range(2)]
        f=[0.,1.,rng.random()][i%3];ch=rng.random();shift=ch*struct.unpack('<f',struct.pack('<f',.025))[0]
        base=[rng.random() for _ in range(3)];t=rng.random();inten=rng.uniform(0,10)
        sample=[rng.random() for _ in range(3)];lit=[rng.uniform(0,2) for _ in range(3)]
        reg={(0,0):lit+[0],(0,1):uv+[f,0],(0,2):disp+[0,0],(0,5):[0,shift,0,0],(0,4):sample+[0],
             (8,1,2):base+[1],(8,1,6):[0,0,0,t],(8,1,5):[0,0,0,inten]}
        evaluate(w,1126,1143,reg);blue=reg[0,2][2:]
        evaluate(w,1157,1173,reg);green=reg[0,2][2:]
        evaluate(w,1187,1204,reg);red=reg[0,1][:2]
        evaluate(w,1218,1266,reg);rgb=reg[0,0][:3]
        clamp=lambda x:min(1,max(0,x));center=[x+y*(1-f) for x,y in zip(uv,disp)]
        expected=[*[clamp(x-shift) for x in center],*[clamp(x+shift) for x in center],*[clamp(x) for x in center],
                  *[l+s*(1+(a-1)*t)*f*inten for l,s,a in zip(lit,sample,base)]]
        error=max(error,max(abs(x-y) for x,y in zip(red+green+blue+rgb,expected)))
        cases.append({'input':{'screenUv':uv,'viewDisplacement':disp,'facingFactor':f,'chromatism':ch,
                               'lit':lit,'channels':sample,'baseColor':base,'tint':t,'intensity':inten},
                      'expected':{'red':red,'green':green,'blue':blue,'rgb':rgb}})
    require(error<1e-12,'screen arithmetic parity')
    return {'schema':'HKIA.RefractiveScreenVectors.1','version':'3.0.1','maxFloat64Error':error,'cases':cases}
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('definitions',type=Path);p.add_argument('--out',type=Path,required=True)
    a=p.parse_args();result=vectors(source(a.definitions))
    with a.out.open('x',encoding='utf8') as f:json.dump(result,f,separators=(',',':'));f.write('\n')

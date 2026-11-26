#!/usr/bin/env python3
"""Verify the actual rim-only furniture glass branch, original Steam 3.0.1.
Reads original files locally; prints synthetic arithmetic evidence only."""
import argparse,hashlib,importlib.util,json,math,random,struct
from pathlib import Path

def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def require(ok,msg):
    if not ok:raise ValueError(msg)
def sha(b):return hashlib.sha256(b).hexdigest()
def source(path):
    a=module('audit-native-dye-materials');s=module('audit-native-character-shader')
    raw=path.read_bytes();require(sha(raw)=='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0','bundle hash')
    cab=dict(a.auditor.extract_nodes(raw)[1])['CAB-46b8f8fe122147493b3113f7c1c8cd0f']
    obj=next(o for c,p,o,e in a.serialized_objects(cab,classes=(48,)) if p=='-245959077359590779' and e=='<')
    require(sha(obj)=='39080ec3a7154ee8032ee36bab5f861630dfe745b3bd1e35ad275662b1c6e332','shader hash')
    r=s.Reader(obj,28460);require(r.string()=='Sunblink/Lynx/CustomLitRefractive','shader name')
    r.string();r.string();r.array(lambda:(r.string(),r.string()));r.array(lambda:(r.string(),r.string()));r.take('B');r.align()
    require(r.array(lambda:r.take('I'))==[4],'platform')
    offsets,sizes,expanded=[r.array(lambda:r.array(lambda:r.take('I')))[0] for _ in range(3)]
    require(expanded==[6520,519732,516740,515272,523968,515000,505264] and len(offsets)==len(sizes)==7,'segments')
    n=r.take('I');blob=obj[r.pos:r.pos+n];segments=[];cursor=0
    for off,z,e in zip(offsets,sizes,expanded):
        require(off==cursor and 0<z<=n-off,'range');segments.append(a.auditor.decompress(blob[off:off+z],e,2));cursor+=z
    require(cursor==n and struct.unpack_from('<I',segments[0])[0]==543,'table')
    def block(i):
        off,n,seg=struct.unpack_from('<III',segments[0],4+12*i);require(0<seg<len(segments) and 0<n<=len(segments[seg])-off,'block range');return segments[seg][off:off+n]
    p=block(191);require(struct.unpack_from('<II',p)==(0x0c0a75ba,18),'pixel header')
    r=s.Reader(p,24);require(r.array(r.string)==['CUSTOM_RIMLIGHT_ON','MATERIAL_QUALITY_HIGH'],'keywords')
    require(sha(block(31))=='97a8a665f65d325fd69c20d3fc97da7c4e2dec6b62345a4e0a9e4c4ed78f937a','parameters')
    programs=s.containers(p);require(len(programs)==1 and programs[0]['stage']=='pixel','program');pr=programs[0];d=p[pr['offset']:pr['offset']+pr['bytes']]
    require(len(d)==4624 and sha(d)=='31cac46a0a697592a17bd6a059c5c76fc8cd33708e45e9e5844da4e94a80d1e9','program hash')
    o=next(i for i in struct.unpack_from('<'+'I'*struct.unpack_from('<I',d,28)[0],d,32) if d[i:i+4]==b'SHEX')
    w=struct.unpack_from('<'+'I'*(struct.unpack_from('<I',d,o+4)[0]//4),d,o+8)
    for lo,hi,digest in [(80,96,'d0c5124be112ee0456a6442f9e0152313d3cde9bbdee3d470ac7fd6b373db093'),(110,507,'0a5ba6e983c68ed3f0f5599ceafa9c82251e609858b30a3dcc1f273efc43d862'),(544,562,'fe35316199175348e0928c3edc59eeb38b2b8fd9fe9615e514289a1e90c92f30'),(563,1065,'6150daf18b180ebd36fa75095ea03c77d76a983069f8a0a3c2bf395dc3cf4879')]:
        require(sha(struct.pack('<'+'I'*(hi-lo),*w[lo:hi]))==digest,'token block')
    return w

def vectors(w):
    evaluate=module('extract-furniture-shader-bindings').evaluate
    rng=random.Random(191);cases=[]
    dot=lambda a,b:sum(x*y for x,y in zip(a,b))
    norm=lambda v:[x/math.sqrt(dot(v,v)) for x in v]
    for i in range(512):
        vec=lambda n:[rng.uniform(.01,1) for _ in range(n)]
        base,tint,bump=vec(4),vec(4),vec(4)
        view=norm([rng.uniform(-1,1) for _ in range(3)]);light=norm([rng.uniform(-1,1) for _ in range(3)])
        am,af,lc,em,rp,rs=vec(3),vec(3),vec(3),vec(3),vec(3),vec(3)
        rough,metal,clamp,blend,intensity,_,feather,ri,rc,fog,fogMul=vec(11);power=rng.uniform(.1,5);ri*=5
        a=rng.uniform(-math.pi,math.pi);basis=[[math.cos(a),-math.sin(a),0],[math.sin(a),math.cos(a),0],[0,0,1]]
        r={(0,0):base.copy(),(8,1,2):tint,(8,1,3):em+[rough],(8,1,4):[metal,power,feather,ri],(8,1,5):[rc,clamp,0,0],(1,3):view+[0],(1,4):[0,0,0,fog],(8,0,5):light+[0],(8,0,6):lc+[0],(8,0,130):[fogMul,0,0,0],(8,2,0):am+[0],(8,2,1):af+[0],(8,2,2):[0,0,0,intensity],(8,2,3):[blend,0,0,0],**{(1,5+j):row+[0] for j,row in enumerate(basis)}}
        evaluate(w,80,96,r);r[0,2]=[bump[0],bump[1],bump[3],0];evaluate(w,110,507,r)
        direction=r[0,6][:3];lod=r[0,2][3];r[0,8]=rs+[0]
        if blend<1:r[0,6]=rp+[0];evaluate(w,544,562,r)
        evaluate(w,563,1065,r)
        require(all(math.isfinite(x) for x in r[2,0]+direction+[lod]),'nonfinite output')
        cases.append({'input':{'base':base,'tint':tint,'normalSample':bump,'tangentRows':basis,'view':view,'light':light,'lightColor':lc,'ambientMain':am,'ambientFill':af,'emission':em,'primary':rp,'secondary':rs,'roughness':rough,'metallic':metal,'lightingClamp':clamp,'reflectionBlend':blend,'reflectionIntensity':intensity,'rim':[power,feather,ri,rc],'fog':fog*fogMul},'expected':{'rgba':r[2,0],'direction':direction,'lod':lod}})
    return {'schema':'HKIA.GlassRimVectors.1','version':'3.0.1','cases':cases}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('definitions',type=Path);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    result=vectors(source(a.definitions))
    with a.out.open('x',encoding='utf8') as f:json.dump(result,f,separators=(',',':'));f.write('\n')

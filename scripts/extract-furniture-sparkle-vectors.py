#!/usr/bin/env python3
"""Recover synthetic reference vectors from the original Sparkle ForwardLit program.
No source bundle, shader bytes, rendered icon or save data is emitted."""
import argparse,struct,random,math,json,hashlib
from pathlib import Path
import importlib.util

def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def require(ok,msg):
    if not ok:raise ValueError(msg)
def sha(b):return hashlib.sha256(b).hexdigest()
def source(bundle):
    a=module('audit-native-dye-materials');s=module('audit-native-character-shader')
    raw=bundle.read_bytes();require(sha(raw)=='e070439c4caab460aaa692eaef75d066249a817aabaa34a3b79bca01505ad029','bundle hash')
    cab=dict(a.auditor.extract_nodes(raw)[1])['CAB-2b27edbfe7f08bad1cd631865ee4eb15']
    b=next(o for c,p,o,e in a.serialized_objects(cab,classes=(48,)) if p=='-2527260696058741820' and e=='<')
    require(sha(b)=='1d7fcbcf451083bffb545d5490fa8a894cf373f0f7b03dd834a89f21e07e7e9a','object hash')
    r=s.Reader(b,19752);require(r.string()=='Sunblink/Lynx/CustomLitSparkle','name');r.string();r.string();r.array(lambda:(r.string(),r.string()));r.array(lambda:(r.string(),r.string()));r.take('B');r.align()
    require(r.array(lambda:r.take('I'))==[4],'platform')
    off,sz,exp=[r.array(lambda:r.array(lambda:r.take('I')))[0] for _ in range(3)]
    n=r.take('I');blob=b[r.pos:r.pos+n];require(len(off)==len(sz)==len(exp)==3 and len(blob)==n,'segments')
    segs=[];cursor=0
    for o,z,e in zip(off,sz,exp):
        require(o==cursor and 0<z<=n-o and 0<e<=2000000,'segment bounds')
        segs.append(a.auditor.decompress(blob[o:o+z],e,2));cursor+=z
    require(cursor==n and struct.unpack_from('<I',segs[0])[0]==154,'table')
    o,n,s=struct.unpack_from('<III',segs[0],4+12*65);block=segs[s][o:o+n]
    require(struct.unpack_from('<II',block)==(0x0c0a75ba,18),'pixel header')
    program=segs[1][153210:153210+7516]
    require(sha(program)=='b2770077cbcf52d4cece003f9f9335d0cac6c848abae565f35b10eac6316b40f' and program in block,'pixel program')
    o=next(i for i in struct.unpack_from('<'+'I'*struct.unpack_from('<I',program,28)[0],program,32) if program[i:i+4]==b'SHEX')
    w=struct.unpack_from('<'+'I'*(struct.unpack_from('<I',program,o+4)[0]//4),program,o+8)
    for st,en,digest in [(126,177,'6d435759b386a67a64a861f244a7b050695a493ec250e0f7f106fb8840f6452b'),(191,263,'812f2c6ceb8273a704587b4e63321bb517c3a06a0beea7589aa17384f3037b4e'),(361,369,'66373699519604a0e93b8ccf5bd1bdf71fa4703cfa69f1186b37d0ffdf12cc47'),(383,446,'b93be06d58bdd4f77f53aee7794dc69538ac49e1708252be2877d5a29945c650'),(1145,1176,'2ff0376230e3d997f879f7ec0a73ddb1264872b03698bf1bc77da7c43c5d5fc0'),(1403,1463,'5481c3dd9280355150c04e5e9037a4d430bccc4d59d3f12946e39e64b1ef2a69')]:
        require(sha(struct.pack('<'+'I'*(en-st),*w[st:en]))==digest,'source token block')
    return w
def vectors(w):
    evaluate=module('extract-furniture-shader-bindings').evaluate
    rng=random.Random(65);cases=[]
    for i in range(128):
        base=[rng.random() for _ in range(4)];combo=[rng.random() for _ in range(4)];color=[rng.random() for _ in range(4)];smooth=rng.uniform(-1,1);metal=rng.uniform(-1,1);occ=rng.random();nm=[rng.random() for _ in range(4)];noise=[rng.random() for _ in range(3)];intensity=rng.random();uv=[rng.random(),rng.random()];scale=rng.uniform(.1,10);front=bool(i%2)
        reg={(0,0):base.copy(),(0,1):combo.copy(),(8,1,1):color,(8,1,2):[0,0,0,smooth],(8,1,3):[metal,0,0,occ]}
        evaluate(w,126,177,reg)
        reg[(0,4)]=[nm[0],nm[1],nm[3],0];reg[(1,9)]=[int(front),0,0,0];evaluate(w,191,263,reg)
        reg[(1,2)]=uv+[0,0];reg[(0,7)]=[0]*4;reg[(8,1,5)]=[0,0,0,scale];evaluate(w,361,369,reg)
        reg[(0,8)]=noise+[0];reg[(8,1,6)]=[intensity,0,0,0];evaluate(w,383,446,reg)
        expected={'albedo':reg[(0,2)][:3],'alpha':reg[(0,2)][3],'rawRoughness':reg[(0,0)][3],'rawMetallic':reg[(0,1)][0],'occlusion':reg[(0,1)][1],'emissionMask':combo[3],'baseNormal':reg[(0,5)][:3],'noiseNormal':reg[(0,4)][:3],'noiseUV':[reg[(0,7)][1],reg[(0,7)][3]]}
        noiseIndirect=[rng.random() for _ in range(3)];baseIndirect=[rng.random() for _ in range(3)];tint=[rng.random() for _ in range(3)];noiseSpecular=[rng.random() for _ in range(3)];noiseSpec=rng.uniform(0,100);directBase=[rng.random() for _ in range(3)];directLight=[rng.random() for _ in range(3)];emissionColor=[rng.random() for _ in range(3)]
        r={(0,10):noiseIndirect+[0],(0,1):[noiseSpec,expected['occlusion'],0,0],(0,2):expected['albedo']+[expected['alpha']],(8,1,5):tint+[0],(0,12):baseIndirect+[0]};evaluate(w,1145,1176,r);indirect=r[(0,10)][:3]
        r[(0,0)]=noiseSpecular+[0];r[(0,8)]=directBase+[0];r[(0,12)]=directLight+[0];r[(0,3)]=[x*combo[3] for x in expected['albedo']]+[0];r[(8,1,2)]=emissionColor+[0];evaluate(w,1403,1463,r)
        layer={'input':dict(noiseIndirect=noiseIndirect,baseIndirect=baseIndirect,sparkleTint=tint,noiseSpecular=noiseSpecular,noiseSpec=noiseSpec,directBase=directBase,directLight=directLight,emissionColor=emissionColor,albedo=expected['albedo'],alpha=expected['alpha'],occlusion=expected['occlusion'],emissionMask=combo[3]),'expected':dict(indirect=indirect,lit=r[(0,0)][:3])}
        cases.append({'layer':layer,'input':dict(base=base,combo=combo,baseColor=color,smoothnessShift=smooth,metallicShift=metal,occlusionStrength=occ,normal=nm,noise=noise,noiseIntensity=intensity,baseUV=uv,noiseScale=scale,frontFacing=front),'expected':expected})
    return {'schema':'HKIA.SparkleSurfaceVectors.1','version':'3.0.1','cases':cases}
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('bundle',type=Path);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    a.out.write_text(json.dumps(vectors(source(a.bundle)),separators=(',',':'))+'\n')

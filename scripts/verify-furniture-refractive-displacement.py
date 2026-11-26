#!/usr/bin/env python3
"""Validate isolated refraction direction against original high-quality DXBC.
Only synthetic vectors are emitted, not source shader bytes."""
import argparse, hashlib, importlib.util, json, math, random, struct
from pathlib import Path
def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def require(ok,msg):
    if not ok:raise ValueError(msg)
def verify(w):
    evaluate=module('extract-furniture-shader-bindings').evaluate
    for lo,hi,sha in [(294,305,'8a7c28674408b38ea26e3fbabd94c5cf43258f2be7c6a9210c7dd1f1e474451d'),(318,435,'0eae10bf797bd9cc1e0f7ee17b04482a7015e33b3948f38d1cf5e9499926218e'),(933,973,'1855bf9bf89de907d2f06cd7debfb029cd0aba2e4e75bc126f3013cbd4f35691'),(987,1126,'c3cd4c868233df02edf35e1adab59ba4db38725b5c8b0ebcbd6c559cd0d81f7d')]:
        require(hashlib.sha256(struct.pack('<'+'I'*(hi-lo),*w[lo:hi])).hexdigest()==sha,'native token range')
    rng=random.Random(243);cases=[];error=0.;tir=0
    dot=lambda a,b:sum(x*y for x,y in zip(a,b))
    norm=lambda v:[x/math.sqrt(dot(v,v)) for x in v]
    def compare(a,b):
        nonlocal error
        require(len(a)==len(b) and all(math.isfinite(x) for x in a+b),'finite values')
        error=max(error,max(abs(x-y) for x,y in zip(a,b)))
    for i in range(1024):
        nm=[rng.random() for _ in range(4)];smooth=[0.,1.,rng.random()][i%3];ch=rng.random()
        a=rng.uniform(-math.pi,math.pi);basis=[[math.cos(a),-math.sin(a),0.],[math.sin(a),math.cos(a),0.],[0.,0.,1.]]
        r={(8,1,7):[smooth,0,ch,0],(0,5):[nm[0],0,nm[1],nm[3]],(0,2):[0]*4,**{(1,5+j):v+[0] for j,v in enumerate(basis)}}
        evaluate(w,294,305,r);compare([r[0,5][0]],[5*smooth])
        r[0,5][0]=nm[0];r[0,5][2]=nm[1];r[0,5][3]=nm[3]
        evaluate(w,318,435,r)
        x=nm[0]*nm[3]*2-1;y=nm[1]*2-1;z=math.sqrt(1-min(1,x*x+y*y))
        n=norm([dot(row,[x*(1-smooth),y*(1-smooth),z+(1-z)*smooth]) for row in basis])
        compare([r[0,5][j] for j in (0,2,3)],n)
        view=norm([rng.uniform(-1,1),rng.uniform(-1,1),rng.random()]);c=dot(n,view)
        if c<=0:view=[-x for x in view];c=-c
        require(c>1e-6,'sample facing domain')
        fres=rng.uniform(.1,4);eta=rng.uniform(.2,2);scale=rng.uniform(0,5);power=rng.uniform(0,.5)
        uv=[rng.random(),rng.random()];noise=[rng.random(),rng.random()];cols=[[rng.uniform(-1,1) for _ in range(2)] for j in range(3)]
        r.update({(0,3):view+[0],(8,1,6):[scale,power,fres,0],(8,1,7):[smooth,eta,ch,0],(1,2):uv+[0,0],(0,1):[0]*4,**{(8,0,66+j):v+[0,0] for j,v in enumerate(cols)}})
        evaluate(w,933,973,r);compare(r[0,2][:2],[x*scale for x in uv]);r[0,2][:2]=noise
        evaluate(w,987,1039,r)
        # Original sqrt and ge/and mask. Negative discriminant produces NaN
        # in sqrt but the subsequent bitwise mask clears the entire vector.
        native_k=r[0,1][3]
        if native_k>=0:
            evaluate(w,1039,1054,r)
            evaluate(w,1061,1079,r)
        else:
            r[0,4]=[0.]*4
        evaluate(w,1086,1126,r)
        k=1-eta*eta*(1-c*c);tir+=k<0
        require((native_k<0)==(k<0),'discriminant sign')
        d=[(eta*v-(eta*c+math.sqrt(k))*a) if k>=0 else 0. for v,a in zip(view,n)]
        d[0]+=(2*noise[0]-1)*power;d[1]+=(2*noise[1]-1)*power
        disp=[sum(d[j]*cols[j][k] for j in range(3)) for k in range(2)]
        f=min(c**fres,1)
        compare([r[0,1][2],*r[0,2][:2]],[f,*disp])
        cases.append({'normalInput':{'sample':nm,'smoothness':smooth,'tangentRows':basis},'normal':n,
            'input':{'refractionNormal':n,'view':view,'index':eta,'fresnel':fres,'noiseSample':noise,'noisePower':power,'viewColumns':cols},
            'expected':{'facingFactor':r[0,1][2],'viewDisplacement':r[0,2][:2],'totalInternalReflection':k<0}})
    require(error<1e-12 and len(cases)==1024 and tir==398,'native arithmetic parity')
    return {'schema':'HKIA.RefractiveDisplacementVectors.1','version':'3.0.1','maxFloat64Error':error,'totalInternalReflectionCases':tir,'cases':cases}
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('definitions',type=Path);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    result=verify(module('extract-furniture-refractive-vectors').source(a.definitions))
    with a.out.open('x',encoding='utf8') as f:json.dump(result,f,separators=(',',':'));f.write('\n')

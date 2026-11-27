#!/usr/bin/env python3
"""Recover default-volume grading fields and curves from original Steam 3.0.1.
No game binaries are emitted. Does not resolve the live camera volume stack."""
import argparse,importlib.util,json,struct
from pathlib import Path
spec=importlib.util.spec_from_file_location('preview_output',Path(__file__).with_name('verify-furniture-preview-output.py'))
src=importlib.util.module_from_spec(spec);spec.loader.exec_module(src)
require=src.require
sha=src.sha
def audit(path):
    raw=path.read_bytes()
    require(sha(raw)=='2e0b45213e7b65120e5aa72f5e1dd708e46abcc61ff9ceb2645d6f2e055227d6','source digest')
    objs=src.objects(raw)
    def get(pid,name,digest,size):
        cls,b=objs[pid]
        require(cls==114 and sha(b)==digest and len(b)==size,'object identity')
        r=src.native.Reader(b,28);require(r.string()==name,'object name')
        return b,r.pos
    profile,p=get(10324,'DefaultVolumeProfile','348ff93ae9e7d587b16c7cd2655569707a679f41f55b3ec11ebf04e9b5382ad5',296)
    count=struct.unpack_from('<I',profile,p)[0];require(count==20 and p+4+12*count==len(profile),'profile links')
    links=[struct.unpack_from('<iq',profile,p+4+12*i) for i in range(count)]
    require(links==[(0,pid) for pid in [10349,10354,10317,10311,10344,10361,10345,10338,10350,10351,10323,10359,10352,10302,10353,10343,10355,10357,10304,10310]],'profile references')
    b,p=get(10352,'ColorCurves','1534520ea482c526d94960d32db1d68608104e56374f141670003e83953c9229',560)
    require(struct.unpack_from('<I',b,p)[0]==1,'active component');p+=4
    curves=[]
    names=['master','red','green','blue','hueVsHue','hueVsSat','satVsSat','lumVsSat']
    for i,name in enumerate(names):
        override,length,loop,zero,rng,n=struct.unpack_from('<IIIffI',b,p);p+=24
        require(override==1 and length==n==(2 if i<4 else 0) and loop==(i in (4,5)) and zero==(0 if i<4 else .5) and rng==1,'curve fields')
        keys=[struct.unpack_from('<ffffIff',b,p+28*j) for j in range(n)];p+=28*n
        require(keys==([(0.,0.,1.,1.,0,0.,0.),(1.,1.,1.,1.,0,0.,0.)] if i<4 else []),'curve keys')
        wrap=struct.unpack_from('<III',b,p);p+=12
        require(wrap==(2,2,4),'curve wrap')
        curves.append({'slot':i,'name':name,'override':True,'length':length,'loop':bool(loop),'zeroValue':zero,'range':rng,'keys':[list(k) for k in keys],'preInfinity':wrap[0],'postInfinity':wrap[1],'rotationOrder':wrap[2]})
    require(p==len(b),'curve bounds')
    def fields(pid,name,digest,size,params):
        b,p=get(pid,name,digest,size)
        require(struct.unpack_from('<I',b,p)[0]==1,'active component')
        p+=4;out={}
        for name,fmt in params:
            override=struct.unpack_from('<I',b,p)[0];p+=4
            require(override==1,'override state')
            n=struct.calcsize('<'+fmt);v=struct.unpack_from('<'+fmt,b,p);p+=n
            out[name]=v[0] if len(v)==1 else list(v)
        require(p==len(b),'parameter bounds')
        return out
    white=fields(10317,'WhiteBalance','318739c402215eabcc7019a02a569bcca13666dcde18fbf991b380b61b1f87b8',64,[('temperature','f'),('tint','f')])
    adjust=fields(10338,'ColorAdjustments','309aba76479056abc734bc82f11c8ca4fb882da329b37b9709b2dc6cdda8cad4',104,[('postExposure','f'),('contrast','f'),('colorFilter','ffff'),('hueShift','f'),('saturation','f')])
    lgg=fields(10323,'LiftGammaGain','9fe66a1fe9ca0408e753a59b165aee10caa726aed7741160d2b072fa0953a209',112,[(x,'ffff') for x in ['lift','gamma','gain']])
    mixer=fields(10351,'ChannelMixer','216a6835f135df242e0855d0e878c961d9df583cca60e6e2509a95d296a3d30d',120,[(x,'f') for x in ['redOutRedIn','redOutGreenIn','redOutBlueIn','greenOutRedIn','greenOutGreenIn','greenOutBlueIn','blueOutRedIn','blueOutGreenIn','blueOutBlueIn']])
    smh=fields(10361,'ShadowsMidtonesHighlights','ed90d1b97295a597578aff4af1442c9eb99b5307dbe624662f0b48b8d5a3cd76',156,[(x,'ffff') for x in ['shadows','midtones','highlights']]+[(x,'f') for x in ['shadowsStart','shadowsEnd','highlightsStart','highlightsEnd']])
    split=fields(10357,'SplitToning','f000440aa86ee4d2aa5aeffbe25c18ff4fafdc758a0bf1751e1ba806f36bf9e6',96,[('shadows','ffff'),('highlights','ffff'),('balance','f')])
    vignette=fields(10350,'Vignette','80f6859044b4c19ac2033c842de1667107ac6e4c94a7dcb53a5734e43f849d82',100,[('color','ffff'),('center','ff'),('intensity','f'),('smoothness','f'),('rounded','I')])
    return {'schema':'HKIA.DefaultGradeProfile.1','version':'3.0.1','sourceSha256':sha(raw),'profilePathId':'10324','profileSha256':sha(profile),'curvePathId':'10352','curveSha256':sha(objs[10352][1]),'componentPathIds':[str(pid) for _,pid in links],'curves':curves,'parameters':{'whiteBalance':white,'colorAdjustments':adjust,'liftGammaGain':lgg,'channelMixer':mixer,'shadowsMidtonesHighlights':smh,'splitToning':split,'vignette':vignette},'effectiveCameraVolumeVerified':False}
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('globalgamemanagers_assets',type=Path);a=p.parse_args()
    print(json.dumps(audit(a.globalgamemanagers_assets),indent=2))

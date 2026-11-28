#!/usr/bin/env python3
"""Rebuild original level-4 BC1 samples for the fixed wand composition grid."""
import argparse, json, math, struct
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec
import numpy as np
from PIL import Image

def module(name):
    spec=spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=module_from_spec(spec);spec.loader.exec_module(m);return m

common=module('extract-wand-candidate-source')
sha,require=common.sha,common.require
D,DCAB,SCALE=common.D,common.DCAB,common.SCALE
EXPECTED='173d88da94f5bdc04f9401a67d559cf245db9e45a1d8dbeea981844f7dd297c6'
def extract(definitions,manifest_bytes,out):
    require(sha(definitions)==D and sha(manifest_bytes)==EXPECTED,'original fingerprints')
    expected=json.loads(manifest_bytes)
    mesh=module('extract-furniture-mesh-source');typed=module('extract-furniture-preview-camera');audit=module('unityfs-audit')
    nodes=dict(audit.extract_nodes(definitions)[1]);objects,_=typed.load(nodes[DCAB],mesh)
    defs={}
    for _,(cls,t,b) in objects.items():
        if cls!=114 or not {'Id','UiIcon','SerializedGuid'}<=set(n[2] for n in t[-1]):continue
        _,p=mesh.string(b,28);i=mesh.u(b,p+36);f,s=mesh.ptr(b,p+80)
        require(f==0 and i not in defs and objects[s][0]==213,'definition UiIcon');defs[i]=s
    require(len(defs)==12163 and len(set(defs.values()))==5020,'definition coverage')
    level=math.floor(math.log2(512/(84*SCALE))+.5);require(level==4,'fixed grid LOD')
    sizes=[max(1,512>>i) for i in range(10)]
    lengths=[((n+3)//4)**2*8 for n in sizes];require(sum(lengths)==174776,'mip chain length')
    linear=np.where(np.arange(256)/255<=.04045,np.arange(256)/255/12.92,((np.arange(256)/255+.055)/1.055)**2.4)
    sheet=np.zeros((340,340,3),dtype=np.uint8);rows=[]
    for cell,source in enumerate(expected['rows']):
        i=source['itemId'];sid=defs[i]
        require(sid==source['spritePathId'] and list(defs.values()).count(sid)==1,'original item identity')
        cls,t,b=objects[sid];sn,p=mesh.string(b,0);r=struct.unpack_from('<4f',b,p)
        require(cls==213 and r==(0.,0.,512.,512.) and struct.unpack_from('<4f',b,p+24)==(0.,)*4 and struct.unpack_from('<2f',b,p+44)==(.5,.5),'sprite geometry')
        key=b[p+60:p+84];j=p+84;nt=mesh.u(b,j);j+=4
        for _ in range(nt):_,j=mesh.string(b,j)
        ref=mesh.ptr(b,j);j+=12
        require(ref==[0,'0'],'standalone sprite')
        f,tid,af,ap=struct.unpack_from('<iqiq',b,j);j+=24
        require(f==af==ap==0 and mesh.u(b,j)==0,'standalone texture refs');j+=4
        j+=4+mesh.u(b,j)*48;j=mesh.align(j+4+mesh.u(b,j));j+=4
        j+=4+mesh.u(b,j)*4;j=mesh.align(j+4+mesh.u(b,j));j+=4+mesh.u(b,j)*64
        x,y,w,h,ox,oy,ax,ay,flags,*uv,down=struct.unpack_from('<8fI5f',b,j)
        require((x,y,w,h,ox,oy)==(0.,0.,512.,512.,0.,0.) and flags in (64,65,67) and down==1,'standalone render layout')
        tid=str(tid);cls,t,b=objects[tid];f=mesh.fields(t,b)
        require(cls==28 and [mesh.u(f[k]) for k in ('m_Width','m_Height','m_TextureFormat','m_MipCount')]==[512,512,10,10],'BC1 mip chain')
        require(struct.unpack('<II f III',f['m_TextureSettings'])==(1,2,0.,1,1,0) and mesh.u(f['m_ColorSpace'])==1 and mesh.u(f['m_CompleteImageSize'])==sum(lengths) and mesh.u(f['m_MipsStripped'])==0,'original texture settings')
        off,z=struct.unpack_from('<QI',f['m_StreamData']);name,end=mesh.string(f['m_StreamData'],12);res=nodes[DCAB+'.resS']
        require(name==f'archive:/{DCAB}/{DCAB}.resS' and end==len(f['m_StreamData']) and z==sum(lengths) and off+z<=len(res),'original texture stream')
        raw=res[off:off+z];n=sizes[level];mip=raw[sum(lengths[:level]):sum(lengths[:level+1])]
        im=np.asarray(Image.frombytes('RGBA',(n,n),mip,'bcn',1).transpose(Image.Transpose.FLIP_TOP_BOTTOM))
        require(np.all(im[:,:,3]==255),'opaque original BC1 samples')
        u0=(np.arange(34,dtype=np.float64)+4.5-21)/(84*SCALE)+.5
        valid=(u0[:,None]>=0)&(u0[:,None]<1)&(u0[None,:]>=0)&(u0[None,:]<1)
        xy=u0*n-.5;ix=np.floor(xy).astype(int);frac=xy-ix
        def sample(a,b):
            return linear[im[np.clip(ix[:,None]+b,0,n-1),np.clip(ix[None,:]+a,0,n-1),:3]]
        p00,p10,p01,p11=sample(0,0),sample(1,0),sample(0,1),sample(1,1);fx=frac[None,:,None];fy=frac[:,None,None]
        rgb=(p00+(p10-p00)*fx)*(1-fy)+(p01+(p11-p01)*fx)*fy
        rgb=np.floor(np.where(rgb<=.0031308,12.92*rgb,1.055*rgb**(1/2.4)-.055)*255+.5).astype(np.uint8);rgb[~valid]=0;alpha=valid.astype(np.uint8)*255
        row=dict(itemId=i,spritePathId=sid,texturePathId=tid,renderKey=key.hex(),name=sn,sourceTextureSha256=sha(raw),mipSha256=sha(mip),sampleRgbaSha256=sha(np.concatenate((rgb,alpha[:,:,None]),axis=2).tobytes()),cell=cell)
        require(row==source,'original sample identity');rows.append(row)
        x=cell%10*34;y=cell//10*34;sheet[y:y+34,x:x+34]=rgb;sheet[y+170:y+204,x:x+34]=alpha[:,:,None]
    require(len(rows)==47 and sha(sheet.tobytes())==expected['texture']['rgbSha256'],'decoded sheet fingerprint')
    out.mkdir(parents=True,exist_ok=True);f=out/'wand-mip-source.webp'
    Image.fromarray(sheet,'RGB').save(f,lossless=True,method=6,exact=True)
    require(np.array_equal(np.asarray(Image.open(f).convert('RGB')),sheet),'lossless readback')
    require(f.stat().st_size==expected['texture']['bytes'] and sha(f.read_bytes())==expected['texture']['sha256'],'WebP fingerprint')
    (out/'wand-mip-source.json').write_bytes(manifest_bytes)
    print('HKIA_WAND_MIP_SOURCE_OK 47 original sprites')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',required=True,type=Path);p.add_argument('--out',required=True,type=Path);p.add_argument('--manifest',type=Path,default=Path(__file__).resolve().parents[1]/'public/dynamic-wand-art/mip-source/wand-mip-source.json');a=p.parse_args()
    extract((a.root/'definitions.bin').read_bytes(),a.manifest.read_bytes(),a.out)

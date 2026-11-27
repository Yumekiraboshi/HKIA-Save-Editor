#!/usr/bin/env python3
"""Extract all non-square definition UiIcons at the original wand sample centers."""
import argparse, json, struct
from pathlib import Path
import numpy as np
from PIL import Image
from importlib.util import spec_from_file_location,module_from_spec

def load(name):
    s=spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=module_from_spec(s);s.loader.exec_module(m);return m

common=load('extract-wand-candidate-source')
sha=common.sha;require=common.require
D,A,DCAB,ACAB,ATLAS=common.D,common.A,common.DCAB,common.ACAB,common.ATLAS
IDS=[371479572,583339916,803563219,1057045178,1314269583]
EXPECTED='950095992ecb78341afb1cf6c5c2afaf16de8b6b365cf66c8fcb66c692d7096a'
SIDE=34;SCALE=common.SCALE

def extract(definitions,atlas,out):
    require(sha(definitions)==D and sha(atlas)==A,'original fingerprints')
    mesh=common.module('extract-furniture-mesh-source')
    typed=common.module('extract-furniture-preview-camera')
    audit=common.module('unityfs-audit')
    dn=dict(audit.extract_nodes(definitions)[1]);do,ext=typed.load(dn[DCAB],mesh)
    require(ext[1].endswith(ACAB),'definition atlas reference')
    an=dict(audit.extract_nodes(atlas)[1]);ao,_=typed.load(an[ACAB],mesh)
    cls,t,b=ao[ATLAS];require(cls==687078895,'SpriteAtlas')
    v=mesh.fields(t,b)['m_RenderDataMap'];count=mesh.u(v);p=4;records={}
    for _ in range(count):
        key=v[p:p+24];r=struct.unpack_from('<iqiq4f2f2f4ffII',v,p+24)
        require(key not in records,'duplicate render key');records[key]=r;p+=108
    require(len(records)==6492 and p==len(v),'atlas coverage')
    defs={};non_square=[]
    for pid,(cls,t,b) in do.items():
        if cls!=114 or not {'Id','UiIcon','SerializedGuid'}<=set(n[2] for n in t[-1]):continue
        name,p=mesh.string(b,28);i=mesh.u(b,p+36);f,s=mesh.ptr(b,p+80)
        require(f==0 and i not in defs and do[s][0]==213,'definition UiIcon')
        defs[i]=(pid,name,s)
        _,_,sb=do[s];_,p=mesh.string(sb,0);x,y,w,h=struct.unpack_from('<4f',sb,p)
        if w!=h:non_square.append(i)
    require(len(defs)==12163 and sorted(non_square)==IDS,'all non-square definition closure')
    sheet=np.zeros((68,170,3),dtype=np.uint8);rows=[]
    linear=np.where(np.arange(256)/255<=.04045,np.arange(256)/255/12.92,((np.arange(256)/255+.055)/1.055)**2.4)
    for n,i in enumerate(IDS):
        pid,name,sid=defs[i];cls,t,b=do[sid];sn,p=mesh.string(b,0);r=struct.unpack_from('<4f',b,p);lw,lh=r[2:]
        require(r[:2]==(0.,0.) and lw>0 and lh>0 and struct.unpack_from('<4f',b,p+24)==(0.,)*4 and struct.unpack_from('<2f',b,p+44)==(.5,.5),'sprite geometry')
        key=b[p+60:p+84];j=p+84;nt=mesh.u(b,j);j+=4
        for _ in range(nt):_,j=mesh.string(b,j)
        ref=mesh.ptr(b,j);j+=12
        if ref==[2,ATLAS]:
            r=records[key];require(r[0]==r[2]==r[3]==0 and r[-3]==1 and r[-2] in (65,67) and r[-1]==0,'atlas render layout')
            tid=str(r[1]);rect=r[4:8];offset=r[8:10];kind=0
            objects,nodes,cab=ao,an,ACAB
        else:
            require(ref==[0,'0'],'standalone Sprite atlas')
            f,tid,af,ap=struct.unpack_from('<iqiq',b,j);j+=24
            require(f==af==ap==0 and mesh.u(b,j)==0,'standalone texture refs');j+=4
            j+=4+mesh.u(b,j)*48;j=mesh.align(j+4+mesh.u(b,j));j+=4
            j+=4+mesh.u(b,j)*4;j=mesh.align(j+4+mesh.u(b,j));j+=4+mesh.u(b,j)*64
            x,y,w,h,ox,oy,ax,ay,flags,*uv,down=struct.unpack_from('<8fI5f',b,j)
            require(flags in (64,65,67) and down==1,'standalone render layout')
            tid=str(tid);rect=(x,y,w,h);offset=(ox,oy);kind=1
            objects,nodes,cab=do,dn,DCAB
        cls,t,b=objects[tid];require(cls==28,'texture class');f=mesh.fields(t,b)
        w,h,fmt,mips=[mesh.u(f[k]) for k in ('m_Width','m_Height','m_TextureFormat','m_MipCount')]
        require(fmt==(3 if kind else 12) and mips==1 and mesh.u(f['m_TextureSettings'])==1 and mesh.u(f['m_ColorSpace'])==1,'RGB24/BC3 single-mip bilinear sRGB source')
        off,z=struct.unpack_from('<QI',f['m_StreamData']);streamname,end=mesh.string(f['m_StreamData'],12);res=nodes[cab+'.resS']
        require(streamname==f'archive:/{cab}/{cab}.resS' and end==len(f['m_StreamData']) and z==(w*h*3 if fmt==3 else ((w+3)//4)*((h+3)//4)*16) and off+z<=len(res),'texture stream')
        raw=res[off:off+z]
        img=Image.frombytes('RGBA',(w,h),raw,'bcn',3) if fmt==12 else Image.frombytes('RGB',(w,h),raw).convert('RGBA')
        im=np.asarray(img.transpose(Image.Transpose.FLIP_TOP_BOTTOM))
        x,y,rw,rh=rect;ox,oy=offset;top=lh-oy-rh;right=ox+rw;bot=top+rh
        require(0<=x<x+rw<=w and 0<=y<y+rh<=h and -.001<=ox<right<=lw+.001 and -.001<=top<bot<=lh+.001,'sprite bounds')
        scale=84*SCALE/max(lw,lh);delta=np.arange(SIDE,dtype=np.float64)+4.5-21
        sx=delta/scale+lw/2;sy=delta/scale+lh/2
        valid=(sy[:,None]>=top)&(sy[:,None]<bot)&(sx[None,:]>=ox)&(sx[None,:]<right)
        bx=x+(sx-ox)/(right-ox)*rw;by=h-y-rh+(sy-top)/(bot-top)*rh
        ix=np.floor(bx-.5).astype(int);iy=np.floor(by-.5).astype(int);fx=bx-.5-ix;fy=by-.5-iy
        def sample(a,b):
            p=im[np.clip(iy[:,None]+b,0,h-1),np.clip(ix[None,:]+a,0,w-1)]
            return np.concatenate((linear[p[:,:,:3]],p[:,:,3:]/255),axis=2)
        p00,p10,p01,p11=sample(0,0),sample(1,0),sample(0,1),sample(1,1);f=fx[None,:,None];g=fy[:,None,None]
        rgba=(p00+(p10-p00)*f)*(1-g)+(p01+(p11-p01)*f)*g;rgba[~valid]=0
        srgb=np.where(rgba[:,:,:3]<=.0031308,12.92*rgba[:,:,:3],1.055*rgba[:,:,:3]**(1/2.4)-.055)
        rgb=np.floor(srgb*255+.5).astype(np.uint8);alpha=np.floor(rgba[:,:,3]*255+.5).astype(np.uint8)
        require(alpha.max()>0,'nonempty sample')
        sheet[:34,n*34:(n+1)*34]=rgb;sheet[34:,n*34:(n+1)*34]=alpha[:,:,None]
        rows.append({'itemId':i,'definitionPathId':str(pid),'spritePathId':str(sid),'texturePathId':str(tid),'renderKey':key.hex(),'logicalSize':[lw,lh],'rect':rect,'trim':[ox,top,right,bot],'textureSize':[w,h],'format':fmt,'kind':kind,'cell':n,'key':name,'spriteName':sn,'sourceTextureSha256':sha(raw),'rgbaSampleSha256':sha(np.concatenate((rgb,alpha[:,:,None]),axis=2).tobytes())})
    out.mkdir(parents=True,exist_ok=True);f=out/'wand-nonsquare.webp'
    Image.fromarray(sheet,'RGB').save(f,lossless=True,method=6,exact=True)
    require(np.array_equal(np.asarray(Image.open(f).convert('RGB')),sheet),'lossless readback')
    manifest={'schema':'HKIA.WandNonSquareSource.1','version':'3.0.1','definitionsSha256':D,'atlasSha256':A,'sampleSize':34,'sampleOrigin':[4,4],'logicalSize':84,'scale':SCALE,'offsetPercent':[-.25,.25],'rotation':0,'alphaOffsetY':34,'texture':{'file':f.name,'bytes':f.stat().st_size,'sha256':sha(f.read_bytes()),'rgbSha256':sha(sheet.tobytes()),'width':170,'height':68},'rows':rows}
    raw=(json.dumps(manifest,separators=(',',':'))+'\n').encode();require(sha(raw)==EXPECTED,'manifest fingerprint '+sha(raw));(out/'wand-nonsquare.json').write_bytes(raw)
    print('HKIA_WAND_NON_SQUARE_SOURCE_OK 5 original sprites')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    extract((a.root/'definitions.bin').read_bytes(),(a.root/'atlas_global.bin').read_bytes(),a.out)

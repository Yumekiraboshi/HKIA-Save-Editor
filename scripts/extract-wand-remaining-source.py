#!/usr/bin/env python3
"""Rebuild the remaining original single-mip wand source sample sheets."""
import argparse, collections, json, struct
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec
import numpy as np
from PIL import Image

def module(name):
    spec=spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=module_from_spec(spec);spec.loader.exec_module(m);return m

common=module('extract-wand-candidate-source')
sha,require=common.sha,common.require
D,A,DCAB,ACAB,ATLAS=common.D,common.A,common.DCAB,common.ACAB,common.ATLAS
EXPECTED='7b4834de7a2dbc86bb1fb7592c84da17630605b76a01c4f396f833da616d94ac'
EXCLUDED={371479572,583339916,803563219,1057045178,1314269583,1061947263,1835273963}
SIDE,COLS,PER,HALF,SCALE=common.SIDE,common.COLS,common.PER,common.HALF,common.SCALE

def extract(definitions,atlas,candidate_bytes,out):
    require(sha(definitions)==D and sha(atlas)==A and sha(candidate_bytes)==common.EXPECTED,'original fingerprints')
    candidate=json.loads(candidate_bytes)
    mesh=module('extract-furniture-mesh-source');typed=module('extract-furniture-preview-camera');audit=module('unityfs-audit')
    dn=dict(audit.extract_nodes(definitions)[1]);do,ext=typed.load(dn[DCAB],mesh)
    require(ext[1].endswith(ACAB),'definition atlas reference')
    an=dict(audit.extract_nodes(atlas)[1]);ao,_=typed.load(an[ACAB],mesh)
    cls,t,b=ao[ATLAS];require(cls==687078895,'SpriteAtlas')
    v=mesh.fields(t,b)['m_RenderDataMap'];count=mesh.u(v);p=4;records={}
    for _ in range(count):
        key=v[p:p+24];r=struct.unpack_from('<iqiq4f2f2f4ffII',v,p+24)
        require(key not in records,'duplicate render key');records[key]=r;p+=108
    require(len(records)==6492 and p==len(v),'atlas coverage')
    defs={}
    for _,(cls,t,b) in do.items():
        if cls!=114 or not {'Id','UiIcon','SerializedGuid'}<=set(n[2] for n in t[-1]):continue
        _,p=mesh.string(b,28);i=mesh.u(b,p+36);f,s=mesh.ptr(b,p+80)
        require(f==0 and i not in defs and do[s][0]==213,'definition UiIcon')
        defs[i]=s
    require(len(defs)==12163 and len(set(defs.values()))==5020,'definition coverage')
    known={r[0] for r in candidate['sprites']}
    require(len(known)==3150 and all(defs[int(i)]==s for i,s in candidate['items'].items()),'original candidate binding')
    dedicated={defs[i] for i in EXCLUDED}
    require(len(dedicated)==7 and not known&dedicated,'dedicated coverage')
    remaining=sorted(set(defs.values())-known-dedicated,key=int)
    require(len(remaining)==1863 and sum(s in set(remaining) for s in defs.values())==3199,'remaining coverage')
    groups=collections.defaultdict(list)
    for sid in remaining:
        cls,t,b=do[sid];require(cls==213,'Sprite class');sn,p=mesh.string(b,0)
        r=struct.unpack_from('<4f',b,p);lw,lh=r[2:]
        require(r[:2]==(0.,0.) and lw==lh and lw>0 and struct.unpack_from('<4f',b,p+24)==(0.,)*4 and struct.unpack_from('<2f',b,p+44)==(.5,.5),'sprite geometry')
        key=b[p+60:p+84];j=p+84;nt=mesh.u(b,j);j+=4
        for _ in range(nt):_,j=mesh.string(b,j)
        ref=mesh.ptr(b,j);j+=12
        if ref==[2,ATLAS]:
            r=records[key];require(r[0]==r[2]==r[3]==0 and r[-3]==1 and r[-2] in (65,67) and r[-1]==0,'atlas render layout')
            tid=str(r[1]);rect=r[4:8];offset=r[8:10];kind=0
        else:
            require(ref==[0,'0'],'standalone Sprite atlas');f,tid,af,ap=struct.unpack_from('<iqiq',b,j);j+=24
            require(f==af==ap==0 and mesh.u(b,j)==0,'standalone texture refs');j+=4
            j+=4+mesh.u(b,j)*48;j=mesh.align(j+4+mesh.u(b,j));j+=4
            j+=4+mesh.u(b,j)*4;j=mesh.align(j+4+mesh.u(b,j));j+=4+mesh.u(b,j)*64
            x,y,w,h,ox,oy,ax,ay,flags,*uv,down=struct.unpack_from('<8fI5f',b,j)
            require(flags in (64,65,67) and down==1,'standalone render layout')
            tid=str(tid);rect=(x,y,w,h);offset=(ox,oy);kind=1
        groups[kind,tid].append((sid,lw,rect,offset,key.hex(),sn))
    require(len(groups)==193,'remaining texture coverage')
    linear=np.where(np.arange(256)/255<=.04045,np.arange(256)/255/12.92,((np.arange(256)/255+.055)/1.055)**2.4)
    samples={};metadata={};rejected=set()
    for (kind,tid),rows in groups.items():
        objects,nodes,cab=(do,dn,DCAB) if kind else (ao,an,ACAB)
        cls,t,b=objects[tid];require(cls==28,'texture class');f=mesh.fields(t,b)
        w,h,fmt,mips=[mesh.u(f[k]) for k in ('m_Width','m_Height','m_TextureFormat','m_MipCount')]
        require(mesh.u(f['m_TextureSettings'])==1 and mesh.u(f['m_ColorSpace'])==1,'bilinear sRGB texture')
        if fmt==10 and mips==10 and kind==1 and w==h==512:
            rejected.update(row[0] for row in rows);continue
        require(fmt in (3,4,12) and mips==1,'single mip source')
        off,z=struct.unpack_from('<QI',f['m_StreamData']);name,end=mesh.string(f['m_StreamData'],12);res=nodes[cab+'.resS']
        require(name==f'archive:/{cab}/{cab}.resS' and end==len(f['m_StreamData']) and z=={3:w*h*3,4:w*h*4,12:((w+3)//4)*((h+3)//4)*16}[fmt] and off+z<=len(res),'texture stream')
        raw=res[off:off+z]
        img=Image.frombytes('RGBA',(w,h),raw,'bcn',3) if fmt==12 else Image.frombytes('RGB' if fmt==3 else 'RGBA',(w,h),raw).convert('RGBA')
        im=np.asarray(img.transpose(Image.Transpose.FLIP_TOP_BOTTOM))
        for sid,lw,rect,offset,key,sn in rows:
            x,y,rw,rh=rect;ox,oy=offset;top=lw-oy-rh;right=ox+rw;bot=top+rh
            require(0<=x<x+rw<=w+.001 and 0<=y<y+rh<=h+.001 and -.001<=ox<right<=lw+.001 and -.001<=top<bot<=lw+.001,'sprite bounds')
            u0=(np.arange(SIDE,dtype=np.float64)+4.5-21)/(84*SCALE)+.5;sx=u0*lw;sy=sx
            valid=(sy[:,None]>=top)&(sy[:,None]<bot)&(sx[None,:]>=ox)&(sx[None,:]<right)
            bx=x+(sx-ox)/(right-ox)*rw;by=h-y-rh+(sy-top)/(bot-top)*rh
            ix=np.floor(bx-.5).astype(int);iy=np.floor(by-.5).astype(int);fx=bx-.5-ix;fy=by-.5-iy
            def sample(a,b):
                p=im[np.clip(iy[:,None]+b,0,h-1),np.clip(ix[None,:]+a,0,w-1)]
                return np.concatenate((linear[p[:,:,:3]],p[:,:,3:]/255),axis=2)
            p00,p10,p01,p11=sample(0,0),sample(1,0),sample(0,1),sample(1,1);fx=fx[None,:,None];fy=fy[:,None,None]
            rgba=(p00+(p10-p00)*fx)*(1-fy)+(p01+(p11-p01)*fx)*fy;rgba[~valid]=0
            srgb=np.where(rgba[:,:,:3]<=.0031308,12.92*rgba[:,:,:3],1.055*rgba[:,:,:3]**(1/2.4)-.055)
            rgb=np.floor(srgb*255+.5).astype(np.uint8);alpha=np.floor(rgba[:,:,3]*255+.5).astype(np.uint8)
            require(alpha.max()>0,'nonempty sample')
            samples[sid]=(rgb,alpha);metadata[sid]=(tid,key,kind,fmt,sha(np.concatenate((rgb,alpha[:,:,None]),axis=2).tobytes()))
    require(len(samples)==1816 and len(rejected)==47 and set(samples)|rejected==set(remaining),'sample coverage')
    out.mkdir(parents=True,exist_ok=True);textures=[];sprites=[];ordered=sorted(samples,key=int)
    for pack in range((len(ordered)+PER-1)//PER):
        sheet=np.zeros((HALF*2,HALF,3),dtype=np.uint8)
        for i,sid in enumerate(ordered[pack*PER:(pack+1)*PER]):
            rgb,alpha=samples[sid];x=i%COLS*SIDE;y=i//COLS*SIDE
            sheet[y:y+SIDE,x:x+SIDE]=rgb;sheet[y+HALF:y+HALF+SIDE,x:x+SIDE]=alpha[:,:,None]
            sprites.append([sid,pack,i,*metadata[sid]])
        f=out/('wand-remainder-%02d.webp'%pack);Image.fromarray(sheet,'RGB').save(f,lossless=True,method=6,exact=True)
        require(np.array_equal(np.asarray(Image.open(f).convert('RGB')),sheet),'lossless source readback')
        textures.append({'file':f.name,'bytes':f.stat().st_size,'sha256':sha(f.read_bytes()),'rgbSha256':sha(sheet.tobytes()),'width':816,'height':1632})
    manifest={'schema':'HKIA.WandRemainingOriginalSprites.1','version':'3.0.1','definitionsSha256':D,'atlasSha256':A,'sampleSize':34,'sampleOrigin':[4,4],'logicalSize':84,'scale':SCALE,'offsetPercent':[-.25,.25],'rotation':0,'columns':24,'rowsPerSheet':24,'alphaOffsetY':816,'textures':textures,'sprites':sprites,'items':{str(i):s for i,s in sorted(defs.items()) if s in samples},'mipmappedExcluded':[[i,s] for i,s in sorted(defs.items()) if s in rejected]}
    raw=(json.dumps(manifest,separators=(',',':'))+'\n').encode()
    require(sha(raw)==EXPECTED,'exact manifest fingerprint '+sha(raw));(out/'index.json').write_bytes(raw)
    print('HKIA_WAND_REMAINING_SOURCE_OK 1816 sprites, 3152 Item IDs, 47 mipmapped exclusions')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',required=True,type=Path);p.add_argument('--out',required=True,type=Path);p.add_argument('--manifest',type=Path,default=Path(__file__).resolve().parents[1]/'public/dynamic-wand-art/candidate-source/index.json');a=p.parse_args()
    extract((a.root/'definitions.bin').read_bytes(),(a.root/'atlas_global.bin').read_bytes(),a.manifest.read_bytes(),a.out)

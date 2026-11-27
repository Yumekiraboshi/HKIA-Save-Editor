#!/usr/bin/env python3
"""Rebuild item-wand source samples from pinned game originals, not completed variants."""
import argparse, collections, hashlib, importlib.util, json, re, struct
from pathlib import Path
import numpy as np
from PIL import Image

D='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0'
A='04c1f4c191b0a821a0bbcb15e67a75bec85cf343a0b2e875ee8e525e1e8dfc7b'
BITS='433ec9faa61477cfc61bb069222522f2daa82f3c89d9c9474223a59e6e5afcca'
EXPECTED='1b006f3ed28cfb16f4f25738d1d57ec2f86a447bf9e717a85124c3827d78dd09'
DCAB='CAB-46b8f8fe122147493b3113f7c1c8cd0f'
ACAB='CAB-7b5f150a8a680cc279a40f4d3ca4f657'
ATLAS='5896659347915696894'
SIDE=34; COLS=24; PER=576; HALF=816; SCALE=float(np.float32(.4))

def sha(b):return hashlib.sha256(b).hexdigest()
def require(ok,msg):
    if not ok:raise ValueError(msg)
def module(name):
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def candidates(repo):
    rules=(repo/'core/src/inventory_source_data.rs').read_text().split('pub(super) const RULES:')[1].split('];')[0]
    ids=[int(i) for i,_ in re.findall(r'\((\d+),(\d+)\)',rules)]
    bits=(repo/'core/src/inventory_wand_ingredient_data.rs').read_text().split('=&[')[1].split('];')[0]
    bits=bytes(int(x,16) for x in re.findall(r'0x([0-9a-f]{2})',bits))
    require(len(ids)==12163 and ids==sorted(set(ids)) and sha(bits)==BITS,'source candidate identity')
    return [i for j,i in enumerate(ids) if bits[j//8]&(1<<(j%8))]

def extract(definitions,atlas,eligible,out,mesh,typed,audit):
    require(sha(definitions)==D and sha(atlas)==A,'original fingerprints')
    require(len(eligible)==8601 and eligible==sorted(set(eligible)),'candidate coverage')
    dn=dict(audit.extract_nodes(definitions)[1]);do,ext=typed.load(dn[DCAB],mesh)
    require(ext[1].endswith(ACAB),'definition atlas reference')
    defs={}
    for _,(cls,t,b) in do.items():
        if cls!=114 or not {'Id','UiIcon','SerializedGuid'}<=set(n[2] for n in t[-1]):continue
        name,p=mesh.string(b,28)
        require(name.startswith('item_'),'definition name')
        i=mesh.u(b,p+36);f,s=mesh.ptr(b,p+80)
        require(f==0 and i not in defs and do[s][0]==213,'definition UiIcon');defs[i]=s
    require(len(defs)==12163 and len(set(defs.values()))==5020,'definition coverage')
    items={str(i):defs[i] for i in eligible};wanted=sorted(set(items.values()),key=int)
    require(len(wanted)==3150,'sprite coverage')
    an=dict(audit.extract_nodes(atlas)[1]);ao,_=typed.load(an[ACAB],mesh)
    cls,t,b=ao[ATLAS];require(cls==687078895,'SpriteAtlas')
    v=mesh.fields(t,b)['m_RenderDataMap'];count=mesh.u(v);p=4;records={}
    for _ in range(count):
        key=v[p:p+24];r=struct.unpack_from('<iqiq4f2f2f4ffII',v,p+24)
        require(key not in records,'duplicate render key');records[key]=r;p+=108
    require(len(records)==6492 and p==len(v),'atlas coverage')
    sources=[];groups=collections.defaultdict(list)
    for i,sid in enumerate(wanted):
        cls,t,b=do[sid];require(cls==213,'Sprite class');_,p=mesh.string(b,0)
        rect=struct.unpack_from('<4f',b,p);logical=rect[2]
        require(rect[:2]==(0.,0.) and logical==rect[3] and logical>0 and struct.unpack_from('<4f',b,p+24)==(0.,)*4 and struct.unpack_from('<2f',b,p+44)==(.5,.5),'sprite geometry')
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
        groups[(kind,tid)].append((i,logical,rect,offset))
        sources.append([sid,i//PER,i%PER,tid,key.hex(),kind])
    require(sum(r[-1] for r in sources)==9 and len(groups)==91,'texture coverage')
    sheets=[np.zeros((HALF*2,HALF,3),dtype=np.uint8) for _ in range(6)]
    u=(np.arange(SIDE,dtype=np.float64)+4.5-21)/(84*SCALE)+.5
    linear=np.where(np.arange(256)/255<=.04045,np.arange(256)/255/12.92,((np.arange(256)/255+.055)/1.055)**2.4)
    for (kind,tid),rows in groups.items():
        cab,objects,nodes=(DCAB,do,dn) if kind else (ACAB,ao,an)
        cls,t,b=objects[tid];require(cls==28,'texture class');f=mesh.fields(t,b)
        w,h,fmt,mips=[mesh.u(f[k]) for k in ('m_Width','m_Height','m_TextureFormat','m_MipCount')]
        require(w==h and fmt==12 and mips==1 and (kind or w==2048),'BC3 texture layout')
        off,z=struct.unpack_from('<QI',f['m_StreamData']);name,end=mesh.string(f['m_StreamData'],12);res=nodes[cab+'.resS']
        require(name==f'archive:/{cab}/{cab}.resS' and end==len(f['m_StreamData']) and z==w*h and off+z<=len(res),'texture stream')
        im=np.asarray(Image.frombytes('RGBA',(w,h),res[off:off+z],'bcn',3).transpose(Image.Transpose.FLIP_TOP_BOTTOM))
        for i,logical,rect,offset in rows:
            x,y,rw,rh=rect;ox,oy=offset;top=logical-oy-rh;right=ox+rw;bot=top+rh
            require(0<=x<x+rw<=w and 0<=y<y+rh<=h and -.001<=ox<right<=logical+.001 and -.001<=top<bot<=logical+.001,f'sprite bounds {tid} {rect} {offset} {logical} {w} {h}')
            sx=u*logical;sy=u*logical;valid=(sy[:,None]>=top)&(sy[:,None]<bot)&(sx[None,:]>=ox)&(sx[None,:]<right)
            bx=x+(sx-ox)/(right-ox)*rw;by=h-y-rh+(sy-top)/(bot-top)*rh
            ix=np.floor(bx-.5).astype(int);iy=np.floor(by-.5).astype(int);fx=bx-.5-ix;fy=by-.5-iy
            def sample(a,b):
                p=im[np.clip(iy[:,None]+b,0,h-1),np.clip(ix[None,:]+a,0,w-1)]
                return np.concatenate((linear[p[:,:,:3]],p[:,:,3:]/255),axis=2)
            a,b,c,d=sample(0,0),sample(1,0),sample(0,1),sample(1,1);f=fx[None,:,None];g=fy[:,None,None]
            rgba=(a+(b-a)*f)*(1-g)+(c+(d-c)*f)*g;rgba[~valid]=0
            srgb=np.where(rgba[:,:,:3]<=.0031308,12.92*rgba[:,:,:3],1.055*rgba[:,:,:3]**(1/2.4)-.055)
            rgb=np.floor(srgb*255+.5).astype(np.uint8);alpha=np.floor(rgba[:,:,3]*255+.5).astype(np.uint8)
            require(alpha.max()>0,'empty source sample')
            pack,cell=divmod(i,PER);px=cell%COLS*SIDE;py=cell//COLS*SIDE
            sheets[pack][py:py+SIDE,px:px+SIDE]=rgb;sheets[pack][py+HALF:py+HALF+SIDE,px:px+SIDE]=alpha[:,:,None]
    out.mkdir(parents=True,exist_ok=True);textures=[]
    for i,a in enumerate(sheets):
        f=out/f'wand-candidate-source-{i:02}.webp';Image.fromarray(a,'RGB').save(f,lossless=True,method=4,exact=True);raw=f.read_bytes()
        require(np.array_equal(np.asarray(Image.open(f).convert('RGB')),a) and len(raw)<=1024*1024,'lossless source readback')
        textures.append({'file':f.name,'bytes':len(raw),'sha256':sha(raw),'rgbSha256':sha(a.tobytes()),'width':HALF,'height':HALF*2})
    manifest={'schema':'HKIA.WandSampledOriginalSubIcon.1','version':'3.0.1','definitionsSha256':D,'atlasSha256':A,'sampleSize':SIDE,'sampleOrigin':[4,4],'logicalSize':84,'scale':SCALE,'offsetPercent':[-.25,.25],'rotation':0,'columns':COLS,'rowsPerSheet':24,'alphaOffsetY':HALF,'textures':textures,'sprites':sources,'items':items,'ingredientBitsetSha256':BITS}
    raw=(json.dumps(manifest,separators=(',',':'))+'\n').encode();require(sha(raw)==EXPECTED,'published manifest identity: '+sha(raw));(out/'index.json').write_bytes(raw)
    print('HKIA_WAND_CANDIDATE_SOURCE_OK 8601 item IDs, 3150 source sprites, 6 sheets')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    extract((a.root/'definitions.bin').read_bytes(),(a.root/'atlas_global.bin').read_bytes(),candidates(Path(__file__).resolve().parents[1]),module('extract-furniture-mesh-source'),module('extract-furniture-preview-camera'),module('unityfs-audit'))

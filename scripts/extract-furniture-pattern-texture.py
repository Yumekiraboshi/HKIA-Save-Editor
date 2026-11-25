#!/usr/bin/env python3
"""Extract exact streamed BC1/BC3 pattern textures by original GUID.
Offline output only. Preserve every mip and native sampler/color-space metadata.
"""
import argparse, hashlib, importlib.util, json, math, re, struct
from pathlib import Path

def require(ok,message):
    if not ok: raise ValueError(message)
def sha(b):return hashlib.sha256(b).hexdigest()
def u(b,p):return struct.unpack_from('<I',b,p)[0]
def string(b,p):
    n=u(b,p);require(n<=4096 and p+4+n<=len(b),'string bounds');return b[p+4:p+4+n].decode(),(p+4+n+3)&~3

def extract(raw,bundle,cab,objects,res,expected):
    # SerializedFile 22, original Steam v3.0.1 Texture2D layout, verified
    # against the authored type tree in the representative source bundles.
    # Refuse other layout/inline/platform data rather than guessing a decode.
    containers=[b for c,pid,b,e in objects if c==142 and e=='<'];require(len(containers)==1,'AssetBundle identity')
    objs={str(pid):b for c,pid,b,e in objects if c==28 and e=='<'}
    b=containers[0];_,p=string(b,0);preload=u(b,p);p+=4+preload*12;count=u(b,p);p+=4
    require(count<=100000,'container count');found={};payloads={}
    for _ in range(count):
        guid,p=string(b,p);first,n,file,pid=struct.unpack_from('<iiiq',b,p);p+=20
        if guid not in expected:continue
        require(guid not in found and file==0 and str(pid) in objs,'ambiguous or external pattern texture')
        t=objs[str(pid)];name,at=string(t,0)
        alpha,w,h,size,stripped,fmt,mips=struct.unpack_from('<7I',t,at)
        require(alpha in (0,1) and 0<w<=8192 and 0<h<=8192 and stripped==0 and fmt in (10,12) and 1<=mips<=max(w,h).bit_length(),'unsupported texture format')
        require(t[at+28:at+32] in (b'\0'*4,b'\1\0\0\0'),'unsupported texture flags')
        require(u(t,at+32)==0,'mipmap limit group')
        streaming,priority,images,dim=struct.unpack_from('<4I',t,at+36)
        require(streaming in (0,1) and images==1 and dim==2,'unsupported texture dimension')
        filter_mode,aniso,bias,wrap_u,wrap_v,wrap_w=struct.unpack_from('<iifiii',t,at+52)
        lightmap,color,platform,inline=struct.unpack_from('<4I',t,at+76)
        require(filter_mode in (0,1,2) and 0<=aniso<=16 and math.isfinite(bias) and all(v in (0,1,2,3) for v in (wrap_u,wrap_v,wrap_w)) and color in (0,1) and platform==inline==0,'unsupported sampler/platform')
        off,length=struct.unpack_from('<QI',t,at+92);path,end=string(t,at+104)
        require(end==len(t) and path==f'archive:/{cab}/{cab}.resS' and length==size and off+length<=len(res),'stream identity/bounds')
        data=res[off:off+length];ranges=[];cursor=0
        for level in range(mips):
            mw=max(1,w>>level);mh=max(1,h>>level);n=((mw+3)//4)*((mh+3)//4)*(8 if fmt==10 else 16)
            require(cursor+n<=length,'mip range');ranges.append([mw,mh,cursor,n,sha(data[cursor:cursor+n])]);cursor+=n
        require(cursor==length,'mip chain length')
        found[guid]={'guid':guid,'name':name,'bundle':bundle,'bundleSha256':sha(raw),'cab':cab,'pathId':str(pid),'objectSha256':sha(t),'width':w,'height':h,'format':fmt,'colorSpace':color,'alphaChannelOptional':bool(alpha),'sampler':[filter_mode,aniso,bias,wrap_u,wrap_v,wrap_w],'streamOffset':off,'bytes':length,'sha256':sha(data),'mips':ranges}
        payloads[guid]=data
    require(set(found)==set(expected),'missing native GUID in supplied bundle');return found,payloads

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('bundle',type=Path);p.add_argument('materialSource',type=Path);p.add_argument('--guid',action='append',required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    d=json.loads(a.materialSource.read_text());require(d['schema']=='HKIA.FurnitureMaterialRenderSource.1' and d['version']=='3.0.1','source schema')
    name=a.bundle.name.removesuffix('.bin');expected=set(a.guid);rows={r[0]:r for r in d['patterns']};require(all(g in rows and name in [d['bundleNames'][i] for i in rows[g][3]] for g in expected),'GUID/bundle catalog binding')
    spec=importlib.util.spec_from_file_location('audit',Path(__file__).with_name('audit-native-dye-materials.py'));audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
    raw=a.bundle.read_bytes();_,nodes=audit.auditor.extract_nodes(raw);nodes=dict(nodes);cabs=[n for n in nodes if re.fullmatch('CAB-[0-9a-f]{32}',n)];require(len(cabs)==1,'one CAB required');cab=cabs[0]
    meta,payloads=extract(raw,name,cab,list(audit.serialized_objects(nodes[cab],classes=(28,142))),nodes[cab+'.resS'],expected)
    a.out.mkdir(parents=True,exist_ok=True)
    for g in sorted(meta):
        (a.out/(g+'.texture.bin')).write_bytes(payloads[g]);(a.out/(g+'.json')).write_text(json.dumps(meta[g],separators=(',',':'))+'\n')
if __name__=='__main__':main()

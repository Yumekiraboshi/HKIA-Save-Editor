#!/usr/bin/env python3
"""Stage exact original chair patterns with all source mips. Offline only."""
import argparse, hashlib, importlib.util, json, struct
from pathlib import Path
REPO=Path(__file__).resolve().parent.parent
def sha(b):return hashlib.sha256(b).hexdigest()
def require(ok,msg):
    if not ok:raise ValueError(msg)
def module(n):
    spec=importlib.util.spec_from_file_location(n,Path(__file__).with_name(n+'.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def extract(row,raw,mesh,typed,audit):
    require(sha(raw)==row['bundleSha256'],'bundle identity')
    ns=dict(audit.auditor.extract_nodes(raw)[1]);cab=row['cab'];objs,_=typed.load(ns[cab],mesh)
    containers=[b for c,t,b in objs.values() if c==142];require(len(containers)==1,'asset bundle')
    b=containers[0];_,p=mesh.string(b);p+=4+mesh.u(b,p)*12;count=mesh.u(b,p);p+=4;matches=[]
    for _ in range(count):
        k,p=mesh.string(b,p);ref=mesh.ptr(b,p+8);p+=20
        if k==row['guid']:matches.append(ref)
    require(matches==[[0,row['pathId']]],'exact pattern reference')
    c,t,b=objs[row['pathId']];require(c==28 and sha(b)==row['objectSha256'],'texture identity')
    f=mesh.fields(t,b);require(mesh.string(f['m_Name'])[0]==row['name'],'name')
    w,h,fmt,col,n,z=[mesh.u(f[k]) for k in ('m_Width','m_Height','m_TextureFormat','m_ColorSpace','m_MipCount','m_CompleteImageSize')]
    require((w,h,fmt,col,n,z)==(row['width'],row['height'],row['format'],row['colorSpace'],len(row['mips']),row['bytes']),'texture fields')
    require(list(struct.unpack('<iifiii',f['m_TextureSettings']))==row['sampler'],'sampler')
    inline=f['image data'];size=mesh.u(inline)
    if size:
        payload=inline[4:4+size]
    else:
        off,size=struct.unpack_from('<QI',f['m_StreamData']);path,end=mesh.string(f['m_StreamData'],12)
        require(end==len(f['m_StreamData']) and path==f'archive:/{cab}/{cab}.resS' and off+size<=len(ns[cab+'.resS']),'stream')
        payload=ns[cab+'.resS'][off:off+size]
    require(len(payload)==z and sha(payload)==row['sha256'],'texture payload')
    require(fmt in (4,5) and (fmt!=5 or set(payload)=={255}),'supported original raw format')
    cursor=0
    for lv,(mw,mh,at,size,digest) in enumerate(row['mips']):
        require((mw,mh)==(max(1,w>>lv),max(1,h>>lv)) and at==cursor and size==mw*mh*4 and sha(payload[at:at+size])==digest,'mip')
        cursor+=size
    require(cursor==z,'mip closure')
    return payload
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    require(not a.out.resolve().is_relative_to(REPO) and not a.out.resolve().is_relative_to(a.root.resolve()),'stage outside repo and source')
    manifest=(REPO/'data/furniture-chair-pattern-sources-v3.0.1.json').read_bytes()
    require(sha(manifest)=='608cbcd744fed8de9a1c6a557296ab669cd2f40b44dd8ae6800355a6aec5f10f','manifest')
    d=json.loads(manifest);require(len(d['rows'])==6,'coverage')
    mesh,typed,audit=module('extract-furniture-mesh-source'),module('extract-furniture-preview-camera'),module('audit-native-dye-materials')
    staged={}
    for row in d['rows']:
        staged[row['guid']]=extract(row,(a.root/(row['bundle']+'.bin')).read_bytes(),mesh,typed,audit)
    require(sum(map(len,staged.values()))==23767736,'byte coverage')
    a.out.mkdir(parents=True,exist_ok=True)
    for g,b in staged.items():(a.out/(g+'.texture.bin')).write_bytes(b)
    print('HKIA_CHAIR_PATTERN_STAGE_OK 6')

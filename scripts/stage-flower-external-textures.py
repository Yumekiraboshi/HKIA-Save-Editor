#!/usr/bin/env python3
"""Verify and stage the six external texture references of the native flower
crown materials. Reuses the original typed UnityFS readers. No public binary
output; staging is outside the repository. Not a finished thumbnail renderer.
"""
import argparse, hashlib, importlib.util, json, struct
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def require(ok,msg):
    if not ok:raise ValueError(msg)
def sha(b):return hashlib.sha256(b).hexdigest()

def extract(root,stage,rows,mesh,typed,audit):
    for name in sorted({r['bundle'] for r in rows}):
        group=[r for r in rows if r['bundle']==name]
        raw=(root/(name+'.bin')).read_bytes()
        require(all(sha(raw)==r['bundleSha256'] for r in group),'bundle identity '+name)
        ns=dict(audit.auditor.extract_nodes(raw)[1]);cab=group[0]['cab']
        require(all(r['cab']==cab for r in group),'CAB identity')
        objects,_=typed.load(ns[cab],mesh);stream=ns[cab+'.resS']
        for r in group:
            c,t,b=objects[r['pathId']]
            require(c==r['classId'] and sha(b)==r['objectSha256'],'object identity')
            f=mesh.fields(t,b)
            require(mesh.string(f['m_Name'])[0]==r['name'],'name')
            for native,field in [('m_Width','width'),('m_Height','height'),('m_TextureFormat','format'),('m_MipCount','mips'),('m_ColorSpace','colorSpace')]:
                require(mesh.u(f[native])==r[field],'texture '+field)
            require(list(struct.unpack('<iifiii',f['m_TextureSettings']))==r['sampler'],'texture sampler')
            require(mesh.u(f['m_MipsStripped'])==0 and mesh.u(f['image data'])==0,'texture storage')
            off,n=struct.unpack_from('<QI',f['m_StreamData'])
            path,end=mesh.string(f['m_StreamData'],12)
            faces=6 if c==89 else 1
            require(end==len(f['m_StreamData']) and path==f'archive:/{cab}/{cab}.resS' and n==r['bytes'] and off+n<=len(stream),'stream range')
            mip_bytes=0
            for level in range(r['mips']):
                w=max(1,r['width']>>level);h=max(1,r['height']>>level);fmt=r['format']
                require(fmt in (4,10,12),'texture format')
                mip_bytes+=w*h*4 if fmt==4 else ((w+3)//4)*((h+3)//4)*(8 if fmt==10 else 16)
            require(mesh.u(f['m_CompleteImageSize'])==mip_bytes and n==mip_bytes*faces,'mip size')
            payload=stream[off:off+n];require(sha(payload)==r['sha256'],'payload hash')
            if stage is not None:
                target=stage/(r['sha256']+('.cubemap.bin' if c==89 else '.texture.bin'))
                if target.exists():require(sha(target.read_bytes())==r['sha256'],'existing staged payload')
                else:target.write_bytes(payload)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',type=Path,required=True);p.add_argument('--stage',type=Path)
    args=p.parse_args()
    if args.stage:
        require(not args.stage.resolve().is_relative_to(ROOT),'stage outside repository')
        args.stage.mkdir(parents=True,exist_ok=True)
    manifest=json.loads((ROOT/'data/flower-external-material-source-v3.0.1.json').read_text())
    require(manifest['version']=='3.0.1' and len(manifest['rows'])==6,'manifest version')
    extract(args.root,args.stage,manifest['rows'],module('extract-furniture-mesh-source'),module('extract-furniture-preview-camera'),module('audit-native-dye-materials'))
    print('HKIA_FLOWER_EXTERNAL_TEXTURES_OK 6')

#!/usr/bin/env python3
"""Read-only source audit of the exact Steam v3.0.1 side-table BaseMap alpha.
Reports counts, never raw game texture data."""
import argparse,hashlib,importlib.util,json,struct
from pathlib import Path
spec=importlib.util.spec_from_file_location('material_audit',Path(__file__).with_name('audit-native-dye-materials.py'))
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
def require(ok,msg):
    if not ok:raise ValueError(msg)
def sha(b):return hashlib.sha256(b).hexdigest()
CAB='CAB-9a3da43ca266ea5645a6445a7d9fd3c3'
BUNDLE_SHA='0cbabe9237cce8ea1daa0a7aa385e609db0466454ea418aac018231c524913bf'
TEXTURE_SHA='5bddd429446d9670b38ff1443662a5ed071755620433ce04ed968d4fc51706e4'
STREAM_SHA='ad0dfa46a56171cf207e3f317e49d949ef0308874c1c93fcf6c5517c3afec027'
MATERIAL_SHA='a1d4aa4fd2c08828c06ae21279fb288a95bc8a4acb8108b5b59928188725796f'
def count_nonzero_bc3_alpha(raw):
    require(len(raw)>0 and len(raw)%16==0,'BC3 block bounds')
    # A BC3 alpha interpolation of nonnegative endpoints is zero only
    # when the selected endpoint or interpolated numerator is exactly zero.
    # This is a test of the source encoding, not a color decoder.
    count=0
    for i in range(0,len(raw),16):
        x,y=raw[i:i+2]
        if x>y:nonzero=[x>0,y>0]+[((7-j)*x+j*y)>0 for j in range(1,7)]
        else:nonzero=[x>0,y>0]+[((5-j)*x+j*y)>0 for j in range(1,5)]+[False,True]
        selectors=int.from_bytes(raw[i+2:i+8],'little')
        count+=sum(nonzero[(selectors>>(3*j))&7] for j in range(16))
    return count
def audit(path):
    raw=path.read_bytes();require(sha(raw)==BUNDLE_SHA,'unsupported side-table bundle')
    _,nodes=a.auditor.extract_nodes(raw);nodes=dict(nodes)
    objects={p:(c,o) for c,p,o,e in a.serialized_objects(nodes[CAB],classes=(21,28)) if e=='<'}
    c,material=objects['8738455483337011380'];require(c==21 and sha(material)==MATERIAL_SHA,'glass material identity')
    p=a.material_properties(material,'<')['textures']['_BaseMap']
    require(p=={'fileId':0,'pathId':'8265208118387264786','scale':[1.,1.],'offset':[0.,0.]},'base map pointer')
    c,o=objects[p['pathId']];require(c==28 and sha(o)==TEXTURE_SHA,'texture identity')
    name,at=a.auditor.named_asset(o,'<')
    require(name=='Decor_PAPE26_Sidetable_C','texture name')
    _,w,h,size,stripped,fmt,mips=struct.unpack_from('<7I',o,at)
    require((w,h,size,stripped,fmt,mips)==(512,512,349552,0,12,10),'texture layout')
    off,n=struct.unpack_from('<QI',o,at+92)
    path_len=struct.unpack_from('<I',o,at+104)[0]
    require(o[at+108:at+108+path_len].decode()==f'archive:/{CAB}/{CAB}.resS' and (at+108+path_len+3)&~3==len(o),'stream path')
    require(n==size and off+n<=len(nodes[CAB+'.resS']),'stream bounds')
    data=nodes[CAB+'.resS'][off:off+n];require(sha(data)==STREAM_SHA,'texture stream identity')
    levels=[];cursor=0
    for l in range(mips):
        mw,mh=max(1,w>>l),max(1,h>>l);length=((mw+3)//4)*((mh+3)//4)*16
        require(cursor+length<=len(data),'mip bounds')
        nonzero=count_nonzero_bc3_alpha(data[cursor:cursor+length])
        require(nonzero==0,'nonzero alpha')
        levels.append({'level':l,'width':mw,'height':mh,'logicalTexels':mw*mh,'blockSamples':length,'nonzeroEncodedAlpha':nonzero})
        cursor+=length
    require(cursor==len(data),'mip coverage')
    return {'schema':'HKIA.SideTableGlassAlphaAudit.1','version':'3.0.1','bundleSha256':BUNDLE_SHA,'cab':CAB,'materialSha256':MATERIAL_SHA,'textureSha256':TEXTURE_SHA,'streamSha256':STREAM_SHA,'levels':levels,'logicalTexels':sum(x['logicalTexels'] for x in levels),'blockSamples':sum(x['blockSamples'] for x in levels),'nativeFinalIconVerified':False}
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('bundle',type=Path);args=p.parse_args()
    print(json.dumps(audit(args.bundle),indent=2))

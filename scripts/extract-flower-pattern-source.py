#!/usr/bin/env python3
"""Extract all original flower pattern definitions and actual texture references.
Metadata and optional private staging only; never pregenerate variant icons.
"""
import argparse, hashlib, importlib.util, json, re, struct
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
D_SHA='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0'
C_SHA='555a82bf7e8a6f0b6c9fee7d179988f54015e7b354902f13937198115e9ff52a'
D_CAB='CAB-46b8f8fe122147493b3113f7c1c8cd0f'
FLOATS=['PatternSmoothnessShift','PatternMetallicShift','ReflectionStrength','RimPower','RimFeathering','RimIntensity','RimColoring','IridescentSmoothShift','IridescentMetalShift','GlowMin','GlowMax','FrostAlpha','FrostScale','FrostNormalIntensity','FrostDissolve','FrostBlend','MoltenDistortionTiling','MoltenDistortionIntensity','GlitterMetallic','GlitterRoughness']
def require(ok,msg):
    if not ok:raise ValueError(msg)
def sha(b):return hashlib.sha256(b).hexdigest()
def module(name):
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def extract(root,stage,mesh,typed,audit):
    def nodes(raw):return dict(audit.auditor.extract_nodes(raw)[1])
    def ref(s):
        g,p=mesh.string(s);n,p=mesh.string(s,p);t,p=mesh.string(s,p)
        require(p==len(s) and not n and not t and (not g or re.fullmatch('[a-f0-9]{32}',g)),'texture asset reference')
        return g or None
    raw=(root/'definitions.bin').read_bytes();require(sha(raw)==D_SHA,'definition hash')
    objects,_=typed.load(nodes(raw)[D_CAB],mesh);del raw
    ids={}
    for pid,(c,t,b) in objects.items():
        if c!=114:continue
        try:name,p=mesh.string(b,28)
        except (ValueError,UnicodeError,struct.error):continue
        if name.endswith('.InventoryItemDefinitionAsset'):ids[pid]=mesh.u(b,p+36)
    patterns=[]
    for pid,(c,t,b) in objects.items():
        if c!=114 or not {'PatternIndex','Overrides'}.issubset(x[2] for x in t[-1]):continue
        f=mesh.fields(t,b);name=mesh.string(f['m_Name'])[0]
        r=[mesh.u(f['PatternIndex']),name,pid,sha(b),bool(f['IsEffect'][0]),ref(f['PatternMap']),ref(f['SurfaceEffectMap']),mesh.u(f['SurfaceEffect']),list(struct.unpack('<2f',f['PatternTiling']))]
        r+=[[struct.unpack('<f',f[k])[0] for k in FLOATS],bool(f['CustomRimLight'][0]),struct.unpack('<i',f['RenderQueue'])[0],list(struct.unpack('<4f',f['FrostColor'])),list(struct.unpack('<2f',f['MoltenSpeed'])),mesh.u(f['MoltenColorType'])]
        v=f['Overrides'];p=4;ovs=[]
        for _ in range(mesh.u(v)):
            fi,pi=mesh.ptr(v,p);p+=12;require(fi==0 and pi in ids,'override item')
            has=v[p];require(has in (0,1),'map override flag');p+=4
            g,p=mesh.string(v,p);s,p=mesh.string(v,p);ty,p=mesh.string(v,p);require(not s and not ty and (not g or re.fullmatch('[a-f0-9]{32}',g)),'override texture')
            ht=v[p];require(ht in (0,1),'tiling override flag');p+=4
            tiling=list(struct.unpack_from('<2f',v,p));p+=8
            ovs.append([ids[pi],g if has else None,tiling if ht else None,has,ht])
        require(p==len(v),'override bounds')
        # Preserve duplicate Item IDs and source order; no assumption about
        # runtime precedence or how distinct override flags are combined.
        r.append(ovs);patterns.append(r)
    del objects
    patterns.sort()
    require([r[0] for r in patterns]==list(range(1,17)) and sum(len(r[-1]) for r in patterns)==218,'pattern coverage')
    guids={g for r in patterns for g in [r[5],r[6],*(v[1] for v in r[-1])] if g}
    require(len(guids)==77,'texture coverage')
    b=(root/'catalog.bin').read_bytes();require(sha(b)==C_SHA,'catalog hash')
    def unpack(fmt,p):
        require(0<=p<=len(b)-struct.calcsize(fmt),'catalog bounds');return struct.unpack_from(fmt,b,p)
    def u(p):return unpack('<I',p)[0]
    def arr(p,s):
        n=u(p-4);require(n%s==0 and n<=len(b)-p,'catalog array');return range(p,p+n,s)
    def string(p):
        n=u(p-4);require(n<=2048 and n<=len(b)-p,'catalog string');return b[p:p+n].decode()
    magic,ver,keys=unpack('<3I',0);require((magic,ver)==(0xde38942,1),'catalog format')
    found={}
    for p in arr(keys,8):
        k,loc=unpack('<2I',p);kind,remap=unpack('<2I',k)
        if kind!=0x7f167c:continue
        ident,sep=unpack('<2I',remap)
        if sep or ident>>30 or ident<4 or u(ident-4)!=32:continue
        guid=string(ident)
        if guid not in guids:continue
        slots=list(arr(loc,4));require(len(slots)==1 and guid not in found,'unique catalog location')
        primary,internal,provider,dep,dh,ex,ty=unpack('<7I',u(slots[0]));require(primary==internal==ident and provider==0x4006df70,'asset location')
        bs=[]
        for q in arr(dep,4):
            pk,ip,pr,de,dh,ex,ty=unpack('<7I',u(q));name=string(pk)
            require(pr==0x4006dedb and de==0xffffffff and ty==0x6e149 and re.fullmatch('[a-zA-Z0-9_. -]+',name) and string(ip)=='{UnityEngine.AddressableAssets.Addressables.RuntimePath}\\StandaloneWindows64\\'+name,'bundle location');bs.append(name)
        require(bs and len(bs)==len(set(bs)),'bundle dependencies');found[guid]=bs
    require(set(found)==guids,'catalog coverage')
    source={'schema':'HKIA.FlowerPatternMaterialSource.1','version':'3.0.1','definitionsSha256':D_SHA,'catalogSha256':C_SHA,'floatColumns':FLOATS,'patterns':patterns,'textureLocations':found}
    index=json.loads((ROOT/'data/flower-pattern-source-index-v3.0.1.json').read_text())
    expected={r[0]:r[1:] for r in index['bundles']}
    require(set(expected)=={bs[0] for bs in found.values()},'primary bundle coverage')
    textures={}
    for name in sorted(expected):
        raw=(root/(name+'.bin')).read_bytes();digest=sha(raw);require(digest==expected[name][2],'bundle hash '+name)
        ns=nodes(raw);cabs=[k for k in ns if re.fullmatch('CAB-[0-9a-f]{32}',k)];require(len(cabs)==1,'CAB');cab=cabs[0];o,_=typed.load(ns[cab],mesh)
        wanted={g for g,bs in found.items() if bs[0]==name};n=0;total=0
        for pid,(c,t,raw) in o.items():
            if c!=142:continue
            v=mesh.fields(t,raw)['m_Container'];p=4
            for _ in range(mesh.u(v)):
                key,p=mesh.string(v,p);fi,pi=mesh.ptr(v,p+8);p+=20
                if key not in wanted:continue
                require(fi==0 and o[pi][0]==28 and key not in textures,'exact texture object')
                _,tt,bb=o[pi];f=mesh.fields(tt,bb)
                w,h,fmt,mips,color,complete=[mesh.u(f[k]) for k in ('m_Width','m_Height','m_TextureFormat','m_MipCount','m_ColorSpace','m_CompleteImageSize')]
                require(0<w<=8192 and 0<h<=8192 and fmt in (4,5,10) and 1<=mips<=max(w,h).bit_length() and color in (0,1),'texture layout')
                size=mesh.u(f['image data']);off,z=struct.unpack_from('<QI',f['m_StreamData']);path,end=mesh.string(f['m_StreamData'],12)
                require(end==len(f['m_StreamData']),'stream boundary')
                if size:
                    require(z==0 and size<=len(f['image data'])-4,'inline texture bounds');payload=f['image data'][4:4+size]
                else:
                    require(path==f'archive:/{cab}/{cab}.resS' and off+z<=len(ns[cab+'.resS']),'texture stream');payload=ns[cab+'.resS'][off:off+z]
                chain=sum(max(1,w>>i)*max(1,h>>i)*4 if fmt in (4,5) else ((max(1,w>>i)+3)//4)*((max(1,h>>i)+3)//4)*8 for i in range(mips))
                require(len(payload)==complete==chain,'mip byte count')
                hsh=sha(payload);textures[key]=[name,digest,cab,pi,mesh.string(f['m_Name'])[0],w,h,fmt,mips,color,len(payload),hsh];n+=1;total+=len(payload)
                if stage:
                    target=stage/(hsh+'.texture.bin')
                    if target.exists():require(sha(target.read_bytes())==hsh,'staged hash')
                    else:target.write_bytes(payload)
            require(p==len(v),'container bounds')
        require(n==expected[name][0] and total==expected[name][1] and wanted.issubset(textures),'bundle texture coverage')
    require(set(textures)==guids,'texture closure')
    return source,textures

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--stage',type=Path);a=p.parse_args()
    if a.stage:
        require(not a.stage.resolve().is_relative_to(ROOT),'stage outside repository');a.stage.mkdir(parents=True,exist_ok=True)
    s,t=extract(a.root,a.stage,module('extract-furniture-mesh-source'),module('extract-furniture-preview-camera'),module('audit-native-dye-materials'))
    meta=(json.dumps(s,separators=(',',':'))+'\n').encode();tex=(json.dumps(t,sort_keys=True,separators=(',',':'))+'\n').encode()
    require(sha(meta)=='88e186b5e3e39941d7969ea72e6c257b3586045234c992de84dcaa353d7d11f4' and sha(tex)=='1d0b80d4cf07d268a25282d178a5a5ed2a93f9fe2f35756f439da3a2f1793865','original extracted metadata fingerprint')
    a.out.mkdir(parents=True,exist_ok=True);(a.out/'flower-pattern-source.json').write_bytes(meta);(a.out/'flower-pattern-textures.json').write_bytes(tex)
    print('HKIA_FLOWER_PATTERN_SOURCE_OK 16 patterns 218 overrides 77 textures')

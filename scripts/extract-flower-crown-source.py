#!/usr/bin/env python3
"""Stage exact original flower crown geometry and material textures, not icons.
Run against local source copies; never publish UnityFS bundles or staging bytes.
"""
import argparse, hashlib, importlib.util, json, math, re, struct
from pathlib import Path
D_SHA='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0'
C_SHA='555a82bf7e8a6f0b6c9fee7d179988f54015e7b354902f13937198115e9ff52a'
D_CAB='CAB-46b8f8fe122147493b3113f7c1c8cd0f'
SHADER=['CAB-2b27edbfe7f08bad1cd631865ee4eb15','5128141501501259665']
MANIFEST_SHA='8d930b0ffb18b53b11aa1c96c1d4766e8810146c9fa773b16c9c78b173b0d719'
def require(ok,msg):
    if not ok: raise ValueError(msg)
def sha(b):return hashlib.sha256(b).hexdigest()
def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def extract(root,stage,mesh,typed,extract_nodes):
    def open_bundle(path):
        raw=path.read_bytes();nodes=extract_nodes(raw);cabs=[n for n in nodes if re.fullmatch('CAB-[0-9a-f]{32}',n)];require(len(cabs)==1,'CAB');cab=cabs[0];o,e=typed.load(nodes[cab],mesh);return {'name':path.stem,'sha':sha(raw),'cab':cab,'objects':o,'external':[x.split('/')[-1] for x in e],'stream':nodes.get(cab+'.resS',b'')}
    def ref(entry,p):
        f,i=p;require(0<=f<=len(entry['external']),'PPtr file ID');return [entry['cab'] if f==0 else entry['external'][f-1],i]
    def fields(entry,p,cls):
        c,t,b=entry['objects'][p];require(c==cls,'object class');return mesh.fields(t,b)
    def local(entry,p,cls):
        f,i=p;require(f==0 and entry['objects'][i][0]==cls,'local PPtr');return i
    def ff(b,n):
        a=list(struct.unpack('<'+'f'*n,b));require(all(math.isfinite(x) for x in a),'nonfinite');return a
    def save(data,suffix):
        digest=sha(data)
        if stage:
            p=stage/(digest+suffix)
            if p.exists():require(sha(p.read_bytes())==digest,'existing staging payload')
            else:p.write_bytes(data)
        return digest
    def stream(entry,data):
        off,z=struct.unpack_from('<QI',data);p,end=mesh.string(data,12);cab=entry['cab'];require(end==len(data) and p==f'archive:/{cab}/{cab}.resS' and off+z<=len(entry['stream']),'stream identity');return entry['stream'][off:off+z]
    defs=open_bundle(root/'definitions.bin');require(defs['cab']==D_CAB and defs['sha']==D_SHA,'definition source');byguid={};byid={}
    for pid,(c,t,b) in defs['objects'].items():
        if c!=114 or len(b)<32:continue
        try:name,p=mesh.string(b,28)
        except (ValueError,UnicodeError,struct.error):continue
        if not name.endswith('.InventoryItemDefinitionAsset'):continue
        item=mesh.u(b,p+36);byid[pid]=item
        if not name.startswith('item_creation_clothing_flowercrown_'):continue
        require(mesh.u(b,p+92)==0 and b[p+96:p+108]==bytes(12),'dynamic UiIcon flag/mask');guid,q=mesh.string(b,p+108);require(re.fullmatch('[0-9a-f]{32}',guid) and b[q:q+8]==bytes(8),'Visual3D ref');sprite=mesh.ptr(b,p+80);require(sprite[0]==0 and defs['objects'][sprite[1]][0]==213,'base sprite');require(guid not in byguid,'duplicate crown GUID');byguid[guid]=[item,pid,sprite[1]]
    require(len(byguid)==25,'crown definitions');del defs
    catalog=(root/'catalog.bin').read_bytes();require(sha(catalog)==C_SHA,'catalog source')
    def unpack(fmt,p):
        require(0<=p<=len(catalog)-struct.calcsize(fmt),'catalog bounds');return struct.unpack_from(fmt,catalog,p)
    def u(p):return unpack('<I',p)[0]
    def arr(p,stride):
        n=u(p-4);require(n%stride==0 and n<=len(catalog)-p,'catalog array');return range(p,p+n,stride)
    def string(p):
        n=u(p-4);require(n<=2048 and n<=len(catalog)-p,'catalog string');return catalog[p:p+n].decode()
    magic,version,keys=unpack('<3I',0);require((magic,version)==(0x0de38942,1),'catalog format');locations={}
    for p in arr(keys,8):
        k,loc=unpack('<2I',p);kind,remap=unpack('<2I',k)
        if kind!=0x7f167c:continue
        ident,sep=unpack('<2I',remap)
        if sep or ident>>30 or ident<4 or u(ident-4)!=32:continue
        guid=string(ident)
        if guid not in byguid:continue
        slots=list(arr(loc,4));require(len(slots)==1 and guid not in locations,'catalog location');primary,internal,provider,dep,*rest=unpack('<7I',u(slots[0]));require(primary==internal==ident and provider==0x4006df70,'asset location');bs=[]
        for q in arr(dep,4):
            pk,ip,pr,de,dh,ex,ty=unpack('<7I',u(q));name=string(pk);require(pr==0x4006dedb and de==0xffffffff and ty==0x6e149 and re.fullmatch('[a-zA-Z0-9_. -]+',name) and string(ip)=='{UnityEngine.AddressableAssets.Addressables.RuntimePath}\\StandaloneWindows64\\'+name,'bundle location');bs.append(name)
        locations[guid]=bs
    require(set(locations)==set(byguid),'catalog crown coverage')
    mats={}
    for path in sorted(root.glob('ga_art_flowers_flower_*.bin')):
        a=open_bundle(path);require(a['cab'] not in mats,'duplicate flower material CAB');mats[a['cab']]=a
    rows=[];textures={};unresolved=set()
    for path in sorted(root.glob('l_shared_headaccessory_flowercrown*.bin')):
        a=open_bundle(path);o=a['objects'];container=[p for p,(c,t,b) in o.items() if c==142];require(len(container)==1,'bundle container');v=fields(a,container[0],142)['m_Container'];p=4;match=[]
        for _ in range(mesh.u(v)):
            key,p=mesh.string(v,p);r=mesh.ptr(v,p+8);p+=20
            if key in byguid:match.append((key,local(a,r,1)))
        require(p==len(v) and len(match)==1,'exact Visual3D prefab');guid,go=match[0];require(a['name'] in locations[guid],'catalog model bundle');item,definition,sprite=byguid[guid]
        components=[i for f,i in mesh.array_ptr(fields(a,go,1)['m_Component']) if f==0];flower=[];species=[]
        for i in components:
            if o[i][0]!=114:continue
            d=fields(a,i,114)
            if 'FlowerRenderers' in d:flower.extend(mesh.array_ptr(d['FlowerRenderers']))
            if 'FlowerItem' in d and 'FlowerRenderer' in d:
                cab,pid=ref(a,mesh.ptr(d['FlowerItem']));require(cab==D_CAB and pid in byid,'flower definition');species.append(byid[pid])
        require(len(flower)==len(species)==1,'flower treatment binding');rid=local(a,flower[0],23);r=fields(a,rid,23);require(local(a,mesh.ptr(r['m_GameObject']),1)==go,'renderer owner');material=mesh.array_ptr(r['m_Materials']);require(len(material)==1,'material slot');mc,mid=ref(a,material[0]);ma=mats[mc];require(ma['name'] in locations[guid],'catalog material dependency');m=fields(ma,mid,21);require(ref(ma,mesh.ptr(m['m_Shader']))==SHADER,'flower shader identity')
        mf=[i for i in components if o[i][0]==33];require(len(mf)==1,'mesh filter');mp=local(a,mesh.ptr(fields(a,mf[0],33)['m_Mesh']),43);g=fields(a,mp,43);require(mesh.u(g['m_IndexFormat'])==0 and g['m_MeshCompression']==b'\0','mesh index format/compression');v=g['m_VertexData'];n,ch=struct.unpack_from('<II',v);require(ch==14 and len(v)==68 and mesh.u(v,64)==0,'streamed vertex layout');channels=[list(v[8+4*i:12+4*i]) for i in range(ch)];vb=stream(a,g['m_StreamData']);ib=g['m_IndexBuffer'];size=mesh.u(ib);ib=ib[4:4+size];require(n>0 and len(vb)%n==0 and len(vb)//n in (40,44) and size%6==0 and len(ib)==size and all(i<n for i, in struct.iter_unpack('<H',ib)),'mesh buffers');sub=g['m_SubMeshes'];require(mesh.u(sub)==1 and mesh.u(sub,4)==0 and mesh.u(sub,8)*2==size and mesh.u(sub,12)==0,'triangle submesh');geometry=vb+ib
        mat_tree=ma['objects'][mid][1];saved=mesh.fields(next(x for x in mat_tree[-1] if x[2]=='m_SavedProperties'),m['m_SavedProperties']);maps={};props={}
        for name,data in saved.items():
            at=4;d={}
            for _ in range(mesh.u(data)):
                key,at=mesh.string(data,at);require(key not in d,'duplicate material property')
                if name=='m_TexEnvs':
                    cab,pid=ref(ma,mesh.ptr(data,at));value=[cab,pid,ff(data[at+12:at+28],4)];at+=28;maps[key]=value
                    if pid=='0':require(cab==mc,'null external texture')
                    elif cab==mc:
                        t=fields(ma,pid,28);texid=cab+':'+pid;payload=stream(ma,t['m_StreamData']);w,h,fmt,mips,color,complete=[mesh.u(t[k]) for k in ('m_Width','m_Height','m_TextureFormat','m_MipCount','m_ColorSpace','m_CompleteImageSize')];require(fmt in (4,10,12) and 0<w<=8192 and 0<h<=8192 and 1<=mips<=max(w,h).bit_length() and color in (0,1) and len(payload)==complete and mesh.u(t['image data'])==0,'native texture');textures[texid]={'name':mesh.string(t['m_Name'])[0],'width':w,'height':h,'format':fmt,'mips':mips,'colorSpace':color,'bytes':len(payload),'sha256':save(payload,'.texture.bin')}
                    else:unresolved.add(cab+':'+pid)
                elif name=='m_Ints':value=struct.unpack_from('<i',data,at)[0];at+=4
                elif name=='m_Floats':value=ff(data[at:at+4],1)[0];at+=4
                elif name=='m_Colors':value=ff(data[at:at+16],4);at+=16
                else:raise ValueError('material property type')
                d[key]=value
            require(at==len(data),'property bounds');props[name]=d
        require(set(maps)=={'_BaseMap','_BumpMap','_MetallicGlossMap','_Lighting_ReflectionMap_Assigned','_PatternMap','_Surface_EffectMap'},'flower material maps')
        rows.append({'itemId':item,'flowerItemId':species[0],'definitionPathId':definition,'spritePathId':sprite,'visualGuid':guid,'modelBundle':a['name'],'modelSha256':a['sha'],'modelCab':a['cab'],'rootPathId':go,'rendererPathId':rid,'meshPathId':mp,'meshSha256':sha(o[mp][2]),'geometrySha256':save(geometry,'.geometry.bin'),'vertices':n,'vertexBytes':len(vb),'indexBytes':size,'channels':channels,'bounds':ff(g['m_LocalAABB'],6),'materialBundle':ma['name'],'materialBundleSha256':ma['sha'],'materialRef':[mc,mid],'materialSha256':sha(ma['objects'][mid][2]),'maps':maps,'properties':props})
    rows.sort(key=lambda x:x['itemId']);require(len(rows)==25 and len({r['itemId'] for r in rows})==25 and len({r['flowerItemId'] for r in rows})==25,'complete model bindings');return {'schema':'HKIA.FlowerCrownSource.1','version':'3.0.1','definitionsSha256':D_SHA,'catalogSha256':C_SHA,'shaderRef':SHADER,'rows':rows,'textures':textures,'unresolvedTextureRefs':sorted(unresolved)}
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--stage',type=Path);a=p.parse_args();m=module('extract-furniture-mesh-source');t=module('extract-furniture-preview-camera');audit=module('audit-native-dye-materials')
    if a.stage:
        require(not a.stage.resolve().is_relative_to(Path(__file__).resolve().parent.parent),'raw staging must remain outside repository')
        a.stage.mkdir(parents=True,exist_ok=True)
    result=extract(a.root,a.stage,m,t,lambda b:dict(audit.auditor.extract_nodes(b)[1]))
    output=(json.dumps(result,sort_keys=True,separators=(',',':'))+'\n').encode('utf8')
    require(sha(output)==MANIFEST_SHA,'source manifest fingerprint mismatch')
    a.out.write_bytes(output)
    print('HKIA_FLOWER_CROWN_SOURCE_OK '+json.dumps({'models':len(result['rows']),'textures':len(result['textures']),'unresolved':len(result['unresolvedTextureRefs']),'manifestSha256':sha(output)}))

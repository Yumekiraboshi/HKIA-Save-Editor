#!/usr/bin/env python3
"""Merge already extracted native furniture sources; never publish or render.
The pack is a diagnostic asset source, not evidence of game icon fidelity.
"""
import argparse, hashlib, json, re, struct, tempfile, zipfile
from pathlib import Path

VERSION='3.0.1'
CATALOG='555a82bf7e8a6f0b6c9fee7d179988f54015e7b354902f13937198115e9ff52a'
LIMIT=96*1024*1024

def require(ok,code):
    if not ok: raise ValueError(code)
def sha(b): return hashlib.sha256(b).hexdigest()
def unique(d,k,v):
    require(k not in d or d[k]==v,'CONFLICT '+str(k));d[k]=v

def json_entry(z,name):
    require(z.getinfo(name).file_size<=32*1024*1024,'METADATA_SIZE')
    def pairs(xs):
        d={}
        for k,v in xs:
            require(k not in d,'DUPLICATE_JSON_KEY');d[k]=v
        return d
    return json.loads(z.read(name),object_pairs_hook=pairs)

def normalized(z):
    require(not ('local-source-manifest.json' in z.namelist() and 'sources.json' in z.namelist()),'AMBIGUOUS_MANIFEST')
    if 'local-source-manifest.json' in z.namelist():
        m=json_entry(z,'local-source-manifest.json');require(m['schema']=='HKIA.LocalFurnitureSourceStage.1' and m['catalogSha256']==CATALOG and m['renderFidelity']=='unverified','STAGE_SOURCE')
        return m['version'],[x['geometry'] for x in m['models']],[x['base'] for x in m['models']],m['patterns'],m.get('cubemaps',{})
    m=json_entry(z,'sources.json');require(m['schema'] in ('HKIA.CenterpieceStaticSourcePack.1','HKIA.FurnitureSourcePack.1') and m.get('renderFidelity')=='unverified','PACK_SCHEMA')
    require(m.get('catalogSha256',CATALOG)==CATALOG,'CATALOG_SOURCE')
    require(m['geometry']['schema']=='HKIA.FurnitureStaticMeshSamples.1' and m['base']['schema']=='HKIA.FurnitureBaseMaterialSource.1' and m['additionalPatterns']['schema']=='HKIA.FurniturePatternTextureSources.1','SOURCE_SCHEMA')
    require(all(m[k]['version']==VERSION for k in ('geometry','base','patterns','additionalPatterns')),'SOURCE_VERSION')
    return m['version'],m['geometry']['rows'],[m['base']],m['patterns']['rows']+m['additionalPatterns']['rows'],m['cubemaps']

def ranges(b,rows,aligned=False):
    cursor=0
    for off,n,dig in sorted(rows):
        require(type(off)==type(n)==int and (off==cursor or aligned and off==((cursor+3)&~3) and not any(b[cursor:off])) and n>0 and off+n<=len(b) and sha(b[off:off+n])==dig,'PAYLOAD_RANGE')
        cursor=off+n
    require(cursor==len(b),'PAYLOAD_COVERAGE')

def validate_geometry(g,b):
    require(g['schema']=='HKIA.FurnitureStaticMeshSource.1' and g['version']==VERSION and g['meshes'],'GEOMETRY_SCHEMA')
    rr=[]
    for m in g['meshes'].values():
        vr,ir=m['vertexBytes'],m['indexBytes'];rr.extend([vr,ir]);nv=m['vertexCount'];ni=m['indexCount']
        fmt=m.get('indexFormat',0);require(type(fmt)==int and fmt in (0,1),'INDEX_FORMAT')
        width=2 if fmt==0 else 4;code='H' if fmt==0 else 'I'
        require(type(nv)==type(ni)==int and 0<nv<=(65536 if fmt==0 else 64*1024*1024//12) and 0<ni<=6*1024*1024 and ni%3==0 and vr[1]==nv*m['stride'] and ir[1]==ni*width,'MESH_LENGTH')
        require(ir[0]>=0 and ir[0]+ir[1]<=len(b),'INDEX_RANGE')
        indices=struct.unpack_from('<'+str(ni)+code,b,ir[0]);require(max(indices)<nv and max(indices)<(1<<(8*width))-1,'INDEX_VERTEX')
        if 'submeshes' in m:
            cursor=0;require(2<=len(m['submeshes'])<=64,'SUBMESH_COUNT')
            for s in m['submeshes']:
                n=s['indexCount'];v=s['firstVertex'];vn=s['vertexCount'];require(s['firstByte']==cursor and n>0 and n%3==0 and cursor+n*width<=ir[1] and 0<=v<nv and 0<vn<=nv-v,'SUBMESH_RANGE')
                require(all(v<=i<v+vn for i in indices[cursor//width:cursor//width+n]),'SUBMESH_VERTEX');cursor+=n*width
            require(cursor==ir[1],'SUBMESH_COVERAGE')
    ranges(b,rr,True)

def validate_texture(t,b):
    fmt=t['format'];w=t['width'];h=t['height'];require(fmt in (4,5,10,12) and w>0 and h>0,'TEXTURE_FORMAT')
    if fmt==5:require(t['sha256']=='9a8dcd3f9ff7aa3114e141f03c12989d363ea81fd74c02eea63c5f41489cb17a' and b==bytes([255])*20,'ARGB_UNSUPPORTED')
    rr=[]
    for mw,mh,o,n,d in t['mips']:
        require((mw,mh)==(w,h) and n==(w*h*4 if fmt in (4,5) else ((w+3)//4)*((h+3)//4)*(8 if fmt==10 else 16)),'MIP_LAYOUT');rr.append([o,n,d]);w=max(1,w//2);h=max(1,h//2)
    ranges(b,rr)

def validate_cube(t,b):
    w=t['width'];require(w==t['height'] and w>0 and t['format']==10 and t['imageCount']==6 and t['faceOrder']=='unverified','CUBE_LAYOUT')
    cursor=0;require(t['mipCount']==len(t['faceMipRanges']),'CUBE_MIPS')
    for size,off,n in t['faceMipRanges']:
        require(size==w and off==cursor and n==((w+3)//4)**2*8,'CUBE_MIP_RANGE');cursor+=n;w=max(1,w//2)
    require(cursor==t['faceBytes'] and 6*cursor==len(b),'CUBE_COVERAGE')

def assemble(inputs,out):
    require(inputs and not out.exists(),'OUTPUT_EXISTS_OR_NO_INPUT')
    require(not out.resolve().is_relative_to(Path(__file__).resolve().parent.parent) or Path(__file__).parent.name!='scripts','OUTPUT_INSIDE_REPOSITORY')
    geometry={};patterns={};cubes={};base={'schema':'HKIA.FurnitureBaseMaterialSource.1','version':VERSION,'bundles':{},'rows':[],'materials':{},'textures':{},'shaders':{},'unresolved':[]};bindings={};refs={}
    with tempfile.TemporaryDirectory(prefix='.hkia-source-',dir=out.parent) as temp:
        tmp=Path(temp)/'pack.zip'
        with zipfile.ZipFile(tmp,'x',zipfile.ZIP_DEFLATED,compresslevel=6) as dst:
            for path in inputs:
                with zipfile.ZipFile(path) as z:
                    names=z.namelist();require(len(names)==len(set(names)) and len(names)<=5000,'PACK_ENTRIES')
                    version,gs,bs,ps,cs=normalized(z);require(version==VERSION,'VERSION');expected=set()
                    def add(kind,dig,n,validator):
                        require(re.fullmatch('[0-9a-f]{64}',dig) and type(n)==int and 0<n<=LIMIT,'PAYLOAD_REF')
                        k=f'{kind}/{dig}.bin';expected.add(k);require(z.getinfo(k).file_size==n,'PAYLOAD_LENGTH');b=z.read(k);require(len(b)==n and sha(b)==dig,'PAYLOAD_HASH');validator(b)
                        if k not in refs:dst.writestr(k,b)
                        unique(refs,k,{'kind':kind,'sha256':dig,'bytes':n})
                    for g in gs:
                        unique(geometry,g['itemId'],g);add('geometry',g['geometrySha256'],g['geometryBytes'],lambda b:validate_geometry(g,b))
                    for m in bs:
                        require(m['schema']==base['schema'] and m['version']==VERSION and not m['unresolved'],'BASE_SOURCE')
                        for k in ('bundles','materials','textures','shaders'):
                            for id,v in m[k].items():unique(base[k],id,v)
                        for r in m['rows']:unique(bindings,r['itemId'],r)
                        for t in m['textures'].values():add('texture',t['sha256'],t['bytes'],lambda b:validate_texture(t,b))
                    for t in ps:
                        # materialIndex is only a sample label, not part of GUID identity.
                        t={k:v for k,v in t.items() if k!='materialIndex'};unique(patterns,t['guid'],t);add('texture',t['sha256'],t['bytes'],lambda b:validate_texture(t,b))
                    for id,t in cs.items():
                        unique(cubes,id,t);add('cube',t['sha256'],t['bytes'],lambda b:validate_cube(t,b))
                    require(set(names)-{'index.json','sources.json','local-source-manifest.json'}==expected,'UNREFERENCED_PAYLOAD')
                    if 'index.json' in names:
                        idx=json_entry(z,'index.json');require(idx['schema']=='HKIA.FurniturePayloadPack.1' and idx['version']==VERSION,'INDEX_SCHEMA')
                        require(sorted(idx['payloads'],key=lambda r:(r['kind'],r['sha256']))==[refs[k] for k in sorted(expected)],'INDEX_MISMATCH')
            require(set(geometry)==set(bindings),'MODEL_COVERAGE')
            for id,g in geometry.items():
                r=bindings[id];single={x[0]:x for x in r['bindings']};multi={x['rendererPathId']:x for x in r.get('submeshBindings',[])};require(len(single)==len(r['bindings']) and len(multi)==len(r.get('submeshBindings',[])),'DUPLICATE_RENDERER')
                require(set(single).isdisjoint(multi),'DUPLICATE_RENDERER')
                for n in g['nodes']:
                    if 'rendererPathId' not in n:continue
                    rid=n['rendererPathId'];mesh=g['meshes'][n['meshPathId']]
                    def mat(key,actual):
                        f,pid=key.split(':');cab=g['cab'] if f=='0' else g['externals'][int(f)-1].split('/')[-1]
                        require(actual==cab+':'+pid and actual in base['materials'],'MATERIAL_BINDING')
                        source=g['materials'][key]
                        if f=='0':require(source['objectSha256']==base['materials'][actual]['objectSha256'],'MATERIAL_HASH')
                        else:require(source['externalCab'].split('/')[-1]==cab and source['pathId']==pid,'MATERIAL_EXTERNAL')
                    if 'submeshes' in mesh:
                        rr=multi.pop(rid);require(rr['slot']==n['slot'] and len(n['materialSlots'])==len(rr['materials'])==len(mesh['submeshes']),'SUBMESH_BINDING')
                        for key,actual in zip(n['materialSlots'],rr['materials']):mat(key,actual)
                    else:
                        rr=single.pop(rid);require(rr[2]==n['slot'],'SLOT_BINDING');mat(n['material'],rr[1])
                require(not single and not multi,'RENDERER_COVERAGE')
            for m in base['materials'].values():require(m['shader'] in base['shaders'] and all(t['texture'] is None or t['texture'] in base['textures'] for t in m['textures'].values()),'MATERIAL_CLOSURE')
            base['rows']=[bindings[i] for i in sorted(bindings)];refs_sorted=[refs[k] for k in sorted(refs)]
            meta={'schema':'HKIA.FurnitureSourcePack.1','version':VERSION,'catalogSha256':CATALOG,'renderFidelity':'unverified','geometry':{'schema':'HKIA.FurnitureStaticMeshSamples.1','version':VERSION,'rows':[geometry[i] for i in sorted(geometry)]},'base':base,'patterns':{'schema':'HKIA.FurniturePatternTextureSamples.1','version':VERSION,'itemId':32709745,'rows':[]},'additionalPatterns':{'schema':'HKIA.FurniturePatternTextureSources.1','version':VERSION,'rows':[patterns[i] for i in sorted(patterns)]},'cubemaps':cubes}
            dst.writestr('sources.json',json.dumps(meta,separators=(',',':'),allow_nan=False)+'\n');dst.writestr('index.json',json.dumps({'schema':'HKIA.FurniturePayloadPack.1','version':VERSION,'payloads':refs_sorted},separators=(',',':'))+'\n')
        with zipfile.ZipFile(tmp) as z:
            require(z.testzip() is None,'OUTPUT_ZIP');require(all(sha(z.read(f"{r['kind']}/{r['sha256']}.bin"))==r['sha256'] for r in refs_sorted),'OUTPUT_HASH')
        # Exclusive output: never replace an existing pack.
        import os
        os.link(tmp,out)
    return {'models':len(geometry),'patterns':len(patterns),'payloads':len(refs),'bytes':sum(r['bytes'] for r in refs_sorted),'zipBytes':out.stat().st_size}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('inputs',nargs='+',type=Path);p.add_argument('--out',required=True,type=Path);a=p.parse_args();print(json.dumps(assemble(a.inputs,a.out)))

#!/usr/bin/env python3
"""Extract original material property sheets and their exact CAB/PathID dependencies.
Offline only; shader code and texture payloads stay in staging. No rendered icons.
"""
import argparse, hashlib, importlib.util, json, math, re, struct
from pathlib import Path

def load_module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod

def require(ok,msg):
    if not ok:raise ValueError(msg)
def sha(b):return hashlib.sha256(b).hexdigest()

# Original PC v3.0.1 Shader object identities. Extraction support does not
# imply WebGL rendering support. Offsets refer to each exact hashed object.
SHADER_SOURCES={
    'CAB-46b8f8fe122147493b3113f7c1c8cd0f:-245959077359590779':('39080ec3a7154ee8032ee36bab5f861630dfe745b3bd1e35ad275662b1c6e332',28460,'Sunblink/Lynx/CustomLitRefractive',41,7),
    'CAB-2b27edbfe7f08bad1cd631865ee4eb15:-2527260696058741820':('1d7fcbcf451083bffb545d5490fa8a894cf373f0f7b03dd834a89f21e07e7e9a',19752,'Sunblink/Lynx/CustomLitSparkle',36,3),
    'CAB-6ef5e40a482b00b1d462fae2060592ab:8125211537628429288':('d1e8f28824efdf877dae5004d5ae5ea98823893b62f137d6fc37dfb44f5d91a8',19860,'Shader Graphs/Standard Vertex Color',6,1),
    'CAB-2b27edbfe7f08bad1cd631865ee4eb15:7085089958137184873':('6417c4faa59950760b14de6ae5ff53c646f780c24ac4c9b316ca2120863a5414',20820,'Sunblink/Lynx/Terrain/Custom Lit Terrain Simple',31,4),
    'CAB-2b27edbfe7f08bad1cd631865ee4eb15:-6806329374484566350':('cdb64e92e92cbc2b88b3ce48c8a3ed302a16972a23528c27e766b7a646d852d0',20904,'Sunblink/Lynx/CustomLitFurniture',42,4),
    'CAB-46b8f8fe122147493b3113f7c1c8cd0f:-6681258383375895387':('7c32f4b3f7c0c0d580af1e22584952aa29d266dfbe98de3b916c3fecb7339931',90796,'Sunblink/Lynx/CustomLit',47,42),
    'CAB-2b27edbfe7f08bad1cd631865ee4eb15:-5284085216943671920':('b23e096723fa706e6691614cce6855479eeb4657fbeb6bc76a0ff75f22ad1890',7324,'Sunblink/Lynx/Fluid',24,1),
    'CAB-2b27edbfe7f08bad1cd631865ee4eb15:5672080719818937120':('cd5500644f788d349e8558edf99a83b883fd28da9089ad18fe5f93a5576732a4',20000,'Shader Graphs/FluidStream',34,1),
}
def shader_source(key,object_sha):
    source=SHADER_SOURCES.get(key)
    require(source is not None and source[0]==object_sha,'unsupported shader identity '+key)
    return source

def extract(bundles,scene,mesh,audit,shader_audit,out=None,resolve_cab=None):
    loaded={}
    def load(path,expected_cab=None):
        raw=path.read_bytes();_,pairs=audit.auditor.extract_nodes(raw);nodes=dict(pairs)
        cabs=[x for x in nodes if re.fullmatch('CAB-[0-9a-f]{32}',x)];require(len(cabs)==1,'CAB identity');cab=cabs[0]
        require(expected_cab is None or cab==expected_cab,'resolved CAB mismatch')
        require(cab not in loaded,'duplicate CAB')
        trees,externals,object_types=mesh.type_trees(nodes[cab],indexed=True);objects={p:(c,b) for c,p,b,e in audit.serialized_objects(nodes[cab],classes=(21,28,48)) if e=='<'}
        loaded[cab]={'bundle':path.name.removesuffix('.bin'),'sha256':sha(raw),'trees':trees,'objectTypes':object_types,'externals':externals,'objects':objects,'stream':nodes.get(cab+'.resS',b'')}
    for path in bundles:load(path)
    def entry_for(cab):
        if cab not in loaded and resolve_cab is not None:
            path=resolve_cab(cab)
            if path is not None:load(path,cab)
        return loaded.get(cab)
    def ref(cab,p):
        f,pid=p
        if pid=='0':require(f==0,'null external pointer');return None
        ex=entry_for(cab)['externals'];require(0<=f<=len(ex),'file ID bounds')
        target=cab if f==0 else ex[f-1].split('/')[-1]
        require(re.fullmatch('CAB-[0-9a-f]{32}',target),'external CAB path')
        return target+':'+pid
    def object_for(key,cls):
        cab,pid=key.split(':');entry=entry_for(cab)
        if entry is None:return None
        require(pid in entry['objects'] and entry['objects'][pid][0]==cls,'object type/identity');return entry,entry['objects'][pid][1]
    textures={};materials={};shaders={};unresolved=set();rows=[]
    def texture(key):
        if key in textures:return
        target=object_for(key,28)
        if not target:unresolved.add(key);return
        entry,b=target;cab=key.split(':')[0];name,at=mesh.string(b);alpha,w,h,size,stripped,fmt,mips=struct.unpack_from('<7I',b,at)
        require(alpha in (0,1) and 0<w<=8192 and 0<h<=8192 and stripped==0 and fmt in (4,10,12) and 1<=mips<=max(w,h).bit_length(),f'unsupported texture layout {key} {name} {alpha,w,h,size,stripped,fmt,mips}')
        require(b[at+28:at+32] in (bytes(4),b'\1\0\0\0') and mesh.u(b,at+32)==0,'texture flags')
        streaming,priority,images,dim=struct.unpack_from('<4I',b,at+36);require(streaming in (0,1) and images==1 and dim==2,'texture dimension')
        sampler=struct.unpack_from('<iifiii',b,at+52);lightmap,color,platform,inline=struct.unpack_from('<4I',b,at+76)
        require(sampler[0] in (0,1,2) and 0<=sampler[1]<=16 and math.isfinite(sampler[2]) and all(v in (0,1,2,3) for v in sampler[3:]) and color in (0,1) and platform==inline==0,'sampler')
        off,length=struct.unpack_from('<QI',b,at+92);path,end=mesh.string(b,at+104);require(end==len(b) and path==f'archive:/{cab}/{cab}.resS' and length==size and off+length<=len(entry['stream']),'stream binding')
        data=entry['stream'][off:off+length];cursor=0;chain=[]
        for level in range(mips):
            mw=max(1,w>>level);mh=max(1,h>>level);n=mw*mh*4 if fmt==4 else ((mw+3)//4)*((mh+3)//4)*(8 if fmt==10 else 16)
            require(cursor+n<=length,'mip bounds');chain.append([mw,mh,cursor,n,sha(data[cursor:cursor+n])]);cursor+=n
        require(cursor==length,'mip chain');textures[key]={'name':name,'bundle':entry['bundle'],'objectSha256':sha(b),'width':w,'height':h,'format':fmt,'colorSpace':color,'sampler':sampler,'bytes':length,'sha256':sha(data),'mips':chain}
        if out:(out/(sha(data)+'.texture.bin')).write_bytes(data)
    def shader(key):
        if key in shaders:return
        target=object_for(key,48)
        if not target:unresolved.add(key);return
        entry,b=target;_,name_offset,expected_name,property_count,segment_count=shader_source(key,sha(b))
        r=shader_audit.Reader(b,name_offset);name=r.string();require(name==expected_name,'shader name')
        editor,fallback=r.string(),r.string();r.array(lambda:(r.string(),r.string()));r.array(lambda:(r.string(),r.string()));r.take('B');r.align()
        platforms=r.array(lambda:r.take('I'));offsets,sizes,expanded=[r.array(lambda:r.array(lambda:r.take('I'))) for _ in range(3)]
        require(platforms==[4] and len(offsets)==len(sizes)==len(expanded)==1,'shader platform');n=r.take('I');require(n<=len(b)-r.pos,'shader blob bounds');blob=b[r.pos:r.pos+n];cursor=0;segments=[]
        require(len(offsets[0])==len(sizes[0])==len(expanded[0])==segment_count,'shader segment counts')
        for off,z,size in zip(offsets[0],sizes[0],expanded[0]):
            require(off==cursor and 0<z<=len(blob)-off and 0<size<=2000000,'shader segment bounds');data=audit.auditor.decompress(blob[off:off+z],size,2);segments.append({'offset':off,'compressedBytes':z,'bytes':size,'sha256':sha(data),'programs':shader_audit.containers(data)});cursor+=z
        require(cursor==len(blob),'shader blob length');props=shader_audit.shader_properties(b);require(len(props)==property_count,'shader property count')
        shaders[key]={'name':name,'bundle':entry['bundle'],'objectSha256':sha(b),'properties':props,'segments':segments}
    def material(key):
        if key in materials:return
        target=object_for(key,21)
        if not target:unresolved.add(key);return
        entry,b=target;cab=key.split(':')[0];f=mesh.fields(entry['trees'][entry['objectTypes'][key.split(':')[1]]],b);name=mesh.string(f['m_Name'])[0];sh=ref(cab,mesh.ptr(f['m_Shader']));require(sh is not None,'shader missing');shader(sh)
        def strings(b):
            n=mesh.u(b);require(n<=1024,'keywords');p=4;result=[]
            for _ in range(n):s,p=mesh.string(b,p);result.append(s)
            require(p==len(b),'keyword boundary');return result
        q=f['m_SavedProperties'];p=0;maps={};groups={}
        for kind,fmt in [('textures',None),('ints','i'),('floats','f'),('colors','4f')]:
            n=mesh.u(q,p);p+=4;require(n<=1024,'property count');group={}
            for _ in range(n):
                k,p=mesh.string(q,p);require(k not in group,'duplicate property')
                if fmt is None:
                    t=ref(cab,mesh.ptr(q,p));uv=struct.unpack_from('<4f',q,p+12);p+=28;require(all(math.isfinite(x) for x in uv),'UV values');group[k]={'texture':t,'scale':uv[:2],'offset':uv[2:]}
                    if t:texture(t)
                else:
                    vals=struct.unpack_from('<'+fmt,q,p);p+=struct.calcsize('<'+fmt);require(all(math.isfinite(x) for x in vals),'material values');group[k]=vals[0] if len(vals)==1 else vals
            groups[kind]=group
        require(p==len(q),'property sheet boundary')
        materials[key]={'name':name,'bundle':entry['bundle'],'objectSha256':sha(b),'shader':sh,'validKeywords':strings(f['m_ValidKeywords']),'invalidKeywords':strings(f['m_InvalidKeywords']),'renderQueue':struct.unpack('<i',f['m_CustomRenderQueue'])[0],**groups}
    for row in scene['rows']:
        cab=row['cab'];entry=entry_for(cab);require(entry is not None and entry['sha256']==row['bundleSha256'],'scene bundle hash')
        bindings=[];submesh_bindings=[]
        def resolve_material(value):
            file,pid=value.split(':');key=ref(cab,[int(file),pid]);require(key is not None,'renderer material missing');material(key);return key
        for node in row['nodes']:
            if 'materialSlots' in node:
                require('material' not in node and len(node['materialSlots'])==len(row['meshes'][node['meshPathId']]['submeshes'])>=2,'submesh material coverage')
                submesh_bindings.append({'rendererPathId':node['rendererPathId'],'materials':[resolve_material(x) for x in node['materialSlots']],'slot':node['slot']})
            elif 'material' in node:
                bindings.append([node['rendererPathId'],resolve_material(node['material']),node['slot']])
            else:
                require('rendererPathId' not in node,'renderer material missing')
        result={'itemId':row['itemId'],'bindings':bindings}
        if submesh_bindings:result['submeshBindings']=submesh_bindings
        rows.append(result)
    return {'schema':'HKIA.FurnitureBaseMaterialSource.1','version':'3.0.1','bundles':{c:[v['bundle'],v['sha256']] for c,v in sorted(loaded.items())},'rows':rows,'materials':materials,'textures':textures,'shaders':shaders,'unresolved':sorted(unresolved),'renderFidelity':'unverified'}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('scene',type=Path);p.add_argument('bundles',nargs='+',type=Path);p.add_argument('--out',type=Path,required=True);a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
    result=extract(a.bundles,json.loads(a.scene.read_text()),load_module('extract-furniture-mesh-source'),load_module('audit-native-dye-materials'),load_module('audit-native-character-shader'),a.out)
    (a.out/'furniture-base-material-source-v3.0.1.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
if __name__=='__main__':main()

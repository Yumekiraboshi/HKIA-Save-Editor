#!/usr/bin/env python3
"""Offline original static furniture mesh extraction, bound by exact catalog GUID.
Writes a JSON scene description and a compact binary of original vertex/index
streams. Never publish source bundles, or treat the output as a finished icon.
Requires existing UnityFS audit helpers in the same scripts directory.
"""
import argparse, hashlib, importlib.util, json, math, re, struct
from pathlib import Path

def sha(b): return hashlib.sha256(b).hexdigest()
def align(n,a=4): return (n+a-1)&-a
def u(b,p=0): return struct.unpack_from('<I',b,p)[0]
def cs(b,p):
    e=b.index(0,p);return b[p:e].decode(),e+1
def string(b,p=0):
    n=u(b,p)
    if n>4096 or p+4+n>len(b):raise ValueError('string bounds')
    return b[p+4:p+4+n].decode(),align(p+4+n)
def ptr(b,p=0):
    f,i=struct.unpack_from('<iq',b,p);return [f,str(i)]
def type_trees(b,indexed=False):
    if len(b)<48 or struct.unpack_from('>I',b,8)[0]!=22 or b[16]!=0:raise ValueError('serialized file format')
    _,p=cs(b,48);p+=4
    if b[p]!=1:raise ValueError('original type tree required')
    p+=1;n=u(b,p);p+=4;out={}
    if n>512:raise ValueError('type count')
    for type_index in range(n):
        c=struct.unpack_from('<i',b,p)[0];p+=7+(16 if c==114 or c<0 else 0)+16
        n,s=struct.unpack_from('<II',b,p);p+=8
        if n>100000 or s>10000000 or p+32*n+s>len(b):raise ValueError('tree bounds')
        ss=b[p+32*n:p+32*n+s]
        def st(o):
            return {49:'Array',795:'size',106:'data',427:'m_Name',55:'Base',894:'TypelessData',840:'string',349:'m_Enabled',374:'m_GameObject',490:'m_Script'}.get(o&0x7fffffff,'#'+str(o&0x7fffffff)) if o>>31 else cs(ss,o)[0]
        stack=[];root=None
        for i in range(n):
            _,lv,_,ty,na,bs,_,meta,_=struct.unpack_from('<HBBIIiiiQ',b,p+i*32)
            node=[lv,st(ty),st(na),bs,meta,[]]
            while stack and stack[-1][0]>=lv:stack.pop()
            if stack:stack[-1][-1].append(node)
            elif root is None:root=node
            else:raise ValueError('tree root')
            stack.append(node)
        key=type_index if indexed else c
        if key in out:raise ValueError('multiple class schemas; use a supported static bundle')
        out[key]=root;p+=32*n+s;d=u(b,p);p+=4+4*d
    count=u(b,p);p=align(p+4);object_types={}
    if count>2000000 or p+count*24>len(b):raise ValueError('object table bounds')
    if indexed:
        for j in range(count):
            pid,_,_,idx=struct.unpack_from('<qqIi',b,p+j*24)
            if idx not in out or str(pid) in object_types:raise ValueError('invalid object type')
            object_types[str(pid)]=idx
    p+=count*24
    scripts=u(b,p);p+=4+scripts*12
    ext=u(b,p);p+=4;external=[]
    if ext>1024:raise ValueError('external count')
    for _ in range(ext):
        _,p=cs(b,p);p+=20;path,p=cs(b,p);external.append(path)
    return (out,external,object_types) if indexed else (out,external)

def walk(no,b,p=0,depth=0):
    _,ty,na,bs,meta,ch=no
    if depth>64:raise ValueError('depth')
    if ty=='TypelessData':p+=4+u(b,p)
    elif ty=='Array':
        n=u(b,p);p+=4
        if n>10000000:raise ValueError('count')
        d=ch[1]
        if d[3]>=0 and not d[4]&0x4000:p+=n*d[3]
        else:
            for _ in range(n):p=walk(d,b,p,depth+1)
    elif bs>=0:p+=bs
    elif ch:
        for child in ch:p=walk(child,b,p,depth+1)
    else:raise ValueError('unsupported tree node '+na)
    if meta&0x4000:p=align(p)
    if p>len(b):raise ValueError('field bounds '+na)
    return p

def fields(root,b):
    out={};p=0
    for no in root[-1]:
        q=walk(no,b,p);out[no[2]]=b[p:q];p=q
    if p!=len(b):raise ValueError('object length mismatch')
    return out

def array_ptr(b):
    n=u(b)
    if len(b)!=4+12*n:raise ValueError('PPtr array bounds')
    return [ptr(b,4+i*12) for i in range(n)]

def native_submeshes(sm,fmt,nv,ib):
    n=u(sm) if len(sm)>=4 else 0
    if fmt!=0 or not 1<=n<=64 or len(sm)!=4+48*n or not 1<=nv<=65536 or len(ib)%2:raise ValueError('unsupported submesh/index format')
    cursor=0;rows=[]
    for i in range(n):
        p=4+48*i;first,count,top,base,fv,vc=struct.unpack_from('<6I',sm,p);bounds=list(struct.unpack_from('<6f',sm,p+24))
        if first!=cursor or not count or count%3 or top or base or not vc or fv+vc>nv or first+2*count>len(ib) or not all(math.isfinite(x) for x in bounds) or any(x<0 for x in bounds[3:]):raise ValueError('submesh range')
        if any(not fv<=x[0]<fv+vc for x in struct.iter_unpack('<H',ib[first:first+2*count])):raise ValueError('submesh index bounds')
        rows.append({'firstByte':first,'indexCount':count,'firstVertex':fv,'vertexCount':vc,'bounds':bounds});cursor+=2*count
    if cursor!=len(ib) or (n==1 and (rows[0]['firstVertex']!=0 or rows[0]['vertexCount']!=nv)):raise ValueError('submesh coverage')
    return rows

def extract(raw, bundle_name, guid, item_id, audit, resolve_cab=None):
    _,pairs=audit.auditor.extract_nodes(raw);nodes=dict(pairs)
    cabs=[n for n in nodes if re.fullmatch('CAB-[0-9a-f]{32}',n)]
    if len(cabs)!=1:raise ValueError('one CAB required')
    cab=cabs[0];b=nodes[cab];stream=nodes.get(cab+'.resS',b'');trees,externals,object_types=type_trees(b,indexed=True)
    objects={pid:(c,o) for c,pid,o,e in audit.serialized_objects(b,classes=(1,4,21,23,28,33,43,114,142)) if e=='<'}
    def obj(pid,cls):
        c,o=objects[pid]
        if c!=cls:raise ValueError('object type mismatch')
        return o
    def f(pid,cls):return fields(trees[object_types[pid]],obj(pid,cls))
    def component_class(ref):
        if ref[0]!=0:return None
        if ref[1] not in object_types:raise ValueError('missing component object')
        return objects.get(ref[1],(None,None))[0]
    def local(ref,cls):
        if ref[0]!=0:raise ValueError('external object not supported')
        obj(ref[1],cls);return ref[1]
    container=next(o for c,o in objects.values() if c==142);_,p=string(container);preload=u(container,p);p+=4+preload*12;count=u(container,p);p+=4;matches=[]
    for _ in range(count):
        key,p=string(container,p);first,n=struct.unpack_from('<ii',container,p);ref=ptr(container,p+8);p+=20
        if key==guid:matches.append(local(ref,1))
    if not matches:raise ValueError('missing native prefab key')
    if len(matches)!=1:raise ValueError('ambiguous native prefab key')
    root=matches[0];root_fields=f(root,1);root_comps=array_ptr(root_fields['m_Component']);root_tr=[ref[1] for ref in root_comps if component_class(ref)==4];scripts=[ref[1] for ref in root_comps if component_class(ref)==114]
    scripts=[pid for pid in scripts if ptr(f(pid,114)['m_Script'])==[1,'-4647883882007958521']]
    if len(root_tr)!=1 or len(scripts)!=1:raise ValueError('unsupported root components')
    sf=f(scripts[0],114);script=ptr(sf['m_Script']);
    if script!=[1,'-4647883882007958521'] or not externals[0].endswith('CAB-2383a36f15413272ed26f383f73f6431'):raise ValueError('unknown visual slot script')
    if ptr(sf['m_GameObject'])!=[0,root]:raise ValueError('slot owner')
    slots={};s=sf['VisualSlots'];n=u(s);p=4
    for _ in range(n):
        rid=local(ptr(s,p),23);slot=struct.unpack_from('<i',s,p+12)[0];ref,p=string(s,p+16)
        if slot not in (0,1,2) or rid in slots:raise ValueError('unsupported slot binding')
        slots[rid]={'slot':slot,'displayedDefinitionGuid':ref or None}
    if p!=len(s):raise ValueError('slot object length')
    packed=bytearray();meshes={};scene=[];seen=set();materials={};mesh_origins={};external_meshes={}
    def put(data):
        while len(packed)%4:packed.append(0)
        pos=len(packed);packed.extend(data);return [pos,len(data),sha(data)]
    def mesh(ref):
        file_id,pid=ref
        origin=cab;source_stream=stream;source_name=bundle_name;source_hash=None
        if file_id==0:
            mesh_object=obj(pid,43);m=f(pid,43)
        else:
            if resolve_cab is None or not 1<=file_id<=len(externals):raise ValueError('external mesh source unavailable')
            path=externals[file_id-1];origin=path.rsplit('/',1)[-1]
            if not re.fullmatch('CAB-[0-9a-f]{32}',origin) or path!=f'archive:/{origin}/{origin}':raise ValueError('external mesh CAB path')
            if origin not in external_meshes:
                # Bound retained external CAB data to one bundle per model.
                external_meshes.clear()
                source_path=resolve_cab(origin)
                if source_path is None:raise ValueError('missing external mesh CAB '+origin)
                external_raw=source_path.read_bytes();source_name=source_path.name.removesuffix('.bin');source_hash=sha(external_raw)
                external_nodes=dict(audit.auditor.extract_nodes(external_raw)[1]);external_cabs=[k for k in external_nodes if re.fullmatch('CAB-[0-9a-f]{32}',k)]
                if external_cabs!=[origin]:raise ValueError('external mesh CAB identity')
                blob=external_nodes[origin];et,_,ei=type_trees(blob,indexed=True)
                eo={p:o for c,p,o,e in audit.serialized_objects(blob,classes=(43,)) if e=='<'}
                external_meshes[origin]=(source_name,source_hash,et,ei,eo,external_nodes.get(origin+'.resS',b''))
                del external_nodes,external_raw,blob
            source_name,source_hash,et,ei,eo,source_stream=external_meshes[origin]
            if pid not in eo:raise ValueError('missing external Mesh object')
            mesh_object=eo[pid];m=fields(et[ei[pid]],mesh_object)
        if pid in meshes:
            if mesh_origins[pid]!=origin:raise ValueError('ambiguous mesh Path ID across CABs')
            return pid
        mesh_origins[pid]=origin
        v=m['m_VertexData'];nv,nc=struct.unpack_from('<II',v);channels=[list(v[8+i*4:12+i*4]) for i in range(nc)];off,size=struct.unpack_from('<QI',m['m_StreamData']);path,_=string(m['m_StreamData'],12)
        if path!=f'archive:/{origin}/{origin}.resS' or off+size>len(source_stream) or not nv or size%nv or size//nv>64 or u(v,8+4*nc)!=0 or m['m_MeshCompression']!=b'\0':raise ValueError('unsupported vertex stream')
        stride=size//nv;fmt={0:4,1:2,2:1};end=0
        for st,o,ft,d in channels:
            dim=d&15
            if not dim:continue
            if st!=0 or ft not in fmt or dim>4:raise ValueError('unsupported channel')
            end=max(end,o+fmt[ft]*dim)
        if end!=stride or channels[0]!=[0,0,0,3]:raise ValueError('stride mismatch')
        vb=source_stream[off:off+size];ib=m['m_IndexBuffer'];n=u(ib);ib=ib[4:4+n];fmt=u(m['m_IndexFormat']);sm=m['m_SubMeshes']
        subs=native_submeshes(sm,fmt,nv,ib);count=len(ib)//2
        positions=[struct.unpack_from('<3f',vb,i*stride) for i in range(nv)]
        if not all(math.isfinite(x) for row in positions for x in row):raise ValueError('nonfinite vertices')
        meshes[pid]={'name':string(m['m_Name'])[0],'objectSha256':sha(mesh_object),'vertexCount':nv,'indexCount':count,'stride':stride,'channels':channels,'vertexBytes':put(vb),'indexBytes':put(ib),'bounds':[list(struct.unpack('<6f',m['m_LocalAABB']))], 'streamOffset':off}
        if len(subs)>1:meshes[pid]['submeshes']=subs
        if file_id:meshes[pid].update(sourceCab=origin,sourceBundle=source_name,sourceBundleSha256=source_hash)
        return pid
    def visit(tid,parent=None):
        if tid in seen or len(seen)>512:raise ValueError('transform cycle or size')
        seen.add(tid);tr=f(tid,4);go=local(ptr(tr['m_GameObject']),1);gf=f(go,1)
        if ptr(tr['m_Father'])!=[0,parent or '0']:raise ValueError('transform parent')
        row={'transformPathId':tid,'parentPathId':parent,'gameObjectPathId':go,'name':string(gf['m_Name'])[0],'active':bool(gf['m_IsActive'][0]),'rotation':list(struct.unpack('<4f',tr['m_LocalRotation'])),'position':list(struct.unpack('<3f',tr['m_LocalPosition'])),'scale':list(struct.unpack('<3f',tr['m_LocalScale']))}
        comps=array_ptr(gf['m_Component']);mf=[r[1] for r in comps if component_class(r)==33];rr=[r[1] for r in comps if component_class(r)==23]
        if len(mf)!=len(rr) or len(rr)>1:raise ValueError('unsupported renderer pairing')
        if rr:
            rid=rr[0];m=f(mf[0],33);r=f(rid,23);mid=mesh(ptr(m['m_Mesh']));refs=array_ptr(r['m_Materials'])
            if len(refs)!=len(meshes[mid].get('submeshes',[None])):raise ValueError('material/submesh count mismatch')
            keys=[]
            for ref in refs:
                matkey=f'{ref[0]}:{ref[1]}'
                if ref[1]=='0':raise ValueError('null renderer material')
                if ref[0]==0:
                    ma=f(ref[1],21);materials[matkey]={'name':string(ma['m_Name'])[0],'shader':ptr(ma['m_Shader']),'objectSha256':sha(obj(ref[1],21))}
                else:
                    if not 1<=ref[0]<=len(externals):raise ValueError('external material bounds')
                    materials[matkey]={'externalCab':externals[ref[0]-1],'pathId':ref[1]}
                keys.append(matkey)
            if len(keys)==1:
                row.update(rendererPathId=rid,meshPathId=mid,material=keys[0],slot=slots.get(rid),enabled=bool(r['m_Enabled'][0]))
            else:
                row.update(rendererPathId=rid,meshPathId=mid,materialSlots=keys,slot=slots.get(rid),enabled=bool(r['m_Enabled'][0]))
        scene.append(row)
        for child in array_ptr(tr['m_Children']):visit(local(child,4),tid)
    visit(root_tr[0]);renderers={x['rendererPathId'] for x in scene if 'rendererPathId' in x}
    if not set(slots)<=renderers:raise ValueError('unresolved slot')
    return {'schema':'HKIA.FurnitureStaticMeshSource.1','version':'3.0.1','itemId':item_id,'visualGuid':guid,'bundle':bundle_name,'bundleSha256':sha(raw),'cab':cab,'externals':externals,'rootGameObjectPathId':root,'visualSlotScript':script,'visualSlotObjectPathId':scripts[0],'visualSlotObjectSha256':sha(obj(scripts[0],114)),'nodes':scene,'meshes':meshes,'materials':materials,'geometrySha256':sha(packed),'geometryBytes':len(packed),'renderFidelity':'unverified'},bytes(packed)

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('bundle',type=Path);p.add_argument('visual',type=Path);p.add_argument('addressables',type=Path);p.add_argument('--item-id',required=True,type=int);p.add_argument('--out',required=True,type=Path);a=p.parse_args()
    v=json.loads(a.visual.read_text());ad=json.loads(a.addressables.read_text());row=next(r for r in v['rows'] if r[0]==a.item_id);guid=row[6] or row[4];loc=next(r for r in ad['rows'] if r[0]==guid);bundle=a.bundle.name.removesuffix('.bin')
    if bundle not in [ad['bundleNames'][i] for i in loc[3]]:raise ValueError('bundle not in exact native catalog dependencies')
    spec=importlib.util.spec_from_file_location('audit',Path(__file__).with_name('audit-native-dye-materials.py'));audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
    meta,geometry=extract(a.bundle.read_bytes(),bundle,guid,a.item_id,audit);a.out.mkdir(parents=True,exist_ok=True);(a.out/f'{a.item_id}.json').write_text(json.dumps(meta,separators=(',',':'))+'\n');(a.out/f'{a.item_id}.geometry.bin').write_bytes(geometry)
if __name__=='__main__':main()

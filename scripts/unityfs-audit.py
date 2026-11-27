#!/usr/bin/env python3
"""Read-only UnityFS v8 / SerializedFile v22 auditor (Python standard library).
Produces metadata only; no raw game content is emitted or committed.
Usage: python scripts/unityfs-audit.py /path/to/original-unityfs.bin
       python scripts/unityfs-audit.py --self-test
"""
import argparse
import collections
import hashlib
import json
import struct
import sys
from pathlib import Path

class InvalidAsset(ValueError):
    pass

MAX_INPUT=256*1024*1024
MAX_OUTPUT=512*1024*1024
CLASS={1:'GameObject',4:'Transform',21:'Material',23:'MeshRenderer',
       28:'Texture2D',33:'MeshFilter',43:'Mesh',74:'AnimationClip',
       89:'Cubemap',114:'MonoBehaviour',137:'SkinnedMeshRenderer',142:'AssetBundle'}

def integer(b,p,size=4,endian='>'):
    if p<0 or p+size>len(b):
        raise InvalidAsset('truncated integer')
    return int.from_bytes(b[p:p+size],'big' if endian=='>' else 'little')

def cstring(b,p):
    end=b.find(b'\x00',p)
    if end<0 or end-p>512:
        raise InvalidAsset('invalid nul-terminated string')
    return b[p:end].decode('utf-8','replace'),end+1

def lz4(src,expected):
    """UnityFS uses raw LZ4 blocks, including overlapping backreferences."""
    if expected<0 or expected>MAX_OUTPUT:
        raise InvalidAsset('LZ4 output size')
    out=bytearray()
    pos=0
    while pos<len(src):
        token=src[pos]
        pos+=1
        literals=token>>4
        if literals==15:
            while True:
                if pos>=len(src):raise InvalidAsset('truncated LZ4 literal')
                n=src[pos];pos+=1;literals+=n
                if n!=255:break
        if pos+literals>len(src) or len(out)+literals>expected:
            raise InvalidAsset('invalid LZ4 literals')
        out.extend(src[pos:pos+literals]);pos+=literals
        if pos==len(src):break
        offset=integer(src,pos,2,'<');pos+=2
        if offset==0 or offset>len(out):
            raise InvalidAsset('invalid LZ4 distance')
        repeat=(token&15)+4
        if (token&15)==15:
            while True:
                if pos>=len(src):raise InvalidAsset('truncated LZ4 match')
                n=src[pos];pos+=1;repeat+=n
                if n!=255:break
        if len(out)+repeat>expected:raise InvalidAsset('invalid LZ4 repetition')
        # The match repeats the preceding offset-byte window, including overlap.
        # Slice only what is needed for a nonoverlapping match; repeat the
        # original window for overlapping matches. All prior bounds still apply.
        start=len(out)-offset
        if repeat<=offset:
            out.extend(out[start:start+repeat])
        else:
            seed=out[start:];count,tail=divmod(repeat,offset)
            out.extend(seed*count);out.extend(seed[:tail])
    if len(out)!=expected:raise InvalidAsset('LZ4 decoded byte count')
    return bytes(out)

def decompress(src,size,mode):
    if mode==0:
        if len(src)!=size:raise InvalidAsset('raw block byte count')
        return src
    if mode in (2,3):return lz4(src,size)
    raise InvalidAsset('unsupported UnityFS block compression '+str(mode))

def extract_nodes(b):
    if len(b)>MAX_INPUT or not b.startswith(b'UnityFS\x00'):
        raise InvalidAsset('not bounded UnityFS data')
    p=8
    fmt=integer(b,p);p+=4
    game_version,p=cstring(b,p)
    editor_version,p=cstring(b,p)
    size=integer(b,p,8);p+=8
    compressed=integer(b,p);p+=4
    unpacked=integer(b,p);p+=4
    flags=integer(b,p);p+=4
    if fmt not in (7,8) or size!=len(b) or compressed>len(b) or unpacked>MAX_OUTPUT:
        raise InvalidAsset('UnityFS header mismatch')
    if flags&0x80:
        meta_pos=len(b)-compressed
        content_pos=(p+15)&~15
    else:
        meta_pos=(p+15)&~15
        content_pos=(meta_pos+compressed+15)&~15
    meta=decompress(b[meta_pos:meta_pos+compressed],unpacked,flags&63)
    p=16
    blocks=integer(meta,p);p+=4
    if blocks>10000:raise InvalidAsset('invalid UnityFS block count')
    desc=[]
    total=0
    for _ in range(blocks):
        original=integer(meta,p)
        packed=integer(meta,p+4)
        fl=integer(meta,p+8,2)
        p+=10
        total+=original
        if total>MAX_OUTPUT:raise InvalidAsset('UnityFS allocation limit')
        desc.append((original,packed,fl))
    count=integer(meta,p);p+=4
    if count>100000:raise InvalidAsset('invalid UnityFS node count')
    entries=[]
    for _ in range(count):
        off=integer(meta,p,8)
        length=integer(meta,p+8,8)
        p+=20
        name,p=cstring(meta,p)
        if off+length>total or '..' in name or '\\' in name or name.startswith('/'):
            raise InvalidAsset('invalid UnityFS node')
        entries.append((name,off,length))
    stream=bytearray()
    for original,packed,fl in desc:
        stream.extend(decompress(b[content_pos:content_pos+packed],original,fl&63))
        content_pos+=packed
    if len(stream)!=total:raise InvalidAsset('UnityFS data length mismatch')
    return {'format':fmt,'compression':flags&63,'blockCount':blocks,
            'nodeCount':count,'unpackedBytes':total,
            'unityVersion':game_version,'editorVersion':editor_version},[
        (name,bytes(stream[off:off+length])) for name,off,length in entries]

def named_asset(obj,endian):
    """Parse a Unity 2022 Material/Texture2D leading m_Name string."""
    if len(obj)<4:raise InvalidAsset('truncated named asset')
    length=integer(obj,0,4,endian)
    if length<1 or length>512 or 4+length>len(obj):
        raise InvalidAsset('invalid named asset string length')
    try:name=obj[4:4+length].decode('utf-8')
    except UnicodeDecodeError as e:raise InvalidAsset('invalid named asset UTF-8') from e
    aligned=(4+length+3)&~3
    return name,aligned

def renderer_material_references(obj,endian):
    """Unity SerializedFile v22 MeshRenderer/SkinnedMeshRenderer m_Materials.

    Unity 2022 Renderer layout: array count at byte offset 72, followed by
    (fileID:i32, pathID:i64) PPtrs. Strictly bound the array before reading.
    This is only applicable to the verified Unity 2022 game serializer.
    """
    if len(obj)<84:
        raise InvalidAsset('truncated renderer material array')
    count=integer(obj,72,4,endian)
    if count>64 or 76+12*count>len(obj):
        raise InvalidAsset('invalid renderer material array')
    references=[]
    for slot in range(count):
        file_id=struct.unpack_from(endian+'i',obj,76+12*slot)[0]
        path_id=struct.unpack_from(endian+'q',obj,80+12*slot)[0]
        if file_id<0:
            raise InvalidAsset('negative Renderer material file ID')
        references.append({'slot':slot,'fileId':file_id,'pathId':str(path_id)})
    return references

def inspect_serialized(b):
    version=integer(b,8)
    if version!=22:
        raise InvalidAsset('SerializedFile version '+str(version)+' unsupported')
    data_offset=integer(b,32,8)
    if integer(b,24,8)!=len(b) or data_offset>len(b):
        raise InvalidAsset('SerializedFile offset mismatch')
    endian='<' if b[16]==0 else '>'
    pos=48
    unity_version,pos=cstring(b,pos)
    pos+=4 # target platform
    has_tree=b[pos];pos+=1
    types_count=integer(b,pos,4,endian);pos+=4
    if types_count>512:raise InvalidAsset('invalid type count')
    types=[]
    for _ in range(types_count):
        cls=struct.unpack_from(endian+'i',b,pos)[0];pos+=4
        pos+=1 # stripped
        pos+=2 # script index
        if cls==114 or cls<0:pos+=16
        pos+=16 # type hash
        if has_tree:
            nodes=integer(b,pos,4,endian)
            strings=integer(b,pos+4,4,endian)
            pos+=8
            if nodes>100000 or strings>10000000:
                raise InvalidAsset('invalid type tree')
            pos+=32*nodes+strings
        dependencies=integer(b,pos,4,endian)
        pos+=4+4*dependencies
        if dependencies>10000 or pos>len(b):
            raise InvalidAsset('invalid type references')
        types.append(cls)
    # The object count itself consumes four bytes before alignment.
    # Previously this cursor was not advanced: object table was read from
    # the count field instead of the actual first PPtr entry.
    count=integer(b,pos,4,endian);pos+=4;pos=(pos+3)&~3
    if count>2000000:raise InvalidAsset('object count limit')
    names=[]
    classes=collections.Counter()
    renderer_refs=[]
    material_objects=[]
    texture_objects=[]
    for _ in range(count):
        if pos+24>len(b):raise InvalidAsset('object table truncated')
        _,start,length,index=struct.unpack_from(endian+'qqIi',b,pos)
        pos+=24
        if index<0 or index>=len(types) or start<0 or data_offset+start+length>len(b):
            raise InvalidAsset('invalid serialized object')
        cls=types[index]
        classes[CLASS.get(cls,'class_'+str(cls))]+=1
        if cls not in (1,21,23,28,137):continue
        obj=b[data_offset+start:data_offset+start+length]
        path_id=struct.unpack_from(endian+'q',b,pos-24)[0]
        if cls in (21,28):
            name,after_name=named_asset(obj,endian)
            if cls==21:
                if after_name+12>len(obj):
                    raise InvalidAsset('truncated Material shader PPtr')
                shader_file=struct.unpack_from(endian+'i',obj,after_name)[0]
                shader_path=struct.unpack_from(endian+'q',obj,after_name+4)[0]
                material_objects.append({
                    'pathId':str(path_id),'name':name,
                    'shader':{'fileId':shader_file,'pathId':str(shader_path)}
                })
            else:
                texture_objects.append({'pathId':str(path_id),'name':name})
            continue
        if cls in (23,137):
            renderer_refs.append({
                'class':CLASS[cls],
                'objectPathId':str(struct.unpack_from(endian+'q',b,pos-24)[0]),
                'materials':renderer_material_references(obj,endian)
            })
            continue
        if len(obj)<20:continue
        components=integer(obj,0,4,endian)
        nameoff=4+12*components+4
        if components>1000 or nameoff+4>len(obj):continue
        name_len=integer(obj,nameoff,4,endian)
        if not 0<name_len<256 or nameoff+4+name_len>len(obj):continue
        try:name=obj[nameoff+4:nameoff+4+name_len].decode('utf-8')
        except UnicodeDecodeError:continue
        if name not in names:names.append(name)
    script_refs=integer(b,pos,4,endian);pos+=4
    if script_refs>10000:raise InvalidAsset('invalid script reference count')
    pos+=12*script_refs
    external_count=integer(b,pos,4,endian);pos+=4
    if external_count>10000:raise InvalidAsset('invalid external reference count')
    external_paths=[]
    for _ in range(external_count):
        unused,pos=cstring(b,pos)
        if pos+20>len(b):raise InvalidAsset('truncated external reference')
        pos+=16 # GUID
        pos+=4 # external asset type
        external,pos=cstring(b,pos)
        if not external.startswith('archive:/CAB-'):
            raise InvalidAsset('non-CAB external path')
        external_paths.append(external)
    for material in material_objects:
        shader=material['shader']
        file_id=shader['fileId']
        if file_id<0 or file_id>len(external_paths):
            raise InvalidAsset('Material shader fileID outside dependency table')
        shader['externalCAB']=(
            external_paths[file_id-1].split('/')[-1] if file_id else None
        )
    for renderer in renderer_refs:
        for material in renderer['materials']:
            file_id=material['fileId']
            if file_id>len(external_paths):
                raise InvalidAsset('renderer material file ID exceeds external refs')
            material['externalCAB']=(
                external_paths[file_id-1].split('/')[-1] if file_id else None
            )
    return {'serializedFileVersion':version,
            'serializedUnityVersion':unity_version,
            'rendererMaterialReferences':renderer_refs,
            'materialObjects':material_objects,
            'textureObjects':texture_objects,
            'externalAssetPaths':external_paths,
            'objectCount':count,
            'classCounts':dict(sorted(classes.items())),
            'gameObjectNames':names,
            'hasEmbeddedMaterial':bool(classes.get('Material')),
            'hasEmbeddedTexture2D':bool(classes.get('Texture2D'))}

def audit(path):
    binary=path.read_bytes()
    header,nodes=extract_nodes(binary)
    result={'schema':'HKIA.UnityFSAudit.1',
            'bundle':path.name.removesuffix('.bin'),
            'sha256':hashlib.sha256(binary).hexdigest(),
            'compressedBytes':len(binary),'unityfs':header,'nodes':[]}
    for name,node in nodes:
        entry={'name':name,'bytes':len(node)}
        if name.startswith('CAB-') and not name.endswith('.resS'):
            entry.update(inspect_serialized(node))
        result['nodes'].append(entry)
    return result

def self_test():
    assert lz4(bytes([0x90])+b'abcdefghi',9)==b'abcdefghi'
    assert lz4(bytes([0x32])+b'abc'+bytes([3,0]),9)==b'abcabcabc'
    for source,expected in [(bytes([0x10])+b'x',0),(bytes([0,0,0]),4)]:
        try:lz4(source,expected)
        except InvalidAsset:pass
        else:raise AssertionError('invalid LZ4 accepted')
    # Cover offsets on both sides of the match length, extended literal/match
    # sizes and nonempty final literals. The byte-at-a-time reference is
    # independent of the optimized repeated-window copy.
    def extension(n):
        return bytes([255])*(n//255)+bytes([n%255])
    for literal_count in (1,3,14,15,16,32,270):
        literal=bytes(i%251 for i in range(literal_count))
        for offset in sorted({1,literal_count,max(1,literal_count//2)}):
            for repeat in sorted({4,18,19,20,274,1024,max(4,offset),max(4,offset-1),max(4,offset+1)}):
                token=(min(literal_count,15)<<4)|min(repeat-4,15)
                src=bytes([token])+(extension(literal_count-15) if literal_count>=15 else b'')+literal+struct.pack('<H',offset)+(extension(repeat-19) if repeat>=19 else b'')+b'\x20xy'
                reference=bytearray(literal)
                for _ in range(repeat):reference.append(reference[-offset])
                reference.extend(b'xy')
                assert lz4(src,len(reference))==bytes(reference)
                try:lz4(src,len(reference)-1)
                except InvalidAsset:pass
                else:raise AssertionError('LZ4 overrun accepted')
    assert decompress(b'abc',3,0)==b'abc'
    # Synthetic v22 object-table fixture: one Material with a shader PPtr.
    # This guards against misaligned object table parsing without including
    # any copyrighted game asset bytes.
    asset_name=b'Demo_Material'
    material=bytearray(4+len(asset_name))
    struct.pack_into('<I',material,0,len(asset_name))
    material[4:]=asset_name
    material.extend(b'\x00'*((-len(material))%4))
    material.extend(struct.pack('<iq',0,1234567890123456))
    material.extend(b'\x00'*20)
    blob=bytearray(512+len(material))
    struct.pack_into('>I',blob,8,22)
    struct.pack_into('>Q',blob,24,len(blob))
    struct.pack_into('>Q',blob,32,512)
    pos=48
    parts=(b'2022.3.1f1\x00',bytes(4),bytes([0]),
           struct.pack('<I',1),
           struct.pack('<i',21),bytes(1),bytes(2),bytes(16),
           struct.pack('<I',0),struct.pack('<I',1))
    for part in parts:
        blob[pos:pos+len(part)]=part
        pos+=len(part)
    pos=(pos+3)&~3
    entry=struct.pack('<qqIi',-123456789987654321,0,len(material),0)
    blob[pos:pos+24]=entry
    pos+=24
    blob[512:]=material
    outcome=inspect_serialized(bytes(blob))
    assert outcome['objectCount']==1,outcome
    assert outcome['classCounts']=={'Material':1},outcome
    assert outcome['materialObjects']==[{
        'pathId':'-123456789987654321','name':'Demo_Material',
        'shader':{'fileId':0,'pathId':'1234567890123456','externalCAB':None}
    }],outcome
    encoded=bytearray(88)
    struct.pack_into('<Iiq',encoded,72,1,3,6824069125264728142)
    assert renderer_material_references(encoded,'<')==[
        {'slot':0,'fileId':3,'pathId':'6824069125264728142'}]
    struct.pack_into('<I',encoded,72,1000)
    try:renderer_material_references(encoded,'<')
    except InvalidAsset:pass
    else:raise AssertionError('out-of-bounds Renderer materials accepted')
    print('UNITYFS_AUDIT_SELFTEST_OK')

def main():
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('source',type=Path,nargs='?')
    cli.add_argument('--self-test',action='store_true')
    args=cli.parse_args()
    try:
        if args.self_test:self_test();return 0
        if args.source is None:cli.error('source bundle required')
        print(json.dumps(audit(args.source),sort_keys=True,indent=2))
        return 0
    except (InvalidAsset,OSError,struct.error) as exc:
        print('UNITYFS_AUDIT_ERROR: '+str(exc),file=sys.stderr)
        return 2

if __name__=='__main__':
    raise SystemExit(main())

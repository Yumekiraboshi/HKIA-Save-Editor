#!/usr/bin/env python3
"""Locate external CAB assets in an original HKIA UnityFS game directory.

Reads only bundle headers and compressed block-info metadata, never extracts
game asset payload bytes. Uses no third-party libraries or external network.

python scripts/resolve-unityfs-cabs.py --root /game/StreamingAssets/aa/StandaloneWindows64
python scripts/resolve-unityfs-cabs.py --self-test
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import sys

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location("hkia_unityfs_audit",HERE/"unityfs-audit.py")
auditor=importlib.util.module_from_spec(spec)
spec.loader.exec_module(auditor)

def node_names(path):
    """Fast UnityFS directory read. Large mesh/texture content is not decoded."""
    size=path.stat().st_size
    if size<48: return []
    with path.open('rb') as f:
        head=f.read(1024)
        if not head.startswith(b'UnityFS\x00'): return []
        p=8
        version=auditor.integer(head,p);p+=4
        _,p=auditor.cstring(head,p)
        _,p=auditor.cstring(head,p)
        declared=auditor.integer(head,p,8);p+=8
        compressed=auditor.integer(head,p);p+=4
        decompressed=auditor.integer(head,p);p+=4
        flags=auditor.integer(head,p);p+=4
        if version not in (7,8) or declared!=size or compressed>4*1024*1024:
            raise auditor.InvalidAsset('unrecognized UnityFS directory')
        if flags&0x80: f.seek(size-compressed)
        else: f.seek((p+15)&~15)
        meta=auditor.decompress(f.read(compressed),decompressed,flags&63)
    pos=16
    block_count=auditor.integer(meta,pos);pos+=4
    if block_count>10000: raise auditor.InvalidAsset('too many blocks')
    pos+=block_count*10
    node_count=auditor.integer(meta,pos);pos+=4
    if node_count>100000: raise auditor.InvalidAsset('too many nodes')
    names=[]
    for _ in range(node_count):
        pos+=20
        name,pos=auditor.cstring(meta,pos)
        names.append(name)
    return names

def file_hash(path):
    dig=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):
            dig.update(chunk)
    return dig.hexdigest()

def resolve(root,targets):
    desired=set(targets)
    result={key:[] for key in sorted(desired)}
    seen=0
    invalid=0
    for entry in root.rglob('*'):
        if not entry.is_file():continue
        try:
            names=node_names(entry)
        except (OSError,ValueError,struct.error):
            invalid+=1;continue
        if not names:continue
        seen+=1
        matches=[name for name in names if name in desired]
        if not matches:continue
        item={
         'relativeSourcePath':entry.relative_to(root).as_posix(),
         'bundleSha256':file_hash(entry),
         'compressedBytes':entry.stat().st_size
        }
        for name in matches:result[name].append(item)
    return {'schema':'HKIA.UnityFSCabResolution.1',
            'targetCABs':sorted(desired),
            'candidates':result,
            'indexedUnityFSBundles':seen,
            'skippedMalformedBundles':invalid,
            'unresolved':sorted(k for k,v in result.items() if not v)}

def material_cabs(audit):
    """Only CABs proven referenced by an actual Renderer material PPtr."""
    references=audit['serialized']['rendererMaterialReferences']
    wanted=set()
    for renderer in references:
        for material in renderer['materials']:
            cab=material['externalCAB']
            if cab is not None:
                if cab not in audit['serialized']['externalCABs']:
                    raise auditor.InvalidAsset('renderer references unknown CAB')
                wanted.add(cab)
    if not wanted:raise auditor.InvalidAsset('no external Renderer materials')
    return sorted(wanted)

def self_test():
    # A synthetic UnityFS v8 file with a metadata-only CAB entry and a
    # single raw content block (no original copyrighted game bytes).
    import tempfile
    import struct
    name=b'CAB-0123456789abcdef0123456789abcdef\x00'
    blockinfo=b'\x00'*16+struct.pack('>I',1)+struct.pack('>IIH',4,4,0)+struct.pack('>I',1)
    blockinfo+=struct.pack('>QQI',0,4,4)+name
    header=b'UnityFS\x00'+struct.pack('>I',8)+b'5.x.x\x00'+b'0.0.0\x00'
    start=len(header)+8+12
    metadata_offset=(start+15)&~15
    content_offset=(metadata_offset+len(blockinfo)+15)&~15
    length=content_offset+4
    header+=struct.pack('>QIII',length,len(blockinfo),len(blockinfo),0)
    binary=header+b'\x00'*(metadata_offset-len(header))+blockinfo
    binary+=b'\x00'*(content_offset-len(binary))+b'data'
    with tempfile.TemporaryDirectory() as tmp:
        path=Path(tmp)/'sample'
        path.write_bytes(binary)
        assert node_names(path)==[name[:-1].decode()]
        result=resolve(Path(tmp),[name[:-1].decode()])
        assert result['unresolved']==[]
        assert result['candidates'][name[:-1].decode()][0]['bundleSha256']==file_hash(path)
    audit={'serialized':{'externalCABs':['CAB-'+'0'*32,'CAB-'+'1'*32],
      'rendererMaterialReferences':[{'materials':[
       {'externalCAB':'CAB-'+'1'*32},{'externalCAB':None}]}]}}
    assert material_cabs(audit)==['CAB-'+'1'*32]
    print('UNITYFS_CAB_RESOLVER_SELFTEST_OK')

def main():
    args=argparse.ArgumentParser(description=__doc__)
    args.add_argument('--root',type=Path)
    args.add_argument('--audit',type=Path,default=HERE.parent/'data/unityfs-audit/archer-costume.v3.0.1.json')
    args.add_argument('--self-test',action='store_true')
    args.add_argument('--materials-only',action='store_true',help='restrict CAB scan to audited Renderer material references')
    cli=args.parse_args()
    try:
        if cli.self_test:self_test();return 0
        if cli.root is None or not cli.root.is_dir():
            args.error('existing --root game asset folder required')
        audit=json.loads(cli.audit.read_text(encoding='utf8'))
        refs=material_cabs(audit) if cli.materials_only else audit['serialized']['externalCABs']
        result=resolve(cli.root,refs)
        print(json.dumps(result,indent=2))
        # Missing CABs are explicit blockers, never silently marked resolved.
        return 0 if not result['unresolved'] else 3
    except (auditor.InvalidAsset,OSError,ValueError,KeyError) as exc:
        print('UNITYFS_CAB_RESOLUTION_ERROR: '+str(exc),file=sys.stderr)
        return 2

if __name__=='__main__':
    raise SystemExit(main())

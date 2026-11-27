#!/usr/bin/env python3
"""Reproduce remaining customized furniture denial keys from the pinned original crosswalk."""
import argparse
import hashlib
import json
import re
import struct
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def require(ok,msg):
    if not ok: raise ValueError(msg)
def fingerprint(guid):
    require(re.fullmatch(r'[0-9a-fA-F]{32}',guid),'invalid GUID')
    words=[int(guid[i:i+8][::-1],16) for i in range(0,32,8)]
    h=2166136261
    for b in struct.pack('<4I',*words):h=((h^b)*16777619)&0xffffffff
    return h
def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('crosswalk',type=Path);p.add_argument('--check',action='store_true')
    args=p.parse_args();raw=args.crosswalk.read_bytes()
    require(hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()=='79dbaca5c4a109f95e1144a36b7307bb5595643f','wrong original crosswalk blob')
    x=json.loads(raw)
    require(x['source_original_sha256']=='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0','wrong definitions source')
    by_id={r['id']:r['guid'] for r in x['items']}
    require(len(by_id)==len(x['items'])==12163,'source coverage')
    src=ROOT/'core/src'
    rules={int(i):int(f) for i,f in re.findall(r'\((\d+),(\d+)\)',(src/'inventory_source_data.rs').read_text())}
    known={int(i):int(k,16) for i,k in re.findall(r'\((\d+),0x([0-9a-f]+)\)',(src/'inventory_tradeable_reference_data.rs').read_text())}
    ids=sorted(int(i) for i in re.findall(r'FurnitureItemSource\{item_id:(\d+),is_home_layout:false,',(src/'furniture_source.rs').read_text()) if rules.get(int(i)) in (1,17))
    rows=[(i,fingerprint(by_id[i])) for i in ids]
    require(len(rows)==len(set(ids))==len({k for i,k in rows})==621,'custom furniture coverage')
    require(sum(known.get(i)==k for i,k in rows)==456,'existing fingerprint mismatch')
    extra=[(i,k) for i,k in rows if i not in known]
    require(len(extra)==165,'additional furniture coverage')
    out=("// Exact Item ID/GUID crosswalk of remaining non-layout customizable furniture, v3.0.1.\n"
         "// Source: HKIA-Editor-Dev Git blob 79dbaca5c4a109f95e1144a36b7307bb5595643f.\n"
         "// FNV-1a fingerprints are denial-only, not ownership or item creation authority.\n"
         "pub(super) const CUSTOM_FURNITURE_EXTRA_REFERENCE_KEYS:&[(i32,u32)]=&[\n")
    out+=''.join(' '+','.join(f'({i},0x{k:08x})' for i,k in extra[j:j+4])+',\n' for j in range(0,len(extra),4))+'];\n'
    target=src/'inventory_custom_furniture_reference_data.rs'
    if args.check:require(target.read_text()==out,'checked-in crosswalk differs')
    else:target.write_text(out)
    print('Verified 621 existing customizable furniture definitions, 165 additional denial keys')
if __name__=='__main__':main()

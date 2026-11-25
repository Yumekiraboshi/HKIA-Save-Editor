#!/usr/bin/env python3
"""Reproduce the Rust item rule table from the pinned original definitions bundle."""
import argparse
import hashlib
import importlib.util
import struct as s
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SOURCE='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0'
IDS='8a55e11da2b28b30bb212424159657d3d9e7b47baf6a21ed94fd8615d1ef4702'
FLAGS='07535a7d093ce3abff44857ecfd9fcb1fed54b365e7524c8a10dff10d8c2cb64'

def require(ok,message):
    if not ok: raise ValueError(message)

def cstr(b,p):
    e=b.index(0,p)
    return b[p:e].decode(),e+1

def align(n): return (n+3)&~3

def extract(source):
    B=source.read_bytes()
    require(hashlib.sha256(B).hexdigest()==SOURCE,'unsupported source bundle')
    spec=importlib.util.spec_from_file_location('unityfs_audit',ROOT/'scripts/unityfs-audit.py')
    audit=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(audit)
    _,nodes=audit.extract_nodes(B)
    b=dict(nodes)['CAB-46b8f8fe122147493b3113f7c1c8cd0f']
    require(s.unpack_from('>I',b,8)[0]==22 and b[16]==0,'unsupported SerializedFile')
    offset=s.unpack_from('>Q',b,32)[0]
    p=48
    _,p=cstr(b,p)
    p+=4
    require(b[p]==1,'missing type tree')
    p+=1
    n=s.unpack_from('<I',b,p)[0];p+=4;types=[]
    for _ in range(n):
        cls=s.unpack_from('<i',b,p)[0]
        p+=7+(16 if cls==114 or cls<0 else 0)+16
        nn,ss=s.unpack_from('<II',b,p);p+=8
        buf=b[p+32*nn:p+32*nn+ss];tt=[]
        def st(i): return 'common:'+str(i&0x7fffffff) if i&0x80000000 else cstr(buf,i)[0]
        for j in range(nn):
            _,lev,_,ty,na,sz,_,flags,_=s.unpack_from('<HBBIIiiIQ',b,p+32*j)
            tt.append((lev,st(ty),st(na),sz,flags))
        p+=32*nn+ss
        dep=s.unpack_from('<I',b,p)[0];p+=4+4*dep
        types.append((cls,tt))
    require(types[3][0]==114,'item type mismatch')
    tt=types[3][1]
    require(tt[231][2]=='ItemProperties','unexpected item tree')
    end=[]
    for i,t in enumerate(tt):
        j=i+1
        while j<len(tt) and tt[j][0]>t[0]: j+=1
        end.append(j)
    def parse(raw,i,p):
        level,ty,name,size,flags=tt[i];j=i+1;value=None
        if ty=='common:840':
            n=s.unpack_from('<I',raw,p)[0]
            require(n<1000000 and p+4+n<=len(raw),'invalid string')
            value=raw[p+4:p+4+n].decode('utf8');p=align(p+4+n)
        elif ty=='common:49':
            n=s.unpack_from('<I',raw,p)[0];p+=4
            require(n<1000000,'invalid array')
            for _ in range(n): _,p=parse(raw,i+2,p)
        elif j<end[i]:
            while j<end[i]: _,p=parse(raw,j,p);j=end[j]
        elif size>=0:
            require(p+size<=len(raw),'truncated field')
            if ty=='common:222': value=s.unpack_from('<i',raw,p)[0]
            elif ty=='common:928':
                value=raw[p];require(value in (0,1),'invalid bool')
            p+=size
        else: raise ValueError(('unknown field',i,tt[i]))
        if flags&0x4000: p=align(p)
        return value,p
    n=s.unpack_from('<I',b,p)[0];p=align(p+4)
    rows=[];caps=[]
    for _ in range(n):
        _,start,size,i=s.unpack_from('<qqIi',b,p);p+=24
        if i!=3: continue
        raw=b[offset+start:offset+start+size]
        d={};j=1;pos=0
        while j<=231:
            begin=pos;val,pos=parse(raw,j,pos)
            name=tt[j][2]
            if name in ('RequiredDlcContent','CollectionEventYear'): val=raw[begin:pos].hex()
            if val is not None:d[name]=val
            j=end[j]
        id=d['Id'];stack=bool(d['ItemProperties']&2);unique=d['RequiresUniqueData'];custom=d['HasCustomMaxCount']
        cat=d['ItemCategory']
        candidate=(d['ItemOwnership']==18 and stack and not unique and not custom
                   and not d['ReleaseVersion'] and d['RequiredDlcContent']=='0'*32
                   and d['CollectionEventYear']=='0'*32 and d['Rarity'] in (2,3,4) and cat&2048
                   and not cat&(1|2|64|256|134217728))
        rows.append((id,int(stack)|unique*2|custom*4|int(bool(candidate))*8))
        if custom:caps.append((id,d['CustomMaxCount']))
    rows.sort();caps.sort()
    require(len(rows)==12163 and len({i for i,_ in rows})==12163 and rows[0][0]>0,'item IDs')
    require(hashlib.sha256(b''.join(s.pack('<i',i) for i,_ in rows)).hexdigest()==IDS,'ID fingerprint')
    require(hashlib.sha256(bytes(f for _,f in rows)).hexdigest()==FLAGS,'rule fingerprint')
    require(len(caps)==13 and all(cap>0 for _,cap in caps),'cap table')
    return rows,caps

def render(rows,caps):
    header=("// Generated from verified Steam v3.0.1 InventoryItemDefinitionAsset type tree.\n"
            "// Ids sorted ascending; flags: 1=Stackable, 2=RequiresUniqueData,\n"
            "// 4=HasCustomMaxCount, 8=conservative ordinary ingredient definition candidate.\n"
            "// Bit 8 does not authorize creation/removal or prove player rights.\n"
            f"// ID little-endian SHA256 {IDS}\n// flag SHA256 {FLAGS}\n"
            "pub(super) const RULES:&[(i32,u8)]=&[\n")
    fmt=lambda pairs: ' '+','.join(f'({i},{v})' for i,v in pairs)+',\n'
    return header+''.join(fmt(rows[i:i+8]) for i in range(0,len(rows),8))+'];\n'+'pub(super) const CUSTOM_CAPS:&[(i32,i32)]=&[\n'+fmt(caps)+'];\n'

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path);parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    generated=render(*extract(args.source))
    target=ROOT/'core/src/inventory_source_data.rs'
    if args.check: require(target.read_text()==generated,'checked-in rules differ')
    else: target.write_text(generated)
    print('Verified 12163 item definitions and 13 custom caps')

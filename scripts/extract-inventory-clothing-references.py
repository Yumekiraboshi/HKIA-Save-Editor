#!/usr/bin/env python3
"""Reproduce the ordinary clothing deletion-reference table from pinned game data."""
import argparse
import hashlib
import importlib.util
import struct as s
from pathlib import Path
from collections import defaultdict

ROOT=Path(__file__).resolve().parents[1]
SOURCE='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0'
ROW_HASH='688eb46fc205fc9d47678a78b4d0786ca5b4f2690dfb7be173b6964832edd2de'
GROUP_HASH='ca67710930262c2fdeb745a64034add939e17d0571140355487e51c1ada47a84'
FLOWER_HASH='80aa4103198c492cb9e670b21c397e7f94dba77730b99cdf257d8bf46abfc16a'
FLOWER_IDS={105502901,108363489,475585922,638410399,644209106,790136191,810330134,833950358,881399767,894396852,897617923,1001954252,1021906725,1048380205,1101281143,1110255162,1120342995,1177909060,1227385139,1423101683,1482119840,1560032168,1607110454,1693955310,1783185900,1861587997,1876646873}

def require(ok,msg):
    if not ok: raise ValueError(msg)

def align(n): return (n+3)&~3

def cstr(b,p):
    e=b.index(0,p);return b[p:e].decode(),e+1

def decoder(tt):
    end=[]
    for i,t in enumerate(tt):
        j=i+1
        while j<len(tt) and tt[j][0]>t[0]:j+=1
        end.append(j)
    def parse(raw,i,p):
        lev,ty,name,size,flags=tt[i];j=i+1;value=None
        if ty=='common:840':
            n=s.unpack_from('<I',raw,p)[0]
            require(n<1000000 and p+4+n<=len(raw),'invalid string')
            value=raw[p+4:p+4+n].decode();p=align(p+4+n)
        elif ty=='common:49':
            n=s.unpack_from('<I',raw,p)[0];p+=4;require(n<1000000,'invalid array');value=[]
            for _ in range(n):
                v,p=parse(raw,i+2,p);value.append(v)
        elif ty.startswith('PPtr<'):
            value=s.unpack_from('<iq',raw,p);p+=12
        elif j<end[i]:
            value={}
            while j<end[i]:
                v,p=parse(raw,j,p);value[tt[j][2]]=v;j=end[j]
        elif size>=0:
            require(p+size<=len(raw),'truncated field')
            if ty=='common:222':value=s.unpack_from('<i',raw,p)[0]
            elif ty=='common:814':value=s.unpack_from('<q',raw,p)[0]
            elif ty=='common:928':
                value=raw[p];require(value in (0,1),'invalid bool')
            else:value=raw[p:p+size]
            p+=size
        else:raise ValueError(('unknown field',i,tt[i]))
        if flags&0x4000:p=align(p)
        return value,p
    return end,parse

def fingerprint(guid):
    require(len(guid)==32 and all(c in '0123456789abcdefABCDEF' for c in guid),'invalid GUID')
    words=[int(guid[i:i+8][::-1],16) for i in range(0,32,8)]
    h=2166136261
    for b in s.pack('<4I',*words):h=((h^b)*16777619)&0xffffffff
    return h

def extract(source):
    B=source.read_bytes()
    require(hashlib.sha256(B).hexdigest()==SOURCE,'unsupported source bundle')
    spec=importlib.util.spec_from_file_location('unityfs_audit',ROOT/'scripts/unityfs-audit.py')
    audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
    _,nodes=audit.extract_nodes(B)
    b=dict(nodes)['CAB-46b8f8fe122147493b3113f7c1c8cd0f']
    require(s.unpack_from('>I',b,8)[0]==22 and b[16]==0,'unsupported SerializedFile')
    offset=s.unpack_from('>Q',b,32)[0];p=48;_,p=cstr(b,p);p+=4
    require(b[p]==1,'missing type tree');p+=1
    n=s.unpack_from('<I',b,p)[0];p+=4;types=[]
    for _ in range(n):
        cls=s.unpack_from('<i',b,p)[0];p+=7+(16 if cls==114 or cls<0 else 0)+16
        nn,ss=s.unpack_from('<II',b,p);p+=8;buf=b[p+32*nn:p+32*nn+ss];tt=[]
        def st(i):return 'common:'+str(i&0x7fffffff) if i&0x80000000 else cstr(buf,i)[0]
        for j in range(nn):
            _,lev,_,ty,na,sz,_,flags,_=s.unpack_from('<HBBIIiiIQ',b,p+32*j)
            tt.append((lev,st(ty),st(na),sz,flags))
        p+=32*nn+ss;dep=s.unpack_from('<I',b,p)[0];p+=4+4*dep;types.append((cls,tt))
    n=s.unpack_from('<I',b,p)[0];p=align(p+4);objects={}
    for _ in range(n):
        path,start,size,i=s.unpack_from('<qqIi',b,p);p+=24
        require(path not in objects and start>=0 and offset+start+size<=len(b),'invalid object')
        objects[path]=(i,b[offset+start:offset+start+size])
    require(all(types[i][0]==114 for i in (3,5,6)),'unexpected script types')
    tt=types[3][1];end,parse=decoder(tt)
    require(tt[131][2]=='Details' and tt[232][2]=='ParentItem' and tt[246][2]=='references','unexpected item tree')
    by_path={};selected=[];flower=[]
    for path,(i,raw) in objects.items():
        if i!=3:continue
        d={};j=1;pos=0
        while j<=234:
            start=pos;v,pos=parse(raw,j,pos);name=tt[j][2]
            d[name]=raw[start:pos].hex() if name in ('RequiredDlcContent','CollectionEventYear') else v
            j=end[j]
        id=d['Id'];by_path[path]=(id,d['ParentItem'])
        cat=d['ItemCategory']
        regular=(d['Rarity'] in (2,3,4) or (d['Rarity']==1 and d['ItemOwnership'] in (2,18)))
        quest_cosmetic=(d['Rarity']==5 and d['ItemOwnership'] in (2,18) and d['ItemProperties']&2)
        ordinary_stack=(d['ItemOwnership'] in (2,18,16) and d['ItemProperties']&2
                        and d['UseEffect']==0 and d['GiftEffect']==0)
        effective=d['UiOverridenItemCategory'] if d['HasUiOverridenItemCategory'] else cat
        visible=effective>=0 and not effective&(1|2|134217728) and d['UseEffect']==0 and d['GiftEffect']==0
        if id in FLOWER_IDS:
            require(d['RequiresUniqueData'] and not d['HasCustomMaxCount'] and d['ItemProperties']&2 and cat&256 and not cat&64,'invalid flower clothing definition')
        elif not(not d['RequiresUniqueData'] and not d['ReleaseVersion']
               and (regular or quest_cosmetic or ordinary_stack or visible)
               and cat>=0 and not cat&(1|2|134217728) and cat&256):continue
        require(not cat&64,'ambiguous clothing category')
        while j<246:_,pos=parse(raw,j,pos);j=end[j]
        ver,count=s.unpack_from('<II',raw,pos);pos+=8
        require(ver==2 and count==1,'unexpected clothing registry')
        rid=s.unpack_from('<q',raw,pos)[0];pos+=8
        require(rid==d['Details']['rid'],'wrong managed reference')
        labels=[]
        for _ in range(3):
            length=s.unpack_from('<I',raw,pos)[0]
            require(length<256 and pos+4+length<=len(raw),'invalid registry type')
            labels.append(raw[pos+4:pos+4+length].decode());pos=align(pos+4+length)
        require(labels==['OutfitItemDetails','Sunblink.Game','Assembly-CSharp'],'unsupported clothing details')
        file,ptr=s.unpack_from('<iq',raw,pos)
        require(file==0 and objects[ptr][0]==5,'invalid outfit PPtr')
        if id in FLOWER_IDS:flower.append((id,d['SerializedGuid'],path,ptr))
        else:selected.append((id,d['SerializedGuid'],path,ptr,regular))
    require(len(by_path)==12163 and len(selected)==6057,'item coverage')
    def model(path):
        i,raw=objects[path];tt=types[i][1];end,parse=decoder(tt);d={};pos=0;j=1
        while j<len(tt):
            v,pos=parse(raw,j,pos);d[tt[j][2]]=v;j=end[j]
        require(pos==len(raw),'incomplete outfit/piece type');return d
    # The exact managed Outfit PPtr, not a presumed parent-item equivalence,
    # is the reference group. Preserve regular groups' established keys;
    # additional direct outfits use their smallest member Item ID.
    outfits=defaultdict(list);rows=[];group_paths={}
    for id,guid,path,ptr,regular in selected:
        outfits[ptr].append((id,guid,path,regular))
    for ptr,members in outfits.items():
        regular_parents=set()
        for id,guid,path,regular in members:
            if regular:
                _,(file,parent)=by_path[path];require(file==0,'external parent')
                regular_parents.add(by_path[parent][0] if parent else id)
        require(len(regular_parents)<=1,'ambiguous regular group')
        key=next(iter(regular_parents)) if regular_parents else min(id for id,_,_,_ in members)
        require(key not in group_paths,'duplicate exact-outfit group key')
        group_paths[key]=ptr
        rows.extend((id,key,fingerprint(guid)) for id,guid,_,_ in members)
    require(len(group_paths)==1043,'exact outfit coverage')
    groups=[];all_pieces=set();piece_links=0
    for parent,ptr in sorted(group_paths.items()):
        d=model(ptr);pieces=set()
        for field in ('Outfits','AlternateWaterOutfits'):
            for v in d[field]['common:49']:
                file,q=v['OutfitPiece'];require(file==0 and objects[q][0]==6,'invalid piece PPtr')
                pieces.add(model(q)['SerializedGuid'])
        piece_links+=len(pieces);all_pieces.update(pieces)
        keys=sorted(set(map(fingerprint,[d['SerializedGuid'],*pieces])))
        require(len(keys)==1+len(pieces),'intragroup collision')
        groups.append((parent,keys))
    require(piece_links==2199,'piece coverage')
    rows.sort()
    require(len({x[0] for x in rows})==6057,'duplicate item ID')
    require(hashlib.sha256(b''.join(s.pack('<iiI',*r) for r in rows)).hexdigest()==ROW_HASH,'row fingerprint')
    require(hashlib.sha256(b''.join(s.pack('<iB',p,len(ks))+s.pack('<'+'I'*len(ks),*ks) for p,ks in groups)).hexdigest()==GROUP_HASH,'group fingerprint')
    flower_rows=[]
    for id,guid,path,ptr in flower:
        d=model(ptr);pieces=set()
        for field in ('Outfits','AlternateWaterOutfits'):
            for v in d[field]['common:49']:
                file,q=v['OutfitPiece'];require(file==0 and objects[q][0]==6,'invalid flower piece PPtr')
                pieces.add(model(q)['SerializedGuid'])
        keys=sorted(set(map(fingerprint,[guid,d['SerializedGuid'],*pieces])))
        require(len(keys)==3 and len(pieces)==1,'flower piece coverage')
        flower_rows.append((id,keys))
    flower_rows.sort()
    require({id for id,_ in flower_rows}==FLOWER_IDS and len(flower_rows)==27,'flower clothing coverage')
    require(hashlib.sha256(b''.join(s.pack('<iB',p,len(ks))+s.pack('<'+'I'*len(ks),*ks) for p,ks in flower_rows)).hexdigest()==FLOWER_HASH,'flower group fingerprint')
    return rows,groups,flower_rows

def render(rows,groups,flower_rows):
    header=("// Generated from pinned Steam v3.0.1 definitions, exact OutfitItemDetails.Outfit and BodyStyleOutfit.OutfitPiece PPtrs.\n"
            "// FNV-1a fingerprints of native Hash128 words are denial-only; never authority to identify or grant items.\n"
            f"// Row LE (i32 ItemId, i32 parent, u32 item GUID fingerprint) SHA256 {ROW_HASH}\n"
            f"// Group LE (i32 parent, u8 length, u32 sorted keys...) SHA256 {GROUP_HASH}\n"
            "pub(super) const CLOTHING_REFERENCE_ROWS:&[(i32,i32,u32)]=&[\n")
    fmt=[f'({id},{p},0x{k:08x})' for id,p,k in rows]
    return (header+''.join(' '+','.join(fmt[i:i+3])+',\n' for i in range(0,len(fmt),3))+
            '];\npub(super) const CLOTHING_REFERENCE_GROUPS:&[(i32,&[u32])]=&[\n'+
            ''.join(f' ({p},&['+','.join(f'0x{k:08x}' for k in ks)+']),\n' for p,ks in groups)+'];\n'+
            '// Flower-crafted clothing: original item, outfit and normal/water piece fingerprints.\n'+
            f'// Sorted LE (i32 ItemId, u8 count, u32 keys...) SHA256 {FLOWER_HASH}\n'+
            'pub(super) const FLOWER_CLOTHING_REFERENCE_KEYS:&[(i32,&[u32])]=&[\n'+
            ''.join(f' ({p},&['+','.join(f'0x{k:08x}' for k in ks)+']),\n' for p,ks in flower_rows)+'];\n')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('source',type=Path);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    target=ROOT/'core/src/inventory_clothing_reference_data.rs'
    generated=render(*extract(args.source))
    if args.check:require(target.read_text()==generated,'checked-in clothing source differs')
    else:target.write_text(generated)
    print('Verified 6057 ordinary clothing IDs, 1043 exact outfits and 2199 outfit/piece links')

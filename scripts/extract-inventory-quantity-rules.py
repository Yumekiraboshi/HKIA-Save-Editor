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
FLAGS='8beb988d3c808a937efe06de80c159855c23f8e0ceba0c4de5b2730d6fc5c109'
GATHERED='8cb0a2929cf109bbc768239f5bcede17ecdd97e913db861f83349a8fd7c7e60d'
FOOD_BAIT='abaf644ea95b721a2d21109647304fda13366723ba3ac425903cededb1fde39a'

def require(ok,message):
    if not ok: raise ValueError(message)

def cstr(b,p):
    e=b.index(0,p)
    return b[p:e].decode(),e+1

def align(n): return (n+3)&~3

def extract(source,furniture_reference_rows=None,tradeable_rows=None,tradeable_reference_rows=None,wand_ingredients=None,bag_facts=None):
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
    require(tt[124][2]=='ItemProperties' and tt[133][2]=='CelebrationPeriodicity' and tt[227][2]=='CollectionEventYear' and tt[231][2]=='Year','unexpected item tree')
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
    rows=[];caps=[];gathered=[];food_bait=[];cosmetic_counts=[0,0]
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
        if wand_ingredients is not None and cat>=0 and cat&0x100000:
            require(not unique,'item wand recipe unexpectedly includes a required-unique definition')
            if not d['ReleaseVersion']:
                wand_ingredients.append(id)
        candidate=(d['ItemOwnership']==18 and stack and not unique and not custom
                   and not d['ReleaseVersion'] and d['RequiredDlcContent']=='0'*32
                   and d['CollectionEventYear']=='0'*32 and d['Rarity'] in (2,3,4) and cat&2048
                   and not cat&(1|2|64|256|134217728))
        cosmetic=(d['ItemOwnership']==18 and stack and not unique and not custom
                  and not d['ReleaseVersion'] and d['RequiredDlcContent']=='0'*32
                  and d['CollectionEventYear']=='0'*32 and d['Rarity'] in (2,3,4)
                  and not cat&1 and cat&(64|256))
        if cosmetic:
            require(bool(cat&64)!=bool(cat&256),'ambiguous cosmetic category')
            cosmetic_counts[0 if cat&64 else 1]+=1
            if cat&64 and furniture_reference_rows is not None:
                guid=d['SerializedGuid']
                require(len(guid)==32 and all(c in '0123456789abcdefABCDEF' for c in guid),'invalid furniture GUID')
                words=[int(guid[i:i+8][::-1],16) for i in range(0,32,8)]
                h=2166136261
                for byte in s.pack('<4I',*words): h=((h^byte)*16777619)&0xffffffff
                furniture_reference_rows.append((id,h))
        # Tradable (2) with or without DevInboxGiftable (16). CollectionEventYear
        # describes collection provenance; it does not grant an event unlock.
        # Do not include DLC, internal, key, Quest-rarity or future definitions.
        tradeable=(d['ItemOwnership'] in (2,18) and stack and not unique and not custom
                   and not d['ReleaseVersion'] and d['RequiredDlcContent']=='0'*32
                   and d['Rarity'] in (2,3,4) and cat>=0 and not cat&(1|2|134217728))
        if tradeable_rows is not None and tradeable:tradeable_rows.append(id)
        if tradeable_reference_rows is not None and tradeable and not cat&256:
            guid=d['SerializedGuid']
            require(len(guid)==32 and all(c in '0123456789abcdefABCDEF' for c in guid),'invalid tradeable GUID')
            words=[int(guid[i:i+8][::-1],16) for i in range(0,32,8)]
            h=2166136261
            for byte in s.pack('<4I',*words): h=((h^byte)*16777619)&0xffffffff
            tradeable_reference_rows.append((id,h))
        # One uniform predicate over every typed native item definition.
        # Regular rarity or independently verified tradable currency; not internal,
        # key, future or required-payload definitions. Existing DLC rows need no
        # inferred entitlement; absent acquisition must be unrestricted.
        if bag_facts is not None:
            released_nil=(not unique and cat>=0 and not cat&(1|2|134217728) and not d['ReleaseVersion'])
            bag=released_nil and (d['Rarity'] in (2,3,4) or
                                (d['Rarity']==1 and d['ItemOwnership'] in (2,18)))
            add=(d['RequiredDlcContent']=='0'*32 and
                 (d['ItemOwnership'] in (2,18) or (d['ItemOwnership']==16 and d['Rarity'] in (2,3,4))))
            # Quest is a rarity label, not the structure of the bag row.
            # Tradable stackable cosmetics can retain/refill existing rows.
            quest_cosmetic=(released_nil and d['Rarity']==5 and d['ItemOwnership'] in (2,18)
                            and stack and cat&(64|256|131072|262144))
            # Finite, explicitly defined reset effects, without invoking those effects.
            reset=(released_nil and d['Rarity']==5 and cat==0 and stack and custom
                   and d['CustomMaxCount']>0 and
                   ((d['UseEffect'] in (1,2) and d['GiftEffect']==0) or
                    (d['UseEffect']==0 and d['GiftEffect']==1)))
            # Native stack membership, not rarity/category name: existing
            # released nil rows with a distributable ownership flag and no
            # special use/gift effect can use the common reference gate.
            ordinary_stack=(released_nil and stack and d['ItemOwnership'] in (2,18,16)
                            and d['UseEffect']==0 and d['GiftEffect']==0)
            flags=(1|2*bool(cat&256)|4*bool(add)) if bag else (
                (1|2*bool(cat&256)|4*bool(d['RequiredDlcContent']=='0'*32 and d['UseEffect']==0 and d['GiftEffect']==0)) if quest_cosmetic else
                (1|4*bool(d['RequiredDlcContent']=='0'*32 and d['ItemOwnership']==16)) if reset else
                (1|2*bool(cat&256)) if ordinary_stack else 0)
            effective=d['UiOverridenItemCategory'] if d['HasUiOverridenItemCategory'] else cat
            no_effect=d['UseEffect']==0 and d['GiftEffect']==0
            visible=released_nil and effective>=0 and not effective&(1|2|134217728) and no_effect
            if not flags and visible:
                flags=1|2*bool(cat&256)
            if (flags&1 and released_nil and d['RequiredDlcContent']=='0'*32 and d['ItemOwnership'] in (2,18,16) and no_effect
                    and effective>=0 and not effective&(1|2|134217728)
                    and (d['Rarity']!=1 or d['ItemOwnership'] in (2,18))):
                flags|=4
            guid=d['SerializedGuid']
            require(len(guid)==32 and all(c in '0123456789abcdefABCDEF' for c in guid),'invalid item GUID')
            words=[int(guid[i:i+8][::-1],16) for i in range(0,32,8)]
            h=2166136261
            for byte in s.pack('<4I',*words): h=((h^byte)*16777619)&0xffffffff
            bag_facts.append((id,flags,h))
        rows.append((id,int(stack)|unique*2|custom*4|int(bool(candidate))*8|int(bool(cosmetic))*16))
        if custom:caps.append((id,d['CustomMaxCount']))
        # Native raw masks: CreationStationIngredient | Fish / Critter.
        # Always-periodicity, ordinary rarity, unrestricted original definition.
        if (d['ItemOwnership']==18 and stack and not unique and not custom
            and not d['ReleaseVersion'] and d['RequiredDlcContent']=='0'*32
            and d['CollectionEventYear']=='0'*32 and d['CelebrationPeriodicity']==0
            and d['Rarity'] in (2,3,4) and cat in (268451840,268435464)):
            gathered.append((id,cat))
        # FirstTime controls celebration display, not the ownership flag.
        # Explicit food composite and fishing bait only; exclude Quest rarity.
        if (d['ItemOwnership']==18 and stack and not unique and not custom
            and not d['ReleaseVersion'] and d['RequiredDlcContent']=='0'*32
            and d['CollectionEventYear']=='0'*32 and d['CelebrationPeriodicity']==1
            and d['Rarity'] in (2,3,4) and cat in (269557760,8192)):
            food_bait.append((id,cat))
    require(cosmetic_counts==[1114,2435],'cosmetic category counts')
    rows.sort();caps.sort()
    require(len(rows)==12163 and len({i for i,_ in rows})==12163 and rows[0][0]>0,'item IDs')
    require(hashlib.sha256(b''.join(s.pack('<i',i) for i,_ in rows)).hexdigest()==IDS,'ID fingerprint')
    require(hashlib.sha256(bytes(f for _,f in rows)).hexdigest()==FLAGS,'rule fingerprint')
    require(len(caps)==13 and all(cap>0 for _,cap in caps),'cap table')
    gathered.sort()
    require(len(gathered)==224 and sum(cat==268451840 for _,cat in gathered)==168,'gathered category counts')
    require(hashlib.sha256(b''.join(s.pack('<i',id) for id,_ in gathered)).hexdigest()==GATHERED,'gathered fingerprint')
    food_bait.sort()
    require(len(food_bait)==236 and sum(cat==269557760 for _,cat in food_bait)==178,'food/bait category counts')
    require(hashlib.sha256(b''.join(s.pack('<i',id) for id,_ in food_bait)).hexdigest()==FOOD_BAIT,'food/bait fingerprint')
    return rows,caps,[id for id,_ in gathered],[id for id,_ in food_bait]

def render(rows,caps):
    header=("// Generated from verified Steam v3.0.1 InventoryItemDefinitionAsset type tree.\n"
            "// Ids sorted ascending; flags: 1=Stackable, 2=RequiresUniqueData,\n"
            "// 4=HasCustomMaxCount, 8=conservative ordinary ingredient definition candidate.\n"
            "// Bit 16 = ordinary furniture/clothing definition candidate for addition only.\n"
            "// Candidate flags do not authorize creation/removal or prove player rights.\n"
            f"// ID little-endian SHA256 {IDS}\n// flag SHA256 {FLAGS}\n"
            "pub(super) const RULES:&[(i32,u8)]=&[\n")
    fmt=lambda pairs: ' '+','.join(f'({i},{v})' for i,v in pairs)+',\n'
    return header+''.join(fmt(rows[i:i+8]) for i in range(0,len(rows),8))+'];\n'+'pub(super) const CUSTOM_CAPS:&[(i32,i32)]=&[\n'+fmt(caps)+'];\n'

def render_furniture_references(rows):
    rows=sorted(rows)
    ids='8fbdf8f0b216c3513b9526cf9ce0f201cab30ce97ada1b2b6d4137f4edc4715b'
    keys='703d7d7a46cf57bad14b9f6212a3a72ee9e25af8a6d8f5ad1f67b95de50e6235'
    require(len(rows)==1114 and len({i for i,_ in rows})==1114 and len({h for _,h in rows})==1114,'furniture reference coverage')
    require(hashlib.sha256(b''.join(s.pack('<i',i) for i,_ in rows)).hexdigest()==ids,'furniture ID fingerprint')
    require(hashlib.sha256(b''.join(s.pack('<I',h) for _,h in rows)).hexdigest()==keys,'furniture GUID fingerprint')
    header=("// Generated from Steam v3.0.1 InventoryItemDefinitionAsset.SerializedGuid and Id.\n"
            "// Only the 1114 ordinary furniture candidates; fingerprint is denial-only.\n"
            f"// Sorted LE i32 ID SHA256 {ids}\n"
            f"// Sorted LE u32 fingerprint SHA256 {keys}\n"
            "pub(super) const FURNITURE_REFERENCE_KEYS:&[(i32,u32)]=&[\n")
    return header+''.join(' '+','.join(f'({i},0x{h:08x})' for i,h in rows[j:j+4])+',\n' for j in range(0,len(rows),4))+'];\n'

def render_tradeable(rows,ids):
    ids=sorted(ids)
    require(len(ids)==6521 and len(set(ids))==6521,'tradeable creation coverage')
    require(hashlib.sha256(b''.join(s.pack('<i',id) for id in ids)).hexdigest()=='4dc7ed5ce734e90cf6777d4310c55352f5cd04c5759df3b47d860be4f6973d5b','tradeable Item ID fingerprint')
    members=set(ids);bits=bytearray((len(rows)+7)//8)
    for i,(id,flags) in enumerate(rows):
        if id in members:
            require(flags&7==1,'tradeable quantity flags')
            bits[i//8]|=1<<(i%8)
    fingerprint='3a9e06f1b2385881ebcd3db406a39120913b798902cdf4482876a44f7b206824'
    require(hashlib.sha256(bits).hexdigest()==fingerprint,'tradeable bitset fingerprint')
    return ("// Generated from pinned Steam v3.0.1 definitions; bit order is RULES ascending Item ID.\n"
            "// See extract-inventory-quantity-rules.py. Native ordinary tradeable addition candidates only.\n"
            f"// SHA256 {fingerprint}\n"
            "pub(super) const TRADEABLE_CREATION_BITS:&[u8]=&[\n"
            +''.join(' '+','.join(f'0x{v:02x}' for v in bits[i:i+16])+',\n' for i in range(0,len(bits),16))+'];\n')

def render_tradeable_references(rows):
    rows=sorted(rows)
    require(len(rows)==2575 and len({i for i,_ in rows})==2575 and len({h for _,h in rows})==2575,'tradeable nonclothing reference coverage')
    header=("// Generated from pinned Steam v3.0.1 source Item ID/GUID and raw category tables.\n"
            "// Ordinary tradeable non-clothing definitions; GUID fingerprints are denial-only.\n"
            "pub(super) const TRADEABLE_NONCLOTHING_REFERENCE_KEYS:&[(i32,u32)]=&[\n")
    return header+''.join(' '+','.join(f'({i},0x{h:08x})' for i,h in rows[j:j+4])+',\n' for j in range(0,len(rows),4))+'];\n'

def render_wand_ingredients(rows,ids):
    require(len(ids)==len(set(ids))==8601,'wand ingredient coverage')
    members=set(ids);bits=bytearray((len(rows)+7)//8)
    for i,(id,flags) in enumerate(rows):
        if id in members:
            require(not flags&2,'wand ingredient requires unique data')
            bits[i//8]|=1<<(i%8)
    fingerprint='433ec9faa61477cfc61bb069222522f2daa82f3c89d9c9474223a59e6e5afcca'
    require(hashlib.sha256(bits).hexdigest()==fingerprint,'wand ingredient fingerprint')
    return ("// Generated from pinned Steam v3.0.1 definitions; ascending RULES Item ID order.\n"
            "// Item-wand recipe mask 0x100000, no required unique data or release string.\n"
            f"// SHA256 {fingerprint}\n"
            "pub(super) const WAND_ITEM_SOURCE_BITS:&[u8]=&[\n"
            +''.join(' '+','.join(f'0x{v:02x}' for v in bits[i:i+16])+',\n' for i in range(0,len(bits),16))+'];\n')

def render_bag_facts(facts,rows):
    facts=sorted(facts)
    require([id for id,_,_ in facts]==[id for id,_ in rows],'bag definition identity alignment')
    flags=bytes(f for _,f,_ in facts);keys=[key for _,_,key in facts]
    fh='9ac02a6abed49424a8047a8c8b13bc24d5f9654a4c211c58c5da3f14d4e0825f'
    kh='0bd8235b2a3bad5263ec8a2144a0a84fa27d8bab4e27e60034190abc6d7a8396'
    require(hashlib.sha256(flags).hexdigest()==fh and hashlib.sha256(b''.join(s.pack('<I',key) for key in keys)).hexdigest()==kh,'bag facts fingerprint')
    require(len(set(keys))==12163 and [sum(bool(f&mask) for f in flags) for mask in (1,2,4)]==[9880,6057,7348],'bag facts coverage')
    return ("// Generated from the pinned Steam v3.0.1 definitions, ascending RULES Item ID order.\n"
            "// Flags: 1=released ordinary bag class, 2=outfit reference class, 4=unrestricted bag acquisition.\n"
            "// Native item GUID fingerprints are denial-only. See extract-inventory-quantity-rules.py.\n"
            f"// Flags SHA256 {fh}\n// GUID LE SHA256 {kh}\n"
            "pub(super) const BAG_FLAGS:&[u8]=&[\n"
            +''.join(' '+','.join(str(f) for f in flags[i:i+32])+',\n' for i in range(0,len(flags),32))
            +'];\npub(super) const ITEM_GUID_DENIAL_KEYS:&[u32]=&[\n'
            +''.join(' '+','.join(f'0x{k:08x}' for k in keys[i:i+8])+',\n' for i in range(0,len(keys),8))+'];\n')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path);parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    furniture_references=[];tradeable=[];tradeable_references=[];wand_ingredients=[];bag_facts=[]
    rows,caps,gathered,food_bait=extract(args.source,furniture_references,tradeable,tradeable_references,wand_ingredients,bag_facts)
    generated=render(rows,caps)
    gathered_source=("// Generated from the pinned original Steam v3.0.1 definitions.\n"
                     "// 168 fish, 56 critters; native ordinary, always-periodic definitions.\n"
                     f"// ID little-endian SHA256 {GATHERED}\n"
                     "pub(super) const GATHERED_IDS:&[i32]=&[\n"
                     +''.join(' '+','.join(str(id) for id in gathered[i:i+8])+',\n' for i in range(0,len(gathered),8))+'];\n')
    gathered_source+=("\n// 178 food, 58 fishing bait; native ordinary FirstTime celebration definitions.\n"
                      f"// ID little-endian SHA256 {FOOD_BAIT}\n"
                      "pub(super) const FOOD_BAIT_IDS:&[i32]=&[\n"
                      +''.join(' '+','.join(str(id) for id in food_bait[i:i+8])+',\n' for i in range(0,len(food_bait),8))+'];\n')
    for name,content in [('inventory_source_data.rs',generated),('inventory_bag_data.rs',render_bag_facts(bag_facts,rows)),('inventory_gathered_data.rs',gathered_source),('inventory_furniture_reference_data.rs',render_furniture_references(furniture_references)),('inventory_tradeable_data.rs',render_tradeable(rows,tradeable)),('inventory_tradeable_reference_data.rs',render_tradeable_references(tradeable_references)),('inventory_wand_ingredient_data.rs',render_wand_ingredients(rows,wand_ingredients))]:
        target=ROOT/'core/src'/name
        if args.check: require(target.read_text()==content,'checked-in source differs: '+name)
        else: target.write_text(content)
    print('Verified 12163 item definitions, 13 custom caps, 224 gathered-item 236 food/bait and 3549 original furniture/clothing candidates; 6521 total ordinary tradeable addition candidates')

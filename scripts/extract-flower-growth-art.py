#!/usr/bin/env python3
"""Extract original growth-state Sprite crops, not generated flower variants.
Requires Pillow and existing UnityFS helpers. Original bundles stay local.
"""
import argparse,hashlib,json,struct
from pathlib import Path
from PIL import Image
import importlib.util
D='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0'
A='04c1f4c191b0a821a0bbcb15e67a75bec85cf343a0b2e875ee8e525e1e8dfc7b'
DCAB='CAB-46b8f8fe122147493b3113f7c1c8cd0f'
ACAB='CAB-7b5f150a8a680cc279a40f4d3ca4f657'
ATLAS='5896659347915696894'
def sha(b):return hashlib.sha256(b).hexdigest()
def require(ok,msg):
    if not ok:raise ValueError(msg)
def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def extract(definitions,atlas,out,mesh,typed,audit):
    require(sha(definitions)==D and sha(atlas)==A,'original source fingerprints')
    dn=dict(audit.auditor.extract_nodes(definitions)[1]);objs,ext=typed.load(dn[DCAB],mesh)
    require(ext[1].endswith(ACAB),'original atlas external reference')
    rows=[]
    for pid,(c,t,b) in objs.items():
        if c!=114 or b'FlowerItemDetails' not in b or b'item_flower_' not in b[:100]:continue
        name,p=mesh.string(b,28)
        require(name.startswith('item_flower_') and name.endswith('.InventoryItemDefinitionAsset'),'flower definition name')
        item=mesh.u(b,p+36)
        # Pinned v3.0.1 FlowerItemDetails ends with SeedIcon,
        # GrownTroweledIcon and two Vector2 fields (16 bytes).
        for state,at in [(0,len(b)-40),(7,len(b)-28)]:
            fi,sp=mesh.ptr(b,at);require(fi==0 and objs[sp][0]==213,'local original Sprite')
            sc,st,sb=objs[sp];f=mesh.fields(st,sb);n=mesh.string(f['m_Name'])[0]
            require(n.endswith('_seed' if state==0 else '_troweled'),'native growth sprite name')
            require(struct.unpack('<4f',f['m_Rect'])==(0,0,256,256) and f['m_Border']==bytes(16),'logical sprite layout')
            ref=mesh.ptr(f['m_SpriteAtlas']);require(ref==[2,ATLAS],'native atlas reference')
            rows.append({'itemId':item,'state':state,'spritePathId':sp,'name':n,'key':f['m_RenderDataKey'].hex(),'definitionPathId':pid,'definitionSha256':sha(b),'spriteSha256':sha(sb),'atlasRef':ref})
    rows.sort(key=lambda r:(r['itemId'],r['state']))
    require(len(rows)==50 and len({r['itemId'] for r in rows})==25 and len({r['key'] for r in rows})==50,'growth coverage')
    del dn,objs
    ns=dict(audit.auditor.extract_nodes(atlas)[1]);objs,_=typed.load(ns[ACAB],mesh)
    c,t,b=objs[ATLAS];require(c==687078895,'SpriteAtlas')
    v=mesh.fields(t,b)['m_RenderDataMap'];count=mesh.u(v);p=4;wanted={bytes.fromhex(r['key']):r for r in rows};found=set()
    for _ in range(count):
        key=v[p:p+24];a=p+24;file,pid,af,ap=struct.unpack_from('<iqiq',v,a)
        rect=struct.unpack_from('<4f',v,a+24);offset=struct.unpack_from('<2f',v,a+40);down,flags,secondary=struct.unpack_from('<fII',v,a+72)
        require(secondary==0,'no secondary textures');p=a+84
        if key not in wanted:continue
        require(file==0 and af==ap==0 and down==1 and flags in (65,67) and key not in found,'atlas layout')
        wanted[key].update(texturePathId=str(pid),rect=list(rect),offset=list(offset),settings=flags);found.add(key)
    require(p==len(v) and len(found)==50,'atlas closure')
    textures={}
    for pid in {r['texturePathId'] for r in rows}:
        c,t,b=objs[pid];require(c==28,'Texture2D');f=mesh.fields(t,b)
        w,h,fmt,mips=[mesh.u(f[k]) for k in ('m_Width','m_Height','m_TextureFormat','m_MipCount')]
        require((w,h,fmt,mips)==(2048,2048,12,1),'original BC3 layout')
        off,z=struct.unpack_from('<QI',f['m_StreamData']);name,end=mesh.string(f['m_StreamData'],12)
        require(name==f'archive:/{ACAB}/{ACAB}.resS' and end==len(f['m_StreamData']) and z==w*h and off+z<=len(ns[ACAB+'.resS']),'texture stream bounds')
        payload=ns[ACAB+'.resS'][off:off+z]
        textures[pid]=Image.frombytes('RGBA',(w,h),payload,'bcn',3).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    require(len(textures)==25,'texture coverage')
    sheet=Image.new('RGBA',(960,480))
    for i,r in enumerate(rows):
        im=textures[r['texturePathId']];x,y,w,h=r['rect'];ox,oy=r['offset']
        box=(round(x),round(im.height-y-h),round(x+w),round(im.height-y))
        require(0<=box[0]<box[2]<=im.width and 0<=box[1]<box[3]<=im.height,'source crop bounds')
        crop=im.crop(box);tile=Image.new('RGBA',(256,256));tile.paste(crop,(round(ox),round(256-oy-h)))
        r['cropSha256']=sha(crop.tobytes());r['cell']=i
        sheet.paste(tile.resize((84,84),Image.Resampling.LANCZOS),((i%10)*96+6,(i//10)*96+6))
    out.mkdir(parents=True,exist_ok=True);file=out/'flower-growth-icons-v3.0.1.webp'
    sheet.save(file,lossless=True,method=6);payload=file.read_bytes()
    # Pin the exact verified v3.0.1 production bytes. A future source or
    # encoder change must regenerate and review both asset and manifest.
    require(sha(payload)=='f9160f0302ad5cffefe28a2ee5cc69e630be2735c0e83cf3bdb9982e7495f083','WebP identity')
    decoded=Image.open(file).convert('RGBA');require(decoded.size==sheet.size,'readback size')
    require(all(a[3]==b[3] and (not a[3] or a==b) for a,b in zip(sheet.getdata(),decoded.getdata())),'visible lossless readback')
    meta={'schema':'HKIA.FlowerGrowthArt.1','version':'3.0.1','definitionsSha256':D,'atlasSha256':A,'sheet':{'file':file.name,'sha256':sha(payload),'bytes':len(payload),'width':960,'height':480,'size':96,'columns':10},'rows':rows}
    raw=(json.dumps(meta,separators=(',',':'))+'\n').encode()
    require(sha(raw)=='bf99336e9eaf20de7d2f81f57f00fd2a514e59db03c2e161219f528fed59ff48','manifest identity')
    (out/'flower-growth-source-v3.0.1.json').write_bytes(raw)
    print('HKIA_FLOWER_GROWTH_ART_OK 50 original sprites')
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    extract((a.root/'definitions.bin').read_bytes(),(a.root/'atlas_global.bin').read_bytes(),a.out,module('extract-furniture-mesh-source'),module('extract-furniture-preview-camera'),module('audit-native-dye-materials'))

#!/usr/bin/env python3
"""Offline extraction of original named Steam 3.0.1 dynamic inventory sprites.
No recoloring, pose generation, private source binaries, or runtime game code.
Run with Pillow and the repository's existing UnityFS auditor.
"""
import argparse, hashlib, importlib.util, io, json, re, struct, zipfile
from pathlib import Path
HERE=Path(__file__).resolve().parent
SOURCE='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0'
DEFS_CAB='CAB-46b8f8fe122147493b3113f7c1c8cd0f'
BUNDLES=[
('ff8766e2fb7db4fe79bf97d784cd2b921bd39909bda5084704a8a54c95c12b2a','CAB-74ad1e87b7cedfbc92939f2992e234b7',491),
('93d60f24e34ce5171755f3c62b2c56bf1d0bdae95b95a27868e1430fa57219ed','CAB-9cc0c094b3c03b6f8a61756ff8691961',500),
('1b10f9a13780e64d818b8f7e63e1bbb3556c581166f79e617f0278ee8308ea09','CAB-0194c23e9b8fdfc4e5617a0fc627425a',498),
('e5aa630e9505c592bbe5dd5f50a19ace81b2eeb2f9ea89f3ed5b145bd9767990','CAB-6ec7f9f80f6c1846960a2777fc4d8383',499),
('ded8d18d55269804063a5dcbb9c3af84bf6f3f237b8ebd177fb8664ca58c8767','CAB-f322c8076a42ac78230a2c229aaed548',500),
('603c10035633ebcb238e9963931272d789349c571b0355534427f133b47b2f46','CAB-851d73dab83c7db991c480745ba1edf3',500),
('91d81548cb82ee644b8d1dac56d9c5475a6d97cc02cf864721086fa9194cc36f','CAB-d3b1ce02a0c82646a89db20ce33cfa75',500),
('99996f2e74375873d5e0b67afe9925bd61e852e66f1c755fdb35bc8557054962','CAB-99d8ed357c54d2de1c4478ddf662aa72',488),
('b1a004a18caa067c0056e8036b50429521d1616c4ca069483818a11348e3ceef','CAB-c82e9b36dce7250a0991914b25d8ec7c',481),
('a5e70b291e5d905ab4cbf30290c1f0162eca14f65a40712811965609d136e5cb','CAB-0a5a7fad4e0da9fa68bbdbff9635a190',498),
('577fe5d045fd708c555da918d474cfad6f0fc9f6c51ee59c3c050873d7d39054','CAB-af26a07ca1fa75966cce3a3478ae3a2a',390)]
def require(ok,reason):
    if not ok:raise ValueError(reason)
def sha(b):return hashlib.sha256(b).hexdigest()
def name(data,at=0):
    require(0<=at<=len(data)-4,'name bounds');n=struct.unpack_from('<I',data,at)[0]
    require(n<=512 and at+4+n<=len(data),'name length')
    return bytes(data[at+4:at+4+n]).decode('utf8'),(at+4+n+3)&~3
def ptr(data,at):
    require(0<=at<=len(data)-12,'PPtr bounds');f,p=struct.unpack_from('<iq',data,at);return f,str(p)
def definitions(objs):
    result={}
    for pid,(c,b) in objs.items():
        if c!=114:continue
        # Some MonoBehaviours are not definition assets. Inspect a bounded name first.
        if len(b)<32:continue
        size=struct.unpack_from('<I',b,28)[0]
        if size>512 or 32+size>len(b):continue
        nm,at=name(b,28);suf='.InventoryItemDefinitionAsset'
        if not(nm.startswith('item_') and nm.endswith(suf)):continue
        key=nm[:-len(suf)];guid,end=name(b,at)
        require(re.fullmatch('[0-9a-f]{32}',guid) and end==at+36,'definition GUID')
        item=struct.unpack_from('<I',b,end)[0]
        require(0<item<=0x7fffffff and key not in result,'item identity')
        shared=None
        if key.startswith('item_c_dyeable_'):
            f,shared=ptr(b,at+80);require(f==0 and objs.get(shared,(0,))[0]==213,'shared UiIcon')
        result[key]=(str(item),pid,shared)
    require(sum(k.startswith('item_c_dyeable_') for k in result)==5383,'native dye count')
    return result
def named(objs,c):
    pairs=[(name(b)[0],(pid,b)) for pid,(cls,b) in objs.items() if c==cls];r=dict(pairs)
    require(len(r)==len(pairs),'duplicate name');return r
def decode(data,res,cab,nm):
    from PIL import Image
    n,at=name(data);require(n==nm,'texture name')
    require(struct.unpack_from('<3i',data,at+4)==(256,256,65536) and struct.unpack_from('<i',data,at+20)[0]==12,'BC3 texture format')
    path=f'archive:/{cab}/{cab}.resS'.encode();pos=bytes(data).find(path)
    require(pos>=16 and pos+len(path)<=len(data),'stream path')
    off,size,length=struct.unpack_from('<QII',data,pos-16)
    require(size==65536 and length==len(path) and off+size<=len(res),'texture stream bounds')
    raw=res[off:off+size]
    header=b'DDS '+struct.pack('<7I',124,0x81007,256,256,size,0,1)+bytes(44)+struct.pack('<II4s5I',32,4,b'DXT5',0,0,0,0,0)+struct.pack('<5I',0x1000,0,0,0,0)
    image=Image.open(io.BytesIO(header+raw)).convert('RGBA').transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    require(image.getchannel('A').getextrema()[0]==0 and image.getchannel('A').getextrema()[1]>0,'transparent original')
    canvas=Image.new('RGBA',(96,96));canvas.paste(image.resize((84,84),Image.Resampling.LANCZOS),(6,6))
    out=io.BytesIO();canvas.save(out,format='WEBP',lossless=True,method=0,exact=True);encoded=out.getvalue()
    check=Image.open(io.BytesIO(encoded)).convert('RGBA');require(check.size==(96,96) and check.tobytes()==canvas.tobytes(),'lossless WebP')
    return encoded,sha(raw)
def load_helpers():
    spec=importlib.util.spec_from_file_location('material_audit',HERE/'audit-native-dye-materials.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def bundle(root,nm,digest,cab,helpers):
    paths=[p for p in (root/nm,root/(nm+'.bin')) if p.is_file()];require(len(paths)==1,'source bundle missing: '+nm)
    raw=paths[0].read_bytes();require(sha(raw)==digest,'source hash mismatch: '+nm)
    _,nodes=helpers.auditor.extract_nodes(raw);nodes=dict(nodes);require(cab in nodes and cab+'.resS' in nodes,'CAB mismatch')
    return {pid:(c,b) for c,pid,b,e in helpers.serialized_objects(nodes[cab],classes=(28,114,213)) if e=='<'},nodes[cab+'.resS']
def run(root,existing,out,helpers):
    require(out.resolve()!=HERE.parent and HERE.parent not in out.resolve().parents,'output outside repository required');out.mkdir(parents=True,exist_ok=True)
    defs=definitions(bundle(root,'definitions',SOURCE,DEFS_CAB,helpers)[0]);dye_ids={v[0] for k,v in defs.items() if k.startswith('item_c_dyeable_')}
    require(existing<=dye_ids and len(existing)==362,'existing original IDs')
    seen=set();dynamic=set();records={};packs=[];pending=[];bundles=[]
    def flush():
        if not pending:return
        filename=f'dynamic-colorways-{len(packs):02d}.zip';path=out/filename
        with zipfile.ZipFile(path,'w',compression=zipfile.ZIP_STORED) as z:
            for item,data,rec in pending:
                zi=zipfile.ZipInfo(item+'.webp',(1980,1,1,0,0,0));zi.compress_type=zipfile.ZIP_STORED;z.writestr(zi,data);rec['pack']=filename;records[item]=rec
        packs.append({'file':filename,'count':len(pending),'sha256':sha(path.read_bytes())});pending.clear()
    for i,(digest,cab,count) in enumerate(BUNDLES,1):
        nm=f'dynamicinventory_icons_{i:02d}';objs,res=bundle(root,nm,digest,cab,helpers);sprites,textures=named(objs,213),named(objs,28)
        require(len(sprites)==count and sprites.keys()==textures.keys(),'sprite/texture count');bundles.append({'name':nm,'sha256':digest,'cab':cab,'count':count})
        for sn,(sid,sprite) in sorted(sprites.items()):
            require(sn.startswith('icon_') and sn[5:] in defs and sn not in seen,'unknown/duplicate sprite');seen.add(sn)
            key=sn[5:];item,did,shared=defs[key];tid,tex=textures[sn];_,at=name(sprite)
            require(struct.unpack_from('<4f',sprite,at)==(0.,0.,256.,256.) and ptr(sprite,at+100)==(0,tid),'sprite/texture PPtr')
            if not key.startswith('item_c_dyeable_'):continue
            require(item not in dynamic and sid!=shared,'duplicate dye ID');dynamic.add(item)
            if item in existing:continue
            encoded,h=decode(tex,res,cab,sn)
            pending.append((item,encoded,{'file':item+'.webp','sha256':sha(encoded),'itemKey':key,'definitionPathId':did,'sharedUiIconPathId':shared,'sourceSpritePathId':sid,'sourceSpriteName':sn,'texturePathId':tid,'textureName':sn,'textureSha256':h,'sourceKind':'dynamic','sourceSpriteBundle':nm,'sourceBundleSha256':digest}))
            if len(pending)==144:flush()
        print(nm,len(sprites),'new',len(records)+len(pending),flush=True)
    flush();require(len(seen)==5345 and len(dynamic)==5344 and len(dynamic|existing)==5383 and len(records)==5021 and set(records)==dye_ids-existing,'complete original coverage')
    index={'schema':'HKIA.DynamicOriginalColorways.1','version':'3.0.1','definitionsSha256':SOURCE,'sourceBundles':bundles,'packs':packs,'records':records,'originalDynamicCount':len(dynamic),'existingOriginalCount':len(existing),'coveredDyeItemCount':len(dynamic|existing),'runtimeUiIconReferenceMatches':False}
    (out/'dynamic-colorways-index.json').write_text(json.dumps(index,separators=(',',':'))+'\n');print('EXTRACTED',len(records),'PACKS',len(packs),'COVERAGE',len(dynamic|existing),flush=True)
def self_test():
    assert name(struct.pack('<I',3)+b'abc\x00')==('abc',8)
    assert ptr(struct.pack('<iq',0,-1234567890123456789),0)==(0,'-1234567890123456789')
    assert sum(x[2] for x in BUNDLES)==5345
    print('DYNAMIC_ORIGINAL_SELFTEST_OK')
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--bundles',type=Path);p.add_argument('--existing-index',type=Path);p.add_argument('--out',type=Path);p.add_argument('--self-test',action='store_true');a=p.parse_args()
    if a.self_test:self_test()
    elif a.bundles and a.existing_index and a.out:
        idx=json.loads(a.existing_index.read_text());require(idx['definitionsSha256']==SOURCE,'existing index source');run(a.bundles,set(idx['records']),a.out,load_helpers())
    else:p.error('provide --bundles, --existing-index and --out')

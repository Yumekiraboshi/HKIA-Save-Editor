#!/usr/bin/env python3
"""Batch render source-pinned rigid headwear. Unlit diagnostic only.
Reuse the native dye and triangle raster code; no game binaries or previews
are written into the repository. Requires NumPy and Pillow for source runs.
"""
import argparse
import importlib.util
import io
import json
import re
import struct
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
MANIFEST = ROOT / "data/unityfs-audit/native-rigid-headwear.v3.0.1.json"
spec = importlib.util.spec_from_file_location("rigid_projection", HERE / "render-native-rigid-icon.py")
projection = importlib.util.module_from_spec(spec)
spec.loader.exec_module(projection)
source = projection.source
require = source.require
CAB = source.CAB

def read_string(data, at):
    require(0 <= at <= len(data)-4, "string bounds")
    n = struct.unpack_from("<I", data, at)[0]
    require(n <= 512 and at+4+n <= len(data), "string length")
    return data[at+4:at+4+n].decode("utf8"), (at+4+n+3)&~3

def ptr(data, at=0):
    require(0 <= at <= len(data)-12, "PPtr bounds")
    file, path = struct.unpack_from("<iq", data, at)
    return file, str(path)

def offsets(channels):
    require(len(channels)==14 and channels[:3]==[(0,0,0,3),(0,12,1,52),(0,20,1,4)], "unsupported vertex format")
    require(channels[3] in ((0,0,0,0),(0,28,2,4)), "unsupported vertex color")
    uv = 28 if channels[3][3]==0 else 32
    require(channels[4]==(0,uv,1,2) and not any(any(c) for c in channels[5:]), "unsupported UV layout")
    return uv, uv+4

def mesh(data, res):
    import numpy as np
    name, p = read_string(data,0)
    require(struct.unpack_from("<I",data,p)[0]==1,"single submesh required")
    p+=4
    first,n,topology,base,firstv,count=struct.unpack_from("<6I",data,p)
    p+=48
    require((first,topology,base,firstv)==(0,0,0,0) and 0<count<=65535 and 0<n<=3_000_000 and n%3==0,"triangle layout")
    require(data[p:p+44]==bytes(44),"compressed or skinned mesh unsupported")
    p+=44
    size=struct.unpack_from("<I",data,p)[0]
    p+=4
    require(size==n*2 and p+size<=len(data),"index bounds")
    idx=np.frombuffer(data[p:p+size],dtype="<u2").reshape(-1,3)
    p=(p+size+3)&~3
    v,c=struct.unpack_from("<II",data,p)
    p+=8
    require(v==count and c==14 and idx.max()<v,"vertex and index counts")
    channels=[tuple(data[p+i*4:p+i*4+4]) for i in range(c)]
    p+=4*c
    uv_offset,stride=offsets(channels)
    require(struct.unpack_from("<I",data,p)[0]==0,"inline vertices unsupported")
    path=f"archive:/{CAB}/{CAB}.resS".encode()
    at=data.rfind(path)
    require(at>=p+16,"stream path")
    off,size,length=struct.unpack_from("<QII",data,at-16)
    require(length==len(path) and size==v*stride and off+size<=len(res),"vertex stream bounds")
    raw=res[off:off+size]
    def attr(offset,n,dtype):
        return np.ndarray((v,n),dtype=dtype,buffer=raw,offset=offset,strides=(stride,np.dtype(dtype).itemsize)).astype(float)
    pos,uv,nor,tan=attr(0,3,"<f4"),attr(uv_offset,2,"<f2"),attr(12,3,"<f2"),attr(20,4,"<f2")
    require(all(np.isfinite(a).all() for a in (pos,uv,nor,tan)) and np.all(np.abs(tan[:,3])==1),"invalid attributes")
    return pos,uv,idx,{"vertices":v,"triangles":n//3,"stride":stride,"meshSha256":source.sha(data),"vertexSha256":source.sha(raw)}

def texture(data,res):
    from PIL import Image
    info=source.material_audit.texture_stream(data,"<")
    w,h=info["width"],info["height"]
    require(w==h and w in (256,512) and info["streamPath"]==f"archive:/{CAB}/{CAB}.resS","texture layout")
    bc1=info["format"]=="BC1/DXT1"
    require(bc1 or info["format"]=="BC3/DXT5","texture format")
    off=info["streamOffset"]
    size=w*h//(2 if bc1 else 1)
    require(size<=info["compressedBytes"] and off+info["compressedBytes"]<=len(res),"texture bounds")
    raw=res[off:off+size]
    header=b"DDS "+struct.pack("<7I",124,0x81007,h,w,size,0,1)+bytes(44)+struct.pack("<II4s5I",32,4,b"DXT1" if bc1 else b"DXT5",0,0,0,0,0)+struct.pack("<5I",0x1000,0,0,0,0)
    return Image.open(io.BytesIO(header+raw)).convert("RGBA"),{"name":info["name"],"format":info["format"],"sha256":source.sha(raw)}

def property_offset(data,key):
    mark=struct.pack("<I",len(key))+key.encode()
    at=data.find(mark)
    require(at>=0 and data.find(mark,at+len(mark))<0,"material property "+key)
    return (at+len(mark)+3)&~3

def unique_ptr(data, target, start, end):
    return sum(ptr(data,p)==(0,target) for p in range(start,min(end,len(data)-11),4))==1

def validate_item(item,outfit_id,shared,objects):
    data=objects[item["definition"]][1]
    key,p=read_string(data,28)
    require(key==item["key"]+".InventoryItemDefinitionAsset","item name")
    guid,p=read_string(data,p)
    require(bool(re.fullmatch("[0-9a-f]{32}",guid)) and struct.unpack_from("<I",data,p)[0]==item["id"],"item identity")
    at=data.find(b"OutfitItemDetails")
    require(at>=0 and unique_ptr(data,outfit_id,(at+len("OutfitItemDetails")+3)&~3,at+116),"outfit reference")
    outfit=objects[outfit_id][1]
    require(read_string(outfit,28)[0].startswith("Outfit.HeadAccessory.") and unique_ptr(outfit,shared,32,len(outfit)),"shared outfit reference")

def run(bundle,out):
    from PIL import Image
    import numpy as np
    raw=bundle.read_bytes()
    require(source.sha(raw)==source.SOURCE,"unsupported definitions version")
    _,nodes=source.auditor.extract_nodes(raw)
    nodes=dict(nodes)
    res=nodes[CAB+".resS"]
    objects={pid:(cls,data) for cls,pid,data,endian in source.material_audit.serialized_objects(nodes[CAB],classes=(1,21,23,28,33,43,114)) if endian=="<"}
    manifest=json.loads(MANIFEST.read_text())
    palettes=json.loads((ROOT/"public/native-dye-palettes.json").read_text())
    require(manifest["definitionsSha256"]==palettes["definitions_sha256"]==source.SOURCE,"source version mismatch")
    out=out.resolve()
    require(out!=ROOT and ROOT not in out.parents,"output must be outside repository")
    out.mkdir(parents=True,exist_ok=True)
    report=[]
    for family in manifest["families"]:
        shared,go,mesh_id,mat_id=(family[k] for k in ("shared","go","mesh","material"))
        require([objects[x][0] for x in (shared,go,mesh_id,mat_id)]==[114,1,43,21],"source classes")
        shared_name,_=read_string(objects[shared][1],28)
        data=objects[go][1]
        n=struct.unpack_from("<I",data)[0]
        require(0<n<64 and read_string(data,4+12*n+4)[0]==shared_name,"shared/GameObject name association")
        refs=[ptr(data,4+i*12) for i in range(n)]
        require(all(f==0 for f,p in refs),"external component")
        filters=[objects[p][1] for f,p in refs if p in objects and objects[p][0]==33]
        renderers=[objects[p][1] for f,p in refs if p in objects and objects[p][0]==23]
        require(len(filters)==len(renderers)==1 and ptr(filters[0])==ptr(renderers[0])==(0,go) and ptr(filters[0],12)==(0,mesh_id) and struct.unpack_from("<I",renderers[0],72)[0]==1 and ptr(renderers[0],76)==(0,mat_id),"renderer binding")
        mat=objects[mat_id][1]
        material=source.material_audit.material_properties(mat,"<")
        require(material["name"]==shared_name and material["shader"]=={"fileId":0,"pathId":source.SHADER},"native shader binding")
        pos,uv,idx,info=mesh(objects[mesh_id][1],res)
        require(all(info[k]==family[k] for k in ("vertices","triangles","stride")),"mesh evidence mismatch")
        images={};maps={}
        for key in ("_BaseMap","_PatternMap","_BumpMap","_ComboMap"):
            ref=material["textures"][key]
            pid=ref["pathId"]
            require(ref["fileId"]==0 and ref["scale"]==[1.,1.] and ref["offset"]==[0.,0.] and objects[pid][0]==28,"native texture binding")
            images[key],maps[key]=texture(objects[pid][1],res)
            maps[key]["pathId"]=pid
        defaults=[struct.unpack_from("<4f",mat,property_offset(mat,f"_PaletteColor{i}"))[:3] for i in range(1,6)]
        # Geometry and UV coverage are shared by all variants. Diagnostic view,
        # not a recovered game camera or a per-family calibrated light.
        mask,coords=projection.raster(pos,uv,idx,340,15,128)
        ids=[]
        for item in family["items"]:
            validate_item(item,family["outfit"],shared,objects)
            colors=palettes["records"][str(item["id"])]["colors"]
            require(len(colors)==5 and all(c is None or re.fullmatch("#[0-9a-f]{6}",c) for c in colors),"native palette")
            p=np.array([tuple(int(c[j:j+2],16)/255 for j in (1,3,5)) if c is not None else defaults[i] for i,c in enumerate(colors)])
            im=projection.albedo_image(coords,mask,images["_BaseMap"],images["_PatternMap"],p)
            im.transpose(Image.Transpose.FLIP_LEFT_RIGHT).save(out/(str(item["id"])+".png"))
            ids.append(item["id"])
        report.append({"family":family["name"],**info,"maps":maps,"itemIds":ids})
    result={"schema":"HKIA.NativeHeadwearBatchReport.1","families":report,"generated":sum(len(x["itemIds"]) for x in report),"nativeIconVerified":False}
    (out/"report.json").write_text(json.dumps(result,indent=2)+"\n")
    print(json.dumps(result,indent=2))

def self_test():
    base=[(0,0,0,3),(0,12,1,52),(0,20,1,4)]
    assert offsets(base+[(0,0,0,0),(0,28,1,2)]+[(0,0,0,0)]*9)==(28,32)
    assert offsets(base+[(0,28,2,4),(0,32,1,2)]+[(0,0,0,0)]*9)==(32,36)
    try: offsets(base+[(0,0,0,0),(0,32,1,2)]+[(0,0,0,0)]*9)
    except ValueError: pass
    else: raise AssertionError("unsupported vertex layout accepted")
    manifest=json.loads(MANIFEST.read_text())
    ids=[i["id"] for f in manifest["families"] for i in f["items"]]
    assert len(ids)==len(set(ids))==22 and not manifest["nativeIconVerified"]
    print("NATIVE_HEADWEAR_BATCH_SELFTEST_OK")

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("definitions",type=Path,nargs="?")
    parser.add_argument("--out",type=Path)
    parser.add_argument("--self-test",action="store_true")
    args=parser.parse_args()
    if args.self_test:self_test()
    elif args.definitions and args.out:run(args.definitions,args.out)
    else:parser.error("original definitions and external output directory required")

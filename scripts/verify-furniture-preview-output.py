#!/usr/bin/env python3
"""Read-only verification of Steam 3.0.1 preview output shader metadata.
No shader binaries or token lists are emitted. Original files required."""
import argparse
import hashlib
import importlib.util
import json
import struct
from pathlib import Path
spec=importlib.util.spec_from_file_location("native",Path(__file__).with_name("audit-native-character-shader.py"))
native=importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
require=native.require
sha=native.sha
def objects(raw):
    """Pinned v22 little-endian stripped SerializedFile (no type trees).
    Unlike type-tree bundles, these records have no type dependency array."""
    require(len(raw)>=48 and raw[16]==0 and struct.unpack_from(">I",raw,8)[0]==22,"serialized version")
    size,base=struct.unpack_from(">QQ",raw,24)
    require(size==len(raw) and 48<=base<=size,"serialized bounds")
    _,p=native.auditor.cstring(raw,48)
    p+=4
    require(raw[p]==0,"unexpected type trees")
    r=native.Reader(raw,p+1)
    count=r.take("I")
    require(0<count<=512,"types")
    types=[]
    for _ in range(count):
        cls=r.take("i")
        r.take("Bh")
        r.pos+=16+(16 if cls==114 or cls<0 else 0)
        require(r.pos<=base,"type bounds")
        types.append(cls)
    count=r.take("I")
    r.align()
    require(count<=2_000_000 and r.pos+24*count<=base,"object table")
    out={}
    for _ in range(count):
        pid,start,length,index=r.take("qqIi")
        require(0<=index<len(types) and 0<=start<=size-base and length<=size-base-start,"object bounds")
        require(pid not in out,"duplicate PathID")
        out[pid]=(types[index],raw[base+start:base+start+length])
    return out
def shader_programs(obj,name,offset,digest,table_count):
    require(sha(obj)==digest,"Shader object digest")
    r=native.Reader(obj,offset)
    require(r.string()==name,"Shader name")
    r.string();r.string()
    r.array(lambda:(r.string(),r.string()))
    r.array(lambda:(r.string(),r.string()))
    r.take("B");r.align()
    require(r.array(lambda:r.take("I"))==[4],"D3D platform")
    offsets,sizes,expanded=[r.array(lambda:r.array(lambda:r.take("I"))) for _ in range(3)]
    n=r.take("I")
    require(offsets==[[0]] and sizes==[[n]] and len(expanded)==1 and len(expanded[0])==1 and 0<n<=1_000_000 and r.pos+n<=len(obj),"compressed blob")
    require(0<expanded[0][0]<=2_000_000,"expanded size")
    data=native.auditor.decompress(obj[r.pos:r.pos+n],expanded[0][0],2)
    count=struct.unpack_from("<I",data)[0]
    require(count==table_count and 4+12*count<=len(data),"program table")
    pixels={}
    for i in range(count):
        off,length,segment=struct.unpack_from("<III",data,4+12*i)
        require(segment==0 and 4+12*count<=off<=len(data) and length<=len(data)-off,"program range")
        block=data[off:off+length]
        programs=native.containers(block)
        if not programs:continue
        require(len(programs)==1,"multiple program containers")
        p=programs[0]
        if p["stage"]!="pixel":continue
        dxbc=block[p["offset"]:p["offset"]+p["bytes"]]
        for co in struct.unpack_from("<"+"I"*struct.unpack_from("<I",dxbc,28)[0],dxbc,32):
            tag,z=struct.unpack_from("<4sI",dxbc,co)
            if tag in (b"SHDR",b"SHEX"):
                words=struct.unpack_from("<"+"I"*(z//4),dxbc,co+8)
                pixels[i]=(p["sha256"],words)
    return pixels
def instructions(w):
    require(len(w)==w[1],"token length")
    i=2
    while i<len(w):
        n=(w[i]>>24)&127
        require(0<n<=len(w)-i,"instruction length")
        yield w[i:i+n]
        i+=n
def audit(ui_path,global_path):
    ui=ui_path.read_bytes();g=global_path.read_bytes()
    require(sha(ui)=="eb7f63183efd494b0bd771eea9167f2c474eef8f6783fafacdbc2b1a4efd72c5","unsupported built-in source")
    require(sha(g)=="2e0b45213e7b65120e5aa72f5e1dd708e46abcc61ff9ceb2645d6f2e055227d6","unsupported global source")
    u,gs=objects(ui),objects(g)
    def get(m,p):
        cls,obj=m[p];require(cls==48,"expected Shader");return obj
    ui=shader_programs(get(u,10770),"UI/Default",4356,"a8da56f17f00be27d3e65bb088f4b58b2ca75621bc1c4573fae3f389335fc91c",11)
    uber=shader_programs(get(gs,58),"Sunblink/Lynx/UberPost",4768,"b96ae41f3f2908db726770c0cf906a715b12741acaaebeecf070c148adf55b00",60)
    final=shader_programs(get(gs,78),"Hidden/Universal Render Pipeline/FinalPost",8532,"8d2e4aca56f0435ea89d11c2f05242ae5412286b7de114588f9ab0c8d0686451",140)
    require(set(ui)=={7,8,9,10} and set(uber)==set(range(6,60)) and set(final)==set(range(26,74))|set(range(92,140)),"program coverage")
    digest,w=ui[7]
    require(digest=="c3f5aa2458cbf03ed2afacc862a26ba8af0cff47b8844409b688d6fb3835d5f0" and len(w)==85,"UI program")
    require(sha(struct.pack("<61I",*w[24:85]))=="82ff2afeb30f2ebc7ad4c6e3f47b99c5e67fcd89237aeffee21147cd55b3b357","UI output block")
    for _,w in uber.values():
        ins=list(instructions(w))
        require(ins[-2]==(0x05000036,0x102082,0,0x10003a,0),"UberPost output alpha")
        writes=[i for i in ins if len(i)>2 and (i[0]&2047)<88 and ((i[1]>>12)&255)==0 and i[1]&0x80 and i[2]==0]
        require(len(writes)==1 and (writes[0][0]&2047)==74 and writes[0][1:3]==(0x1000f2,0) and writes[0][6:8]==(0x107e46,0),"UberPost sampled alpha")
    for _,w in final.values():
        require(list(instructions(w))[-2]==(0x05000036,0x102082,0,0x4001,0x3f800000),"FinalPost output alpha")
    return {"schema":"HKIA.FurniturePreviewOutputAudit.1","version":"3.0.1","uiDefaultProgram":ui[7][0],"uberPostPreservesSampledAlpha":len(uber),"finalPostWritesOne":len(final),"runtimePassSelectionVerified":False,"nativeIconRenderVerified":False}
if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("unity_builtin_extra",type=Path)
    p.add_argument("globalgamemanagers_assets",type=Path)
    a=p.parse_args()
    print(json.dumps(audit(a.unity_builtin_extra,a.globalgamemanagers_assets),indent=2))

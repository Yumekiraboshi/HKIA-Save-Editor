#!/usr/bin/env python3
"""Recheck 30 original Shader dye blocks and optionally generate a *UV-space*
Plaid Dress material diagnostic. This does not publish or register an icon.
Original definitions bundle must remain outside the repository.
"""
import argparse
import collections
import importlib.util
import io
import json
import random
import struct
from pathlib import Path
from native_dye_albedo import BLOCKS, dye_albedo, evaluate_block, get_dye_block

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location("shader_audit",HERE/"audit-native-character-shader.py")
source=importlib.util.module_from_spec(spec);spec.loader.exec_module(source)
require=source.require

def verified_bindings(shader):
    require(source.sha(shader)==source.OBJECT_SHA,"Shader identity")
    r=source.Reader(shader,1932)
    names={index:name for name,index in r.array(lambda:(r.string(),r.take("i")),39)}
    require(len(names)==39,"native name table")
    r=source.Reader(shader,6512)
    textures={names[n]:(t,s) for n,t,s,_ in r.array(lambda:r.take("4i"),4)}
    require(textures=={"_BaseMap":(0,0),"_BumpMap":(1,1),"_ComboMap":(2,2),"_PatternMap":(3,3)},"native texture register mismatch")
    r=source.Reader(shader,6768)
    colors={names[n]:offset//16 for n,offset,zero,flags in [r.take("4i") for _ in range(5)]}
    require(colors=={f"_PaletteColor{i}":i for i in range(1,6)},"native palette register mismatch")
    return {"textures":textures,"paletteRegisters":colors}

def validate_programs(shader):
    decoded=[];segments=source.shader_segments(shader,decoded)
    counts=collections.Counter();examples={};rng=random.Random(1);worst=0.;tested=0
    for data,segment in zip(decoded,segments):
        for meta in segment["programs"]:
            if meta["stage"]!="pixel":continue
            off=meta["offset"];v=get_dye_block(data[off:off+meta["bytes"]])
            if v is None:continue
            digest,block=v;counts[digest]+=1;examples[digest]=block
            for _ in range(100):
                base=[rng.random() for _ in range(3)]
                pattern=[rng.random() for _ in range(4)]
                alpha=rng.random()
                palette=[[rng.random() for _ in range(3)] for _ in range(5)]
                predicted=dye_albedo(base,pattern,alpha,palette)
                actual=evaluate_block(block,base,pattern,alpha,palette)
                worst=max(worst,max(abs(a-b) for a,b in zip(predicted,actual)));tested+=1
    require(counts=={k:15 for k in BLOCKS} and tested==3000 and worst<=1e-12,"native dye mismatch")
    return {"programBlocks":dict(counts),"samples":tested,"maximumAbsoluteError":worst},examples

def plaid_preview(objects,res,examples,out):
    # Pillow is only needed for this opt-in local texture-space diagnostic.
    # Never treat raw texture bytes as proven GPU color-space conversion.
    from PIL import Image
    material=objects["-8965149479766376611"]
    parsed=source.material_audit.material_properties(material,"<")
    require(parsed["name"]=="BasicStyle_FullBody_PlaidDress" and parsed["shader"]=={"fileId":0,"pathId":source.SHADER},"Plaid material")
    expected={"_BaseMap":"976939271832205073","_PatternMap":"1907130521456972212","_ComboMap":"4132832411019321503"}
    images={};hashes={}
    for key,pid in expected.items():
        ref=parsed["textures"][key]
        require(ref["fileId"]==0 and ref["pathId"]==pid and ref["scale"]==[1.,1.] and ref["offset"]==[0.,0.],"Plaid map binding")
        t=source.material_audit.texture_stream(objects[pid],"<")
        require(t["width"]==t["height"]==512 and t["streamPath"]==f"archive:/{source.CAB}/{source.CAB}.resS","Plaid map dimensions")
        size=512*512*(8 if t["format"]=="BC1/DXT1" else 16)//16
        offset=t["streamOffset"]
        require(size<=t["compressedBytes"] and offset+t["compressedBytes"]<=len(res),"texture bounds")
        raw=res[offset:offset+size];hashes[key]=source.sha(raw)
        header=b"DDS "+struct.pack("<7I",124,0x81007,512,512,size,0,1)+bytes(44)+struct.pack("<II4s5I",32,4,b"DXT1" if t["format"]=="BC1/DXT1" else b"DXT5",0,0,0,0,0)+struct.pack("<5I",0x1000,0,0,0,0)
        images[key]=Image.open(io.BytesIO(header+raw)).convert("RGBA")
    palettes=json.loads((HERE.parent/"public/native-dye-palettes.json").read_text())
    require(palettes["definitions_sha256"]==source.SOURCE,"palette source")
    record=palettes["records"]["1702010655"]
    require(record=={"dye":422,"colors":["#d30138","#212326","#292231","#212326",None]},"source Plaid palette")
    # Confirm absent fifth value is the actual source Material default.
    marker=struct.pack("<I",14)+b"_PaletteColor5"
    pos=material.find(marker)
    require(pos>=0 and material.find(marker,pos+len(marker))<0,"palette default")
    pos=(pos+len(marker)+3)&~3
    default=struct.unpack_from("<4f",material,pos)
    require(default==(1.,1.,1.,1.),"source default changed")
    palette=[tuple(int(c[i:i+2],16)/255 for i in (1,3,5)) if c else default[:3] for c in record["colors"]]
    base=list(images["_BaseMap"].getdata());pattern=list(images["_PatternMap"].getdata())
    result=[];changed=0
    for b,p in zip(base,pattern):
        rgb=dye_albedo([v/255 for v in b[:3]],[v/255 for v in p],b[3]/255,palette)
        pixel=tuple(round(v*255) for v in rgb)
        result.append(pixel);changed+=int(pixel!=b[:3])
    worst=0.;rng=random.Random(7)
    for _ in range(256):
        i=rng.randrange(len(base));b=base[i];p=pattern[i]
        args=([v/255 for v in b[:3]],[v/255 for v in p],b[3]/255,palette)
        predicted=dye_albedo(*args)
        for block in examples.values():
            actual=evaluate_block(block,*args);worst=max(worst,max(abs(a-b) for a,b in zip(predicted,actual)))
    require(worst<=1e-12,"native texture evaluation mismatch")
    image=Image.new("RGB",(512,512));image.putdata(result)
    # Avoid writing into repository or dist; diagnostic only.
    out=out.resolve()
    require(HERE.parent.resolve() not in out.parents and out.suffix==".png","output must be outside repository")
    image.save(out)
    return {"itemId":1702010655,"textureBaseMipSha256":hashes,"samples":512,
            "maximumAbsoluteError":worst,"changedTexelsAfterQuantization":changed,
            "renderFidelity":"uv-diagnostic-unverified-gpu-color-space"}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("definitions",type=Path)
    p.add_argument("--plaid-preview",type=Path);args=p.parse_args()
    raw=args.definitions.read_bytes();require(source.sha(raw)==source.SOURCE,"source version")
    _,nodes=source.auditor.extract_nodes(raw);nodes=dict(nodes)
    objects={pid:blob for cls,pid,blob,endian in source.material_audit.serialized_objects(nodes[source.CAB],classes=(21,28,48)) if endian=="<"}
    shader=objects[source.SHADER];bindings=verified_bindings(shader);proof,examples=validate_programs(shader)
    report={"sourceSha256":source.SOURCE,"bindings":bindings,"proof":proof,"nativeIconVerified":False}
    if args.plaid_preview:report["preview"]=plaid_preview(objects,nodes[source.CAB+".resS"],examples,args.plaid_preview)
    print(json.dumps(report,indent=2))

if __name__=="__main__":main()

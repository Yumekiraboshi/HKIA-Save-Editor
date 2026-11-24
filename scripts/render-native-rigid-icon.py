#!/usr/bin/env python3
"""Source-pinned rigid mesh diagnostic. Not a finished game icon.
Optional local dependencies: numpy, Pillow. Do not publish source bundles
or diagnostic renders. Only this known Steam 3.0.1 layout is supported.
"""
import argparse
import hashlib
import importlib.util
import io
import json
import math
import struct
from pathlib import Path
from native_dye_albedo import dye_albedo

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location("shader_audit",HERE/"audit-native-character-shader.py")
source=importlib.util.module_from_spec(spec);spec.loader.exec_module(source)
require=source.require
MESH="-8218739919101907736"
MATERIAL="-7633722947615229647"
DEFINITION="-7754450116206399698"
ITEM=528610065
MESH_HASH="589417b1fdbeea9a16d94d8c4ee87d1de1df0539cb58327286a077d567016b3b"
VERTEX_HASH="ea306085a8201813af9aea3429b55d9d7f16b5ec7c146af9f556d3da28d7a7a7"
MAPS={"_BaseMap":("-8578655718472704743","3d9c4926322515f2258d4d846490d8fae5e271410c94513f81f0509e6af89ef3"),
      "_PatternMap":("2381211061380412669","385a97000611b850be611feba065d66012d16aff5f6db41513c5b180cbb7997d")}
REF=("6452111662207502475","195388bd41f79085e63636ec8eff41f0d5d3c65833e9dc5efd8e8d82c99d8f60")
PALETTE=["#e96b25","#423b4b","#e060da","#7f3bbe","#e9ca5e"]

def ptr(blob,at):
    require(0<=at<=len(blob)-12,"PPtr bounds")
    f,p=struct.unpack_from("<iq",blob,at)
    return f,str(p)

def mesh_layout(o,res):
    """Decode this verified uncompressed, single-submesh rigid layout."""
    r=source.Reader(o)
    require(r.string()=="Shared_HeadAccessory_WitchHat","mesh name")
    sub=r.array(lambda:r.take("6I6f"),1)
    require(len(sub)==1 and sub[0][:6]==(0,5964,0,0,0,1320),"submesh layout")
    # Six empty blendshape/bindpose arrays, root hash, bones and weights.
    require(all(r.take("I")==0 for _ in range(9)),"unsupported skin/morph layout")
    require(r.take("4B")[0]==0 and r.take("I")==0,"mesh compression or index format")
    n=r.take("I")
    require(n==11928 and r.pos+n<=len(o),"mesh index bounds")
    indices=o[r.pos:r.pos+n];r.pos+=n
    count=r.take("I");channels=r.array(lambda:r.take("4B"),14)
    require(count==1320 and len(channels)==14 and r.take("I")==0,"vertex layout")
    require(channels[:5]==[(0,0,0,3),(0,12,1,52),(0,20,1,4),(0,28,2,4),(0,32,1,2)] and
            all(c==(0,0,0,0) for c in channels[5:]),"unsupported channel layout")
    p=o.rfind(b"archive:")
    require(p>=r.pos+16,"stream reference")
    off,size,length=struct.unpack_from("<QII",o,p-16)
    require(length==87 and p+length<=len(o) and
            o[p:p+length].decode()==f"archive:/{source.CAB}/{source.CAB}.resS","stream path")
    require(size==count*36 and off+size<=len(res),"vertex stream bounds")
    raw=res[off:off+size]
    require(source.sha(raw)==VERTEX_HASH,"vertex stream hash")
    require(max(struct.unpack("<5964H",indices))<count,"index out of range")
    return count,indices,raw

def texture(obj,res,pid,digest):
    from PIL import Image
    t=source.material_audit.texture_stream(obj,"<")
    w,h=t["width"],t["height"]
    require(t["format"]=="BC3/DXT5" and w==h and w in (256,512),"texture format")
    require(t["streamPath"]==f"archive:/{source.CAB}/{source.CAB}.resS","texture stream")
    off=t["streamOffset"];size=w*h
    require(size<=t["compressedBytes"] and off+t["compressedBytes"]<=len(res),"texture bounds")
    raw=res[off:off+size]
    require(source.sha(raw)==digest,"base mip fingerprint "+pid)
    header=b"DDS "+struct.pack("<7I",124,0x81007,h,w,size,0,1)+bytes(44)+struct.pack("<II4s5I",32,4,b"DXT5",0,0,0,0,0)+struct.pack("<5I",0x1000,0,0,0,0)
    return Image.open(io.BytesIO(header+raw)).convert("RGBA")

def raster(pos,uv,idx,yaw,pitch,N):
    """Orthographic triangle z-buffer; camera is an experimental parameter."""
    import numpy as np
    yaw,pitch=np.deg2rad([yaw,pitch])
    right=np.array([np.cos(yaw),0,-np.sin(yaw)])
    forward=np.array([np.sin(yaw)*np.cos(pitch),np.sin(pitch),np.cos(yaw)*np.cos(pitch)])
    up=np.cross(forward,right)
    v=pos@np.stack([right,-up,forward]).T
    lo=v[:,:2].min(0);hi=v[:,:2].max(0)
    xy=(v[:,:2]-(lo+hi)/2)*(N*.85/max(hi-lo))+N/2
    z=np.full((N,N),-np.inf);uvimg=np.zeros((N,N,2))
    for tri in idx:
        p=xy[tri];d=v[tri,2];a,b,c=p
        x0=max(0,int(np.floor(p[:,0].min())));x1=min(N,int(np.ceil(p[:,0].max())))
        y0=max(0,int(np.floor(p[:,1].min())));y1=min(N,int(np.ceil(p[:,1].max())))
        Y,X=np.mgrid[y0:y1,x0:x1]+.5
        den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(den)<1e-9:continue
        w0=((b[1]-c[1])*(X-c[0])+(c[0]-b[0])*(Y-c[1]))/den
        w1=((c[1]-a[1])*(X-c[0])+(a[0]-c[0])*(Y-c[1]))/den
        w2=1-w0-w1;dep=w0*d[0]+w1*d[1]+w2*d[2]
        region=z[y0:y1,x0:x1]
        ok=(w0>=-1e-7)&(w1>=-1e-7)&(w2>=-1e-7)&(dep>region)
        region[ok]=dep[ok]
        uvimg[y0:y1,x0:x1][ok]=(w0[...,None]*uv[tri[0]]+w1[...,None]*uv[tri[1]]+w2[...,None]*uv[tri[2]])[ok]
    return np.isfinite(z),uvimg

def albedo_image(coords,mask,base,pattern,p):
    import numpy as np
    from PIL import Image
    def sample(im):
        arr=np.asarray(im)/255;h,w=arr.shape[:2]
        x=np.floor((coords[:,:,0]%1)*w).astype(int)
        y=np.floor((coords[:,:,1]%1)*h).astype(int)
        return arr[y,x]
    b=sample(base);t=sample(pattern)
    q=np.broadcast_to(p[0],b[:,:,:3].shape).copy()
    for i in range(3):q+=(p[i+1]-q)*t[:,:,i,None]
    q=p[4]+(q-p[4])*t[:,:,3,None]
    rgb=b[:,:,:3]+(b[:,:,:3]*q-b[:,:,:3])*b[:,:,3,None]
    # Validate the vectorized path against the shared scalar implementation.
    for y,x in np.argwhere(mask)[::max(1,int(mask.sum())//64)]:
        require(np.allclose(rgb[y,x],dye_albedo(b[y,x,:3],t[y,x],b[y,x,3],p),rtol=0,atol=1e-12),"albedo mismatch")
    return Image.fromarray(np.uint8(np.clip(np.dstack((rgb,mask))*255,0,255)),"RGBA")

def normalize(im):
    import numpy as np
    from PIL import Image
    box=im.getchannel("A").point(lambda x:255 if x>=128 else 0).getbbox()
    require(box is not None,"empty projection")
    im=im.crop(box);im.thumbnail((82,82),Image.Resampling.LANCZOS)
    out=Image.new("RGBA",(96,96));out.paste(im,((96-im.width)//2,(96-im.height)//2))
    return np.asarray(out)/255

def labels(x):
    import numpy as np
    r,g,b=x[:,:,:3].transpose(2,0,1)
    out=np.zeros(x.shape[:2],np.uint8);visible=x[:,:,3]>=.5
    out[visible]=1
    out[visible&(r>g*1.2)&(r>b*1.25)]=2
    out[visible&(b>g*1.3)&(r>g*1.3)&(b>.28)&(r>.28)]=3
    return out

def compare(im,target):
    import numpy as np
    v=labels(normalize(im))
    def iou(a,b):
        union=(a|b).sum()
        return float((a&b).sum()/union) if union else 0.
    silhouette=iou(v>0,target>0)
    colors=[iou(v==k,target==k) for k in (1,2,3)]
    return .5*silhouette+.5*float(np.mean(colors)),silhouette,colors

def run(bundle,out):
    import numpy as np
    from PIL import Image
    raw=bundle.read_bytes();require(source.sha(raw)==source.SOURCE,"source version")
    _,nodes=source.auditor.extract_nodes(raw);nodes=dict(nodes)
    res=nodes[source.CAB+".resS"]
    objects={pid:blob for cls,pid,blob,endian in source.material_audit.serialized_objects(
        nodes[source.CAB],classes=(1,21,23,28,33,43,114)) if endian=="<"}
    definition=objects[DEFINITION]
    require(b"item_c_dyeable_witchhat_spookywitch.InventoryItemDefinitionAsset" in definition and
            struct.unpack_from("<I",definition,132)[0]==ITEM,"item identity")
    require(ptr(definition,796)==(0,"-7787111060264843729"),"outfit binding")
    outfit=objects["-7787111060264843729"]
    require(ptr(outfit,120)==(0,"-970819309203920775"),"shared outfit binding")
    require(b"Shared_HeadAccessory_WitchHat" in objects["-970819309203920775"],"shared outfit name")
    filter=objects["-6780447427184532241"];renderer=objects["-8369270200377383697"]
    go=(0,"7049031096430060783")
    require(ptr(filter,0)==go and ptr(renderer,0)==go and ptr(filter,12)==(0,MESH) and
            struct.unpack_from("<I",renderer,72)[0]==1 and ptr(renderer,76)==(0,MATERIAL),"renderer binding")
    require(b"Shared_HeadAccessory_WitchHat" in objects[go[1]],"renderer name")
    require(source.sha(objects[MESH])==MESH_HASH,"mesh fingerprint")
    count,indices,vertices=mesh_layout(objects[MESH],res)
    pos=np.ndarray((count,3),dtype="<f4",buffer=vertices,offset=0,strides=(36,4)).astype(float)
    uv=np.ndarray((count,2),dtype="<f2",buffer=vertices,offset=32,strides=(36,2)).astype(float)
    require(np.isfinite(pos).all() and np.isfinite(uv).all(),"invalid vertex attributes")
    idx=np.frombuffer(indices,dtype="<u2").reshape(-1,3)
    material=source.material_audit.material_properties(objects[MATERIAL],"<")
    require(material["shader"]=={"fileId":0,"pathId":source.SHADER},"native shader")
    images={}
    for key,(pid,digest) in MAPS.items():
        require(material["textures"][key]=={"fileId":0,"pathId":pid,"scale":[1.,1.],"offset":[0.,0.]},"texture binding")
        images[key]=texture(objects[pid],res,pid,digest)
    ref=texture(objects[REF[0]],res,*REF).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    palettes=json.loads((HERE.parent/"public/native-dye-palettes.json").read_text())
    require(palettes["definitions_sha256"]==source.SOURCE and
            palettes["records"][str(ITEM)]=={"dye":670,"colors":PALETTE},"palette binding")
    p=np.array([[int(c[i:i+2],16)/255 for i in (1,3,5)] for c in PALETTE])
    def render(yaw,pitch,size):
        mask,coords=raster(pos,uv,idx,yaw,pitch,size)
        return albedo_image(coords,mask,images["_BaseMap"],images["_PatternMap"],p)
    def orient(im,mirror,roll):
        if mirror:im=im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        if roll:im=im.rotate(roll,resample=Image.Resampling.BICUBIC,expand=False)
        return im
    target=labels(normalize(ref));best=None
    for yaw in range(0,360,30):
        for pitch in range(0,61,15):
            im=render(yaw,pitch,96)
            for mirror in (False,True):
                for roll in (-15,0,15):
                    score,sil,colors=compare(orient(im,mirror,roll),target)
                    candidate=(score,yaw,pitch,mirror,roll,sil,colors)
                    if best is None or candidate>best:best=candidate
    score,yaw,pitch,mirror,roll,sil,colors=best
    require(HERE.parent.resolve() not in out.resolve().parents and out.resolve()!=HERE.parent.resolve(),"diagnostic output must be outside repository")
    out.mkdir(parents=True,exist_ok=True)
    orient(render(yaw,pitch,384),mirror,roll).resize((256,256),Image.Resampling.LANCZOS).save(out/"preview.png")
    ref.save(out/"reference.png")
    report={"itemId":ITEM,"vertices":count,"triangles":len(idx),"candidates":360,
            "camera":{"yaw":yaw,"pitch":pitch,"mirror":mirror,"roll":roll},
            "score":score,"silhouetteIoU":sil,"colorRegionIoUs":colors,
            "nativeLightingVerified":False,"nativeIconVerified":False}
    (out/"report.json").write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps(report,indent=2))

def self_test():
    assert ptr(struct.pack("<iq",0,-8218739919101907736),0)==(0,MESH)
    try:ptr(bytes(11),0)
    except ValueError:pass
    else:raise AssertionError("truncated PPtr accepted")
    try:mesh_layout(bytes(12),b"")
    except (ValueError,struct.error):pass
    else:raise AssertionError("invalid mesh accepted")
    print("NATIVE_RIGID_ICON_SELFTEST_OK")

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("definitions",type=Path,nargs="?")
    parser.add_argument("--out",type=Path)
    parser.add_argument("--self-test",action="store_true")
    args=parser.parse_args()
    if args.self_test:self_test()
    elif args.definitions and args.out:run(args.definitions,args.out)
    else:parser.error("local definitions and --out required")

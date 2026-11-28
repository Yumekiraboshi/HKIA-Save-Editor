#!/usr/bin/env python3
"""Common original-resolution lossless raster encoding; never resize.

The source is the decoded original texels, not a legacy delivery image.
WebP cannot restore data lost in the game's original compressed textures.
"""
import hashlib
import io
import struct
from pathlib import Path

POLICY='native-resolution-lossless-webp-v1'
MAX_DIMENSION=16383
def sha(data):return hashlib.sha256(data).hexdigest()
def require(ok,msg):
    if not ok:raise ValueError(msg)
def lossless_container(raw):
    require(len(raw)>=25 and raw[:4]==b'RIFF' and raw[8:12]==b'WEBP' and
            struct.unpack_from('<I',raw,4)[0]+8==len(raw),'invalid WebP container')
    p=12;count=0
    while p<len(raw):
        require(p+8<=len(raw),'truncated WebP chunk')
        kind=raw[p:p+4];size=struct.unpack_from('<I',raw,p+4)[0];start=p+8
        require(start+size<=len(raw),'invalid WebP chunk size')
        require(kind not in (b'VP8 ',b'ANIM',b'ANMF',b'ALPH'),'lossy or animated WebP')
        if kind==b'VP8L':
            require(size>=5 and raw[start]==0x2f,'invalid VP8L header');count+=1
        p=start+size+(size&1)
    require(p==len(raw) and count==1,'one lossless image required')
def verify(raw,meta,expected=None):
    from PIL import Image
    lossless_container(raw)
    require(sha(raw)==meta['sha256'] and len(raw)==meta['bytes'],'WebP file identity mismatch')
    with Image.open(io.BytesIO(raw)) as decoded:
        require(decoded.format=='WEBP' and decoded.size==(meta['width'],meta['height']),'original image dimensions changed')
        pixels=decoded.convert(meta['mode']).tobytes()
    require(sha(pixels)==meta['pixelSha256'],'lossless decoded pixel identity mismatch')
    if expected is not None:require(pixels==expected.tobytes(),'lossless original pixel mismatch')
def encode(image):
    require(image.mode in ('RGBA','RGB') and 0<min(image.size)<=max(image.size)<=MAX_DIMENSION,'unsupported original image geometry/mode')
    out=io.BytesIO()
    image.save(out,format='WEBP',lossless=True,method=6,exact=True)
    raw=out.getvalue();digest=sha(raw)
    meta={'file':digest+'.webp','sha256':digest,'bytes':len(raw),'width':image.width,'height':image.height,
          'mode':image.mode,'pixelSha256':sha(image.tobytes()),'conversion':POLICY}
    verify(raw,meta,image)
    return raw,meta
def store(folder,image):
    raw,meta=encode(image);path=Path(folder)/meta['file']
    if path.exists():
        require(path.read_bytes()==raw,'content-addressed collision')
    else:
        with path.open('xb') as out:out.write(raw)
    return meta
def reuse(folder,prior_folder,meta):
    require(meta['conversion']==POLICY and meta['file']==meta['sha256']+'.webp','not a native-resolution previous image')
    raw=(prior_folder/meta['file']).read_bytes();verify(raw,meta)
    path=folder/meta['file']
    if path.exists():require(path.read_bytes()==raw,'content-addressed collision')
    else:
        with path.open('xb') as out:out.write(raw)
    return meta

def self_test():
    from PIL import Image
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        root=Path(tmp)
        for w,h in ((2,2),(54,54),(128,256),(256,256),(512,137)):
            im=Image.new('RGBA',(w,h))
            im.putdata([((x*7)%256,(x*13)%256,(x*19)%256,x%256) for x in range(w*h)])
            a=store(root,im);b=store(root,im)
            assert a==b and (a['width'],a['height'])==(w,h)
            verify((root/a['file']).read_bytes(),a,im)
        assert len(list(root.glob('*.webp')))==5
        try:verify((root/a['file']).read_bytes(),{**a,'width':96})
        except ValueError:pass
        else:raise AssertionError('accepted resized metadata')
    print('HKIA_NATIVE_WEBP_SELF_TEST_OK')
if __name__=='__main__':self_test()

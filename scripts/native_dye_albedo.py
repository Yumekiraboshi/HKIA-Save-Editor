"""Original CustomLitCharacter albedo operation (offline only).
Inputs are normalized *shader-space* samples, not automatically sRGB bytes.
No geometry, lighting, gamma conversion or final UI icon claim.
"""
import math
import struct
import hashlib

BLOCKS = {
    '3969d0eb0643d80f482bf078254cc20f1ee793f523d928bd0994989f219a1e51': 0,
    '0950e94c9a9e326ff7ad3f486bb5cfcfb29ae698ed780051d0b4dd02e35706ab': 1,
}
OPS = [74,74,0,50,0,50,0,50,0,50,74,50,50]

def unit(v, n):
    if len(v)!=n or any(not math.isfinite(x) or not 0<=x<=1 for x in v):
        raise ValueError('expected normalized shader samples')
    return tuple(v)

def dye_albedo(base, pattern, base_alpha, palette):
    base=unit(base,3); pattern=unit(pattern,4); (strength,)=unit((base_alpha,),1)
    if len(palette)!=5: raise ValueError('five explicit shader palette colors required')
    p=[unit(c,3) for c in palette]
    rgb=p[0]
    for i in range(3):
        rgb=tuple(a+(b-a)*pattern[i] for a,b in zip(rgb,p[i+1]))
    rgb=tuple(b+(a-b)*pattern[3] for a,b in zip(rgb,p[4]))
    return tuple(b+(b*c-b)*strength for b,c in zip(base,rgb))

def instructions(program):
    if len(program)<32 or program[:4]!=b'DXBC': raise ValueError('DXBC header')
    total,n=struct.unpack_from('<II',program,24)
    if total!=len(program) or not 1<=n<=64 or 32+4*n>total: raise ValueError('DXBC bounds')
    shader=None
    for off in struct.unpack_from('<'+'I'*n,program,32):
        if off<32+4*n or off+8>total: raise ValueError('chunk offset')
        tag,size=struct.unpack_from('<4sI',program,off)
        if off+8+size>total: raise ValueError('chunk bounds')
        if tag in (b'SHEX',b'SHDR'):
            if shader is not None or size<8 or size%4: raise ValueError('token chunk')
            shader=struct.unpack_from('<'+'I'*(size//4),program,off+8)
    if shader is None or shader[1]!=len(shader): raise ValueError('token count')
    if shader[0]>>16!=0: return []
    i=2; result=[]
    while i<len(shader):
        size=(shader[i]>>24)&127
        if not size or i+size>len(shader): raise ValueError('instruction bounds')
        result.append(shader[i:i+size]); i+=size
    return result

def block_hash(block):
    return hashlib.sha256(b''.join(struct.pack('<'+'I'*len(x),*x) for x in block)).hexdigest()

def get_dye_block(program):
    ins=instructions(program)
    for i,x in enumerate(ins):
        if x[0]&2047!=74: continue
        block=ins[i:i+13]
        if [x[0]&2047 for x in block]!=OPS: raise ValueError('unexpected first sample operation')
        digest=block_hash(block)
        if digest not in BLOCKS: raise ValueError('unrecognized native dye block')
        return digest, block
    return None

def evaluate_block(block, base, pattern, base_alpha, palette):
    """Independent restricted execution of pinned add/mad/sample tokens.
    Texture inputs are already sampled. ComboMap is read but is not an
    operand of this albedo result. This is not a general DXBC interpreter.
    """
    digest=block_hash(block)
    if digest not in BLOCKS: raise ValueError('unrecognized native dye block')
    regs={}; constants={(1,i+1):tuple(c)+(1.,) for i,c in enumerate(palette)}
    textures={0:tuple(base)+(base_alpha,),3:tuple(pattern),2:(0.,0.,0.,0.)}
    def operand(w,i):
        token=w[i];i+=1; neg=False
        if token>>31:
            ext=w[i];i+=1
            if ext!=0x41: raise ValueError('unsupported operand modifier')
            neg=True
        kind=(token>>12)&255;dims=(token>>20)&3
        if token & 0x7fc00000: raise ValueError('non-immediate indexing')
        indexes=tuple(w[i:i+dims]);i+=dims
        mode=(token>>2)&3; selection=(token>>4)&255
        return (kind,indexes,mode,selection,neg),i
    def read(o):
        kind,ix,mode,sel,neg=o
        if kind==0: v=regs[ix[0]]
        elif kind==8: v=constants[ix]
        else: raise ValueError('unsupported source register')
        if mode==1: v=tuple(v[(sel>>(2*j))&3] for j in range(4))
        elif mode==2: v=(v[sel&3],)*4
        else: raise ValueError('unsupported source swizzle')
        return tuple(-x for x in v) if neg else v
    def write(o,v):
        kind,ix,mode,mask,neg=o
        if kind!=0 or mode!=0 or neg: raise ValueError('unsupported destination')
        dst=regs.setdefault(ix[0],[0.]*4)
        for c in range(4):
            if mask&(1<<c): dst[c]=v[c]
    for w in block:
        op=w[0]&2047;i=1
        if w[0]>>31:
            while True:
                x=w[i];i+=1
                if not x>>31:break
        dest,i=operand(w,i)
        if op==74:
            _,i=operand(w,i); resource,i=operand(w,i); _,i=operand(w,i); _,i=operand(w,i)
            kind,ix,mode,sel,neg=resource
            if kind!=7 or mode!=1 or neg: raise ValueError('unsupported texture register')
            v=textures[ix[0]];v=tuple(v[(sel>>(2*j))&3] for j in range(4))
        elif op in (0,50):
            a,i=operand(w,i);b,i=operand(w,i); a,b=read(a),read(b)
            if op==0:v=tuple(x+y for x,y in zip(a,b))
            else:
                c,i=operand(w,i);c=read(c);v=tuple(x*y+z for x,y,z in zip(a,b,c))
        else: raise ValueError('unsupported native block instruction')
        if i!=len(w):raise ValueError('operand count')
        write(dest,v)
    return tuple(regs[BLOCKS[digest]][:3])

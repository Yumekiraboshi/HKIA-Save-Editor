#!/usr/bin/env python3
"""Extract native shader pass, keyword and common parameter bindings; no shader bytes published."""
import argparse, hashlib, json, struct, math, importlib.util, random
from pathlib import Path
SHA='e070439c4caab460aaa692eaef75d066249a817aabaa34a3b79bca01505ad029'
OBJECT='cdb64e92e92cbc2b88b3ce48c8a3ed302a16972a23528c27e766b7a646d852d0'
CAB='CAB-2b27edbfe7f08bad1cd631865ee4eb15'; PID='-6806329374484566350'
def require(x,msg):
    if not x:raise ValueError(msg)
def sha(b):return hashlib.sha256(b).hexdigest()
def module(name):
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def extract(raw,mesh,audit,shader_audit,vector_output=None,lighting_output=None):
    require(sha(raw)==SHA,'source bundle');_,pairs=audit.auditor.extract_nodes(raw);cab=dict(pairs)[CAB];trees,_=mesh.type_trees(cab)
    b=next(o for c,p,o,e in audit.serialized_objects(cab,classes=(48,)) if p==PID and e=='<');require(sha(b)==OBJECT,'shader identity')
    # Fixed byte-size records can contain aligned child fields. Traverse all
    # descendants instead of skipping records with a non-negative size.
    def parse(no,p=0,depth=0):
        _,ty,na,bs,meta,ch=no;require(depth<64 and 0<=p<=len(b),'field depth/bounds')
        if ty=='string':v,p=mesh.string(b,p)
        elif ty=='Array':
            count=mesh.u(b,p);p+=4;require(count<=1000000,'array count');d=ch[1]
            if not d[-1] and d[3]==1:v=b[p:p+count];p+=count
            else:
                v=[]
                for _ in range(count):x,p=parse(d,p,depth+1);v.append(x)
        elif ch:
            v={}
            for c in ch:
                require(c[2] not in v,'duplicate field');x,p=parse(c,p,depth+1);v[c[2]]=x
        else:
            require(0<=bs<=32 and p+bs<=len(b),'primitive bounds');v=int.from_bytes(b[p:p+bs],'little');p+=bs
        if meta&0x4000:p=mesh.align(p)
        require(p<=len(b),'field end');return v,p
    d,end=parse(trees[48]);require(end==len(b),'object boundary');a=lambda v:v['Array'];pf=d['m_ParsedForm'];require(pf['m_Name']=='Sunblink/Lynx/CustomLitFurniture' and a(d['platforms'])==[4],'name/platform')
    offsets,sizes,expanded=[a(a(d[k])[0]) for k in ('offsets','compressedLengths','decompressedLengths')];blob=a(d['compressedBlob']);segs=[];cursor=0
    for o,z,n in zip(offsets,sizes,expanded):
        require(o==cursor and 0<z<=len(blob)-o and 0<n<=2000000,'segment bounds');segs.append(audit.auditor.decompress(blob[o:o+z],n,2));cursor+=z
    require(cursor==len(blob) and len(segs)==4,'segment closure')
    count=mesh.u(segs[0]);require(count==232 and len(segs[0])==4+12*count,'blob table')
    table=[struct.unpack_from('<III',segs[0],4+12*i) for i in range(count)]
    for off,n,s in table:require(0<s<len(segs) and 0<n<=len(segs[s])-off,'blob bounds')
    keywords=a(pf['m_KeywordNames']);require(len(keywords)==16,'keywords');passes=[];used=set()
    for sub in a(pf['m_SubShaders']):
        for p in a(sub['m_Passes']):
            names={x['#778']:x['#155'] for x in a(p['m_NameIndices'])};require(len(names)==len(a(p['m_NameIndices'])),'name indices')
            stages={}
            for stage,field in [('vertex','progVertex'),('pixel','progFragment')]:
                q=p[field];programs=a(q['m_PlayerSubPrograms']);params=a(q['m_ParameterBlobIndices']);require(len(programs)==len(params)==4 and all(not a(x) for x in programs[:3]+params[:3]),'platform stage');ps=a(programs[3]);ix=a(params[3]);require(len(ps)==len(ix),'parameter rows')
                c=q['m_CommonParameters'];cb=[]
                for v in a(c['m_ConstantBuffers']):
                    require(not a(v['m_StructParams']),'unsupported structs');members=[]
                    for field2,dim in [('m_VectorParams','m_Dim'),('m_MatrixParams','m_RowCount')]:
                        for x in a(v[field2]):members.append([names[x['m_NameIndex']],x['#387'],x['m_ArraySize'],x['#519'],x[dim],field2=='m_MatrixParams'])
                    cb.append({'name':names[v['m_NameIndex']],'size':v['m_Size'],'members':members})
                textures=[[names[t['m_NameIndex']],t['#387'],t['m_SamplerIndex'],t['m_Dim']] for t in a(c['m_TextureParams'])];bindings=[[names[t['m_NameIndex']],t['#387']] for t in a(c['m_ConstantBufferBindings'])]
                variants=[]
                for v,param in zip(ps,ix):
                    i=v['m_BlobIndex'];require(0<=i<count and 0<=param<count,'blob index');off,n,s=table[i];block=segs[s][off:off+n];require(mesh.u(block)==0x0c0a75ba,'program header');hdr=struct.unpack_from('<7I',block);require(hdr[1]==v['m_GpuProgramType']==(16 if stage=='vertex' else 18),'program stage');pos=28;ks=[]
                    for _ in range(hdr[-1]):k,pos=mesh.string(block,pos);ks.append(k)
                    expected=sorted(keywords[j] for j in a(v['m_KeywordIndices']));require(ks==expected,'keyword match');programs2=shader_audit.containers(block);require(len(programs2)==1 and programs2[0]['stage']==stage,'program identity');pr=programs2[0];used.add(i)
                    variants.append({'blobIndex':i,'parameterBlobIndex':param,'keywords':ks,'segment':s,'offset':off+pr['offset'],'bytes':pr['bytes'],'sha256':pr['sha256']})
                stages[stage]={'commonBuffers':cb,'commonBufferBindings':bindings,'commonTextures':textures,'variants':variants}
            passes.append({'name':p['m_State']['m_Name'],'stages':stages})
    require(len(passes)==4 and len(used)==145,'program coverage')
    if vector_output is not None:vector_output.write_text(json.dumps(surface_vectors(segs[1]),separators=(',',':'))+'\n')
    if lighting_output is not None:lighting_output.write_text(json.dumps(lighting_vectors(segs[1]),separators=(',',':'))+'\n')
    return {'schema':'HKIA.FurnitureShaderBindings.1','version':'3.0.1','bundleSha256':SHA,'objectSha256':OBJECT,'keywordNames':keywords,'passes':passes,'uniqueProgramBlobs':len(used),'renderFidelity':'unverified'}
def evaluate(w,start,end,registers):
 def operand(ins,i):
  t=ins[i];i+=1;neg=False
  if t>>31:assert ins[i]==0x41;neg=True;i+=1
  kind=(t>>12)&255;dims=(t>>20)&3;assert not t&0x7fc00000;ix=tuple(ins[i:i+dims]);i+=dims;mode=(t>>2)&3;sel=(t>>4)&255;comp=t&3
  if kind==4:
   n=1 if comp==1 else 4;v=struct.unpack('<'+'f'*n,struct.pack('<'+'I'*n,*ins[i:i+n]));i+=n;return (kind,ix,mode,sel,neg,v),i
  return (kind,ix,mode,sel,neg,None),i
 def read(o):
  k,ix,m,s,neg,imm=o
  if k==4:v=imm*4 if len(imm)==1 else imm
  else:
   v=registers[(k,*ix)];v=[v[(s>>(2*j))&3] for j in range(4)] if m==1 else [v[s&3]]*4 if m==2 else v
  return [-x for x in v] if neg else v
 def write(o,v):
  k,ix,m,s,neg,_=o;assert m==0 and not neg;r=registers.setdefault((k,*ix),[0.]*4)
  for i in range(4):
   if s&(1<<i):r[i]=v[i]
 p=start
 while p<end:
  n=(w[p]>>24)&127;ins=w[p:p+n];op=w[p]&2047;sat=w[p]&0x2000;i=1;args=[]
  while i<len(ins):x,i=operand(ins,i);args.append(x)
  if op==62:
   assert p+n==end;return registers
  d,*a=args
  if op==77:
   v=read(a[1]);write(d,[math.sin(x) for x in v]);write(a[0],[math.cos(x) for x in v]);p+=n;continue
  vs=[read(x) for x in a]
  if op==0:r=[x+y for x,y in zip(*vs)]
  elif op==1:r=[x if y else 0. for x,y in zip(*vs)] # comparison mask only
  elif op==14:r=[x/y for x,y in zip(*vs)]
  elif op==16:r=[sum(x*y for x,y in zip(vs[0][:3],vs[1][:3]))]*4
  elif op==68:r=[1/math.sqrt(x) for x in vs[0]]
  elif op==15:r=[sum(x*y for x,y in zip(vs[0][:2],vs[1][:2]))]*4
  elif op==49:r=[float(x<y) for x,y in zip(*vs)]
  elif op==50:r=[x*y+z for x,y,z in zip(*vs)]
  elif op==51:r=[min(x,y) for x,y in zip(*vs)]
  elif op==52:r=[max(x,y) for x,y in zip(*vs)]
  elif op==54:r=vs[0]
  elif op==55:r=[y if x else z for x,y,z in zip(*vs)]
  elif op==56:r=[x*y for x,y in zip(*vs)]
  elif op==57:r=[float(x!=y) for x,y in zip(*vs)]
  elif op==75:r=[math.sqrt(x) for x in vs[0]]
  else:raise ValueError(op)
  if sat:r=[min(1,max(0,x)) for x in r]
  write(d,r);p+=n
 assert p==end
 return registers

def surface_vectors(b):
    """Restricted evaluator for four fingerprinted original token ranges.
    Generates synthetic shader-space fixtures, not original shader code or images.
    Float64 evaluation is compared with tolerance, not bitwise GPU parity.
    """
    def tokens(o):
     p=b[o:o+struct.unpack_from('<I',b,o+24)[0]];off=next(i for i in struct.unpack_from('<'+'I'*struct.unpack_from('<I',p,28)[0],p,32) if p[i:i+4]==b'SHEX');return struct.unpack_from('<'+'I'*(struct.unpack_from('<I',p,off+4)[0]//4),p,off+8)
    rng=random.Random(32709745);v=tokens(1326);p=tokens(168014);cases=[]
    for w,start,end,digest in [(v,291,443,'dcb8146b3f8ec535f5a5c050bb8d6e510a69f7716d13917d5b0a15d99ece233e'),(p,171,203,'4b00b07a993de4a49e4849f0c07f1b7b905ec26b9644dee9de99bed0385ff2a8'),(p,375,472,'0a248330d43d24cbef3e6793d2b66e4bd060960f1e21a8dd48aec147a0755819'),(p,203,275,'bd7776a0d2232260bfe4a9c28a13ba74cfabd3bda347f7ef4cef9414d678b7b7')]:
     require(sha(struct.pack('<'+'I'*(end-start),*w[start:end]))==digest,'native block digest')
    for i in range(128):
     base,pattern,combo=[rng.random() for _ in range(4)],[rng.random() for _ in range(4)],[rng.random() for _ in range(4)]
     bc=[rng.random(),rng.random(),rng.random(),[0.,.1,1.][i%3]];pt=[rng.random() for _ in range(4)];mask=bool(i%2);ss,ms,ps,pm=[rng.uniform(-1,1) for _ in range(4)];occ=rng.random();reg={(0,0):base.copy(),(0,1):pattern.copy(),(0,2):combo.copy(),(8,1,1):bc,(8,1,2):[ss,ms,occ,0],(8,1,5):[ps,pm,0,0],(8,1,12):pt,(8,1,13):[int(mask),0,0,0]};evaluate(p,171,203,reg);weight=reg[0,0][3];evaluate(p,375,472,reg)
     u=dict(baseColor=bc,patternTint=pt,useBaseMapMask=mask,smoothnessShift=ss,metallicShift=ms,patternSmoothnessShift=ps,patternMetallicShift=pm,occlusionStrength=occ);cases.append(dict(base=base,pattern=pattern,combo=combo,u=u,expected=dict(albedo=reg[0,0][:3],weight=weight,perceptualRoughness=reg[0,0][3],metallic=reg[0,1][0],occlusion=reg[0,1][1])))
    uv=[]
    for i in range(64):
     a=[rng.uniform(-2,2) for _ in range(2)];c=[rng.uniform(-2,2) for _ in range(2)];world=[rng.uniform(-10,10) for _ in range(3)];bst=[rng.uniform(-2,2) for _ in range(4)];pst=[rng.uniform(-2,2) for _ in range(4)];rot=rng.random();center=[rng.random(),rng.random()];isworld=bool(i%2);reg={(0,0):world+[0],(1,3):a+[0,0],(1,4):c+[0,0],(8,2,0):bst,(8,2,4):pst,(8,2,11):[int(isworld),rot,*center]};evaluate(v,291,443,reg);uv.append(dict(args=[a,c,world,bst,pst,isworld,rot,center],expected=dict(base=reg[2,2][:2],pattern=reg[2,2][2:])))
    normal=[]
    for i in range(32):
     a=[rng.random() for _ in range(4)];face=bool(i%2);reg={(0,3):[a[0],a[1],a[3],0],(1,7):[int(face),0,0,0]};evaluate(p,203,275,reg);normal.append(dict(args=[a,face],expected=reg[0,3][:3]))
    return {'schema':'HKIA.FurnitureSurfaceVectors.1','version':'3.0.1','cases':cases,'uv':uv,'normal':normal}

def lighting_vectors(b):
    # These are original shader-space inputs, NOT guessed scene constants.
    off=168014;d=b[off:off+struct.unpack_from('<I',b,off+24)[0]];require(sha(d)=='cde2be6de0bbdfa6c9b3219fa302a61c5812a1efb6cbaf1e17868dd760b3e0e4','lighting program');o=next(i for i in struct.unpack_from('<'+'I'*struct.unpack_from('<I',d,28)[0],d,32) if d[i:i+4]==b'SHEX');w=struct.unpack_from('<'+'I'*(struct.unpack_from('<I',d,o+4)[0]//4),d,o+8)
    for start,end,digest in [(472,579,'297fa174d138d9bbe6c0cf386e68be6b24d3a34fd23f94697e3d178ff7454d7e'),(593,742,'078c30ab755877fd4806fd2fe01c41b6eb942e94bce4203326738d78e7e7804c'),(798,1094,'914356c7046548639e3a4e36f437a5de32d36e7c14e70767645013e31c7e68f5'),(779,797,'ec4a481548b5d979b8776a6179ca4c0be5c2e6b4c2430e4e4b83b2946172ce4b')]:
        require(sha(struct.pack('<'+'I'*(end-start),*w[start:end]))==digest,'native lighting block digest')
    rng=random.Random(32709746);cases=[]
    def scalar():return rng.random()
    def vec():return [scalar() for _ in range(3)]
    def unit():
        v=[rng.uniform(-1,1) for _ in range(3)];n=math.sqrt(sum(x*x for x in v));return [x/n for x in v]
    for i in range(128):
        u=dict(albedo=vec(),perceptualRoughness=[0.,1.,scalar()][i%3],metallic=[0.,1.,scalar()][(i//3)%3],occlusion=scalar(),emissionColor=vec(),emissionMask=scalar(),normal=unit(),view=unit(),mainLightDirection=unit(),mainLightColor=[2*x for x in vec()],ambient=vec(),screenOcclusion=scalar(),screenOcclusionStrength=scalar(),reflectionPrimary=vec(),reflectionSecondary=vec(),reflectionBlendWeight=[0.,1.,scalar()][(i//9)%3],reflectionIntensity=scalar(),reflectionStrength=scalar(),ambientMain=vec(),ambientFill=vec(),fogVarying=scalar(),fogMultiplier=scalar())
        r={(0,0):u['albedo']+[u['perceptualRoughness']],(0,1):[u['metallic'],u['occlusion'],0.,1.],(0,2):[0.,0.,0.,u['emissionMask']],(0,3):u['normal']+[0.],(0,4):u['view']+[u['screenOcclusion']],(0,5):u['view']+[0.],(8,1,3):u['emissionColor']+[u['reflectionStrength']],(8,0,9):[0.,0.,0.,u['screenOcclusionStrength']],(1,6):u['ambient']+[0.],(8,2,3):[u['reflectionBlendWeight'],0.,0.,0.],(8,2,2):[0.,0.,0.,u['reflectionIntensity']],(8,0,5):u['mainLightDirection']+[0.],(8,0,6):u['mainLightColor']+[0.],(8,2,0):u['ambientMain']+[0.],(8,2,1):u['ambientFill']+[0.],(1,1):[0.,0.,0.,u['fogVarying']],(8,0,130):[u['fogMultiplier'],0.,0.,0.]}
        evaluate(w,472,579,r);evaluate(w,593,742,r);direction=r[0,8][:3];lod=r[0,0][3]
        # Supply actual sample values at the texture sample boundaries; evaluate the blend only when the original predicate is true.
        r[0,10]=u['reflectionSecondary']+[0.]
        if u['reflectionBlendWeight']<1:
            r[0,8]=u['reflectionPrimary']+[0.];evaluate(w,779,797,r)
        evaluate(w,798,1094,r)
        cases.append({'input':u,'expected':{'color':r[2,0][:3],'reflection':{'direction':direction,'lod':lod}}})
    return {'schema':'HKIA.FurnitureLightingVectors.1','version':'3.0.1','cases':cases}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('bundle',type=Path);p.add_argument('--out',type=Path,required=True);p.add_argument('--vectors',type=Path);p.add_argument('--lighting-vectors',type=Path);a=p.parse_args();d=extract(a.bundle.read_bytes(),module('extract-furniture-mesh-source'),module('audit-native-dye-materials'),module('audit-native-character-shader'),a.vectors,a.lighting_vectors);a.out.write_text(json.dumps(d,separators=(',',':'))+'\n')

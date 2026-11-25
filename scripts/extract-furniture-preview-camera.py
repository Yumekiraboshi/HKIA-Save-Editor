#!/usr/bin/env python3
"""Read actual local furniture preview rig/camera from original v3.0.1 prefab.
The preview is not the static inventory UiIcon camera. No rendered images.
"""
import argparse,struct,hashlib,importlib.util,json,math
from pathlib import Path
SHA='c0ada5696936537ecd874bb7f936c7775c2b6110be3a568b44e43f00ea769795';CAB='CAB-875d854583da28eb82ebb8256877a5f2'
def sha(b):return hashlib.sha256(b).hexdigest()
def require(ok,msg):
    if not ok:raise ValueError(msg)
def module(n):
    s=importlib.util.spec_from_file_location(n,Path(__file__).with_name(n+'.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
# Preserve per-object type indices, because many distinct MonoBehaviour
# schemas share class 114. Only parse selected source-backed objects.
def load(b,m):
    require(struct.unpack_from('>I',b,8)[0]==22 and b[16]==0,'serialized file version');_,p=m.cs(b,48);p+=4;require(b[p]==1,'type tree');p+=1;n=m.u(b,p);p+=4;types=[];require(n<=4096,'types')
    for _ in range(n):
        c=struct.unpack_from('<i',b,p)[0];p+=7+(16 if c==114 or c<0 else 0)+16;n,s=struct.unpack_from('<II',b,p);p+=8;require(n<=100000 and p+32*n+s<=len(b),'type bounds');ss=b[p+32*n:p+32*n+s]
        def st(o):return {49:'Array',795:'size',106:'data',427:'m_Name',55:'Base',894:'TypelessData',840:'string',349:'m_Enabled',374:'m_GameObject',490:'m_Script'}.get(o&0x7fffffff,'#'+str(o&0x7fffffff)) if o>>31 else m.cs(ss,o)[0]
        stack=[];root=None
        for i in range(n):
            _,lv,_,ty,na,bs,_,meta,_=struct.unpack_from('<HBBIIiiiQ',b,p+i*32);node=[lv,st(ty),st(na),bs,meta,[]]
            while stack and stack[-1][0]>=lv:stack.pop()
            if stack:stack[-1][-1].append(node)
            else:require(root is None,'root');root=node
            stack.append(node)
        types.append((c,root));p+=32*n+s;n=m.u(b,p);p+=4+4*n
    count=m.u(b,p);p=m.align(p+4);off=struct.unpack_from('>Q',b,32)[0];objs={};require(count<=100000,'objects')
    for _ in range(count):
        pid,start,size,ti=struct.unpack_from('<qqIi',b,p);p+=24;require(0<=ti<len(types) and 0<=start<=len(b)-off-size and str(pid) not in objs,'object bounds');c,t=types[ti];objs[str(pid)]=(c,t,b[off+start:off+start+size])
    scripts=m.u(b,p);p+=4+scripts*12;ext=m.u(b,p);p+=4;external=[];require(ext<=1024,'external count')
    for _ in range(ext):_,p=m.cs(b,p);p+=20;path,p=m.cs(b,p);external.append(path)
    return objs,external

def extract(raw,m,audit):
    require(sha(raw)==SHA,'source bundle');_,pairs=audit.auditor.extract_nodes(raw);o,e=load(dict(pairs)[CAB],m)
    def ff(pid,cls):c,t,b=o[pid];require(c==cls,'object class');return m.fields(t,b)
    def local(ref):f,p=m.ptr(ref);require(f==0 and p in o,'local reference');return p
    def go(pid):return m.string(ff(pid,1)['m_Name'])[0]
    def fp(b,n):v=list(struct.unpack('<'+'f'*n,b));require(all(math.isfinite(x) for x in v),'nonfinite field');return v
    def f1(b):return fp(b,1)[0]
    root='-7287904312184774039';require(go(root)=='FurnitureCustomizationSelectScreen','screen root')
    rootScript='2232028617088983657';rf=ff(rootScript,114);require(local(rf['m_GameObject'])==root,'screen owner');rig=local(rf['LocalPreview']);require(rig=='-4525654790126607767','rig identity');r=ff(rig,114);rg=local(r['m_GameObject']);require(go(rg)=='CameraAndPodium','rig owner')
    mount=local(r['MountSpawnPoint']);guid=m.string(r['MountToSpawn'])[0];require(guid=='74cb0bc75b5307147bc46d39ff3e6d7a','mount GUID')
    camera='3988728485954019945';c=ff(camera,20);cg=local(c['m_GameObject']);require(go(cg)=='Camera','camera owner')
    output='6690946307231343209';out=ff(output,114);require(go(local(out['m_GameObject']))=='Item3d' and local(out['RenderCamera'])==camera,'output binding');size=m.u(out['TextureSize']);require(size==512,'texture size')
    def transform(goid):
        a=[p for f,p in m.array_ptr(ff(goid,1)['m_Component']) if f==0 and o[p][0] in (4,224)];require(len(a)==1,'transform');return a[0]
    def row(pid):
        t=ff(pid,o[pid][0]);require(o[pid][0] in (4,224),'transform type');f,parent=m.ptr(t['m_Father']);require(f==0,'external parent');owner=local(t['m_GameObject']);return {'pathId':pid,'gameObjectPathId':owner,'name':go(owner),'parent':None if parent=='0' else parent,'position':fp(t['m_LocalPosition'],3),'rotation':fp(t['m_LocalRotation'],4),'scale':fp(t['m_LocalScale'],3),'objectSha256':sha(o[pid][2])}
    rt=transform(rg);ct=transform(cg);chain=[];pid=ct
    while pid:
        require(len(chain)<32 and pid not in [x['pathId'] for x in chain],'parent cycle');x=row(pid);chain.append(x);pid=x['parent']
    require(chain[1]['pathId']==rt and chain[-1]['gameObjectPathId']==root,'rig hierarchy');mr=row(mount);require(mr['parent']==rt,'mount hierarchy')
    urp='-7280964573279591831';u=ff(urp,114);require(local(u['m_GameObject'])==cg,'camera settings owner')
    return {'schema':'HKIA.FurniturePreviewCamera.1','version':'3.0.1','bundleSha256':SHA,'cab':CAB,'screenPathId':root,'screenScriptPathId':rootScript,'rigPathId':rig,'rigObjectSha256':sha(o[rig][2]),'cameraPathId':camera,'cameraObjectSha256':sha(o[camera][2]),'outputPathId':output,'outputObjectSha256':sha(o[output][2]),'textureSize':size,'autoResolve':bool(out['AutoResolve'][0]),'outputImage':local(out['OutputImage']),'transformChain':chain,'mount':mr,'mountGuid':guid,'rig':{'rotationSensitivity':f1(r['RotationSensitivity']),'instantiationDelay':f1(r['InstantiationDelay']),'maxObjectSize':f1(r['MaxObjectSize']),'moveToSameLayer':bool(r['MoveToSameLayer'][0]),'considerLossyScale':bool(r['ConsiderLossyScale'][0])},'camera':{'clearFlags':m.u(c['m_ClearFlags']),'background':fp(c['m_BackGroundColor'],4),'projectionMatrixMode':m.u(c['m_projectionMatrixMode']),'gateFitMode':m.u(c['m_GateFitMode']),'sensorSize':fp(c['m_SensorSize'],2),'lensShift':fp(c['m_LensShift'],2),'viewport':fp(c['m_NormalizedViewPortRect'],4),'near':f1(c['near clip plane']),'far':f1(c['far clip plane']),'fov':f1(c['field of view']),'orthographic':bool(c['orthographic'][0]),'orthographicSize':f1(c['orthographic size']),'cullingMask':m.u(c['m_CullingMask']),'hdr':bool(c['m_HDR'][0]),'msaa':bool(c['m_AllowMSAA'][0])},'urp':{'pathId':urp,'objectSha256':sha(o[urp][2]),'renderShadows':bool(u['m_RenderShadows'][0]),'postProcessing':bool(u['m_RenderPostProcessing'][0]),'antialiasing':m.u(u['m_Antialiasing']),'volumeLayerMask':m.u(u['m_VolumeLayerMask'])},'renderFidelity':'unverified'}
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('bundle',type=Path);p.add_argument('--out',type=Path,required=True);a=p.parse_args();d=extract(a.bundle.read_bytes(),module('extract-furniture-mesh-source'),module('audit-native-dye-materials'));a.out.write_text(json.dumps(d,separators=(',',':'))+'\n')

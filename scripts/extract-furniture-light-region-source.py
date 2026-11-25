#!/usr/bin/env python3
"""Resolve furniture customizer scene LightingRegion PPtrs to original preset assets.
Offline only: preserve original curves/gradients and cube stream fingerprints.
"""
import argparse, hashlib, importlib.util, json, math, re, struct
from pathlib import Path
SCENE='CAB-b6acca23f4d311b5c37676ed5b77c06f'; PRESETS='CAB-6ef5e40a482b00b1d462fae2060592ab'
SCENE_SHA='60f10e36778724160dfc4676920fd02747efa838eb17404a3dbb64d3bc3f7f45'; PRESET_SHA='8e477013041ba0935dd21fa6f1f3b5387660b7cc23ca3c661904a4185b4a78da'
def sha(b):return hashlib.sha256(b).hexdigest()
def require(ok,msg):
    if not ok:raise ValueError(msg)
def module(name):
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def extract(scene_raw,preset_raw,mesh,typed,extract_nodes,staging=None):
    require(sha(scene_raw)==SCENE_SHA and sha(preset_raw)==PRESET_SHA,'source bundle hashes')
    sn=extract_nodes(scene_raw);pn=extract_nodes(preset_raw);so,se=typed.load(sn[SCENE],mesh);po,pe=typed.load(pn[PRESETS],mesh)
    def ff(objects,pid,cls):
        c,t,b=objects[pid];require(c==cls,'object class');return mesh.fields(t,b)
    def local(ref,objects):
        f,p=mesh.ptr(ref);require(f==0 and p in objects,'local ref');return p
    def floats(raw,n):
        v=struct.unpack('<'+'f'*n,raw);require(all(math.isfinite(x) for x in v),'nonfinite float');return v
    def row(pid):
        t=ff(so,pid,4);f,parent=mesh.ptr(t['m_Father']);require(f==0,'external transform');go=local(t['m_GameObject'],so)
        return {'pathId':pid,'gameObjectPathId':go,'name':mesh.string(ff(so,go,1)['m_Name'])[0],'parent':None if parent=='0' else parent,'position':floats(t['m_LocalPosition'],3),'rotation':floats(t['m_LocalRotation'],4),'scale':floats(t['m_LocalScale'],3),'objectSha256':sha(so[pid][2])}
    def chain(pid):
        rows=[]
        while pid:
            require(len(rows)<32 and pid not in [x['pathId'] for x in rows],'transform cycle');x=row(pid);rows.append(x);pid=x['parent']
        return rows
    settings_refs=('Settings','RainSettings','StarfallSettings','SteamSettings','SnowSettings','FlourfallSettings');regions=[];refs=set()
    for pid,transform,collider in [('664','313','655'),('665','254','654')]:
        r=ff(so,pid,114);go=local(r['m_GameObject'],so);tr=chain(transform);require(tr[0]['gameObjectPathId']==go and tr[0]['name']=='LightRegionArea','region owner')
        cf=ff(so,collider,135);require(local(cf['m_GameObject'],so)==go and cf['m_IsTrigger'][0]==1,'region collider');ps={}
        for key in settings_refs:
            f,p=mesh.ptr(r[key]);require((f==0 and p=='0') or (1<=f<=len(se) and se[f-1].split('/')[-1]==PRESETS and p in po),'lighting setting ref');ps[key]=None if p=='0' else p
            if p!='0':refs.add(p)
        regions.append({'pathId':pid,'gameObjectPathId':go,'objectSha256':sha(so[pid][2]),'enabled':bool(r['m_Enabled'][0]),'priority':struct.unpack('<i',r['Priority'])[0],'blendDistance':floats(r['BlendDistance'],1)[0],'weatherRegion':mesh.u(r['WeatherRegion']),'settings':ps,'transformChain':tr,'collider':{'pathId':collider,'objectSha256':sha(so[collider][2]),'radius':floats(cf['m_Radius'],1)[0],'center':floats(cf['m_Center'],3),'isTrigger':True}})
    presets={};assets={};cubes={};deps=set()
    for pid in sorted(refs):
        c,t,b=po[pid];require(c==114 and t[-1][-1][2]=='Settings','preset type');name,p=mesh.string(b,28);guid,p=mesh.string(b,p);require(re.fullmatch('[0-9a-f]{32}',guid),'preset GUID');fields=t[-1][-1][-1];require(fields[0][2]=='Polar' and fields[0][3]==4,'polar');polar=floats(b[p:p+4],1)[0];p+=4;links={};vignette=None
        for x in fields[1:]:
            k=x[2];z=x[3];require(p+z<=len(b),'setting bounds');r=b[p:p+z];p+=z
            if k=='VignetteEnabled':require(z==1 and r[0] in (0,1),'vignette');vignette=bool(r[0])
            else:
                require(z==12 and x[1].startswith('PPtr<$'),'setting pointer type');fi,pi=mesh.ptr(r);require(fi==0 and pi in po,'original settings dependency');links[k]=pi;deps.add(pi)
            if x[4]&0x4000:p=mesh.align(p)
        require(p==len(b) and len(links)==25 and vignette is not None,'preset boundary');presets[pid]={'name':name,'guid':guid,'polar':polar,'vignetteEnabled':vignette,'links':links,'objectSha256':sha(b)}
    require(len(presets)==6 and len(deps)==66,'preset coverage')
    for pid in sorted(deps):
        c,t,b=po[pid]
        if c==89:
            q=ff(po,pid,89);name=mesh.string(q['m_Name'])[0];w,h,fmt,mips,images,dim,color,size=[mesh.u(q[k]) for k in ('m_Width','m_Height','m_TextureFormat','m_MipCount','m_ImageCount','m_TextureDimension','m_ColorSpace','m_CompleteImageSize')]
            require(w==h==128 and fmt==10 and mips==8 and images==6 and dim==2 and color in (0,1) and mesh.u(q['m_MipsStripped'])==0 and mesh.u(q['image data'])==0,'cube layout');sampler=struct.unpack('<iifiii',q['m_TextureSettings']);off,length=struct.unpack_from('<QI',q['m_StreamData']);path,end=mesh.string(q['m_StreamData'],12);stream=pn[PRESETS+'.resS'];require(end==len(q['m_StreamData']) and path==f'archive:/{PRESETS}/{PRESETS}.resS' and length==size*6 and off+length<=len(stream),'cube stream');payload=stream[off:off+length];mip_chain=[];cursor=0
            for i in range(mips):
                n=max(1,w>>i);z=((n+3)//4)**2*8;mip_chain.append([n,cursor,z]);cursor+=z
            require(cursor==size,'cube face bytes');cubes[pid]={'name':name,'objectSha256':sha(b),'width':w,'height':h,'format':fmt,'colorSpace':color,'sampler':sampler,'mipCount':mips,'imageCount':images,'faceBytes':size,'faceMipRanges':mip_chain,'bytes':length,'sha256':sha(payload),'faceOrder':'unverified'}
            if staging:(staging/(sha(payload)+'.cubemap.bin')).write_bytes(payload)
            continue
        require(c==114,'lighting asset type');name,p=mesh.string(b,28);asset_id,p=mesh.string(b,p);display,p=mesh.string(b,p);require(name==display,'lighting asset name');a={'name':name,'id':asset_id,'objectSha256':sha(b)}
        if t[-1][-1][2]=='Curve':
            count=mesh.u(b,p);p+=4;require(1<=count<=128 and p+28*count+12==len(b),'curve boundary');keys=[]
            for i in range(count):
                k=struct.unpack_from('<4fi2f',b,p+i*28);require(all(math.isfinite(k[j]) for j in (0,1,4,5,6)) and not any(math.isnan(x) for x in k),'curve finite');keys.append([('Infinity' if x>0 else '-Infinity') if math.isinf(x) else x for x in k])
            require(all(keys[i][0]<keys[i+1][0] for i in range(count-1)),'curve order');a.update(kind='curve',keys=keys,wrap=struct.unpack_from('<3i',b,p+28*count))
        else:
            require(t[-1][-1][2]=='#1042' and len(b)-p==164,'gradient boundary');keys=[floats(b[p+16*i:p+16*(i+1)],4) for i in range(8)];ct=struct.unpack_from('<8H',b,p+128);at=struct.unpack_from('<8H',b,p+144);mode,space,nc,na=struct.unpack_from('<4B',b,p+160);require(1<=nc<=8 and 1<=na<=8 and mode in (0,1,2),'gradient counts');a.update(kind='gradient',keys=keys,colorTimes=ct,alphaTimes=at,colorKeyCount=nc,alphaKeyCount=na,mode=mode,colorSpaceRaw=space)
        assets[pid]=a
    require(len(assets)==64 and len(cubes)==2,'asset closure');require(presets[regions[0]['settings']['Settings']]['name']=='LightRegion_UI_Static' and presets[regions[1]['settings']['Settings']]['name']=='LightRegion_DefaultInterior','region identity')
    area=ff(so,'679',114);area_go=local(area['m_GameObject'],so);tr=chain('274');require(tr[0]['gameObjectPathId']==area_go,'area owner');area_row={'pathId':'679','objectSha256':sha(so['679'][2]),'mode':mesh.u(area['Mode']),'attenuation':floats(area['Attenutation'],1)[0],'intensity':floats(area['Intensity'],2),'ambientImpact':floats(area['AmbientImpact'],1)[0],'directImpact':floats(area['DirectImpact'],1)[0],'meshRendererPathId':local(area['MeshRenderer'],so),'continuousRefresh':bool(area['ContinuousRefresh'][0]),'transformChain':tr}
    return {'schema':'HKIA.FurnitureLightRegionSource.1','version':'3.0.1','sceneSha256':SCENE_SHA,'sceneCab':SCENE,'presetBundleSha256':PRESET_SHA,'presetCab':PRESETS,'regions':regions,'areaLight':area_row,'presets':presets,'assets':assets,'cubemaps':cubes,'renderFidelity':'unverified'}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('scene',type=Path);p.add_argument('presets',type=Path);p.add_argument('--out',type=Path,required=True);p.add_argument('--staging',type=Path);a=p.parse_args();m=module('extract-furniture-mesh-source');typed=module('extract-furniture-preview-camera');audit=module('audit-native-dye-materials');
    if a.staging:a.staging.mkdir(parents=True,exist_ok=True)
    d=extract(a.scene.read_bytes(),a.presets.read_bytes(),m,typed,lambda b:dict(audit.auditor.extract_nodes(b)[1]),a.staging);a.out.write_text(json.dumps(d,separators=(',',':'))+'\n')

#!/usr/bin/env python3
"""Adapt the existing native crown staging outputs to shared GPU transport.
No generated images or raw game bundles are written to the repository.
"""
import argparse, hashlib, importlib.util, json, math, struct
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
def sha(b):return hashlib.sha256(b).hexdigest()
def require(ok,msg):
    if not ok:raise ValueError(msg)
def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def adapt(crowns,external,source,stage,mesh,typed,audit,forward_rows=None):
    ext={r['cab']+':'+r['pathId']:r for r in external['rows']}
    bycab={}
    textures={}
    def texture(key,material_bundle,material_hash):
        if key in textures:return textures[key]
        cab,pid=key.split(':');meta=crowns['textures'].get(key)
        if meta is not None:
            name=material_bundle;digest=material_hash
        else:
            meta=ext[key];name=meta['bundle'];digest=meta['bundleSha256'];require(meta['classId']==28,'not Texture2D')
        if cab not in bycab:
            raw=(source/(name+'.bin')).read_bytes();require(sha(raw)==digest,'source bundle hash')
            nodes=dict(audit.auditor.extract_nodes(raw)[1]);objs,_=typed.load(nodes[cab],mesh);bycab[cab]=(objs,digest)
        objs,verified=bycab[cab];require(verified==digest,'source identity')
        c,t,b=objs[pid];require(c==28,'Texture2D')
        f=mesh.fields(t,b);require(mesh.string(f['m_Name'])[0]==meta['name'],'texture name')
        w,h,fmt,mips,color,complete=[mesh.u(f[k]) for k in ('m_Width','m_Height','m_TextureFormat','m_MipCount','m_ColorSpace','m_CompleteImageSize')]
        require((w,h,fmt,mips,color,complete)==tuple(meta[k] for k in ('width','height','format','mips','colorSpace','bytes')),'texture metadata')
        sampler=list(struct.unpack('<iifiii',f['m_TextureSettings']))
        data=(stage/(meta['sha256']+'.texture.bin')).read_bytes()
        require(sha(data)==meta['sha256'] and len(data)==complete,'texture payload')
        levels=[];at=0
        for lv in range(mips):
            mw,mh=max(1,w>>lv),max(1,h>>lv)
            z=mw*mh*4 if fmt==4 else ((mw+3)//4)*((mh+3)//4)*(8 if fmt==10 else 16)
            levels.append([mw,mh,at,z,sha(data[at:at+z])]);at+=z
        require(fmt in (4,10,12) and at==len(data),'mip chain')
        textures[key]={'width':w,'height':h,'format':fmt,'colorSpace':color,'sampler':sampler,'bytes':len(data),'sha256':meta['sha256'],'mips':levels}
        return textures[key]
    rows=[]
    for r in crowns['rows']:
        g=(stage/(r['geometrySha256']+'.geometry.bin')).read_bytes()
        require(sha(g)==r['geometrySha256'] and len(g)==r['vertexBytes']+r['indexBytes'],'geometry payload')
        vb=g[:r['vertexBytes']];ib=g[r['vertexBytes']:];stride=len(vb)//r['vertices'];require(stride in (40,44) and len(vb)==stride*r['vertices'],'stride')
        require(all(i<r['vertices'] for i, in struct.iter_unpack('<H',ib)),'index bounds')
        geometry={'geometryBytes':len(g),'geometrySha256':r['geometrySha256'],'meshes':{r['meshPathId']:{'vertexCount':r['vertices'],'indexCount':len(ib)//2,'stride':stride,'channels':r['channels'],'vertexBytes':[0,len(vb),sha(vb)],'indexBytes':[len(vb),len(ib),sha(ib)],'bounds':[r['bounds']]}}}
        maps=r['maps'];tex={k:texture(maps[k][0]+':'+maps[k][1],r['materialBundle'],r['materialBundleSha256']) for k in ('_BaseMap','_MetallicGlossMap','_PatternMap')}
        f=r['properties']['m_Floats'];c=r['properties']['m_Colors'];require(f['_Surface_Effect']==0,'only authored no-effect')
        rows.append({'itemId':r['itemId'],'guid':r['visualGuid'],'geometry':geometry,'textures':tex,'baseST':maps['_BaseMap'][2],'patternST':maps['_PatternMap'][2],'surface':{'baseColor':c['_BaseColor'],'patternColor1':c['_Pattern_Color1'][:3],'patternColor2':c['_Pattern_Color2'][:3],'smoothnessShift':f['_Smoothness_Shift'],'metallicShift':f['_Metallic_Shift'],'patternSmoothnessShift':f['_Smoothness_Shift_Pattern'],'patternMetallicShift':f['_Metallic_Shift_Pattern'],'occlusionStrength':f['_OcclusionStrength'],'surfaceEffect':0}})
        if forward_rows is not None:
            # Keep the original surface diagnostic descriptor unchanged.
            # Read the exact material again for authored keyword selection.
            mc,mp=r['materialRef']
            if mc not in bycab:
                raw=(source/(r['materialBundle']+'.bin')).read_bytes()
                require(sha(raw)==r['materialBundleSha256'],'material bundle hash')
                nodes=dict(audit.auditor.extract_nodes(raw)[1]);objs,_=typed.load(nodes[mc],mesh);bycab[mc]=(objs,r['materialBundleSha256'])
            objs,digest=bycab[mc];cl,tt,bb=objs[mp]
            require(cl==21 and digest==r['materialBundleSha256'] and sha(bb)==r['materialSha256'],'material object identity')
            mf=mesh.fields(tt,bb);kw=mf['m_ValidKeywords'];p=4;keywords=[]
            for _ in range(mesh.u(kw)):
                k,p=mesh.string(kw,p);keywords.append(k)
            require(p==len(kw) and len(keywords)==len(set(keywords)),'keyword array')
            normal=texture(maps['_BumpMap'][0]+':'+maps['_BumpMap'][1],r['materialBundle'],r['materialBundleSha256'])
            reflection=maps['_Lighting_ReflectionMap_Assigned'][:2]
            require(reflection[1]=='0' or reflection==['CAB-6ef5e40a482b00b1d462fae2060592ab','-2018151570093324821'],'unexpected assigned cube')
            material={**rows[-1]['surface'],'baseST':rows[-1]['baseST'],'patternST':rows[-1]['patternST'],'emissionColor':c['_EmissionColor'][:3],'reflectionStrength':f['_ReflectionStrength'],'ambientSaturation':f['_Lighting_Ambient_Saturation'],'rim':{k:f['_Lighting_Rim'+n] for k,n in [('power','Power'),('feathering','Feathering'),('intensity','Intensity'),('coloring','Coloring')]} if 'CUSTOM_RIMLIGHT_ON' in keywords else None}
            forward_rows.append({'itemId':r['itemId'],'guid':r['visualGuid'],'geometry':geometry,'meshId':r['meshPathId'],'textures':{'baseMap':tex['_BaseMap'],'patternMap':tex['_PatternMap'],'comboMap':tex['_MetallicGlossMap'],'normalMap':normal},'material':material,'materialRef':r['materialRef'],'materialSha256':r['materialSha256'],'authoredKeywords':keywords,'authoredReflectionRef':None if reflection[1]=='0' else reflection})
    return sorted(rows,key=lambda r:r['itemId'])
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,required=True);p.add_argument('--crown-manifest',type=Path,required=True);p.add_argument('--stage',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--forward-out',type=Path);a=p.parse_args()
    require(not a.out.resolve().is_relative_to(ROOT),'diagnostic output outside repository')
    if a.forward_out:require(not a.forward_out.resolve().is_relative_to(ROOT) and a.forward_out.resolve()!=a.out.resolve(),'forward output outside repository and distinct')
    forward=[] if a.forward_out else None
    index=json.loads((ROOT/'data/flower-crown-source-index-v3.0.1.json').read_text())
    raw=a.crown_manifest.read_bytes();require(sha(raw)==index['stagedManifestSha256'],'source crown manifest identity')
    crowns=json.loads(raw);external=json.loads((ROOT/'data/flower-external-material-source-v3.0.1.json').read_text())
    rows=adapt(crowns,external,a.root,a.stage,module('extract-furniture-mesh-source'),module('extract-furniture-preview-camera'),module('audit-native-dye-materials'),forward)
    require(len(rows)==25,'coverage')
    output=(json.dumps(rows,separators=(',',':'))+'\n').encode()
    require(sha(output)=='5d6781ee543214858e4d4e5b0f6cb9f5fbc86f542e8a61c662805bef7d39243a','diagnostic manifest identity')
    a.out.write_bytes(output)
    if forward is not None:
        require(len(forward)==25 and sum('CUSTOM_RIMLIGHT_ON' in r['authoredKeywords'] for r in forward)==19 and sum(r['authoredReflectionRef'] is None for r in forward)==3,'forward source coverage')
        a.forward_out.write_text(json.dumps({'schema':'HKIA.FlowerForwardDiagnostic.1','version':'3.0.1','rows':sorted(forward,key=lambda r:r['itemId'])},separators=(',',':'))+'\n')
    print('HKIA_FLOWER_SURFACE_STAGE_OK 25')

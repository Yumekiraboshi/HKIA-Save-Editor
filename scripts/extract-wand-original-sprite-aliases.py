#!/usr/bin/env python3
"""Reuse existing sampled Sprite PathIDs for all native definitions, not edit eligibility."""
import argparse, hashlib, importlib.util, json, struct
from pathlib import Path

def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def sha(b):return hashlib.sha256(b).hexdigest()
def require(ok,msg):
    if not ok:raise ValueError(msg)

D='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0'
C='1b006f3ed28cfb16f4f25738d1d57ec2f86a447bf9e717a85124c3827d78dd09'
ROWS='b616fa26ecf162dcd8172ed57c0f108de905b81f0389ffd2e11ed97075e186c9'
PLACEHOLDER='-6646601456236922891'

def extract(definitions,manifest_bytes):
    require(sha(definitions)==D and sha(manifest_bytes)==C,'source hashes')
    m=json.loads(manifest_bytes);require(m['definitionsSha256']==D,'manifest source')
    audit=module('unityfs-audit');typed=module('extract-furniture-preview-camera')
    mesh=module('extract-furniture-mesh-source')
    objects,_=typed.load(dict(audit.extract_nodes(definitions)[1])['CAB-46b8f8fe122147493b3113f7c1c8cd0f'],mesh)
    all_ids={}
    for _,(cls,t,b) in objects.items():
        if cls!=114 or not {'Id','UiIcon','SerializedGuid'}<=set(n[2] for n in t[-1]):continue
        _,p=mesh.string(b,28);i=mesh.u(b,p+36);f,s=mesh.ptr(b,p+80)
        require(f==0 and i not in all_ids and objects[s][0]==213,'definition UiIcon');all_ids[i]=str(s)
    require(len(all_ids)==12163 and len(set(all_ids.values()))==5020,'definition closure')
    known={int(i):s for i,s in m['items'].items()}
    require(len(known)==8601 and all(all_ids[i]==s for i,s in known.items()),'exact source candidate mapping')
    indexes={r[0]:i for i,r in enumerate(m['sprites'])}
    require(len(indexes)==3150 and set(indexes)==set(known.values()),'sampled source closure')
    all_aliases=[(i,s) for i,s in sorted(all_ids.items()) if i not in known and s in indexes]
    placeholders=sum(s==PLACEHOLDER for i,s in all_aliases)
    rows=[(i,s) for i,s in all_aliases if s!=PLACEHOLDER]
    require(len(all_aliases)==355 and placeholders==149 and len(rows)==206 and len({s for i,s in rows})==179,'alias coverage')
    require(sha(b''.join(struct.pack('<IH',i,indexes[s]) for i,s in rows))==ROWS,'alias fingerprint')
    return {'schema':'HKIA.WandOriginalSpriteAliases.1','version':'3.0.1','definitionsSha256':D,'candidateManifestSha256':C,'scannedDefinitions':12163,'sourceCandidateCount':8601,'alreadyCoveredPlaceholderAliases':149,'count':206,'distinctSprites':179,'indexRowsSha256':ROWS,'rows':rows}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('definitions',type=Path);p.add_argument('--manifest',type=Path,default=Path(__file__).resolve().parents[1]/'public/dynamic-wand-art/candidate-source/index.json');p.add_argument('--out',required=True,type=Path);a=p.parse_args()
    a.out.write_text(json.dumps(extract(a.definitions.read_bytes(),a.manifest.read_bytes()),separators=(',',':'))+'\n')
    print('HKIA_WAND_ORIGINAL_SPRITE_ALIASES_OK 206 original definition aliases')

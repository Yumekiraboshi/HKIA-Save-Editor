#!/usr/bin/env python3
"""Run the reviewed native icon update pipeline in one local command.

The output is a review-only candidate, not a production asset replacement.
Each successful stage is committed atomically and content-verified on resume.
Originals, current public assets and save compatibility are never modified.
"""
import argparse
import importlib.util
import importlib.metadata
import subprocess
import sys
import tempfile
from pathlib import Path

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('icon_source_update',HERE/'icon-source-update.py')
source=importlib.util.module_from_spec(spec);spec.loader.exec_module(source)
require,sha=source.require,source.digest
SCHEMA='HKIA.IconUpdateRun.1'
LAYOUTS={'outfit':'outfit-icon-override-v1','atlas':'unity-v22-uiicon-v1',
         'dynamic':'native-dynamic-v1','auxiliary':'native-icon-auxiliary-v1',
         'result':'native-result-icon-v1'}
STAGES=('snapshot','definition-delta','dynamic-bindings','dynamic-delta','auxiliary-bindings',
        'base-atlas','overrides','dynamic-textures','auxiliary-assets','release','families','summary')
SCRIPTS=('icon-source-update.py','dynamic-icon-source-update.py','extract-icon-auxiliary-source.py',
         'stage-native-icon-atlas.py','stage-icon-overrides.py','stage-dynamic-icon-textures.py',
         'stage-icon-auxiliary-assets.py','assemble-icon-release.py','compile-icon-family-bindings.py')

def hash_record(value):
    return sha(source.stable(value))

def checked_record(path,schema,field='receiptSha256'):
    v=source.read_json(path)
    require(v.get('schema')==schema and v.get(field)==hash_record({k:x for k,x in v.items() if k!=field}),
            'invalid record: '+str(path))
    return v

def commit_record(path,value,field='receiptSha256'):
    v={**value,field:hash_record(value)}
    source.write_new(path,v)
    return v

def outside(path):
    require(path!=source.ROOT and source.ROOT not in path.parents,
            'candidate output must remain outside repository')

def input_file(root,record):
    require(isinstance(record.get('file'),str) and source.SHA.fullmatch(record.get('sha256','')),
            'explicit input path and SHA-256 required')
    path=(root/record['file']).resolve(strict=True)
    require(path.is_file() and source.file_digest(path)==record['sha256'],
            'original/input fingerprint mismatch: '+str(path))
    return {'file':str(path),'sha256':record['sha256']}

def load_input(path):
    v=source.read_json(path)
    require(v.get('schema')=='HKIA.IconUpdateInput.1','invalid update input schema')
    source.checked_release(v['version'],v['platform'])
    require(v.get('reviewedLayouts')==LAYOUTS,'review all candidate native layouts before updating')
    entries=v['bundles']
    require(isinstance(entries,list) and len(entries)>0 and len(entries)<=2048,'input bundle count')
    bundles={}
    for e in entries:
        name=e['name']
        require(source.BUNDLE.fullmatch(name) and name not in bundles,'duplicate/invalid bundle name')
        bundles[name]={'name':name,**input_file(path.parent,e)}
    require('definitions' in bundles,'missing definitions bundle')
    require(len({e['file'] for e in bundles.values()})==len(bundles),'repeated source bundle path')
    overrides=v['overrideBundles']
    require(isinstance(overrides,list) and bool(overrides) and len(set(overrides))==len(overrides) and
            set(overrides)<=set(bundles),'explicit original override bundle selection required')
    config={'version':v['version'],'platform':v['platform'],'reviewedLayouts':LAYOUTS,
            'bundles':[bundles[k] for k in sorted(bundles)],'overrideBundles':sorted(overrides),
            'catalog':input_file(path.parent,v['catalog'])}
    if 'overrideDefinitions' in v:
        item=v['overrideDefinitions']
        source.checked_release(v['version'],item['platform'])
        require(item['platform']!=v['platform'],'use primary definitions for same-platform overrides')
        config['overrideDefinitions']={'platform':item['platform'],**input_file(path.parent,item)}
    if 'reviewedSwatchLayout' in v:
        layout=v['reviewedSwatchLayout']
        require(layout['bundle'] in bundles and all(source.SHA.fullmatch(layout[k])
                for k in ('objectSha256','schemaSha256')) and
                all(isinstance(layout[k],str) and 0<len(layout[k])<=128
                    for k in ('swatchMapField','rgbaField')),'invalid reviewed swatch layout')
        config['reviewedSwatchLayout']=layout
    return config

def tree_digest(folder):
    """Hash actual file contents + relative names; never follow output links."""
    require(folder.is_dir() and not folder.is_symlink(),'invalid stage output directory')
    records=[]
    for path in sorted(folder.rglob('*')):
        require(not path.is_symlink(),'unexpected stage output symlink')
        if path.is_dir():continue
        require(path.is_file(),'nonregular stage output')
        rel=path.relative_to(folder).as_posix()
        if rel=='step.json':continue
        records.append([rel,path.stat().st_size,source.file_digest(path)])
    require(bool(records),'empty stage output')
    return {'fileCount':len(records),'treeSha256':hash_record(records)}

def stage_record(folder,context,stage):
    v=checked_record(folder/'step.json','HKIA.IconUpdateStep.1')
    require(v['contextSha256']==context and v['stage']==stage and
            v['output']==tree_digest(folder),'stage output changed: '+stage)
    return v

def stage_path(root,name):
    return root/'steps'/name

def previous_context(root,platform):
    if root is None:return None
    v=checked_record(root/'run.json',SCHEMA)
    require(v['config']['platform']==platform,'previous update requires same artwork platform')
    # A previous *candidate* may contain explicit unresolved sources, but
    # its checkpointed source files must be intact before any reuse.
    stages={}
    for name in ('snapshot','dynamic-bindings','base-atlas','overrides','dynamic-textures','auxiliary-assets'):
        folder=stage_path(root,name)
        stages[name]=stage_record(folder,v['receiptSha256'],name)['receiptSha256']
    return {'directory':str(root),'runSha256':v['receiptSha256'],'stages':stages}

def implementation_identity():
    # Include typed readers and other transitively imported Python helpers.
    # Conservative on code changes: start a new run, reuse verified prior
    # original assets through --previous-run rather than stale checkpoints.
    for name in SCRIPTS:
        require((HERE/name).is_file(),'pipeline dependency missing: '+name)
    scripts={p.name:source.file_digest(p) for p in sorted(HERE.glob('*.py'))}
    try:pillow=importlib.metadata.version('Pillow')
    except importlib.metadata.PackageNotFoundError:pillow=None
    return {'scriptsSha256':hash_record(scripts),'python':sys.version,'pillow':pillow}

def command(script,args):
    print('  '+script,flush=True)
    subprocess.run([sys.executable,str(HERE/script),*map(str,args)],check=True)

def stage_once(root,context,name,dependencies,produce):
    target=stage_path(root,name)
    require(name in STAGES,'unexpected pipeline stage')
    if target.exists():
        v=stage_record(target,context,name)
        require(v['dependencies']==dependencies,'stage dependency changed: '+name)
        print('REUSE '+name,flush=True)
        return target,v['receiptSha256']
    print('RUN '+name,flush=True)
    with tempfile.TemporaryDirectory(prefix='.'+name+'-',dir=root/'steps') as tmp:
        output=Path(tmp)/'completed';output.mkdir()
        produce(output)
        result=tree_digest(output)
        receipt=commit_record(output/'step.json',{'schema':'HKIA.IconUpdateStep.1',
            'contextSha256':context,'stage':name,'dependencies':dependencies,'output':result})
        require(not target.exists(),'concurrent stage output')
        output.rename(target)
    return target,receipt['receiptSha256']

def run(input_path,root,previous=None,resume=False,execute=command):
    root=root.resolve();outside(root)
    if previous is not None:
        previous=previous.resolve(strict=True)
        require(root!=previous and root not in previous.parents and previous not in root.parents,
                'previous/current candidate directories must be separate')
    config=load_input(input_path.resolve(strict=True))
    prior=previous_context(previous,config['platform'])
    value={'schema':SCHEMA,'config':config,'previous':prior,'implementation':implementation_identity(),
           'automaticReleaseActivationAuthorized':False}
    identity=hash_record(value)
    if root.exists():
        require(resume,'output exists; use --resume for exactly the same run')
        old=checked_record(root/'run.json',SCHEMA)
        require(old['receiptSha256']==identity,'run inputs or implementation changed; use a new output directory')
        require((root/'steps').is_dir() and not (root/'steps').is_symlink(),'missing stage directory')
    else:
        require(not resume,'cannot resume absent output directory')
        root.parent.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='.hkia-update-',dir=root.parent) as tmp:
            new=Path(tmp)/'run';new.mkdir();(new/'steps').mkdir()
            commit_record(new/'run.json',value)
            require(not root.exists(),'concurrent run output')
            new.rename(root)
    done={}
    def step(name,needs,produce):
        folder,digest=stage_once(root,identity,name,{k:done[k][1] for k in needs},produce)
        done[name]=(folder,digest)
        return folder
    def previous_stage(name,sub='output'):
        return ['--previous-stage',stage_path(previous,name)/sub] if previous else []
    def old_file(name,file):
        return stage_path(previous,name)/file
    bundles={b['name']:b for b in config['bundles']}
    definition=bundles['definitions']
    version,platform=config['version'],config['platform']
    def snapshot(out):
        execute('icon-source-update.py',['snapshot','--version',version,'--platform',platform,
            '--definitions',definition['file'],'--expected-definitions-sha256',definition['sha256'],
            '--reviewed-outfit-layout',LAYOUTS['outfit'],'--out',out/'snapshot.json',
            *[x for name,b in bundles.items() if name!='definitions' for x in ('--bundle',name+'='+b['file'])]])
        primary=source.read_json(out/'snapshot.json');source.validate_snapshot(primary)
        require(all(primary['sourceBundleSha256'].get(n)==b['sha256'] for n,b in bundles.items()) and
                set(primary['locallyObservedBundles'])==set(bundles),'input bundle changed during snapshot')
        override=primary
        if config.get('overrideDefinitions'):
            d=config['overrideDefinitions']
            execute('icon-source-update.py',['snapshot','--version',version,'--platform',d['platform'],
                '--definitions',d['file'],'--expected-definitions-sha256',d['sha256'],
                '--reviewed-outfit-layout',LAYOUTS['outfit'],'--out',out/'override-snapshot.json'])
            override=source.read_json(out/'override-snapshot.json');source.validate_snapshot(override)
        common={'version':version,'platform':platform}
        atlas={**common,'schema':'HKIA.NativeIconAtlasInput.1',
               'definitionSnapshotSha256':primary['snapshotSha256'],'reviewedLayout':LAYOUTS['atlas'],
               'bundles':config['bundles']}
        if 'reviewedSwatchLayout' in config:atlas['reviewedSwatchLayout']=config['reviewedSwatchLayout']
        source.write_new(out/'atlas-input.json',atlas)
        source.write_new(out/'override-input.json',{**common,'schema':'HKIA.IconOverrideBundleInput.1',
            'definitionSnapshotSha256':override['snapshotSha256'],
            'bundles':[bundles[n] for n in config['overrideBundles']]})
    s=step('snapshot',[],snapshot)
    snapshot_path=s/'snapshot.json'
    override_snapshot=s/'override-snapshot.json' if config.get('overrideDefinitions') else snapshot_path
    def definition_delta(out):
        if previous:
            execute('icon-source-update.py',['diff','--before',old_file('snapshot','snapshot.json'),
                '--after',snapshot_path,'--out',out/'delta.json'])
        else:source.write_new(out/'delta.json',{'comparison':'no-previous-run','automaticReleaseActivationAuthorized':False})
    step('definition-delta',['snapshot'],definition_delta)
    d=step('dynamic-bindings',['snapshot'],lambda out:execute('dynamic-icon-source-update.py',[
        'scan','--snapshot',snapshot_path,'--definitions',definition['file'],
        '--reviewed-layout',LAYOUTS['dynamic'],'--out',out/'dynamic.json']))
    def dynamic_delta(out):
        if previous:
            execute('dynamic-icon-source-update.py',['diff','--before',old_file('dynamic-bindings','dynamic.json'),
                '--after',d/'dynamic.json','--out',out/'delta.json'])
        else:source.write_new(out/'delta.json',{'comparison':'no-previous-run','automaticReleaseActivationAuthorized':False})
    step('dynamic-delta',['dynamic-bindings'],dynamic_delta)
    a=step('auxiliary-bindings',['snapshot'],lambda out:execute('extract-icon-auxiliary-source.py',[
        '--snapshot',snapshot_path,'--definitions',definition['file'],
        '--reviewed-layout',LAYOUTS['auxiliary'],'--out',out/'auxiliary.json']))
    b=step('base-atlas',['snapshot'],lambda out:execute('stage-native-icon-atlas.py',[
        '--snapshot',snapshot_path,'--bundles',s/'atlas-input.json','--out',out/'output',*previous_stage('base-atlas')]))
    o=step('overrides',['snapshot'],lambda out:execute('stage-icon-overrides.py',[
        '--snapshot',override_snapshot,'--bundles',s/'override-input.json','--out',out/'output',*previous_stage('overrides')]))
    t=step('dynamic-textures',['snapshot','dynamic-bindings'],lambda out:execute('stage-dynamic-icon-textures.py',[
        '--snapshot',snapshot_path,'--dynamic-receipt',d/'dynamic.json','--bundles',s/'atlas-input.json',
        '--out',out/'output',*previous_stage('dynamic-textures')]))
    x=step('auxiliary-assets',['snapshot','auxiliary-bindings'],lambda out:execute('stage-icon-auxiliary-assets.py',[
        '--snapshot',snapshot_path,'--auxiliary',a/'auxiliary.json','--bundles',s/'atlas-input.json',
        '--out',out/'output',*previous_stage('auxiliary-assets')]))
    def assemble(out):
        require(source.file_digest(Path(config['catalog']['file']))==config['catalog']['sha256'],
                'catalog changed during update')
        execute('assemble-icon-release.py',['--snapshot',snapshot_path,'--override-snapshot',override_snapshot,
        '--definitions',definition['file'],'--catalog',config['catalog']['file'],'--base-stage',b/'output',
        '--override-stage',o/'output','--dynamic-receipt',d/'dynamic.json','--dynamic-stage',t/'output',
        '--reviewed-result-layout',LAYOUTS['result'],'--out',out/'output'])
        require(source.file_digest(Path(config['catalog']['file']))==config['catalog']['sha256'],
                'catalog changed during assembly')
    rel=step('release',['snapshot','base-atlas','overrides','dynamic-bindings','dynamic-textures'],assemble)
    f=step('families',['dynamic-bindings','auxiliary-bindings','auxiliary-assets','release'],
        lambda out:execute('compile-icon-family-bindings.py',['--dynamic',d/'dynamic.json',
        '--auxiliary',a/'auxiliary.json','--auxiliary-stage',x/'output','--release',rel/'output',
        '--out',out/'family-bindings.json']))
    def summary(out):
        release=checked_record(rel/'output'/'release-candidate.json','HKIA.IconReleaseCandidate.1')
        aux=checked_record(x/'output'/'index.json','HKIA.IconAuxiliaryAssetStage.1')
        families=source.read_json(f/'family-bindings.json')
        require(release['version']==aux['version']==families['version']==version and
                families['dynamicIndexSha256']==source.file_digest(rel/'output'/'dynamic-source-pages'/'index.json') and
                families['auxiliaryIndexSha256']==source.file_digest(x/'output'/'dynamic-source-pages'/'index.json'),
                'candidate index binding mismatch')
        blockers={'inventorySourceItemIds':release['unresolvedInventorySourceItemIds'],
                  'collectionBaseItemIds':release['missingCollectionBaseItemIds'],
                  'collectionOwnImageItemIds':[i for i,_,missing in release['collectionOwnRoutes'] if missing],
                  'inventoryBaseItemIds':release.get('missingInventoryBaseItemIds',[]),
                  'originalUiIconItemIds':release['unresolvedOriginalUiIconItemIds'],
                  'auxiliarySpriteRoutes':aux['unresolved'],'chefSwatches':aux['unresolvedSwatches']}
        source.write_new(out/'candidate.json',{'schema':'HKIA.IconUpdateCandidate.1','version':version,'platform':platform,
            'runSha256':identity,'definitionCount':release['definitionCount'],'sourceBlockers':blockers,
            'releaseDirectory':(rel/'output').relative_to(root).as_posix(),
            'auxiliaryDirectory':(x/'output').relative_to(root).as_posix(),
            'familyBindings':(f/'family-bindings.json').relative_to(root).as_posix(),
            'familyBindingsSha256':source.file_digest(f/'family-bindings.json'),
            'releaseReceiptFileSha256':source.file_digest(rel/'output'/'release-candidate.json'),
            'dynamicIndexSha256':families['dynamicIndexSha256'],
            'auxiliaryIndexSha256':families['auxiliaryIndexSha256'],
            'remainingReleaseChecks':release['remainingReleaseChecks'],
            'automaticReleaseActivationAuthorized':False})
    out=step('summary',['definition-delta','dynamic-delta','release','auxiliary-assets','families'],summary)
    report=source.read_json(out/'candidate.json')
    print('HKIA_ICON_UPDATE_CANDIDATE',str(out/'candidate.json'),flush=True)
    for k,ids in report['sourceBlockers'].items():print('  '+k+': '+str(len(ids)),flush=True)
    print('REVIEW REQUIRED; no release or save version activated.',flush=True)
    return report

def self_test():
    with tempfile.TemporaryDirectory() as tmp:
        root=Path(tmp);(root/'steps').mkdir()
        context='a'*64;called=[]
        def produce(out):
            called.append(1);(out/'data').write_bytes(b'original')
        a,h=stage_once(root,context,'snapshot',{},produce)
        assert stage_once(root,context,'snapshot',{},produce)==(a,h) and called==[1]
        def fail(out):
            (out/'partial').write_bytes(b'incomplete');raise RuntimeError('interrupted')
        try:stage_once(root,context,'base-atlas',{'snapshot':h},fail)
        except RuntimeError:pass
        else:raise AssertionError('failed stage succeeded')
        assert not stage_path(root,'base-atlas').exists()
        b,j=stage_once(root,context,'base-atlas',{'snapshot':h},produce)
        assert (b/'data').read_bytes()==b'original'
        for bad_context,bad_deps in [('b'*64,{'snapshot':h}),(context,{'snapshot':'c'*64})]:
            try:stage_once(root,bad_context,'base-atlas',bad_deps,produce)
            except ValueError:pass
            else:raise AssertionError('reused mismatched checkpoint')
        (a/'data').write_bytes(b'tampered')
        try:stage_once(root,context,'snapshot',{},produce)
        except ValueError:pass
        else:raise AssertionError('reused tampered checkpoint')
        assert called==[1,1]
    print('HKIA_ICON_UPDATE_PIPELINE_SELF_TEST_OK')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input',type=Path);p.add_argument('--out',type=Path)
    p.add_argument('--previous-run',type=Path);p.add_argument('--resume',action='store_true')
    p.add_argument('--self-test',action='store_true')
    a=p.parse_args()
    if a.self_test:self_test()
    elif a.input and a.out:run(a.input,a.out,a.previous_run,a.resume)
    else:p.error('provide --input and --out')

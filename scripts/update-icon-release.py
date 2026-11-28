#!/usr/bin/env python3
"""Run the reviewed native icon update pipeline in one local command.

The output is a review-only candidate, not a production asset replacement.
Each successful stage is committed atomically and content-verified on resume.
Originals, current public assets and save compatibility are never modified.
"""
import argparse
import importlib.util
import importlib.metadata
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('icon_source_update',HERE/'icon-source-update.py')
source=importlib.util.module_from_spec(spec);spec.loader.exec_module(source)
require,sha=source.require,source.digest
SCHEMA='HKIA.IconUpdateRun.1'
ARTWORK_POLICY='native-resolution-lossless-webp-v1'
LAYOUTS={'outfit':'outfit-icon-override-v1','atlas':'unity-v22-uiicon-v1',
         'dynamic':'native-dynamic-v1','auxiliary':'native-icon-auxiliary-v1',
         'result':'native-result-icon-v1'}
STAGES=('snapshot','definition-delta','dynamic-bindings','dynamic-delta','auxiliary-bindings',
        'base-atlas','overrides','dynamic-textures','auxiliary-assets','release','families','achievement-art','category-art','distribution','summary')
SCRIPTS=('icon-source-update.py','dynamic-icon-source-update.py','extract-icon-auxiliary-source.py',
         'stage-native-icon-atlas.py','stage-icon-overrides.py','stage-dynamic-icon-textures.py',
         'stage-icon-auxiliary-assets.py','assemble-icon-release.py','compile-icon-family-bindings.py',
         'native-raster-webp.py','stage-achievement-art.py','stage-category-art.py')

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
            'catalog':input_file(path.parent,v['catalog']),'artworkPolicy':ARTWORK_POLICY}
    require(v.get('artworkPolicy',ARTWORK_POLICY)==ARTWORK_POLICY,'obsolete resized artwork policy')
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
    for key,fields in (('achievementArt',('census','index','hierarchy')),('categoryArt',('census','scope'))):
        if key in v:
            require(isinstance(v[key],dict) and set(v[key])==set(fields),'incomplete reviewed '+key+' inputs')
            config[key]={field:input_file(path.parent,v[key][field]) for field in fields}
    return config

def check_view_inputs(config,kind,snapshot):
    """Bind optional reviewed view-art inputs to this run, not a prior catalog."""
    records=config[kind]
    for rec in records.values():
        require(source.file_digest(Path(rec['file']))==rec['sha256'],'view art input changed: '+kind)
    census=source.read_json(Path(records['census']['file']))
    require(census['version']==config['version'] and census['platform']==config['platform'] and
            census['definitionsSha256']==snapshot['sourceBundleSha256']['definitions'],
            'view art census original identity mismatch')
    if kind=='achievementArt':
        require(census['catalogIndexFileSha256']==records['index']['sha256'] and
                census['catalogHierarchyFileSha256']==records['hierarchy']['sha256'],
                'achievement catalog fingerprint mismatch')
    else:
        require(census['scopeFileSha256']==records['scope']['sha256'],'category scope fingerprint mismatch')
        scope=source.read_json(Path(records['scope']['file']))
        catalog=source.read_json(Path(config['catalog']['file']))
        require(source.file_digest(Path(config['catalog']['file']))==config['catalog']['sha256'] and
                set(scope['collectionKeys'])=={g[0] for g in catalog['groups']} and
                set(scope['itemIds'])==set(source.validate_snapshot(snapshot)),
                'category scope differs from current collection/item catalog')
    return records

def view_art_summary(path,kind,config):
    if path is None:
        return None,[],[kind]
    file=path/'output'/('achievement-art.json' if kind=='achievementArt' else 'category-art.json')
    value=source.read_json(file)
    schema='HKIA.AchievementArtCandidate.2' if kind=='achievementArt' else 'HKIA.CategoryArtCandidate.2'
    require(value['schema']==schema and value['version']==config['version'] and
            value['platform']==config['platform'] and
            value['definitionsSha256']==next(b['sha256'] for b in config['bundles'] if b['name']=='definitions') and
            value['sourceCensusFileSha256']==config[kind]['census']['sha256'] and
            value['artworkPolicy']==ARTWORK_POLICY and value['automaticReleaseActivationAuthorized'] is False,'view artwork candidate identity mismatch')
    missing=[]
    for row in value['rows']:
        if kind=='achievementArt' and row['icon']['kind']=='unresolved':
            missing.append(row['saveGuid'])
        elif kind=='categoryArt' and row['native']['kind']=='unresolved':
            missing.append(row['domain']+':'+row['key'])
    require(len(missing)==value['unresolvedCount'],'view artwork unresolved partition mismatch')
    return file,sorted(missing),[]

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
    for name in ('achievement-art','category-art'):
        if stage_path(root,name).exists():
            stages[name]=stage_record(stage_path(root,name),v['receiptSha256'],name)['receiptSha256']
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
        if not previous:return []
        if name in ('base-atlas','overrides'):
            old=checked_record(previous/'run.json',SCHEMA)
            if old['config'].get('artworkPolicy')!=ARTWORK_POLICY:
                # A resized prior release is not a source for native artwork.
                return []
        return ['--previous-stage',stage_path(previous,name)/sub]
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
        '--snapshot',snapshot_path,'--bundles',s/'atlas-input.json','--native-resolution','--out',out/'output',*previous_stage('base-atlas')]))
    o=step('overrides',['snapshot'],lambda out:execute('stage-icon-overrides.py',[
        '--snapshot',override_snapshot,'--bundles',s/'override-input.json','--native-resolution','--out',out/'output',*previous_stage('overrides')]))
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
        '--reviewed-result-layout',LAYOUTS['result'],'--native-resolution','--out',out/'output'])
        require(source.file_digest(Path(config['catalog']['file']))==config['catalog']['sha256'],
                'catalog changed during assembly')
    rel=step('release',['snapshot','base-atlas','overrides','dynamic-bindings','dynamic-textures'],assemble)
    f=step('families',['dynamic-bindings','auxiliary-bindings','auxiliary-assets','release'],
        lambda out:execute('compile-icon-family-bindings.py',['--dynamic',d/'dynamic.json',
        '--auxiliary',a/'auxiliary.json','--auxiliary-stage',x/'output','--release',rel/'output',
        '--out',out/'family-bindings.json']))
    # Main item and dynamic artwork still use the existing pipeline. Reviewed
    # achievement/category pointers are optional inputs; absence is an
    # explicit source blocker, not successful coverage.
    def stage_view_art(kind,script,schema,fields,out):
        primary=source.read_json(snapshot_path)
        records=check_view_inputs(config,kind,primary)
        source.write_new(out/'bundle-input.json',{'schema':schema,'version':version,'platform':platform,
            'censusFileSha256':records['census']['sha256'],'bundles':config['bundles']})
        execute(script,[*[x for field in fields for x in ('--'+field,records[field]['file'])],
            '--bundles',out/'bundle-input.json','--out',out/'output',
            *(['--previous-stage',stage_path(previous,'achievement-art' if kind=='achievementArt' else 'category-art')/'output']
              if prior and ('achievement-art' if kind=='achievementArt' else 'category-art') in prior['stages']
              and checked_record(previous/'run.json',SCHEMA)['config'].get('artworkPolicy')==ARTWORK_POLICY else [])])
        check_view_inputs(config,kind,primary)
    achievement=None
    category=None
    if 'achievementArt' in config:
        achievement=step('achievement-art',['snapshot'],lambda out:stage_view_art(
            'achievementArt','stage-achievement-art.py','HKIA.AchievementArtBundleInput.1',
            ('census','index','hierarchy'),out))
    if 'categoryArt' in config:
        category=step('category-art',['snapshot','release'],lambda out:stage_view_art(
            'categoryArt','stage-category-art.py','HKIA.CategoryArtBundleInput.1',
            ('census','scope'),out))
    def distribution(out):
        # The final candidate has exactly one copy of each static original
        # image, even if item, category and achievement routes share it.
        # Source stages are private checkpoints, never the delivery root.
        for p in sorted((rel/'output').rglob('*')):
            if p.is_file():
                target=out/p.relative_to(rel/'output');target.parent.mkdir(parents=True,exist_ok=True)
                shutil.copyfile(p,target)
        shutil.copyfile(f/'family-bindings.json',out/'family-bindings.json')
        shutil.copytree(x/'output'/'dynamic-source-pages',out/'auxiliary-source-pages')
        for kind,folder in (('achievementArt',achievement),('categoryArt',category)):
            manifest,_,_=view_art_summary(folder,kind,config)
            if manifest is None:continue
            value=source.read_json(manifest)
            field='icon' if kind=='achievementArt' else 'native'
            assets={row[field]['asset']['file']:row[field]['asset'] for row in value['rows'] if row[field]['kind']=='sprite'}
            require(len(assets)==value['uniqueAssetCount'] and sum(a['bytes'] for a in assets.values())==value['imageBytes'],'view artwork asset census')
            for name,a in assets.items():
                require(source.SHA.fullmatch(a['sha256']) and name==a['sha256']+'.webp' and a['conversion']==ARTWORK_POLICY,'original view asset policy')
                raw=manifest.parent/name;target=out/'native-art'/name
                require(raw.stat().st_size==a['bytes'] and source.file_digest(raw)==a['sha256'],'view artwork bytes')
                if target.exists():
                    require(target.stat().st_size==a['bytes'] and source.file_digest(target)==a['sha256'],'conflicting shared image')
                else:shutil.copyfile(raw,target)
            shutil.copyfile(manifest,out/manifest.name)
        files={p.relative_to(out).as_posix():{'bytes':p.stat().st_size,'sha256':source.file_digest(p)}
               for p in sorted(out.rglob('*')) if p.is_file()}
        source.write_new(out/'distribution.json',{'schema':'HKIA.NativeArtDistribution.1','version':version,'platform':platform,
            'artworkPolicy':ARTWORK_POLICY,'files':files,'totalBytes':sum(a['bytes'] for a in files.values()),
            'staticImageCount':sum(k.startswith('native-art/') and k.endswith('.webp') for k in files),
            'staticImageBytes':sum(a['bytes'] for k,a in files.items() if k.startswith('native-art/') and k.endswith('.webp')),
            'automaticReleaseActivationAuthorized':False})
    dist=step('distribution',['release','families','auxiliary-assets']+[n for n in ('achievement-art','category-art') if n in done],distribution)
    def summary(out):
        release=checked_record(rel/'output'/'release-candidate.json','HKIA.IconReleaseCandidate.1')
        aux=checked_record(x/'output'/'index.json','HKIA.IconAuxiliaryAssetStage.1')
        families=source.read_json(f/'family-bindings.json')
        require(release['version']==aux['version']==families['version']==version and
                families['dynamicIndexSha256']==source.file_digest(rel/'output'/'dynamic-source-pages'/'index.json') and
                families['auxiliaryIndexSha256']==source.file_digest(x/'output'/'dynamic-source-pages'/'index.json'),
                'candidate index binding mismatch')
        require(release.get('artworkPolicy')==ARTWORK_POLICY,'resized candidate output forbidden')
        blockers={'inventorySourceItemIds':release['unresolvedInventorySourceItemIds'],
                  'collectionBaseItemIds':release['missingCollectionBaseItemIds'],
                  'collectionOwnImageItemIds':[i for i,_,missing in release['collectionOwnRoutes'] if missing],
                  'inventoryBaseItemIds':release.get('missingInventoryBaseItemIds',[]),
                  'originalUiIconItemIds':release['unresolvedOriginalUiIconItemIds'],
                  'auxiliarySpriteRoutes':aux['unresolved'],'chefSwatches':aux['unresolvedSwatches']}
        view_arts={};absent=[]
        for kind,folder in (('achievementArt',achievement),('categoryArt',category)):
            file,missing,omitted=view_art_summary(folder,kind,config)
            blockers[kind+'Unresolved']=missing;absent.extend(omitted)
            if file is not None:
                view_arts[kind]={'manifest':(dist/file.name).relative_to(root).as_posix(),'manifestFileSha256':source.file_digest(file)}
        blockers['missingViewArtInputs']=absent
        distribution=source.read_json(dist/'distribution.json')
        source.write_new(out/'candidate.json',{'schema':'HKIA.IconUpdateCandidate.1','version':version,'platform':platform,
            'runSha256':identity,'definitionCount':release['definitionCount'],'sourceBlockers':blockers,
            'artworkPolicy':ARTWORK_POLICY,'nativeStaticAssetCount':release['nativeStaticAssetCount'],
            'nativeStaticImageBytes':release['nativeStaticImageBytes'],
            'candidateReleaseBytes':sum(x['bytes'] for x in release['outputFiles'].values())+ (rel/'output'/'release-candidate.json').stat().st_size,
            'auxiliaryPageBytes':sum(p.stat().st_size for p in (x/'output'/'dynamic-source-pages').glob('*.webp')), 
            'releaseDirectory':(rel/'output').relative_to(root).as_posix(),
            'auxiliaryDirectory':(x/'output').relative_to(root).as_posix(),
            'familyBindings':(f/'family-bindings.json').relative_to(root).as_posix(),
            'familyBindingsSha256':source.file_digest(f/'family-bindings.json'),
            'releaseReceiptFileSha256':source.file_digest(rel/'output'/'release-candidate.json'),
            'dynamicIndexSha256':families['dynamicIndexSha256'],
            'auxiliaryIndexSha256':families['auxiliaryIndexSha256'],
            'dynamicRasterResolution':'native',
            'viewArtwork':view_arts,'distributionDirectory':dist.relative_to(root).as_posix(),
            'distributionFileSha256':source.file_digest(dist/'distribution.json'),
            'distributionBytes':distribution['totalBytes']+(dist/'distribution.json').stat().st_size,
            'distributionStaticImageCount':distribution['staticImageCount'],'distributionStaticImageBytes':distribution['staticImageBytes'],
            'remainingReleaseChecks':release['remainingReleaseChecks']+(['review original achievement/category pointer censuses'] if absent else []),
            'automaticReleaseActivationAuthorized':False})
    out=step('summary',['definition-delta','dynamic-delta','release','auxiliary-assets','families','distribution']+
             [n for n in ('achievement-art','category-art') if n in done],summary)
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

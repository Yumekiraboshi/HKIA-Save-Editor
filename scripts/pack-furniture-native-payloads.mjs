/** Stage extracted original geometry/textures/cubes for an isolated browser
 * diagnostic. No variant images, no bundles, no save files and no upload.
 * node scripts/pack-furniture-native-payloads.mjs --stage ... --patterns ... --out ...
 */
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,renameSync,rmSync,existsSync,realpathSync,lstatSync} from 'node:fs';
import {join,resolve,relative,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
const repo=fileURLToPath(new URL('../',import.meta.url));
const read=name=>JSON.parse(readFileSync(join(repo,'data',name),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const inside=(p,root)=>{const r=relative(root,p);return r===''||(!isAbsolute(r)&&r!=='..'&&!r.startsWith('../')&&!r.startsWith('..\\'));};
const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
export function furniturePayloadPlan(stage,patterns){
 const plan=[];
 const add=(kind,sha256,bytes,path)=>plan.push({kind,sha256,bytes,path});
 for(const g of read('furniture-mesh-source-sample-v3.0.1.json').rows)add('geometry',g.geometrySha256,g.geometryBytes,join(stage,'mesh',g.itemId+'.geometry.bin'));
 for(const t of Object.values(read('furniture-base-material-source-v3.0.1.json').textures))add('texture',t.sha256,t.bytes,join(stage,'base',t.sha256+'.texture.bin'));
 for(const t of read('furniture-pattern-texture-sample-v3.0.1.json').rows)add('texture',t.sha256,t.bytes,join(stage,'pattern',t.guid+'.texture.bin'));
 for(const t of read('furniture-chair-pattern-sources-v3.0.1.json').rows)add('texture',t.sha256,t.bytes,join(patterns,t.guid+'.texture.bin'));
 for(const t of Object.values(read('furniture-light-region-source-v3.0.1.json').cubemaps))add('cube',t.sha256,t.bytes,join(stage,'cube',t.sha256+'.cubemap.bin'));
 return plan;
}
/** Atomic local output. Every source copy is checked, even duplicate hashes. */
export function packFurniturePayloads(plan,out){
 assert(!existsSync(out),'OUTPUT_EXISTS');
 const parent=realpathSync(dirname(out)),target=join(parent,resolve(out).split(/[\\/]/).at(-1));
 assert(!inside(target,realpathSync(repo)),'OUTPUT_INSIDE_REPOSITORY');
 assert(!existsSync(target),'OUTPUT_EXISTS');
 const tmp=mkdtempSync(join(parent,'.furniture-payload-'));
 try{
  const seen=new Map();
  for(const row of plan){
   const {kind,sha256,bytes,path}=row;
   assert(['geometry','texture','cube'].includes(kind)&&/^[0-9a-f]{64}$/.test(sha256)&&Number.isSafeInteger(bytes)&&bytes>0&&bytes<=96*1024*1024,'INVALID_PAYLOAD_REFERENCE');
   const key=kind+'/'+sha256,old=seen.get(key);
   assert(!old||old.bytes===bytes,'CONFLICTING_PAYLOAD_LENGTH');
   const stat=lstatSync(path);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size===bytes,'SOURCE_LENGTH '+key);
   const b=readFileSync(path);assert(b.length===bytes&&sha(b)===sha256,'SOURCE_HASH '+key);
   if(old)continue;
   mkdirSync(join(tmp,kind),{recursive:true});
   writeFileSync(join(tmp,key+'.bin'),b,{flag:'wx'});seen.set(key,{kind,sha256,bytes});
  }
  const refs=[...seen.values()].sort((a,b)=>(a.kind+'/'+a.sha256).localeCompare(b.kind+'/'+b.sha256));
  const index={schema:'HKIA.FurniturePayloadPack.1',version:'3.0.1',payloads:refs};
  writeFileSync(join(tmp,'index.json'),JSON.stringify(index)+'\n',{flag:'wx'});
  assert(!existsSync(target),'OUTPUT_EXISTS');
  renameSync(tmp,target);
  return {payloads:refs.length,bytes:refs.reduce((n,r)=>n+r.bytes,0)};
 }finally{rmSync(tmp,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {values:a}=parseArgs({options:{stage:{type:'string'},patterns:{type:'string'},out:{type:'string'}}});
 assert(a.stage&&a.patterns&&a.out,'--stage --patterns --out required');
 const stage=realpathSync(a.stage),patterns=realpathSync(a.patterns),out=resolve(a.out);
 const target=join(realpathSync(dirname(out)),out.split(/[\\/]/).at(-1));
 assert(!inside(target,stage)&&!inside(target,patterns),'OUTPUT_INSIDE_SOURCE');
 console.log('HKIA_FURNITURE_PAYLOAD_PACK '+JSON.stringify(packFurniturePayloads(furniturePayloadPlan(stage,patterns),out)));
}

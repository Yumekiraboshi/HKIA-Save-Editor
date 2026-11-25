/** Compare neutral UiIcon with genuine named-colorway originals.
 * Diagnostic only: never registers images or changes public/dist files.
 * Holdout predictions use one original; the target original is never fitted.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright-core';
import {sourceIconGroups,selectGameIconSources} from './generate-native-dye-icons.mjs';
import {fitNeutralAnchor,renderNeutralAnchor} from './fit-neutral-anchor.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=p=>JSON.parse(readFileSync(join(root,p),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const colors=p=>p.colors.map(c=>c===null?null:[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255));
const cell=s=>[s.group,s.sheet,s.cell].join(':');
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--out')throw Error('Usage: --out /tmp/hkia-neutral-anchor');
const out=resolve(args[1]),temp=resolve(tmpdir());
if(out===temp||!out.startsWith(temp+'/')||out===root||out.startsWith(root+'/'))throw Error('NEUTRAL_ANCHOR_DIAGNOSTIC_OUTPUT_ONLY');
mkdirSync(out,{recursive:true});
const source=read('public/source-colorways/index.json'),p=read('public/native-dye-palettes.json'),catalog=read('public/catalog.json');
if(source.version!=='3.0.1'||source.schema!=='HKIA.NamedNativeColorwaySprite.1'||source.definitionsSha256!==p.definitions_sha256)throw Error('NEUTRAL_ANCHOR_SOURCE_VERSION');
const keys=new Map(catalog.items.map(row=>[String(row[0]),row[1]]));
const {selected}=selectGameIconSources({groups:sourceIconGroups(),palette:p.records,itemKeys:keys});
const families=new Map();
for(const [id,s] of selected){
 const k=cell(s);if(!families.has(k))families.set(k,{s,members:[],anchors:[]});
 const f=families.get(k);f.members.push(id);
 const r=source.records[id];if(!r)continue;
 if(r.itemKey!==keys.get(id)||r.sourceSpriteName!=='icon_'+r.itemKey||r.file!==id+'.webp')throw Error('NEUTRAL_ANCHOR_BINDING '+id);
 f.anchors.push(id);
}
let executablePath=process.env.CHROME_BIN;
for(const bin of ['google-chrome-stable','google-chrome','chromium','chromium-browser']){
 if(executablePath)break;try{executablePath=execFileSync('which',[bin],{encoding:'utf8'}).trim()}catch{}
}
if(!executablePath)throw Error('NEUTRAL_ANCHOR_CHROMIUM');
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
const report={version:source.version,sourceDefinitionsSha256:source.definitionsSha256,diagnostic:true,families:[],holdouts:[],candidateCount:0};
function mae(a,b){let sum=0,n=0;for(let i=0;i<a.length;i+=4){if(a[i+3]!==b[i+3])return null;if(b[i+3]<128)continue;for(let c=0;c<3;c++){sum+=Math.abs(a[i+c]-b[i+c]);n++;}}return n?Math.round(sum/n*1000)/1000:null;}
try{
 const page=await browser.newPage();
 let lastSheet=null;
 const decode=async(bytes,offset=null)=>page.evaluate(async({base64,offset})=>{
  let image;
  if(!base64)image=globalThis.__neutralSheet;
  else{image=new Image();image.src='data:image/webp;base64,'+base64;await image.decode();if(offset)globalThis.__neutralSheet=image;}
  const c=document.createElement('canvas');c.width=c.height=96;const ctx=c.getContext('2d',{willReadFrequently:true});
  if(offset){if(offset.x+96>image.naturalWidth||offset.y+96>image.naturalHeight)throw Error('NEUTRAL_ANCHOR_CELL');ctx.drawImage(image,offset.x,offset.y,96,96,0,0,96,96);}
  else{if(image.naturalWidth!==96||image.naturalHeight!==96)throw Error('NEUTRAL_ANCHOR_SIZE');ctx.drawImage(image,0,0);}
  return Array.from(ctx.getImageData(0,0,96,96).data);
 },{base64:bytes?.toString('base64')??null,offset});
 for(const [key,f] of families){
  if(!f.anchors.length)continue;
  const ids=f.anchors.sort((a,b)=>Number(a)-Number(b));
  const entry={cell:key,memberCount:f.members.length,anchorIds:ids,sharedUiIconPathIds:[...new Set(ids.map(id=>source.records[id].sharedUiIconPathId))],status:'unverified',models:[]};
  report.families.push(entry);
  if(entry.sharedUiIconPathIds.length!==1){entry.status='mixed-native-reference';continue;}
  const file='sheet-'+String(f.s.sheet).padStart(3,'0')+'.webp',sheetKey=f.s.group+'/'+file;
  const neutral=await decode(lastSheet===sheetKey?null:f.s.files.get(file),{x:(f.s.cell%12)*96,y:Math.floor(f.s.cell/12)*96});lastSheet=sheetKey;
  const originals=new Map();
  for(const id of ids){
   const r=source.records[id],bytes=readFileSync(join(root,'public/source-colorways',r.file));
   if(sha(bytes)!==r.sha256)throw Error('NEUTRAL_ANCHOR_HASH '+id);
   originals.set(id,await decode(bytes));
  }
  for(const id of ids){
   let model;
   try{model=fitNeutralAnchor(neutral,originals.get(id),colors(p.records[id]));}
   catch(e){if(e.message!=='NEUTRAL_ANCHOR_ALPHA_MISMATCH'&&e.message!=='NEUTRAL_ANCHOR_EMPTY')throw e;entry.models.push({id,status:e.message});continue;}
   entry.models.push({id,visible:model.visible,changed:model.changed,assigned:model.assigned,ambiguous:model.ambiguous});
   entry.status='aligned-diagnostic';
   for(const target of ids){
    if(target===id)continue;
    let prediction;try{prediction=renderNeutralAnchor(model,colors(p.records[target]));}catch(e){if(e.message!=='NEUTRAL_ANCHOR_MISSING_TARGET_CHANNEL')throw e;continue;}
    const actual=originals.get(target);
    report.holdouts.push({cell:key,anchorId:id,targetId:target,mae:mae(prediction,actual),unchangedAnchorMae:mae(model.anchor,actual),neutralMae:mae(neutral,actual)});
   }
   // Single-original families: emit at most one *diagnostic* sample,
   // only where the observed chromatic change was mostly identifiable.
   // No holdout for this family means no claim of accuracy.
   if(ids.length!==1||model.assigned<model.visible*.10||model.assigned<model.changed*.85)continue;
   const candidates=f.members.filter(t=>!source.records[t]&&p.records[t].colors.some((v,k)=>v!==p.records[id].colors[k]&&v!==null));
   for(const target of candidates.sort((a,b)=>Number(a)-Number(b))){
    let prediction;try{prediction=renderNeutralAnchor(model,colors(p.records[target]));}catch(e){if(e.message!=='NEUTRAL_ANCHOR_MISSING_TARGET_CHANNEL')throw e;continue;}
    if(!prediction.some((v,i)=>v!==model.anchor[i]))continue;
    const png=await page.evaluate(data=>{const c=document.createElement('canvas');c.width=c.height=96;const ctx=c.getContext('2d');ctx.putImageData(new ImageData(new Uint8ClampedArray(data),96,96),0,0);return c.toDataURL('image/png').split(',')[1];},Array.from(prediction));
    const bytes=Buffer.from(png,'base64');writeFileSync(join(out,target+'.png'),bytes);
    entry.candidate={id:target,anchorId:id,sha256:sha(bytes),fidelity:'unverified-diagnostic'};report.candidateCount++;break;
   }
  }
 }
}finally{await browser.close();}
const comparable=report.holdouts.filter(h=>h.mae!==null&&h.unchangedAnchorMae!==null);
report.summary={families:report.families.length,singleAnchorFamilies:report.families.filter(f=>f.anchorIds.length===1).length,alignedFamilies:report.families.filter(f=>f.status==='aligned-diagnostic').length,holdouts:comparable.length,improved:comparable.filter(h=>h.mae<h.unchangedAnchorMae).length,meanMae:comparable.length?comparable.reduce((s,h)=>s+h.mae,0)/comparable.length:null,candidates:report.candidateCount};
writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));
console.log('HKIA_NEUTRAL_ANCHOR '+JSON.stringify(report.summary));

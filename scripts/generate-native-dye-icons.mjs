#!/usr/bin/env node
/**
 * Generate individual colorway ICONS from actual game UiIcon sprite atlas +
 * game-authored Item ID dye palette. This NEVER renders a different 3D
 * viewpoint, fetches Wiki art, changes save data or guesses extra channels.
 *
 * node scripts/generate-native-dye-icons.mjs \
 *   --ids 1286846063,935642973 --out dist/native-colorways
 * node scripts/generate-native-dye-icons.mjs \
 *   --group collections_group_events --all --out staging/native-colorways
 *
 * Output is visibly marked as an APPROXIMATION until each original UiIcon
 * channel mask has been authenticated against the source game renderer.
 * This is not the source-accurate image index in public/variant-art.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {execFileSync} from 'node:child_process';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const ID=/^[1-9][0-9]{0,9}$/;
const GROUP=/^[a-z_]+$/;
const SIDE=96;
const GROUP_PARTS={collections_group_events:6};
const DEFAULT_IDS=[
 '704486536','585726126','1286846063','935642973',
 '237080181','556476907','307168230','404567552'
];
const readJson=path=>JSON.parse(readFileSync(join(ROOT,path),'utf8'));
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');

export function readSourceIconZip(path,files){
 const b=readFileSync(path);
 let cursor=0;
 while(cursor+30<=b.length&&b.readUInt32LE(cursor)===0x04034b50){
  const flags=b.readUInt16LE(cursor+6),method=b.readUInt16LE(cursor+8);
  const compressed=b.readUInt32LE(cursor+18),uncompressed=b.readUInt32LE(cursor+22);
  const nameSize=b.readUInt16LE(cursor+26),extraSize=b.readUInt16LE(cursor+28);
  const start=cursor+30+nameSize+extraSize,end=start+compressed;
  if(flags&8||method!==0||compressed!==uncompressed||
   end>b.length||nameSize>80)throw Error('ORIGINAL_UICON_ZIP_INVALID');
  const name=b.toString('utf8',cursor+30,cursor+30+nameSize);
  if(!/^(index\.json|sheet-\d{3}\.webp)$/.test(name)||files.has(name))
   throw Error('ORIGINAL_UICON_ZIP_INVALID');
  const data=b.subarray(start,end);
  if(name.endsWith('.webp')&&(data.toString('ascii',0,4)!=='RIFF'||
   data.toString('ascii',8,12)!=='WEBP'))throw Error('ORIGINAL_UICON_WEBP_INVALID');
  files.set(name,Buffer.from(data));
  cursor=end;
 }
 if(!cursor)throw Error('ORIGINAL_UICON_ZIP_EMPTY');
}
export function collectNativeSprites(group){
 if(!GROUP.test(group))throw Error('ORIGINAL_UICON_GROUP_INVALID');
 const parts=GROUP_PARTS[group]??1;
 const files=new Map();
 for(let p=0;p<parts;p++){
  const suffix=p?'-'+p:'';
  readSourceIconZip(join(ROOT,'public/item-packs/'+group+suffix+'.zip'),files);
 }
 const meta=JSON.parse(files.get('index.json')?.toString('utf8')??'null');
 if(meta?.schema!=='HKIA.SheetIcons.1'||meta.group!==group||
  meta.size!==SIDE||meta.columns!==12||!Array.isArray(meta.records))
  throw Error('ORIGINAL_UICON_INDEX_INVALID');
 const sprites=new Map();
 for(const rec of meta.records){
  if(!Array.isArray(rec)||rec.length!==3)throw Error('ORIGINAL_UICON_INDEX_INVALID');
  const [itemId,sheet,cell]=rec;
  if(!Number.isInteger(itemId)||!Number.isInteger(sheet)||!Number.isInteger(cell)||
   itemId<=0||sheet<0||cell<0||cell>=144||sprites.has(String(itemId))||
   !files.has('sheet-'+String(sheet).padStart(3,'0')+'.webp'))
   throw Error('ORIGINAL_UICON_ENTRY_INVALID');
  sprites.set(String(itemId),{sheet,cell});
 }
 return {sprites,files};
}
function installedChrome(){
 if(process.env.CHROME_BIN)return process.env.CHROME_BIN;
 for(const bin of ['google-chrome-stable','google-chrome','chromium','chromium-browser']){
  try{return execFileSync('which',[bin],{encoding:'utf8'}).trim()}catch{}
 }
 throw Error('ORIGINAL_UICON_CHROMIUM_REQUIRED');
}
async function sourceRecolorScript(){
 const result=await build({
  stdin:{
   contents:"import {recolorDyePixels} from './src/dye-recolor.ts';"+
    "import {sourceIconDyeRegions} from './src/dye-icon-regions.ts';"+
    "globalThis.__hkiaSourceIconColors={recolorDyePixels,sourceIconDyeRegions};",
   resolveDir:ROOT,sourcefile:'original-uiicon-export.ts',loader:'ts'
  },bundle:true,platform:'browser',format:'iife',write:false,logLevel:'silent'
 });
 return result.outputFiles[0].text;
}
function parseArgs(argv){
 let group='collections_group_events',ids=null,out=null,all=false;
 for(let p=0;p<argv.length;p++){
  if(argv[p]==='--group')group=argv[++p];
  else if(argv[p]==='--out')out=argv[++p];
  else if(argv[p]==='--ids')ids=argv[++p]?.split(',');
  else if(argv[p]==='--all')all=true;
  else throw Error('DYE_ICON_ARGS_INVALID '+argv[p]);
 }
 if(!out||!GROUP.test(group)||all&&ids)throw Error('DYE_ICON_ARGS_INVALID');
 if(!all&&!ids)ids=DEFAULT_IDS;
 if(!all&&(ids.length===0||ids.some(id=>!ID.test(id))))throw Error('DYE_ICON_IDS_INVALID');
 return {group,out:resolve(out),all,ids};
}
async function main(){
 const {group,out,all,ids}=parseArgs(process.argv.slice(2));
 const palette=readJson('public/native-dye-palettes.json');
 const catalog=readJson('public/catalog.json');
 const itemKeys=new Map(catalog.items.map(row=>[String(row[0]),row[1]]));
 const {sprites,files}=collectNativeSprites(group);
 const requested=all?[...sprites.keys()].filter(id=>palette.records[id]):ids;
 for(const id of requested){
  if(!sprites.has(id)||!palette.records[id]||
   !String(itemKeys.get(id)??'').startsWith('item_c_dyeable_'))
   throw Error('DYE_ICON_NOT_SOURCE_VERIFIED '+id);
 }
 mkdirSync(out,{recursive:true});
 const bundle=await sourceRecolorScript();
 const browser=await chromium.launch({headless:true,executablePath:installedChrome(),
  args:['--no-sandbox','--disable-dev-shm-usage']});
 const records={};
 try{
  const page=await browser.newPage();
  await page.goto('about:blank');
  await page.addScriptTag({content:bundle});
  const pageCache=new Set();
  const ordered=requested.slice().sort((a,b)=>Number(a)-Number(b));
  for(const id of ordered){
   const {sheet,cell}=sprites.get(id);
   const file='sheet-'+String(sheet).padStart(3,'0')+'.webp';
   if(!pageCache.has(file)){
    const bytes=files.get(file);
    const base64=bytes.toString('base64');
    await page.evaluate(async ({key,base64})=>{
     const image=new Image();
     image.src='data:image/webp;base64,'+base64;
     await image.decode();
     (globalThis.__hkiaSheets??=new Map()).set(key,image);
    },{key:file,base64});
    pageCache.add(file);
   }
   const p=palette.records[id];
   const srcKey=itemKeys.get(id);
   const result=await page.evaluate(({file,sheet,cell,srcKey,group,p})=>{
    const canvas=document.createElement('canvas');
    canvas.width=96;canvas.height=96;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const image=globalThis.__hkiaSheets.get(file);
    const x=(cell%12)*96,y=Math.floor(cell/12)*96;
    ctx.drawImage(image,x,y,96,96,0,0,96,96);
    const original=ctx.getImageData(0,0,96,96);
    const mask=globalThis.__hkiaSourceIconColors.sourceIconDyeRegions(
     srcKey,original.data,96,96,{url:'',x,y,group,sheet,cell});
    const recolored=globalThis.__hkiaSourceIconColors.recolorDyePixels(
     original.data,96,96,p,mask);
    if(!recolored)return null;
    for(let i=3;i<original.data.length;i+=4){
     if(original.data[i]!==recolored.pixels[i])
      throw Error('DYE_ICON_SOURCE_ALPHA_CHANGED');
    }
    original.data.set(recolored.pixels);
    ctx.putImageData(original,0,0);
    return {png:canvas.toDataURL('image/png').split(',')[1],
     changed:recolored.changed,
     channels:[...new Set(mask??[1])].filter(n=>n>0).sort((a,b)=>a-b)};
   },{file,sheet,cell,srcKey,group,p});
   if(!result)continue;
   const output=Buffer.from(result.png,'base64');
   if(output.toString('hex',0,8)!=='89504e470d0a1a0a'||
    output.readUInt32BE(16)!==96||output.readUInt32BE(20)!==96)
    throw Error('DYE_ICON_OUTPUT_INVALID');
   writeFileSync(join(out,id+'.png'),output);
   records[id]={
    file:id+'.png',sha256:hash(output),sourceSheetSha256:hash(files.get(file)),
    group,sheet,cell,dye:p.dye,changedPixels:result.changed,
    sourceType:'original-uiicon-pixel-recolor',fidelity:'approximate',
    channels:result.channels
   };
  }
 }finally{await browser.close()}
 const manifest={
  schema:'HKIA.NativeColorwayIcons.1',version:'3.0.1',
  notice:'Original HKIA UiIcon pixels + original native dye palette; material-channel placement is still approximate.',
  records
 };
 writeFileSync(join(out,'index.json'),JSON.stringify(manifest));
 console.log('Native game UiIcon colorways generated: '+Object.keys(records).length+
  ' / '+requested.length+' requested; '+out);
}
const called=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(called)await main();

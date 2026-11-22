#!/usr/bin/env node
/** Register a transparent variant image actually rendered from the game's
 * original UnityFS mesh, textures and dye parameters. No wiki image reuse.
 *
 * node scripts/register-variant-art.mjs --id 704486536
 *   --image /path/to/game-render/704486536.png
 *   --source-bundle l_basicstyle_fullbody_imaginationarcher
 *
 * This importer validates format and metadata, NOT visual material fidelity.
 * Material/shader matching and legitimate provenance must be verified by the
 * game-asset rendering pipeline before this command is run.
 */
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const project=resolve(fileURLToPath(new URL('..',import.meta.url)));
const registry=resolve(project,'public/variant-art/index.json');
const folder=resolve(project,'public/variant-art');
const native=JSON.parse(readFileSync(resolve(project,'public/native-dye-palettes.json'),'utf8')).records;
const values={};
for(let i=2;i<process.argv.length;i+=2){
 const key=process.argv[i],value=process.argv[i+1];
 if(!key?.startsWith('--')||!value||values[key])throw Error('Expected --id, --image and --source once');
 values[key]=value;
}
const args=Object.keys(values).sort().join(',');
if(args!=='--id,--image,--source-bundle')throw Error('Only --id, --image, --source-bundle are supported');
const id=values['--id'],input=resolve(values['--image']),bundle=values['--source-bundle'];
const source='unityfs:'+bundle;
if(!/^[1-9][0-9]{0,9}$/.test(id)||!native[id])throw Error('Not a verified game dyeable Item ID');
if(!/^l_[a-z0-9][a-z0-9._-]{4,180}$/.test(bundle))throw Error('Expected a game UnityFS source bundle name');
// An asset bundle name alone cannot prove that a rendering reproduced the
// original game shader; it only records provenance for subsequent review.
const bytes=readFileSync(input);
if(bytes.length>2_000_000||bytes.length<50||
 bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')
 throw Error('Expected a real PNG source capture below 2 MB');
const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
if(width<48||width>1024||height<48||height>1024)throw Error('Image outside supported 48–1024px range');
const bitDepth=bytes[24],colorType=bytes[25];
if(bitDepth!==8||!([4,6].includes(colorType)))
 throw Error('PNG must have an alpha channel, 8-bit GA or RGBA');
const hash=createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(readFileSync(registry,'utf8'));
if(manifest.schema!=='HKIA.DyeVariantArt.1'||manifest.version!=='3.0.1')throw Error('Unexpected manifest');
const existing=manifest.records[id];
if(existing&&existing.sha256!==hash)
 throw Error('Different source capture already registered for this Item ID');
const file=id+'.png',destination=resolve(folder,file);
if(existsSync(destination)&&createHash('sha256').update(readFileSync(destination)).digest('hex')!==hash)
 throw Error('Existing image bytes differ; investigate before replacing');
mkdirSync(folder,{recursive:true});
if(!existsSync(destination))writeFileSync(destination,bytes,{flag:'wx'});
manifest.records[id]={file,sha256:hash,provenance:'game-render',source};
const next=Object.fromEntries(Object.entries(manifest.records).sort((a,b)=>Number(a[0])-Number(b[0])));
const temp=registry+'.tmp';
writeFileSync(temp,JSON.stringify({...manifest,records:next},null,2)+'\n');
renameSync(temp,registry);
process.stdout.write('Registered exact source image for game Item ID '+id+' ('+width+'×'+height+'; sha256 '+hash+')\n');

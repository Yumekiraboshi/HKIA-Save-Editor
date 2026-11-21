'use strict';
// Standalone decoder for source-owned, gzip-compressed HKIA Babel table assets.
// No network, player data, or game save handling. The command line converter
// in extract-babel-items.py remains the primary local extraction entry point.
const LEN_BASE=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
const LEN_EXTRA=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
const DIST_BASE=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
const DIST_EXTRA=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
function b64bytes(s){
 const abc='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',lut={};
 for(let i=0;i<64;i++)lut[abc[i]]=i;
 if(s.length%4!==0)throw Error('B64_SIZE');
 const size=(s.length/4)*3-(s.endsWith('==')?2:s.endsWith('=')?1:0),out=new Uint8Array(size);
 let j=0;
 for(let i=0;i<s.length;i+=4){const n=(lut[s[i]]<<18)|(lut[s[i+1]]<<12)|((lut[s[i+2]]??0)<<6)|(lut[s[i+3]]??0);
  out[j++]=(n>>>16)&255;if(j<size)out[j++]=(n>>>8)&255;if(j<size)out[j++]=n&255;
 }
 return out;
}
function inflateGzip(a){
 if(a[0]!==31||a[1]!==139||a[2]!==8)throw Error('GZIP_MAGIC');
 const flags=a[3];let pos=10;
 if(flags&4){const len=a[pos]|a[pos+1]<<8;pos+=2+len;}
 for(const m of [8,16])if(flags&m){while(a[pos++]!==0){if(pos>=a.length)throw Error('GZIP_HEADER');}}
 if(flags&2)pos+=2;
 const end=a.length-8,size=(a[end+4]|a[end+5]<<8|a[end+6]<<16|a[end+7]<<24)>>>0;
 if(size>32000000)throw Error('GZIP_OVERSIZE');
 const out=new Uint8Array(size);let op=0,bits=0,buf=0;
 function read(n){while(bits<n){if(pos>=end)throw Error('DEFLATE_TRUNCATED');buf|=a[pos++]<<bits;bits+=8;}
  const v=buf&((1<<n)-1);buf>>>=n;bits-=n;return v;
 }
 function huffman(lengths){
  let max=0;const counts=new Uint16Array(16);
  for(const l of lengths){if(l>15)throw Error('HUFFMAN_LENGTH');if(l){counts[l]++;max=Math.max(max,l);}}
  if(!max)throw Error('HUFFMAN_EMPTY');
  const codes=new Uint16Array(16);let code=0;
  for(let i=1;i<=15;i++){code=(code+counts[i-1])<<1;codes[i]=code;}
  const table=new Uint16Array(1<<max);
  for(let k=0;k<lengths.length;k++){
   const len=lengths[k];if(!len)continue;let c=codes[len]++,reverse=0;
   for(let j=0;j<len;j++){reverse=(reverse<<1)|(c&1);c>>>=1;}
   const packed=(len<<9)|k;
   for(let i=reverse;i<table.length;i+=1<<len)table[i]=packed;
  }
  return {table,max};
 }
 function symbol(h){
  while(bits<h.max&&pos<end){buf|=a[pos++]<<bits;bits+=8;}
  const packed=h.table[buf&((1<<h.max)-1)];if(!packed)throw Error('HUFFMAN_SYMBOL');
  const n=packed>>>9;if(bits<n)throw Error('HUFFMAN_TRUNCATED');
  buf>>>=n;bits-=n;return packed&511;
 }
 let last=false;
 while(!last){
  last=read(1)===1;const type=read(2);
  if(type===0){read(bits%8);const len=read(16),inverse=read(16);
   if((len^inverse)!==65535)throw Error('RAW_LENGTH');
   for(let i=0;i<len;i++){if(op>=out.length)throw Error('OUTPUT_OVERFLOW');out[op++]=read(8);}continue;
  }
  let lit,dist;
  if(type===1){const ll=Array(288).fill(8);for(let i=144;i<256;i++)ll[i]=9;for(let i=256;i<280;i++)ll[i]=7;lit=huffman(ll);dist=huffman(Array(32).fill(5));}
  else if(type===2){
   const nlit=read(5)+257,ndist=read(5)+1,ncode=read(4)+4,order=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
   const lengths=Array(19).fill(0);for(let i=0;i<ncode;i++)lengths[order[i]]=read(3);
   const table=huffman(lengths),sequence=[];
   while(sequence.length<nlit+ndist){
    const x=symbol(table);if(x<=15){sequence.push(x);continue;}
    const n=x===16?read(2)+3:x===17?read(3)+3:x===18?read(7)+11:0;
    if(!n||x===16&&!sequence.length)throw Error('CODE_REPEAT');
    const v=x===16?sequence[sequence.length-1]:0;
    for(let i=0;i<n;i++)sequence.push(v);
   }
   if(sequence.length!==nlit+ndist)throw Error('CODE_OVERFLOW');
   lit=huffman(sequence.slice(0,nlit));dist=huffman(sequence.slice(nlit));
  }else throw Error('BLOCK_TYPE');
  while(true){
   const x=symbol(lit);if(x===256)break;
   if(x<256){if(op>=out.length)throw Error('OUTPUT_OVERFLOW');out[op++]=x;continue;}
   if(x>285)throw Error('LENGTH_SYMBOL');
   const li=x-257,len=LEN_BASE[li]+read(LEN_EXTRA[li]),d=symbol(dist);
   if(d>=30)throw Error('DIST_SYMBOL');
   const gap=DIST_BASE[d]+read(DIST_EXTRA[d]);
   if(gap>op||op+len>out.length)throw Error('INVALID_BACKREF');
   for(let i=0;i<len;i++){out[op]=out[op-gap];op++;}
  }
 }
 if(op!==out.length)throw Error('GZIP_LENGTH');
 return out;
}
function utf8Slice(bytes,offset,length){
 const out=[],end=offset+length;
 for(let i=offset;i<end;){
  const a=bytes[i++];let point=a;
  if(a>=240){if(i+2>=end)throw Error('UTF8_TRUNCATED');point=((a&7)<<18)|((bytes[i++]&63)<<12)|((bytes[i++]&63)<<6)|(bytes[i++]&63);}
  else if(a>=224){if(i+1>=end)throw Error('UTF8_TRUNCATED');point=((a&15)<<12)|((bytes[i++]&63)<<6)|(bytes[i++]&63);}
  else if(a>=192){if(i>=end)throw Error('UTF8_TRUNCATED');point=((a&31)<<6)|(bytes[i++]&63);}
  out.push(String.fromCodePoint(point));
 }
 return out.join('');
}
const IDS={ar:1000,'zh-Hans':2000,'zh-Hant':3000,nl:4000,'en-GB':5000,en:6000,'fr-CA':7000,fr:8000,de:9000,it:10000,ja:11000,ko:12000,'pt-BR':13000,ru:14000,es:15000,tr:16000};
function extractTitleStrings(manifest,table,locale,requested){
 const view=new DataView(manifest.buffer,manifest.byteOffset,manifest.byteLength);
 const version=view.getUint32(0,true),sections=view.getUint32(4,true),n=view.getUint32(8,true),end=12+n*20;
 if(version!==IDS[locale]||n>2000000||!sections||sections>8||end+12*sections!==manifest.byteLength)throw Error('MANIFEST_INVALID');
 let range=null;
 for(let i=0;i<sections;i++){
  const type=view.getUint32(end+i*12,true),start=view.getUint32(end+i*12+4,true),count=view.getUint32(end+i*12+8,true);
  if(start+count>n)throw Error('MANIFEST_SECTION_INVALID');
  if(type===300)range={start,count};
 }
 if(!range)throw Error('TABLE300_MISSING');
 const strings={};
 for(let i=range.start;i<range.start+range.count;i++){
  const off=12+20*i,id=view.getBigUint64(off,true).toString();
  if(!requested.has(id))continue;
  const at=view.getUint32(off+8,true),length=view.getUint32(off+12,true),variant=view.getUint32(off+16,true);
  if(variant!==0||at+length>table.length)continue;
  const text=utf8Slice(table,at,length);
  if(!text.trim())continue;
  if(strings[id]&&strings[id]!==text)throw Error('DUPLICATE_TITLE');
  strings[id]=text;
 }
 return strings;
}
module.exports={b64bytes,inflateGzip,utf8Slice,extractTitleStrings};

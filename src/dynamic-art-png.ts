// PNG serialization for the already rasterized, straight-alpha editor artwork.
// Canvas backing stores may quantize RGB when premultiplying translucent pixels.
const CRC_TABLE=Uint32Array.from({length:256},(_,i)=>{
 let c=i;for(let bit=0;bit<8;bit++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;
 return c>>>0;
});
function chunk(type:string,data:Uint8Array):Uint8Array<ArrayBuffer>{
 const result=new Uint8Array(data.length+12),view=new DataView(result.buffer);
 view.setUint32(0,data.length);
 for(let i=0;i<4;i++)result[4+i]=type.charCodeAt(i);
 result.set(data,8);
 let crc=0xffffffff;
 for(let i=4;i<result.length-4;i++)crc=CRC_TABLE[(crc^result[i])&255]^(crc>>>8);
 view.setUint32(result.length-4,(crc^0xffffffff)>>>0);
 return result;
}
/** Encode local native-size artwork without passing through a premultiplied canvas. */
export async function encodeDynamicArtPng(rgba:Uint8ClampedArray,width=96,height=96):Promise<Blob>{
 const stride=width*4;
 if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0&&v<=4096)||rgba.length!==height*stride)throw Error('DYNAMIC_PNG_LENGTH');
 const header=new Uint8Array(13),view=new DataView(header.buffer);
 view.setUint32(0,width);view.setUint32(4,height);header[8]=8;header[9]=6;
 const scanlines=new Uint8Array(height*(stride+1));
 // PNG Sub filter (bytewise subtraction, independent for each scanline).
 for(let y=0;y<height;y++){
  const from=y*stride,to=y*(stride+1);scanlines[to]=1;
  for(let x=0;x<stride;x++)scanlines[to+1+x]=rgba[from+x]-(x<4?0:rgba[from+x-4]);
 }
 const compressed=new Uint8Array(await new Response(new Blob([scanlines]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
 return new Blob([new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())],{type:'image/png'});
}

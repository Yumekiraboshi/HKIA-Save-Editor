import type {SpriteCell} from './icon-packs';
import type {PixelBuffer,SpriteOverlay} from './dynamic-sprite-raster';

/** The original collection pack contains the actual definition UiIcon,
 * not the separately named dye-colorway image. Its source canvas is 84px
 * plus a six-pixel border in the editor's 96px cell. The five non-square
 * original definition Sprite rects require their own geometry.
 * This is a source-derived normalized overlay, not unresampled GPU texels. */
const NON_SQUARE=new Set([371479572,583339916,803563219,1057045178,1314269583]);
export type WandOriginalCell={itemId:number;cell:SpriteCell};
export function selectWandOriginalCell(itemId:number,group:string|undefined,entries:Readonly<Record<string,SpriteCell>>|undefined):WandOriginalCell|undefined{
 if(!Number.isInteger(itemId)||itemId<=0||itemId>0x7fffffff||NON_SQUARE.has(itemId)||!group||!entries||!Object.hasOwn(entries,String(itemId)))return undefined;
 const cell=entries[String(itemId)];
 if(cell.group!==group||typeof cell.url!=='string'||!cell.url.startsWith('blob:')||
  !Number.isInteger(cell.sheet)||cell.sheet!<0||!Number.isInteger(cell.cell)||cell.cell!<0||cell.cell!>=144||
  cell.x!==cell.cell!%12*96||cell.y!==Math.floor(cell.cell!/12)*96)return undefined;
 return {itemId,cell};
}
const SIDE=84;
export function normalizedWandOverlayPixels(rgba:Uint8ClampedArray):PixelBuffer{
 if(rgba.length!==SIDE*SIDE*4)throw Error('WAND_SOURCE_CELL_LENGTH');
 const out=new Uint8ClampedArray(SIDE*SIDE*8);
 for(let i=0;i<SIDE*SIDE;i++){
  const p=i*4,q=p+SIDE*SIDE*4;
  out.set([rgba[p],rgba[p+1],rgba[p+2],255],p);
  out.set([rgba[p+3],rgba[p+3],rgba[p+3],255],q);
 }
 return {width:SIDE,height:SIDE*2,rgba:out};
}
// Bound decoded source cells, including pending requests; never retain
// an entire decoded sheet per material or generated wand combination.
const cache=new Map<string,Promise<PixelBuffer>>();
export function originalWandCellKey(source:WandOriginalCell){
 const c=source.cell;return JSON.stringify([source.itemId,c.group,c.sheet,c.cell,c.url]);
}
async function loadCell(source:WandOriginalCell):Promise<PixelBuffer>{
 const c=source.cell,img=new Image();img.src=c.url;await img.decode();
 if(c.x<0||c.y<0||c.x+96>img.naturalWidth||c.y+96>img.naturalHeight)throw Error('WAND_SOURCE_CELL_BOUNDS');
 const canvas=document.createElement('canvas');canvas.width=SIDE;canvas.height=SIDE;
 try{
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('WAND_SOURCE_CELL_CANVAS');
  ctx.drawImage(img,c.x+6,c.y+6,SIDE,SIDE,0,0,SIDE,SIDE);
  return normalizedWandOverlayPixels(ctx.getImageData(0,0,SIDE,SIDE).data);
 }finally{canvas.width=0;canvas.height=0;}
}
export async function originalWandOverlay(source:WandOriginalCell,transform:Pick<SpriteOverlay,'scale'|'offsetPercent'|'rotation'>):Promise<SpriteOverlay>{
 const key=originalWandCellKey(source);
 let p=cache.get(key);
 if(p){cache.delete(key);cache.set(key,p);}
 else{
  p=loadCell(source);cache.set(key,p);
  const task=p;void task.catch(()=>{if(cache.get(key)===task)cache.delete(key);});
  if(cache.size>32)cache.delete(cache.keys().next().value!);
 }
 return {texture:await p,sampleRect:[0,0,SIDE,SIDE],trim:[0,0,SIDE,SIDE],alphaOffsetY:SIDE,
  logicalWidth:SIDE,logicalHeight:SIDE,sampleClamp:[.5,.5,SIDE-.5,SIDE-.5],...transform};
}

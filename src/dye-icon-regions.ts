/**
 * Optional 2D icon region profiles for sources where the original artwork
 * visibly contains distinct fabric/decorative color regions.
 *
 * IMPORTANT: these are image-derived region estimates, NOT extracted 3D
 * shader masks. The game's actual _PaletteColor1..5 material binding is
 * currently unavailable. Never apply this profile to unrelated costumes.
 * If the original game art changes, fail closed to first-channel rendering.
 */

import type {SpriteCell} from './icon-packs';

function distanceToSegment(x:number,y:number,ax:number,ay:number,bx:number,by:number):number{
 const dx=bx-ax,dy=by-ay;
 const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));
 return Math.hypot(x-(ax+dx*t),y-(ay+dy*t));
}

/**
 * School Jacket: Steam v3.0.1 `collections_group_events` sheet 003, cell 024
 * School Sweater Vest: same pack sheet 006, cell 068
 *
 * Source-image-derived 2D approximation: primary fabric = native channel 1;
 * visible V-shaped collar/neck trim = native channel 2.
 *
 * These are NOT verified shader-material assignments. The actual icon is
 * deliberately identified by its audited atlas cell, neutral-pixel profile,
 * and alpha silhouette. Similar garments / unknown artwork never inherit
 * this geometry. This does not assign channels 3-5 without evidence.
 */
function schoolNecklineRegions(
 sourceKey:string,input:Uint8ClampedArray,width:number,height:number,
 origin?:SpriteCell
):Uint8Array|undefined{
 if(!sourceKey.startsWith('item_c_dyeable_')||
  origin?.group!=='collections_group_events'||width!==96||height!==96||
  input.length!==width*height*4)return undefined;
 const jacket=origin.sheet===3&&origin.cell===24;
 const vest=origin.sheet===6&&origin.cell===68;
 if(!jacket&&!vest)return undefined;
 let visible=0,chromatic=0;
 const regions=new Uint8Array(width*height);
 for(let i=0;i<regions.length;i++){
  const j=i*4,alpha=input[j+3];
  if(alpha<64)continue;
  visible++;
  const r=input[j],g=input[j+1],b=input[j+2];
  const chroma=Math.max(r,g,b)-Math.min(r,g,b);
  if(chroma>50){chromatic++;continue;}
  const lum=.2126*r+.7152*g+.0722*b;
  if(lum<42)continue;
  regions[i]=1;
  const x=i%96,y=Math.floor(i/96);
  const left=jacket?[28,31,40,45]:[27,30,40,45];
  const right=jacket?[40,45,60,29]:[40,45,61,29];
  const trimDistance=Math.min(
   distanceToSegment(x,y,left[0],left[1],left[2],left[3]),
   distanceToSegment(x,y,right[0],right[1],right[2],right[3])
  );
  if(trimDistance<(jacket?3.3:3))regions[i]=2;
 }
 // Source-native garment silhouette has ~2,680 visible, grayscale pixels.
 // Fail closed if a future asset replaces the original or positions change.
 const alphaAt=(x:number,y:number)=>input[(y*96+x)*4+3];
 if(visible<2450||visible>2950||chromatic>25||
  alphaAt(40,18)>40||alphaAt(10,43)<100||alphaAt(40,45)<150)return undefined;
 let trim=0,body=0;
 for(const region of regions){
  if(region===1)body++;
  if(region===2)trim++;
 }
 if(body<2100||trim<170||trim>450)return undefined;
 return regions;
}

/** Each byte is 0 = unchanged, 1..5 = corresponding *actual* native dye
 * palette channel. This never creates a new color value or UI color overlay.
 */
export function sourceIconDyeRegions(
 sourceKey:string,input:Uint8ClampedArray,width:number,height:number,
 origin?:SpriteCell
):Uint8Array|undefined{
 const school=schoolNecklineRegions(sourceKey,input,width,height,origin);
 if(school)return school;
 if(!sourceKey.startsWith('item_c_dyeable_icarcheroutfit_')||
  width!==96||height!==96||input.length!==width*height*4||
  (origin!==undefined&&(
   origin.group!=='collections_group_events'||origin.sheet!==10||origin.cell!==103
  )))return undefined;
 const mask=new Uint8Array(width*height);
 let neutral=0,sash=0,buckle=0;
 // This sprite is source image sheet-010 cell-103 of
 // collections_group_events. The neutral tunic, ochre diagonal strap,
 // and gold buckle are independently visible in the ORIGINAL pixels.
 for(let i=0;i<mask.length;i++){
  const j=i*4,a=input[j+3];
  if(a<25)continue;
  const r=input[j],g=input[j+1],b=input[j+2];
  const luminance=.2126*r+.7152*g+.0722*b;
  const chroma=Math.max(r,g,b)-Math.min(r,g,b);
  let channel=0;
  if(luminance>=40&&chroma<=65)channel=1;
  if(r>g+21&&g>b+17&&r>105)channel=2;
  if(r>=174&&g>140&&r>=g-18&&g>b+43&&g*100>r*69)channel=3;
  mask[i]=channel;
  if(channel===1)neutral++;
  if(channel===2)sash++;
  if(channel===3)buckle++;
 }
 // The detector must recognize ALL three expected regions. Reject
 // unrelated/updated icons, compressed thumbnails or wrong coordinates.
 if(neutral<2500||neutral>5200||sash<250||sash>1100||
  buckle<35||buckle>350)return undefined;
 return mask;
}

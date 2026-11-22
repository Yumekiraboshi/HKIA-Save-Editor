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

/**
 * Crew Medic Outfit: native events UiIcon sheet 000, cell 071.
 * All 17 verified v3.0.1 source colorways share palette #1 = #ebe4e7,
 * while the game-authored palette #2 is the variant-defining color.
 *
 * The game icon is one neutral/grayscale tunic with no baked-in 2D
 * material-channel boundaries. We therefore color its *neutral main
 * fabric* with the native second dye channel. This fixes 17 identical
 * thumbnails while preserving the 96px source silhouette, texture and
 * alpha. The placement is a 2D visual approximation and is NOT proof of
 * the 3D shader's exact material-channel assignment.
 */
function crewMedicVariantFabric(
 sourceKey:string,input:Uint8ClampedArray,width:number,height:number,
 origin?:SpriteCell
):Uint8Array|undefined{
 if(!sourceKey.startsWith('item_c_dyeable_')||
  origin?.group!=='collections_group_events'||origin.sheet!==0||
  origin.cell!==71||width!==96||height!==96||
  input.length!==96*96*4)return undefined;
 const mask=new Uint8Array(width*height);
 let visible=0,neutralFabric=0,chromatic=0;
 for(let i=0;i<mask.length;i++){
  const p=i*4,alpha=input[p+3];
  if(alpha<64)continue;
  visible++;
  const r=input[p],g=input[p+1],b=input[p+2];
  const chroma=Math.max(r,g,b)-Math.min(r,g,b);
  const lum=.2126*r+.7152*g+.0722*b;
  if(chroma>45)chromatic++;
  if(chroma<=36&&lum>=55){
   mask[i]=2;
   neutralFabric++;
  }
 }
 const alphaAt=(x:number,y:number)=>input[(y*96+x)*4+3];
 // These counts and silhouette anchors were measured on the original
 // Steam v3.0.1 96px cell, not generated or guessed item icons.
 if(visible<4200||visible>4650||
  neutralFabric<4150||neutralFabric>4600||chromatic>18||
  alphaAt(47,16)<180||alphaAt(47,45)<225||
  alphaAt(47,75)<180||alphaAt(10,40)>80)return undefined;
 return mask;
}

/**
 * Original v3.0.1 High Tea Banded Tophat and Banded Mini Tophat UiIcons.
 * These neutral icons visibly contain a crown band. The native item
 * palettes have same-first-color variants with different second colors.
 * The source-cell-gated 2D band geometry is APPROXIMATE, not a verified
 * Unity shader/material mask; original transparency and outlines survive.
 */
function bandedTophatRegions(
 sourceKey:string,input:Uint8ClampedArray,width:number,height:number,
 origin?:SpriteCell
):Uint8Array|undefined{
 const highTea=origin?.group==='collection_group_teagarden'&&
  origin.sheet===0&&origin.cell===18;
 const mini=origin?.group==='collections_group_clothing'&&
  origin.sheet===0&&origin.cell===53;
 if(!sourceKey.startsWith('item_c_dyeable_')||(!highTea&&!mini)||
  width!==96||height!==96||input.length!==96*96*4)return undefined;
 const mask=new Uint8Array(width*height);
 let visible=0,neutral=0,band=0;
 for(let i=0;i<mask.length;i++){
  const j=i*4;
  if(input[j+3]<64)continue;
  visible++;
  const r=input[j],g=input[j+1],b=input[j+2];
  const chroma=Math.max(r,g,b)-Math.min(r,g,b);
  const lum=.2126*r+.7152*g+.0722*b;
  if(chroma>40||lum<38)continue;
  neutral++;
  const x=i%96,y=Math.floor(i/96);
  // Native neutral crown band region, never a CSS border/swatch.
  const onBand=x>=25&&x<=71&&y>=55&&y<=70;
  mask[i]=onBand?2:1;
  if(onBand)band++;
 }
 // Reject changed/future art when neutral garment geometry is missing.
 if(visible<1100||visible>5900||neutral<850||
  neutral<visible*.50||band<50||band>1000)return undefined;
 return mask;
}

/**
 * High Tea Tophat: original Steam v3.0.1 teagarden pack 000/098.
 * The 47 variants use the same neutral 96px UiIcon, including multiple
 * White-and-* variants with an identical primary dye and distinct
 * secondary dyes. This places the *original* second color on the
 * source icon's visible lower crown band; no synthetic color is used.
 *
 * The 2D band placement is an IMAGE approximation: the corresponding
 * five-channel Unity material/shader masks have not been recovered.
 */
function highTeaTophatRegions(
 sourceKey:string,input:Uint8ClampedArray,width:number,height:number,
 origin?:SpriteCell
):Uint8Array|undefined{
 if(!sourceKey.startsWith('item_c_dyeable_')||
  origin?.group!=='collection_group_teagarden'||
  origin.sheet!==0||origin.cell!==98||
  width!==96||height!==96||input.length!==96*96*4)return undefined;
 const mask=new Uint8Array(96*96);
 let visible=0,neutral=0,band=0,chromatic=0;
 for(let i=0;i<mask.length;i++){
  const j=i*4;
  if(input[j+3]<64)continue;
  visible++;
  const r=input[j],g=input[j+1],b=input[j+2];
  const chroma=Math.max(r,g,b)-Math.min(r,g,b);
  const lum=.2126*r+.7152*g+.0722*b;
  if(chroma>48)chromatic++;
  if(chroma>40||lum<38)continue;
  neutral++;
  const x=i%96,y=Math.floor(i/96);
  // The source icon's horizontal hatband; exclude silhouette outline,
  // unpainted dark seams and transparent pixels.
  const onBand=x>=27&&x<=71&&y>=45&&y<=61;
  mask[i]=onBand?2:1;
  if(onBand)band++;
 }
 // A source pack revision or non-hat icon must not receive guessed masks.
 if(visible<1100||visible>5100||neutral<900||
  neutral<visible*.55||chromatic>140||band<60||band>760)
  return undefined;
 return mask;
}

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
 const highTeaHat=highTeaTophatRegions(sourceKey,input,width,height,origin);
 if(highTeaHat)return highTeaHat;
 const tophat=bandedTophatRegions(sourceKey,input,width,height,origin);
 if(tophat)return tophat;
 const crew=crewMedicVariantFabric(sourceKey,input,width,height,origin);
 if(crew)return crew;
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

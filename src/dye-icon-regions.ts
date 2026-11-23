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
  neutral<visible*.55||chromatic>140||band<60)
  return undefined;
 return mask;
}

/**
 * Camp Counselor Skort, original Steam v3.0.1 UiIcon sheet 001 cell 021
 * in collections_group_events. 22 genuine item IDs share this neutral
 * source sprite; two-tone items have distinct game palette channel 2
 * despite identical channel 1. Give the visible right-side pleated fabric
 * a second native dye channel while preserving the actual original icon
 * silhouette, shadows, seams and alpha.
 *
 * The panel placement is an approximate original-2D-icon region,
 * not an extracted Unity 3D shader/material channel mask.
 */
function campCounselorSkortRegions(
 sourceKey:string,input:Uint8ClampedArray,width:number,height:number,
 origin?:SpriteCell
):Uint8Array|undefined{
 if(!sourceKey.startsWith('item_c_dyeable_')||
  origin?.group!=='collections_group_events'||
  origin.sheet!==1||origin.cell!==21||
  width!==96||height!==96||input.length!==96*96*4)return undefined;
 const regions=new Uint8Array(96*96);
 let visible=0,neutral=0,secondary=0,chromatic=0;
 for(let i=0;i<regions.length;i++){
  const j=i*4,a=input[j+3];
  if(a<64)continue;
  visible++;
  const r=input[j],g=input[j+1],b=input[j+2];
  const chroma=Math.max(r,g,b)-Math.min(r,g,b);
  const lum=.2126*r+.7152*g+.0722*b;
  if(chroma>48)chromatic++;
  // Preserve the dark seams, decorative pixels and existing edge.
  if(chroma>40||lum<45)continue;
  neutral++;
  const x=i%96,y=Math.floor(i/96);
  // The right-hand visible pleated fabric below the waistband.
  // Image-derived approximation only, never an inferred native mask.
  const rightPanel=y>=37&&y<=82&&x>=51+Math.floor((y-37)/11)&&x<=83;
  regions[i]=rightPanel?2:1;
  if(rightPanel)secondary++;
 }
 // Original source-art plausibility checks: an altered or replaced icon
 // must fall back, not have an arbitrary two-channel mask imposed on it.
 const alphaAt=(x:number,y:number)=>input[(y*96+x)*4+3];
 if(visible<1200||visible>5200||neutral<850||
  neutral<visible*.55||chromatic>160||
  secondary<95||secondary>1700||alphaAt(48,55)<128)
  return undefined;
 return regions;
}

/**
 * High Tea Flower Clip: 45 game-original v3.0.1 collection_group_teagarden
 * UiIcon variants use the same 96x96 source bitmap (sheet 000 cell 101).
 * Native White-and-{Yellow,Sky,Green,Periwinkle} palettes share dye 1
 * but have distinct native dye 2. This approximate source-image region
 * colors the right-hand flower petals with channel 2 and remaining neutral
 * petals with channel 1, preserving the actual icon alpha and shading.
 *
 * This is an explicitly approximate 2D petal segmentation, NOT an extracted
 * five-channel Unity shader/material mask.
 */
function highTeaFlowerClipRegions(
 sourceKey:string,input:Uint8ClampedArray,width:number,height:number,
 origin?:SpriteCell
):Uint8Array|undefined{
 if(!sourceKey.startsWith('item_c_dyeable_')||
  origin?.group!=='collection_group_teagarden'||
  origin.sheet!==0||origin.cell!==101||
  width!==96||height!==96||input.length!==96*96*4)return undefined;
 const regions=new Uint8Array(96*96);
 let visible=0,neutral=0,secondary=0,chromatic=0;
 for(let i=0;i<regions.length;i++){
  const p=i*4;
  if(input[p+3]<64)continue;
  visible++;
  const r=input[p],g=input[p+1],b=input[p+2];
  const chroma=Math.max(r,g,b)-Math.min(r,g,b);
  const luminance=.2126*r+.7152*g+.0722*b;
  if(chroma>48)chromatic++;
  // Preserve the game icon's outlines and existing non-neutral detailing.
  if(chroma>40||luminance<45)continue;
  neutral++;
  const x=i%96,y=Math.floor(i/96);
  // Distinguish the right-hand blossom petals, not the entire icon.
  // Geometry is deliberately limited to this source's visible flower.
  const rightBlossom=x>=50&&x<=82&&y>=24&&y<=74;
  regions[i]=rightBlossom?2:1;
  if(rightBlossom)secondary++;
 }
 // Original Steam v3.0.1 source cell 101 measured 3,502 visible pixels,
 // 2,336 neutral petals, 1,222 right-petal candidates and 1,081
 // chromatic decoration pixels. Keep that original non-neutral detail.
 // Never project this 2D mask onto changed/non-floral art.
 if(visible<650||visible>5300||neutral<380||
  neutral<visible*.44||chromatic>1350||
  secondary<75||secondary>1750)return undefined;
 return regions;
}

/**
 * High Tea Frilled Bonnet: 41 genuine Steam v3.0.1 dyeable variants
 * reference ONE original collection_group_teagarden UiIcon, sheet 0
 * cell 4. Native White-and-{Yellow,Sky,Green,Periwinkle} item palettes
 * share channel 1 but have different source-native channel 2.
 *
 * The actual icon has a neutral cloth bonnet and a narrow visible
 * central/diagonal band. The band gets palette channel 2 while the
 * surrounding neutral fabric receives channel 1. This is a guarded,
 * image-derived 2D approximation, NOT the Unity material's exact
 * five-channel 3D shader mask. Do not invent new dye values or art.
 */
function highTeaFrilledBonnetRegions(
 sourceKey:string,input:Uint8ClampedArray,width:number,height:number,
 origin?:SpriteCell
):Uint8Array|undefined{
 if(!sourceKey.startsWith('item_c_dyeable_')||
  origin?.group!=='collection_group_teagarden'||
  origin.sheet!==0||origin.cell!==4||
  width!==96||height!==96||input.length!==96*96*4)return undefined;
 const regions=new Uint8Array(width*height);
 let visible=0,neutral=0,band=0,chromatic=0;
 for(let i=0;i<regions.length;i++){
  const p=i*4;
  if(input[p+3]<64)continue;
  visible++;
  const r=input[p],g=input[p+1],b=input[p+2];
  const chroma=Math.max(r,g,b)-Math.min(r,g,b);
  const luminance=.2126*r+.7152*g+.0722*b;
  if(chroma>48)chromatic++;
  // Keep the source's existing dark outline, metal and colored details.
  if(chroma>43||luminance<40)continue;
  neutral++;
  const x=i%96,y=Math.floor(i/96);
  // Bonnet's central ribbon: a slightly diagonal narrow stripe.
  // Region estimated solely from its original 96px UiIcon silhouette.
  const ribbonX=39+(y-20)*.27;
  const onRibbon=y>=23&&y<=72&&Math.abs(x-ribbonX)<=6;
  regions[i]=onRibbon?2:1;
  if(onRibbon)band++;
 }
 // Changed source art must fall back rather than acquire this mask.
 if(visible<900||visible>5900||neutral<550||
  neutral<visible*.35||chromatic>1900||
  band<65||band>900)return undefined;
 return regions;
}

/**
 * Triangle Shades: all 34 game-original Steam v3.0.1 dyeable variants
 * share the grayscale collections_group_clothing UiIcon sheet 0/cell 38.
 * Source-native "White"/"White and Black" and six further pairs share
 * palette channel 1 but have distinct game palette channel 2.
 *
 * Assign the two visible triangular LENS interiors to channel 2,
 * while frame/temples retain channel 1. Preserve alpha, outlines and
 * any pre-coloured decoration from the *original* game's 96px sprite.
 * Triangle placement is an approximate 2D region profile, NOT a
 * recovered/verified Unity five-channel shader/material mask.
 */
function triangleShadesRegions(
 sourceKey:string,input:Uint8ClampedArray,width:number,height:number,
 origin?:SpriteCell
):Uint8Array|undefined{
 if(!sourceKey.startsWith('item_c_dyeable_')||
  origin?.group!=='collections_group_clothing'||
  origin.sheet!==0||origin.cell!==38||
  width!==96||height!==96||input.length!==96*96*4)return undefined;
 const regions=new Uint8Array(width*height);
 let visible=0,neutral=0,lenses=0,chromatic=0;
 for(let i=0;i<regions.length;i++){
  const p=i*4;
  if(input[p+3]<64)continue;
  visible++;
  const r=input[p],g=input[p+1],b=input[p+2];
  const chroma=Math.max(r,g,b)-Math.min(r,g,b);
  const lum=.2126*r+.7152*g+.0722*b;
  if(chroma>48)chromatic++;
  // Preserve transparent areas, dark outlines and colored parts.
  if(chroma>40||lum<38)continue;
  neutral++;
  const x=i%96,y=Math.floor(i/96);
  // Two triangular lenses, with their broad edges along the upper
  // brow and tips pointing down. The original pixel art is the mask.
  const depth=y-31;
  const halfWidth=13-depth*.32;
  const insideLens=depth>=0&&depth<=34&&(
   Math.abs(x-34)<=halfWidth||Math.abs(x-64)<=halfWidth
  );
  regions[i]=insideLens?2:1;
  if(insideLens)lenses++;
 }
 // No source-icon revision or unrelated accessory inherits an
 // unverified channel mask. First-channel source fallback remains safe.
 if(visible<750||visible>5000||neutral<550||
  neutral<visible*.48||chromatic>1000||
  lenses<75||lenses>1300)return undefined;
 return regions;
}

/**
 * High Tea Elegant Hat: original Steam v3.0.1 game UiIcon sheet 000,
 * cell 031 in collection_group_teagarden. Its 44 dyeable Item IDs
 * share a single neutral 96px original source sprite. The game-native
 * White and Green/Sky/Periwinkle palettes have identical channel 1
 * and different channel 2 colors.
 *
 * Apply native channel 2 to the visible central hat ribbon/band, and
 * channel 1 to other neutral fabric. This is an approximate 2D source-
 * image segmentation, NOT a verified Unity shader/material mask.
 */
function highTeaElegantHatRegions(
 sourceKey:string,input:Uint8ClampedArray,width:number,height:number,
 origin?:SpriteCell
):Uint8Array|undefined{
 if(!sourceKey.startsWith('item_c_dyeable_')||
  origin?.group!=='collection_group_teagarden'||
  origin.sheet!==0||origin.cell!==31||
  width!==96||height!==96||input.length!==96*96*4)return undefined;
 const regions=new Uint8Array(96*96);
 let visible=0,neutral=0,ribbon=0,chromatic=0;
 for(let i=0;i<regions.length;i++){
  const p=i*4;
  if(input[p+3]<64)continue;
  visible++;
  const r=input[p],g=input[p+1],b=input[p+2];
  const chroma=Math.max(r,g,b)-Math.min(r,g,b);
  const lum=.2126*r+.7152*g+.0722*b;
  if(chroma>48)chromatic++;
  // Preserve the original icon's dark outlines and color details.
  if(chroma>42||lum<40)continue;
  neutral++;
  const x=i%96,y=Math.floor(i/96);
  // Approximate the front-facing band within the gray crown.
  // The original pixels (and alpha) determine the actual silhouette.
  const isRibbon=x>=25&&x<=75&&y>=43&&y<=58;
  regions[i]=isRibbon?2:1;
  if(isRibbon)ribbon++;
 }
 // Conservative acceptance of the shared original neutral icon;
 // unrelated/changed artwork keeps the regular source-icon fallback.
 if(visible<600||visible>6300||neutral<400||
  neutral<visible*.28||chromatic>2400||
  ribbon<55||ribbon>1100)return undefined;
 return regions;
}

/**
 * Original Steam v3.0.1 shared UiIcon cells with source-verified native
 * two-tone palettes. Every Marching Band family has 13 distinct second
 * native dye colors over the same first color (#3a3840); the High Tea
 * Empire Waist Dress has same-first / different-second pairs.
 *
 * Region coordinates are conservative 2D visual approximations of the
 * ORIGINAL game icon, NEVER claims of decoded Unity material masks.
 * Source sprites, alpha, shadows and every palette value remain native.
 */
const sourceAccentProfiles:Array<{
 group:string;sheet:number;cell:number;
 part:'right-skirt'|'plume'|'right-trouser'|'left-trouser'|
  'chest-panel'|'diagonal-sash'|'hat-band';
}>=[
 // Original HKIA Steam v3.0.1 City Town and Clothing outfit UiIcon
 // source index cells; 22 and 15 genuine Item IDs, respectively.
 // Each has three verified pairs with equal primary dye and different
 // secondary dye. Recolor source-neutral chest decoration, not an overlay.
 // Image-derived 2D APPROXIMATION; Unity shader masks remain unverified.
 // Native Night Cap, Striped Pajama Pants and Striped Pajama Shirt (22
 // colorways each). Each source cell contains two verified same-primary
 // palettes with different secondary dye values. Keep a conservative,
 // SOURCE-CELL-specific 2D visual approximation on original cloth/trim.
 // These regions do not imply a recovered 3D material shader mask.
 {group:'collections_group_clothing',sheet:0,cell:24,part:'hat-band'},
 {group:'collections_group_clothing',sheet:0,cell:44,part:'right-trouser'},
 {group:'collections_group_clothing',sheet:0,cell:77,part:'chest-panel'},
 {group:'collection_group_citytown',sheet:2,cell:65,part:'chest-panel'},
 {group:'collections_group_clothing',sheet:1,cell:36,part:'chest-panel'},
 {group:'collection_group_teagarden',sheet:0,cell:74,part:'right-skirt'},
 {group:'collections_group_events',sheet:0,cell:38,part:'plume'},
 {group:'collections_group_events',sheet:1,cell:29,part:'plume'},
 {group:'collections_group_events',sheet:1,cell:92,part:'right-trouser'},
 {group:'collections_group_events',sheet:2,cell:118,part:'plume'},
 {group:'collections_group_events',sheet:2,cell:64,part:'chest-panel'},
 {group:'collections_group_events',sheet:3,cell:47,part:'diagonal-sash'},
 {group:'collections_group_events',sheet:4,cell:111,part:'hat-band'},
 {group:'collections_group_events',sheet:5,cell:120,part:'left-trouser'},
 {group:'collections_group_events',sheet:5,cell:34,part:'right-skirt'},
 {group:'collections_group_events',sheet:5,cell:40,part:'chest-panel'},
 {group:'collections_group_events',sheet:5,cell:91,part:'hat-band'},
 {group:'collections_group_events',sheet:5,cell:93,part:'chest-panel'},
 {group:'collections_group_events',sheet:6,cell:72,part:'right-skirt'},
 {group:'collections_group_events',sheet:7,cell:1,part:'right-trouser'},
 {group:'collections_group_events',sheet:7,cell:11,part:'right-skirt'},
 {group:'collections_group_events',sheet:7,cell:130,part:'hat-band'},
 {group:'collections_group_events',sheet:7,cell:34,part:'hat-band'},
 {group:'collections_group_events',sheet:7,cell:56,part:'right-trouser'},
 {group:'collections_group_events',sheet:8,cell:56,part:'hat-band'},
 {group:'collections_group_events',sheet:9,cell:33,part:'right-skirt'},
 {group:'collections_group_events',sheet:9,cell:122,part:'plume'},
 {group:'collection_group_teagarden',sheet:0,cell:28,part:'chest-panel'},
 {group:'collection_group_teagarden',sheet:0,cell:25,part:'plume'},
 {group:'collection_group_teagarden',sheet:0,cell:63,part:'diagonal-sash'},
 {group:'collection_group_teagarden',sheet:0,cell:95,part:'chest-panel'},
 {group:'collection_group_teagarden',sheet:0,cell:107,part:'right-skirt'},
 {group:'collection_group_teagarden',sheet:0,cell:106,part:'right-skirt'},
 {group:'collection_group_teagarden',sheet:0,cell:52,part:'right-skirt'},
 {group:'collection_group_teagarden',sheet:0,cell:105,part:'diagonal-sash'},
 {group:'collections_group_clothing',sheet:0,cell:39,part:'hat-band'},
 {group:'collections_group_events',sheet:2,cell:81,part:'chest-panel'},
 {group:'collections_group_events',sheet:4,cell:109,part:'right-skirt'},
 {group:'collections_group_events',sheet:5,cell:74,part:'hat-band'},
 {group:'collections_group_events',sheet:7,cell:121,part:'chest-panel'},
 {group:'collections_group_events',sheet:1,cell:48,part:'right-trouser'},
 {group:'collections_group_events',sheet:4,cell:39,part:'hat-band'},
 {group:'collections_group_events',sheet:10,cell:18,part:'right-trouser'},
 {group:'collections_group_events',sheet:7,cell:48,part:'chest-panel'},
 {group:'collections_group_events',sheet:4,cell:45,part:'hat-band'},
 {group:'collections_group_events',sheet:8,cell:137,part:'chest-panel'},
 {group:'collections_group_events',sheet:7,cell:139,part:'chest-panel'},
 {group:'collections_group_events',sheet:6,cell:58,part:'plume'},
 {group:'collections_group_events',sheet:8,cell:59,part:'right-skirt'},
 {group:'collections_group_events',sheet:10,cell:63,part:'chest-panel'},
 {group:'collections_group_events',sheet:5,cell:10,part:'hat-band'},
 {group:'collections_group_events',sheet:6,cell:21,part:'right-skirt'},
 {group:'collections_group_events',sheet:10,cell:89,part:'chest-panel'},
 {group:'collections_group_events',sheet:4,cell:110,part:'chest-panel'},
 {group:'collections_group_events',sheet:3,cell:19,part:'right-skirt'},
 {group:'collections_group_events',sheet:10,cell:69,part:'hat-band'},
 {group:'collections_group_events',sheet:9,cell:116,part:'chest-panel'}
];
function sourceAccentIsSecond(
 x:number,y:number,
 part:(typeof sourceAccentProfiles)[number]['part']
):boolean{
 switch(part){
  case 'right-skirt':
   return y>=40&&y<=82&&x>=52&&x<=79;
  case 'plume':
   return y>=24&&y<=71&&x>=48&&x<=66;
  case 'right-trouser':
   return y>=39&&y<=80&&x>=52&&x<=80;
  case 'left-trouser':
   return y>=39&&y<=80&&x>=22&&x<=47;
  case 'chest-panel':
   return y>=28&&y<=70&&x>=43&&x<=66;
  case 'diagonal-sash':
   return y>=28&&y<=76&&Math.abs(x-(63-(y-28)*.44))<=8;
  case 'hat-band':
   return y>=42&&y<=59&&x>=24&&x<=78;
 }
}
function nativeBatchTwoToneRegions(
 sourceKey:string,input:Uint8ClampedArray,width:number,height:number,
 origin?:SpriteCell
):Uint8Array|undefined{
 if(!sourceKey.startsWith('item_c_dyeable_')||!origin||
  width!==96||height!==96||input.length!==96*96*4)return undefined;
 const profile=sourceAccentProfiles.find(p=>
  p.group===origin.group&&p.sheet===origin.sheet&&p.cell===origin.cell);
 if(!profile)return undefined;
 const mask=new Uint8Array(96*96);
 let visible=0,neutral=0,accent=0,chromatic=0;
 for(let i=0;i<mask.length;i++){
  const p=i*4,a=input[p+3];
  if(a<64)continue;
  visible++;
  const r=input[p],g=input[p+1],b=input[p+2];
  const chroma=Math.max(r,g,b)-Math.min(r,g,b);
  const lum=.2126*r+.7152*g+.0722*b;
  if(chroma>55)chromatic++;
  // Keep linework and pre-colored art: only neutral, opaque fabric
  // inherits the original two-channel dye values.
  if(chroma>50||lum<36)continue;
  neutral++;
  const x=i%96,y=Math.floor(i/96);
  const onAccent=sourceAccentIsSecond(x,y,profile.part);
  mask[i]=onAccent?2:1;
  if(onAccent)accent++;
 }
 // Fail closed when the original game source icon geometry is absent.
 if(visible<450||visible>6300||neutral<300||
  neutral<visible*.26||chromatic>3200||
  accent<28||accent>1700)return undefined;
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
 const originalAccents=nativeBatchTwoToneRegions(sourceKey,input,width,height,origin);
 if(originalAccents)return originalAccents;
 const elegant=highTeaElegantHatRegions(sourceKey,input,width,height,origin);
 if(elegant)return elegant;
 const shades=triangleShadesRegions(sourceKey,input,width,height,origin);
 if(shades)return shades;
 const bonnet=highTeaFrilledBonnetRegions(sourceKey,input,width,height,origin);
 if(bonnet)return bonnet;
 const flowerClip=highTeaFlowerClipRegions(sourceKey,input,width,height,origin);
 if(flowerClip)return flowerClip;
 const skort=campCounselorSkortRegions(sourceKey,input,width,height,origin);
 if(skort)return skort;
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

/** Shared reviewed native-resolution artwork distribution. A production
 * caller may construct this only with version/source pins from an approved
 * release and matching catalogs. Never reads or mutates a game save. */
import {createNativeRasterLoader} from './native-raster-art';
import {loadVerifiedArtAsset} from './dynamic-art-assets';
import {createVersionedItemArtService,type ItemArtServicePin} from './versioned-item-art-service';
import {createVersionedAchievementArt,type AchievementArtPin} from './versioned-achievement-art';
import {createVersionedCategoryArt,type CategoryArtPin} from './versioned-category-art';
import type {AchievementIndex} from './achievement-index';
import type {AchievementHierarchy} from './achievement-groups';
type CategoryScope=Parameters<typeof createVersionedCategoryArt>[2];
type Pins={item:ItemArtServicePin;achievement?:AchievementArtPin;category?:CategoryArtPin};
export function createNativeArtService(root:string,pins:Pins,catalogs:{achievement?:{index:AchievementIndex;hierarchy:AchievementHierarchy};category?:CategoryScope},load=loadVerifiedArtAsset){
 const version=pins.item.version;
 if((pins.achievement&&pins.achievement.version!==version)||(pins.category&&pins.category.version!==version)||
    (pins.achievement&&pins.category&&(pins.achievement.platform!==pins.category.platform||pins.achievement.definitionsSha256!==pins.category.definitionsSha256))||
    Boolean(pins.achievement)!==Boolean(catalogs.achievement)||Boolean(pins.category)!==Boolean(catalogs.category))
  throw Error('NATIVE_ART_RELEASE_MISMATCH');
 const images=createNativeRasterLoader(root+'native-art/',load);
 let pending:Promise<ArrayBuffer>|undefined;
 const verifiedLoad:typeof loadVerifiedArtAsset=async(base,file,hash,max,bytes)=>{
  // Before a view manifest is served, bind its reviewed original definition
  // and platform to the exact item release receipt, not a caller's save.
  if(base===root&&(file==='achievement-art.json'||file==='category-art.json'||file==='release-candidate.json')){
   const raw=await (pending??=load(root,'release-candidate.json',pins.item.receiptFileSha256,16*1024*1024).catch(e=>{pending=undefined;throw e;}));
   if(file==='release-candidate.json'){
    if(hash!==pins.item.receiptFileSha256||raw.byteLength>max||(bytes!==undefined&&raw.byteLength!==bytes))throw Error('NATIVE_ART_RELEASE_MISMATCH');
    return raw;
   }
   const r=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)),pin=file==='achievement-art.json'?pins.achievement:pins.category;
   if(!pin||r.version!==version||r.platform!==pin.platform||r.sourceBundles?.definitions!==pin.definitionsSha256||hash!==pin.manifestFileSha256||r.artworkPolicy!=='native-resolution-lossless-webp-v1')
    throw Error('NATIVE_ART_RELEASE_MISMATCH');
  }
  return load(base,file,hash,max,bytes);
 };
 const item=createVersionedItemArtService({release:root,bindings:root,auxiliary:root+'auxiliary-source-pages/'},pins.item,{load:verifiedLoad,sharedImages:images});
 const achievement=pins.achievement&&catalogs.achievement?createVersionedAchievementArt(root,pins.achievement,catalogs.achievement.index,catalogs.achievement.hierarchy,{load:verifiedLoad,sharedImages:images}):null;
 const category=pins.category&&catalogs.category?createVersionedCategoryArt(root,pins.category,catalogs.category,async(i,v)=>(await item.inventory(i,v))?.art??null,verifiedLoad,images):null;
 return {item,achievement,category,dispose(){item.dispose();achievement?.dispose();category?.dispose();images.dispose();}};
}

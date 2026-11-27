import {loadOpaqueArtTexture,renderCachedOriginalBase,type TextureAsset} from './dynamic-art-assets';
import placeholderSource from '../data/native-placeholder-main-routes-v3.0.1.json';

const placeholderIds:ReadonlySet<number>=new Set(placeholderSource.ids);
export function hasNativePlaceholderArt(itemId:number):boolean{return placeholderIds.has(itemId);}
export const NATIVE_PLACEHOLDER_SPRITE=placeholderSource.sourceSpritePathId;

const ROOT=import.meta.env.BASE_URL+'dynamic-wand-art/';
export const PLACEHOLDER_ASSET:TextureAsset={file:'native-placeholder.webp',bytes:202,
 sha256:'0adfe05aff08f9988167c8e8a04b47bfe01cfb1b955aee56a70a2c29edc638c2',
 rgbSha256:'e1a9ebe1a551938daee31b811a959a40679c5472dc613f53580b56c89920dfdb',width:258,height:516};
export function loadNativePlaceholderTexture(){return loadOpaqueArtTexture(ROOT,PLACEHOLDER_ASSET);}
/** The original shared placeholder is not item-specific art. No variant is inferred. */
export async function renderNativePlaceholderArt():Promise<Blob|null>{
 try{
  return await renderCachedOriginalBase(PLACEHOLDER_ASSET.sha256,{base:await loadNativePlaceholderTexture(),baseRect:[1,1,256,256],trim:[0,0,256,256],alphaOffsetY:258,logicalSize:256});
 }catch{return null;}
}

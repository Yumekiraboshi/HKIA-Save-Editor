/** Shared, read-only Item ID -> artwork resolution for Collection and Inventory.
 *
 * Exact overrides must come from parseVariantArtIndex/loadVariantArtIndex;
 * approximate overrides from parseNativeColorwayIcons/loadNativeColorwayIcons.
 * The original shared UiIcon of a DYEABLE item is not a faithful image of
 * that particular colorway, even though the atlas sprite itself is native.
 * No game-specific save mutation or image recoloring happens here.
 */
import type {SpriteCell} from './icon-packs';

export type ItemIconFidelity =
 'game-original' | 'verified-reconstruction' | 'approximate' | 'unsupported';
export type ItemIconOrigin =
 'original-uiicon' | 'verified-variant' | 'original-uiicon-pixel-recolor' |
 'shared-uiicon-template' | 'missing';
export type ItemIconArtwork = Readonly<{
 itemId:string;
 fidelity:ItemIconFidelity;
 origin:ItemIconOrigin;
 url?:string;
 sprite?:SpriteCell;
}>;
export type ItemIconSources = Readonly<{
 /** The original-game UiIcon atlas entry, indexed by native Item ID. */
 originalById:Readonly<Record<string,SpriteCell>>;
 /** Only source-validated entries from the strict variant-art index. */
 verifiedById?:Readonly<Record<string,string>>;
 /** Source UiIcon pixel recolors, always explicitly approximate. */
 approximateById?:Readonly<Record<string,string>>;
 /** True only when native item definitions confirm dyeability. */
 dyeable:boolean;
}>;
const ID=/^[1-9][0-9]{0,9}$/;
const own=(source:object,id:string)=>Object.prototype.hasOwnProperty.call(source,id);

/** Resolve quality without silently upgrading a shared, undyed UiIcon.
 * A missing or corrupt actual image must fall back through the same policy
 * after the caller has removed that image candidate from the options.
 */
export function resolveItemIconArt(itemId:number|string,sources:ItemIconSources):ItemIconArtwork{
 const id=String(itemId);
 if(!ID.test(id)||Number(id)>0x7fffffff||!sources||!sources.originalById||
  typeof sources.originalById!=='object'||typeof sources.dyeable!=='boolean')
  throw Error('ITEM_ICON_ID_OR_DYEABILITY_INVALID');
 const verified=sources.verifiedById;
 if(verified&&own(verified,id)&&typeof verified[id]==='string'&&verified[id])
  return {itemId:id,fidelity:'verified-reconstruction',origin:'verified-variant',url:verified[id]};
 const approximated=sources.approximateById;
 if(sources.dyeable&&approximated&&own(approximated,id)&&
  typeof approximated[id]==='string'&&approximated[id])
  return {itemId:id,fidelity:'approximate',origin:'original-uiicon-pixel-recolor',
   url:approximated[id]};
 const sprite=own(sources.originalById,id)?sources.originalById[id]:undefined;
 if(sprite)return {itemId:id,
  fidelity:sources.dyeable?'approximate':'game-original',
  origin:sources.dyeable?'shared-uiicon-template':'original-uiicon',sprite};
 return {itemId:id,fidelity:'unsupported',origin:'missing'};
}

/** The currently displayed DyeSprite may still be a native *template*;
 * do not call it game-original for a particular colorway.
 */
export function displayedDyeIconFidelity(
 source:'original'|'native-icon'|'approximation'|'game-render'
):ItemIconFidelity{
 return source==='game-render'?'verified-reconstruction':'approximate';
}

import type {CollectionItem} from './subcategories';
import {isVerifiedFloorplanItemId} from './floorplan-names';

/** UI mirror of core::catalog::eligible_for_new_history, limited to the
 * explicitly source-verified DLC/hidden floorplan exception. All save
 * compatibility and native membership guards still apply in Rust.
 * This changes collected HISTORY, not inventory, ownership, DLC unlock or
 * gameplay use of the cabin Floorplan model.
 */
export function mayCreateCollectionHistory(
 item:CollectionItem,
 membershipEdit:boolean,
 saveVersion:string,
 catalogVersion:string|null|undefined
):boolean{
 if(!membershipEdit||saveVersion!=='3.0.1'||saveVersion!==catalogVersion)return false;
 return item[4]===0||
  (item[3]==='collection_group_floorplans'&&isVerifiedFloorplanItemId(item[0]));
}

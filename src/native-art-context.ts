/** Shared artwork session. A build without an installed, reviewed release
 * keeps the existing delivery path. No save or remote response can activate it. */
import {getContext,setContext} from 'svelte';
import type {createNativeArtService} from './native-art-service';
import type {InventoryArtAppearance} from './versioned-inventory-routes';
import type {InventoryFlower} from './inventory-flower-display';
import type {ChefAppearance} from './chef-appearance';
import type {InventoryPalette} from './inventory-palette-display';
import type {WandInventoryAppearance} from './inventory-wand-display';
import pin from './native-art-release-pin.json';
export type NativeArtSession={service:ReturnType<typeof createNativeArtService>;version:string};
export type InstalledNativeArtPin={root:string;pins:Parameters<typeof createNativeArtService>[1];distributionSha256:string;partsFileSha256:string};
export const installedNativeArt=pin as unknown as InstalledNativeArtPin|null;
const KEY=Symbol('native-art-session');
export function provideNativeArt(get:()=>NativeArtSession|null){setContext(KEY,get);}
export function useNativeArt():()=>NativeArtSession|null{return getContext<(()=>NativeArtSession|null)|undefined>(KEY)??(()=>null);}
/** Only the already typed display projections of the Rust snapshot enter
 * this adapter; it neither interprets save words nor selects edit eligibility. */
export function inventoryArtworkAppearance(flower?:InventoryFlower,chef?:ChefAppearance|null,wand?:WandInventoryAppearance|null,palette?:InventoryPalette|null):InventoryArtAppearance|undefined{
 if(wand)return {kind:'wand',value:{sourceItemId:wand.sourceItemId,magicCharacteristicId:wand.magicCharacteristicId,fleckCharacteristicId:wand.fleckCharacteristicId}};
 if(chef)return {kind:chef.kind,value:chef};
 if(palette)return {kind:'palette',value:palette};
 if(flower)return {kind:'flower',value:flower};
 return undefined;
}

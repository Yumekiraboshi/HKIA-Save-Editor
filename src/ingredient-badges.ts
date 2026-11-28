/** Read-only presentation of saved flavor/color slots and original ingredient
 * witnesses supplied by Rust. A witness is not a record of what was consumed. */
import type {CafeVariant,CafeWitness} from './inventory-cafe-display';
import type {BobaVariant,BobaWitness} from './inventory-boba-display';
export type IngredientBadge={key:string;itemIds:number[];slots:number[];count:number};
/** A saved flavor/color array is an ordered appearance, not a multiset.
 * Keep even equal adjacent or nonadjacent slots distinct. Quantity badges
 * are reserved for independently verified, order-independent material counts. */
function orderedSlots(slots:readonly {flavor:number;color:number;slot:number}[],witnesses:readonly CafeWitness[]):IngredientBadge[]{
 return slots.filter(({flavor})=>flavor>0).map(({flavor,color,slot})=>({
  key:slot+':'+flavor+':'+color,
  itemIds:[...new Set(witnesses.filter(w=>w[1]===flavor&&w[2]===color).map(w=>w[0]))],
  slots:[slot],count:1
 }));
}
export function cafeIngredientBadges(v:CafeVariant|undefined,witnesses:readonly CafeWitness[]):IngredientBadge[]{
 return v?orderedSlots([0,1,2].map(i=>({flavor:v[i],color:v[i+3],slot:i+1})),witnesses):[];
}
export function bobaIngredientBadges(v:BobaVariant|undefined,witnesses:readonly BobaWitness[]):IngredientBadge[]{
 return v?orderedSlots([{flavor:v[1],color:v[0],slot:1}],witnesses):[];
}

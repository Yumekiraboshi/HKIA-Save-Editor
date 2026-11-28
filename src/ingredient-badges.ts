/** Read-only presentation of saved flavor/color slots and original ingredient
 * witnesses supplied by Rust. A witness is not a record of what was consumed. */
import type {CafeVariant,CafeWitness} from './inventory-cafe-display';
import type {BobaVariant,BobaWitness} from './inventory-boba-display';
import {identifyIngredient} from './ingredient-identification';
export type IngredientBadge={key:string;itemIds:number[];slots:number[];count:number;flavorOnly?:true};
/** A saved flavor/color array is an ordered appearance, not a multiset.
 * Keep even equal adjacent or nonadjacent slots distinct. Quantity badges
 * are reserved for independently verified, order-independent material counts. */
function orderedSlots(slots:readonly {flavor:number;color:number;slot:number}[],witnesses:readonly CafeWitness[]):IngredientBadge[]{
 return slots.filter(({flavor})=>flavor>0).map(({flavor,color,slot})=>({
  key:slot+':'+flavor+':'+color,
  ...identifyIngredient(flavor,color,witnesses),
  slots:[slot],count:1
 }));
}
export function cafeIngredientBadges(v:CafeVariant|undefined,witnesses:readonly CafeWitness[]):IngredientBadge[]{
 return v?orderedSlots([0,1,2].map(i=>({flavor:v[i],color:v[i+3],slot:i+1})),witnesses):[];
}
export function bobaIngredientBadges(v:BobaVariant|undefined,witnesses:readonly BobaWitness[]):IngredientBadge[]{
 if(!v)return [];
 const rows=orderedSlots([{flavor:v[1],color:v[0],slot:1}],witnesses);
 // Display recipe equivalents, not historical consumption. Source v3.0.1
 // BobaTeaProcessor.MoveNext: PR #217; Item IDs: original Babel name index.
 // Creamy milk characteristic does not distinguish Coral Milk/Cactus Cream.
 if(v[3]===75)rows.push({key:'milk',itemIds:[1743974962,619719355],slots:[],count:1});
 if(v[2]===76)rows.push({key:'tapioca',itemIds:[1962729997],slots:[],count:1});
 const sweetCount=({71:0,72:1,73:2,74:3} as Record<number,number>)[v[4]];
 if(sweetCount>0)rows.push({key:'honeycomb',itemIds:[1456512081],slots:[],count:sweetCount});
 return rows;
}

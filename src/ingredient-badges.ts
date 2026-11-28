/** Read-only presentation of saved flavor/color slots and original ingredient
 * witnesses supplied by Rust. A witness is not a record of what was consumed. */
import type {CafeVariant,CafeWitness} from './inventory-cafe-display';
import type {BobaVariant,BobaWitness} from './inventory-boba-display';
export type IngredientBadge={key:string;itemIds:number[];slots:number[];count:number};
function groupSlots(slots:readonly {flavor:number;color:number;slot:number}[],witnesses:readonly CafeWitness[]):IngredientBadge[]{
 const groups=new Map<string,IngredientBadge>();
 for(const {flavor,color,slot} of slots){
  if(flavor<=0)continue;
  const ids=[...new Set(witnesses.filter(w=>w[1]===flavor&&w[2]===color).map(w=>w[0]))];
  const key=flavor+':'+color,old=groups.get(key);
  if(old){old.slots.push(slot);old.count++;}
  else groups.set(key,{key,itemIds:ids,slots:[slot],count:1});
 }
 return [...groups.values()];
}
export function cafeIngredientBadges(v:CafeVariant|undefined,witnesses:readonly CafeWitness[]):IngredientBadge[]{
 return v?groupSlots([0,1,2].map(i=>({flavor:v[i],color:v[i+3],slot:i+1})),witnesses):[];
}
export function bobaIngredientBadges(v:BobaVariant|undefined,witnesses:readonly BobaWitness[]):IngredientBadge[]{
 return v?groupSlots([{flavor:v[1],color:v[0],slot:1}],witnesses):[];
}

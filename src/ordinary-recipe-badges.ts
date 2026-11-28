import source from '../data/native-cooking-recipes-v3.0.1.json';
import type {IngredientBadge} from './ingredient-badges';

/** Read-only source recipes, never a player's consumption history. Preserve
 * ordered extra slots. Only factor alternatives when at most one slot varies,
 * otherwise omit badges rather than create nonexistent combinations. */
export function recipeAlternativeBadges(recipes:readonly (readonly number[])[]):IngredientBadge[]{
 if(!recipes.length)return [];
 const first=recipes[0];
 if(first.length<2||first.length>3||recipes.some(r=>r.length!==first.length||r[0]!==first[0]))return [];
 const slots=first.slice(1).map((_,i)=>[...new Set(recipes.map(r=>r[i+1]))]);
 if(slots.filter(ids=>ids.length>1).length>1)return [];
 return slots.map((itemIds,i)=>({key:'recipe:'+i,itemIds,slots:[i+1],count:1}));
}
const byResult=new Map<number,number[][]>();
for(const row of source.rows){
 const list=byResult.get(row[1])??[];
 list.push(row.slice(2));byResult.set(row[1],list);
}
const badges=new Map([...byResult].map(([id,recipes])=>[id,recipeAlternativeBadges(recipes)]));
export function ordinaryRecipeBadges(itemId:number,version:string):IngredientBadge[]{
 return version===source.version?badges.get(itemId)??[]:[];
}

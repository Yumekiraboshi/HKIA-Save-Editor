/** Read-only material identification. The full native characteristic census
 * is independent of the restricted recipe mutation/creation witnesses. */
export type IngredientWitness=readonly [number,number,number];
export function identifyIngredient(flavor:number,color:number,witnesses:readonly IngredientWitness[]):{itemIds:number[];flavorOnly?:true}{
 if(!Number.isInteger(flavor)||flavor<=0)return {itemIds:[]};
 const matching=witnesses.filter(w=>w[1]===flavor);
 const exact=matching.filter(w=>w[2]===color);
 if(exact.length)return {itemIds:[...new Set(exact.map(w=>w[0]))]};
 return matching.length?{itemIds:[...new Set(matching.map(w=>w[0]))],flavorOnly:true}:{itemIds:[]};
}
export function ingredientIdentityLabel(flavor:number,color:number,witnesses:readonly IngredientWitness[],name:(id:number)=>string):string{
 const resolved=identifyIngredient(flavor,color,witnesses);
 const names=resolved.itemIds.map(name).filter(Boolean).join(' / ');
 return names?(resolved.flavorOnly?'≈ ':'')+names:'';
}
const flavorOnlyCopy:Record<string,string>={
 en:'Flavor match only; color differs', 'en-GB':'Flavor match only; colour differs',
 ja:'フレーバーのみ一致（色は不一致）',ar:'تطابق النكهة فقط؛ اللون مختلف',
 de:'Nur Geschmack stimmt überein; Farbe abweichend',es:'Solo coincide el sabor; el color difiere',
 fr:'Saveur uniquement ; couleur différente','fr-CA':'Saveur uniquement ; couleur différente',
 it:'Corrisponde solo il sapore; colore diverso',ko:'맛만 일치 (색상 불일치)',
 nl:'Alleen de smaak komt overeen; kleur verschilt','pt-BR':'Apenas o sabor corresponde; cor diferente',
 ru:'Совпадает только вкус; цвет отличается',tr:'Yalnızca aroma eşleşiyor; renk farklı',
 'zh-Hans':'仅风味匹配（颜色不同）','zh-Hant':'僅風味相符（顏色不同）'
};
export function ingredientFlavorOnlyLabel(locale:string):string{return flavorOnlyCopy[locale]??flavorOnlyCopy.en}

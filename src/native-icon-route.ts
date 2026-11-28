import source from '../data/unityfs-audit/dynamic-uiicons.v3.0.1.json';

export type NativeIconRoute='flower'|'cafe'|'boba'|'wand'|'palette'|'instruction';
/** Classification of the pinned original dynamic-color definition rows.
 * This is presentation metadata only, never a save eligibility rule. The
 * five instruction definitions deliberately retain their original UiIcon. */
const routes=new Map<number,NativeIconRoute>();
for(const row of source.rows){
 const k=row.key;
 const route:NativeIconRoute|undefined=k.startsWith('item_flower_')?'flower':
  k==='item_chefcreation_boba'?'boba':k.startsWith('item_chefcreation_')?'cafe':
  k.startsWith('item_wandcreation_')?'wand':k==='item_avatarpalette_custom'?'palette':
  k.startsWith('item_instruction_chefcreation_')?'instruction':undefined;
 if(route)routes.set(row.itemId,route);
}
export function nativeIconRoute(itemId:number):NativeIconRoute|undefined{return routes.get(itemId);}

/** Original instruction and creation definitions point to the same local
 * UiIcon and mask Sprite. This aliases only the uncolored original image;
 * the instruction is never a chef appearance or a save-edit target. */
// Ramen Recipe has no dynamic flag; the original Sprite PPtr matches Ramen (#418).
const chefInstructionBases=new Map<number,number>([[964128772,1061947263]]);
for(const row of source.rows){
 if(routes.get(row.itemId)!=='instruction')continue;
 const matches=source.rows.filter(candidate=>{
  const route=routes.get(candidate.itemId);
  return (route==='cafe'||route==='boba')&&candidate.baseSpritePathId===row.baseSpritePathId&&candidate.maskGuid===row.maskGuid&&candidate.maskSpritePathId===row.maskSpritePathId;
 });
 if(matches.length===1)chefInstructionBases.set(row.itemId,matches[0]!.itemId);
}
export function nativeChefInstructionBase(itemId:number):number|undefined{return chefInstructionBases.get(itemId);}

/** Native nil is -1; tag 0 is a schematic. Unknown payloads are not inferred. */
export function nativeChefInstructionUsesOriginal(itemId:number,uniqueTag:number|undefined):boolean{
 return nativeChefInstructionBase(itemId)!==undefined&&(uniqueTag===undefined||uniqueTag===-1||uniqueTag===0);
}

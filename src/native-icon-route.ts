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

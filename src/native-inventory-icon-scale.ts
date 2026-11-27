import source from '../data/native-inventory-icon-scale-v3.0.1.json';

const scales=new Map<number,number>();
for(const [index,ids] of source.groups.entries()){
 for(const id of ids)scales.set(id,source.scales[index]);
}

/** Original relative icon sizing, display-only and limited to the source version. */
export function nativeInventoryIconScale(itemId:number,version:string):number{
 return version===source.version?(scales.get(itemId)??1):1;
}

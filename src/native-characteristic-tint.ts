import type {Rgba} from './dynamic-sprite-color';
// Original Steam 3.0.1 Imported.CharacteristicsDatabase, object -4611181262773290741.
// SHA-256 5f210c64353e917764861756eaa8ae88e537a53d3f9497f2b0e712b4ff9b3797.
export const NATIVE_CHARACTERISTIC_IDS:readonly number[]=Object.freeze([
 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,
 21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,
 41,42,43,44,46,47,48,49,50,52,53,54,55,56,57,58,59,60,
 61,62,63,64,65,66,67,68,69,71,72,73,74,75,76,77,78,79,80,81,82,
 87,95,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,
 118,119,120,121,122,123,124,125,126,127,128,130,131,132,133,134,135,136,137,138,139,140,141,142,143,
 147,148,149,150,151,152,153,154
]);
const known=new Set(NATIVE_CHARACTERISTIC_IDS);
export const CHEF_MAPPED_IDS:ReadonlySet<number>=new Set([6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,46,47,140,141,142]);
export const MAGIC_MAPPED_IDS:ReadonlySet<number>=new Set([104,105,106,107,108,109,110,111,112,113,114,115,132]);
export const FLECK_MAPPED_IDS:ReadonlySet<number>=new Set([125,126,127]);
const WHITE:Rgba=[1,1,1,1];
/** Display only: absent native mapping is white; missing required swatches and unknown IDs remain withheld. */
export function resolveNativeCharacteristicTint(id:number,colors:ReadonlyMap<number,Rgba>,mapped:ReadonlySet<number>,knownIds:ReadonlySet<number>=known):Rgba|null{
 if(!knownIds.has(id))return null;
 const rgba=colors.get(id);
 if(!mapped.has(id))return rgba===undefined?WHITE:null;
 if(!rgba||rgba.length!==4||!rgba.every(v=>Number.isFinite(v)&&v>=0&&v<=1))return null;
 return rgba;
}

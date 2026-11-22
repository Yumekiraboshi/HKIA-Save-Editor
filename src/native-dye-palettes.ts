/** Read-only native Steam v3.0.1 dye colors.
 * Exact IDs: InventoryItemDefinitionAsset.Id -> OutfitItemDetails.DyeRef
 * -> DyeDataServiceConfig.DyeMap -> SwatchMap.Color (RGBA source).
 * The original UiIcon sprites are shared and contain no verified per-channel mask.
 * Keep these exact game-source colors for later asset-derived recoloring; they
 * are not loaded just to decorate the current collection UI.
 */
export type NativeDyePalette={dye:number;colors:[string|null,string|null,string|null,string|null,string|null]};
export type NativeDyePalettes=Record<string,NativeDyePalette>;
const DEFINITIONS_SHA='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0';
const CONFIG_SHA='890b742411b05ecc36d21646994549d69074f64e9452b2332ecc34fe37364f8c';
const HEX=/^#[0-9a-f]{6}$/;
const ID=/^[1-9][0-9]{0,9}$/;
export function decodeNativeDyePalettes(input:unknown):NativeDyePalettes{
 if(input===null||typeof input!=='object'||Array.isArray(input))throw Error('DYE_MAP_INVALID');
 const v=input as Record<string,unknown>;
 if(v.schema!=='HKIA.V301.DyePalettes.1'||v.version!=='3.0.1'||
  v.definitions_sha256!==DEFINITIONS_SHA||v.dyeconfig_sha256!==CONFIG_SHA||
  v.total_native_dyes!==1356||v.total_native_swatches!==556||
  v.records===null||typeof v.records!=='object'||Array.isArray(v.records))
  throw Error('DYE_MAP_INVALID');
 const records=Object.entries(v.records as Record<string,unknown>);
 if(records.length!==5383)throw Error('DYE_MAP_INCOMPLETE');
 const result:NativeDyePalettes=Object.create(null);
 for(const [id,value] of records){
  const x=value as NativeDyePalette;
  if(!ID.test(id)||Number(id)>0x7fffffff||
   !x||!Number.isInteger(x.dye)||x.dye<1||x.dye>2000||
   !Array.isArray(x.colors)||x.colors.length!==5||
   x.colors.filter((c)=>c!==null).length<2||
   x.colors.some(c=>c!==null&&(typeof c!=='string'||!HEX.test(c)))||
   Object.hasOwn(result,id))throw Error('DYE_MAP_INVALID');
  result[id]={dye:x.dye,colors:x.colors.slice() as NativeDyePalette['colors']};
 }
 return result;
}
export async function loadNativeDyePalettes(base:string):Promise<NativeDyePalettes>{
 const response=await fetch(base+'native-dye-palettes.json');
 if(!response.ok)throw Error('DYE_MAP_UNAVAILABLE');
 return decodeNativeDyePalettes(await response.json());
}

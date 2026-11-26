/** Source-bound rendering parameters, not an inventory edit rule.
 * Native GetPatternMapAssetReference/GetPatternTiling use independent
 * first matching enabled overrides, in original serialized order. */
export type FlowerPatternOverride=readonly [itemId:number,mapGuid:string|null,tiling:readonly [number,number]|null,hasMap:0|1,hasTiling:0|1];
export type FlowerPatternRow=readonly [index:number,name:string,pathId:string,objectHash:string,isEffect:boolean,patternGuid:string|null,effectGuid:string|null,surfaceEffect:number,tiling:readonly [number,number],floats:readonly number[],customRim:boolean,renderQueue:number,frostColor:readonly number[],moltenSpeed:readonly number[],moltenColorType:number,overrides:readonly FlowerPatternOverride[]];
export type FlowerPatternSource={patterns:readonly FlowerPatternRow[];floatColumns:readonly string[]};
const SHA='88e186b5e3e39941d7969ea72e6c257b3586045234c992de84dcaa353d7d11f4';
export async function loadFlowerPatternSource(bytes:ArrayBuffer):Promise<FlowerPatternSource>{
 if(bytes.byteLength<1||bytes.byteLength>1048576)throw Error('FLOWER_PATTERN_SOURCE_SIZE');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==SHA)throw Error('FLOWER_PATTERN_SOURCE_HASH');
 const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(data.schema!=='HKIA.FlowerPatternMaterialSource.1'||data.version!=='3.0.1'||data.patterns.length!==16||data.patterns.reduce((n:number,r:FlowerPatternRow)=>n+r[15].length,0)!==218)throw Error('FLOWER_PATTERN_SOURCE_LAYOUT');
 return data;
}
/** targetItemId is the exact native FlowerTreatment item definition, not an
 * inferred species. Null pattern is a separate treatment path. */
export function selectFlowerPattern(source:FlowerPatternSource,targetItemId:number,patternIndex:number){
 if(!Number.isSafeInteger(targetItemId)||targetItemId<=0)return null;
 const row=source.patterns.find(r=>r[0]===patternIndex);
 if(!row)return null;
 const map=row[15].find(r=>r[0]===targetItemId&&r[3]===1);
 const tiling=row[15].find(r=>r[0]===targetItemId&&r[4]===1);
 return {patternIndex:row[0],patternMapGuid:map?map[1]:row[5],surfaceEffectMapGuid:row[6],patternTiling:tiling?tiling[2]:row[8],surfaceEffect:row[7],authored:row};
}

export type AchievementMetadata={key:string;titleId:string};
export type AchievementIndex=Map<string,AchievementMetadata>;
const GUID=/^[0-9a-f]{8}(?::[0-9a-f]{8}){3}$/;
const TITLE_ID=/^\d{1,20}$/;
const INTERNAL_KEY=/^[A-Za-z0-9_-]{1,128}$/;
export function achievementGuid(words:readonly number[]):string{
 if(words.length!==4||words.some(w=>!Number.isInteger(w)||w<0||w>0xffffffff))throw Error('ACH_GUID_INVALID');
 return words.map(w=>w.toString(16).padStart(8,'0')).join(':');
}
export function decodeAchievementIndex(input:unknown):AchievementIndex{
 if(!input||typeof input!=='object')throw Error('ACH_INDEX_INVALID');
 const value=input as Record<string,unknown>;
 if(value.schema!=='HKIA.AchievementKeyIndex.1'||value.version!=='3.0.1'||!Array.isArray(value.records)||value.records.length!==820)
  throw Error('ACH_INDEX_INVALID');
 const index:AchievementIndex=new Map();
 const knownKeys=new Set<string>();
 for(const item of value.records){
  if(!Array.isArray(item)||item.length!==3)throw Error('ACH_INDEX_INVALID');
  const [guid,key,titleId]=item;
  if(typeof guid!=='string'||!GUID.test(guid)||typeof key!=='string'||!INTERNAL_KEY.test(key)||
   typeof titleId!=='string'||!TITLE_ID.test(titleId)||index.has(guid)||knownKeys.has(key))
   throw Error('ACH_INDEX_INVALID');
  index.set(guid,{key,titleId});knownKeys.add(key);
 }
 return index;
}
export async function loadAchievementIndex(base:string):Promise<AchievementIndex>{
 const response=await fetch(base+'achievement-index.json');
 if(!response.ok)throw Error('ACH_INDEX_UNAVAILABLE');
 return decodeAchievementIndex(await response.json());
}
export function readableSourceKey(key:string):string{
 return key.replace(/^(?:achievement|acheivement|achivement)_?/i,'').replace(/_/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/([0-9])([A-Za-z])/g,'$1 $2').trim()||key;
}

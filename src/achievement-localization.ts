import type {Locale} from './locales';
import type {AchievementIndex} from './achievement-index';

export type AchievementTitles=Record<string,string>;
type Pack={schema:'HKIA.AchievementTitles.1';locale:Locale;strings:AchievementTitles};
const numericId=/^\d{1,20}$/;

export function decodeAchievementTitles(input:unknown,locale:Locale,index:AchievementIndex):AchievementTitles{
 if(input===null||typeof input!=='object'||Array.isArray(input))throw Error('ACH_TITLES_INVALID');
 const pack=input as Partial<Pack>;
 if(pack.schema!=='HKIA.AchievementTitles.1'||pack.locale!==locale||
  !pack.strings||typeof pack.strings!=='object'||Array.isArray(pack.strings))throw Error('ACH_TITLES_INVALID');
 const expected=new Set([...index.values()].map(row=>row.titleId));
 if(index.size!==820||expected.size!==820)throw Error('ACH_INDEX_INVALID');
 const values=Object.entries(pack.strings);
 if(values.length!==expected.size)throw Error('ACH_TITLES_INCOMPLETE');
 const titles:AchievementTitles={};
 for(const [key,value] of values){
  if(!numericId.test(key)||!expected.has(key)||typeof value!=='string'||!value.trim()||value.length>1024)
   throw Error('ACH_TITLES_INVALID');
  titles[key]=value;
 }
 return titles;
}
export async function loadAchievementTitles(locale:Locale,base:string,index:AchievementIndex):Promise<AchievementTitles>{
 const response=await fetch(base+'achievement-locales/'+locale+'.json');
 if(!response.ok)throw Error('ACH_TITLES_UNAVAILABLE');
 return decodeAchievementTitles(await response.json(),locale,index);
}

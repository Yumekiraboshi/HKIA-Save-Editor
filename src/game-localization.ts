import {isLocale,type Locale} from './locales';
type LocaleIndex={schema:'HKIA.BabelLocaleIndex.1';available:string[]};
type ItemKeyIndex={schema:'HKIA.BabelItemKeys.1';keys:Record<string,string>};
type BabelPack={schema:'HKIA.BabelStrings.1';locale:string;strings:Record<string,string>};
export type GameLabels={names:Record<string,string>;strings:Record<string,string>};
export const EMPTY_LABELS:GameLabels={names:{},strings:{}};
function validObject(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value)}
export function decodeGameLabels(keys:unknown,pack:unknown,locale:Locale):GameLabels{
 if(!validObject(keys)||keys.schema!=='HKIA.BabelItemKeys.1'||!validObject(keys.keys))throw Error('BABEL_KEYS_INVALID');
 if(!validObject(pack)||pack.schema!=='HKIA.BabelStrings.1'||pack.locale!==locale||!validObject(pack.strings))throw Error('BABEL_LOCALE_INVALID');
 const strings:Record<string,string>={};
 for(const [key,value] of Object.entries(pack.strings)){
  if(!/^\d{1,20}$/.test(key)||typeof value!=='string'||!value.trim())throw Error('BABEL_STRING_INVALID');
  strings[key]=value;
 }
 const names:Record<string,string>={};
 for(const [id,key] of Object.entries(keys.keys)){
  if(!/^\d+$/.test(id)||typeof key!=='string'||!/^\d{1,20}$/.test(key))throw Error('BABEL_KEYS_INVALID');
  const localized=strings[key];if(localized)names[id]=localized;
 }
 return {names,strings};
}
export async function loadLocaleIndex(base:string):Promise<Locale[]>{
 const response=await fetch(base+'locales/index.json');
 if(!response.ok)return [];
 const data:unknown=await response.json();
 if(!validObject(data)||data.schema!=='HKIA.BabelLocaleIndex.1'||!Array.isArray(data.available))return [];
 return data.available.filter((value:unknown):value is Locale=>typeof value==='string'&&isLocale(value));
}
export async function loadGameLabels(locale:Locale,base:string):Promise<GameLabels>{
 const [keys,pack]=await Promise.all([
  fetch(base+'locales/item-keys.json'),
  fetch(base+'locales/'+locale+'.json')
 ]);
 if(!keys.ok||!pack.ok)throw Error('BABEL_LOAD_FAILED');
 return decodeGameLabels(await keys.json(),await pack.json(),locale);
}

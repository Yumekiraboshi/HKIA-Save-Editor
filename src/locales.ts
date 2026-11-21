export const supportedLocales=[
 {code:'ar',label:'العربية'},
 {code:'de',label:'Deutsch'},
 {code:'en',label:'English'},
 {code:'en-GB',label:'English (UK)'},
 {code:'es',label:'Español'},
 {code:'fr',label:'Français'},
 {code:'fr-CA',label:'Français (Canada)'},
 {code:'it',label:'Italiano'},
 {code:'ja',label:'日本語'},
 {code:'ko',label:'한국어'},
 {code:'nl',label:'Nederlands'},
 {code:'pt-BR',label:'Português (Brasil)'},
 {code:'ru',label:'Русский'},
 {code:'tr',label:'Türkçe'},
 {code:'zh-Hans',label:'简体中文'},
 {code:'zh-Hant',label:'繁體中文'}
] as const;
export type Locale=(typeof supportedLocales)[number]['code'];
export type LanguagePref='auto'|Locale;
export function isLocale(value:string):value is Locale{
 return supportedLocales.some(entry=>entry.code===value);
}
export function resolveLocale(value:string):Locale|null{
 const normalized=value.replace(/_/g,'-').toLowerCase();
 if(normalized==='zh-hk'||normalized==='zh-mo'||normalized==='zh-tw'||normalized.startsWith('zh-hant'))return 'zh-Hant';
 if(normalized==='zh'||normalized==='zh-cn'||normalized==='zh-sg'||normalized.startsWith('zh-hans'))return 'zh-Hans';
 if(normalized.startsWith('zh-'))return 'zh-Hans';
 if(normalized==='fr-ca')return 'fr-CA';
 if(normalized==='en-gb'||normalized==='en-ie'||normalized==='en-au'||normalized==='en-nz')return 'en-GB';
 if(normalized==='pt'||normalized.startsWith('pt-'))return 'pt-BR';
 for(const entry of supportedLocales){
  if(normalized===entry.code.toLowerCase()||normalized.startsWith(entry.code.toLowerCase()+'-'))return entry.code;
 }
 return null;
}
export function detectLocale(languages:readonly string[]):Locale{
 for(const language of languages){const resolved=resolveLocale(language);if(resolved)return resolved}
 return 'en';
}
export function isRtl(locale:Locale):boolean{return locale==='ar'}

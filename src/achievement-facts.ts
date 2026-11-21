import type {AchievementIndex} from './achievement-index';
import type {CounterEntry} from './worker-client';
import {achievementGuid} from './achievement-index';

export type AchievementFacts={
 descriptionId:string|null;
 counterGuid:string;counterKind:string;threshold:number;
 rewardId:number|null;rewardKey:string|null;rewardQuantity:number;
 hasDlcCondition:boolean;groupCondition:boolean;order:number;
};
export type AchievementFactsIndex=Map<string,AchievementFacts>;
const GUID=/^[0-9a-f]{8}(?::[0-9a-f]{8}){3}$/;
const UINT64=/^\d{1,20}$/;
const COUNTER_KIND=/^GameCounter[A-Za-z]+Definition$/;
export function decodeAchievementFacts(input:unknown,source:AchievementIndex):AchievementFactsIndex{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('ACH_FACTS_INVALID');
 const data=input as Record<string,unknown>;
 if(data.schema!=='HKIA.AchievementFacts.1'||data.version!=='3.0.1'||!Array.isArray(data.records)||data.records.length!==820)
  throw Error('ACH_FACTS_INVALID');
 if(source.size!==820)throw Error('ACH_INDEX_INVALID');
 const result:AchievementFactsIndex=new Map();
 const counters=new Set<string>();
 let descriptions=0,rewards=0;
 for(const record of data.records){
  if(!Array.isArray(record)||record.length!==11)throw Error('ACH_FACTS_INVALID');
  const [guid,desc,counter,kind,threshold,rewardId,rewardKey,rewardQty,dlc,type,order]=record;
  if(typeof guid!=='string'||!GUID.test(guid)||!source.has(guid)||result.has(guid)||
   !(desc===null||typeof desc==='string'&&UINT64.test(desc)&&desc!=='0'&&desc!==source.get(guid)?.titleId)||
   typeof counter!=='string'||!GUID.test(counter)||counters.has(counter)||
   typeof kind!=='string'||!COUNTER_KIND.test(kind)||
   !Number.isSafeInteger(threshold)||threshold<1||threshold>1_000_000||
   !Number.isSafeInteger(rewardQty)||rewardQty<0||rewardQty>10000||
   !(rewardQty===0&&rewardId===null&&rewardKey===null||
    rewardQty>0&&Number.isSafeInteger(rewardId)&&rewardId>0&&rewardId<=2147483647&&
    typeof rewardKey==='string'&&/^item_[a-zA-Z0-9_]+$/.test(rewardKey))||
   typeof dlc!=='boolean'||!Number.isInteger(type)||type<0||type>1||
   !Number.isSafeInteger(order)||order<0||order>100000)
   throw Error('ACH_FACTS_INVALID');
  counters.add(counter);
  if(desc!==null)descriptions++;
  if(rewardQty>0)rewards++;
  result.set(guid,{descriptionId:desc,counterGuid:counter,counterKind:kind,threshold,
   rewardId:rewardId as number|null,rewardKey:rewardKey as string|null,rewardQuantity:rewardQty,
   hasDlcCondition:dlc,groupCondition:kind==='GameCounterAchievementsDefinition',order});
 }
 if(descriptions!==720||rewards!==264||result.size!==source.size)throw Error('ACH_FACTS_INCOMPLETE');
 return result;
}
export async function loadAchievementFacts(base:string,source:AchievementIndex):Promise<AchievementFactsIndex>{
 const response=await fetch(base+'achievement-facts-index.json');
 if(!response.ok)throw Error('ACH_FACTS_UNAVAILABLE');
 return decodeAchievementFacts(await response.json(),source);
}
export function counterIndex(counters:readonly CounterEntry[]):Map<string,CounterEntry>{
 const result=new Map<string,CounterEntry>();
 for(const row of counters){
  const guid=achievementGuid(row.guid);
  if(result.has(guid))throw Error('COUNTER_DUPLICATE');
  result.set(guid,row);
 }
 return result;
}
export function describeSourceProgress(facts:AchievementFacts,counter:CounterEntry|null):{
 state:'absent'|'recorded';value:number|null;threshold:number;derivedCompletion:boolean
}{
 return {state:counter===null?'absent':'recorded',value:counter?.current??null,threshold:facts.threshold,
  derivedCompletion:false};
}

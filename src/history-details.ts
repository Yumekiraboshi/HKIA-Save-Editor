import type {AchievementValue,HistoryRecord} from './worker-client';
import {toDateTimeValue} from './collection-date';

export type HistoryDetail =
 | {scope:'collections';itemId:number;before:bigint|null;after:bigint|null}
 | {scope:'achievements';guid:[number,number,number,number];before:AchievementValue|null;after:AchievementValue;parentGuid:[number,number,number,number]|null};

const MAGIC='HKIAHS01';
const MAX_BYTES=128*1024;
const MAX_ROWS=256;

/** Read the bounded Rust HKIAHS01 transaction journal. This is a *view* of
 * native history, not a second authority for edits or recovery. Malformed,
 * mismatched, or over-budget input never becomes a plausible change label.
 */
export function decodeHistoryDetails(
 input:Uint8Array|null,history:readonly HistoryRecord[]
):HistoryDetail[]{
 if(!(input instanceof Uint8Array)||input.byteLength<16||input.byteLength>MAX_BYTES)return [];
 const v=new DataView(input.buffer,input.byteOffset,input.byteLength);
 let at=0;
 const take=(n:number)=>{
  if(!Number.isSafeInteger(n)||n<0||at+n>v.byteLength)throw Error('HISTORY_DETAIL_INVALID');
  const old=at;at+=n;return old;
 };
 const u8=()=>v.getUint8(take(1));
 const u32=()=>v.getUint32(take(4),true);
 const i32=()=>v.getInt32(take(4),true);
 const i64=()=>v.getBigInt64(take(8),true);
 const f32=()=>v.getFloat32(take(4),true);
 const guid=():[number,number,number,number]=>[u32(),u32(),u32(),u32()];
 const ticks=():bigint|null=>{
  const flag=u8(),value=i64();
  if(flag>1||flag===0&&value!==0n||flag===1&&(value<1n||value>3155378975999999999n))
   throw Error('HISTORY_DETAIL_TICKS');
  return flag===1?value:null;
 };
 const value=():AchievementValue=>{
  const complete=u8(),current=f32(),hasDate=u8(),seconds=i64(),nanos=u32();
  if(complete>1||hasDate>1||!Number.isFinite(current)||current<0||
   hasDate===0&&(seconds!==0n||nanos!==0)||
   hasDate===1&&(seconds<0n||seconds>253402300799n||nanos>=1_000_000_000||nanos%100!==0))
   throw Error('HISTORY_DETAIL_VALUE');
  return {complete:complete===1,current,completed:hasDate===1?[seconds,nanos]:null};
 };
 const optional=():AchievementValue|null=>{
  const flag=u8();
  if(flag===1)return value();
  if(flag!==0)throw Error('HISTORY_DETAIL_OPTIONAL');
  const blank=input.subarray(take(18)-18,at);
  if(blank.some(x=>x!==0))throw Error('HISTORY_DETAIL_OPTIONAL');
  return null;
 };
 try{
  if(String.fromCharCode(...input.subarray(take(8),at))!==MAGIC)return [];
  const count=u32(),active=u32();
  if(count>MAX_ROWS||count!==history.length||active>count||
   history.filter(x=>x.applied).length!==active)return [];
  const result:HistoryDetail[]=[];
  for(let i=0;i<count;i++){
   const kind=u8();
   if(kind===0){
    const itemId=i32(),before=ticks(),after=ticks();
    result.push({scope:'collections',itemId,before,after});
   }else if(kind===1){
    const id=guid(),before=value(),after=value();
    result.push({scope:'achievements',guid:id,before,after,parentGuid:null});
   }else if(kind===2){
    const id=guid(),after=value();
    result.push({scope:'achievements',guid:id,before:null,after,parentGuid:null});
   }else if(kind===3){
    const id=guid(),after=value(),parentGuid=guid();
    value();value(); // verified native parent state; one grouped history step
    result.push({scope:'achievements',guid:id,before:null,after,parentGuid});
   }else if(kind===4){
    const id=guid(),before=optional(),after=value(),parentGuid=guid();
    value(); // created parent
    result.push({scope:'achievements',guid:id,before,after,parentGuid});
   }else if(kind===5){
    const id=guid(),before=value(),after=value(),parentGuid=guid();
    value();value();
    result.push({scope:'achievements',guid:id,before,after,parentGuid});
   }else return [];
   const record=history[i],detail=result[i];
   if(record.scope!==detail.scope||record.paired!==(kind===3||kind===4||kind===5)||
    (detail.scope==='collections'
     ?record.itemId!==detail.itemId
     :record.guid?.every((x,j)=>x===detail.guid[j])!==true))return [];
  }
  if(at!==input.byteLength)return [];
  return result;
 }catch{return []}
}

/** No inferred dye or game state: labels derive exclusively from native edits. */
export function formatHistoryChange(
 detail:HistoryDetail|undefined,locale:string,
 copy:{added:string;removed:string;date:string;complete:string;incomplete:string;created:string;progress:string;fromTo:string}
):string{
 if(!detail)return '';
 if(detail.scope==='collections'){
  if(detail.before===null)return copy.added;
  if(detail.after===null)return copy.removed;
  return copy.date+': '+collectionTime(detail.before,locale)+' → '+collectionTime(detail.after,locale);
 }
 const before=detail.before,after=detail.after;
 if(!before)return copy.created+' · '+(after.complete?copy.complete:copy.incomplete);
 if(before.complete!==after.complete)
  return (before.complete?copy.complete:copy.incomplete)+' → '+(after.complete?copy.complete:copy.incomplete);
 if(before.completed?.[0]!==after.completed?.[0]||
  before.completed?.[1]!==after.completed?.[1])
  return copy.date+': '+achievementTime(before.completed,locale)+' → '+achievementTime(after.completed,locale);
 if(!Object.is(before.current,after.current))return copy.progress+': '+before.current+' → '+after.current;
 return '';
}
function collectionTime(ticks:bigint,locale:string):string{
 const date=toDateTimeValue(ticks).replace('T',' ');
 if(!date)return ticks.toString();
 const fractional=(ticks%10_000_000n).toString().padStart(7,'0');
 return date+(fractional==='0000000'?'':'.'+fractional);
}
function achievementTime(value:AchievementValue['completed'],locale:string):string{
 if(!value)return '—';
 const [seconds,nanos]=value;
 const ms=Number(seconds)*1000+Math.floor(nanos/1_000_000);
 const d=new Date(ms);
 if(!Number.isFinite(d.getTime()))return seconds.toString();
 const pad=(n:number)=>String(n).padStart(2,'0');
 const date=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
 const fraction=(nanos/100).toString().padStart(7,'0');
 return date+(fraction==='0000000'?'':'.'+fraction);
}

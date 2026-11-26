import type {FlowerVariant,FurnitureVariant} from './inventory-unique';
import type {AchievementValue,HistoryRecord} from './worker-client';
import {toDateTimeValue} from './collection-date';

export type InventoryBatchDetail={documentId:number;before:number;after:number};
export type HistoryDetail =
 | {scope:'inventory';documentId:number;batch:InventoryBatchDetail[]}
 | {scope:'inventory';documentId:number;createdHandle:number;itemId:number;variant:FlowerVariant;quantity:number;furnitureCreated?:false}
 | {scope:'inventory';documentId:number;createdHandle:number;itemId:number;variant:FurnitureVariant;quantity:number;furnitureCreated:true}
 | {scope:'collections';itemId:number;before:bigint|null;after:bigint|null}
 | {scope:'inventory';documentId:number;before:number;after:number;flowerVariant?:false;furnitureVariant?:false}
 | {scope:'inventory';documentId:number;before:FlowerVariant;after:FlowerVariant;flowerVariant:true;furnitureVariant?:false}
 | {scope:'inventory';documentId:number;before:FurnitureVariant;after:FurnitureVariant;flowerVariant?:false;furnitureVariant:true}
 | {scope:'achievements';guid:[number,number,number,number];before:AchievementValue|null;after:AchievementValue;parentGuid:[number,number,number,number]|null;parentBefore:AchievementValue|null;parentAfter:AchievementValue|null};

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
  const start=take(18);
  const blank=input.subarray(start,at);
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
   }else if(kind===6){
    const documentId=u32(),before=i32(),after=i32();
    if(documentId<=0||before<0||after<0||before===after)return [];
    result.push({scope:'inventory',documentId,before,after});
   }else if(kind===10){
    const n=u32();if(n<1||n>40)return [];
    const batch:InventoryBatchDetail[]=[],seen=new Set<number>();
    for(let j=0;j<n;j++){
     const documentId=u32(),before=i32(),after=i32();
     if(documentId<=0||before<0||after<0||before===after||seen.has(documentId))return [];
     seen.add(documentId);batch.push({documentId,before,after});
    }
    result.push({scope:'inventory',documentId:batch[0].documentId,batch});
   }else if(kind===11){
    const createdHandle=u32(),documentId=u32(),itemId=i32();
    const before:FlowerVariant=[i32(),i32(),i32(),i32()],variant:FlowerVariant=[i32(),i32(),i32(),i32()];
    const quantity=i32();
    const candidate=documentId===2147483648+itemId&&before.every(n=>n===0);
    const stagedSource=result.some(r=>r.scope==='inventory'&&'createdHandle' in r&&!r.furnitureCreated&&r.createdHandle===documentId&&r.itemId===itemId);
    if(createdHandle<=2147483647||createdHandle===documentId||documentId<=0||itemId<=0||quantity<=0||
     (documentId>2147483647&&!candidate&&!stagedSource)||
     (!candidate&&(before[0]!==variant[0]||before.every((v,i)=>v===variant[i]))))return [];
    result.push({scope:'inventory',documentId,createdHandle,itemId,variant,quantity});
   }else if(kind===12){
    const createdHandle=u32(),documentId=u32(),itemId=i32();
    const before:FurnitureVariant=[i32(),i32(),i32()],variant:FurnitureVariant=[i32(),i32(),i32()];
    const quantity=i32();
    const candidate=documentId===2147483648+itemId&&before.every(n=>n===0);
    const stagedSource=result.some(r=>r.scope==='inventory'&&'createdHandle' in r&&r.furnitureCreated&&r.createdHandle===documentId&&r.itemId===itemId);
    if(createdHandle<=2147483647||createdHandle===documentId||documentId<=0||itemId<=0||quantity<=0||before.every((v,i)=>v===variant[i])||
     (documentId>2147483647&&!candidate&&!stagedSource))return [];
    result.push({scope:'inventory',documentId,createdHandle,itemId,variant,quantity,furnitureCreated:true});
   }else if(kind===8){
    const documentId=u32(),before:FlowerVariant=[i32(),i32(),i32(),i32()],after:FlowerVariant=[i32(),i32(),i32(),i32()];
    if(documentId<=0||before.every((v,i)=>v===after[i]))return [];
    result.push({scope:'inventory',documentId,before,after,flowerVariant:true});
   }else if(kind===9){
     const documentId=u32(),before:FurnitureVariant=[i32(),i32(),i32()],after:FurnitureVariant=[i32(),i32(),i32()];
     if(documentId<=0||before.every((v,i)=>v===after[i]))return [];
     result.push({scope:'inventory',documentId,before,after,furnitureVariant:true});
    }else if(kind===1){
    const id=guid(),before=value(),after=value();
    result.push({scope:'achievements',guid:id,before,after,parentGuid:null,parentBefore:null,parentAfter:null});
   }else if(kind===2){
    const id=guid(),after=value();
    result.push({scope:'achievements',guid:id,before:null,after,parentGuid:null,parentBefore:null,parentAfter:null});
   }else if(kind===3){
    const id=guid(),after=value(),parentGuid=guid();
    const parentBefore=value(),parentAfter=value(); // verified atomic parent state
    result.push({scope:'achievements',guid:id,before:null,after,parentGuid,parentBefore,parentAfter});
   }else if(kind===4){
    const id=guid(),before=optional(),after=value(),parentGuid=guid();
    const parentAfter=value(); // created parent, no prior serialized entry
    result.push({scope:'achievements',guid:id,before,after,parentGuid,parentBefore:null,parentAfter});
   }else if(kind===5){
    const id=guid(),before=value(),after=value(),parentGuid=guid();
    const parentBefore=value(),parentAfter=value();
    result.push({scope:'achievements',guid:id,before,after,parentGuid,parentBefore,parentAfter});
   }else return [];
   const record=history[i],detail=result[i];
   if(record.scope!==detail.scope||record.paired!==(kind===3||kind===4||kind===5)||
    (detail.scope==='collections'
     ?record.itemId!==detail.itemId
     :detail.scope==='inventory'?record.itemId!==detail.documentId
     :record.guid?.every((x,j)=>x===detail.guid[j])!==true))return [];
  }
  if(at!==input.byteLength)return [];
  return result;
 }catch{return []}
}

type HistoryChangeCopy={
 added:string;removed:string;date:string;complete:string;incomplete:string;
 created:string;progress:string;fromTo:string
};
/** Show every field changed by one native transaction rather than discarding
 * date/progress updates when completion changed at the same time. */
function achievementChanges(
 before:AchievementValue|null,after:AchievementValue,locale:string,copy:HistoryChangeCopy
):string[]{
 if(!before){
  // The new source-verified record's progress and timestamp are real native
  // fields. Include them in the displayed creation transaction, rather than
  // reducing a dated/progress-bearing edit to a generic “New record” label.
  // Missing dates stay absent; never synthesize a clock value for history.
  const parts=[copy.created,after.complete?copy.complete:copy.incomplete,
   copy.progress+': '+after.current];
  if(after.completed!==null)parts.push(copy.date+': '+achievementTime(after.completed,locale));
  return parts;
 }
 const parts:string[]=[];
 if(before.complete!==after.complete)
  parts.push((before.complete?copy.complete:copy.incomplete)+' → '+(after.complete?copy.complete:copy.incomplete));
 if(!Object.is(before.current,after.current))
  parts.push(copy.progress+': '+before.current+' → '+after.current);
 if(before.completed?.[0]!==after.completed?.[0]||
  before.completed?.[1]!==after.completed?.[1])
  parts.push(copy.date+': '+achievementTime(before.completed,locale)+' → '+achievementTime(after.completed,locale));
 return parts;
}
/** Details derive only from the native Rust history journal, including
 * category side effects within a single atomic achievement transaction. */
export function formatHistoryChange(
 detail:HistoryDetail|undefined,locale:string,copy:HistoryChangeCopy,pairedLabel='',quantityLabel='Quantity',flowerVariantName?:(value:FlowerVariant)=>string,furnitureVariantName?:(value:FurnitureVariant)=>string,inventoryBatchName?:(documentId:number)=>string
):string{
 if(!detail)return '';
 if(detail.scope==='inventory'&&'batch' in detail)return detail.batch.map(row=>(inventoryBatchName?.(row.documentId)??String(row.documentId))+': '+row.before+' → '+row.after).join(' · ');
 if(detail.scope==='inventory'&&'createdHandle' in detail)return copy.added+' · '+(detail.furnitureCreated?(furnitureVariantName?.(detail.variant)??String(detail.variant)):(flowerVariantName?.(detail.variant)??String(detail.variant)))+' · '+quantityLabel+': '+detail.quantity;
 if(detail.scope==='inventory')return detail.furnitureVariant?(furnitureVariantName?.(detail.before)??String(detail.before))+' → '+(furnitureVariantName?.(detail.after)??String(detail.after)):detail.flowerVariant?(flowerVariantName?.(detail.before)??String(detail.before))+' → '+(flowerVariantName?.(detail.after)??String(detail.after)):quantityLabel+': '+detail.before+' → '+detail.after;
 if(detail.scope==='collections'){
  if(detail.before===null)return copy.added;
  if(detail.after===null)return copy.removed;
  return copy.date+': '+collectionTime(detail.before,locale)+' → '+collectionTime(detail.after,locale);
 }
 const parts=achievementChanges(detail.before,detail.after,locale,copy);
 if(detail.parentGuid&&detail.parentAfter){
  const parentParts=achievementChanges(detail.parentBefore,detail.parentAfter,locale,copy);
  if(parentParts.length)parts.push((pairedLabel?pairedLabel+': ':'')+parentParts.join(' · '));
 }
 return parts.join(' · ');
}
function collectionTime(ticks:bigint,locale:string):string{
 void locale;
 const date=toDateTimeValue(ticks).replace('T',' ');
 if(!date)return ticks.toString();
 const fractional=(ticks%10_000_000n).toString().padStart(7,'0');
 return date+(fractional==='0000000'?'':'.'+fractional);
}
function achievementTime(value:AchievementValue['completed'],locale:string):string{
 void locale;
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

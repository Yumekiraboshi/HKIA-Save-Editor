import type {AchievementEntry,AchievementDraftPatch,AchievementValue} from './worker-client';

export type StoredValue={complete:boolean;current:number;completed:[string,number]|null};
export type StoredPatch={guid:[number,number,number,number];before:StoredValue|null;after:StoredValue};
const guidKey=(guid:readonly number[])=>guid.join(':');
const same=(a:AchievementValue,b:AchievementValue)=>
 a.complete===b.complete&&Object.is(a.current,b.current)&&
 (a.completed===null?b.completed===null:b.completed!==null&&a.completed[0]===b.completed[0]&&a.completed[1]===b.completed[1]);
const store=(v:AchievementValue):StoredValue=>({
 complete:v.complete,current:v.current,
 completed:v.completed===null?null:[String(v.completed[0]),v.completed[1]]
});
function valid(v:unknown):v is StoredValue{
 if(!v||typeof v!=='object')return false;
 const x=v as StoredValue;
 return typeof x.complete==='boolean'&&Number.isFinite(x.current)&&x.current>=0&&
 (x.completed===null||(Array.isArray(x.completed)&&x.completed.length===2&&
 typeof x.completed[0]==='string'&&/^(0|[1-9]\d{0,11})$/.test(x.completed[0])&&
 BigInt(x.completed[0])<=253402300799n&&
 Number.isInteger(x.completed[1])&&x.completed[1]>=0&&x.completed[1]<1_000_000_000&&x.completed[1]%100===0));
}
const restore=(v:StoredValue):AchievementValue=>({
 complete:v.complete,current:v.current,
 completed:v.completed===null?null:[BigInt(v.completed[0]),v.completed[1]]
});
export function diffAchievements(baseline:readonly AchievementEntry[],current:readonly AchievementEntry[]):StoredPatch[]{
 const originals=new Map(baseline.map(a=>[guidKey(a.guid),a]));
 const result:StoredPatch[]=[];
 for(const row of current){
  const previous=originals.get(guidKey(row.guid));
  if(!previous||!same(previous.value,row.value))result.push({
   guid:[row.guid[0],row.guid[1],row.guid[2],row.guid[3]],before:previous?store(previous.value):null,after:store(row.value)
  });
 }
 if(current.length<baseline.length)throw Error('DRAFT_INVALID');
 const seen=new Set(current.map(x=>guidKey(x.guid)));
 if(seen.size!==current.length||baseline.some(b=>!seen.has(guidKey(b.guid))))throw Error('DRAFT_INVALID');
 return result;
}
/**
 * IndexedDB uses the same structured-clone algorithm as Worker.postMessage.
 * Read all nested values through Svelte proxies and rebuild plain objects before IDB.put.
 * This is also safe for already serialized drafts and preserves exact GUID/timestamp text.
 */
export function cloneStoredAchievementPatches(patches:readonly StoredPatch[]):StoredPatch[]{
 if(!Array.isArray(patches)||patches.length>10000)throw Error('DRAFT_INVALID');
 const seen=new Set<string>();
 const cloneValue=(v:StoredValue):StoredValue=>({
  complete:v.complete,current:v.current,
  completed:v.completed===null?null:[v.completed[0],v.completed[1]]
 });
 return patches.map(p=>{
  if(!p||!Array.isArray(p.guid)||p.guid.length!==4||
   p.guid.some((n:unknown)=>typeof n!=='number'||!Number.isInteger(n)||n<0||n>0xffffffff)||
   !(p.before===null||valid(p.before))||!valid(p.after))throw Error('DRAFT_INVALID');
  const guid:[number,number,number,number]=[p.guid[0],p.guid[1],p.guid[2],p.guid[3]];
  const key=guidKey(guid);
  if(seen.has(key))throw Error('DRAFT_INVALID');
  seen.add(key);
  return {guid,before:p.before===null?null:cloneValue(p.before),after:cloneValue(p.after)};
 });
}

export function decodeAchievementDraft(value:unknown,baseline:readonly AchievementEntry[]):AchievementDraftPatch[]{
 if(!Array.isArray(value)||value.length>10000)throw Error('DRAFT_INVALID');
 const originals=new Map(baseline.map(a=>[guidKey(a.guid),a]));
 const seen=new Set<string>();const patches:AchievementDraftPatch[]=[];
 for(const unknownPatch of value){
  if(!unknownPatch||typeof unknownPatch!=='object')throw Error('DRAFT_INVALID');
  const p=unknownPatch as StoredPatch;
  if(!Array.isArray(p.guid)||p.guid.length!==4||p.guid.some(n=>!Number.isInteger(n)||n<0||n>0xffffffff)||
   !(p.before===null||valid(p.before))||!valid(p.after))throw Error('DRAFT_INVALID');
  const key=guidKey(p.guid),source=originals.get(key);
  if(seen.has(key)||(p.before===null?Boolean(source):!source||!same(source.value,restore(p.before))))throw Error('DRAFT_CONFLICT');
  seen.add(key);
  patches.push({guid:p.guid,before:p.before===null?null:restore(p.before),after:restore(p.after)});
 }
 return patches;
}

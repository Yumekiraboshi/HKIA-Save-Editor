import type {AchievementEntry,AchievementPatch,AchievementValue} from './worker-client';

export type StoredValue={complete:boolean;current:number;completed:[string,number]|null};
export type StoredPatch={guid:[number,number,number,number];before:StoredValue;after:StoredValue};
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
  if(!previous)throw Error('DRAFT_INVALID');
  if(!same(previous.value,row.value))result.push({
   guid:row.guid,before:store(previous.value),after:store(row.value)
  });
 }
 if(current.length!==baseline.length)throw Error('DRAFT_INVALID');
 return result;
}
export function decodeAchievementDraft(value:unknown,baseline:readonly AchievementEntry[]):AchievementPatch[]{
 if(!Array.isArray(value)||value.length>10000)throw Error('DRAFT_INVALID');
 const originals=new Map(baseline.map(a=>[guidKey(a.guid),a]));
 const seen=new Set<string>();const patches:AchievementPatch[]=[];
 for(const unknownPatch of value){
  if(!unknownPatch||typeof unknownPatch!=='object')throw Error('DRAFT_INVALID');
  const p=unknownPatch as StoredPatch;
  if(!Array.isArray(p.guid)||p.guid.length!==4||p.guid.some(n=>!Number.isInteger(n)||n<0||n>0xffffffff)||
   !valid(p.before)||!valid(p.after))throw Error('DRAFT_INVALID');
  const key=guidKey(p.guid),source=originals.get(key);
  if(seen.has(key)||!source||!same(source.value,restore(p.before)))throw Error('DRAFT_CONFLICT');
  seen.add(key);
  patches.push({guid:p.guid,before:restore(p.before),after:restore(p.after)});
 }
 return patches;
}

import type {AchievementValue} from './worker-client';

/** A direct click changes only an existing AchievementModel's completion flag and completion timestamp.
 * It never invents missing records, rewrites progress/counters, or grants rewards.
 */
export function toggleAchievementState(before:AchievementValue,nowMs:number):AchievementValue{
 if(!before||typeof before.complete!=='boolean'||!Number.isFinite(before.current)||before.current<0||
  !Number.isSafeInteger(nowMs)||nowMs<0||nowMs>253402300799000)
  throw Error('ACH_QUICK_TOGGLE_INVALID');
 if(before.complete)return {complete:false,current:before.current,completed:null};
 const seconds=Math.floor(nowMs/1000);
 return {complete:true,current:before.current,
  completed:[BigInt(seconds),(nowMs-seconds*1000)*1_000_000]};
}

import type {AchievementValue} from './worker-client';

/**
 * A single achievement click changes its saved status, timestamp AND progress
 * coherently when the v3.0.1 source goal is known.
 *
 * - Earn: set progress to exactly the native goal (not over the limit).
 * - Revoke: preserve partial progress if below goal; otherwise clamp to goal-1.
 * - Unknown future-version goals: preserve progress rather than invent a limit.
 * - Never rewrite a separate game counter, reward receipt or platform unlock.
 * Previous values remain recoverable via editor Undo.
 */
export function toggleAchievementState(
 before:AchievementValue,nowMs:number,target:number|null=null
):AchievementValue{
 if(!before||typeof before.complete!=='boolean'||!Number.isFinite(before.current)||before.current<0||
  !Number.isSafeInteger(nowMs)||nowMs<0||nowMs>253402300799000||
  !(target===null||Number.isSafeInteger(target)&&target>0&&target<=1_000_000))
  throw Error('ACH_QUICK_TOGGLE_INVALID');
 if(before.complete)return {
  complete:false,current:target===null?before.current:Math.min(before.current,target-1),completed:null
 };
 const seconds=Math.floor(nowMs/1000);
 return {
  complete:true,current:target===null?before.current:target,
  completed:[BigInt(seconds),(nowMs-seconds*1000)*1_000_000]
 };
}

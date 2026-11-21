import type {AchievementEntry,AchievementPatch,AchievementDraftPatch,AchievementValue,ChangeRequest} from './worker-client';

/**
 * Svelte 5 $state creates deep Proxies. Web Worker postMessage uses structuredClone,
 * which cannot serialize those Proxies. Rebuild every nested value as plain data
 * at the RPC boundary, without JSON serialization (timestamps contain bigint).
 */
export function workerAchievementGuid(guid:AchievementEntry['guid']):AchievementEntry['guid']{
 return [guid[0],guid[1],guid[2],guid[3]];
}
export function workerAchievementValue(value:AchievementValue):AchievementValue{
 const completed=value.completed;
 return {
  complete:value.complete,
  current:value.current,
  completed:completed===null?null:[completed[0],completed[1]]
 };
}
export function workerAchievementPatch(patch:AchievementPatch):AchievementPatch{
 return {
  guid:workerAchievementGuid(patch.guid),
  before:workerAchievementValue(patch.before),
  after:workerAchievementValue(patch.after)
 };
}
export function workerAchievementDraftPatch(patch:AchievementDraftPatch):AchievementDraftPatch{
 return {
  guid:workerAchievementGuid(patch.guid),
  before:patch.before===null?null:workerAchievementValue(patch.before),
  after:workerAchievementValue(patch.after)
 };
}
export function workerCollectionPatch(patch:ChangeRequest):ChangeRequest{
 return {id:patch.id,before:patch.before,after:patch.after};
}

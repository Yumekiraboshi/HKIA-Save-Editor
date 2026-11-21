import type {AchievementHierarchy} from './achievement-groups';
import type {AchievementEntry,AchievementPatch,AchievementValue} from './worker-client';
import {achievementGuid} from './achievement-index';

/**
 * A category is itself a saved achievement. When editing the last outstanding
 * child, complete the existing parent in the *same atomic operation*.
 *
 * The original game's group counter is separate and is NOT modified here.
 * A missing saved child or parent never becomes an invented save document.
 * A completed parent is never retimed or silently unearned.
 */
export function planCategoryParentCompletion(
 hierarchy:AchievementHierarchy|null,
 saved:readonly AchievementEntry[],
 editedGuid:AchievementEntry['guid'],
 editedNext:AchievementValue
):AchievementPatch|null{
 if(!hierarchy)return null;
 const guid=achievementGuid(editedGuid);
 const parentGuid=hierarchy.owner.get(guid);
 if(!parentGuid)return null;
 const group=hierarchy.byGuid.get(parentGuid);
 if(!group||!group.children.includes(guid))return null;

 const byGuid=new Map<string,AchievementEntry>();
 for(const entry of saved){
  const key=achievementGuid(entry.guid);
  if(byGuid.has(key))throw Error('ACH_GROUP_DUPLICATE');
  byGuid.set(key,entry);
 }
 const parent=byGuid.get(parentGuid);
 if(!parent||parent.value.complete)return null;

 let latest:[bigint,number]|null=null;
 let completeDates=0;
 for(const childGuid of group.children){
  const child=byGuid.get(childGuid);
  if(!child)return null;
  const value=childGuid===guid?editedNext:child.value;
  if(!value.complete)return null;
  if(value.completed){
   const [seconds,nanos]=value.completed;
   if(seconds<0n||seconds>253402300799n||!Number.isSafeInteger(nanos)||nanos<0||
    nanos>=1_000_000_000||nanos%100!==0)throw Error('ACH_GROUP_DATE_INVALID');
   if(latest===null||seconds>latest[0]||(seconds===latest[0]&&nanos>latest[1]))
    latest=[seconds,nanos];
   completeDates++;
  }
 }
 // An unknown timestamp cannot be replaced by a guessed "last child" date.
 // Complete the saved parent but leave its timestamp unknown when needed.
 const completed=completeDates===group.children.length?latest:null;
 return {
  guid:[...parent.guid] as AchievementEntry['guid'],
  before:parent.value,
  after:{complete:true,current:group.children.length,completed}
 };
}

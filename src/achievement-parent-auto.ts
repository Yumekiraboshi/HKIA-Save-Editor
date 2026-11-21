import type {AchievementHierarchy} from './achievement-groups';
import type {AchievementEntry,AchievementPatch,AchievementValue} from './worker-client';
import {achievementGuid} from './achievement-index';

type PlannedParent={guid:AchievementEntry['guid'];before:AchievementValue|null;after:AchievementValue};

/** Source-verified group completion; only a USER edit can trigger this planner.
 * A missing edited child is allowed, but every other child must be a real,
 * completed save record. No clock value is invented when dates are missing.
 */
function planParent(
 hierarchy:AchievementHierarchy|null,
 saved:readonly AchievementEntry[],
 editedGuid:AchievementEntry['guid'],
 editedNext:AchievementValue
):PlannedParent|null{
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
 if(parent?.value.complete)return null;
 let latest:[bigint,number]|null=null;
 let completeDates=0;
 for(const childGuid of group.children){
  const value=childGuid===guid?editedNext:byGuid.get(childGuid)?.value;
  if(!value?.complete)return null;
  if(value.completed){
   const [seconds,nanos]=value.completed;
   if(seconds<0n||seconds>253402300799n||!Number.isSafeInteger(nanos)||nanos<0||
    nanos>=1_000_000_000||nanos%100!==0)throw Error('ACH_GROUP_DATE_INVALID');
   if(latest===null||seconds>latest[0]||(seconds===latest[0]&&nanos>latest[1]))latest=[seconds,nanos];
   completeDates++;
  }
 }
 const completed=completeDates===group.children.length?latest:null;
 return {
  guid:parent?[...parent.guid] as AchievementEntry['guid']:
   parentGuid.split(':').map(x=>parseInt(x,16)) as AchievementEntry['guid'],
  before:parent?.value??null,
  after:{complete:true,current:group.children.length,completed}
 };
}
/** Existing saved parent: one atomic CAS update with the final child. */
export function planCategoryParentCompletion(
 hierarchy:AchievementHierarchy|null,saved:readonly AchievementEntry[],
 editedGuid:AchievementEntry['guid'],editedNext:AchievementValue
):AchievementPatch|null{
 const planned=planParent(hierarchy,saved,editedGuid,editedNext);
 return planned?.before===null||!planned?null:{
  guid:planned.guid,before:planned.before,after:planned.after
 };
}
/** No saved parent: create an original Union(16) parent when its last child
 * becomes complete, rather than leaving the category permanently unknown.
 */
export function planMissingCategoryParentCompletion(
 hierarchy:AchievementHierarchy|null,saved:readonly AchievementEntry[],
 editedGuid:AchievementEntry['guid'],editedNext:AchievementValue
):{guid:AchievementEntry['guid'];after:AchievementValue}|null{
 const planned=planParent(hierarchy,saved,editedGuid,editedNext);
 return planned?.before===null?{guid:planned.guid,after:planned.after}:null;
}

export function planCategoryParentRevocation(
 hierarchy:AchievementHierarchy|null,saved:readonly AchievementEntry[],
 editedGuid:AchievementEntry['guid'],editedBefore:AchievementValue,editedNext:AchievementValue
):AchievementPatch|null{
 if(!hierarchy||!editedBefore.complete||editedNext.complete)return null;
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
 if(!parent?.value.complete)return null;
 const completeSiblings=group.children.reduce(
  (count,child)=>count+(child!==guid&&byGuid.get(child)?.value.complete===true?1:0),0
 );
 return {
  guid:[...parent.guid] as AchievementEntry['guid'],
  before:parent.value,
  after:{complete:false,current:Math.min(parent.value.current,completeSiblings),completed:null}
 };
}

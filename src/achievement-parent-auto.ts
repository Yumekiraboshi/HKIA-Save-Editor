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

/** Keep a source-derived completed category's date consistent with an edited child,
 * but ONLY while the saved parent still matches the previous latest child date.
 * Preserve independent/historical parent timestamps, absent/undated siblings,
 * incomplete groups, and parent progress. Never synthesize a timestamp.
 * The caller gates this source hierarchy to v3.0.1 and applies both patches
 * through a single compare-and-swap Rust/WASM transaction.
 */
export function planCategoryParentDateSync(
 hierarchy:AchievementHierarchy|null,saved:readonly AchievementEntry[],
 editedGuid:AchievementEntry['guid'],editedBefore:AchievementValue,editedNext:AchievementValue
):AchievementPatch|null{
 if(!hierarchy||!editedBefore.complete||!editedNext.complete||
  !editedBefore.completed||!editedNext.completed||
  !Object.is(editedBefore.current,editedNext.current))return null;
 const sameTime=(a:readonly [bigint,number],b:readonly [bigint,number])=>
  a[0]===b[0]&&a[1]===b[1];
 const validTime=(date:readonly [bigint,number])=>
  date[0]>=0n&&date[0]<=253402300799n&&
  Number.isSafeInteger(date[1])&&date[1]>=0&&date[1]<1_000_000_000&&date[1]%100===0;
 if(!validTime(editedBefore.completed)||!validTime(editedNext.completed)||
  sameTime(editedBefore.completed,editedNext.completed))return null;
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
 const currentChild=byGuid.get(guid)?.value;
 if(!currentChild||!currentChild.complete||
  !Object.is(currentChild.current,editedBefore.current)||
  !currentChild.completed||!sameTime(currentChild.completed,editedBefore.completed))return null;
 const parent=byGuid.get(parentGuid);
 if(!parent?.value.complete||parent.value.current!==group.children.length||
  !parent.value.completed||!validTime(parent.value.completed))return null;
 let oldLatest:readonly [bigint,number]|null=null;
 let newLatest:readonly [bigint,number]|null=null;
 for(const childGuid of group.children){
  const child=byGuid.get(childGuid)?.value;
  if(!child?.complete||!child.completed||!validTime(child.completed))return null;
  const beforeTime=child.completed;
  const afterTime=childGuid===guid?editedNext.completed:beforeTime;
  if(!oldLatest||beforeTime[0]>oldLatest[0]||
   beforeTime[0]===oldLatest[0]&&beforeTime[1]>oldLatest[1])oldLatest=beforeTime;
  if(!newLatest||afterTime[0]>newLatest[0]||
   afterTime[0]===newLatest[0]&&afterTime[1]>newLatest[1])newLatest=afterTime;
 }
 if(!oldLatest||!newLatest||!sameTime(parent.value.completed,oldLatest)||
  sameTime(oldLatest,newLatest))return null;
 return {
  guid:[...parent.guid] as AchievementEntry['guid'],
  before:parent.value,
  after:{...parent.value,completed:[newLatest[0],newLatest[1]]}
 };
}

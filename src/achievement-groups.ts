import type {AchievementIndex} from './achievement-index';
import type {AchievementListRow} from './achievement-catalog';

export type AchievementGroup={guid:string;children:readonly string[]};
export type AchievementHierarchy={
 groups:AchievementGroup[];
 byGuid:Map<string,AchievementGroup>;
 owner:Map<string,string>;
};
export type AchievementGroupSummary={
 guid:string;total:number;recorded:number;completed:number;missing:number;
 parentComplete:boolean|null;
};
const GUID=/^[0-9a-f]{8}(?::[0-9a-f]{8}){3}$/;
export function decodeAchievementGroups(input:unknown,index:AchievementIndex):AchievementHierarchy{
 if(input===null||typeof input!=='object'||Array.isArray(input))throw Error('ACH_GROUPS_INVALID');
 const obj=input as Record<string,unknown>;
 if(obj.schema!=='HKIA.AchievementGroups.1'||obj.version!=='3.0.1'||
  obj.rootCounterGuid!=='7487ba9dd0440b34cb0b45d9877456f9'||
  !Array.isArray(obj.groups)||obj.groups.length!==63||index.size!==820)throw Error('ACH_GROUPS_INVALID');
 const groups:AchievementGroup[]=[],byGuid=new Map<string,AchievementGroup>(),owner=new Map<string,string>();
 const categories=new Set<string>();
 for(const source of obj.groups){
  if(!Array.isArray(source)||source.length!==2)throw Error('ACH_GROUPS_INVALID');
  const [guid,children]=source;
  if(typeof guid!=='string'||!GUID.test(guid)||!index.has(guid)||categories.has(guid)||
   !Array.isArray(children)||children.length<1||children.length>820)throw Error('ACH_GROUPS_INVALID');
  categories.add(guid);
  const included:string[]=[];
  for(const child of children){
   if(typeof child!=='string'||!GUID.test(child)||!index.has(child)||owner.has(child)||child===guid)
    throw Error('ACH_GROUPS_INVALID');
   owner.set(child,guid);included.push(child);
  }
  const group={guid,children:included};groups.push(group);byGuid.set(guid,group);
 }
 if(categories.size!==63||owner.size!==757)throw Error('ACH_GROUPS_INCOMPLETE');
 for(const [member] of owner){if(categories.has(member))throw Error('ACH_GROUPS_CYCLE');}
 for(const [guid] of index){if(!categories.has(guid)&&!owner.has(guid))throw Error('ACH_GROUPS_INCOMPLETE');}
 return {groups,byGuid,owner};
}
export async function loadAchievementGroups(base:string,index:AchievementIndex):Promise<AchievementHierarchy>{
 const response=await fetch(base+'achievement-groups.json');
 if(!response.ok)throw Error('ACH_GROUPS_UNAVAILABLE');
 return decodeAchievementGroups(await response.json(),index);
}
export function groupRows(hierarchy:AchievementHierarchy,groupId:string,all:readonly AchievementListRow[]):AchievementListRow[]{
 const group=hierarchy.byGuid.get(groupId);
 if(!group)return [];
 const lookup=new Map(all.map(r=>[r.guid,r]));
 return [group.guid,...group.children].map(guid=>lookup.get(guid)).filter((r):r is AchievementListRow=>r!==undefined);
}
export function ungroupedRows(hierarchy:AchievementHierarchy,all:readonly AchievementListRow[]):AchievementListRow[]{
 return all.filter(r=>!hierarchy.byGuid.has(r.guid)&&!hierarchy.owner.has(r.guid));
}
export function groupSummaries(hierarchy:AchievementHierarchy,all:readonly AchievementListRow[]):AchievementGroupSummary[]{
 const lookup=new Map(all.map(r=>[r.guid,r]));
 return hierarchy.groups.map(g=>{
  let recorded=0,completed=0;
  for(const id of g.children){const record=lookup.get(id)?.row;
   if(record){recorded++;if(record.value.complete)completed++;}
  }
  return {guid:g.guid,total:g.children.length,recorded,completed,
   missing:g.children.length-recorded,parentComplete:lookup.get(g.guid)?.row?.value.complete??null};
 });
}

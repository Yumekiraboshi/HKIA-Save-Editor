import type {AchievementIndex} from './achievement-index';
import {achievementGuid} from './achievement-index';
import type {AchievementEntry} from './worker-client';

export type AchievementListRow={guid:string;row:AchievementEntry|null;index:number};
export function joinAchievementCatalog(index:AchievementIndex,saved:readonly AchievementEntry[]):AchievementListRow[]{
 const savedByGuid=new Map<string,AchievementEntry>();
 for(const row of saved){
  const guid=achievementGuid(row.guid);
  if(savedByGuid.has(guid))throw Error('ACH_DUPLICATE_SAVE_GUID');
  savedByGuid.set(guid,row);
 }
 if(index.size===0)return saved.map((row,i)=>({guid:achievementGuid(row.guid),row,index:i+1}));
 const result:AchievementListRow[]=[];
 for(const guid of index.keys())result.push({guid,row:savedByGuid.get(guid)??null,index:result.length+1});
 for(const [guid,row] of savedByGuid){
  if(!index.has(guid))result.push({guid,row,index:result.length+1});
 }
 return result;
}

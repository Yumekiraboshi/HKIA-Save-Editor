import type {AchievementListRow} from './achievement-catalog';

/** Presentation-only search across all game-source leaf achievements.
 * A category selection scopes browsing, never searches. Searching every
 * category prevents a valid achievement from appearing to be missing.
 * Native edit/creation eligibility and save data remain Rust-owned.
 */
export function searchAchievementRows(
 query:string,
 all:readonly AchievementListRow[],
 scoped:readonly AchievementListRow[],
 nameFor:(guid:string,index:number)=>string,
 keyFor:(guid:string)=>string
):AchievementListRow[]{
 const q=query.trim().toLocaleLowerCase();
 if(!q)return [...scoped];
 return all.filter(x=>nameFor(x.guid,x.index).toLocaleLowerCase().includes(q)||
  keyFor(x.guid).toLocaleLowerCase().includes(q));
}

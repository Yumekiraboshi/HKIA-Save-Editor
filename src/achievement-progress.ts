/** Source-defined progress goal for a saved achievement.
 * Category achievements use the number of direct native group members: the
 * GameCounterAchievementsDefinition threshold is a sentinel (1), not the
 * number of achievements in the group. Leaf achievements use their own
 * game-source threshold. Neither figure implies automatic completion.
 */
export function achievementProgressTarget(
 groupMembers:number|null,
 sourceThreshold:number|null
):number|null{
 const target=groupMembers===null?sourceThreshold:groupMembers;
 return typeof target==='number'&&Number.isSafeInteger(target)&&target>0?target:null;
}

/**
 * Local datetime input conversion for an existing native achievement timestamp.
 *
 * The game stores (Unix seconds, nanoseconds) with 100-nanosecond precision.
 * A datetime-local control edits whole seconds only, so the original
 * fractional nanoseconds must survive any user-selected calendar change.
 * This is UI input/format conversion, never a save mutation or game rule.
 */
type AchievementTimestamp=readonly [seconds:bigint,nanoseconds:number];

const MAX_SECONDS=253402300799n;
const INPUT=/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
const pad=(value:number,digits=2)=>String(value).padStart(digits,'0');

function validTimestamp(value:AchievementTimestamp):boolean{
 const [seconds,nanos]=value;
 return seconds>=0n&&seconds<=MAX_SECONDS&&
  Number.isInteger(nanos)&&nanos>=0&&nanos<1_000_000_000&&nanos%100===0;
}

/** Missing native completion timestamp stays BLANK, never auto-set to now. */
export function toAchievementDateTimeValue(value:AchievementTimestamp|null):string{
 if(value===null||!validTimestamp(value))return '';
 const ms=Number(value[0]*1000n+BigInt(Math.floor(value[1]/1_000_000)));
 const d=new Date(ms);
 if(!Number.isFinite(d.getTime())||d.getFullYear()<1970||d.getFullYear()>9999)return '';
 return [pad(d.getFullYear(),4),pad(d.getMonth()+1),pad(d.getDate())].join('-')+
  'T'+[pad(d.getHours()),pad(d.getMinutes()),pad(d.getSeconds())].join(':');
}

/** Preserve original 100-ns fraction, even when the visible date changes. */
export function fromAchievementDateTimeValue(
 value:string,original:AchievementTimestamp|null
):[bigint,number]{
 const full=value.length===16?value+':00':value;
 if(!INPUT.test(full))throw Error('INVALID_ACHIEVEMENT_DATE');
 const ms=new Date(full).getTime();
 if(!Number.isFinite(ms)||ms<0||ms>253402300799000)
  throw Error('INVALID_ACHIEVEMENT_DATE');
 const next:[bigint,number]=[BigInt(Math.floor(ms/1000)),original?.[1]??0];
 // Reject invalid local dates, timezone-gap normalization, and bad 100ns.
 if(!validTimestamp(next)||toAchievementDateTimeValue(next)!==full)
  throw Error('INVALID_ACHIEVEMENT_DATE');
 return next;
}

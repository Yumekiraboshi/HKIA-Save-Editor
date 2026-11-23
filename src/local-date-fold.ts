/**
 * UI-only datetime-local conversion. The browser resolves an ambiguous
 * daylight-saving fall-back hour to its FIRST UTC occurrence by default.
 * When the source save's instant lies in the SECOND occurrence, an adjacent
 * local-time edit must not silently jump back one hour.
 *
 * This chooses between actual instants for an already-entered wall time;
 * it never creates a timestamp, game edit, or timezone policy in the engine.
 * Callers still validate source precision, date bounds and invalid inputs.
 */
const pad=(value:number,digits=2)=>String(value).padStart(digits,'0');

function localClock(value:Date):string{
 return [pad(value.getFullYear(),4),pad(value.getMonth()+1),pad(value.getDate())].join('-')+
  'T'+[pad(value.getHours()),pad(value.getMinutes()),pad(value.getSeconds())].join(':');
}

/** Keep the source's UTC-offset occurrence only if that occurrence truly
 * exists for the user's edited wall time; otherwise use the browser's normal
 * local-time interpretation and let the caller reject normalized gaps.
 */
export function resolveEditedLocalTime(full:string,sourceMilliseconds:number|null):number{
 const primary=new Date(full).getTime();
 if(!Number.isFinite(primary)||sourceMilliseconds===null||
  !Number.isFinite(sourceMilliseconds))return primary;
 const sourceOffset=new Date(sourceMilliseconds).getTimezoneOffset();
 const primaryOffset=new Date(primary).getTimezoneOffset();
 if(!Number.isFinite(sourceOffset)||!Number.isFinite(primaryOffset)||
  sourceOffset===primaryOffset)return primary;
 const alternate=primary+(sourceOffset-primaryOffset)*60_000;
 const date=new Date(alternate);
 if(!Number.isFinite(alternate)||!Number.isFinite(date.getTime())||
  date.getTimezoneOffset()!==sourceOffset||localClock(date)!==full)return primary;
 return alternate;
}

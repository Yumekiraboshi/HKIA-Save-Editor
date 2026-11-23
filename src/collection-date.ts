import {resolveEditedLocalTime} from './local-date-fold';

const EPOCH=621355968000000000n;
const MAX_TICKS=3155378975999999999n;
const TICKS_PER_SECOND=10000000n;
const INPUT=/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

export function toDateTimeValue(ticks:bigint):string{
 if(ticks<1n||ticks>MAX_TICKS)return '';
 const delta=ticks-EPOCH;
 const ms=delta>=0n?delta/10000n:(delta-9999n)/10000n;
 if(ms< -8640000000000000n||ms>8640000000000000n)return '';
 const d=new Date(Number(ms));
 if(!Number.isFinite(d.getTime())||d.getFullYear()<1||d.getFullYear()>9999)return '';
 const pad=(value:number,digits=2)=>String(value).padStart(digits,'0');
 return [pad(d.getFullYear(),4),pad(d.getMonth()+1),pad(d.getDate())].join('-')+'T'+[pad(d.getHours()),pad(d.getMinutes()),pad(d.getSeconds())].join(':');
}

export function fromDateTimeValue(value:string,original:bigint):bigint{
 const full=value.length===16?value+':00':value;
 if(!INPUT.test(full))throw Error('INVALID_RECORD_DATE');
 // Never reinterpret an unchanged second-occurrence local timestamp.
 if(toDateTimeValue(original)===full)return original;
 const sourceDelta=original-EPOCH;
 const sourceMs=sourceDelta>=0n?sourceDelta/10000n:(sourceDelta-9999n)/10000n;
 const ms=resolveEditedLocalTime(full,Number(sourceMs));
 if(!Number.isFinite(ms))throw Error('INVALID_RECORD_DATE');
 const fraction=((original-EPOCH)%TICKS_PER_SECOND+TICKS_PER_SECOND)%TICKS_PER_SECOND;
 const ticks=EPOCH+BigInt(ms)*10000n+fraction;
 if(ticks<1n||ticks>MAX_TICKS||toDateTimeValue(ticks)!==full)throw Error('INVALID_RECORD_DATE');
 return ticks;
}

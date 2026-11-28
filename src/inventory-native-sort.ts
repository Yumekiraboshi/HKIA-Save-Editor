import type {InventoryEntry} from './worker-client';

export type NativeInventorySort={
 itemRanks:ReadonlyMap<number,number>;
 colorRanks:ReadonlyMap<number,number>;
 patternRanks:ReadonlyMap<number,number>;
};
const SOURCE_SHA='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0';
const FILE_SHA='d37e7ba5f0db6413ab9b24bb2969479073c533c90f2c08a24363c8d25659e3ad';
const ranks=(ids:unknown,count:number,max:number)=>{
 if(!Array.isArray(ids)||ids.length!==count||ids.some(id=>!Number.isSafeInteger(id)||id<=0||id>max)||new Set(ids).size!==count)throw Error('Invalid native inventory order');
 return new Map<number,number>(ids.map((id,i)=>[id,i]));
};
export function decodeNativeInventorySort(raw:unknown):NativeInventorySort{
 if(!raw||typeof raw!=='object')throw Error('Invalid native inventory order');
 const d=raw as Record<string,unknown>;
 if(d.schema!=='HKIA.NativeInventorySort.1'||d.version!=='3.0.1'||d.sourceSha256!==SOURCE_SHA||d.sortDefinitionPathId!=='6705064689596706373'||d.idsSha256!=='8c30a6f8e209218991da413fce84d955eef519018bd2d8a72c181a3989cf292d')throw Error('Unverified native inventory order');
 const itemRanks=ranks(d.sortedItemIds,12156,2147483647),unranked=ranks(d.unranked,7,2147483647);
 if([...unranked.keys()].some(id=>itemRanks.has(id)))throw Error('Overlapping native inventory order');
 return {itemRanks,colorRanks:ranks(d.colorOrder,30,30),patternRanks:ranks(d.patternOrder,16,16)};
}
export async function loadNativeInventorySort(base:string):Promise<NativeInventorySort>{
 const response=await fetch(base+'inventory-native-sort.json');
 if(!response.ok)throw Error('Native inventory order unavailable');
 const bytes=await response.arrayBuffer();
 if(bytes.byteLength!==128920)throw Error('Invalid native inventory order length');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==FILE_SHA)throw Error('Invalid native inventory order digest');
 return decodeNativeInventorySort(JSON.parse(new TextDecoder().decode(bytes)));
}
const LAST=Number.MAX_SAFE_INTEGER;
function pinRank(row:InventoryEntry):number{
 const rank=row.nativePinOrder;
 return typeof rank==='number'&&Number.isSafeInteger(rank)&&rank>=0?rank:LAST;
}
/** Presentation-only projection. Pin ranks must be supplied by verified native snapshot,
 * never the old editor-only lock. Other native comparer stages remain separate. */
export function compareNativeInventory(a:InventoryEntry,b:InventoryEntry,source:NativeInventorySort):number{
 return pinRank(a)-pinRank(b)||
  (source.itemRanks.get(a.itemId)??LAST)-(source.itemRanks.get(b.itemId)??LAST)||
  a.itemId-b.itemId||a.documentId-b.documentId;
}

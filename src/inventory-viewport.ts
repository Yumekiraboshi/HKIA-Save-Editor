/** Presentation-only fixed-row virtualization. The full filtered row count
 * determines scroll geometry; mounted cards are limited to the viewport. */
export type InventoryViewport={columns:number;rowHeight:number;gap:number;top:number;bottom:number};
export function inventoryVirtualWindow(count:number,v:InventoryViewport,overscan=480){
 const columns=Math.max(1,Math.floor(v.columns));
 const rows=Math.ceil(count/columns),stride=v.rowHeight+v.gap;
 if(!rows)return {start:0,end:0,before:0,after:0};
 const first=Math.max(0,Math.min(rows-1,Math.floor((v.top-overscan)/stride)));
 const last=Math.max(first+1,Math.min(rows,Math.ceil((v.bottom+overscan)/stride)));
 return {start:first*columns,end:Math.min(count,last*columns),before:first*stride,after:(rows-last)*stride};
}

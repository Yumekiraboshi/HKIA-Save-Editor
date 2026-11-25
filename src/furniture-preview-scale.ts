/** Display-only native FurnitureCustomizerItemPreview.MaybeAdjustItemScale.
 * Bounds extents must come from the displayed-object bounds, not mesh names.
 * Lossy scale is explicit; no guessed camera or save editing logic. */
type Vec3=readonly [number,number,number];
export function fitFurniturePreviewScale(extents:Vec3,lossyScale:Vec3,localScale:Vec3,maxObjectSize:number,considerLossyScale:boolean):Vec3{
 if(![...extents,...lossyScale,...localScale,maxObjectSize].every(Number.isFinite)||extents.some(v=>v<0)||maxObjectSize<=0||(considerLossyScale&&lossyScale.some(v=>v===0)))throw Error('FURNITURE_PREVIEW_SCALE');
 const size=Math.hypot(...extents.map((v,i)=>2*v/(considerLossyScale?lossyScale[i]:1)));
 if(!Number.isFinite(size))throw Error('FURNITURE_PREVIEW_SCALE');
 const factor=size>maxObjectSize?maxObjectSize/size:1;
 return [localScale[0]*factor,localScale[1]*factor,localScale[2]*factor];
}

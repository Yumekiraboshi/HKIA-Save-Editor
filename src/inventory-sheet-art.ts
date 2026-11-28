import type {NativeSheetAsset,SpriteCell} from './icon-packs';
import {loadVerifiedArtAsset} from './dynamic-art-assets';
import {trackUnavailableArt,untrackUnavailableArt} from './dynamic-art-view';

type DecodedSheet={url:string;height:number};
/** Only the ten immutable source-pinned inventory sheets are accepted.
 * Keep one page-lifetime object URL per successfully decoded sheet; never
 * install an unverified CSS network URL or cache a failed request. */
export function createInventorySheetLoader(decode=decodeSheet){
 const sheets=new Map<string,Promise<DecodedSheet>>();
 return (asset:NativeSheetAsset)=>{
  if(!/^sheet-00[0-9]\.webp$/.test(asset.file)||!/^[a-f0-9]{64}$/.test(asset.sha256)||!Number.isSafeInteger(asset.bytes)||asset.bytes<1||asset.bytes>2_000_000)
   return Promise.reject(Error('INVENTORY_SHEET_ASSET'));
  const key=JSON.stringify([asset.root,asset.file,asset.sha256,asset.bytes]);
  const cached=sheets.get(key);if(cached)return cached;
  const task=decode(asset).catch(error=>{if(sheets.get(key)===task)sheets.delete(key);throw error;});
  sheets.set(key,task);return task;
 };
}
async function decodeSheet(asset:NativeSheetAsset):Promise<DecodedSheet>{
 const data=await loadVerifiedArtAsset(asset.root,asset.file,asset.sha256,2_000_000,asset.bytes);
 const blob=new Blob([data],{type:'image/webp'}),image=await createImageBitmap(blob);
 try{
  if(image.width!==1152||image.height<96||image.height>1152||image.height%96!==0)throw Error('INVENTORY_SHEET_DIMENSIONS');
  return {url:URL.createObjectURL(blob),height:image.height};
 }finally{image.close();}
}
const loadSheet=createInventorySheetLoader();
/** Collection ZIP cells are already local object URLs. Inventory atlas cells
 * wait for verified sheet bytes; shared recovery is canceled on unmount. */
export function startInventorySpriteRequest(sprite:SpriteCell,show:(value:SpriteCell|undefined)=>void,load=loadSheet):()=>void{
 if(!sprite.nativeSheet){show(sprite);return ()=>{};}
 const asset=sprite.nativeSheet;
 let canceled=false,pending=false;
 show(undefined);
 async function retry(){
  if(canceled||pending)return;
  untrackUnavailableArt(retry);pending=true;
  try{
   const sheet=await load(asset);
   if(canceled)return;
   if(sprite.x<0||sprite.x+96>1152||sprite.y<0||sprite.y+96>sheet.height)throw Error('INVENTORY_SHEET_CELL');
   show({...sprite,url:sheet.url});
  }catch{if(!canceled)trackUnavailableArt(retry);}
  finally{pending=false;}
 }
 void retry();
 return ()=>{canceled=true;untrackUnavailableArt(retry);};
}

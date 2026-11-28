import type {SpriteCell} from './icon-packs';
import {startInventorySpriteRequest} from './inventory-sheet-art';

/** One read-only reactive binding for every atlas consumer. A network URL
 * from the native sheet index must never be installed as a CSS fallback.
 * Collection cells and independently decoded growth cells are local URLs. */
export function createVerifiedSpriteView(getSprite:()=>SpriteCell|undefined,enabled:()=>boolean=()=>true){
 let verified=$state.raw<{source:SpriteCell;cell:SpriteCell}|undefined>();
 const cell=$derived.by(()=>{
  const source=getSprite();
  if(!source)return undefined;
  if(source.nativeSheet)return verified?.source===source?verified.cell:undefined;
  return source;
 });
 $effect(()=>{
  const source=getSprite();
  if(!source?.nativeSheet||!enabled())return;
  return startInventorySpriteRequest(source,result=>{verified=result?{source,cell:result}:undefined;});
 });
 return {get cell(){return cell}};
}

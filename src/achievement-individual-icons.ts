import type {AchievementIndex} from './achievement-index';
import {loadVerifiedAchievementImage,loadVerifiedAchievementManifest} from './achievement-atlas-image';

export type IndividualAchievementSprite={
 readonly index:number;
 readonly saveGuid:string;
 readonly sourceKey:string;
 readonly spritePathId:string;
 readonly x:string;
 readonly y:string;
};
export type IndividualAchievementAtlas={
 readonly url:string;
 readonly bySaveGuid:ReadonlyMap<string,IndividualAchievementSprite>;
 dispose?():void;
};
const MANIFEST_SHA='e168c1ca10fe7a0d7cb4107cdb6454ddd73c5d94e3b36bfb2be2802b4e487e9a';
const HEX64=/^[0-9a-f]{64}$/;
const SOURCE_GUID=/^[0-9a-f]{32}$/;
const SPRITE_ID=/^-?\d{1,20}$/;
const ATLAS_SHA='0fc03993f61444404b895b73128e40262fa283282ff02d269fb9fdd1e061f6e0';
const IMAGE_MAP_SHA='555c8fa663cb1462fa455f804d98580aaac0ff58628cc601fa6c25532632771b';
const COLS=14,ROWS=15,CELL=112,COUNT=198;

/**
 * Maps the Steam v3.0.1 original LocalAchievement definition key to the
 * corresponding known save GUID. Source asset GUIDs are *not* save GUIDs.
 * Null Icon PPtrs have no entry and cannot accidentally inherit another icon.
 */
export function decodeAchievementIndividualAtlas(
 input:unknown,index:AchievementIndex,base:string
):IndividualAchievementAtlas{
 if(!input||typeof input!=='object'||Array.isArray(input)||index.size!==820)
  throw Error('ACH_INDIVIDUAL_ICONS_INVALID');
 const meta=input as Record<string,unknown>;
 const layout=meta.layout as Record<string,unknown>|null;
 if(meta.schema!=='HKIA.AchievementIndividualAtlas.1'||meta.gameVersion!=='3.0.1'||
  meta.atlasSha256!==ATLAS_SHA||meta.sourceImageMapSha256!==IMAGE_MAP_SHA||
  !layout||layout.columns!==COLS||layout.rows!==ROWS||layout.cellPx!==CELL||
  meta.categoryIconCount!==63||meta.sourceNullCount!==559||
  !Array.isArray(meta.icons)||meta.icons.length!==COUNT)
  throw Error('ACH_INDIVIDUAL_ICONS_INVALID');
 const saveByKey=new Map<string,string>();
 for(const [guid,record] of index){
  if(saveByKey.has(record.key))throw Error('ACH_INDIVIDUAL_ICONS_INDEX_DUPLICATE');
  saveByKey.set(record.key,guid);
 }
 const seenSource=new Set<string>();
 const seenSprite=new Map<string,string>();
 const bySaveGuid=new Map<string,IndividualAchievementSprite>();
 for(let i=0;i<COUNT;i++){
  const c=meta.icons[i] as Record<string,unknown>|null;
  if(!c||typeof c!=='object'||Array.isArray(c)||c.index!==i||
   typeof c.sourceKey!=='string'||c.sourceKey.startsWith('collection_')||
   typeof c.sourceGuid!=='string'||!SOURCE_GUID.test(c.sourceGuid)||seenSource.has(c.sourceGuid)||
   typeof c.spritePathId!=='string'||!SPRITE_ID.test(c.spritePathId)||
   typeof c.sourceSha256!=='string'||!HEX64.test(c.sourceSha256)||
   !Array.isArray(c.originalSize)||c.originalSize.length!==2||
   c.originalSize.some(x=>!Number.isInteger(x)||x<1||x>8192))
   throw Error('ACH_INDIVIDUAL_ICONS_MAPPING_INVALID');
  const saveGuid=saveByKey.get(c.sourceKey);
  if(!saveGuid||bySaveGuid.has(saveGuid))throw Error('ACH_INDIVIDUAL_ICONS_MAPPING_INVALID');
  const previousHash=seenSprite.get(c.spritePathId);
  if(previousHash!==undefined&&previousHash!==c.sourceSha256)
   throw Error('ACH_INDIVIDUAL_ICONS_SPRITE_CONFLICT');
  seenSource.add(c.sourceGuid);
  seenSprite.set(c.spritePathId,c.sourceSha256);
  bySaveGuid.set(saveGuid,{
   index:i,saveGuid,sourceKey:c.sourceKey,spritePathId:c.spritePathId,
   x:(i%COLS)*100/(COLS-1)+'%',y:Math.floor(i/COLS)*100/(ROWS-1)+'%'
  });
 }
 if(bySaveGuid.size!==COUNT||seenSource.size!==COUNT)
  throw Error('ACH_INDIVIDUAL_ICONS_INCOMPLETE');
 return {url:base+'achievement-individual-atlas.webp',bySaveGuid};
}
/** Identity evidence comes from the verified manifest, not delivery of the
 * image file. Parent fallback can safely use this evidence independently. */
export type IndividualAchievementIdentity=Pick<IndividualAchievementAtlas,'bySaveGuid'>;
export async function loadAchievementIndividualAtlas(
 base:string,index:AchievementIndex,onIdentity?:(identity:IndividualAchievementIdentity)=>void
):Promise<IndividualAchievementAtlas>{
 const manifest=await loadVerifiedAchievementManifest(base,'achievement-individual-atlas.json',MANIFEST_SHA);
 const atlas=decodeAchievementIndividualAtlas(manifest,index,base);
 onIdentity?.({bySaveGuid:atlas.bySaveGuid});
 const image=await loadVerifiedAchievementImage(base,'achievement-individual-atlas.webp',ATLAS_SHA);
 return {...atlas,...image};
}

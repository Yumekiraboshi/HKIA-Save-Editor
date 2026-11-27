import type {AchievementIndex} from './achievement-index';
import {loadVerifiedAchievementImage,loadVerifiedAchievementManifest} from './achievement-atlas-image';
import type {AchievementHierarchy} from './achievement-groups';

export type CategorySprite={
 readonly index:number;
 readonly saveGuid:string;
 readonly sourceKey:string;
 readonly spritePathId:string;
 readonly x:string;
 readonly y:string;
};
export type CategoryIconAtlas={
 readonly url:string;
 readonly bySaveGuid:ReadonlyMap<string,CategorySprite>;
 dispose?():void;
};
const MANIFEST_SHA='b8a264ddde3cdb34b80d3b47816961d9b5534fd8c791f0286881740b1c091415';
const HEX64=/^[0-9a-f]{64}$/;
const SOURCE_GUID=/^[0-9a-f]{32}$/;
const PATH_ID=/^-?\d{1,20}$/;
const EXPECTED_ATLAS_SHA='67f5f277f1b54e2aa85f28f10434befd128ff3cdecfd9ac219758c7d9f38c9fb';
const EXPECTED_IMAGE_MAP_SHA='555c8fa663cb1462fa455f804d98580aaac0ff58628cc601fa6c25532632771b';

export function decodeAchievementCategoryAtlas(
 input:unknown,index:AchievementIndex,hierarchy:AchievementHierarchy,base:string
):CategoryIconAtlas{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('ACH_CATEGORY_ICONS_INVALID');
 const meta=input as Record<string,unknown>,layout=meta.layout as Record<string,unknown>|null;
 if(meta.schema!=='HKIA.AchievementCategoryAtlas.1'||meta.gameVersion!=='3.0.1'||
  meta.atlasSha256!==EXPECTED_ATLAS_SHA||meta.sourceImageMapSha256!==EXPECTED_IMAGE_MAP_SHA||
  !layout||layout.columns!==8||layout.rows!==8||layout.cellPx!==112||
  !Array.isArray(meta.categories)||meta.categories.length!==63||hierarchy.groups.length!==63)
  throw Error('ACH_CATEGORY_ICONS_INVALID');
 const bySaveGuid=new Map<string,CategorySprite>(),seenSource=new Set<string>(),seenSprite=new Set<string>();
 for(let i=0;i<63;i++){
  const c=meta.categories[i] as Record<string,unknown>|null;
  const saveGuid=hierarchy.groups[i]!.guid,sourceKey=index.get(saveGuid)?.key;
  if(!c||typeof c!=='object'||Array.isArray(c)||c.index!==i||c.sourceKey!==sourceKey||
   typeof c.sourceGuid!=='string'||!SOURCE_GUID.test(c.sourceGuid)||seenSource.has(c.sourceGuid)||
   typeof c.spritePathId!=='string'||!PATH_ID.test(c.spritePathId)||seenSprite.has(c.spritePathId)||
   typeof c.sourceSha256!=='string'||!HEX64.test(c.sourceSha256)||
   !Array.isArray(c.originalSize)||c.originalSize.length!==2||
   c.originalSize.some(x=>!Number.isInteger(x)||x<1||x>8192))
   throw Error('ACH_CATEGORY_ICONS_MAPPING_INVALID');
  seenSource.add(c.sourceGuid);seenSprite.add(c.spritePathId);
  bySaveGuid.set(saveGuid,{index:i,saveGuid,sourceKey:sourceKey!,spritePathId:c.spritePathId,
   x:(i%8)*100/7+'%',y:Math.floor(i/8)*100/7+'%'});
 }
 if(bySaveGuid.size!==63||seenSource.size!==63||seenSprite.size!==63)throw Error('ACH_CATEGORY_ICONS_INCOMPLETE');
 return {url:base+'achievement-category-atlas.webp',bySaveGuid};
}
export async function loadAchievementCategoryAtlas(
 base:string,index:AchievementIndex,hierarchy:AchievementHierarchy
):Promise<CategoryIconAtlas>{
 const manifest=await loadVerifiedAchievementManifest(base,'achievement-category-atlas.json',MANIFEST_SHA);
 const atlas=decodeAchievementCategoryAtlas(manifest,index,hierarchy,base);
 const image=await loadVerifiedAchievementImage(base,'achievement-category-atlas.webp',EXPECTED_ATLAS_SHA);
 return {...atlas,...image};
}

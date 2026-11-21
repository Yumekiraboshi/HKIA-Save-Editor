/**
 * The metadata manifest pins identities, but cannot prove a WebP was served
 * correctly by the Pages/CDN cache. Verify the *actual image bytes* before
 * allowing an original game Sprite to be displayed.
 *
 * Fail closed: a missing, stale or altered atlas never displays an unrelated
 * sprite. The returned object URL is owned by the caller and must be revoked.
 */
const SHA256=/^[0-9a-f]{64}$/;
export type VerifiedAchievementImage={readonly url:string;dispose():void};

export async function loadVerifiedAchievementImage(
 base:string,
 filename:'achievement-category-atlas.webp'|'achievement-individual-atlas.webp',
 expectedSha256:string
):Promise<VerifiedAchievementImage>{
 if(!SHA256.test(expectedSha256))throw Error('ACH_ATLAS_SHA_INVALID');
 const response=await fetch(base+filename,{cache:'no-cache'});
 if(!response.ok)throw Error('ACH_ATLAS_FETCH_FAILED');
 const data=await response.arrayBuffer();
 if(data.byteLength<16||data.byteLength>4*1024*1024)
  throw Error('ACH_ATLAS_SIZE_INVALID');
 const magic=new Uint8Array(data,0,12);
 if(String.fromCharCode(...magic.subarray(0,4))!=='RIFF'||
  String.fromCharCode(...magic.subarray(8,12))!=='WEBP')
  throw Error('ACH_ATLAS_FORMAT_INVALID');
 const subtle=globalThis.crypto?.subtle;
 if(!subtle)throw Error('ACH_ATLAS_CRYPTO_UNAVAILABLE');
 const digest=new Uint8Array(await subtle.digest('SHA-256',data));
 const actual=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
 if(actual!==expectedSha256)throw Error('ACH_ATLAS_HASH_MISMATCH');
 const url=URL.createObjectURL(new Blob([data],{type:'image/webp'}));
 let disposed=false;
 return {url,dispose(){if(!disposed){disposed=true;URL.revokeObjectURL(url)}}};
}

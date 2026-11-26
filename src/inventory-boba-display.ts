/** Presentation of Rust-owned Boba tuples. No save eligibility or recipe planning. */
export type BobaVariant=[number,number,number,number,number];
export type InventoryBoba={variant:BobaVariant;editable:boolean};
export function isBobaVariantWire(v:unknown):v is BobaVariant{
 return Array.isArray(v)&&v.length===5&&v.every(n=>Number.isInteger(n)&&n>=-2147483648&&n<=2147483647);
}
export function decodeBobaRows(bytes:Uint8Array,docIds:ReadonlySet<number>):Map<number,InventoryBoba>{
 if(bytes.length<4)throw Error('BOBA_SNAPSHOT_INVALID');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=v.getUint32(0,true);
 if(n>docIds.size||bytes.length!==4+n*28)throw Error('BOBA_SNAPSHOT_INVALID');
 const rows=new Map<number,InventoryBoba>();
 for(let i=0;i<n;i++){
  const at=4+i*28,id=v.getUint32(at,true),editable=v.getUint32(at+4,true);
  if(!docIds.has(id)||rows.has(id)||editable>1)throw Error('BOBA_SNAPSHOT_INVALID');
  rows.set(id,{variant:Array.from({length:5},(_,j)=>v.getInt32(at+8+j*4,true)) as BobaVariant,editable:editable===1});
 }
 return rows;
}
export function decodeBobaVariants(bytes:Uint8Array):BobaVariant[]{
 if(bytes.length<4)throw Error('BOBA_OPTIONS_INVALID');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=v.getUint32(0,true);
 if(n>7||bytes.length!==4+n*20)throw Error('BOBA_OPTIONS_INVALID');
 return Array.from({length:n},(_,i)=>Array.from({length:5},(_,j)=>v.getInt32(4+i*20+j*4,true)) as BobaVariant);
}
// Editor copy, not asserted to be original game localization.
// [pearls present, no pearls, unsweetened, semi-sweet, sweet, very sweet]
const en=['With tapioca','Without tapioca','Unsweetened','Semi-sweet','Sweet','Very sweet'];
const copies:Record<string,string[]>={
 en,'en-GB':en,
 ja:['タピオカ入り','タピオカなし','無糖','甘さ控えめ','甘め','とても甘い'],
 ar:['مع التابيوكا','بدون التابيوكا','غير محلى','قليل الحلاوة','حلو','حلو جدًا'],
 de:['Mit Tapioka','Ohne Tapioka','Ungesüßt','Halbsüß','Süß','Sehr süß'],
 es:['Con tapioca','Sin tapioca','Sin azúcar','Poco dulce','Dulce','Muy dulce'],
 fr:['Avec tapioca','Sans tapioca','Non sucré','Peu sucré','Sucré','Très sucré'],
 it:['Con tapioca','Senza tapioca','Non zuccherato','Poco dolce','Dolce','Molto dolce'],
 ko:['타피오카 추가','타피오카 없음','무가당','덜 달게','달게','아주 달게'],
 nl:['Met tapioca','Zonder tapioca','Ongezoet','Halfzoet','Zoet','Zeer zoet'],
 'pt-BR':['Com tapioca','Sem tapioca','Sem açúcar','Pouco doce','Doce','Muito doce'],
 ru:['С тапиокой','Без тапиоки','Без сахара','Слегка сладкий','Сладкий','Очень сладкий'],
 tr:['Tapyokalı','Tapyokasız','Şekersiz','Az tatlı','Tatlı','Çok tatlı'],
 'zh-Hans':['加珍珠','不加珍珠','无糖','半糖','甜','很甜'],
 'zh-Hant':['加珍珠','不加珍珠','無糖','半糖','甜','很甜'],
};
export function bobaVariantLabel(v:BobaVariant,locale:string):string{
 const c=copies[locale]??(locale==='fr-CA'?copies.fr:en);
 const pearl=v[2]===76?c[0]:v[2]===79?c[1]:'';
 const sweet=v[4]>=71&&v[4]<=74?c[v[4]-69]:'';
 return [pearl,sweet].filter(Boolean).join(' · ');
}

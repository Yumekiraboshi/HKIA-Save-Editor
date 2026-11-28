/** Presentation of Rust-owned Boba tuples. No save eligibility or recipe planning. */
export type BobaVariant=[number,number,number,number,number];
export type InventoryBoba={variant:BobaVariant;editable:boolean;creationOnly?:boolean};
export type BobaWitness=[itemId:number,flavor:number,color:number];
export function isBobaVariantWire(v:unknown):v is BobaVariant{
 return Array.isArray(v)&&v.length===5&&v.every(n=>Number.isInteger(n)&&n>=-2147483648&&n<=2147483647);
}
export function decodeBobaRows(bytes:Uint8Array,docIds:ReadonlySet<number>):{rows:Map<number,InventoryBoba>;witnesses:BobaWitness[]}{
 if(bytes.length<8)throw Error('BOBA_SNAPSHOT_INVALID');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=v.getUint32(0,true);
 if(n>docIds.size||bytes.length<8+n*28)throw Error('BOBA_SNAPSHOT_INVALID');
 const rows=new Map<number,InventoryBoba>();
 for(let i=0;i<n;i++){
  const at=4+i*28,id=v.getUint32(at,true),editable=v.getUint32(at+4,true);
  if(!docIds.has(id)||rows.has(id)||editable>1)throw Error('BOBA_SNAPSHOT_INVALID');
  rows.set(id,{variant:Array.from({length:5},(_,j)=>v.getInt32(at+8+j*4,true)) as BobaVariant,editable:editable===1});
 }
 const start=4+n*28,m=v.getUint32(start,true);
 if(m>14||bytes.length!==start+4+m*12)throw Error('BOBA_SNAPSHOT_INVALID');
 const witnesses=Array.from({length:m},(_,i)=>Array.from({length:3},(_,j)=>v.getInt32(start+4+i*12+j*4,true)) as BobaWitness);
 return {rows,witnesses};
}
export function decodeBobaVariants(bytes:Uint8Array):BobaVariant[]{
 if(bytes.length<4)throw Error('BOBA_OPTIONS_INVALID');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=v.getUint32(0,true);
 if(n>152||bytes.length!==4+n*20)throw Error('BOBA_OPTIONS_INVALID');
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

// Localized editor labels for milk presence; source ingredient labels use
// the existing game name map. These labels do not authorize save edits.
const milkLabels:Record<string,[string,string]>={
 en:['With milk','Without milk'],'en-GB':['With milk','Without milk'],
 ja:['ミルク入り','ミルクなし'],ar:['مع الحليب','بدون حليب'],
 de:['Mit Milch','Ohne Milch'],es:['Con leche','Sin leche'],
 fr:['Avec lait','Sans lait'],'fr-CA':['Avec lait','Sans lait'],
 it:['Con latte','Senza latte'],ko:['우유 추가','우유 없음'],
 nl:['Met melk','Zonder melk'],'pt-BR':['Com leite','Sem leite'],
 ru:['С молоком','Без молока'],tr:['Sütlü','Sütsüz'],
 'zh-Hans':['加奶','不加奶'],'zh-Hant':['加奶','不加奶'],
};
export function bobaBaseKey(v:BobaVariant):string{return [v[0],v[1],v[3]].join(':')}
export function bobaBaseChoices(before:BobaVariant,options:readonly BobaVariant[]):BobaVariant[]{
 const rows=new Map<string,BobaVariant>();
 for(const v of [before,...options])if(!rows.has(bobaBaseKey(v)))rows.set(bobaBaseKey(v),v);
 return [...rows.values()];
}
export function bobaBaseLabel(v:BobaVariant,locale:string,witnesses:readonly BobaWitness[],name:(id:number)=>string):string{
 const labels=milkLabels[locale]??milkLabels.en;
 const ingredient=witnesses.find(w=>w[1]===v[1]&&w[2]===v[0]);
 const names=ingredient?name(ingredient[0]):'';
 return [names||'—',v[3]===75?labels[0]:v[3]===78?labels[1]:''].filter(Boolean).join(' · ');
}
export function fullBobaLabel(v:BobaVariant,locale:string,witnesses:readonly BobaWitness[],name:(id:number)=>string):string{
 return [bobaBaseLabel(v,locale,witnesses,name),bobaVariantLabel(v,locale)].filter(Boolean).join(' · ');
}

/** Preserve the selected pearls/sweetness only when the exact tuple was offered by Rust. */
export function bobaSelectionForBase(before:BobaVariant,options:readonly BobaVariant[],selection:number,base:string):number{
 const current=options[selection]??before;
 if(bobaBaseKey(before)===base&&before[2]===current[2]&&before[4]===current[4])return -1;
 return options.findIndex(v=>bobaBaseKey(v)===base&&v[2]===current[2]&&v[4]===current[4]);
}

/** Project the exact tuples offered by Rust onto a single UI field.
 * Flavor/color is an authored pair; a required milk change is shown explicitly. */
export type BobaField=1|2|3|4;
export function bobaFieldOptions(before:BobaVariant,options:readonly BobaVariant[],selection:number,field:BobaField,absent=false):{index:number;variant:BobaVariant}[]{
 const current=options[selection]??before;
 const rows=options.map((variant,index)=>({variant,index}));
 if(!absent)rows.unshift({variant:before,index:-1});
 const projected=new Map<number,{index:number;variant:BobaVariant}>();
 for(const row of rows){
  const v=row.variant;
  if(field===1? v[2]!==current[2]||v[4]!==current[4]:
   v.some((n,i)=>i!==field&&n!==current[i]))continue;
  const prior=projected.get(v[field]);
  if(!prior||row.index===selection||(field===1&&prior.index!==selection&&v[3]===current[3]&&prior.variant[3]!==current[3]))projected.set(v[field],row);
 }
 return [...projected.values()];
}
const fieldLabels:Record<string,[string,string,string,string]>={
 en:['Flavor','Tapioca','Milk','Sweetness'],ja:['フレーバー','タピオカ','ミルク','甘さ'],
 ar:['النكهة','التابيوكا','الحليب','الحلاوة'],de:['Geschmack','Tapioka','Milch','Süße'],
 es:['Sabor','Tapioca','Leche','Dulzor'],fr:['Saveur','Tapioca','Lait','Sucre'],
 it:['Gusto','Tapioca','Latte','Dolcezza'],ko:['맛','타피오카','우유','당도'],
 nl:['Smaak','Tapioca','Melk','Zoetheid'],'pt-BR':['Sabor','Tapioca','Leite','Doçura'],
 ru:['Вкус','Тапиока','Молоко','Сладость'],tr:['Aroma','Tapyoka','Süt','Tatlılık'],
 'zh-Hans':['口味','珍珠','牛奶','甜度'],'zh-Hant':['口味','珍珠','牛奶','甜度']
};
export function bobaFieldLabel(locale:string,field:BobaField):string{
 return (fieldLabels[locale]??(locale==='fr-CA'?fieldLabels.fr:fieldLabels.en))[field-1];
}
export function bobaFieldValue(v:BobaVariant,current:BobaVariant,field:BobaField,locale:string,witnesses:readonly BobaWitness[],name:(id:number)=>string):string{
 const c=copies[locale]??(locale==='fr-CA'?copies.fr:en),milk=milkLabels[locale]??milkLabels.en;
 if(field===2)return v[2]===76?c[0]:v[2]===79?c[1]:'—';
 if(field===3)return v[3]===75?milk[0]:v[3]===78?milk[1]:'—';
 if(field===4)return v[4]>=71&&v[4]<=74?c[v[4]-69]:'—';
 const ingredient=witnesses.find(w=>w[1]===v[1]&&w[2]===v[0]);
 const label=ingredient?name(ingredient[0])||'—':'—';
 return v[3]!==current[3]?label+' · '+bobaFieldValue(v,current,3,locale,witnesses,name):label;
}

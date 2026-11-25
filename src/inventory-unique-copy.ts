import type {Locale} from './locales';
type FlowerEditorCopy={title:string;color:string;pattern:string;accent:string};
const en:FlowerEditorCopy={title:'Edit color and pattern',color:'Color',pattern:'Pattern',accent:'Pattern color'};
const copies:Partial<Record<Locale,FlowerEditorCopy>>={
 ja:{title:'色・柄の編集',color:'色',pattern:'模様・特殊効果',accent:'模様の色'},
 ar:{title:'تعديل اللون والنمط',color:'اللون',pattern:'النمط',accent:'لون النمط'},
 de:{title:'Farbe und Muster bearbeiten',color:'Farbe',pattern:'Muster',accent:'Musterfarbe'},
 es:{title:'Editar color y patrón',color:'Color',pattern:'Patrón',accent:'Color del patrón'},
 fr:{title:'Modifier la couleur et le motif',color:'Couleur',pattern:'Motif',accent:'Couleur du motif'},
 it:{title:'Modifica colore e motivo',color:'Colore',pattern:'Motivo',accent:'Colore del motivo'},
 ko:{title:'색상 및 무늬 편집',color:'색상',pattern:'무늬',accent:'무늬 색상'},
 nl:{title:'Kleur en patroon bewerken',color:'Kleur',pattern:'Patroon',accent:'Patroonkleur'},
 'pt-BR':{title:'Editar cor e padrão',color:'Cor',pattern:'Padrão',accent:'Cor do padrão'},
 ru:{title:'Изменить цвет и узор',color:'Цвет',pattern:'Узор',accent:'Цвет узора'},
 tr:{title:'Rengi ve deseni düzenle',color:'Renk',pattern:'Desen',accent:'Desen rengi'},
 'zh-Hans':{title:'编辑颜色和图案',color:'颜色',pattern:'图案',accent:'图案颜色'},
 'zh-Hant':{title:'編輯顏色和圖案',color:'顏色',pattern:'圖案',accent:'圖案顏色'}
};
export function flowerEditorCopy(locale:Locale):FlowerEditorCopy{return copies[locale]??(locale==='fr-CA'?copies.fr!:en);}

type FurnitureEditorCopy={title:string;part:string;material:string;defaultMaterial:string};
const furnitureCopies:Partial<Record<Locale,FurnitureEditorCopy>>={
 ja:{title:'もようがえの編集',part:'部分',material:'素材',defaultMaterial:'標準'},
 ar:{title:'تعديل الأثاث',part:'الجزء',material:'الخامة',defaultMaterial:'افتراضي'},
 de:{title:'Möbel bearbeiten',part:'Teil',material:'Material',defaultMaterial:'Standard'},
 es:{title:'Editar mueble',part:'Parte',material:'Material',defaultMaterial:'Predeterminado'},
 fr:{title:'Modifier le meuble',part:'Partie',material:'Matériau',defaultMaterial:'Par défaut'},
 it:{title:'Modifica mobile',part:'Parte',material:'Materiale',defaultMaterial:'Predefinito'},
 ko:{title:'가구 편집',part:'부분',material:'재질',defaultMaterial:'기본'},
 nl:{title:'Meubel bewerken',part:'Onderdeel',material:'Materiaal',defaultMaterial:'Standaard'},
 'pt-BR':{title:'Editar móvel',part:'Parte',material:'Material',defaultMaterial:'Padrão'},
 ru:{title:'Изменить мебель',part:'Часть',material:'Материал',defaultMaterial:'По умолчанию'},
 tr:{title:'Mobilyayı düzenle',part:'Bölüm',material:'Malzeme',defaultMaterial:'Varsayılan'},
 'zh-Hans':{title:'编辑家具',part:'部位',material:'材质',defaultMaterial:'默认'},
 'zh-Hant':{title:'編輯家具',part:'部位',material:'材質',defaultMaterial:'預設'}
};
export function furnitureEditorCopy(locale:Locale):FurnitureEditorCopy{
 return furnitureCopies[locale]??(locale==='fr-CA'?furnitureCopies.fr!:{title:'Edit furniture',part:'Part',material:'Material',defaultMaterial:'Default'});
}

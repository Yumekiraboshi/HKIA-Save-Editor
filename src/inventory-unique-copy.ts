import type {Locale} from './locales';
type FlowerEditorCopy={title:string;color:string;pattern:string;accent:string};
const en:FlowerEditorCopy={title:'Edit flower',color:'Color',pattern:'Pattern',accent:'Pattern color'};
const copies:Partial<Record<Locale,FlowerEditorCopy>>={
 ja:{title:'花の編集',color:'色',pattern:'模様・特殊効果',accent:'模様の色'},
 ar:{title:'تعديل الزهرة',color:'اللون',pattern:'النمط',accent:'لون النمط'},
 de:{title:'Blume bearbeiten',color:'Farbe',pattern:'Muster',accent:'Musterfarbe'},
 es:{title:'Editar flor',color:'Color',pattern:'Patrón',accent:'Color del patrón'},
 fr:{title:'Modifier la fleur',color:'Couleur',pattern:'Motif',accent:'Couleur du motif'},
 it:{title:'Modifica fiore',color:'Colore',pattern:'Motivo',accent:'Colore del motivo'},
 ko:{title:'꽃 편집',color:'색상',pattern:'무늬',accent:'무늬 색상'},
 nl:{title:'Bloem bewerken',color:'Kleur',pattern:'Patroon',accent:'Patroonkleur'},
 'pt-BR':{title:'Editar flor',color:'Cor',pattern:'Padrão',accent:'Cor do padrão'},
 ru:{title:'Изменить цветок',color:'Цвет',pattern:'Узор',accent:'Цвет узора'},
 tr:{title:'Çiçeği düzenle',color:'Renk',pattern:'Desen',accent:'Desen rengi'},
 'zh-Hans':{title:'编辑花朵',color:'颜色',pattern:'图案',accent:'图案颜色'},
 'zh-Hant':{title:'編輯花朵',color:'顏色',pattern:'圖案',accent:'圖案顏色'}
};
export function flowerEditorCopy(locale:Locale):FlowerEditorCopy{return copies[locale]??(locale==='fr-CA'?copies.fr!:en);}

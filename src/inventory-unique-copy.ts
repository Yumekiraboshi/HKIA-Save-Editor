import type {Locale} from './locales';
import type {FlowerGrowthKind} from './inventory-flower-display';
type FlowerGrowthCopy=Record<FlowerGrowthKind,string>;
// Editor descriptions of native state, not claimed original game strings.
const growthEn:FlowerGrowthCopy={planted:"Planted",seedling:"Seedling",grown:"Grown",bud:"Bud",bloom:"Bloom",seed:'Seed',plucked:'Flower',uprooted:'Uprooted plant',unknown:'Unknown state'};
const growth:Partial<Record<Locale,FlowerGrowthCopy>>={
 ja:{planted:"植え付け済み",seedling:"苗",grown:"成長済み",bud:"つぼみ",bloom:"開花",seed:'種',plucked:'花',uprooted:'掘り起こした株',unknown:'状態未確認'},
 ar:{planted:"مزروعة",seedling:"شتلة",grown:"ناضجة",bud:"برعم",bloom:"متفتحة",seed:'بذرة',plucked:'زهرة',uprooted:'نبتة مقتلعة',unknown:'حالة غير معروفة'},
 de:{planted:"Gepflanzt",seedling:"Setzling",grown:"Ausgewachsen",bud:"Knospe",bloom:"In Blüte",seed:'Samen',plucked:'Blüte',uprooted:'Ausgegrabene Pflanze',unknown:'Unbekannter Zustand'},
 es:{planted:"Plantada",seedling:"Plántula",grown:"Crecida",bud:"Capullo",bloom:"En flor",seed:'Semilla',plucked:'Flor',uprooted:'Planta desenterrada',unknown:'Estado desconocido'},
 fr:{planted:"Plantée",seedling:"Plantule",grown:"Adulte",bud:"Bouton",bloom:"En floraison",seed:'Graine',plucked:'Fleur',uprooted:'Plante déterrée',unknown:'État inconnu'},
 it:{planted:"Piantata",seedling:"Germoglio",grown:"Cresciuta",bud:"Bocciolo",bloom:"In fiore",seed:'Seme',plucked:'Fiore',uprooted:'Pianta dissotterrata',unknown:'Stato sconosciuto'},
 ko:{planted:"심은 상태",seedling:"새싹",grown:"성장 완료",bud:"꽃봉오리",bloom:"개화",seed:'씨앗',plucked:'꽃',uprooted:'캐낸 식물',unknown:'알 수 없는 상태'},
 nl:{planted:"Geplant",seedling:"Zaailing",grown:"Volgroeid",bud:"Knop",bloom:"In bloei",seed:'Zaad',plucked:'Bloem',uprooted:'Uitgegraven plant',unknown:'Onbekende staat'},
 'pt-BR':{planted:"Plantada",seedling:"Muda",grown:"Crescida",bud:"Botão",bloom:"Florescida",seed:'Semente',plucked:'Flor',uprooted:'Planta desenterrada',unknown:'Estado desconhecido'},
 ru:{planted:"Посажено",seedling:"Сеянец",grown:"Выросшее растение",bud:"Бутон",bloom:"Цветение",seed:'Семя',plucked:'Цветок',uprooted:'Выкопанное растение',unknown:'Неизвестное состояние'},
 tr:{planted:"Dikilmiş",seedling:"Fide",grown:"Büyümüş",bud:"Tomurcuk",bloom:"Çiçek açmış",seed:'Tohum',plucked:'Çiçek',uprooted:'Sökülmüş bitki',unknown:'Bilinmeyen durum'},
 'zh-Hans':{planted:"已种植",seedling:"幼苗",grown:"已长成",bud:"花苞",bloom:"开花",seed:'种子',plucked:'花朵',uprooted:'挖出的植株',unknown:'未知状态'},
 'zh-Hant':{planted:"已種植",seedling:"幼苗",grown:"已長成",bud:"花苞",bloom:"開花",seed:'種子',plucked:'花朵',uprooted:'挖出的植株',unknown:'未知狀態'}
};
export function flowerGrowthLabel(locale:Locale,kind:FlowerGrowthKind|null):string{
 return kind?(growth[locale]??(locale==='fr-CA'?growth.fr!:growthEn))[kind]:'';
}
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

import type {Locale} from './locales';
type Copy={tab:string;search:string;quantity:string;apply:string;empty:string;readonly:string;count:string};
const en:Copy={
 tab:'Inventory',search:'Search inventory items',quantity:'Quantity',apply:'Apply',
 empty:'No matching inventory items',readonly:'This item contains unique data or cannot be safely edited',
 count:'Existing stacks'
};
const messages:Partial<Record<Locale,Copy>>={
 ja:{tab:'インベントリー',search:'持ち物を検索',quantity:'数量',apply:'変更',empty:'該当するアイテムはありません',readonly:'特殊データ付き、または編集条件を確認できないアイテムです',count:'記録済みアイテム'},
 ar:{tab:'المخزون',search:'بحث في المخزون',quantity:'الكمية',apply:'تطبيق',empty:'لا توجد عناصر مطابقة',readonly:'لا يمكن تعديل بيانات هذا العنصر بأمان',count:'العناصر المحفوظة'},
 de:{tab:'Inventar',search:'Inventar durchsuchen',quantity:'Anzahl',apply:'Ändern',empty:'Keine passenden Gegenstände',readonly:'Dieser Gegenstand kann nicht sicher bearbeitet werden',count:'Vorhandene Stapel'},
 es:{tab:'Inventario',search:'Buscar en inventario',quantity:'Cantidad',apply:'Aplicar',empty:'Sin objetos coincidentes',readonly:'Este objeto no se puede editar de forma segura',count:'Objetos existentes'},
 fr:{tab:'Inventaire',search:'Rechercher dans l’inventaire',quantity:'Quantité',apply:'Modifier',empty:'Aucun objet correspondant',readonly:'Cet objet ne peut pas être modifié en toute sécurité',count:'Objets existants'},
 it:{tab:'Inventario',search:'Cerca nell’inventario',quantity:'Quantità',apply:'Applica',empty:'Nessun oggetto corrispondente',readonly:'Questo oggetto non può essere modificato in sicurezza',count:'Oggetti presenti'},
 ko:{tab:'인벤토리',search:'보유 아이템 검색',quantity:'수량',apply:'적용',empty:'해당 아이템이 없습니다',readonly:'이 아이템은 안전하게 수정할 수 없습니다',count:'기록된 아이템'},
 nl:{tab:'Inventaris',search:'Inventaris doorzoeken',quantity:'Aantal',apply:'Toepassen',empty:'Geen overeenkomende items',readonly:'Dit item kan niet veilig worden bewerkt',count:'Bestaande stapels'},
 'pt-BR':{tab:'Inventário',search:'Buscar no inventário',quantity:'Quantidade',apply:'Alterar',empty:'Nenhum item encontrado',readonly:'Este item não pode ser editado com segurança',count:'Itens existentes'},
 ru:{tab:'Инвентарь',search:'Поиск в инвентаре',quantity:'Количество',apply:'Изменить',empty:'Подходящие предметы не найдены',readonly:'Этот предмет нельзя безопасно изменить',count:'Существующие предметы'},
 tr:{tab:'Envanter',search:'Envanterde ara',quantity:'Miktar',apply:'Uygula',empty:'Eşleşen eşya yok',readonly:'Bu eşya güvenle düzenlenemez',count:'Mevcut eşyalar'},
 'zh-Hans':{tab:'物品栏',search:'搜索物品',quantity:'数量',apply:'应用',empty:'没有匹配的物品',readonly:'此物品暂不支持安全编辑',count:'已有物品'},
 'zh-Hant':{tab:'物品欄',search:'搜尋物品',quantity:'數量',apply:'套用',empty:'沒有相符的物品',readonly:'此物品暫不支援安全編輯',count:'已有物品'}
};
type BrowseCopy={collectionGroups:string;all:string;other:string;editableOnly:string};
/** Collection GUID grouping is native-source evidence, not an assertion
 * about the game's own Inventory screen layout.
 */
const browsing:Partial<Record<Locale,BrowseCopy>>={
 en:{collectionGroups:'Collection categories',all:'All',other:'Other items',editableOnly:'Editable only'},
 ja:{collectionGroups:'コレクションの分類',all:'すべて',other:'その他のアイテム',editableOnly:'編集可能のみ'},
 ar:{collectionGroups:'فئات المجموعات',all:'الكل',other:'عناصر أخرى',editableOnly:'القابل للتعديل فقط'},
 de:{collectionGroups:'Sammlungskategorien',all:'Alle',other:'Andere Gegenstände',editableOnly:'Nur bearbeitbare'},
 es:{collectionGroups:'Categorías de colección',all:'Todo',other:'Otros objetos',editableOnly:'Solo editables'},
 fr:{collectionGroups:'Catégories de collection',all:'Tout',other:'Autres objets',editableOnly:'Modifiables uniquement'},
 it:{collectionGroups:'Categorie delle collezioni',all:'Tutti',other:'Altri oggetti',editableOnly:'Solo modificabili'},
 ko:{collectionGroups:'컬렉션 분류',all:'전체',other:'기타 아이템',editableOnly:'편집 가능만'},
 nl:{collectionGroups:'Verzamelcategorieën',all:'Alles',other:'Andere items',editableOnly:'Alleen bewerkbaar'},
 'pt-BR':{collectionGroups:'Categorias de coleção',all:'Todos',other:'Outros itens',editableOnly:'Somente editáveis'},
 ru:{collectionGroups:'Категории коллекции',all:'Все',other:'Другие предметы',editableOnly:'Только редактируемые'},
 tr:{collectionGroups:'Koleksiyon kategorileri',all:'Tümü',other:'Diğer eşyalar',editableOnly:'Yalnızca düzenlenebilir'},
 'zh-Hans':{collectionGroups:'收藏分类',all:'全部',other:'其他物品',editableOnly:'仅可编辑'},
 'zh-Hant':{collectionGroups:'收藏分類',all:'全部',other:'其他物品',editableOnly:'僅可編輯'}
};
export function inventoryCopy(locale:Locale):Copy & BrowseCopy{
 return {...(messages[locale]??(locale==='fr-CA'?messages.fr!:en)),
  ...(browsing[locale]??(locale==='fr-CA'?browsing.fr!:browsing.en!))};
}

/** The operation changes quantities of selected existing stacks only. */
const batchLabels:Record<Locale,string>={
 ar:'تعديل الكميات دفعة واحدة',de:'Mengen gemeinsam ändern',en:'Batch quantity', 'en-GB':'Batch quantity',
 es:'Cambiar cantidades en lote',fr:'Modifier les quantités en lot','fr-CA':'Modifier les quantités en lot',
 it:'Modifica quantità in blocco',ja:'数量一括変更',ko:'수량 일괄 변경',nl:'Aantallen tegelijk wijzigen',
 'pt-BR':'Alterar quantidades em lote',ru:'Изменить количество группой',tr:'Toplu miktar değiştirme',
 'zh-Hans':'批量修改数量','zh-Hant':'批次修改數量'
};
export function inventoryBatchCopy(locale:Locale):string{return batchLabels[locale]}

/** Quantity zero retains the native stack record; no placement or unlock changes. */
const emptyLabels:Record<Locale,string>={
 ar:'هل تريد إزالة كل الكمية المحددة من المخزون؟',de:'Den gesamten ausgewählten Bestand entfernen?',en:'Remove all of the selected quantity from inventory?', 'en-GB':'Remove all of the selected quantity from inventory?',
 es:'¿Quitar toda la cantidad seleccionada del inventario?',fr:'Retirer toute la quantité sélectionnée de l’inventaire ?', 'fr-CA':'Retirer toute la quantité sélectionnée de l’inventaire ?',
 it:'Rimuovere tutta la quantità selezionata dall’inventario?',ja:'選択したアイテムの所持数量を0にしますか？',ko:'선택한 아이템의 보유 수량을 모두 제거할까요?',nl:'De volledige geselecteerde hoeveelheid uit de inventaris verwijderen?',
 'pt-BR':'Remover toda a quantidade selecionada do inventário?',ru:'Удалить всё выбранное количество из инвентаря?',tr:'Seçili miktarın tamamı envanterden kaldırılsın mı?',
 'zh-Hans':'要将所选物品的持有数量清零吗？','zh-Hant':'要將所選物品的持有數量清零嗎？'
};
export function inventoryEmptyCopy(locale:Locale):string{return emptyLabels[locale]}

const addLabels:Record<Locale,string>={
 ar:'إضافة عناصر',de:'Gegenstände hinzufügen',en:'Add items','en-GB':'Add items',es:'Añadir objetos',fr:'Ajouter des objets','fr-CA':'Ajouter des objets',it:'Aggiungi oggetti',ja:'アイテム追加',ko:'아이템 추가',nl:'Items toevoegen','pt-BR':'Adicionar itens',ru:'Добавить предметы',tr:'Eşya ekle','zh-Hans':'添加物品','zh-Hant':'新增物品'
};
export function inventoryAddCopy(locale:Locale):string{return addLabels[locale]}

/** Select displayed quantity-editable rows within the current native batch limit. */
const selectVisibleLabels:Record<Locale,string>={
 ar:'تحديد العناصر الظاهرة حتى الحد الأقصى',de:'Sichtbare Gegenstände bis zum Limit auswählen',en:'Select visible items up to the limit','en-GB':'Select visible items up to the limit',
 es:'Seleccionar objetos visibles hasta el límite',fr:'Sélectionner les objets visibles dans la limite autorisée','fr-CA':'Sélectionner les objets visibles dans la limite autorisée',
 it:'Seleziona gli oggetti visibili fino al limite',ja:'表示中のアイテムを上限まで選択',ko:'표시된 아이템을 한도까지 선택',nl:'Zichtbare items tot de limiet selecteren',
 'pt-BR':'Selecionar itens visíveis até o limite',ru:'Выбрать видимые предметы до лимита',tr:'Görünen eşyaları sınıra kadar seç','zh-Hans':'选择当前显示的物品（不超过上限）','zh-Hant':'選取目前顯示的物品（不超過上限）'
};
export function inventorySelectVisibleCopy(locale:Locale):string{return selectVisibleLabels[locale]}

/** Explicit removal of all units in the selected stack(s). */
const deleteLabels:Record<Locale,string>={
 ar:'حذف',de:'Löschen',en:'Delete','en-GB':'Delete',es:'Eliminar',fr:'Supprimer','fr-CA':'Supprimer',it:'Elimina',ja:'削除',ko:'삭제',nl:'Verwijderen','pt-BR':'Excluir',ru:'Удалить',tr:'Sil','zh-Hans':'删除','zh-Hant':'刪除'
};
export function inventoryDeleteCopy(locale:Locale):string{return deleteLabels[locale]}

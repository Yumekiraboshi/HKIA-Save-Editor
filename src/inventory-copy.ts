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
export function inventoryCopy(locale:Locale):Copy{
 return messages[locale]??(locale==='fr-CA'?messages.fr!:en);
}

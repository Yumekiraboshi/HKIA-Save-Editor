/** Localized editor protection controls (not game data). */
const en=['Empty category (0)','Delete category entries','Locked only','Unlock category','Locked','Lock','Unlock','Excluded','Batch limit'];
const strings:Record<string,string[]>={
 ja:['カテゴリーを数量0に','カテゴリーのエントリー削除','ロック済みのみ','カテゴリーのロック解除','ロック済み','ロック','解除','除外件数','一括上限'],
 ar:['تصفير الفئة','حذف عناصر الفئة','المقفلة فقط','فتح الفئة','مقفل','قفل','فتح','مستبعد','حد الدفعة'],
 de:['Kategorie auf 0','Kategorieeinträge löschen','Nur gesperrte','Kategorie entsperren','Gesperrt','Sperren','Entsperren','Ausgeschlossen','Stapelgrenze'],
 es:['Vaciar categoría (0)','Eliminar entradas','Solo bloqueados','Desbloquear categoría','Bloqueados','Bloquear','Desbloquear','Excluidos','Límite'],
 fr:['Vider la catégorie (0)','Supprimer les entrées','Verrouillés uniquement','Déverrouiller la catégorie','Verrouillés','Verrouiller','Déverrouiller','Exclus','Limite'],
 it:['Svuota categoria (0)','Elimina voci categoria','Solo bloccati','Sblocca categoria','Bloccati','Blocca','Sblocca','Esclusi','Limite'],
 ko:['카테고리 수량 0','카테고리 항목 삭제','잠긴 항목만','카테고리 잠금 해제','잠김','잠금','해제','제외','일괄 한도'],
 nl:['Categorie leegmaken (0)','Categorie-items verwijderen','Alleen vergrendelde','Categorie ontgrendelen','Vergrendeld','Vergrendelen','Ontgrendelen','Uitgesloten','Limiet'],
 'pt-BR':['Zerar categoria','Excluir entradas','Só bloqueados','Desbloquear categoria','Bloqueados','Bloquear','Desbloquear','Excluídos','Limite'],
 ru:['Обнулить категорию','Удалить записи','Только заблокированные','Разблокировать категорию','Заблокировано','Блокировать','Разблокировать','Исключено','Лимит'],
 tr:['Kategoriyi sıfırla','Kategori kayıtlarını sil','Yalnızca kilitli','Kategori kilidini aç','Kilitli','Kilitle','Kilidi aç','Hariç','Sınır'],
 'zh-Hans':['分类数量归零','删除分类条目','仅已锁定','解锁分类','已锁定','锁定','解锁','已排除','批量上限'],
 'zh-Hant':['分類數量歸零','刪除分類項目','僅已鎖定','解鎖分類','已鎖定','鎖定','解鎖','已排除','批次上限']
};
export function inventoryProtectionCopy(locale:string){
 const [categoryZero,categoryRemove,lockedOnly,unlockAll,locked,lock,unlock,excluded,limit]=strings[locale]??(locale==='fr-CA'?strings.fr:en);
 return {categoryZero,categoryRemove,lockedOnly,unlockAll,locked,lock,unlock,excluded,limit};
}

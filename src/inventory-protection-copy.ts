/** Localized editor protection controls (not game data). */
const en=['Empty category (0)','Delete category entries','Lock category','Unlock category','Locked','Lock','Unlock','Excluded','Batch limit'];
const strings:Record<string,string[]>={
 ja:['カテゴリーを数量0に','カテゴリーのエントリー削除','一括ロック','一括解除','ロック済み','ロック','解除','除外件数','一括上限'],
 ar:['تصفير الفئة','حذف عناصر الفئة','قفل الفئة','فتح الفئة','مقفل','قفل','فتح','مستبعد','حد الدفعة'],
 de:['Kategorie auf 0','Kategorieeinträge löschen','Kategorie sperren','Kategorie entsperren','Gesperrt','Sperren','Entsperren','Ausgeschlossen','Stapelgrenze'],
 es:['Vaciar categoría (0)','Eliminar entradas','Bloquear categoría','Desbloquear categoría','Bloqueados','Bloquear','Desbloquear','Excluidos','Límite'],
 fr:['Vider la catégorie (0)','Supprimer les entrées','Verrouiller la catégorie','Déverrouiller la catégorie','Verrouillés','Verrouiller','Déverrouiller','Exclus','Limite'],
 it:['Svuota categoria (0)','Elimina voci categoria','Blocca categoria','Sblocca categoria','Bloccati','Blocca','Sblocca','Esclusi','Limite'],
 ko:['카테고리 수량 0','카테고리 항목 삭제','카테고리 잠금','카테고리 잠금 해제','잠김','잠금','해제','제외','일괄 한도'],
 nl:['Categorie leegmaken (0)','Categorie-items verwijderen','Categorie vergrendelen','Categorie ontgrendelen','Vergrendeld','Vergrendelen','Ontgrendelen','Uitgesloten','Limiet'],
 'pt-BR':['Zerar categoria','Excluir entradas','Bloquear categoria','Desbloquear categoria','Bloqueados','Bloquear','Desbloquear','Excluídos','Limite'],
 ru:['Обнулить категорию','Удалить записи','Заблокировать категорию','Разблокировать категорию','Заблокировано','Блокировать','Разблокировать','Исключено','Лимит'],
 tr:['Kategoriyi sıfırla','Kategori kayıtlarını sil','Kategoriyi kilitle','Kategori kilidini aç','Kilitli','Kilitle','Kilidi aç','Hariç','Sınır'],
 'zh-Hans':['分类数量归零','删除分类条目','锁定分类','解锁分类','已锁定','锁定','解锁','已排除','批量上限'],
 'zh-Hant':['分類數量歸零','刪除分類項目','鎖定分類','解鎖分類','已鎖定','鎖定','解鎖','已排除','批次上限']
};
export function inventoryProtectionCopy(locale:string){
 const [categoryZero,categoryRemove,lockAll,unlockAll,locked,lock,unlock,excluded,limit]=strings[locale]??(locale==='fr-CA'?strings.fr:en);
 return {categoryZero,categoryRemove,lockAll,unlockAll,locked,lock,unlock,excluded,limit};
}

// Temporary text controls until the authenticated original pin sprite is available.
export function inventoryPinCopy(locale:string){
 const labels:Record<string,[string,string,string]>={
 ja:['ピン止め','ピン解除','ピン止め済みのみ'],ar:['تثبيت','إلغاء التثبيت','المثبتة فقط'],de:['Anheften','Lösen','Nur angeheftete'],es:['Fijar','Desfijar','Solo fijados'],fr:['Épingler','Désépingler','Épinglés uniquement'],it:['Fissa','Rimuovi fissaggio','Solo fissati'],ko:['고정','고정 해제','고정 항목만'],nl:['Vastzetten','Losmaken','Alleen vastgezet'],'pt-BR':['Fixar','Desafixar','Apenas fixados'],ru:['Закрепить','Открепить','Только закреплённые'],tr:['Sabitle','Sabitlemeyi kaldır','Yalnızca sabitlenenler'],'zh-Hans':['置顶','取消置顶','仅置顶'],'zh-Hant':['置頂','取消置頂','僅置頂']
 };
 const [pin,unpin,only]=labels[locale]??(locale==='fr-CA'?labels.fr:['Pin','Unpin','Pinned only']);
 return {pin,unpin,only};
}

import type {Locale} from './locales';

export type RemovalConfirmationCopy={
 collectionTitle:string;achievementTitle:string;
 collectionWarning:string;achievementWarning:string;
 cancel:string;remove:string;stale:string;
};
const en:RemovalConfirmationCopy={
 collectionTitle:'Remove collection record?',
 achievementTitle:'Mark achievement incomplete?',
 collectionWarning:'Removing this record also deletes its recorded date and time. You can undo the change in Edit history.',
 achievementWarning:'Marking this incomplete deletes its completion date and time. A completed parent category may also become incomplete. You can undo the change in Edit history.',
 cancel:'Cancel',remove:'Remove',stale:'The save changed. Please select the item again.'
};
const translations:Partial<Record<Locale,RemovalConfirmationCopy>>={
 ja:{
  collectionTitle:'登録済みを解除しますか？',
  achievementTitle:'達成済みを解除しますか？',
  collectionWarning:'解除すると、保存されている登録日時も削除されます。操作後は編集履歴から元に戻せます。',
  achievementWarning:'未達成に戻すと、達成日時も削除されます。関連するカテゴリーも未達成になる場合があります。操作後は編集履歴から元に戻せます。',
  cancel:'キャンセル',remove:'解除する',stale:'セーブの状態が変わりました。項目を選び直してください。'
 },
 ar:{
  collectionTitle:'هل تريد إزالة السجل؟',achievementTitle:'هل تريد إلغاء إكمال الإنجاز؟',
  collectionWarning:'ستؤدي الإزالة إلى حذف تاريخ ووقت التسجيل أيضًا. يمكنك التراجع من سجل التعديلات.',
  achievementWarning:'سيؤدي إلغاء الإكمال إلى حذف التاريخ والوقت، وقد يُلغى إكمال الفئة المرتبطة أيضًا. يمكنك التراجع من سجل التعديلات.',
  cancel:'إلغاء',remove:'إزالة',stale:'تغيرت حالة الحفظ. حدد العنصر مرة أخرى.'
 },
 de:{
  collectionTitle:'Sammlungseintrag entfernen?',achievementTitle:'Erfolg als unvollständig markieren?',
  collectionWarning:'Dadurch werden auch Datum und Uhrzeit des Eintrags gelöscht. Die Änderung lässt sich im Bearbeitungsverlauf rückgängig machen.',
  achievementWarning:'Dadurch werden Abschlussdatum und -uhrzeit gelöscht. Auch die übergeordnete Kategorie kann unvollständig werden. Die Änderung lässt sich rückgängig machen.',
  cancel:'Abbrechen',remove:'Entfernen',stale:'Der Spielstand hat sich geändert. Bitte erneut auswählen.'
 },
 es:{
  collectionTitle:'¿Eliminar el registro?',achievementTitle:'¿Marcar el logro como incompleto?',
  collectionWarning:'También se borrarán la fecha y la hora registradas. Puedes deshacerlo en el historial de edición.',
  achievementWarning:'Se borrarán la fecha y la hora de finalización. La categoría principal también podría pasar a incompleta. Puedes deshacerlo en el historial.',
  cancel:'Cancelar',remove:'Eliminar',stale:'El archivo guardado cambió. Vuelve a seleccionar el elemento.'
 },
 fr:{
  collectionTitle:'Supprimer cet enregistrement ?',achievementTitle:'Marquer ce succès comme non terminé ?',
  collectionWarning:'La date et l’heure enregistrées seront également supprimées. Cette modification peut être annulée dans l’historique.',
  achievementWarning:'La date et l’heure d’achèvement seront supprimées. La catégorie parente peut aussi devenir incomplète. Cette modification peut être annulée.',
  cancel:'Annuler',remove:'Supprimer',stale:'La sauvegarde a changé. Sélectionnez de nouveau l’élément.'
 },
 it:{
  collectionTitle:'Rimuovere la registrazione?',achievementTitle:'Contrassegnare l’obiettivo come incompleto?',
  collectionWarning:'Verranno eliminate anche la data e l’ora registrate. Puoi annullare la modifica dalla cronologia.',
  achievementWarning:'Verranno eliminate la data e l’ora di completamento. Anche la categoria principale potrebbe diventare incompleta. Puoi annullare la modifica.',
  cancel:'Annulla',remove:'Rimuovi',stale:'Il salvataggio è cambiato. Seleziona di nuovo l’elemento.'
 },
 ko:{
  collectionTitle:'수집 기록을 삭제할까요?',achievementTitle:'업적을 미완료로 변경할까요?',
  collectionWarning:'기록된 날짜와 시간도 함께 삭제됩니다. 편집 기록에서 실행 취소할 수 있습니다.',
  achievementWarning:'달성 날짜와 시간이 삭제됩니다. 상위 카테고리도 미완료가 될 수 있습니다. 편집 기록에서 실행 취소할 수 있습니다.',
  cancel:'취소',remove:'삭제',stale:'저장 상태가 변경되었습니다. 항목을 다시 선택하세요.'
 },
 nl:{
  collectionTitle:'Registratie verwijderen?',achievementTitle:'Prestatie als onvoltooid markeren?',
  collectionWarning:'De vastgelegde datum en tijd worden ook verwijderd. Je kunt dit ongedaan maken via de bewerkingsgeschiedenis.',
  achievementWarning:'De voltooiingsdatum en -tijd worden verwijderd. De bovenliggende categorie kan ook onvoltooid worden. Je kunt dit ongedaan maken.',
  cancel:'Annuleren',remove:'Verwijderen',stale:'De opslagstatus is gewijzigd. Selecteer het item opnieuw.'
 },
 'pt-BR':{
  collectionTitle:'Remover registro?',achievementTitle:'Marcar conquista como incompleta?',
  collectionWarning:'A data e a hora registradas também serão apagadas. Você pode desfazer a alteração no histórico de edição.',
  achievementWarning:'A data e a hora de conclusão serão apagadas. A categoria principal também pode ficar incompleta. Você pode desfazer a alteração.',
  cancel:'Cancelar',remove:'Remover',stale:'O estado do jogo salvo mudou. Selecione o item novamente.'
 },
 ru:{
  collectionTitle:'Удалить запись о коллекции?',achievementTitle:'Отметить достижение как невыполненное?',
  collectionWarning:'Дата и время записи также будут удалены. Действие можно отменить в истории изменений.',
  achievementWarning:'Дата и время выполнения будут удалены. Родительская категория также может стать невыполненной. Действие можно отменить.',
  cancel:'Отмена',remove:'Удалить',stale:'Сохранение изменилось. Выберите предмет снова.'
 },
 tr:{
  collectionTitle:'Koleksiyon kaydı kaldırılsın mı?',achievementTitle:'Başarım tamamlanmadı olarak işaretlensin mi?',
  collectionWarning:'Kaydedilen tarih ve saat de silinir. Düzenleme geçmişinden geri alabilirsiniz.',
  achievementWarning:'Tamamlanma tarihi ve saati silinir. Üst kategori de tamamlanmamış olabilir. Düzenleme geçmişinden geri alabilirsiniz.',
  cancel:'İptal',remove:'Kaldır',stale:'Kayıt durumu değişti. Öğeyi yeniden seçin.'
 },
 'zh-Hans':{
  collectionTitle:'要取消收藏记录吗？',achievementTitle:'要将成就改为未完成吗？',
  collectionWarning:'记录的日期和时间也会删除。可以在编辑历史中撤销。',
  achievementWarning:'完成日期和时间将被删除，所属分类也可能变为未完成。可以在编辑历史中撤销。',
  cancel:'取消',remove:'确认取消',stale:'存档状态已改变，请重新选择项目。'
 },
 'zh-Hant':{
  collectionTitle:'要取消收藏紀錄嗎？',achievementTitle:'要將成就改為未完成嗎？',
  collectionWarning:'記錄的日期與時間也會刪除。可在編輯歷史中復原。',
  achievementWarning:'完成日期與時間將被刪除，所屬分類也可能變為未完成。可在編輯歷史中復原。',
  cancel:'取消',remove:'確認取消',stale:'存檔狀態已變更，請重新選擇項目。'
 }
};
export function removalConfirmationCopy(locale:Locale):RemovalConfirmationCopy{
 return translations[locale]??(locale==='fr-CA'?translations.fr!:en);
}

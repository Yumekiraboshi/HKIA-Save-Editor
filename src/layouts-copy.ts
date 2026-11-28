import type {Locale} from './locales';
// Generic draft UI copy. The native localized feature and space names must
// be verified before release; ordinal record labels are not in-game names.
type Copy=readonly [all:string,building:string,room:string,name:string,exportSource:string,restore:string,loading:string,unavailable:string,warning:string,failed:string];
const en:Copy=['All linked Cabin records','Building record','Room record','Backup name','Export source backup','Restore','Reading layouts…','No verified linked Cabin records found.','Local file only. Contains private save data. Restoration is not supported yet.','Could not export the source backup.'];
const fr:Copy=['Tous les enregistrements de cabanes liés','Bâtiment','Pièce','Nom de la sauvegarde','Exporter la sauvegarde source','Restaurer','Lecture…','Aucun enregistrement de cabane vérifié.','Fichier local uniquement. Contient des données privées. Restauration non disponible.','Échec de l’exportation.'];
const copy:Record<Locale,Copy>={
 en,'en-GB':en,fr,'fr-CA':fr,
 ja:['関連付け済みCabinレコードすべて','建物レコード','部屋レコード','バックアップ名','元データをバックアップ','復元','レイアウトを読み込み中…','確認済みのCabinレコードが見つかりません。','ローカル保存専用です。個人セーブ情報を含みます。復元はまだできません。','バックアップの書き出しに失敗しました。'],
 de:['Alle verknüpften Hütten','Gebäudedatensatz','Raumdatensatz','Sicherungsname','Quelldaten exportieren','Wiederherstellen','Wird gelesen…','Keine verifizierten Hüttendaten gefunden.','Nur lokale Datei. Enthält private Speicherdaten. Wiederherstellung noch nicht verfügbar.','Export fehlgeschlagen.'],
 es:['Todos los registros de cabañas vinculados','Edificio','Habitación','Nombre de copia','Exportar copia de origen','Restaurar','Leyendo…','No hay registros de cabañas verificados.','Solo archivo local. Contiene datos privados. Restauración aún no disponible.','No se pudo exportar.'],
 it:['Tutte le capanne collegate','Edificio','Stanza','Nome del backup','Esporta backup sorgente','Ripristina','Lettura…','Nessun dato verificato.','Solo file locale. Contiene dati privati. Ripristino non ancora disponibile.','Esportazione non riuscita.'],
 ko:['연결된 모든 오두막 레코드','건물 레코드','방 레코드','백업 이름','원본 백업 내보내기','복원','불러오는 중…','확인된 오두막 레코드가 없습니다.','로컬 파일 전용입니다. 개인 저장 데이터가 포함됩니다. 복원은 아직 지원하지 않습니다.','내보내기에 실패했습니다.'],
 nl:['Alle gekoppelde hutrecords','Gebouwrecord','Kamerrecord','Back-upnaam','Bronback-up exporteren','Herstellen','Lezen…','Geen geverifieerde hutrecords gevonden.','Alleen lokaal bestand. Bevat privégegevens. Herstel is nog niet beschikbaar.','Exporteren mislukt.'],
 'pt-BR':['Todos os registros de cabanas vinculados','Edifício','Cômodo','Nome do backup','Exportar backup de origem','Restaurar','Lendo…','Nenhum registro de cabana verificado.','Apenas arquivo local. Contém dados privados. Restauração ainda indisponível.','Falha na exportação.'],
 ru:['Все связанные записи домиков','Запись здания','Запись комнаты','Имя резервной копии','Экспорт исходной копии','Восстановить','Чтение…','Проверенные записи не найдены.','Только локальный файл. Содержит личные данные. Восстановление пока недоступно.','Не удалось экспортировать.'],
 tr:['Tüm bağlantılı kulübe kayıtları','Bina kaydı','Oda kaydı','Yedek adı','Kaynak yedeğini dışa aktar','Geri yükle','Okunuyor…','Doğrulanmış kulübe kaydı yok.','Yalnızca yerel dosya. Özel kayıt verileri içerir. Geri yükleme henüz desteklenmiyor.','Dışa aktarma başarısız.'],
 ar:['جميع سجلات الأكواخ المرتبطة','سجل المبنى','سجل الغرفة','اسم النسخة الاحتياطية','تصدير نسخة المصدر','استعادة','جارٍ القراءة…','لا توجد سجلات أكواخ مؤكدة.','ملف محلي فقط. يحتوي على بيانات حفظ خاصة. الاستعادة غير مدعومة بعد.','تعذر التصدير.'],
 'zh-Hans':['所有已关联的小屋记录','建筑记录','房间记录','备份名称','导出源数据备份','恢复','正在读取…','未找到已验证的小屋记录。','仅限本地文件。包含私人存档数据。暂不支持恢复。','导出失败。'],
 'zh-Hant':['所有已關聯的小屋記錄','建築記錄','房間記錄','備份名稱','匯出來源資料備份','復原','正在讀取…','未找到已驗證的小屋記錄。','僅限本機檔案。包含私人存檔資料。暫不支援復原。','匯出失敗。']
};
export function layoutsCopy(locale:Locale){const [all,building,room,name,exportSource,restore,loading,unavailable,warning,failed]=copy[locale];return {all,building,room,name,exportSource,restore,loading,unavailable,warning,failed};}

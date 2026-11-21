import type {Locale} from './locales';
export type CompactAchievementCopy={
 unlock:string;relock:string;date:string;details:string;source:string;scope:string;
};
const en:CompactAchievementCopy={
 unlock:'Mark completed',relock:'Mark incomplete',date:'Change completion date',
 details:'View details',source:'Source information',
 scope:"When every saved child achievement is completed, its existing category achievement is completed automatically, using the latest child timestamp when all dates are known. Missing save records are not created. Counters, rewards, and platform unlocks are unchanged."
};
const byLocale:Partial<Record<Locale,CompactAchievementCopy>>={
 ja:{unlock:'達成済みにする',relock:'未達成に戻す',date:'達成日時を変更',details:'詳細を見る',source:'条件・報酬の詳細',scope:"保存済みの子実績をすべて達成すると、存在する親カテゴリー実績も自動達成になります。全員の達成日時が記録されていれば最後の日時をコピーします。記録のない実績は作成せず、カウンター・報酬・プラットフォーム実績は変更しません。"},
 ar:{unlock:'وضع علامة مكتمل',relock:'وضع علامة غير مكتمل',date:'تغيير تاريخ الإكمال',details:'عرض التفاصيل',source:'تفاصيل المصدر',scope:"عند إكمال جميع إنجازات الفئة المحفوظة، يُكمل إنجاز الفئة الموجود تلقائيًا ويستخدم أحدث وقت معروف إذا كانت جميع التواريخ موجودة. لا تُنشأ سجلات ناقصة ولا تُغير العدادات أو المكافآت أو إنجازات المنصة."},
 de:{unlock:'Als abgeschlossen markieren',relock:'Als unvollständig markieren',date:'Abschlussdatum ändern',details:'Details anzeigen',source:'Quelldetails',scope:"Wenn alle gespeicherten Erfolge einer Kategorie abgeschlossen sind, wird der vorhandene Kategorieerfolg automatisch abgeschlossen. Sind alle Zeitpunkte bekannt, wird der späteste übernommen. Fehlende Einträge, Zähler, Belohnungen und Plattform-Erfolge bleiben unverändert."},
 es:{unlock:'Marcar como completado',relock:'Marcar como incompleto',date:'Cambiar fecha de finalización',details:'Ver detalles',source:'Detalles de origen',scope:"Al completar todos los logros guardados de una categoría, se completa automáticamente el logro de categoría existente. Si constan todas las fechas, se copia la última. No se crean registros ausentes ni se alteran contadores, recompensas o logros de plataforma."},
 fr:{unlock:'Marquer comme terminé',relock:'Marquer comme non terminé',date:'Modifier la date de réussite',details:'Voir les détails',source:'Détails des données',scope:"Lorsque tous les succès enregistrés d’une catégorie sont terminés, son succès de catégorie existant est terminé automatiquement. Si toutes les dates sont connues, la dernière est reprise. Les enregistrements absents, compteurs, récompenses et succès de plateforme ne changent pas."},
 it:{unlock:'Segna come completato',relock:'Segna come incompleto',date:'Modifica data di completamento',details:'Visualizza dettagli',source:'Dettagli sorgente',scope:"Quando tutti gli obiettivi salvati di una categoria sono completati, l'obiettivo di categoria esistente si completa automaticamente. Se tutte le date sono note, viene copiata l'ultima. I record assenti, i contatori, i premi e gli obiettivi della piattaforma non cambiano."},
 ko:{unlock:'완료로 표시',relock:'미완료로 표시',date:'완료 날짜 변경',details:'자세히 보기',source:'원본 정보',scope:"저장된 하위 도전 과제가 모두 완료되면 기존 상위 카테고리 도전 과제도 자동 완료됩니다. 모든 완료 시각이 있으면 가장 늦은 시각을 복사합니다. 누락된 기록, 카운터, 보상 및 플랫폼 도전 과제는 변경하지 않습니다."},
 nl:{unlock:'Als voltooid markeren',relock:'Als onvoltooid markeren',date:'Voltooiingsdatum wijzigen',details:'Details bekijken',source:'Brongegevens',scope:"Wanneer alle opgeslagen prestaties in een categorie voltooid zijn, wordt de bestaande categorieprestatie automatisch voltooid. Als alle datums bekend zijn, wordt de laatste overgenomen. Ontbrekende records, tellers, beloningen en platformprestaties veranderen niet."},
 'pt-BR':{unlock:'Marcar como concluída',relock:'Marcar como incompleta',date:'Alterar data de conclusão',details:'Ver detalhes',source:'Detalhes da fonte',scope:"Quando todas as conquistas salvas de uma categoria forem concluídas, a conquista de categoria existente será concluída automaticamente. Se todas as datas forem conhecidas, a última será copiada. Registros ausentes, contadores, recompensas e conquistas de plataforma não mudam."},
 ru:{unlock:'Отметить выполненным',relock:'Отметить невыполненным',date:'Изменить дату выполнения',details:'Подробнее',source:'Данные источника',scope:"Когда все сохранённые достижения категории завершены, существующее достижение категории завершается автоматически. Если известны все даты, используется самая поздняя. Отсутствующие записи, счётчики, награды и достижения платформы не изменяются."},
 tr:{unlock:'Tamamlandı olarak işaretle',relock:'Tamamlanmadı olarak işaretle',date:'Tamamlanma tarihini değiştir',details:'Ayrıntıları göster',source:'Kaynak ayrıntıları',scope:"Bir kategorinin kayıtlı başarımlarının tümü tamamlanınca mevcut kategori başarımı otomatik tamamlanır. Tüm tarihler biliniyorsa en son tarih kopyalanır. Eksik kayıtlar, sayaçlar, ödüller ve platform başarımları değişmez."},
 'zh-Hans':{unlock:'标记为已完成',relock:'标记为未完成',date:'修改完成日期',details:'查看详情',source:'来源详情',scope:"当某分类所有已存档的子成就都完成时，已有的分类成就将自动完成。若所有完成时间均已记录，则复制最晚时间。不会创建缺失记录，也不会修改计数器、奖励或平台成就。"},
 'zh-Hant':{unlock:'標記為已完成',relock:'標記為未完成',date:'修改完成日期',details:'查看詳情',source:'來源詳情',scope:"當某分類所有已存檔的子成就都完成時，已有的分類成就將自動完成。若所有完成時間均已記錄，則複製最晚時間。不會建立缺失記錄，也不會修改計數器、獎勵或平台成就。"}
};
export function compactAchievementCopy(locale:Locale):CompactAchievementCopy{
 return byLocale[locale]??(locale==='fr-CA'?byLocale.fr!:en);
}

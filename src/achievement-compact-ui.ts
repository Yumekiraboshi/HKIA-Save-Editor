import type {Locale} from './locales';
export type CompactAchievementCopy={
 unlock:string;relock:string;date:string;details:string;advanced:string;source:string;scope:string;
};
const en:CompactAchievementCopy={
 unlock:'Mark completed',relock:'Mark incomplete',date:'Change completion date',
 details:'Edit progress and date',advanced:'Adjust saved progress',source:'Source information',
 scope:'Only this saved achievement record changes; linked counters, rewards, and platform achievements are not unlocked.'
};
const byLocale:Partial<Record<Locale,CompactAchievementCopy>>={
 ja:{unlock:'達成済みにする',relock:'未達成に戻す',date:'達成日時を変更',details:'進捗・日時を編集',advanced:'進捗を調整',source:'条件・報酬の詳細',scope:'変更するのはこの保存済み実績の状態のみです。関連カウンター・報酬・プラットフォーム実績は解放しません。'},
 ar:{unlock:'وضع علامة مكتمل',relock:'وضع علامة غير مكتمل',date:'تغيير تاريخ الإكمال',details:'تعديل التقدم والتاريخ',advanced:'تعديل التقدم المحفوظ',source:'تفاصيل المصدر',scope:'تتغير حالة هذا الإنجاز المحفوظ فقط، ولا تُفتح العدادات أو المكافآت المرتبطة أو إنجازات المنصة.'},
 de:{unlock:'Als abgeschlossen markieren',relock:'Als unvollständig markieren',date:'Abschlussdatum ändern',details:'Fortschritt und Datum bearbeiten',advanced:'Gespeicherten Fortschritt anpassen',source:'Quelldetails',scope:'Nur dieser gespeicherte Erfolg wird geändert; verknüpfte Zähler, Belohnungen und Plattform-Erfolge werden nicht freigeschaltet.'},
 es:{unlock:'Marcar como completado',relock:'Marcar como incompleto',date:'Cambiar fecha de finalización',details:'Editar progreso y fecha',advanced:'Ajustar progreso guardado',source:'Detalles de origen',scope:'Solo cambia este logro guardado; no desbloquea contadores, recompensas ni logros de plataforma.'},
 fr:{unlock:'Marquer comme terminé',relock:'Marquer comme non terminé',date:'Modifier la date de réussite',details:'Modifier la progression et la date',advanced:'Ajuster la progression enregistrée',source:'Détails des données',scope:'Seul ce succès enregistré change ; les compteurs, récompenses et succès de plateforme liés ne sont pas débloqués.'},
 it:{unlock:'Segna come completato',relock:'Segna come incompleto',date:'Modifica data di completamento',details:'Modifica avanzamento e data',advanced:'Regola avanzamento salvato',source:'Dettagli sorgente',scope:'Cambia solo questo obiettivo salvato; contatori, ricompense e obiettivi di piattaforma collegati non vengono sbloccati.'},
 ko:{unlock:'완료로 표시',relock:'미완료로 표시',date:'완료 날짜 변경',details:'진행도 및 날짜 편집',advanced:'저장된 진행도 조정',source:'원본 정보',scope:'저장된 해당 도전 과제 상태만 바뀝니다. 연결된 카운터, 보상 및 플랫폼 도전 과제는 해제되지 않습니다.'},
 nl:{unlock:'Als voltooid markeren',relock:'Als onvoltooid markeren',date:'Voltooiingsdatum wijzigen',details:'Voortgang en datum bewerken',advanced:'Opgeslagen voortgang aanpassen',source:'Brongegevens',scope:'Alleen deze opgeslagen prestatie verandert; gekoppelde tellers, beloningen en platformprestaties worden niet ontgrendeld.'},
 'pt-BR':{unlock:'Marcar como concluída',relock:'Marcar como incompleta',date:'Alterar data de conclusão',details:'Editar progresso e data',advanced:'Ajustar progresso salvo',source:'Detalhes da fonte',scope:'Apenas esta conquista salva é alterada; contadores, recompensas e conquistas de plataforma não são desbloqueados.'},
 ru:{unlock:'Отметить выполненным',relock:'Отметить невыполненным',date:'Изменить дату выполнения',details:'Изменить прогресс и дату',advanced:'Изменить сохранённый прогресс',source:'Данные источника',scope:'Меняется только запись достижения; связанные счётчики, награды и достижения платформы не открываются.'},
 tr:{unlock:'Tamamlandı olarak işaretle',relock:'Tamamlanmadı olarak işaretle',date:'Tamamlanma tarihini değiştir',details:'İlerleme ve tarihi düzenle',advanced:'Kayıtlı ilerlemeyi düzenle',source:'Kaynak ayrıntıları',scope:'Yalnızca kayıtlı başarım durumu değişir; ilgili sayaçlar, ödüller ve platform başarımları açılmaz.'},
 'zh-Hans':{unlock:'标记为已完成',relock:'标记为未完成',date:'修改完成日期',details:'编辑进度与日期',advanced:'调整已保存进度',source:'来源详情',scope:'仅修改此存档成就记录，不解锁关联计数器、奖励或平台成就。'},
 'zh-Hant':{unlock:'標記為已完成',relock:'標記為未完成',date:'修改完成日期',details:'編輯進度與日期',advanced:'調整已儲存進度',source:'來源詳情',scope:'僅修改此存檔成就記錄，不解鎖關聯計數器、獎勵或平台成就。'}
};
export function compactAchievementCopy(locale:Locale):CompactAchievementCopy{
 return byLocale[locale]??(locale==='fr-CA'?byLocale.fr!:en);
}

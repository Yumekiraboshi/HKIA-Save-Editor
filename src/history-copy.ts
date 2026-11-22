import type {Locale} from './locales';

export type HistoryCopy={
 title:string;initial:string;empty:string;current:string;paired:string;step:string;
};
const en:HistoryCopy={
 title:'Edit history',initial:'Original state',empty:'No edits in this tab',
 current:'Current position',paired:'Includes category',step:'Go to this step'
};
const translations:Partial<Record<Locale,HistoryCopy>>={
 ja:{title:'編集履歴',initial:'元の状態',empty:'このタブの編集履歴はありません',current:'現在の位置',paired:'カテゴリーを含む',step:'この地点へ移動'},
 ar:{title:'سجل التعديلات',initial:'الحالة الأصلية',empty:'لا تعديلات في هذه الصفحة',current:'الموضع الحالي',paired:'يشمل الفئة',step:'انتقل إلى هذه الخطوة'},
 de:{title:'Bearbeitungsverlauf',initial:'Originalzustand',empty:'Keine Änderungen in diesem Tab',current:'Aktuelle Position',paired:'Mit Kategorie',step:'Zu diesem Schritt'},
 es:{title:'Historial de edición',initial:'Estado original',empty:'Sin cambios en esta pestaña',current:'Posición actual',paired:'Incluye categoría',step:'Ir a este paso'},
 fr:{title:'Historique des modifications',initial:'État initial',empty:'Aucune modification dans cet onglet',current:'Position actuelle',paired:'Inclut la catégorie',step:'Aller à cette étape'},
 it:{title:'Cronologia modifiche',initial:'Stato originale',empty:'Nessuna modifica in questa scheda',current:'Posizione attuale',paired:'Include categoria',step:'Vai a questo passaggio'},
 ko:{title:'편집 기록',initial:'원래 상태',empty:'이 탭에 편집 기록이 없습니다',current:'현재 위치',paired:'카테고리 포함',step:'이 단계로 이동'},
 nl:{title:'Bewerkingsgeschiedenis',initial:'Oorspronkelijke staat',empty:'Geen wijzigingen op dit tabblad',current:'Huidige positie',paired:'Inclusief categorie',step:'Ga naar deze stap'},
 'pt-BR':{title:'Histórico de edição',initial:'Estado original',empty:'Sem edições nesta aba',current:'Posição atual',paired:'Inclui categoria',step:'Ir para esta etapa'},
 ru:{title:'История изменений',initial:'Исходное состояние',empty:'В этой вкладке нет изменений',current:'Текущая позиция',paired:'Включает категорию',step:'Перейти к этому шагу'},
 tr:{title:'Düzenleme geçmişi',initial:'İlk durum',empty:'Bu sekmede düzenleme yok',current:'Geçerli konum',paired:'Kategoriyi içerir',step:'Bu adıma git'},
 'zh-Hans':{title:'编辑历史',initial:'原始状态',empty:'此标签页没有编辑记录',current:'当前位置',paired:'包含分类',step:'跳转到此步骤'},
 'zh-Hant':{title:'編輯歷史',initial:'原始狀態',empty:'此分頁沒有編輯紀錄',current:'目前位置',paired:'包含分類',step:'跳至此步驟'}
};
export function historyCopy(locale:Locale):HistoryCopy{
 return translations[locale]??(locale==='fr-CA'?translations.fr!:en);
}


export type HistoryDetailCopy={
 added:string;removed:string;date:string;complete:string;incomplete:string;
 created:string;progress:string;fromTo:string
};
const detailEn:HistoryDetailCopy={
 added:'Not recorded → Recorded',removed:'Recorded → Not recorded',
 date:'Date',complete:'Completed',incomplete:'Incomplete',
 created:'New record',progress:'Progress',fromTo:'to'
};
const details:Partial<Record<Locale,HistoryDetailCopy>>={
 ja:{added:'未記録 → 記録済み',removed:'記録済み → 未記録',date:'日時',complete:'達成済み',incomplete:'未達成',created:'新規記録',progress:'進捗',fromTo:'→'},
 ar:{added:'غير مسجل ← مسجل',removed:'مسجل ← غير مسجل',date:'التاريخ',complete:'مكتمل',incomplete:'غير مكتمل',created:'سجل جديد',progress:'التقدم',fromTo:'إلى'},
 de:{added:'Nicht erfasst → Erfasst',removed:'Erfasst → Nicht erfasst',date:'Datum',complete:'Abgeschlossen',incomplete:'Unvollständig',created:'Neuer Eintrag',progress:'Fortschritt',fromTo:'zu'},
 es:{added:'Sin registrar → Registrado',removed:'Registrado → Sin registrar',date:'Fecha',complete:'Completado',incomplete:'Incompleto',created:'Registro nuevo',progress:'Progreso',fromTo:'a'},
 fr:{added:'Non enregistré → Enregistré',removed:'Enregistré → Non enregistré',date:'Date',complete:'Terminé',incomplete:'Incomplet',created:'Nouvelle entrée',progress:'Progression',fromTo:'vers'},
 it:{added:'Non registrato → Registrato',removed:'Registrato → Non registrato',date:'Data',complete:'Completato',incomplete:'Incompleto',created:'Nuova voce',progress:'Progresso',fromTo:'a'},
 ko:{added:'미기록 → 기록됨',removed:'기록됨 → 미기록',date:'날짜',complete:'달성',incomplete:'미달성',created:'새 기록',progress:'진행도',fromTo:'→'},
 nl:{added:'Niet vastgelegd → Vastgelegd',removed:'Vastgelegd → Niet vastgelegd',date:'Datum',complete:'Voltooid',incomplete:'Onvoltooid',created:'Nieuwe invoer',progress:'Voortgang',fromTo:'naar'},
 'pt-BR':{added:'Não registrado → Registrado',removed:'Registrado → Não registrado',date:'Data',complete:'Concluído',incomplete:'Incompleto',created:'Novo registro',progress:'Progresso',fromTo:'para'},
 ru:{added:'Не записано → Записано',removed:'Записано → Не записано',date:'Дата',complete:'Выполнено',incomplete:'Не выполнено',created:'Новая запись',progress:'Прогресс',fromTo:'в'},
 tr:{added:'Kaydedilmedi → Kaydedildi',removed:'Kaydedildi → Kaydedilmedi',date:'Tarih',complete:'Tamamlandı',incomplete:'Tamamlanmadı',created:'Yeni kayıt',progress:'İlerleme',fromTo:'→'},
 'zh-Hans':{added:'未记录 → 已记录',removed:'已记录 → 未记录',date:'日期',complete:'已完成',incomplete:'未完成',created:'新增记录',progress:'进度',fromTo:'→'},
 'zh-Hant':{added:'未記錄 → 已記錄',removed:'已記錄 → 未記錄',date:'日期',complete:'已完成',incomplete:'未完成',created:'新增記錄',progress:'進度',fromTo:'→'}
};
export function historyDetailCopy(locale:Locale):HistoryDetailCopy{
 return details[locale]??(locale==='fr-CA'?details.fr!:detailEn);
}

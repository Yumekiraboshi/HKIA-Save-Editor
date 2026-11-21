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

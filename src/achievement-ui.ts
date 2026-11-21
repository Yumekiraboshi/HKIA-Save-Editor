import type {Locale} from './locales';
type Labels={
 title:string;completed:string;incomplete:string;progress:string;completedAt:string;
 edit:string;save:string;unknown:string;notice:string;invalid:string;
};
const en:Labels={
 title:'Achievements',completed:'Completed',incomplete:'In progress',progress:'Progress',
 completedAt:'Completion date',edit:'Edit achievement',save:'Save change',
 unknown:'Achievement',notice:'Official achievement titles are not yet mapped to save GUIDs. The numbers are display positions, not game IDs.',
 invalid:'Enter a valid nonnegative progress value and completion date.'
};
const rows:Partial<Record<Locale,Labels>>={
 ja:{title:'アチーブメント',completed:'達成済み',incomplete:'未達成',progress:'進捗',completedAt:'達成日時',edit:'実績を編集',save:'変更を保存',unknown:'実績',notice:'ゲームの実績名とセーブ内GUIDの対応は未検証です。番号は一覧上の順番であり、ゲーム内IDではありません。',invalid:'進捗は0以上の数値、日時は有効な値を入力してください。'},
 ar:{title:'الإنجازات',completed:'مكتمل',incomplete:'قيد التقدم',progress:'التقدم',completedAt:'تاريخ الإكمال',edit:'تعديل الإنجاز',save:'حفظ التغيير',unknown:'إنجاز',notice:'لم يتم التحقق بعد من مطابقة أسماء الإنجازات لمعرّفات الحفظ. الأرقام للعرض فقط.',invalid:'أدخل قيمة تقدم غير سالبة وتاريخًا صالحًا.'},
 de:{title:'Erfolge',completed:'Abgeschlossen',incomplete:'In Bearbeitung',progress:'Fortschritt',completedAt:'Abschlussdatum',edit:'Erfolg bearbeiten',save:'Änderung speichern',unknown:'Erfolg',notice:'Die Zuordnung von Erfolgsnamen zu Speicher-GUIDs ist noch nicht bestätigt. Zahlen sind nur Listenpositionen.',invalid:'Gültigen Fortschritt ab 0 und ein Datum eingeben.'},
 es:{title:'Logros',completed:'Completado',incomplete:'En curso',progress:'Progreso',completedAt:'Fecha de finalización',edit:'Editar logro',save:'Guardar cambio',unknown:'Logro',notice:'Los nombres de los logros aún no se han vinculado a los GUID del guardado. Los números solo indican la posición.',invalid:'Introduce un progreso no negativo y una fecha válida.'},
 fr:{title:'Succès',completed:'Terminé',incomplete:'En cours',progress:'Progression',completedAt:'Date de réussite',edit:'Modifier le succès',save:'Enregistrer',unknown:'Succès',notice:'Les noms des succès ne sont pas encore associés de façon vérifiée aux GUID de sauvegarde. Les numéros sont des positions.',invalid:'Saisissez une progression positive ou nulle et une date valide.'},
 it:{title:'Obiettivi',completed:'Completato',incomplete:'In corso',progress:'Avanzamento',completedAt:'Data completamento',edit:'Modifica obiettivo',save:'Salva modifica',unknown:'Obiettivo',notice:'I nomi degli obiettivi non sono ancora associati ai GUID dei salvataggi. I numeri indicano solo la posizione.',invalid:'Inserisci un avanzamento non negativo e una data valida.'},
 ko:{title:'도전 과제',completed:'완료',incomplete:'진행 중',progress:'진행도',completedAt:'완료 날짜',edit:'도전 과제 편집',save:'변경 저장',unknown:'도전 과제',notice:'도전 과제 이름과 저장 GUID의 연결은 아직 검증되지 않았습니다. 숫자는 목록 순서입니다.',invalid:'0 이상의 진행도와 올바른 날짜를 입력하세요.'},
 nl:{title:'Prestaties',completed:'Voltooid',incomplete:'Bezig',progress:'Voortgang',completedAt:'Voltooiingsdatum',edit:'Prestatie bewerken',save:'Wijziging opslaan',unknown:'Prestatie',notice:'Prestatienamen zijn nog niet gekoppeld aan opslag-GUIDs. Nummers zijn alleen lijstposities.',invalid:'Voer een niet-negatieve voortgang en geldige datum in.'},
 'pt-BR':{title:'Conquistas',completed:'Concluído',incomplete:'Em andamento',progress:'Progresso',completedAt:'Data de conclusão',edit:'Editar conquista',save:'Salvar alteração',unknown:'Conquista',notice:'Os nomes das conquistas ainda não foram vinculados aos GUIDs do save. Números são apenas posições na lista.',invalid:'Insira um progresso não negativo e uma data válida.'},
 ru:{title:'Достижения',completed:'Выполнено',incomplete:'В процессе',progress:'Прогресс',completedAt:'Дата выполнения',edit:'Изменить достижение',save:'Сохранить',unknown:'Достижение',notice:'Названия достижений ещё не сопоставлены с GUID сохранения. Номера обозначают позиции в списке.',invalid:'Введите неотрицательный прогресс и правильную дату.'},
 tr:{title:'Başarımlar',completed:'Tamamlandı',incomplete:'Devam ediyor',progress:'İlerleme',completedAt:'Tamamlanma tarihi',edit:'Başarımı düzenle',save:'Değişikliği kaydet',unknown:'Başarım',notice:'Başarım adları henüz kayıt GUID değerleriyle doğrulanmadı. Sayılar yalnızca liste sırasıdır.',invalid:'Sıfır veya daha büyük ilerleme ve geçerli tarih girin.'},
 'zh-Hans':{title:'成就',completed:'已完成',incomplete:'进行中',progress:'进度',completedAt:'完成时间',edit:'编辑成就',save:'保存修改',unknown:'成就',notice:'尚未验证游戏成就名称与存档 GUID 的对应关系。数字仅表示列表顺序。',invalid:'请输入不小于零的进度和有效日期。'},
 'zh-Hant':{title:'成就',completed:'已完成',incomplete:'進行中',progress:'進度',completedAt:'完成時間',edit:'編輯成就',save:'儲存變更',unknown:'成就',notice:'尚未驗證遊戲成就名稱與存檔 GUID 的對應關係。數字僅表示清單順序。',invalid:'請輸入不小於零的進度和有效日期。'}
};
export function achievementCopy(locale:Locale):Labels{
 return rows[locale]??(locale==='fr-CA'?rows.fr!:en);
}

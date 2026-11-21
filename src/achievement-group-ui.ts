import type {Locale} from './locales';
export type GroupLabels={
 categories:string;back:string;showAll:string;uncategorized:string;groupRecord:string;
 memberCount:string;savedMembers:string;groupNote:string;
};
const en:GroupLabels={
 categories:'Achievement categories',back:'Back to categories',showAll:'Browse all achievements',
 uncategorized:'Unmapped saved achievements',groupRecord:'Category achievement',
 memberCount:'Achievements',savedMembers:'Saved records',
 groupNote:'Category membership comes from source definitions. Saved-state counts are not the game\'s official completion percentage.'
};
const tr:Partial<Record<Locale,GroupLabels>>={
 ja:{categories:'実績カテゴリー',back:'カテゴリー一覧に戻る',showAll:'すべての実績を表示',uncategorized:'未分類の保存済み実績',groupRecord:'カテゴリー実績',memberCount:'実績',savedMembers:'保存済み記録',groupNote:'カテゴリーはゲーム定義に基づいています。記録件数はゲーム内の公式達成率ではありません。'},
 ar:{categories:'فئات الإنجازات',back:'العودة إلى الفئات',showAll:'عرض جميع الإنجازات',uncategorized:'إنجازات محفوظة غير مصنفة',groupRecord:'إنجاز الفئة',memberCount:'الإنجازات',savedMembers:'السجلات المحفوظة',groupNote:'الفئات من تعريفات اللعبة. الأعداد المحفوظة ليست نسبة الإكمال الرسمية.'},
 de:{categories:'Erfolgskategorien',back:'Zurück zu den Kategorien',showAll:'Alle Erfolge anzeigen',uncategorized:'Nicht zugeordnete gespeicherte Erfolge',groupRecord:'Kategorieerfolg',memberCount:'Erfolge',savedMembers:'Gespeicherte Einträge',groupNote:'Die Kategorien stammen aus den Spieldaten. Gespeicherte Zahlen sind nicht die offizielle Abschlussquote.'},
 es:{categories:'Categorías de logros',back:'Volver a las categorías',showAll:'Ver todos los logros',uncategorized:'Logros guardados sin categoría',groupRecord:'Logro de categoría',memberCount:'Logros',savedMembers:'Registros guardados',groupNote:'Las categorías provienen del juego. Los registros guardados no son un porcentaje oficial de finalización.'},
 fr:{categories:'Catégories de succès',back:'Retour aux catégories',showAll:'Voir tous les succès',uncategorized:'Succès enregistrés non classés',groupRecord:'Succès de catégorie',memberCount:'Succès',savedMembers:'Enregistrements',groupNote:'Les catégories proviennent du jeu. Les comptes enregistrés ne sont pas le taux de réussite officiel.'},
 it:{categories:'Categorie obiettivi',back:'Torna alle categorie',showAll:'Mostra tutti gli obiettivi',uncategorized:'Obiettivi salvati non classificati',groupRecord:'Obiettivo categoria',memberCount:'Obiettivi',savedMembers:'Record salvati',groupNote:'Le categorie provengono dai dati di gioco. I record salvati non sono la percentuale ufficiale.'},
 ko:{categories:'도전 과제 카테고리',back:'카테고리로 돌아가기',showAll:'모든 도전 과제 보기',uncategorized:'분류되지 않은 저장 도전 과제',groupRecord:'카테고리 도전 과제',memberCount:'도전 과제',savedMembers:'저장 기록',groupNote:'카테고리는 게임 정의를 따릅니다. 저장 기록 수는 게임의 공식 달성률이 아닙니다.'},
 nl:{categories:'Prestatiecategorieën',back:'Terug naar categorieën',showAll:'Alle prestaties bekijken',uncategorized:'Niet-ingedeelde opgeslagen prestaties',groupRecord:'Categorieprestatie',memberCount:'Prestaties',savedMembers:'Opgeslagen records',groupNote:'Categorieën komen uit speldefinities. Aantallen zijn niet het officiële voltooiingspercentage.'},
 'pt-BR':{categories:'Categorias de conquistas',back:'Voltar às categorias',showAll:'Ver todas as conquistas',uncategorized:'Conquistas salvas sem categoria',groupRecord:'Conquista da categoria',memberCount:'Conquistas',savedMembers:'Registros salvos',groupNote:'As categorias vêm das definições do jogo. A contagem salva não é a porcentagem oficial.'},
 ru:{categories:'Категории достижений',back:'Назад к категориям',showAll:'Все достижения',uncategorized:'Сохранённые достижения без категории',groupRecord:'Достижение категории',memberCount:'Достижения',savedMembers:'Сохранённые записи',groupNote:'Категории взяты из данных игры. Число записей не равно официальному проценту выполнения.'},
 tr:{categories:'Başarım kategorileri',back:'Kategorilere dön',showAll:'Tüm başarımları göster',uncategorized:'Sınıflandırılmamış kayıtlı başarımlar',groupRecord:'Kategori başarımı',memberCount:'Başarımlar',savedMembers:'Kayıtlı girişler',groupNote:'Kategoriler oyun tanımlarındandır. Kayıt sayıları resmi tamamlanma yüzdesi değildir.'},
 'zh-Hans':{categories:'成就分类',back:'返回分类',showAll:'查看全部成就',uncategorized:'未分类的已保存成就',groupRecord:'分类成就',memberCount:'成就',savedMembers:'存档记录',groupNote:'分类依据游戏定义。存档记录数量不代表游戏官方完成率。'},
 'zh-Hant':{categories:'成就分類',back:'返回分類',showAll:'查看全部成就',uncategorized:'未分類的已儲存成就',groupRecord:'分類成就',memberCount:'成就',savedMembers:'存檔記錄',groupNote:'分類依據遊戲定義。存檔記錄數量不代表遊戲官方完成率。'}
};
export function achievementGroupCopy(locale:Locale):GroupLabels{
 return tr[locale]??(locale==='fr-CA'?tr.fr!:en);
}

import type {Locale} from './locales';
import type {InventoryGroupKey} from './inventory-browse';

/** Editor interface labels for game-source enum groups. These are descriptive
 * UI translations, not yet verified original Babel Inventory tab captions.
 */
const en:Record<InventoryGroupKey,string>={'key-items':'Key items','chef-station':'Cooking','creation-station':'Crafting',items:'Items',food:'Food',flowers:'Flowers & seeds',
 critters:'Critters',fish:'Fish',clothes:'Clothes',furniture:'Furniture',comics:'Comic Books',
 music:'Music Discs',wands:'Wands',other:'Other'};
const names:Partial<Record<Locale,Record<InventoryGroupKey,string>>>={
 ja:{'key-items':'大切なもの','chef-station':'調理','creation-station':'クラフト',items:'アイテム',food:'料理',flowers:'花・種',critters:'生き物',fish:'魚',clothes:'服',furniture:'家具',comics:'コミック',music:'音楽ディスク',wands:'魔法の杖',other:'その他'},
 de:{'key-items':'Schlüsselobjekte','chef-station':'Kochen','creation-station':'Herstellung',items:'Gegenstände',food:'Essen',flowers:'Blumen',critters:'Kleintiere',fish:'Fische',clothes:'Kleidung',furniture:'Möbel',comics:'Comics',music:'Musik',wands:'Zauberstäbe',other:'Andere'},
 es:{'key-items':'Objetos clave','chef-station':'Cocina','creation-station':'Fabricación',items:'Objetos',food:'Comida',flowers:'Flores',critters:'Bichos',fish:'Peces',clothes:'Ropa',furniture:'Muebles',comics:'Cómics',music:'Música',wands:'Varitas',other:'Otros'},
 fr:{'key-items':'Objets clés','chef-station':'Cuisine','creation-station':'Fabrication',items:'Objets',food:'Cuisine',flowers:'Fleurs',critters:'Créatures',fish:'Poissons',clothes:'Vêtements',furniture:'Meubles',comics:'BD',music:'Musique',wands:'Baguettes',other:'Autres'},
 it:{'key-items':'Oggetti chiave','chef-station':'Cucina','creation-station':'Creazione',items:'Oggetti',food:'Cibo',flowers:'Fiori',critters:'Creature',fish:'Pesci',clothes:'Abiti',furniture:'Mobili',comics:'Fumetti',music:'Musica',wands:'Bacchette',other:'Altri'},
 ko:{'key-items':'중요 아이템','chef-station':'요리','creation-station':'제작',items:'아이템',food:'음식',flowers:'꽃',critters:'생물',fish:'물고기',clothes:'의상',furniture:'가구',comics:'만화',music:'음악',wands:'마법 지팡이',other:'기타'},
 nl:{'key-items':'Sleutelvoorwerpen','chef-station':'Koken','creation-station':'Maken',items:'Voorwerpen',food:'Eten',flowers:'Bloemen',critters:'Diertjes',fish:'Vissen',clothes:'Kleding',furniture:'Meubels',comics:'Strips',music:'Muziek',wands:'Toverstokken',other:'Overige'},
 'pt-BR':{'key-items':'Itens-chave','chef-station':'Cozinha','creation-station':'Criação',items:'Itens',food:'Comida',flowers:'Flores',critters:'Bichos',fish:'Peixes',clothes:'Roupas',furniture:'Móveis',comics:'Quadrinhos',music:'Música',wands:'Varinhas',other:'Outros'},
 ru:{'key-items':'Ключевые предметы','chef-station':'Готовка','creation-station':'Создание',items:'Предметы',food:'Еда',flowers:'Цветы',critters:'Живность',fish:'Рыбы',clothes:'Одежда',furniture:'Мебель',comics:'Комиксы',music:'Музыка',wands:'Жезлы',other:'Прочее'},
 tr:{'key-items':'Anahtar eşyalar','chef-station':'Yemek yapma','creation-station':'Üretim',items:'Eşyalar',food:'Yiyecek',flowers:'Çiçekler',critters:'Canlılar',fish:'Balıklar',clothes:'Kıyafetler',furniture:'Mobilya',comics:'Çizgi Romanlar',music:'Müzik',wands:'Asalar',other:'Diğer'},
 ar:{'key-items':'العناصر الرئيسية','chef-station':'الطبخ','creation-station':'التصنيع',items:'العناصر',food:'الطعام',flowers:'الزهور',critters:'الكائنات',fish:'الأسماك',clothes:'الملابس',furniture:'الأثاث',comics:'القصص المصورة',music:'الموسيقى',wands:'العصي السحرية',other:'أخرى'},
 'zh-Hans':{'key-items':'重要物品','chef-station':'烹饪','creation-station':'制作',items:'物品',food:'食物',flowers:'花卉',critters:'生物',fish:'鱼类',clothes:'服装',furniture:'家具',comics:'漫画',music:'音乐',wands:'魔杖',other:'其他'},
 'zh-Hant':{'key-items':'重要物品','chef-station':'烹飪','creation-station':'製作',items:'物品',food:'食物',flowers:'花卉',critters:'生物',fish:'魚類',clothes:'服裝',furniture:'家具',comics:'漫畫',music:'音樂',wands:'魔杖',other:'其他'}
};
export function inventoryGroupLabel(locale:Locale,key:InventoryGroupKey):string{
 return (names[locale]??(locale==='fr-CA'?names.fr:undefined)??en)[key];
}

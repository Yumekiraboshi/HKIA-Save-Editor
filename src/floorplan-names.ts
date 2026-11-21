import type {Locale} from './locales';

/**
 * Source pinned to Steam v3.0.1 InventoryItemDefinitionAsset.Id and its
 * unique original English Babel table-300 string ID; translations are the
 * exact 16 Babel locale strings for that same string ID, not machine
 * translations, guessed labels, or wiki image filenames.
 *
 * These are floorplan ITEMS in collection_furniture_floorplans; Layouts
 * (player-saved room designs) are an entirely separate model.
 */
export const FLOORPLAN_ITEM_IDS=[
 259795663,290094351,300918892,464377127,559890359,618271257,
 619281290,754411213,768707764,1287138344,1386807800,1436147020,
 1517287020,1611086920,1709307148,1834332337,2124133713,2146463597
] as const;
export const FLOORPLAN_BABEL_IDS=[
 '558501416132435976','558501419408187392','558501416132435968',
 '558124727507345414','558501416132435974','558501416132435972',
 '558501416132435971','558124727507345409','558124727507345423',
 '558501416094687232','558124727507345410','558501416132435970',
 '558501416132435977','558124727507345415','558124727507345418',
 '558501416132435969','562895356075991040','558501416132435973'
] as const;
const NAMES:Readonly<Record<Locale,readonly string[]>>={
 ar:["مخطط طابق زاغ زيغ","مخطط طابق مركز الشقة العلوية للغرفة الطويلة","الغرفة المركزية، مخطط الطابق العلوي","مخطط طابق الغرفة العميقة الإضافي","مخطط طابق غرفة علوية جانبية طويلة","نصف بالإضافة إلى مخطط الطابق","مخطط الأرضية للزاوية الأمامية","مخطط أرضية الغرفة الكبيرة","مخطط أرضية غرفة صغيرة","مخطط أرضية الزاوية الخلفية","مخطط طابق الغرفة العميقة","مخطط طابق علوي جانبي لغرفة عميقة","مخطط أرضية متعرج","مخطط أرضية غرفة فائق الطول","مخطط طابق القاعة الطويلة","مخطط أرضية الممر الأوسط للغرفة العميقة","مخطط طابق العُلّية البسيط","مخطط طابق الرواق الأوسط للغرفة الطويلة"],
 de:["Zag-Zig-Grundriss","Langer Loft-Grundriss","Grundriss des unteren Zentrallofts","Extra tiefer Raum-Grundriss","Langer Raum Seiten-Loft-Grundriss","Halber Plus-Grundriss","Vordere Eckanordnung","Großer Raum-Grundriss","Kleiner Raumgrundriss","Grundriss der hinteren Ecke","Tiefenraum-Anordnung","Grundriss der unteren Etage des Lofts","Zickzack-Grundriss","Extra langer Raumgrundriss","Grundriss des langen Raums","Detaillierter Grundriss von Raum und Flur","Einfacher Dachboden-Grundriss","Grundriss des langen mittleren Ganges des Saals"],
 en:["Zag Zig Floorplan","Long Room Center Loft Floorplan","Deep Room Center Loft Floorplan","Extra Deep Room Floorplan","Long Room Side Loft Floorplan","Half Plus Floorplan","Front Corner Floorplan","Big Room Floorplan","Small Room Floorplan","Back Corner Floorplan","Deep Room Floorplan","Deep Room Side Loft Floorplan","Zig Zag Floorplan","Extra Long Room Floorplan","Long Room Floorplan","Deep Room Middle Hallway Floorplan","Simple Loft Floorplan","Long Room Middle Hallway Floorplan"],
 "en-GB":["Zag Zig Floorplan","Long Room Centre Loft Floorplan","Deep Room Centre Loft Floorplan","Extra Deep Room Floorplan","Long Room Side Loft Floor Plan","Half Plus Floorplan","Front Corner Floorplan","Big Room Floorplan","Small Room Floorplan","Back Corner Floor Plan","Deep Room Floorplan","Deep Room Side Loft Floorplan","Zig Zag Floorplan","Extra Long Room Floorplan","Long Room Floorplan","Deep Room Middle Hallway Floorplan","Simple Loft Floorplan","Long Room Middle Hallway Floor Plan"],
 es:["Plano de planta Zag Zig","Plano de la planta del altillo central de la sala larga","Plano del altillo central de la sala profunda","Plano de planta de habitación extra profunda","Plano de planta del altillo lateral de la sala larga","Plano de media más","Plano de planta de la esquina delantera","Plano de planta de la gran sala","Plano de planta de habitación pequeña","Plano de planta de la esquina del fondo","Plano de una habitación larga","Plano detallado de la planta del altillo del lado de la habitación","Plano de suelo en zigzag","Plano de planta de habitación extralarga","Plano de la planta de la sala larga","Plano del pasillo central de la Sala Profunda","Plano sencillo de loft","Plano de planta del pasillo central de la sala larga"],
 fr:["Plan d'étage Zag Zig","Plan d'étage du loft central de la grande salle","Plan d'étage du loft central de la salle profonde","Plan d'étage d'une pièce extra profonde","Plan d'étage du loft latéral de la grande pièce","Demi plus plan d'étage","Disposition du coin avant","Plan d'étage de grande pièce","Plan d'aménagement d'une petite pièce","Plan d'étage du coin arrière","Disposition détaillée de la pièce","Plan d'étage du loft latéral de la pièce profonde","Plan d'étage en zigzag","Plan d'étage d'une très grande pièce","Plan d'étage de la longue salle","Plan d'étage du couloir central de la Salle profonde","Plan d'étage simple d'un loft","Plan du couloir central de la longue salle"],
 "fr-CA":["Plan d'étage Zag Zig","Plan d'étage du loft central d'une pièce longue","Plan d'étage du loft central d'une salle profonde","Plan d'étage d'une pièce extra profonde","Plan d'étage du loft latéral de la grande salle","Demi-plus-plan d'étage","Plan d'étage du coin avant","Plan d'étage d'une grande pièce","Plan d'étage de petite pièce","Plan d'étage de coin arrière","Plan d'étage de la salle profonde","Plan d'étage du loft côté pièce à l'étage inférieur","Plan d'étage en zigzag","Plan d'étage de pièce extra longue","Plan d'étage de la longue salle","Plan d'étage du couloir central de Deep Room","Plan d'étage de loft simple","Plan d'étage du long couloir central"],
 it:["Pianta del pavimento Zag Zig","Piantina del piano soppalcato centrale della Stanza Lunga","Pianta del soppalco centrale della stanza profonda","Pianta del pavimento di una stanza extra profonda","Pianta del soppalco laterale della lunga stanza","Una pianta del pavimento semipiena","Disposizione dell'angolo anteriore","Pianta del grande ambiente","Planimetria della piccola stanza","Pianta del pavimento dell'angolo posteriore","Pianta della stanza profonda","Pianta del soppalco laterale della stanza profonda","Pianta a zigzag","Pianta del pavimento di una stanza extra lunga","Pianta della Sala Lunga","Pianta del corridoio profondo della stanza","Pianta semplice del soppalco","Pianta del pavimento del corridoio centrale della Stanza Lunga"],
 ja:["ザグジグの間取り図","長い部屋のセンターロフトの間取り図","広い部屋のセンターロフトの間取り図","とても広い部屋の間取り図","長い部屋のサイドロフトの間取り図","ハーフプラスの間取り図","フロントコーナーの間取り図","大きな部屋の間取り図","小さな部屋の間取り図","バックコーナーの間取り図","広い部屋の間取り図","広い部屋のサイドロフトの間取り図","ジグザグの間取り図","とても長い部屋の間取り図","長い部屋の間取り図","広い部屋の通路の間取り図","シンプルなロフトの間取り図","長い部屋の通路の間取り図"],
 ko:["재그지그 평면도","긴 방 중간 다락 평면도","깊은 방 중간 다락 평면도","아주 깊은 방 평면도","긴 방 측면 다락 평면도","반쪽 십자형 평면도","앞 모서리 평면도","큰 방 평면도","작은 방 평면도","뒤 모서리 평면도","깊은 방 평면도","깊은 방 측면 다락 평면도","지그재그 평면도","아주 긴 방 평면도","긴 방 평면도","깊은 방 중앙 복도 평면도","단순한 다락 평면도","긴 방 중앙 복도 평면도"],
 nl:["Zaag-Zig Plattegrond","Plattegrond van de lange middenverdieping van de loft","Plattegrond van de centrale loft voor de onderste kamer","Extra Diepkamerplattegrond","Lange zolderindeling aan de zijkant van de kamer","Halve plus plattegrond","Voorste hoekplattegrond","Grote Kamerplattegrond","Plattegrond van een kleine kamer","Plattegrond van de achterhoek","Diepkamerplattegrond","Plattegrond van zijzolder in diepe kamer","Zigzagverdiepingsplan","Extra lange kamerplattegrond","Plattegrond van een lange kamer","Plattegrond van de diepe middenhalverdieping","Eenvoudige loftplattegrond","Plattegrond van de lange middelste gang"],
 "pt-BR":["Planta Baixa Zag Zig","Planta do mezanino central do longo cômodo","Layout do Mezanino Central da Sala Profunda","Planta Baixa de Sala Extra Profunda","Planta do Mezanino Lateral do Salão Longo","Meio Mais Planta Baixa","Planta baixa do canto dianteiro","Planta Baixa de Sala Grande","Planta baixa de quarto pequeno","Planta Baixa do Canto Traseiro","Planta Baixa de Quarto Profundo","Planta baixa do mezanino lateral da sala profunda","Planta Baixa Zig Zag","Planta Baixa do Quarto Extra Longo","Planta baixa de sala longa","Planta do corredor do meio da Sala Profunda","Planta Baixa Simples de Loft","Planta Baixa do Corredor Central da Sala Longa"],
 ru:["План этажа Zag Zig","План лофта для центральной части длинной комнаты","План этажа центрального лофта глубокой комнаты","План этажа очень глубокой комнаты","План мансардного этажа с длинной стороной","Половина и план этажа","Передняя угловая компоновка","План этажа большой комнаты","План этажа маленькой комнаты","План этажа заднего угла","План этажа глубокой комнаты","План этажа боковой мансарды с глубокой комнатой","Планировка Зигзаг","План этажа очень длинной комнаты","План этажа длинного зала","План этажа среднего коридора глубокой комнаты","Простой план этажа мансарды","План этажа среднего коридора в Длинной комнате"],
 tr:["Zag Zig Kat Planı","Uzun Oda Merkez Çatı Katı Kat Planı","Derin Oda Merkez Çatı Katı Kat Planı","Ek Derin Oda Kat Planı","Uzun Oda Yan Loft Kat Planı","Yarım Artı Kat Planı","Ön Köşe Kat Planı","Büyük Oda Kat Planı","Küçük Oda Kat Planı","Arka Köşe Kat Planı","Derin Oda Kat Planı","Derin Oda Yan Çatı Katı Kat Planı","Zikzak Kat Planı","Ekstra Uzun Oda Kat Planı","Uzun Oda Kat Planı","Derin Oda Orta Koridor Kat Planı","Basit Çatı Katı Kat Planı","Uzun Oda Orta Koridor Kat Planı"],
 "zh-Hans":["反之字形平面图","长房间带中央阁楼平面图","纵深房间带中央阁楼平面图","特深房间平面图","长房间带侧边阁楼平面图","加宽半间平面图","前角平面图","大房间平面图","小房间平面图","后角平面图","纵深房间平面图","纵深房间带侧边阁楼平面图","之字形平面图","特长房间平面图","长房间平面图","纵深房间带中间走廊平面图","简单阁楼平面图","长房间带中间走廊平面图"],
 "zh-Hant":["反之字形格局","長型房間中央閣樓格局","深型房間中央閣樓格局","超深型房間格局","長型房間側邊閣樓格局","凸字形格局","前側轉角格局","大型房間格局","小型房間格局","後側轉角格局","深型房間格局","深型房間側邊閣樓格局","反之字形格局","超長型房間格局","長型房間格局","深型房間中央走廊格局","簡約閣樓格局","長型房間中央走廊格局"]
};
const INDEX=new Map<number,number>(FLOORPLAN_ITEM_IDS.map((id,i)=>[id,i]));
/** Exact original v3.0.1 native source ItemId; false for every other item. */
export function isVerifiedFloorplanItemId(id:number):boolean{
 return Number.isSafeInteger(id)&&INDEX.has(id);
}
export function verifiedFloorplanName(id:number,locale:Locale):string|null{
 const index=INDEX.get(id);
 return index===undefined?null:NAMES[locale][index]??null;
}

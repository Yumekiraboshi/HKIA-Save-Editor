export type CollectionItem=[number,string,string,string,number,string|null,string|null,number];
export type Subcategory={key:string;count:number;total:number;previewId:number|null};
import type {Locale} from './locales';
const LABELS:Record<string,readonly [string,string]>={
 'all': ["すべて","All"],
 'allballoons': ["すべてのバルーン","All Balloons"],
 'allflowers': ["すべての花","All Flowers"],
 'allhats': ["すべての帽子","All Hats"],
 'allinstructions': ["すべての説明書","All Instructions"],
 'allplans': ["すべての設計図","All Plans"],
 'allplushpals': ["すべてのぬいぐるみフレンズ","All Plush Pals"],
 'alltools': ["すべての道具","All Tools"],
 'alltrinkets': ["すべてのトリンケット","All Trinkets"],
 'amazingmymelody': ["アメージング・マイメロディ","Amazing My Melody"],
 'antique': ["アンティーク","Antique"],
 'aquafallmachine': ["アクアフォール・マシン","Aquafall Machine"],
 'backpacks': ["バッグ","Backpacks"],
 'bad': ["バッドばつ丸","Badtz-maru"],
 'badtzandbestie': ["ばつ丸とベストフレンド","Badtz and Bestie"],
 'badtzmaru': ["バッドばつ丸","Badtz-maru"],
 'basics': ["ベーシック","Basics"],
 'bc': ["ビッグ・チャレンジ","Big Challenges"],
 'bigchallenges': ["ビッグ・チャレンジ","Big Challenges"],
 'bottoms': ["ボトムス","Bottoms"],
 'cafedeco': ["カフェの装飾","Cafe Decorations"],
 'candycloud': ["キャンディクラウド","Candy Clouds"],
 'cauldron': ["大釜","Cauldron"],
 'celestree': ["セレスツリー","Celestree"],
 'cho': ["チョコキャット","Chococat"],
 'chococat': ["チョコキャット","Chococat"],
 'cin': ["シナモロール","Cinnamoroll"],
 'cinnamoroll': ["シナモロール","Cinnamoroll"],
 'citytown': ["シティタウン","City Town"],
 'clothing': ["服","Clothing"],
 'clothing_multiplayer': ["マルチプレイの服","Multiplayer Clothing"],
 'cloudisland': ["クラウド・アイランド","Cloud Island"],
 'coastal': ["コースタル","Coastal"],
 'cogi': ["こぎみゅん","Cogimyun"],
 'colorblazecarnival': ["カラーブレイズ・カーニバル","Colorblaze Carnival"],
 'cottage': ["コテージ","Cottage"],
 'cozydrinks': ["温かい飲み物","Cozy Drinks"],
 'critter': ["生き物","Critters"],
 'dangerdoodler': ["デンジャー・ドゥードラー","Danger Doodler"],
 'darkgrapeman': ["ダークグレイプマン","Darkgrapeman"],
 'daysofplenty': ["実りの日々","Days of Plenty"],
 'dessert': ["デザート","Desserts"],
 'dreamy': ["ドリーミー","Dreamy"],
 'eggpan': ["フライパン","Egg Pan"],
 'eventcontent': ["イベントアイテム","Event Items"],
 'fantasticfriends': ["ファンタスティック・フレンズ","Fantastic Friends"],
 'fashionfrenzy': ["ファッション・フレンジー","Fashion Frenzy"],
 'figurines': ["フィギュア","Figurines"],
 'floorplans': ["間取り","Floor Plans"],
 'flowerrangers': ["フラワーレンジャーズ","Flower Rangers"],
 'flowers': ["花","Flowers"],
 'food': ["料理","Food"],
 'friendshipfestival': ["フレンドシップ・フェスティバル","Friendship Festival"],
 'friendshipisland': ["フレンドシップ・アイランド","Friendship Island"],
 'froggypower': ["フロッギーパワー","Froggy Power"],
 'fullbody': ["全身コーデ","Full Outfits"],
 'furniture': ["家具","Furniture"],
 'fwish': ["フウィッシュ","Fwishing"],
 'gemstonemountain': ["ジェムストーン・マウンテン","Gemstone Mountain"],
 'giveandgather': ["ギブ＆ギャザー","Give and Gather"],
 'glasses': ["めがね","Glasses"],
 'greenhouse': ["温室","Greenhouse"],
 'guardiansofthegrain': ["ガーディアンズ・オブ・ザ・グレイン","Guardians of the Grain"],
 'han': ["ハンギョドン","Hangyodon"],
 'hangyodon': ["ハンギョドン","Hangyodon"],
 'happyhavendays': ["ハッピー・ヘイブン・デイズ","Happy Haven Days"],
 'hats': ["帽子","Hats"],
 'hk': ["ハローキティ","Hello Kitty"],
 'hk50': ["ハローキティ50周年","Hello Kitty's 50th Anniversary"],
 'hk50cards': ["ハローキティ50周年カード","Hello Kitty's 50th Anniversary Cards"],
 'hugsandhearts': ["ハグ＆ハート","Hugs and Hearts"],
 'ichigomanchronicles': ["イチゴマン・クロニクル","Ichigoman Chronicles"],
 'icypeak': ["アイシー・ピーク","Icy Peak"],
 'imaginationcafe': ["イマジネーション・カフェ","Imagination Cafe"],
 'imaginationcelebration': ["イマジネーション・セレブレーション","Imagination Celebration"],
 'jamjamboree': ["ジャム・ジャンボリー","Jam Jamboree"],
 'kawaii': ["カワイイ","Kawaii"],
 'ker': ["けろけろけろっぴ","Keroppi"],
 'kitchen': ["キッチン","Kitchen"],
 'kur': ["クロミ","Kuromi"],
 'kuromi': ["クロミ","Kuromi"],
 'lighttimejubilee': ["ライトタイム・ジュビリー","Lighttime Jubilee"],
 'littletwinstarstrip': ["リトルツインスターズの旅","Little Twin Stars' Trip"],
 'lts': ["リトルツインスターズ","Little Twin Stars"],
 'luckandlanterns': ["幸せのランタン祭り","Luck and Lanterns"],
 'lures': ["釣りルアー","Fishing Lures"],
 'meadow': ["メドウ","Meadow"],
 'mel': ["マイメロディ","My Melody"],
 'merrymeadow': ["メリー・メドウ","Merry Meadow"],
 'monthofmeh': ["モンス・オブ・メー","Month of Meh"],
 'moon': ["ムーン","The Moon"],
 'mop': ["モップ","Moppu"],
 'moppu': ["モップ","Moppu"],
 'mounthothead': ["マウント・ホットヘッド","Mount Hothead"],
 'msp': ["マイスウィートピアノ","My Sweet Piano"],
 'musicdiscs': ["音楽ディスク","Music Discs"],
 'myhobbyzine': ["マイ・ホビー・ジン","My Hobby Zine"],
 'mymelody': ["マイメロディ","My Melody"],
 'mysweetpiano': ["マイスウィートピアノ","My Sweet Piano"],
 'nordic': ["ノルディック","Nordic"],
 'oven': ["オーブン","Oven"],
 'paperparade': ["ペーパー・パレード","Paper Parade"],
 'pek': ["ペックル","Pekkle"],
 'pirate': ["海賊","Pirate"],
 'pizza': ["ピザ","Pizza"],
 'plans': ["設計図","Crafting Plans"],
 'poc': ["ポチャッコ","Pochacco"],
 'pocketroom': ["ポケットルーム","Pocket Room"],
 'polarpowerpals': ["ポーラーパワーパルズ","Polar Power Pals"],
 'pom': ["ポムポムプリン","Pompompurin"],
 'pompompurin': ["ポムポムプリン","Pompompurin"],
 'potions': ["ポーション","Potions"],
 'racing': ["レーシング","Racing"],
 'rainbowreef': ["レインボー・リーフ","Rainbow Reef"],
 'recipes': ["レシピ","Recipes"],
 'ret': ["烈子","Retsuko"],
 'revolutionaryfairy': ["革命の妖精","Revolutionary Fairy"],
 'ruins': ["遺跡","Ruins"],
 'rustic': ["ラスティック","Rustic"],
 'saunarator': ["サウナレーター","Saunarator"],
 'schoolasitccelebration': ["スクール・セレブレーション","Scholastic Celebration"],
 'seasideresort': ["シーサイド・リゾート","Seaside Resort"],
 'snow': ["アークティファイアー","Arctifier"],
 'soda': ["ソーダ","Soda"],
 'spooky': ["スプーキー","Spooky"],
 'spookycelebration': ["スプーキー・セレブレーション","Spooky Celebration"],
 'spookyswamp': ["スプーキー・スワンプ","Spooky Swamp"],
 'springtimecelebration': ["スプリングタイム・セレブレーション","Springtime Celebration"],
 'station': ["作業ステーション","Stations"],
 'sunshinecelebration': ["サンシャイン・セレブレーション","Sunshine Celebration"],
 'theadventures': ["ザ・アドベンチャーズ","The Adventures"],
 'thefigments': ["フィグメンツ","The Figments"],
 'thegreatgudetama': ["グレートぐでたま","The Great Gudetama"],
 'theincrediblehellokitty': ["インクレディブル・ハローキティ","The Incredible Hello Kitty"],
 'top': ["トップハット","TOPHAT"],
 'tops': ["トップス","Tops"],
 'trinkets': ["トリンケット","Trinkets"],
 'tropical': ["トロピカル","Tropical"],
 'tux': ["タキシードサム","Tuxedosam"],
 'undertheseacelebration': ["アンダー・ザ・シー・セレブレーション","Under the Sea Celebration"],
 'usa': ["ウサハナ","Usahana"],
 'usahana': ["ウサハナ","Usahana"],
 'vending': ["自動販売機","Vending"],
 'wands': ["魔法の杖","Wands"],
 'wheatflour': ["ウィートフラワー・ワンダーランド","Wheatflour Wonderland"],
 'wmm': ["ウィッシュミーメル","Wish me mell"],
 'yummy': ["ヤミー","Yummy"],
};
const WEATHER_ORDER=['collection_aquafall_aquafallmachine','collection_celestree_celestree','collection_saunarator_saunarator','collection_weather_snow'];
const PREVIEW_PARENTS:Record<string,number>={
 collection_aquafall_aquafallmachine:1611616925,
 collection_celestree_celestree:463096384,
 collection_saunarator_saunarator:254880643,
 collection_weather_snow:815186408
};

export function subcategoryLabel(key:string,locale:Locale):string{
 const slug=key.split('_').slice(2).join('_');
 const pair=LABELS[slug];
 return pair?pair[locale==='ja'?0:1]:(locale==='ja'?'その他':'Other');
}

export function isKnownSubcategory(key:string):boolean{
 return Object.hasOwn(LABELS,key.split('_').slice(2).join('_'));
}

export function listSubcategories(items:readonly CollectionItem[],group:string,recorded:Readonly<Record<string,bigint>>,locale:Locale):Subcategory[]{
 const map=new Map<string,{all:Set<number>;owned:Set<number>;firstParent:number|null;namedParent:number|null}>();
 for(const item of items){
  if(item[3]!==group)continue;
  let current=map.get(item[2]);
  if(!current){current={all:new Set(),owned:new Set(),firstParent:null,namedParent:null};map.set(item[2],current)}
  const parent=item[7]||item[0];
  current.all.add(parent);
  if(recorded[String(item[0])]!==undefined)current.owned.add(parent);
  if(item[0]===parent){
   current.firstParent??=parent;
   if(item[5]||item[6])current.namedParent??=parent;
  }
 }
 return [...map.entries()].map(([key,counts])=>({
  key,count:counts.owned.size,total:counts.all.size,
  previewId:counts.all.has(PREVIEW_PARENTS[key])?PREVIEW_PARENTS[key]:counts.namedParent??counts.firstParent
 }))
  .sort((a,b)=>{
   if(group==='collections_group_weather'){
    return WEATHER_ORDER.indexOf(a.key)-WEATHER_ORDER.indexOf(b.key);
   }
   return subcategoryLabel(a.key,locale).localeCompare(subcategoryLabel(b.key,locale),locale);
  });
}

export function recordedFamilies(items:readonly CollectionItem[],recorded:Readonly<Record<string,bigint>>):Record<string,number[]>{
 const families:Record<string,number[]>={};
 for(const item of items){
  if(recorded[String(item[0])]===undefined)continue;
  const parent=String(item[7]||item[0]);
  (families[parent]??=[]).push(item[0]);
 }
 return families;
}

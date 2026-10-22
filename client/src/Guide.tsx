import { useEffect, useState, type ReactNode } from "react";
import { GAMES, type GameId } from "../../shared/protocol";
import { BrandMark } from "./BrandMark";
import { GameEmblem } from "./GameEmblem";

/**
 * "Nasıl oynanır": a longer, illustrated guide per game, reached through
 * #rehber (table basics) or #rehber/<game>. The screenshots under
 * public/rehber are real screens of these games; the text follows the rules
 * as the server plays them, and says where this table differs from what
 * people may know from elsewhere.
 */

interface Shot {
  src: string;
  alt: string;
  w: number;
  h: number;
}

interface Step {
  title: string;
  text: ReactNode;
  shot?: Shot;
}

interface GameGuide {
  lead: string;
  steps: Step[];
  scoring: string[];
  /** Where this table's rules differ from other common ways of playing. */
  house: string[];
  tips: string[];
}

const shot = (name: string, alt: string, w: number, h: number): Shot => ({ src: `/rehber/${name}.webp`, alt, w, h });

const BASICS: Step[] = [
  {
    title: "Oda aç ya da koda katıl",
    text: "Ana sayfada ismini yaz ve Yeni oda aç'a bas. Masanın dört harfli kodu üstte durur; kodu ya da Davet linkini paylaş düğmesindeki linki gruba at. Gelenler ismini yazıp kodla oturur.",
    shot: shot("lobi", "Lobi: oda kodu, masadakiler, boş koltuğa bot oturtma ve oyun listesi", 400, 818),
  },
  {
    title: "Oyunu ve ayarları seç",
    text: "Oyunu ve masa ayarlarını oda sahibi seçer: tur süresi, el sayısı, eşli oynama gibi. Her ayarın altında ne işe yaradığı yazar. Kişi sayısı yetmiyorsa başlat düğmesinin üstünde kaç kişi daha gerektiği görünür.",
  },
  {
    title: "Eksik koltuğa bot oturt",
    text: "Okey, 101, Pişti, Satranç ve Vampir Köylü'de boş koltuğa bot oturtulabilir. Tabu ve Casus konuşarak oynandığı için botla oynanmaz.",
  },
  {
    title: "Oyun sırasında",
    text: "Masanın yanında (telefonda altında) sekmeler durur: oyunun kendi paneli, Sohbet ve Kurallar. Bağlantın koparsa 15 saniye sonra yerine bot geçer; aynı kodla geri girince koltuğunu geri alırsın. Bir oyun bitince oda sahibi Lobiye dön diyerek başka bir oyuna geçebilir.",
  },
];

const GUIDES: Record<GameId, GameGuide> = {
  okey: {
    lead: "Dört kişiyle 106 taşla oynanır. Amaç elindeki taşları seri ve perlere dizip son taşı atarak ilk biten olmak.",
    steps: [
      {
        title: "Gösterge ve okey",
        text: "Her elin başında bir taş gösterge olarak açılır. Göstergenin aynı renkten bir üstü o elin okeyidir ve her taşın yerine geçer; 13'ün üstü 1'dir. İki sahte okey (yıldızlı taş) okeyin kendisi yerine kullanılır. Ekranın sağ üstünde o elin okeyi yazar.",
        shot: shot("okey-masa", "Okey masası: gösterge, ortadaki deste, soldan alınacak taş ve oyuncunun ıstakası", 368, 628),
      },
      {
        title: "Dağıtım ve ilk hamle",
        text: "Herkese 14 taş, eli açan oyuncuya (D işaretli) 15 taş gelir. O oyuncu çekmeden bir taş atarak başlar. Göstergenin eşi elindeyse ilk turunda Göstergeyi göster'e bas, puanını al.",
      },
      {
        title: "Çek, diz, at",
        text: "Sıra sana gelince ya ortadaki desteden ya da solundaki oyuncunun son attığı taşı çek, sonra sağ alttaki atma yerine bir taş at. Taşları ıstakada sürükleyerek dizersin; Seri diz ve Çift diz düğmeleri elini senin yerine en iyi şekilde dizer.",
        shot: shot("okey-istaka", "Seri diz'e basılmış ıstaka: seriler ve perler ayrı gruplar halinde", 368, 97),
      },
      {
        title: "Bitirmek",
        text: "Seri aynı renkten art arda en az üç taştır (12-13-1 de geçer). Per aynı sayının farklı renklerinden üç ya da dört taştır. 14 taşın tamamı gruplara girince son taşı seçip Bitir'e bas. Yedi çift yapıp da bitirebilirsin.",
      },
    ],
    scoring: [
      "Normal oyunda biten 2 puan alır; çiftten ya da okeyi atarak biterse 4. Eller bitince en çok puanı olan kazanır.",
      "Katlamalı oyunda herkes aynı puanla başlar (10, 20 ya da 30). Biten oyuncu diğerlerine 2 puan kaybettirir; çift ve okey atma bunu ayrı ayrı ikiye katlar (4 ya da 8). Biri sıfıra düşünce oyun biter.",
      "Gösterge açıksa göstergenin eşini ilk turunda gösteren 1 puan alır, katlamalıda diğerlerine 1 puan kaybettirir.",
    ],
    house: [
      "Desteden taş bitince el berabere biter, kimse puan almaz.",
      "Eşli oynanırsa karşılıklı oturanlar aynı puanı paylaşır.",
      "Hamle süresi seçildiyse süresi dolan oyuncunun hamlesini bot yapar.",
    ],
    tips: [
      "Senin attığın taşı sağındaki oyuncu alabilir. Onun yerden ne aldığına ve ne attığına bak, işine yarayacak taşı ona verme.",
      "Okeyi erken harcama. Elinde dursun, en son eksik kalan grubu tamamlasın.",
      "Istakanın altındaki sayaç kaç taşın seriye girdiğini ve kaç çiftin olduğunu gösterir. Çift sayısı 5'i geçtiyse çifte gitmeyi düşün.",
    ],
  },
  okey101: {
    lead: "Okeyin taşlarıyla oynanır ama kimse sadece bitirmeye oynamaz: elini 101 sayıyla açarsın, masaya işlersin ve el sonunda en az ceza yazan kazanır.",
    steps: [
      {
        title: "Dağıtım",
        text: "Herkese 21 taş, eli açan oyuncuya 22 taş gelir. Gösterge, okey ve sahte okey normal okeydeki gibidir. Sıra yine çek, at diye döner.",
      },
      {
        title: "Elini açmak",
        text: "Elindeki seri ve perlerin sayı toplamı en az 101 ise elini açıp masaya koyabilirsin. Ya da en az beş çiftle çiftten açarsın. Istakanın altında elinin kaç sayı ettiği ve açmak için ne kadar eksiğin olduğu yazar. Elimi aç düğmesi en iyi dizilişi bulup senin yerine açar.",
        shot: shot("okey101-masa", "101 masası: masada açılmış seriler ve perler, ıstakanın altında açmak için kalan sayı", 368, 884),
      },
      {
        title: "Yandan almak",
        text: "Solundakinin attığı taşı alırsan o taşı aynı el içinde kullanmalısın: henüz açmadıysan o taşla açarsın, açtıysan masaya koyar ya da bir gruba işlersin. Elimi aç ve Yere koy düğmeleri yandan aldığın taşı dizilişe kendileri katar. Kullanamayacaksan Aldığımı geri koy'a bas.",
      },
      {
        title: "İşlemek ve bitirmek",
        text: "Açtıktan sonra masadaki herhangi bir seri ya da perin ucuna taş ekleyebilirsin; taşı seçip gruba dokun ya da taşı gruba sürükle. Çiftlere taş işlenmez. Elinde son taş kalınca onu atarak bitirirsin.",
      },
    ],
    scoring: [
      "Biten oyuncu -101 yazar. Açan oyuncular elinde kalan taşların sayı toplamını, hiç açamayan 202 yazar.",
      "Çiftten açmış oyuncunun elinde kalanlar iki kat yazılır.",
      "Çiftten ya da okeyi atarak bitirilirse herkesin cezası iki katına çıkar.",
      "Seçilen el sayısı bitince en az puanı olan kazanır. Eşli oyunda iki eşin puanı toplanır.",
    ],
    house: [
      "101'de 12-13-1 serisi geçmez; 1 sadece serinin başında durur.",
      "Okeyi ya da masaya işlenebilecek bir taşı atana 101 ceza yazılır. Oda sahibi bu cezayı lobide kapatabilir; açıkken böyle bir taşı atmaya kalkınca masa seni bir kez uyarır.",
      "Desteden taş biterse el kimse bitirmeden kapanır ve herkes elinde kalan cezayı yazar.",
    ],
    tips: [
      "Açmak için acele etme ama çok da bekleme: açmayan 202 yer, açıp elinde 30 sayı bırakmak her zaman daha ucuzdur.",
      "Açtıktan sonra elindeki büyük sayıları önce işle ya da at; el biterse cezayı onlar büyütür.",
      "Başkalarının açtığı serilerin uçlarını aklında tut, o taşları ona vermemek için atma.",
    ],
  },
  tabu: {
    lead: "İki takımla oynanan kelime anlatma oyunu. Anlatıcı kartın üstündeki kelimeyi, altındaki yasaklı kelimeleri kullanmadan takımına anlatır.",
    steps: [
      {
        title: "Takımlar",
        text: "Oyun açılınca herkes rastgele Kırmızı ya da Mavi takıma düşer. İsteyen Takımımı değiştir'e basar, oda sahibi Karıştır ile yeniden dağıtıp Oyunu başlat der. Takımlar sırayla anlatır; her turda takımdan sıradaki kişi anlatıcı olur.",
        shot: shot("tabu-hazir", "Tabu: sıra anlatıcıda, Hazırım başlat düğmesi", 368, 392),
      },
      {
        title: "Anlatıcı",
        text: "Hazırım'a bastığında süre başlar ve kart sana gelir. Takımın kelimeyi bilince Doğru'ya bas, yeni kart gelir. Takılırsan Pas ile kartı değiştir; pas puan kaybettirmez ama sayısı sınırlıdır.",
        shot: shot("tabu-anlatici", "Anlatıcının ekranı: kelime, yasaklı kelimeler, Tabu, Pas ve Doğru düğmeleri, süre", 368, 642),
      },
      {
        title: "Tahmin eden takım",
        text: "Senin takımından biri anlatıyorsa kart sana görünmez. Sesli tahmin et; doğru kelimeyi anlatıcı işaretler.",
        shot: shot("tabu-tahmin", "Tahmin eden takımın ekranı: kart kapalı", 368, 518),
      },
      {
        title: "Rakip takım",
        text: "Rakip takım kartı ve yasaklı kelimeleri görür. Anlatıcı yasaklı bir kelimeyi söylerse Tabu düğmesine basar.",
        shot: shot("tabu-rakip", "Rakip takımın ekranı: kart açık, büyük Tabu düğmesi", 368, 627),
      },
    ],
    scoring: [
      "Doğru bilinen her kart +1, Tabu -1. Pas puanı değiştirmez.",
      "Her takım seçilen tur sayısı kadar anlatır; en çok puanı olan takım kazanır.",
    ],
    house: [
      "Kelimenin kendisi, yasaklı kelimeler ve bunların parçaları söylenemez (Satranç için \"satranççı\" da yasak). El kol hareketi, ses taklidi ve harf ipucu yok.",
      "Pas hakkı oda sahibinin seçimine göre 0, 3, 5 ya da sınırsızdır; tur süresi 45 ile 120 saniye arası seçilir.",
    ],
    tips: [
      "Takılırsan anlatma şeklini değiştir: tanım yerine bir cümle kur ve boşluğu takımın doldursun.",
      "Pas hakkını ilk kartlarda harcama, gerçekten zor bir kart gelince lazım olur.",
      "Rakip olarak sadece yasakları değil kelimenin parçalarını da dinle.",
    ],
  },
  vampir: {
    lead: "Gizli rollerle oynanan bir saklanma ve ikna oyunu. Geceleri vampirler köyden birini ısırır, gündüz köy kimin vampir olduğunu tartışıp birini asar.",
    steps: [
      {
        title: "Rolünü gör",
        text: "Oyun başlayınca rol kartına dokunup rolüne bak, kimse görmesin. Her dört kişiye bir vampir düşer. Bir gözcü vardır; beş kişi ve üstünde bir de doktor. Vampirler birbirini tanır, diğerleri kimin ne olduğunu bilmez.",
      },
      {
        title: "Gece",
        text: "Vampirler birlikte bir kurban seçer; seçimleri birbirine görünür. Doktor korumak istediği kişiyi seçer, ama aynı kişiyi iki gece üst üste koruyamaz. Köylülerin gece yapacağı bir şey yoktur.",
        shot: shot("vampir-gece", "Gece, vampirin ekranı: Kimi ısıracaksınız? Kurban seçilmiş", 368, 555),
      },
      {
        title: "Gözcü",
        text: "Gözcü her gece bir kişiye bakar ve onun vampir olup olmadığını öğrenir. Bunu köye ne zaman, nasıl söyleyeceğini iyi düşünmeli: vampirler gözcüyü bulursa ilk onu ısırır.",
        shot: shot("vampir-gozcu", "Gece, gözcünün ekranı: bir kişiye bakmış", 368, 555),
      },
      {
        title: "Gündüz ve oylama",
        text: "Sabah gece kimin öldüğü açıklanır (doktor koruduysa kimse ölmez). Köy konuşur ve oy verir; en çok oyu alan asılır, eşitlikte kimse asılmaz. Kimseyi asmamak için de oy verebilirsin.",
        shot: shot("vampir-gunduz", "Gündüz oylaması: ölen oyuncu, verilen oylar ve Kimseyi asma seçeneği", 368, 710),
      },
    ],
    scoring: [
      "Bütün vampirler ölürse köy kazanır.",
      "Yaşayan vampir sayısı yaşayan köylülere eşit ya da fazla olursa vampirler kazanır.",
    ],
    house: [
      "Gündüz süresi seçildiyse süre bitince verilen oylar sayılır, oy vermeyen çekimser kalır. Süresiz oyunda gün herkes oy verince biter.",
      "Ölenin rolü açıklansın ayarı kapalıysa ölenlerin rolü oyun sonuna kadar gizli kalır; tartışma zorlaşır.",
      "Masada büyücü, avcı gibi ek roller yok; oyun vampir, köylü, gözcü ve doktorla oynanır.",
    ],
    tips: [
      "Köylüysen kimin kime oy verdiğine bak. Vampirler birbirini nadiren suçlar.",
      "Vampirsen gündüz sessiz kalma; sessizlik de şüphe çeker. Bir köylüyü savunmak iyi bir örtüdür.",
      "Gözcü bir vampiri bulduysa tek gecede açıklamak yerine güvendiği birkaç kişiyle oyları toplamayı deneyebilir.",
    ],
  },
  chess: {
    lead: "İki kişilik klasik satranç. Arkadaşına ya da üç seviyeli bota karşı, istersen saatli oynanır.",
    steps: [
      {
        title: "Taşı oynat",
        text: "Taşı tutup gideceği kareye sürükle ya da önce taşa, sonra kareye dokun. Taşa dokununca gidebileceği kareler işaretlenir. Sıra kimdeyse masanın altında yazar; şah çekilirse kırmızı uyarı çıkar.",
        shot: shot("satranc-masa", "Satranç: oyuncular, saatler, tahta ve sıra bilgisi", 368, 643),
      },
      {
        title: "Özel hamleler",
        text: "Rok, geçerken alma ve piyon terfisi tam kurallarla çalışır. Piyon son sıraya varınca hangi taşa dönüşeceğini seçersin. Rok için şahı iki kare yana götürmen yeter.",
      },
      {
        title: "Hamle listesi",
        text: "Hamleler sekmesinde oynanan bütün hamleler yazar. Oklarla ya da klavyedeki sol ve sağ ok tuşlarıyla eski konumlara bakabilirsin; oyun bu sırada devam eder.",
        shot: shot("satranc-panel", "Hamle listesi ve geçmiş konumlara dönme okları", 368, 360),
      },
      {
        title: "Oyunun sonu",
        text: "Şah mat eden kazanır. Pat, üç kez aynı konum, 50 hamle kuralı ve mat edecek taş kalmaması berabere biter. Beraberlik teklif edebilir ya da pes edebilirsin. Rövanşta renkler değişir.",
      },
    ],
    scoring: [
      "Galibiyet 1, beraberlik yarım puan. Aynı odada oynanan oyunlar oyuncuların yanında toplanır.",
      "Süreli oyunda süresi biten kaybeder.",
    ],
    house: [
      "Saat beyazın ilk hamlesinden sonra işlemeye başlar.",
      "Ek süre seçildiyse her hamleden sonra oynayanın saatine eklenir.",
      "Bot seviyesi lobide seçilir; bir oyuncu çıkarsa yerine geçen bot da bu seviyede oynar.",
    ],
    tips: [
      "Açılışta merkezi piyonlarla tut, atları ve filleri erken çıkar, şahını rok ile güvene al.",
      "Her hamleden önce rakibin son hamlesinin neyi tehdit ettiğine bak.",
      "Kısa süreli oyunda saati unutma; kazanılmış oyun da süre bitince kaybedilir.",
    ],
  },
  pisti: {
    lead: "52 kartlık desteyle iki ya da dört kişi oynanır. Yerdeki kartı aynısıyla ya da valeyle alırsın; tek kartı aynısıyla alırsan pişti olur.",
    steps: [
      {
        title: "Dağıtım",
        text: "Yere dört kart konur, üçü kapalı biri açık. Herkese dört kart dağıtılır; eller bitince desteden yeniden dört kart gelir. Deste bitince el sona erer.",
        shot: shot("pisti-masa", "Pişti masası: yerdeki açık kart, destede kalan kart sayısı ve oyuncunun eli", 368, 620),
      },
      {
        title: "Kart at",
        text: "Sıra sende iken bir kartı masaya sürükle ya da iki kez dokun. Attığın kart yerdeki en üst kartla aynı sayıdaysa yerdeki bütün kartları alırsın; rengin önemi yok. Vale her zaman yerdeki kartları alır.",
      },
      {
        title: "Pişti",
        text: "Yerde tek kart varken aynısını atarsan pişti yaparsın ve 10 sayı alırsın. Yerdeki tek vale ise ve üstüne vale atarsan 20 sayı.",
      },
      {
        title: "El sonu",
        text: "Desteden kart kalmayıp eller de bitince yerde kalan kartlar en son kart alan oyuncuya gider. Sonra herkesin topladığı kartlar sayılır.",
      },
    ],
    scoring: [
      "En çok kart toplayan 3, karo 10 3, sinek 2 2, her as ve her vale 1 sayı.",
      "Pişti 10, valeye vale piştisi 20 sayı.",
      "Bir taraf seçilen sayıya (51, 101 ya da 151) ulaşınca o elin sonunda oyun biter, en yüksek sayı kazanır.",
    ],
    house: [
      "Dört kişide eşli oynanabilir: karşılıklı oturanların kartları ve sayıları birlikte sayılır.",
      "Bazı masalarda son karta yapılan pişti sayılmaz ya da vale ile yapılan alım pişti sayılmaz; bu masada pişti sadece tek karta aynı sayıyı atınca olur.",
    ],
    tips: [
      "Hangi kartların çıktığını aklında tut. Bir sayının dört kartından üçü çıktıysa sonuncusunu atmak güvenlidir, onunla kimse pişti yapamaz.",
      "Valeyi yerde çok kart birikince kullan; tek karta vale atmak boşa gider.",
      "Yerde tek kart bırakmaktan kaçın, rakibe pişti fırsatı verir.",
    ],
  },
  casus: {
    lead: "Spyfall tarzı bir sorgu oyunu. Herkes aynı gizli kelimeyi bilir, casus bilmez. Sorular ve cevaplarla casusu bulmaya, casus da kelimeyi yakalamaya çalışır.",
    steps: [
      {
        title: "Kartına bak",
        text: "Kart dosyasına dokun, kimse görmeden kelimeye bak. Casussan kelime yerine casus olduğun yazar. Birden çok casus varsa birbirlerini bilmezler. Bakınca Kartımı gördüm, hazırım'a bas.",
        shot: shot("casus-kart", "Kelimeyi bilen oyuncunun kartı: gizli kelime ve kategorisi", 368, 614),
      },
      {
        title: "Casusun kartı",
        text: "Casus kelimeyi bilmez. Kategoriyi ve Kelimeler sekmesindeki 16 kelimelik listeyi herkes gibi görür; gizli kelime o listededir.",
        shot: shot("casus-casus", "Casusun kartı: Casussun, kelimeyi bilmiyorsun", 368, 614),
      },
      {
        title: "Soru sor, cevap ver",
        text: "İlk soruyu ekranda adı yazan kişi sorar, istediği birine. Cevap veren sıradaki soruyu sorar. Sorular ve cevaplar kelimeyi bilenin anlayacağı kadar açık, casusun çözemeyeceği kadar kapalı olmalı. Casus istediği an kelimeyi listeden tahmin edebilir.",
        shot: shot("casus-sorular", "Soru turu: ilk soran, süre ve Oylamaya geçelim düğmesi", 368, 672),
      },
      {
        title: "Oylama",
        text: "Süre bitince ya da masanın yarısından fazlası Oylamaya geçelim deyince herkes şüphelendiği kişiye gizlice oy verir. Oylar herkes verince açılır. En çok oyu alan suçlanır; eşitlikte kimse suçlanmaz. Suçlanan casussa son bir şansla kelimeyi tahmin eder.",
        shot: shot("casus-oylama", "Oylama: oy verenler ve düşünenler", 368, 574),
      },
    ],
    scoring: [
      "Masa casusu yakalarsa casus olmayan herkes 1 puan alır.",
      "Casus yakalanmadan sıyrılırsa 2, kelimeyi doğru tahmin ederse 3 puan alır.",
      "Casus erken tahmin edip yanılırsa masa kazanır.",
    ],
    house: [
      "Masada mekân kartları yerine kategoriler var: Ülke, Şehir, Eşya, Aktivite, Meslek, Yemek, Hayvan, Spor, Yabancı Ünlü, Mekan ya da hepsi karışık.",
      "Casus kelimeyi yazarak değil, herkesin gördüğü 16 kelimelik listeden seçerek tahmin eder.",
      "Bir ile üç arası casus seçilebilir; soru süresi 3, 5 ya da 8 dakika ya da süresizdir.",
    ],
    tips: [
      "Kelimeyi biliyorsan çok net sorma; \"Antalya'da denize girdin mi?\" casusa cevabı verir. \"En son ne zaman gittin?\" yeter.",
      "Casussan ilk sorulara genel cevaplar ver, diğerlerinin cevaplarından listeyi daralt.",
      "Kelimeler listesinde elediğin kelimelerin üstünü çizebilirsin; bunu sadece sen görürsün.",
    ],
  },
};

/** The guide route from the URL hash: null when not on the guide, "" for the table basics. */
export function useGuideRoute(): GameId | "" | null {
  const read = (): GameId | "" | null => {
    const m = /^#rehber(?:\/(\w+))?$/.exec(location.hash);
    if (!m) return null;
    const id = m[1] as GameId | undefined;
    return id && id in GUIDES ? id : "";
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => {
      const next = read();
      pagesInGuide = next === null ? 0 : pagesInGuide + 1;
      setRoute(next);
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return route;
}

export const guideHref = (game?: GameId) => (game ? `#rehber/${game}` : "#rehber");

/** Guide pages opened by links on this page, so leaving goes back past all of them. */
let pagesInGuide = 0;

function close() {
  if (pagesInGuide > 0) return history.go(-pagesInGuide);
  // Opened straight from a link or a new tab: drop the hash and show the site.
  history.replaceState(null, "", location.pathname + location.search);
  dispatchEvent(new HashChangeEvent("hashchange"));
}

export function Guide({ game }: { game: GameId | "" }) {
  const info = game ? GAMES.find((g) => g.id === game)! : null;
  const guide = game ? GUIDES[game] : null;

  useEffect(() => {
    scrollTo(0, 0);
    document.title = info ? `${info.name} nasıl oynanır · Sosyal Oyunlar` : "Nasıl oynanır · Sosyal Oyunlar";
    return () => {
      document.title = "Sosyal Oyunlar";
    };
  }, [info]);

  return (
    <div className="guide">
      <header className="home-bar guide-bar">
        <BrandMark />
        <span className="brand">Nasıl oynanır</span>
        <span className="spacer" />
        <button className="bar-btn" onClick={close}>
          Geri dön
        </button>
      </header>

      <div className="guide-wrap">
        <nav className="guide-index" aria-label="Oyunlar">
          <a href={guideHref()} aria-current={game === "" ? "page" : undefined}>
            Masaya oturmak
          </a>
          {GAMES.map((g) => (
            <a key={g.id} href={guideHref(g.id)} aria-current={g.id === game ? "page" : undefined}>
              {g.name}
            </a>
          ))}
        </nav>

        <article className="guide-body">
          {info && guide ? (
            <>
              <div className="guide-head">
                <GameEmblem game={info.id} size={64} />
                <div>
                  <h1>{info.name}</h1>
                  <p className="guide-meta">
                    {info.playerCounts ? info.playerCounts.join(" ya da ") : info.minPlayers === info.maxPlayers ? info.minPlayers : `${info.minPlayers}–${info.maxPlayers}`} kişi
                    {info.bots ? " · bot oturtulabilir" : " · botsuz, arkadaşlarla"}
                  </p>
                </div>
              </div>
              <p className="guide-lead">{guide.lead}</p>
              <Steps steps={guide.steps} />
              <Notes title="Puanlama" items={guide.scoring} />
              <Notes title="Bu masada" items={guide.house} note="Kurallar yöreden yöreye, masadan masaya değişir. Burada bu sitenin nasıl oynadığı yazıyor." />
              <Notes title="İpuçları" items={guide.tips} />
              <GameNav current={info.id} />
            </>
          ) : (
            <>
              <div className="guide-head">
                <div>
                  <h1>Masaya oturmak</h1>
                  <p className="guide-meta">Üye olmak yok, indirmek yok</p>
                </div>
              </div>
              <p className="guide-lead">Biri oda açar, kodu gruba atar, herkes kendi telefonundan ya da bilgisayarından oturur. Oyunların kuralları için soldaki listeden birini seç.</p>
              <Steps steps={BASICS} />
              <GameNav current={null} />
            </>
          )}
        </article>
      </div>
    </div>
  );
}

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="guide-steps">
      {steps.map((s, i) => (
        <li key={s.title} className={s.shot ? "has-shot" : ""}>
          <span className="guide-num" aria-hidden>
            {i + 1}
          </span>
          <div className="guide-text">
            <h2>{s.title}</h2>
            <p>{s.text}</p>
          </div>
          {s.shot && (
            <figure className="guide-shot">
              <img src={s.shot.src} alt={s.shot.alt} width={s.shot.w} height={s.shot.h} loading="lazy" />
              <figcaption>{s.shot.alt}</figcaption>
            </figure>
          )}
        </li>
      ))}
    </ol>
  );
}

function Notes({ title, items, note }: { title: string; items: string[]; note?: string }) {
  return (
    <section className="guide-notes">
      <h2>{title}</h2>
      {note && <p className="muted small">{note}</p>}
      <ul>
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </section>
  );
}

/** Next game in the list, so the guide can be read straight through. */
function GameNav({ current }: { current: GameId | null }) {
  const i = current ? GAMES.findIndex((g) => g.id === current) : -1;
  const next = GAMES[i + 1];
  if (!next) return null;
  return (
    <a className="guide-next" href={guideHref(next.id)}>
      <span className="muted small">Sıradaki</span>
      <strong>{next.name}</strong>
    </a>
  );
}

import type { ReactNode } from "react";
import type { GameId } from "../../shared/protocol";
import { guideHref } from "./Guide";

interface Section {
  title: string;
  items: ReactNode[];
}

/** Rules as played at this table, short enough to read between turns. */
const RULES: Record<GameId, Section[]> = {
  okey: [
    {
      title: "Amaç",
      items: [
        "Elindeki 14 taşı seri ya da per gruplarına dizip 15. taşı atarak bitirmek. Ya da 7 çift yapıp bitirmek.",
        "Seri: aynı renkten art arda en az 3 taş (12-13-1 de olur). Per: aynı sayının farklı renklerinden 3 ya da 4 taş.",
      ],
    },
    {
      title: "Sıra",
      items: [
        "Ortadan ya da solundakinin attığı son taşı çek, sonra bir taş at.",
        "Göstergenin bir üstü okeydir ve her taşın yerine geçer. Sahte okey, okeyin kendisi yerine kullanılır.",
      ],
    },
    {
      title: "Puan",
      items: [
        "Normal bitiş 2 puan, çiftten ya da okey atarak bitiş 4 puan.",
        "Katlamalı oyunda herkes puanla başlar; biten oyuncu diğerlerine puan kaybettirir, sıfıra düşen olunca oyun biter.",
        "Göstergenin eşi elindeyse ilk turunda göster, puanını al.",
      ],
    },
  ],
  okey101: [
    {
      title: "Amaç",
      items: ["Elini açıp masaya işleyerek ilk bitiren olmak. En az ceza puanı toplayan kazanır."],
    },
    {
      title: "Açmak",
      items: [
        "Seri ve perlerin toplamı en az 101 sayı ise elini açabilirsin. Ya da en az 5 çiftle çiftten açarsın.",
        "101'de 12-13-1 serisi geçmez.",
        "Yandan aldığın taşı o el içinde kullanman gerekir; kullanmayacaksan geri koy.",
      ],
    },
    {
      title: "İşlemek",
      items: ["Açtıktan sonra masadaki serilerin ve perlerin ucuna taş ekleyebilirsin. Çiftlere işlenmez."],
    },
    {
      title: "Ceza",
      items: [
        "Bitiren -101 alır. Açmayan 202 ceza yer, açanlar elinde kalan taşların toplamını yazar.",
        "Çiftten ya da okeyle bitişte cezalar iki katına çıkar.",
      ],
    },
  ],
  tabu: [
    {
      title: "Akış",
      items: ["İki takım sırayla anlatır. Her turda takımdan bir kişi anlatıcı olur.", "Kartı anlatıcı ve rakip takım görür, anlatıcının takımı tahmin eder."],
    },
    {
      title: "Yasaklar",
      items: [
        "Kelimenin kendisi, yasaklı kelimeler ve bunların parçaları söylenemez. El kol hareketi ve ses taklidi yok.",
        "Rakip takım yasaklı kelimeyi duyunca Tabu düğmesine basar.",
      ],
    },
    {
      title: "Puan",
      items: ["Doğru tahmin +1, Tabu -1. Pas puan kaybettirmez ama pas hakkı sınırlıdır."],
    },
  ],
  vampir: [
    {
      title: "Roller",
      items: [
        "Her 4 kişiye bir vampir düşer. Bir gözcü vardır, 5 kişi ve üstünde bir de doktor.",
        "Vampirler birbirini tanır. Kimse başkasının rolünü bilmez.",
      ],
    },
    {
      title: "Gece",
      items: [
        "Vampirler birlikte bir kurban seçer. Doktor birini korur ama aynı kişiyi iki gece üst üste koruyamaz. Gözcü birinin vampir olup olmadığını öğrenir.",
      ],
    },
    {
      title: "Gündüz",
      items: [
        "Köy tartışır ve oylar. En çok oyu alan asılır; eşitlikte kimse asılmaz.",
        "Süre açıksa süre bitince verilen oylar sayılır, oy vermeyenler çekimser sayılır.",
      ],
    },
    {
      title: "Kazanan",
      items: ["Bütün vampirler ölürse köy kazanır. Vampirler köylülere eşit ya da fazla olursa vampirler kazanır."],
    },
  ],
  chess: [
    {
      title: "Oyun",
      items: [
        "Tam satranç kuralları: rok, geçerken alma, piyon terfisi, şah mat ve pat.",
        "Üç kez aynı konum, 50 hamle kuralı ve mat edecek taş kalmaması berabere biter.",
      ],
    },
    {
      title: "Saat",
      items: ["Süreli oyunda saat beyazın ilk hamlesinden sonra işler. Süresi biten kaybeder.", "Ek süre açıksa her hamleden sonra saatine eklenir."],
    },
    {
      title: "Masada",
      items: [
        "Taşı sürükle ya da önce taşa sonra kareye dokun. Geçmiş hamlelere dönmek için hamle listesindeki oklara bas.",
        "Beraberlik teklif edebilir, pes edebilirsin. Rövanşta renkler değişir.",
      ],
    },
  ],
  pisti: [
    {
      title: "Akış",
      items: [
        "Herkese 4 kart dağıtılır, yere 4 kart açılır (üçü kapalı). Eller bitince yeniden dağıtılır.",
        "Yerdeki en üstteki kartla aynı kartı atarsan yerdeki bütün kartları alırsın. Vale her zaman alır.",
      ],
    },
    {
      title: "Pişti",
      items: [
        "Yerde tek kart varken aynısını atarsan pişti: 10 sayı. Tek valeye vale atarsan 20 sayı.",
        "El sonunda yerde kalan kartlar en son alan oyuncuya gider.",
      ],
    },
    {
      title: "Sayılar",
      items: ["Kartların çoğu 3, karo 10 3, sinek 2 2, her as ve vale 1 sayı.", "4 kişide eşli oynanırsa karşılıklı oturanların puanı birlikte sayılır."],
    },
  ],
  batak: [
    {
      title: "Dağıtım",
      items: [
        "Dört kişiye 13'er kart dağıtılır. As en büyük, 2 en küçük karttır.",
        "Tekli ya da eşli oynanır; eşlide karşılıklı oturanların aldığı eller birlikte sayılır.",
      ],
    },
    {
      title: "İhaleli",
      items: [
        "Dağıtanın solundan başlayarak herkes kaç el alacağını söyleyerek ihaleyi yükseltir ya da pas geçer. Pas geçen o elde bir daha ihale veremez.",
        "En az ihale tekli 4, eşli 7. Herkes pas geçerse ihale en az sayıyla dağıtana kalır.",
        "İhaleyi alan kozu seçer ve ilk kartı o atar.",
      ],
    },
    {
      title: "Koz maça",
      items: ["Koz hep maçadır, ihale yoktur. Herkes sırayla kaç el alacağını söyler (en az 1), ilk kartı dağıtanın solundaki atar."],
    },
    {
      title: "Kart atma",
      items: [
        "Yerdeki renge uymak zorundasın; yerdekini geçebiliyorsan yükseltmek de zorunlu.",
        "O renk elinde yoksa koz atmalısın; yerde koz varsa geçebiliyorsan geçmelisin. Kozun da yoksa istediğini atarsın.",
        "Koz, biri koz atana kadar ilk kart olarak açılamaz (elinde sadece koz kalmadıysa).",
        "Eli en büyük koz, koz yoksa yerdeki rengin en büyüğü alır. Eli alan sonraki eli başlatır.",
      ],
    },
    {
      title: "Puan",
      items: [
        "İhaleli: ihaleyi çıkaran aldığı el kadar yazar, çıkaramayan (batan) ihalesi kadar eksi yazar. Diğerleri aldıkları el kadar yazar.",
        "Koz maça: sözünü tutan aldığı el kadar, tutamayan sözü kadar eksi yazar.",
        "Seçilen el sayısı bitince en çok puanı olan kazanır.",
      ],
    },
  ],
  casus: [
    {
      title: "Kartlar",
      items: [
        "Her turda herkese aynı gizli kelime gelir, casusa gelmez. Casus sadece casus olduğunu öğrenir.",
        "Kategori seçildiyse kelime o kategoriden gelir. Birden çok casus varsa birbirlerini bilmezler.",
      ],
    },
    {
      title: "Sorular",
      items: [
        "İlk soruyu ekranda yazan kişi sorar, istediği birine. Cevap veren, sıradaki soruyu sorar.",
        "Sorular ve cevaplar kelimeyi bilen birinin anlayacağı kadar açık, casusun çözemeyeceği kadar kapalı olmalı.",
        "Casus istediği an kelimeyi listeden tahmin edebilir: bilirse kazanır, yanılırsa masa kazanır.",
      ],
    },
    {
      title: "Oylama",
      items: [
        "Süre bitince ya da masanın yarısından fazlası isteyince oylama başlar. Herkes şüphelendiği kişiye gizlice oy verir.",
        "En çok oyu alan suçlanır, eşitlikte kimse suçlanmaz. Suçlanan casussa son bir şansla kelimeyi tahmin eder.",
      ],
    },
    {
      title: "Puan",
      items: ["Masa kazanırsa casus olmayan herkes 1 puan alır. Casus sıyrılırsa 2, kelimeyi bilirse 3 puan alır."],
    },
  ],
};

export function Rules({ game }: { game: GameId }) {
  return (
    <div className="rules">
      {RULES[game].map((s) => (
        <section key={s.title}>
          <h4>{s.title}</h4>
          <ul>
            {s.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
      <p className="rules-guide">
        {/* A new tab, so the game keeps running while the guide is open. */}
        <a className="text-link" href={guideHref(game)} target="_blank" rel="noopener">
          Ekran görüntüleriyle anlatım
        </a>
      </p>
    </div>
  );
}

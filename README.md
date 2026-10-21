# Sosyal Oyunlar

Arkadaşlarla aynı odada oynanan grup oyunları platformu. Biri oda açar, 4 haneli kodu ya da davet linkini paylaşır, herkes telefonundan ya da bilgisayarından katılır.

## Oyunlar

| Oyun | Oyuncu | Kısaca |
| --- | --- | --- |
| Tabu | 4-16 | İki takım. Anlatıcı ve rakip takım kartı görür, anlatıcının takımı tahmin eder. Doğru +1, Tabu -1, tur başına 3 pas. |
| Vampir Köylü | 4-16 | Her 4 kişiye 1 vampir, 1 gözcü, 5+ kişide 1 doktor. Gece vampirler ısırır, doktor korur, gözcü bakar; gündüz herkes oylar. |
| Okey | 4 | 106 taş, gösterge ve okey. Seri/per ya da 7 çift ile bitir. Normal bitiş +2, çiftten ya da okey atarak bitiş +4. |
| 101 Okey | 4 | 101 sayıyla ya da 5 çiftle el aç, masadaki gruplara işle. Yandan alınan taş o el kullanılmalı. Bitiren -101, açmayan 202 ceza, açanlar elde kalan taşların toplamı. Çiftten ya da okeyle bitişte cezalar 2 katı. Az puan kazanır. |
| Pişti | 2 ya da 4 | Yerdeki üst kartla aynı kartı ya da vale atan yerdeki kartları alır. Tek karta aynısı pişti (10), valeye vale 20. El sonunda kartların çoğu 3, karo 10 3, sinek 2 2, her as ve vale 1. 4 kişide eşli oynanabilir. |

## Geliştirme

```bash
npm install
npm run dev        # sunucu :3001, arayüz :5173
npm test           # oyun kuralları testleri
npm run typecheck
```

- `server/`: Node + Express + Socket.IO. Tüm oyun kuralları ve gizli bilgiler (eller, roller) sunucuda tutulur; her oyuncuya sadece görmesi gereken gönderilir.
- `client/`: React + Vite arayüz.
- `shared/`: İki tarafın ortak kullandığı tipler.

Yeni oyun eklemek için `server/src/games/` altına `GameDefinition` uygulayan bir modül, `shared/games/` altına görünüm tipleri, `client/src/games/` altına ekranı ekleyip `shared/protocol.ts` içindeki `GAMES` listesine kaydet.

## Yayına alma (Render, ücretsiz)

1. [render.com](https://render.com) üzerinde GitHub hesabınla giriş yap.
2. **New → Blueprint** seç ve bu depoyu bağla. `render.yaml` her şeyi ayarlar.
3. Kurulum bitince verilen `https://socialgames-xxxx.onrender.com` adresini arkadaşlarınla paylaş.

Ücretsiz planda sunucu 15 dakika boş kalınca uyur; ilk giriş yaklaşık bir dakika sürebilir. Odalar bellekte tutulduğu için sunucu yeniden başlarsa açık odalar kapanır.

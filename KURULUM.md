# Kasaba Meydanı

Kasaba Meydanı, [bra1n/townsquare](https://github.com/bra1n/townsquare) projesinin topluluk yapımı, ücretsiz bir çatalıdır (GPL-3.0). The Pandemonium Institute ile bağlantılı değildir. Topluluk içeriği politikası gereği uygulama ücretsiz kalmalı ve uygulama mağazalarında yayınlanmamalıdır; bu yüzden PWA olarak dağıtılır.

Özgün projeye eklenenler:

- **Tek süreçli sunucu:** Site ve canlı oyun bağlantısı (WebSocket) aynı adresten, aynı porttan çalışır.
- **Türkçe arayüz:** Menü → Grimuar sekmesi → *Dil* ile Türkçe/İngilizce arasında geçiş yapılır. Tarayıcı dili Türkçeyse varsayılan olarak Türkçe açılır.
- **Güncel karakterler:** Resmî toolmaker kaynaklarından 38 yeni karakter (Loric dahil), 27 jinx seti ve resmî gece sırası.
- **Ev yapımı karakter düzenleyici:** Menü → Karakterler → *Ev yapımı karakterler*. Burada karakter oluşturup görsel yükleyebilir ve gece sırasını seçebilirsiniz. Karakterleri senaryoya eklediğinizde canlı oturumdaki oyunculara otomatik gider.
- **Tam Türkçe karakterler:** 182 karakterin adı, yeteneği, hatırlatıcı jetonları ve gece notları, ayrıca 131 jinx Türkçeye çevrildi (`src/locales/roles.tr.json`, `src/locales/jinxes.tr.json`). Menüden İngilizce seçildiğinde karakterler de İngilizceye döner.
- **Uygulama olarak kurulum (PWA):** Telefonda "Ana ekrana ekle" ile uygulama gibi kurulur ve internet yokken de açılır. Ana ekran ikonuna basılı tutunca *Oyun aç*, *Katıl*, *Karakterler* ve *Gece* kısayolları çıkar.
- **Jeton efektleri:** Rol açılınca dönme, ölümde kırmızı parlama, adayda kırmızı nabız, aday gösterende mavi, el kaldıranda altın halka. Cihazda "hareketi azalt" ayarı açıksa efektler gösterilmez.
- **Gizlilik ve güvenlik:** Sunucu, rol dağıtımı gibi oyun mesajlarını loglara yazmaz. Mesaj boyutu ve kanal doluluğu sınırlıdır, kanal adları da doğrulanır.

## Render'a kurulum (ücretsiz)

1. [render.com](https://render.com) adresinde GitHub hesabınızla oturum açın.
2. **New → Blueprint** seçin ve `townsquare` deposunu bağlayın. Render, depodaki `render.yaml` dosyasını okuyarak her şeyi kendisi ayarlar.
3. **Apply** deyin. İlk derleme birkaç dakika sürer, ardından `https://townsquare-xxxx.onrender.com` gibi bir adres alırsınız.

Ücretsiz planda sunucu 15 dakika boyunca hiç trafik almazsa uyur. Uyuyan sunucunun yeniden açılması yaklaşık 1 dakika sürer, bu yüzden oyundan birkaç dakika önce siteyi açın. Oyun sırasında uygulama her 30 saniyede bir ping gönderdiği için sunucu uyumaz. Render ücretsiz sunucuları ara sıra yeniden başlatabilir. Böyle bir durumda bağlantı birkaç saniye içinde kendiliğinden yenilenir ve oyun durumu Anlatıcı'nın tarayıcısında saklandığı için kaybolmaz.

Depoya her push yapıldığında Render siteyi otomatik olarak yeniden yayınlar.

### Kendi alan adınız

Render panelinde **Settings → Custom Domains** kısmından alan adınızı ekleyin. Site başka bir adresten açılacaksa (örneğin GitHub Pages), o adresi `ALLOWED_ORIGINS` ortam değişkenine yazın: `oyun.ornek.com,ornek.github.io`.

## Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PORT` | `8080` | Dinlenecek port (Render bunu kendisi ayarlar) |
| `ALLOWED_ORIGINS` | boş | Canlı sunucuya bağlanabilecek ek alan adları (virgülle) |
| `METRICS_TOKEN` | boş | `/metrics?token=...` uç noktasını korur |
| `LOG_MESSAGES` | `false` | `true` yapılırsa oyun mesajları loglanır (roller dahil!) |
| `MAX_PAYLOAD` | `1048576` | Tek bir mesajın en fazla boyutu (bayt) |
| `MAX_PER_CHANNEL` | `40` | Bir kanala bağlanabilecek en fazla kişi sayısı |
| `TLS_CERT` / `TLS_KEY` | `cert.pem` / `key.pem` | Dosyalar varsa sunucu HTTPS ile çalışır (VPS için) |

`/healthz` adresi sunucunun durumunu ve anlık oyuncu sayısını gösterir.

## Yerelde çalıştırma

```bash
npm ci
npm run build
node server/index.js      # http://localhost:8080
```

Geliştirme sırasında: `npm run serve` arayüzü 8081'de açar. Ayrı bir terminalde `node server/index.js` çalıştırdığınızda canlı oturum 8080'e bağlanır.

## Docker / VPS

```bash
docker build -t townsquare .
docker run -d -p 8080:8080 --restart unless-stopped townsquare
```

Önüne Caddy koyarsanız HTTPS otomatik olarak gelir: `oyun.ornek.com { reverse_proxy localhost:8080 }`

## Karakterleri güncelleme

Yeni resmî karakterler çıktığında şu komutları çalıştırın:

```bash
git clone --depth 1 https://github.com/ThePandemoniumInstitute/botc-release.git /tmp/botc-release
node scripts/update-roles.js /tmp/botc-release/resources
```

Betik eksik ikonları listeler. Bu ikonlar `/tmp/botc-release/resources/characters/` klasöründen WebP'ye çevrilip `src/assets/icons/` klasörüne konmalıdır.

## Çeviri

- Arayüz metinleri `src/locales/tr.json` dosyasındadır. Anahtar İngilizce metin, değer ise Türkçe karşılığıdır.
- Karakterler `src/locales/roles.tr.json` dosyasındadır ve karakter kimliğiyle eşleşir. Gece notlarındaki `*BÜYÜK HARF*` ifadeleri hatırlatıcı jetonlarını, `[hatırlatıcı]` ise jeton koyulacak yeri gösterir.
- Jinx'ler `src/locales/jinxes.tr.json` dosyasındadır ve `karakter1|karakter2` anahtarıyla eşleşir.

`scripts/update-roles.js` ile yeni karakterler eklendiğinde, onlar için `roles.tr.json` dosyasına da çeviri eklenmelidir; eklenmezse karakter İngilizce görünür.

## Nasıl oynanır (Vampir Köylü)

1. Ana sayfada adını yaz ve **Oda kur**'a dokun:
   - **🤖 Uygulama anlatsın:** gece, oylama ve sonuç otomatik ilerler. Sen de oynarsın.
   - **🎙️ Ben anlatıcıyım:** sen oynamazsın; bütün rolleri ve gece seçimlerini görürsün, oyunu *Geceyi başlat / Sabahı getir / Oylamayı bitir* düğmeleriyle ilerletirsin, gerekirse oyuncuyu öldürüp diriltirsin.
2. 4 harfli oda kodunu ya da davet linkini arkadaşlarına gönder. Onlar adını yazıp **Katıl**'a dokunur.
3. Oda sahibi **Oyunu başlat**'a dokunur. Herkes kendi rolünü telefonunda görür: 🧛 Vampir, 🩺 Doktor, 👁️ Gözcü, 🧑‍🌾 Köylü.
4. 🌙 Gece: vampirler birlikte kurban seçer, Doktor birini korur, Gözcü birinin vampir olup olmadığını öğrenir. Köylüler de iz bırakmamak için birini seçer (etkisi yok).
5. ☀️ Gündüz: gece ölen açıklanır, herkes oy verir. En çok oyu alan asılır, eşitlikte kimse asılmaz. Ölenlerin rolü açıklanır.
6. Bütün vampirler ölürse köylüler, vampirler köylü sayısına ulaşırsa vampirler kazanır.

Bildirim için: iPhone'da Safari → Paylaş → *Ana Ekrana Ekle*, uygulamayı oradan aç, ⚙️ → Bildirimler. Sesli anlatım da ⚙️ menüsünde.

## Kalıcılık ve istatistikler

Odaların güncelleme/yeniden başlatmalarda kaybolmaması, profiller ve sıralama için sunucu
Supabase'deki `vampir` şemasını kullanır. Render → townsquare → **Environment** bölümüne
`VK_DB_SECRET` değişkeni eklenmelidir (değeri geliştiriciden alınır, kimseyle paylaşılmaz).
Değişken yoksa oyun yine çalışır; sadece odalar bellekte tutulur ve istatistik kaydedilmez.

Sunucu ücretsiz planda uyumasın diye 10:00–02:00 (İstanbul) arasında kendini uyanık tutar.
`KEEP_AWAKE=false` ile kapatılabilir, `AWAKE_FROM` / `AWAKE_TO` ile saatler değiştirilebilir.

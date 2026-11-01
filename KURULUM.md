# Kendi Townsquare sunucunuz

Bu fork, [bra1n/townsquare](https://github.com/bra1n/townsquare) üzerine şunları ekler:

- **Tek süreçli sunucu:** Site ve canlı oyun bağlantısı (WebSocket) aynı adresten, aynı porttan çalışır.
- **Türkçe arayüz:** Menü → Grimuar sekmesi → *Dil* ile Türkçe/İngilizce arasında geçiş yapılır. Tarayıcı dili Türkçeyse varsayılan olarak Türkçe açılır.
- **Güncel karakterler:** Resmî toolmaker kaynaklarından 38 yeni karakter (Loric dahil), 27 jinx seti ve resmî gece sırası.
- **Ev yapımı karakter düzenleyici:** Menü → Karakterler → *Ev yapımı karakterler*. Burada karakter oluşturup görsel yükleyebilir ve gece sırasını seçebilirsiniz. Karakterleri senaryoya eklediğinizde canlı oturumdaki oyunculara otomatik gider.
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

Betik eksik ikonları listeler. Bu ikonlar `/tmp/botc-release/resources/characters/` klasöründen PNG'ye çevrilip `src/assets/icons/` klasörüne konmalıdır.

## Çeviri

Arayüz metinleri `src/locales/tr.json` dosyasındadır. Anahtar İngilizce metin, değer ise Türkçe karşılığıdır. Çevirisi olmayan metinler İngilizce görünür. Karakter adları ve yetenek metinleri şimdilik resmî İngilizce hâlleriyle duruyor.

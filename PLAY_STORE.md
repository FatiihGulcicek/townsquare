# Vampir Köylü'yü Google Play'e koymak

Oyun zaten bir PWA (ana ekrana eklenebilen web uygulaması). Play Store için
bunu **TWA** (Trusted Web Activity) denen ince bir Android kabuğuna sararız:
uygulama açılınca tarayıcı çubuğu olmadan doğrudan siteyi gösterir. Siteye
yaptığımız her güncelleme uygulamaya da anında gelir; mağazaya tekrar
yüklemek gerekmez.

## Gerekenler

- Google Play geliştirici hesabı: tek seferlik **25 USD**
  (https://play.google.com/console/signup)
- Bir Android telefon (test için)
- **12 test kullanıcısı** (aşağıya bak)

## 1. Android paketini oluştur (PWABuilder, kod yazmadan)

1. https://www.pwabuilder.com adresine git, sitenin adresini yaz
   (`https://darkspire.co`) →
   **Start**.
2. **Package For Stores → Android → Generate Package**.
3. Ayarlar:
   - **Package ID:** `com.vampirkoylu.app` (bir kez seçilir, sonra değişmez)
   - **App name:** Vampir Köylü
   - **Signing key:** *Create new* (PWABuilder senin için anahtar üretir)
4. İndirilen zip'te şunlar olur:
   - `app-release-bundle.aab` → Play'e yüklenecek dosya
   - `signing.keystore` ve `signing-key-info.txt` → **bunları kaybetme!**
     Güncelleme için aynı anahtar gerekir. Google Drive'da güvenli bir
     klasöre koy.
   - `assetlinks.json` → içindeki `sha256_cert_fingerprints` değeri lazım.

## 2. Siteyi uygulamaya bağla (cPanel)

cPanel → **Setup Node.js App** → uygulama → **Environment variables** → şu iki
değişkeni ekle, sonra **Run JS script → restart**:

| Anahtar | Değer |
| --- | --- |
| `TWA_PACKAGE` | `com.vampirkoylu.app` |
| `TWA_SHA256` | assetlinks.json'daki parmak izi (`AB:CD:...`) |

Play Console'da **Play App Signing** açıkken Google kendi anahtarıyla da
imzalar: Console → *Test and release → App integrity → App signing* sayfasındaki
**SHA-256** parmak izini de virgülle ekle:
`TWA_SHA256 = PWABUILDER_PARMAK_IZI,GOOGLE_PARMAK_IZI`

Kontrol: `https://SITEN/.well-known/assetlinks.json` adresi JSON göstermeli.
Bu yoksa uygulama açılınca üstte adres çubuğu görünür.

## 3. Play Console

1. **Create app** → ad: Vampir Köylü, dil: Türkçe, *Game*, *Free*.
2. Mağaza kaydı:
   - Kısa açıklama (80 karakter): *Arkadaşlarınla telefondan Vampir Köylü
     oyna: otomatik anlatıcı, sesli sohbet.*
   - Uygulama simgesi 512×512: `public/static/icon-512.png`
   - Telefon ekran görüntüleri: en az 2 tane (oyundan ekran görüntüsü al).
   - Öne çıkan görsel 1024×500.
3. **App content** formları: gizlilik politikası adresi (bir Google Doc yeterli),
   reklam yok, içerik derecelendirme anketi, hedef yaş (13+ önerilir: sohbet
   var), veri güvenliği (ad, profil fotoğrafı ve sohbet sunucuda geçici
   tutuluyor; satılmıyor).

## 4. 12 test kullanıcısı kuralı (yeni kişisel hesaplar)

13 Kasım 2023'ten sonra açılan **kişisel** hesaplar, uygulamayı herkese
açmadan önce **kapalı test** yapmak zorunda: **en az 12 kişi, kesintisiz
14 gün** testte kalmalı. Şirket hesabı (D-U-N-S numarası gerekir) bu kuraldan
muaf.

1. *Test and release → Closed testing* → yeni bir parça oluştur, `.aab`
   dosyasını yükle.
2. Test kullanıcıları: arkadaşlarının Gmail adreslerini ekle (Google Grubu da
   olur). Onlara katılım linkini gönder; linke tıklayıp **testçi olun** ve
   Play'den indirsinler.
3. 14 gün boyunca oyunu gerçekten oynasınlar (Google etkileşime de bakıyor).
   Oyun zaten arkadaş grubuyla oynandığı için bu kolay.
4. 14 gün dolunca **Apply for production** → birkaç gün içinde onay →
   **Production**'a yükle.

Toplam süre: kabaca 3 hafta.

## Güncellemeler

Oyunun kendisi web'de olduğu için her güncelleme GitHub'a gönderilince
otomatik gelir. Play'e yeni paket yalnızca simge, ad veya paket ayarları
değişirse gerekir (aynı `signing.keystore` ile, sürüm numarasını artırarak).

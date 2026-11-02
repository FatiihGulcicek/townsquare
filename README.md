# Vampir Köylü · Kasaba Meydanı

Arkadaşlarınla telefondan oynanan Vampir Köylü: otomatik veya insan
anlatıcı, özel roller, sesli/görüntülü sohbet, bildirimler, profil ve
sıralama, Türkçe/İngilizce arayüz. Canlı: **https://darkspire.co**

- `src/` Vue 2 arayüzü (`src/i18n` İngilizce çeviriler)
- `server/` Node.js sunucu: oyun motoru (`vk.js`), botlar, meydan (`lobby.js`),
  MySQL (`db.js`), bildirimler, kendini güncelleme (`updater.js`)
- `public/` PWA dosyaları, ikonlar ve logo

Geliştirme: `npm install`, `npm run build`, `node server/index.js`
(http://localhost:8080). Yayınlama ve sunucu ayarları: `CPANEL.md`.
Mağazalar: `MAGAZA.md`.

Bu proje [bra1n/townsquare](https://github.com/bra1n/townsquare) üzerinden
geliştirilmiştir ve GPL-3.0 lisanslıdır (bkz. `LICENSE`).

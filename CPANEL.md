# Vampir Köylü · cPanel kurulumu (darkspire.co)

Bu dal (`cpanel`) derlenmiş, çalışmaya hazır sürümdür. Derleme gerekmez.

## Kurulum
1. **Veritabanı** (Manage My Databases): `darkspire_vampir` veritabanı ve
   `darkspire_vampir` kullanıcısı, ALL PRIVILEGES. Tablolar ilk açılışta
   kendiliğinden oluşur (phpMyAdmin'de `vk_` ile başlayanlar).
2. **Git™ Version Control** → Clone: `https://github.com/FatiihGulcicek/townsquare.git`,
   yol `/home/darkspire/vampir`, dal `cpanel`.
3. **Setup Node.js App** → Create Application:
   - Node.js sürümü: 20 veya üstü · Mode: Production
   - Application root: `vampir` · URL: `darkspire.co` · Startup file: `app.js`
   - Environment variables:
     | Ad | Değer |
     | --- | --- |
     | `DB_NAME` | `darkspire_vampir` |
     | `DB_USER` | `darkspire_vampir` |
     | `DB_PASS` | veritabanı kullanıcısının şifresi |
     | `PUBLIC_URL` | `https://darkspire.co` |
     | `PUSH_SECRET` | rastgele uzun bir metin (bildirim anahtarları için, değiştirme) |
   - **Run NPM Install** → **Restart**.
4. Kontrol: `https://darkspire.co/healthz` → `"db":{"enabled":true,"kind":"mysql","ready":true}`.

## Güncelleme (otomatik)
Sunucu her 2 dakikada bir GitHub'daki `cpanel` dalını kontrol eder. Yeni
sürüm varsa kendisi çeker, gerekirse paketleri kurar ve oyun oynanmıyorken
yeniden başlar (en geç 20 dk). Oyuncular odalarına otomatik geri bağlanır.
Durum: `https://darkspire.co/healthz` → `updater`.

Ortam değişkeni ekleyip değiştirince: Setup Node.js App → **Run JS script** →
`restart`.

## Kayıtlar (phpMyAdmin)
- `vk_profiles`: oyuncular (ad, oyun, galibiyet, rol istatistikleri)
- `vk_games`, `vk_game_players`: biten oyunlar
- `vk_rooms`: açık odalar (sunucu yeniden başlarsa oyunlar kaldığı yerden devam eder)

## Ses/görüntü için aktarma sunucusu (TURN, isteğe bağlı)
Bazı mobil operatörler telefonların birbirine doğrudan bağlanmasını engeller;
o zaman sesli/kameralı sohbet bazı kişiler arasında kurulamaz. Ücretsiz bir
TURN hesabı bunu çözer:

1. https://www.metered.ca/stun-turn adresinden ücretsiz hesap aç.
2. Setup Node.js App → Environment variables'a ekle: `TURN_URL` (virgülle
   birden fazla olabilir), `TURN_USERNAME`, `TURN_CREDENTIAL`.
3. SAVE, sonra **Run JS script → restart**.

## Tüm ayarlar
| Ad | Ne işe yarar |
| --- | --- |
| `DB_NAME`, `DB_USER`, `DB_PASS` | MySQL bağlantısı (`DB_HOST` varsayılan `localhost`) |
| `PUBLIC_URL` | sitenin adresi (`https://darkspire.co`) |
| `PUSH_SECRET` | bildirim anahtarı; değişirse herkes bildirimleri yeniden açmalı |
| `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` | isteğe bağlı aktarma sunucusu |
| `AUTO_UPDATE` | `0` yazılırsa otomatik güncelleme kapanır |
| `MAX_ROOMS` | aynı anda en fazla oda (varsayılan 200) |

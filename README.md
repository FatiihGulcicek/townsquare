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

## Güncelleme
Geliştirici `./deploy-cpanel.sh` çalıştırınca bu dal güncellenir. cPanel'de
**Git Version Control → Manage → Pull or Deploy → Update from Remote**, sonra
**Setup Node.js App → Restart**.

## Kayıtlar (phpMyAdmin)
- `vk_profiles`: oyuncular (ad, oyun, galibiyet, rol istatistikleri)
- `vk_games`, `vk_game_players`: biten oyunlar
- `vk_rooms`: açık odalar (sunucu yeniden başlarsa oyunlar kaldığı yerden devam eder)

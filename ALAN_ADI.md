# Kendi alan adını bağlamak (ör. vampirkoylu.com)

Şu an oyun `townsquare-jqei.onrender.com` adresinde. Kendi adresin olursa
hatırlanması kolay olur, Play Store paketi de ona bağlanır.

## 1. Alan adı al

Herhangi bir firmadan alabilirsin (Cloudflare, Namecheap, GoDaddy, Natro,
İsimtescil…). `.com` yılda yaklaşık 10–15 USD. `.com.tr` belge istemeden de
alınabiliyor. Cloudflare Registrar ek ücret koymadığı için genelde en ucuzu.

## 2. Render'a ekle

Render → townsquare servisi → **Settings → Custom Domains → Add Custom
Domain** → `vampirkoylu.com` yaz. Render `www.vampirkoylu.com`'u da kendisi
ekler ve birini diğerine yönlendirir.

## 3. DNS kayıtları

Alan adını aldığın firmanın DNS panelinde:

| Tür | Ad (Host) | Değer |
| --- | --- | --- |
| `A` | `@` (kök) | `216.24.57.1` |
| `CNAME` | `www` | `townsquare-jqei.onrender.com` |

- Firman **ALIAS / ANAME / CNAME flattening** destekliyorsa kökü de A yerine
  `townsquare-jqei.onrender.com`'a böyle yönlendirmek daha iyidir.
- Varsa alan adındaki **AAAA** kayıtlarını sil (Render IPv4 kullanıyor).
- **Cloudflare** kullanıyorsan bu iki kaydın bulutunu **gri (DNS only)** yap;
  turuncu proxy WebSocket ve sertifika doğrulamasını bozabilir.

## 4. Doğrula

Render'da **Verify**'a bas. DNS yayılması birkaç dakika ile birkaç saat
sürer. Onaydan sonra Render ücretsiz HTTPS sertifikasını kendisi kurar.
Hemen ardından kısa bir süre "502" görürsen birkaç dakika bekle.

## 5. Sonra

- Oyunda değişiklik gerekmez: davet linkleri, QR kod ve bildirimler hangi
  adresten açıldıysa onu kullanır.
- Eski `onrender.com` adresi de çalışmaya devam eder. Telefonuna ana ekrana
  eklediysen yeni adresi açıp tekrar ekle (bildirim izni adres başınadır).
- Play Store paketini (bkz. `PLAY_STORE.md`) yeni adresle oluştur.

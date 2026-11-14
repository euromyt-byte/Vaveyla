# Node.js yapısı

```text
src/main.js → App
  HTTP 8080         → http.js → hesap / yönetim / oyun API / varlıklar
  Wartune WS 8081   → Session → Wire + protobuf → Battle + Game
  JSON WS 8765     → auth / karakter / Game
                               ↓
                         Store → SQLite
```

`wire.js` paket başlığını, toplamı, kayan anahtar durumunu ve girişteki anahtar sıfırlamasını yönetir. `pb.js` 141 çıkarılmış protobuf şemasını int64 hassasiyetini koruyarak kodlar/çözer. `session.js` giriş durum makinesini ve komut yönlendirmesini uygular. İstemci oyununun JavaScript ile yazılmış olması tek başına protokol uyumluluğunu sağlamaz; bu iki katmanın eşleşmesi gerekir.

`battle.js` her saldırı, beceri, ara verme ve sonucu SQLite revizyonuyla kaydeder. Yeni bağlantı mevcut revizyonu devralınca eski bağlantı yazamaz. HP sıfırlanmadan zafer üretilmez; sonuç, kill fact ve ödül aynı SQLite işlemindedir. Savaş başına kazançla bölümü tamamlama kazancı ayrı tekil olay kimlikleri kullanır.

`game.js` ortak işlem sınırını, ödül ve istek tekrarını sağlar. Şehir/asker/beceri/envanter/görev/sosyal kurallar `rules-*.js` içindedir. İş kuralları kaynaktaki açılma koşullarını korur; tüm sahneler düşük seviyede koşulsuz açılmaz.

`store.js` mevcut Python şeması/saltlı parola biçimi ile uyumludur. Node.js dış SQLite eklentisi derlemez. Önce şema kontrol edilir, mevcut kayıtlar yedeklenir ve ek tablolar kurulur. Bilinmeyen şemalar sessizce dönüştürülmez.

`assets.js` version.zip içindeki logical/published adları çözer; hazırlanmış klasör dışındaki yedek/veritabanı dosyaları HTTP üzerinden sunulmaz. İkinci varlık kökünde yalnızca `res/` yolları aranır. Bundle düzeltmeleri doğrulanmış SHA256 üzerinde HTTP belleğinde uygulanır; asıl istemci dosyası korunur.

Bu proje eski Python sunucusunu çağırmaz ve sunucu başlatmak için sızdırılmış resmî sunucu dosyaları gerektirmez. Görev/karakter/tablolar kullanıcı tarafından sağlanan istemciden çıkarılan sabit veriler ve önceki VAVEYLA davranışıyla yürütülür. Resmî sunucu formülleri olarak sunulmaz.

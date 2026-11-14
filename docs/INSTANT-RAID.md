# Beklemesiz normal bölüm baskını

Normal bölüm baskınına ait yerel 60 saniyelik bekleme kaldırılmıştır.
Başlat isteği aynı SQLite işlemi içinde tüm tekrarları tamamlar; altın ve
enerji maliyeti bir kez alınır, her tekrarın kaynak EXP/eşyası bir kez verilir.
İlk savaşla temizleme koşulu, seviye ve kaynak denetimleri korunur.
Çanta doluysa mevcut posta taşması kullanılır.

Eski running kayıtları ilk bilgi/sonuç/başlat/Onayla isteğinde süreye
bakılmadan tamamlanır. Daha önce ödülü verilen tekrarlar atlanır. Tamamlanmış
kayıtlara geriye dönük eşya eklenmez. Hızlandırma isteği elmas harcatmaz;
sonuç tamamlandığı için Kapat/Onayla maliyet iadesi yapmaz.

İstemciye4425 status11 ile bitmiş sonuç gönderilir. Tanınan bundle'ın bellek
yaması bu cevapta sonuç sayfasını açar; mopupEnd=true olduğu için saniyelik
sorgu başlatılmaz, sonuç satırları ve Onayla görünür. Ön hazırlıkta süre0'dır.
Özgün istemci dosyası diskte değiştirilmez.

Başlat protokolünde ayrı işlem kimliği alanı yoktur. Aynı bölüm/sayı isteği,
Onayla/Kapat(op4) alınana kadar kaydedilen awaiting_ack makbuzunu tekrar
okur; ücret ve ödül eklemez. Bu işaret SQLite'ta korunur. Onaydan sonra yeni
Başlat, yeni ücretli baskındır. Onaylanmamış son sonuç yeniden girişte açılır.

Süreli test senaryoları beklemesiz politikaya uyarlanmıştır: anlık toplu EXP
ve eşya, tekrar gönderim, SQLite yeniden açılması, eski kısmi kayıt,
maliyet/ilk zafer denetimleri, posta taşması ve gerçek şifreli WebSocket ile
özgün En düğme olayından tamamlanan sonuç/Onayla akışı kontrol edilir.
Telefonun FUI/atlas görüntüsü bu ortamda doğrudan doğrulanmamıştır.

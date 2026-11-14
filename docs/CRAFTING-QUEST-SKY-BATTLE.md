# Görev, moda, demircilik ve savaş onarımı

Görev konuşmalarının teslim haritası questcondiction.Para4 içinden okunur. Gökyüzü NPC görevleri artık 10000 haritasında teslim edilir; seviye, önceki görev, sahnede devam eden savaş ve tek ödül kontrolleri korunur. Meslek gelişimi tanışma görevi kaynakta 80. seviyedir; 73. seviyede gerçek meslek dönüşümünü açmaz.

Kalkan (11311..11351) hasarsız olduğu için reddedilmez. Kaynaktaki açıklama ve kademe üzerinden azami HP'nin %15..35'ini emen, üç kahraman turu süren sunucu kalkanı uygulanır. Diğer uygulanmamış sıfır hasarlı beceriler uyarıyla korunur.

Sahne koşusu içinde bir karşılaşmadan kalan öfke sonraki karşılaşmaya aktarılır, SQLite koşu belgesinde saklanır ve yeniden bağlanmada korunur. Yeni mücadele koşusu yine 30 öfkeyle başlar. Son darbeden sonra rapor için 4 saniyelik sunucu beklemesi 250ms'ye, yerel animasyon sırası bekleme üst sınırı yaklaşık 600ms'ye indirilir. Zafer ve ödül için gerçek düşman/harita koşulları korunur; canlı düşmanlar atlanmaz.

Moda koleksiyonu bütün kaynak moda şablonlarını kilitli/kazanılmış halleriyle listeler. Çantada veya giyili görülen stiller kalıcı kaydedilir. Koleksiyondaki stil daha sonra birleştirilse bile yeniden görüntü olarak giyilebilir; yeni fiziksel eşya oluşturulmaz. Görünürlük ve seçilen görünüm SQLite'ta saklanır.

Moda birleştirme alanı (sanal çanta0 slot0) moda eşyası, Moda Ruhu 208020 ve Moda Şans Taşı 208021 kabul eder. Gerçek eşya fiziksel çantada durur; sunucu kaynak Fashion_Soul/Fashion_Lucky/Fashion_Wing/Fashion_Other değerlerini ve t_s_upgradetemplate Types113 seviyelerini kullanarak seçilen adedi tüketir ve moda EXP/level kaydını günceller. Güçlendirilmiş/taşlı moda yanlışlıkla silinmez. Arıtma/değerlendirme bu güncellemenin kapsamında değildir.

Demircilik birleştirme listeleri yerel istemcide yüklenen t_s_compose tariflerinden doldurulur; Ekipman/Mücevher/Eşya grupları ve kaynakta tanımlı ekipman gelişimleri görünür. Sunucu bağımsız olarak aynı aktif katalogdan tarifi okur; seviye, malzeme1..4/adet ve altın kontrol edilir. Ekipman gelişiminde tek ana ekipman aynı türdeki hedefe dönüşüyorsa giyili yuva, bağlanma, güçlendirme ve takılı taşlar korunur. Kaynak malzeme yoksa otomatik para ile satın alma yapılmaz.

Dönüştür, eşyanın TransformId kaydındaki t_s_transformtemplate Material1..8 grubuyla sınırlandırılır; CostGold ve adet uygulanır. Eşyanın tamamı dönüştürülürken aynı kimlik ve uyumlu metadata korunur. İşlem makbuzları tekrar iletimde çift tüketimi önler. Hatalar işlemi geri alır; başarısız moda birleştirme düğmesi yeniden kullanılabilir duruma döner.

Gökyüzü hareketi harita sınırlarına alınır. Yürünemeyen başlangıçta özgün yürünebilir karo verisinden yakındaki, tıklanan hedefe ulaşabilen zemin seçilir. Uçuş etkinleştirilmez, bütün harita yürünebilir yapılmaz, ağda kendi hareketini yankılama onarımı korunur.

Gerekli özgün telefon katalogları: t_s_compose.json, t_s_transformtemplate.json, t_s_upgradetemplate.json. Normal istemci zaten bunları kullanır; sürüm manifestindeki aktif dosyalar tercih edilir. Paket dosyaları uydurma tarif/katalog üretmez. Katalog yoksa ilgili malzeme tüketilmez. scripts/check-crafting-catalog.js konumları salt okunur denetler.

Doğrulama: Node24 birim testleri, gerçek yerel şifreli WebSocket entegrasyonları, özgün minify istemci yöntemleriyle VM testleri, bütün yama ankrajlarının tekil olması ve yamalı 10MB istemcinin sözdizimi denetimi. Android/Chrome üzerinde gerçek grafik doğrulaması yapılmamıştır.

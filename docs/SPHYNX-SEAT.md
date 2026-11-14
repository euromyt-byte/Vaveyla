# Sfenks binici-eyer hizası

Kullanıcı iki gerçek Android görüntüsünde binicinin Sfenks eyerinden
kaymış olduğunu bildirdi. Özel görseller farklı gövde oranlarına sahipken
ilk atlas özgün beyaz atın layout değerlerini kullanıyordu.

Yeni extra.vaveylaSeat alanı 15 duruş ve40 yürüyüş karesi için binici x/y
ötelemesi içerir. İşaretlenen eyer merkezleri ve referans-at noktaları
sphynx-seat-calibration.json içinde kaydedildi. Görseldeki oturma yüzeyleri
elle işaretlendi, karelerin alfa sınırlarına göre aktarıldı; bu bir kemik
animasyonu/otomatik 3D oturma çözümü değildir. Özellikle dar ön/arka yürüyüş
görsellerinde öteleme daha büyüktür. Referans noktalarının gerçek Android
binici görüntüsüyle son kontrolü kullanıcı kurulumundan sonra gerekir.

Özgün RO.loaderCompleteHandler özel metadata'yı saklar. getVaveylaSeat
sadece mount_vaveyla_sphynx/2 ad alanında ve görünür/yüklenmiş mount parçasında
çalışır. drawStand/getMountOffsetY ve drawWalk, ötelemeyi mount olmayan tüm
avatar parçalarına uygular: gövde/silah/kıyafet/kanat birlikte hareket eder.
Görselin aynalama işlemi doğal olarak x ötelemesini de aynalar. Morph ve
translucence çizimlerinde uygulanmaz, başka bineğe geçince metadata temizlenir.

Kedi PNG'leri, atlas kare dikdörtgenleri, özgün LO değerleri ve foot/shadow
noktaları değiştirilmez. Preview/_s atlasları ve SQLite verileri değişmez.
Böylece kediyi zeminin üstüne kaydırıp havada bırakarak hizalama yapılmaz.

Testler özgün RO loader/draw/LO kodunu VM'de çalıştırır. Tüm yürüme/duruş
kareleri, beş yön, iki aynalama halinde binici ve silahın doğru ötelemesi,
kedinin yerinin aynı kalması ve diğer bineklerde sıfır etki doğrulanır.
Gerçek Android görsel doğrulaması burada yapılmamıştır.

Yedekli kurulumdan sonra sunucu yeniden başlatılır; eski oyun sekmesi
kapatılıp yeni sekmede giriş yapılır. Laya eski atlası bellekte tutmamalıdır.

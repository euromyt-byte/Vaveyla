# Telefondaki Gökyüzü Şehri dosyaları ve sahne teşhisi

Kullanıcının dosya raporu res/animation/maps/10000/10000.dat/.bin ve
res/animation/mapmaterial/land/10000 altındaki küçük resim/örnek parçaların
HTTP üzerinden çözülebildiğini gösterdi. Eski check-sky-city yanlışlıkla
maps/... kök yolunu kontrol ediyordu; doğru sahne yolu kullanıldı.

Özgün t_s_mapnode JSON kökü {"t_s_mapnode":{...}} biçimindeydi. Runtime
okuyucu bu üst alanı artık bilinen tablo adıyla açar. Dizi ve indeksli nesne
kayıtları desteklenir; kimlik türü, pozitiflik, tekrarlar ve beklenmeyen ek
üst alanlar yine reddedilir. Aynı kaynak düzeni mounttemplate/runetemplate
okumalarında da desteklenir. Herhangi bir katalog dosyası değiştirilmez.

Bu düzeltme katalog hatasını hedefler; siyah ekranın kök nedeni henüz
telefonda doğrulanmamıştır. İstemci teşhis raporuna isteğe bağlı sky alanı
eklendi: gerçek sahne adı, sonraki sahne, map_id, yükleme sayacı, çözülmüş
karolar, karakter/görüntü hazır mı, sahne görünür/aktif mi, geçiş perdesi
alpha değeri ve harita görüntü konumu. Hesap/oyuncu kimliği veya token
okunmaz. Getter sahneyi değiştirmez; yalnızca var olan durumu okur.

phase=create/preloading/map_view/enter_over/ui_ready hangi adımın
başladığını gösterir. Eski state.scene_entered sadece eğitim haritası
10001 kontrolüdür; Gökyüzü Şehri'nin hazır olduğunu ölçmez.

Sunucu yeniden başlatılmalı, eski sekmeler kapatılmalı, yeni sekmede oyun
açılıp siyah ekran sırasında /client-diagnostics çıktısı alınmalıdır.
Termux'ta sunucuyu Ctrl+C ile durdurmak canlı teşhis gönderimini keser;
teşhis sayfası açılırken sunucu çalışır durumda kalmalıdır.

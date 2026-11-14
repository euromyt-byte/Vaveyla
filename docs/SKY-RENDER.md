# Gökyüzü Şehri: doğrudan harita çizimi

Belirti: SPACE_SCENE açılıyor, Chrome Android'de görüntü siyah; pencere
boyutu değişirken kısa süre görünüyor. Telefona ait hata kaydı olmadan kesin
kök neden doğrulanmış değildir.

Özgün U1, yalnızca MapFileId10000 için G1.drawWay=2 yolunu seçiyor.
renderTitle2, parçaları offlineSprite üzerine çizip drawToTexture ile geçici
bir GPU dokusuna birleştiriyor; eski mergeBg dokusunu disposeBitmap ile
bırakıyor. Bu değişiklik bu şehir için o birleştirme yolunu kaldırır.

Yeni drawWay3, özgün x1/b1 parçalarını, URL anahtarlarını, jpg/ktx seçimini,
loadRes/getRes ve b1.addToParent mekanizmasını kullanır. Görünür parçalar
U1 altında doğrudan çizilir; ekran dışında kalanlar ayrılır. Pencere boyutu
ve hareket değişiminde görünür alan yeniden hesaplanır. Her yüklenen parça
hemen görünür; bir eksik resim diğerlerini bekletmez. Geç gelen yükleme
cevabı şehirden çıktıktan sonra sahneye eklenmez. Diğer haritalarda özgün
çizim yolu korunur. Geçiş maskelerini veya istemci hatalarını genel olarak
kapatmaz.

Testler özgün U1/x1/b1 kodlarını çalıştırır: GPU render target üretimi
başarısız olduğunda eski yol hata verirken yeni yol parçaları gösterir;
hareket, boyut değişimi, eksik parça, tekrar deneme ve çıkış sonrası callback
kontrol edilir. Bu test gerçek Android WebGL/Chrome testi değildir.
Telefondaki /client-diagnostics hata bilgisi gerekirse sonraki teşhiste
kullanılmalıdır. Özgün harita resimleri eksikse bu güncelleme onları üretmez.

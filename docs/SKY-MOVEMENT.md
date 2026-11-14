# Gökyüzü Şehri kendi yürüyüş yolunun tekrar oynatılması

Özgün iM, WALK_NEXT/WALK_OVER olaylarından geçilmiş yol parçalarını biriktirip
Yp.move üzerinden 8690 ile bildirir; yerel hareket bu sırada zaten uygulanır.
Özgün SpaceWalkLayer.__armyPosBroadHandler ise sunucudan4594 ile gelen yolu
mevcut yolun sonuna ekleyip yeniden yürütür. Yerel oyuncuya kendi yolunu
aynen geri göndermek yeniden yürüyüş ve yeni hareket bildirimi üretebilir.

Session8690 kimliği ve sınırları doğrulatıp game_world konumunu kaydeder;
artık gönderene4594 geri göndermez. Kamera tipi2 zaten konumu değiştirmiyordu;
kameranın raporu da karaktere yürüyüş cevabı olarak dönmez. İstemci köprüsü
kendi userId'sine ait gecikmiş4594 ve kamera yollarını uygulamaz. Başka
oyuncuların normal yürüyüş yolları özgün model.moveArmyTo akışında korunur.
Bu değişiklik çok oyunculu yayın eklemez veya yerel tıklamayla yürümeyi
kapatmaz. Yerel karakteri sabit aralıkla eski konuma ışınlayan sayaç yoktur.

Şifreli bağlantı testi ardışık yürüyüş parçalarının son konumunu SQLite'tan
okur;4594 yeniden oynatma cevabı olmadığını kontrol eder. Kamera, boşta
bekleme ve başka oyuncu kimliğiyle sahte istek konumu değiştirmez. Özgün
istemci alıcısı VM içinde çalıştırılarak gecikmiş kendi yollarının
uygulanmadığı ve uzaktaki normal yolun halen işlendiği doğrulanır.

Kurulum kaynak/SQLite yedeği alır. Sunucu yeniden başlatılıp eski oyun
sekmesi kapatılmalı; daha önce bellekte birikmiş yerel yollar temizlenerek
yeni sekmede giriş yapılmalıdır. Gerçek Android görsel doğrulaması burada
yapılmamıştır.

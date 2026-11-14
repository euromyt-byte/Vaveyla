# Gökyüzü Şehri yeniden yükleme döngüsü

Kullanıcının gerçek teşhisinde phase=ui_ready/scene=SPACE_SCENE/entered=true
ile phase=preloading/scene=EMPTY_SCENE/next_scene=SPACE_SCENE dönüşümlü geldi.
Karolar, karakter ve harita noktaları yüklenmişti. Üç saniyelik rapor
periyodu normaldir; sahnenin tekrar EMPTY_SCENE'e geçmesi normal değildir.

Özgün SceneManager.setScene(SPACE_SCENE) Uo.enterCastle(false) çağırır.
Uo, 8747 simple.PropertyMsg(param7=false) gönderir. Sunucu bu kodu kampanya
çıkışları grubuna koyduğu için p.city -> SPACE_CREATE4595 üretir. Native
__createSpaceHandler force=true ile sahneyi yeniden açar. Böylece sahne
başına gönderilen bildirim yeniden sahne açılışı üretebilir.

8747(false) artık yalnızca kale dışında bulunma bildirimidir; yeniden
sahne oluşturmaz, kampanya terk etmez, ödül atlamaz. 8747(true) şehirdeyken
kaleye dönme konumunu uygular. Kampanya ödül kapısı korunur. Özgün 5025 ve
5120 çıkışları korunur. Şehirde 8224 user yenilemesi veya yinelenen8688
artık CREATE yerine mevcut oyuncu listesini4597 yeniler. İlk giriş ve yeni
bağlantıdaki kayıtlı şehir geri yüklemesi yine4595 üretir. Kampanyadan gerçek
şehir dönüşü de korunur.

Şifreli WebSocket testinde özgün Uo.enterCastle ve SPACE_SCENE ifadesi
çalıştırılır; dört kez8747(false),8224 ve8688 gönderilir. Her turda yeni
CREATE/RETURN/EXIT/LoginState olmadığı, dünya konumunun değişmediği ve
true bildiriminin kaleye döndüğü kontrol edilir. Telefonda görsel doğrulama
kullanıcı kurulumundan sonra yapılmalıdır.

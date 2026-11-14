# Gökyüzü Şehri

Özgün istemci Yp.enterSpace -> 8688 simple.PropertyMsg(param1=10000).
BaseManager.__createSpaceHandler -> 4595 room.RoomEnterMsg; player[0]
kimliği eşleşirse YU.setup/readMember ve SPACE_SCENE açılır. 4598
simple.PropertyMsg ile spaceMapId eşitlenir. Native eşik 15. seviyedir.

Giriş, bekleyen ödülü atlayamaz. Kampanya terk etme ve konum değişimi tek
SQLite işlemi içindedir. game_world map10000 ve piksel konumu kalıcıdır;
4595/4597 RoomPlayerMsg konumları 20 piksellik karodur. Önceden kaydedilmiş
konum yoksa başlangıç 140,120: istemcinin şehir robot konumlarına yakın
bir yerel başlangıçtır; özgün doğma noktası doğrulanmamıştır.

Özgün SpacePlayerMoveMsg şeması bulunmadığından tahmini protobuf etiketleri
kullanılmaz. Bellek içi istemci köprüsü 8690/4594 için bilinen PosMoveMsg
ve RouteMsg kullanır, ardından özgün model.moveArmyTo çağrılır. Kimlik,
harita, yol uzunluğu ve sınırlar doğrulanır. Kamera tipi2 konumu değiştirmez.
Çarpışma ve özgün hız kuralları doğrulanmış değildir. 8700 sunucudaki konumu
yeniler. 8701 yalnızca kendi karakterini döndürür; çok oyunculu şehir yayını
bu değişikliğe dahil değildir.

8689 kaleye döner ve konumu map5 yapar. Native kale düğmesi bu isteğe
bağlanmıştır. Şehirden başlatılmış kampanya sonrası dönüş map10000 kalır;
ödül alınmadan çıkılamaz. 8692 sadece özgün mapnode kataloğundaki yakın şehir
noktasına 4601 yanıtı verir. Açılan alt sistemlerin uygulanmış olması ayrıca
gereklidir; tüm Gökyüzü Şehri etkinlikleri uygulanmış değildir.

Harita görselleri yüklenen arşivlerde yoktur. Telefonda `node
scripts/check-sky-city.js` maps/10000/10000.dat/.bin ve mapnode dosyalarını
salt okunur kontrol eder. Eksik dosya üretilmez; eski istemci JS dosyası diskte
değiştirilmez. Güncellemeden sonra sunucu yeniden başlatılmalı ve eski oyun
sekmeleri kapatılıp yeni sekmede giriş yapılmalıdır.

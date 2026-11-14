# Rastgele paketler ve doğrudan binek kartı kullanımı

Bu güncelleme2125061 B Seviye Moda Çantası,2125062 A Seviye Moda Çantası,
2125066 Teknoloji Binek Kart Paketi ve2183015 Mini Uzay Gemisi Kartı için
kullanma kuralı eksikliğini giderir. Benzer tablolar aynı kuralları kullanır;
eşya adlarıyla tek tek rastgele ödül uydurulmaz.

## Paketler

Kaynak dropitem kayıtlarında AppearType4 göreli ağırlıktır. Her açılışta tam
bir ağırlıklı sonuç seçilir; Data adet, IsBind bağlama durumudur. A/B moda
paketlerinin gerçek tablo toplamı10650/11150, teknoloji paketinin10000'dir.
Metindeki yuvarlanmış yüzdeler yerine gerçek tablo ağırlıkları kullanılır.
Küçük kayan nokta dönüşüm artıkları tam ağırlığa temizlenir. Seçim sunucuda
crypto.randomInt ile yapılır; oyuncu hangi ödülün çıkacağını göndermez.

AppearType1/Random100 kesin ödülleri korunur.1+4 karışık paketler kesin
ödülleri ve bir rastgele sonuç verir. Toplu açılışta her paket için ayrı çekim
yapılır ve aynı ödüller birleştirilir. Kaynakta olmayan eşya, tanınmayan para
ödülü veya desteklenmeyen/süreli/seçmeli grup için tüketim yapılmaz.
Bütün olası çıktılar çekimden önce normalizeReward ile doğrulanır. Böylece
hatalı bir ödül havuzu yeniden deneyerek avantaj sağlatmaz.

Paket tüketimi ve ödül tek SQLite işlemidir. Hata geri alınır. Çanta doluysa
mevcut posta taşması kullanılır. Testler ağırlıkların her satırının alt/üst
sınırını, karışık kesin+seçimli grubu ve dolu çantadaki posta ödülünü kapsar.

## Binek kartı

SonType218 kartı Kullan ile kendi Property1 bineğini etkinleştirir. Kaynak
mounttemplate koşulları geçerlidir. Etkinleştirme özellikle tıklanan eşya
kimliğinden yapılır; farklı varsayılan kart harcanmaz ve sahip olunan kart
varken elmas kesilmez. Süre tıklanan karttan okunur. Etkin binek için ek
kart tüketilmez, oyuncuya zaten etkin olduğu bildirilir. Tekrar kartlarını
canavar özüne dönüştürme bu işlemde uygulanmaz.

## Tekrar isteği koruması

Özgün5006 yalnızca çanta konumu/adedi içerir. Paket silindikten sonra çıkan
yeni eşya aynı SQLite kimliği ve konumu alabilir. Bu yüzden eski isteği
tekrar işlemek yeni çıkan binek kartını istemeden kullanabilirdi.
Tanınmış istemcinin sendUseItem metodu mevcut ItemUseMsg.battleId alanında
VAVEYLA_ITEM_USE_V1:itemId:templateId:nonce işareti taşır. Ayrı protobuf alan
numarası eklenmez; gerçek savaş kullanımları bu işarete dönüştürülmez.

Yeni game_item_use_actions tablosu karakter ve anahtara göre sonucu saklar.
Eşya kimliği, şablonu, çanta, konum ve adet tekrar doğrulanır. Aynı istek
ikinci ödül/etkinleştirme oluşturmaz. Yeni anahtarla eski şablona yönelik
gecikmiş istek, aynı kimlik artık başka eşyaya aitse reddedilir. Eski normal
EXP/sabit paket istekleri uyumludur; yeni rastgele paket ve kart kuralları
eski önbellekli istemcide yeni sekmede açma mesajı verir.

109 oyun testi geçti; dört adlandırılmış eşya gerçek şifreli5006 akışında,
Mini Uzay Gemisi4427 güncellemesiyle ve tekrar istekleriyle doğrulandı.
Android çizimi ve telefonun özgün mounttemplate dosyası doğrudan burada
çalıştırılmadı. Önceki katalog önceliği düzeltmesi bu pakette korunur.

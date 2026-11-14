# Binek etkinleştirme, sembol öğrenme ve mücevher takma

Üç özgün istemci isteği önce uygulanmıyordu:8536 binek,8605 sembol,
5151 mücevher;5152 sökme işlemini taşır. Bunlar kimliği doğrulanmış karakter
bağlamında SQLite işlemiyle uygulanır. Önceki demircilik0 geçici alanı korunur.

## Kaynak katalogları

mounttemplate ve runetemplate sağlanan çıkarılmış kataloglarda yoktur;
resimler istemcinin bu tabloları kendi oyun klasöründen yüklediğini gösterir.
Sunucu bu iki izinli tabloyu kendi Assets clientRoot/assetRoot dizinlerindeki
xml/res/config veya version.zip manifest eşlemelerinden okur. Sadece
sunucudaki dosyalar kullanılır; istemcinin gönderdiği fiyat/statistiklere
inanılmaz.16MiB sınırı, aktif sürüm seçimi, pozitif tekil TemplateId ve JSON
şekli denetlenir. Eksik/bozuk katalogda veya aktif sürüm eşlemesinin kendisi belirsizse harcama yapılmaz; sistem
mesajı gerekli dosyayı söyler. Sonuçlar süreç boyunca bellekte saklanır.

node scripts/check-collectibles-catalog.js
komutu telefondaki iki tablonun bulunabildiğini bildirir. Özgün klasör:
/storage/emulated/0/DCIM/webroot_web; VAVEYLA_ASSET_DIR/VAVEYLA_CLIENT_DIR
ayarları kullanıcının mevcut yollarını destekler. Bu ortamda gerçek telefon
katalogları bulunmadığı için tüm gerçek binek/simge satırları doğrulanamadı.
Testlerde açıkça sentetik kaynak satırları ve gerçek istemci metotları kullanıldı.

## Binek

NeedMountGrade ve NeedItemId_O kaynağa göre denetlenir. Sahip olunan kart1
adet tüketilir; yoksa yalnızca kaynakta pozitif Property1 fiyatı varsa ödeme
kuralları uygulanır. Etkin binek için tekrarlanan istek tekrar harcatmaz.
218 türündeki süreli kartın Property2 gün süresi korunur. Kalıcı görünüm için
istemcinin2000-01-01 tarih işareti gönderilir;1970 tarihi kalıcı sayılmaz.
Kaynak şablon SQLite'ta kaydedilir; etkin/süresi geçmemiş bineklerin sayısal
Power/Intellect/Physique/Agility vb. temel özellikleri normal savaş gücüne
katılır. Bu değişiklik binek eğitim/seçme/binme işlemlerini kapsamaz.

## Sembol

8605 öğrenme isteği runeId, öğrenme taşı konumu ve adet1 ile gelir.
Kaynak RuneGrade1, RuneType ve NeedGrade kontrol edilir; SonType302 taşının
Property1 tipi eşleşmelidir. Aynı tip zaten öğrenilmişse taş tekrar yenmez.
Öğrenilen runeId SQLite'ta saklanır ve fullArmy'nin mevcut HeroRuneMsg
alanıyla yeniden girişte yüklenir.76/78 görevleri öğrenilen tür/seviye1'i
okur. Yükseltme, rune soketi ve savaş içinde rune kullanımı ayrı işlemlerdir.

## Mücevher

5151 geçici alan0'daki ekipmana kendi çantasındaki205 mücevherinden1 adet
takar.1..4 yuva, ekipman türü, sahiplik, seviye, boş yuva ve aynı türün
tekrarlanmaması denetlenir. Mücevherin gerçek Attack/Live vb. şablon alanları
kullanılır; Property3 özellik artışı değildir, özgün çıkarma altın bedelidir.
Çıkarma veya tümünü çıkarma bu bedeli öder ve aynı mücevheri geri verir.
Çanta doluysa işlem geri alınır; altın/taş kaybı olmaz. Takılı mücevherli
silah önce sökülmeden satılmaz. Düzenleme, taşıma ve yeniden giriş kayıtları
korur.18 mücevher görevi takılı kayıtları okur. Mevcut açık yuvalar korunur;
zaten açık yuvaya delici harcanmaz.

Yeni tablolar var olan Store başlangıç göçüyle eklenir; veritabanı sıfırlanmaz.
Binek/rune cevaplarının özgün protobuf şemaları yüklenen katalogda olmadığı
için alan numarası uydurulmaz. Mevcut campaign.CampaignReqMsg içinde işaretli
JSON cevapları, tanınmış bundle'ın özgün model işleyicilerinde açılır.
Mücevher yenilemesi zaten mevcut115 eşya paketiyle gerçekleşir.
Android FUI çizimi burada çalıştırılmamıştır.

## Katalog kopyası çakışması düzeltmesi

Önceki yükleyici clientRoot ve assetRoot içindeki tüm eşleşen dosyaları aynı
anda karşılaştırıyordu. Hazırlanmış istemcinin güncel tablosu ile özgün
klasördeki eski kopya farklı olduğunda, doğru dosya mevcut olsa bile
source_catalog_ambiguous hatası üretiliyordu.

Yeni seçimde clientRoot önceliklidir. Önce normal XML URL'sinin version.zip
mapping hedefi okunur; eski mantıksal/özgün kopya fiyat/şart karışıklığı
oluşturmaz. Manifest yoksa HTTP ile aynı çözümleyici ve sıralı mantıksal
URL'ler kullanılır. Özgün assetRoot ancak istemcide katalog bulunmazsa devreye
girer. Aktif manifestin kendi eşdeğer olmayan alternatifleri yine hata
verir. Yanlış/bozuk bir aktif dosya yerine sessizce eski sürüme geçilmez.

Kurulum kontrolü artık seçilen dosya adını ve manifest/logical seçimini de
gösterir. Sadece seçim kodu değişir; JSON kaynakları ve oyuncu kayıtları
silinmez veya birleştirilmez. Testlerde hem farklı iki klasör hem aynı
klasörde eski mantıksal dosya ve güncel hash dosyası kullanıldı. Şifreli
binek/öğrenme/mücevher testi de gerçek dosya yükleyicisine bağlı çalışır.

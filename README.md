# VAVEYLA Node.js 1.5.0

Bağımsız Wartune Ultra backend emülatörü. HTTP, özgün şifreli WebSocket, JSON API ve SQLite aynı Node.js uygulamasında çalışır; Python sunucusu veya Python alt işlemi çağrılmaz. Node.js24+ gerekir.

Bu sürüm birleştirilmiş bir geliştirmedir. Resmî sunucu kodu, bütün savaş formülleri ve bütün etkinlik kuralları mevcut değildir. Bu nedenle resmî oyunun eksiksiz kopyası olarak sunulmaz. Doğrulananlar ve kalanlar `docs/IMPLEMENTATION.md` içindedir.

## Mevcut kurulumu tek işlemde güncelle

`vaveyla-toplu-guncelle-v1.5.0.mjs` dosyasını Android Download klasörüne indir. Aktif sunucu/dosya kontrolü oturumunda Ctrl+C yap, sonra:

```bash
cd "$HOME/vaveyla-node-v1.0.0/vaveyla-node" &&
node "$HOME/storage/downloads/vaveyla-toplu-guncelle-v1.5.0.mjs" --project "$PWD" &&
bash scripts/start-termux.sh
```

1.0.0, 1.0.1, 1.1.0 ve 1.2.0 kurulumları desteklenir. Güncelleyici kaynak dosyalarını ve SQLite'ı `data/backups/update-node-1.5.0-*` altında yedekler. Oyuncu veritabanını değiştirilmiş eski bir kopyayla değiştirmez. Yeni tablolar ve para birimi kısıtları sunucu açılırken işlem içinde geçirilir. Eski lonca katkıları bir kez aktarılır; yeniden başlatınca ikinci kez eklenmez.

Tarayıcı: **http://127.0.0.1:8080/local-account**. Eski oyun sekmelerini kapatıp yeniden giriş yap; gateway bileti tek kullanımlıktır.

## Yeni kurulum

```bash
pkg install nodejs-lts unzip
mkdir -p "$HOME/vaveyla-node-v1.5.0"
unzip -n "$HOME/storage/downloads/vaveyla-node-v1.5.0.zip" -d "$HOME/vaveyla-node-v1.5.0"
cd "$HOME/vaveyla-node-v1.5.0/vaveyla-node"
bash scripts/start-termux.sh
```

İlk kullanımda `ws` ve `fflate` sabit sürümleri npm üzerinden kurulur. Diğer zamanlarda indirme gerekmez. Node24'ten eskiyse `pkg upgrade nodejs-lts` kullan. Depolama klasörü yoksa `termux-setup-storage` gerekir.

Hazırlanmış istemci varsayılanı `$HOME/vaveyla-v0.8/vaveyla-client-local-v0.8` olur. 12 GB varlıklar kopyalanmaz. `.vaveyla-prepared.json` içindeki özgün varlık klasörü yerinden okunur. Farklı konum için:

```bash
VAVEYLA_CLIENT_DIR="$HOME/hazirlanmis-istemcim" bash scripts/start-termux.sh --asset-root "$HOME/oyunun-tam-dosyalari"
```

Yeni kurulumun veritabanı ilk kez oluşturuluyorsa eski Node1.0.0 veritabanı bulunduğunda kopyalanır; yoksa `$HOME/vaveyla-v07-kurulum/vaveyla/data/vaveyla.sqlite3` kaynak alınır. Başka kaynaktan tutarlı SQLite kopyası için `VAVEYLA_DATABASE` belirt. `VAVEYLA_NODE_DATABASE` çalışma veritabanını belirler. Yerinde güncelleme mevcut Node veritabanını kullanır ve bu belirsizliği önler.

## 1.5.0: Meydan Oku, Baskın ve bina işlemleri

- İlk girişte hiç zafer bulunmasa da özgün4151 bölüm sıralama yanıtı gönderilir. İstemcinin `checkCanChoose()` kontrolü böylece ilk bölümü açık olarak işaretler; tamamlanmamış bölüme sahte zafer verilmez. Meydan Oku5039 isteği eğitimden çıkan gerçek seviye5 karakterle şifreli WebSocket üzerinden sınanır.
- Baskın8528/4425 uygulanır: önce kaydedilmiş savaş zaferi ve bölüm tamamlama ödülü gerekir. Süreli tekrarlar, sonuç sorgusu, iptal/iade, elmasla hızlandırma ve tekrar bağlanmada devam SQLite'ta tutulur. Her tekrarın XP ödülü yalnızca bir kez verilir. Çalışan normal bölüm ve baskın birbirini kilitler.
- Kaynakta `Campaign_Sweep_Time` ve `Campaign_Sweep_Gold` ayarları yoktur. Bu sürüm bağımsız olarak tekrar başına **60 saniye,100 altın ve kaynak20 dayanıklılık** kullanır. Kaynak XP'si, gerçekten bitirilmiş güzergâhın HeroGP ve bölüm BaseGp toplamıdır; rastgele eşya düşürme oranları doğrulanmamıştır;1.5.0 yerel eşya politikası aşağıda belirtilmiştir. İptal, bitmemiş tekrarların ayrılan altın/dayanıklılığını geri verir. Hızlandırma mevcut `QuickenOrder_Price` ile600 saniyelik dilimler üzerinden ücretlenir; bu, baskın için yerel politikadır.
- İstemcinin inşaat1,araştırma2 ve simya3 kuyruk türleri doğru gönderilir. İnşaat ve araştırma birer bağımsız sıra kullanır; simya sırasını göstermek tüm simya üretiminin uygulandığı anlamına gelmez. Süreli başlangıç151 ve hızlandırma102 yanıtları eklenir. Süre tamamlanınca gerçek kaynak şablonu güncellenir; kaynak/seviye/ön bina koşulları korunur. Eksik kristal veya altın varsa işlem bütünüyle geri alınır.
- İstemciye uygulanan Baskın ayar uyumluluğu yalnızca doğrulanmış bundle belleğinde yapılır;12 GB dosyalar ve özgün bundle diskte değiştirilmez.

**Baskın düğmesinin ilk gerçek zaferden önce gri olması beklenen davranıştır.** Meclis seviyesinin oyuncu seviyesini aşamaması gibi kaynak gereklilikleri kaldırılmaz; gerekçe sistem mesajında görünür.

## Bu sürümde eklenen bütünleşik akışlar

- Sanal para ödülleri: kaynakta kullanılan `-100` altın, `-400` elmas, `-500` bağlı elmas, `-700` XP ve diğer bilinen kaynak kodları eşya sanılarak reddedilmez.
- Posta: yerel oyuncular arasında metin gönderme, okuma, silme, sunucu eki alma; sahiplik kontrolü ve tekrar ödül engeli. Dolu çantanın ödülü postaya taşınır. Posta kutusu 16-bit oyun paketi sınırını aşmadan sayfalar halinde aktarılır.
- Mağaza: kaynak fiyatları, bağlı/normal elmas seçimi, altın ve ilgili kaynaklar; günlük/haftalık/aylık limitler. Tanımlanmayan VIP/indirim/özel etkinlik koşulları için serbest satın alma verilmez.
- Eşya kullanımı: doğrulanmış SonType203 para, XP ve dayanıklılık paketleri; eşya sahipliği, adet, seviye ve geri alma kontrolü. Etkisi bilinmeyen eşya tüketilmez.
- Yedi günlük ödüller: kaynak ödül listesi, günlük giriş ve tekrar alma engeli. Gün sayımı yerel UTC gününe göre birikimlidir; aylık ücretli telafi sistemi değildir. İstemcinin gün bit işareti doğru yere gönderilir.
- Lonca: kurma, başvuru, davet, kabul/ret, üye listesi, yetki listesi, yetki değiştirme, çıkarma, ayrılma, başkan devri, açıklama/duyuru, bağış ve temel geliştirme kuyruğu. Davet veya üye yetkisi istemciden gelen kimlikle kazanılamaz.
- Sohbet: gerçek15005 kanal komutu;15023 özel mesaj,4231 teslim ve4236 gönderici yanıtı;15038 genel profil bilgisi. Dünya, harita, özel ve lonca kanalları. Gönderici kimliği sunucudan alınır; oyuncu sistem kanalı taklidi yapamaz. Özel geçmiş hesap sahibiyle sınırlı API'de tutulur.
- Görevler: normal boss öldürme, toplam tek kişilik bölüm, vergi, ertesi gün giriş, ilerleme önkoşulları ve şehir konuşmaları eklendi. Konuşma görevi talebi şehirde, kaynak görev alınmışken ve diğer önkoşullar sağlanmışken onaylanır; etkin mücadelede kabul edilmez. Bu yerel konuşma onay politikasıdır.
- Dayanıklılık: kaynak200 başlangıç, normal bölüme20 harcama,5000 üst sınır ve iksir miktarları. Aynı mücadeleye yeniden bağlanmada ikinci kez harcanmaz. UTC günündeki ilk girişte200'e tamamlayan yerel politika kullanılır; bilinmeyen saatlik resmî yenilenme kuralı uygulanmış sayılmaz.
- Eğitim sırasında gelen XP bankada korunur; eğitim bitmeden rehberin seviye1 koşulunu bozmaz. Eğitim sonunda uygulanır.

Önceki giriş/karakter, beş eğitim savaşı, Dinah iyileştirmesi,45 normal mücadele/91 harita, bina/asker/beceri/envanter kuralları ve300 temel HP korunur. Normal zaferler kaynak düşmanlarının HP'si gerçekten sıfırlandıktan sonra kaydedilir. Savaş formülü yerel bağımsız formüldür.

## Kontrol ve teşhis

```bash
npm test
node scripts/verify-release.js
```

Testler geçici veritabanları/sentetik oyuncular kullanır; Python gerekmez. Gerçek yerel WebSocket açabilen ortam gerekir. `docs/validation.json` son sonucu içerir. Kaynak manifesti veri, kod ve test dosyalarını doğrular; kişisel veritabanını kapsamaz.

Başlangıç kontrolü hangi adımda olduğunu yazar. Tüm336 sahne grubunu ayrıca taramak için:

```bash
VAVEYLA_AUDIT_SCENES=1 bash scripts/start-termux.sh
```

Dosya varlığı Android çiziminin doğrulandığı anlamına gelmez. İstemci dosyaları eksikse bunlar `data/client-audit.json` içinde listelenir.

- `/health`: sürüm/çalışma motoru.
- `/client-diagnostics`: istemci hataları.
- `/api/server-diagnostics`: desteklenmeyen istek sayıları; paket gövdeleri/parolalar toplanmaz.
- `/api/protocol-coverage`: istemciden çıkarılmış istek listesi ve yönlendirici kapsamı.
- `/api/capabilities`: uygulanan ve eksik özellikler.

Durdurma: kendi sunucu oturumunda Ctrl+C veya `node scripts/stop-node.js`. Başka Python/Node işlemleri gelişigüzel öldürülmez. Port doluysa eski sunucunun kendi oturumunda Ctrl+C gerekir.

Yönetim: `VAVEYLA_ADMIN_TOKEN` kendi rastgele anahtarınla ayarlanır; `/admin` sayfasında aynı anahtar kullanılır. Anahtar yokken yönetim API'si kapalıdır. Elmas değişiklikleri hareket kaydına yazılır. Sunucu varsayılan olarak127.0.0.1 üzerinde dinler.

## 1.5.0 sistem kilidi düzeltmesi

Özgün istemcinin537 `SystemOpenHashOpenList` yanıtı eklendi. Sadece sunucuda karşılığı olan sistem girişleri ve kaynak seviye koşulları yayımlanır. Çanta/karakter/temel özellikler5, beceri6, yedi günlük giriş15 seviyesinde açılır. Liste ilk gateway girişinde ve yeni uygun seviye geldiğinde güncellenir; yeniden girişte tekrar gönderilir. Kaynak93 sistem tanımı `data/system-open-source.json` içindedir; `/api/game/systems` oturum sahibine seviye koşulu, giriş kapsamı ve açılma durumunu gösterir.

Peri/Sylph40. seviye koşuluna sahiptir; toplama/yakalama, beceri, geliştirme ve savaş bütünlüğü henüz uygulanmadığı için bu sürüm onu açılmış gibi bildirmez. Ödül kapsamında mevcut görev/posta/yedi günlük ödüller bulunur; çevrimiçi ödüllerin ve etkinlik ödüllerinin tamamı yoktur. Bu paket tüm oyunun eksiksiz backend'i değildir.

## 1.5.0 görev ve sohbet senkronizasyonu

Özgün istemci `__questUpdateHandler` metodu, tamamlanmış görev bitlerini yeni görevlerin önkoşullarını değerlendirmeden önce okur. Sunucuda teslim edilmiş ve istemci listesinde kalmış tek seferlik görevleri kaldırır; tekrarlı görevleri korur. Değişiklik yalnızca SHA256 ile tanınmış bundle'ın bellek kopyasına uygulanır.

Yerel eğitim kurtarma politikası: eğitim kaydı tamamlanmışsa ve45 numaralı görev kabul edilmiş/tamamlanmış olarak kayıtlıysa, kimliği doğrulanmış kullanıcı yükleme isteğinde standart `claimQuest` işlemi çağrılır. Gerçek koşullar, kaynak ödüller ve tekil ödül kaydı korunur; diğer görevler otomatik teslim edilmez. Yalnızca istemcide “tamamlandı” görünmesi yeterli sayılmaz.

İlk kullanıcı yüklemesinden sonra son20 sistem bildirimi sohbetin kaynak2 kanalında yeniden aktarılır. Aynı bağlantıda bu geçmiş bir kez gönderilir; yeniden girişte tekrar gösterilebilir. Böylece çevrimdışı görev kurtarmasının mesajları kaybolmaz. Yeni ödül üretmek amacıyla bildirim geçmişi işlenmez.

## 1.5.0 ücretsiz yerel elmas paketleri

Elmas kartları ödeme SDK'sını, dolar tahsilatını ve harici ödeme yönlendirmesini çağırmadan mevcut oyuncuya elmas yükler. Kaynak ProductType1 olan12 paket tanımı desteklenir:100/500/1000/2000/5000/10000 ve plus varyantları. Para miktarı istemciden alınmaz; `Para2` elmas, `FreePoint` bağlı elmas değerleri sunucudaki kaynak katalogdan belirlenir.

Ücretsiz alma açık bir yerel oyun politikasıdır; yeniden bilinçli tıklama yeni paket yükler. Aynı aktif tıklama tek isteğe indirilir, ağ hatası sonrası tekrar aynı işlem kimliğini kullanır. Aynı işlem kimliğinin tekrar gönderimi ikinci ödül vermez. Normal elmas defteri ve ödül bildirimi kullanılır. Gerçek ödeme, ilk ödeme ödülü veya başka ücretli etkinlik hakkı oluşturulmaz. VIP EXP1.5.0 ile kaynak VIPEx üzerinden ayrıca kaydedilir. Diğer ücretli ürünler bu elmas akışında reddedilir.

İstemci katalog kopyasında fiyat0 ve para birimi boş gösterilir; elmas ürünleri “Ücretsiz”, diğer ürünler “yerel oyunda kapalı” etiketlidir. Özgün dosyalar diskte değiştirilmez. Kimliği doğrulanmış `POST /api/game/recharge.free`, normal oyun API'sinin request_id sözleşmesini kullanır.

## 1.5.0 asker istekleri

5155/5156 protobuf çözümleyicisinin varsayılan `pawnLive: []` alanı artık dolu bir ek alan gibi reddedilmez. Yalnızca boş liste varsayılanı kabul edilir; yabancı ordu kimliği, dolu ek alanlar, kışla/seviye/nüfus/rezerv ve para koşulları korunur. Bina önkoşul reddi, gerekli bina ve seviyeyi Termux kaydında `requirement` olarak da gösterir.8780 başarımlar işlemi henüz uygulanmadığından tanı kaydında görünmeye devam eder; bu güncelleme başarım/başarım ödülü vermez.

## 1.5.0 baskın eşyası ve yükleme teşhisi

Baskın artık yalnızca XP vermez. Bağımsız yerel politika: bölümün kaynak `campaign.Item` önizlemesindeki geçerli eşyalardan her tamamlanmış tekrar için1 adet, liste sırasıyla verilir. Bu bir resmî rastgele düşürme oranı değildir. Ödül planı SQLite baskın durumunda saklanır; başlatma yanıtında önizleme, sonuç yanıtında gerçekten yeni kazanılan eşyalar bulunur. Aynı sonuç sorgusu yeniden ödül vermez. Dolu çantanın ödülü mevcut atomik posta akışına aktarılır. Eski baskınların önceden tamamlanmış tekrarlarına geriye dönük eşya yazılmaz; devam eden eski işlerin gelecek tekrarları yeni politikayı kullanır.

Yükleme ekranı için bir çözüm doğrulanmış değildir. Eksik veya sürümü uyuşmayan UI/atlas/eşya dosyaları boş dosyayla değiştirilmez. Sunucu kaynak yükleme hataları `/client-diagnostics` ve `/api/server-diagnostics` JSON'larında `asset_errors` olarak görünür;128 farklı yolla sınırlıdır, özel dosya yolları toplanmaz. Bu kayıt yeni sunucu açıldıktan sonra oluşan istekleri kapsar. `version.zip`/`version.json` değiştirilmişse hedef dosyaların o sürüme gerçekten ait olması gerekir.

## 1.5.0 VIP puan, seviye ve hediye

- Ücretsiz elmas paketleri kaynak `recharge.VIPEx` kadar VIP EXP verir; örneğin100 elmas paketi100 VIP EXP. Aynı satın alma isteği tekrar puan vermez. VIP EXP cüzdandan bağımsız SQLite tablosu ve olay defterinde saklanır. Toplam elmas bakiyesi, VIP puanı sayılmaz.
- Kaydı bulunan önceki `recharge.free` işlemleri karakter başına bir kez kaynak ürün/miktardan aktarılır. Bu aktarım elmas bakiyesini değiştirmez. Önceden yönetici tarafından doğrudan verilmiş elmaslar paket alımı gibi değerlendirilmez.
- Kaynak sanal ödül kodu `-5500` VIP EXP olarak tanınır. Posta ve ortak ödül akışında bulunan bu kod aynı kalıcı VIP defterine gider. İstemciden VIP puan miktarı alınmaz; yeni rastgele günlük/savaş VIP oranı uydurulmaz.
- Kaynak Types4 toplam eşikleri: VIP1=60,VIP2=120,VIP3=360; kaynak tablosunda VIP19'a kadar ilerleme bulunur.249 şema özgün istemci encoder'ıyla karşılaştırılır.4410 VIP bilgisi girişte ve değişiklikte gönderilir. Kahraman henüz oluşturulmamışsa istemci VIP mesajını kahraman hazır olana kadar erteler.
- Kaynak VIP günlük, bir kerelik ücretsiz ve elmasla alınan paketler8504/4409 ile çalışır. Özgün istek türleri günlük=-1,ücretsiz=0,elmasla=1. Seviye, ücret, tekrar kontrolü ve dolu çanta/posta işlemi sunucudadır. Günlük süre yerel UTC gününe göre sıfırlanır; her uygun seviye için bir kez alınır.
- Yeni bina ve araştırma geliştirmelerinde kaynak ayrıcalık29/30 süre indirimi uygulanır. Diğer VIP ayrıcalıklarının tümü, VIP ruleti, süreli VIP kartlarının kullanımı ve arkadaş için VIP açma bu sürümde uygulanmış sayılmaz.
- Oturum sahibine `GET /api/game/vip`; hediye için `POST /api/game/vip.gift` (`type`,`grade`,normal request_id sözleşmesi). Gerçek ödeme tahsil edilmez. Android'de bu sürüm henüz sınanmadı.

Paket fiyatı, yapılandırma arşivinden yüklenmiş olsa da elmas ürününün özgün getter'ında0 olarak gösterilir; para simgesi boş olur. Bu bellek kopyası kaynak VIPEx değerini ve nesnenin prototype/getter'larını korur.

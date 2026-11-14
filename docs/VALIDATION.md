# Doğrulama kaydı

Geliştirme ortamı: Linux, Node.js 24.19.0; SQLite Node yerleşik modülü. Testler yalnızca geçici veritabanı ve sentetik oyuncular kullanır. Kullanıcının fiziksel Android veritabanı bu ortamda açılmamıştır.

`npm test` protokol, oyun kuralları, kalıcılık, dosya çözümleme ve gerçek yerel HTTP/WebSocket testlerini birlikte çalıştırır. Son ölçüm `validation.json` içindedir. Paket içindeki JSON referans vektörleri önceki Python uygulamasından ve çıkarılmış istemci şemalarından geliştirme sırasında üretilmiştir; test veya sunucu çalışma anında Python çalıştırılmaz.

Doğrulananlar:

- 141 protobuf şemasının örnek mesajlarında byte ve alan varsayılanı eşitliği; bozuk protobuf ve yanlış alan tiplerinin reddi. Bu örneklem her olası mesajın kanıtı değildir.
- 20 ardışık paket için kayan anahtar ve başlık referansları.
- Gerçek şifreli WebSocket üzerinden hesap girişi/karakter oluşturma/anahtar geçişi/ilk beceri/4103 zafer yanıtı; kullanılmış biletin reddi ve geçerli oturumla saat isteği.
- Altı avatarın beş eğitim savaşı; harita2 becerileri ve Dinah'ın negatif hasar değeriyle iyileştirmesi; boss ve bankada bekleyen XP.
- 45 normal mücadele, 91 harita, 293 farklı oluşum; 1307'nin üç alternatif yolu dahil 303 gerçek sunucu zafer kaydı. Seviye80 ve eğitimli asker içeren test karakteri kullanılır. Sonuçlar düşman HP'sinin gerçekten sıfırlanmasına dayanır; istemciden zafer kabul edilmez.
- 18 eski oyun durumu/işlem referansının tamamında derin eşitlik; CPython MT19937 ile 720 sınırlı rastgele sayı eşitliği.
- Eski SQLite satır biçiminden parola kontrolü, bakiye/ledger ve önceden kaydedilmiş idempotent işlem sonuçları.
- Native SQLite çevrimiçi kopyasında WAL kayıtlarının bulunması, kaynak ana dosyanın değişmemesi, hedefin üzerine yazılmaması, backup integrity_check.
- Lonca yetki kontrolü, atomik ve tekrarsız bağış; davet edilen oyuncunun onayladığı, ödülsüz yerel düello.
- Savaş SQLite yeniden açıldığında aynı HP/düşman/sekansla devam; eski bağlantı revizyonunun reddi, süresi biten oturumun reddi.
- Özel/veri yolları ve kök dışına çıkan symlink engeli, manifest takma adları/çakışmaları, yanlış bundle sürümünde açık ret.

Gerçek Chromium tarayıcı gözlemi:

- Sunucu süreci doğrudan `node src/main.js` idi; Python sunucusu/proxy kullanılmadı.
- Yerel hesap sayfası ve özgün FGUI giriş/karakter ekranı açıldı.
- Karakter gerçek karakter oluşturma düğmesine tıklanarak SQLite'a kaydedildi.
- İstemcinin `//nicknamecheck` isteği için URL yorumlama hatası bulundu, düzeltildi ve otomatik teste eklendi.
- Dünya görüntülemesi tamamlanmadı: bulut istemci kopyasında `10001.bin`, `10001.dat`, küçük harita ve ses/Debug varlıkları eksik. Sonrasında istemci `displayObject` TypeError üretti. Bu gözlem başarılı harita testi sayılmadı; Android sahne/görsel doğrulaması yoktur.
- Bellekte dört bundle düzeltmesinin uygulanması ve kaynak bundle byte'larının değişmemesi ayrıca kontrol edildi.

Sınırlar:

- Resmî sunucu kodu, resmî savaş formülleri ve sunucudaki tüm sistemler mevcut değildir. Yerel savaş/ekonomi kuralları önceki VAVEYLA uygulamasından taşındı.
- Lonca/düello API'leri tüm özgün istemci özelliklerinin veya resmî PvP sisteminin yerine geçtiğini kanıtlamaz.
- Seviye80 testleri başlangıç karakterinin her düşmanı yenebileceği anlamına gelmez.
- 336 grup için dosya denetimi tam varlık envanteri, efekt/ses doğrulaması veya cihaz çizim testi değildir.
- Henüz doğrulanmamış işlevler sağlık yanıtında uyumlu/tam/cihazda test edildi olarak işaretlenmez.

1.0.1: sistem kanalı2, kalıcı XP/ödül/seviye mesajı, tekrarlanan ödülde tek kayıt, işlem hatasında hem ödül hem bildirim rollback, bildirim sahipliği/sayfalama ve görev958'in gerçek eşya115 paketi testleri eklendi. Gerçek şifreli WebSocket testinde +25 XP/+33 altın/eşya ve sistem mesajı beraber doğrulanır. İlk Chromium gözlemi 1.0.0 temel sürümüne aittir.
Canlı ödül güncellemesinin karakteri şehir koordinatına çekmemesi, mevcut savaş HP'sini 177/300 olarak koruması ve eğitim harita2'nin iki beceri tuşunu muhafaza etmesi ayrıca test edilir.

## Bütünleşik1.1.0 doğrulaması

Ek seçilmiş mesajlar gerçek kullanıcının sağladığı readable protobuf generated encoder'ı ayrı bir VM içinde çalıştırılarak karşılaştırıldı.239 mesajın örnek encoder byte'ları test vektörlerine kaydedildi. Eski141 mesajın Python karşılaştırması da korunur. Bu, bütün1543 mesajın veya bütün sunucu işlemlerinin tamamlandığı iddiası değildir.

Eski18 oyun referansında değişmeyen alanlar karşılaştırılır. Yeni uygulanan26/31/39/42/85/104 koşulları ve yeni açılan görevler, eski Python'un desteklemediği davranışı aynen taklit etmek yerine ayrı semantik testlerle doğrulanır. Eski referans JSON'ları değiştirilmedi.

İncelenen ek durumlar: sanal kaynak ödülleri, bağlı elmasla gerçek kaynak fiyatından mağaza alımı, satın alma limitleri ve tekrarları, yalnızca sahibi tarafından kullanılabilen eşya, bilinmeyen etkide eşyanın korunması, posta sahipliği/okuma/silme/ek alma, dolu çantanın tekil postaya aktarılması, yedi günün gerçek ödülleri, lonca davet/izin/katkı/geliştirme süresi, eski kaynak tablosu kısıtının yedekli geçişi, eski lonca bakiyesinin yalnızca bir kez aktarılması, NPC konuşmasının şehir koşulu,239 mesajın orijinal codec'i, gerçek soketler arası15005 ve15023 sohbet ve4256 profil yanıtı, dayanıklılığın mücadele girişinde bir kez harcanması ve iksirin gerçekten etkili olması.

Eğitim sırasında kullanılan XP kitabı5000 XP'yi korurken rehberin seviye1 koşulunu bozmaz. Uzun Unicode posta kutuları birden çok gerçek4853 paketine ayrılır; son sayfa işareti ve65535 byte sınırı test edilir. Normal303 zafer testi açıkça seviye80, seviye80 birlikler ve5000 dayanıklılık fixture'ı kullanır.

Görsel Android testi yapılmadı. Resmî formül, çok oyunculu/ranked PvP ve uygulama kapsamı dışında kalan sistemler başarılı sayılmadı. `IMPLEMENTATION.md` tam kapsam sınırlarını listeler.

# Ücretsiz market paketleri, moda, altı beceri yuvası ve Depo

Market: önceki ücretsiz çağrı yalnız elmas paketlerini tanıyor ve seçilen
paketin diğer kimliğini atıyordu. Native recharge artık productId/count ile
otherId/activeType'ı taşır. Sabit marketin ödülleri özgün t_s_giftpackage
Id/Type/Item/PurchaseLimit/NeedGrades alanlarından sunucuda okunur; istemcinin
gönderdiği ödüller kabul edilmez. ProductId eşleşmesi ve seviye denetlenir.
Günlük/haftalık/aylık sınırlar game_gift_purchases tablosunda kalıcıdır.
UTC05:00, pazartesi05:00 ve ayın1'i05:00 yerel sunucu sıfırlama politikasıdır.
Kaynak Item listesi para/VIP EXP/eşya normalleştirmesine verilir; dolu çanta
postaya yönlendirilir. HTTP request_id tekrarları ikinci ödülü vermez.
9061/4971 bilinen CampaignReqMsg köprüsü mevcut native sayaçları yeniler;
alışveriş sonrası bag/army/quest yeniden istenir. Market fiyatı0 olur;
ödeme SDK'sı çağrılmaz. Önceki iki alanlı ücretsiz elmas API'si korunur.
Etkinlik/season/pass paketleri bu sabit market uygulamasına dahil değildir.
Katalog bu arşivde yoktur; telefonun özgün res/release/config kataloğundan
okunur. check-market-catalog.js bunu salt okunur denetler. Eksik/bozuk içerik
ödül uydurularak tamamlanmaz.

Moda: sistem10103 kaynaktaki9. seviye koşuluyla açılır. Moda sekmesi önce
giyim/değiştirme panelini açar. Var olan kanat/şapka/silah/kıyafet
SonType109/110/111/112, bag4 slot8/9/11/10 kayıtlarından okunur. Kaydetme
sadece sahip olunan eşyaları giydirir; sınıf/cinsiyet/seviye ve çanta
kuralları normal inventory.move ile korunur. Görünürlük dört bayrak olarak
SQLite'ta tutulur. 301/9582/8625/4542 native mesajları bilinen CampaignReqMsg
ve özgün FashionInfo constructor/handler köprüsü kullanır. Avatar görünümü
fullArmy ve native Thane setter/commit ile yenilenir. Koleksiyon kitabı boş
başlatılır. Birleştirme, geliştirme ve değerlendirme bu değişiklikte
tamamlanmış değildir; giyme/kaydetme/gizleme temel akışı uygulanmıştır.

Beceri: özgün Oft.SKILL_NUM=6 ve native getter sondaki virgülü beklerken
sunucu yalnız beş yuva kabul ediyordu. Altı yuva ve son virgül kaydedilir;
legacy beş yuvalı istekler de kabul edilir. FullArmy ve64 native yanıtı
her zaman altı yuvalı/son virgüllü görünüm verir. Sadece öğrenilmiş aktif
beceri SonType'ları kabul edilir; pasifler ve tekrarlar reddedilir.

Depo: özgün30101/son301, ücretsiz, seviye1 ve varsayılan90101 Meclis ön
koşullu kayıttır. Eksik bina INSERT OR IGNORE ile tamamlanır; mevcut bina
seviyesi veya yükseltmesi değiştirilmez. 4154/4186 bina listesinde isExist
olarak gönderilir. Çanta6 depolama hareketi mevcut kuralları kullanır.
Eski Python karşılaştırmalarında yalnız bu kasıtlı yeni bina farkı ayrılır;
özgün diğer18 anlık görüntü alanları karşılaştırılmaya devam eder.

Kaynaklar ve SQLite kurulumdan önce yedeklenir. Yeni tablolar başlangıçta
additive oluşturulur. Android görsel doğrulaması burada yapılmamıştır.

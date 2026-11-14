# Uygulama kapsamı

Bu dosya, API'nin mevcut olması ile bir Android ekranının doğrulanmasını ayrı gösterir. Hiçbir satır bütün resmî oyunun bittiği anlamına gelmez.

| Sistem | Sunucu kapsamı | Doğrulama |
|---|---|---|
| Giriş/karakter | HTTP oturumu, saltlı parola, tek kullanımlık gateway bileti, özgün şifreleme | Gerçek WebSocket, eski SQLite ve önceki Chromium karakter oluşturma |
| Eğitim/savaş |6 avatar,5 eğitim savaşı, Dinah/boss/şehir;45 normal bölüm,91 harita,293 oluşum |303 gerçek sunucu zafer kaydı; üç alternatif yol |
| XP/ödül | Atomik ödüller, para kodları, XP bankası, bildirim ve tekrar engeli | İşlem/rollback ve şifreli aktarım testleri |
| Görev | Kaynak tabloları; boss, toplam bölüm, vergi, ertesi gün ve şehir konuşması ekleri | Sunucu koşul testleri; mevcut davranış referans karşılaştırması |
| Envanter | Taşıma/kuşanma/satış/düzenleme, kaynak para/XP iksirleri | Sahiplik ve atomiklik; bilinmeyen etki tüketilmez |
| Posta | Yerel metin ve sunucu ekleri; dolu çanta; doğru alıcı; sayfalı özgün yanıtlar | Tekrar ödül, izinsiz erişim ve Unicode paket sınırı |
| Mağaza | Kaynak ürün/fiyat, para seçimi, kaynak/limit/seviye kontrolleri | Para eksilmesi, limit, yetersiz bakiye ve istek tekrarı |
| VIP | Kaynak VIPEx ve -5500 ödülleri, eski paketlerden tek aktarım, Types4 seviyeleri, yerel UTC hediyeleri, inşaat/araştırma süre indirimi | Tekrar/rollback, SQLite yeniden açma, özgün4410/4409, kahramandan önce gelen mesajın ertelenmesi |
| Günlük | Kaynak7 ödül, UTC birikimli giriş, doğru istemci bit işareti | Yedi günün tamamı ve tekrarlar |
| Lonca | Temel üyelik/yönetim/davet/duyuru/bağış/seviye kuyruğu | Yetki, sahiplik, kalıcılık ve kaynak süre testi |
| Sohbet | Yerel dünya/harita/lonca, özgün özel IM, genel profil | Gerçek şifreli soketler arasında yönlendirme, sahte kimlik ve gizlilik |
| Şehir/asker/beceri | Kaynak bina koşulları; ayrı inşaat/araştırma; süre, hızlandırma; önceki asker/beceri kuralları | Bina2/3, eşzamanlı kuyruk, para/yeniden başlatma, özgün istemci sıra ayrıştırıcısı;18 eski işlem referansı |
| Meydan Oku/Baskın | Boş sıralama ile ilk bölümün açılması; gerçek ilk zaferle süreli baskın/sonuç/iptal/hızlandırma | Özgün düğme ve model kodu; şifreli seviye5 giriş;45 bölüm baskını; tekrar ödül/iade ve yeniden başlatma |
| Dayanıklılık | Kaynak200/20/5000; kayıtlı harcama/iksir; yerel günlük taban | Tekrar bağlanma, yetersiz bakiye ve gün değişimi |
| PvP | Yalnızca onaylı, ödülsüz yerel düello API'si | Davet/sahiplik/sonuç kalıcılığı; resmî PvP ekranı yok |

Henüz uygulanmış sayılmayanlar: resmî sıralamalı/çok oyunculu savaş, lonca savaşları/boss/altar sistemlerinin tamamı, bütün rastgele düşürme kuralları, çiftlik ve arkadaşlık sisteminin tamamı, binek/ruh/rün/astral sistemleri, bütün yüksek seviye etkinlikler, VIP/ödeme ve aylık ücretli telafi akışları. Kaynakta676 istek adı ve1543 mesaj tanımı bulunması, bu kuralların hepsinin istemcide bulunduğu anlamına gelmez. Seçilen249 mesaj, gerçek üretilmiş istemci encoder'ıyla karşılaştırılmıştır.

Yerel politikalar açıkça belirtilir: savaş ve PvP formülü, lonca katkısındaki önceki1:1 yerel birim, guild bankasının kaynak NeedOffer ile harcanması ve kaynak CodeTime süresi; UTC giriş/enerji politikası; şehir konuşmasının görev talebiyle onaylanması; dolu çantanın postaya aktarılması. Bunlar resmî sunucudan doğrulanmış kurallar olarak sunulmaz.

Android'de tüm haritalar, ekranlar, animasyonlar ve düğmeler doğrulanmamıştır. Bulut istemci kopyasında eğitim harita/ses dosyaları eksiktir. Önceki Chromium giriş/karakter oluşturma gözlemi1.0.0 temel sürümünündür; yeni özelliklerin tamamına ait görsel doğrulama değildir.

1.2.0 Baskın kapsamı: normal tek kişilik bölümler; kaynak güzergâh XP'si; yerel60 saniye/100 altın ayarı ve kaynak20 dayanıklılık. Eşya düşürme, zindan/pet/gizli alan baskınları ve VIP ücretsiz hızlandırma dahil değildir. Başarı kaydı olmayan bölüme baskın açılmaz. Yapay yüksek seviye test hesabının45 bölümden geçmesi, normal oyuncu dengelemesinin veya telefondaki bütün görsellerin doğrulandığı anlamına gelmez.

1.2.1: Eksik537 sistem açılış mesajı giderildi. Kaynak93 tanımdan yalnızca uygulanmış girişler, kendi seviye koşullarıyla gönderilir. Çanta5 ve beceri6 koşulu özgün istemci tablosundandır. Peri40 seviyesinde olsa bile işlemleri henüz uygulanmış değildir. Kimliği doğrulanmış `/api/game/systems` kapsamı gösterir.

1.2.2 görev eşitlemesi: özgün istemci görev geçmişini önkoşullardan önce yükler, teslim edilmiş tek seferlik görevleri temizler. Kaynak metot sırası regresyon testi ile karşılaştırıldı. Yalnızca eğitim45 teslimi için kayıtlı koşullarla yerel giriş kurtarması eklendi; diğer görevler otomatik teslim edilmez. Son20 bildirim ilk kullanıcı yüklemesinde tekrar gönderilir; bu, yeni ödül verilmesi anlamına gelmez. Android'de düğme tıklama ve sohbet görünümü henüz sınanmadı.

1.3.0: Yerel ücretsiz elmas politikası ve özgün elmas kartı tıklamasının ödeme SDK'sından ayrılması. Kaynak12 normal/plus elmas ürünü, sahip hesabına yükleme, sunucudan tutar belirleme, normal cüzdan defteri ve tekrar işlem koruması. VIP/ilk ödeme/gerçek sipariş başarı kaydı verilmez; diğer ücretli ürünler elmas olarak kabul edilmez. Fiyat ve döviz simgesi bellekte değiştirilir. Android ekranında henüz doğrulanmadı.

1.3.1: Özgün5155 ve5156 isteklerinin protobuf varsayılan boş listesi düzeltilir; asker satın alma ve rezervden yerleştirme sunucu testleri ile sınanır. Dolu ek alan, başka ordu kimliği ve sahip olunandan fazla asker talebi reddedilir; başarısız işlemler rezervi veya parayı değiştirmez.8203 bina önkoşulu korunur ve Termux açıklaması eklenir.8780 başarımlar hâlâ uygulanmış değildir.

1.4.0: Baskın önizlemesindeki kaynak eşyalardan tekrar başına bir adet liste sırasıyla veren yerel politika. Resmî düşürme oranı iddiası yoktur. Sonuçta yeni kazanılmış eşyalar, tekrar engeli, SQLite yeniden açma ve dolu çantadan postaya teslim test edildi. Yükleme donmasının kök nedeni ve Android görsel doğrulaması bekliyor; yeni `asset_errors` yalnızca teşhistir, eksik kaynakları onarmaz.

1.5.0 VIP kapsamı: elmas paketi puanı, kayıtlı eski paket aktarımı, -5500 VIP EXP ödülleri, seviye ve üç kaynak hediye türü. İnşaat/araştırma için kaynak29/30 süre indirimleri. Diğer VIP ayrıcalıklarının tümü, rulet, süreli VIP kartları ve arkadaş için VIP aktivasyonu henüz uygulanmış değildir. Günlük hediye UTC politikası ve ücretsiz paketlerden VIP kazanımı bağımsız yerel davranıştır; gerçek ödeme başarı kaydı oluşturmaz.

# Baskın penceresi: boş liste ve Onayla kilidi

Özgün MopupWnd kodunda üç bağlantılı sorun doğrulandı: çalışan sonuç satırları
listeye eklendikten sonra koşulsuz temizleniyordu; normal baskının periyodik
sonuç sorgulama zamanlayıcısı kurulmamıştı; btnStopClick yalnızca mopupEnd
bayrağı true ise çalışıyordu. Sunucu baskını doğru kaydetse de istemci sonucu
sorgulamadığı için bitiş bayrağı oluşmuyor ve boş pencere açık kalabiliyordu.

Tanınmış bundle'ın bellek kopyasında normal bölüm baskını için:

- Çalışan satır korunur ve yeni sorguda yenilenir; tamamlanan satırlar aynı
  bitiş sayısı için tekrar listeye eklenmez.
- Bir saniyelik sonuç sorgusu ve görünür geri sayım kurulur. Cevap beklerken
  sorgular sınırlanır; geciken yanıtta5 saniye sonra tekrar denenebilir.
- Tamamlanınca sorgulama durur; Onayla etkinleşir ve baskın denetleyicisinin özgün
  exit/hide/HideWind işlemleriyle pencereyi ve modal maskeyi kapatır. Devam ederken Kapat, mevcut Cancel isteğini gönderir.
- Pencere gizlenince veya yok edilince zamanlayıcı temizlenir.
- Girişte kayıtlı baskın Castle sahnesinde de açılır; yalnızca Space sahnesini
  bekleyerek tamponda kalmaz. Gecikmiş giriş yanıtı, kullanıcının kapattığı
  baskını tekrar açmaz.
- Aynı tanınmış JS dosyasına manifestte farklı adla erişilse de bellek yaması
  uygulanır; kaynak hash'i ve bütün yama hedefleri yine doğrulanır.

Sunucunun ödül, XP, eşya, maliyet, ilk zafer, süre, iptal ve iade kuralları bu
pencere düzeltmesinde değiştirilmez. Tamamlanmış baskını onaylamak yeni ödül
veya iade oluşturmaz. Bekleyen/biten SQLite kayıtları korunur.

Testlerde yalnızca sunucu cevabı veya setPage taklidi kullanılmadı: özgün gy
veri modeli, cz denetleyicisi, tam MopupWnd sınıfı ve Sn.OnBtnClose gövdesi
çalıştırıldı. Eski pencerenin boş satır/eksik zamanlayıcı/işlemeyen düğme hali
tekrar üretildi. Gerçek şifreli WebSocket ile başlatma→sonuç sorgulama→bitiş→
Onayla zincirinde tek SQLite ödülü ve pencere kapatma olayı doğrulandı.
FUI/atlas çizimi telefon üzerinde ayrıca gözlenmedi.

Güncelleyici önceki bütün düzeltmeleri de içerir; önce kaynak ve mevcut SQLite
veritabanı yedeğini alır. SQLite dosyası silinmez veya sıfırlanmaz. Özgün
istemci JS dosyası diskte değiştirilmez; eski oyun sekmesinin kapatılıp yeni
paketin bellek yamasıyla yeniden giriş yapılması gerekir.

## Onayla düğmesi için ikinci düzeltme

Önceki test kapatma olayını taklit eden bir alıcı kullanıyordu; bu, gerçek
pencere yöneticisinin isOpen (stage/visible/parent) koşulunu ve gerçek En
MOUSE_DOWN/MOUSE_UP düğme bağlantısını doğrulamıyordu. Artık bu özgün
metotlar da kaynak bundle'dan alınarak çalıştırılır. Başlat düğmesinin
çalışma biçimi ve sunucu baskın kuralları değiştirilmez.

Normal baskında btnStop/btnClose ve kayıtlı Onayla düğmeleri onClick ile
kapatma işlemine bağlanır; önceki callback değiştirilir, ikinci dinleyici
eklenmez. Bölüm kimliği şablon yoksa pencere/model kimliğinden alınır.
Cancel gönderimi hata verse de finally içinde denetleyicinin exit işlemi
çalışır; sorgu zamanlayıcısı, model.isMopup ve modal pencere temizlenir.
Gecikmiş giriş yanıtının yeniden açılması engellenir. Bu işlem yeni ödül
vermez; tamamlanan baskının ödülü zaten sunucuda tek kez kaydedilmiştir.

Testler gerçek En pointer olaylarıyla başlatma ve Onayla, gerçek Wr
exit/hide/HideWind/dispose, eksik şablon, gönderim hatası ve pencere
yöneticisinin stage koşuluna takılan görünüm durumlarını kapsar. Telefonun
FUI çizimi bu ortamda çalıştırılamadığı için Android görsel doğrulaması
yapılmış sayılmaz.

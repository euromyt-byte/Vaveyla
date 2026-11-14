# Çanta/karakter açılışı ve Türkçe özellikler

Özgün n0 veri yöneticisinde fashionList başlatılıyor ama fashionInfoMsg yalnızca
sunucudan U_C_FASHION_INFO cevabı geldiğinde atanıyor. Bu sunucuda kostüm
sistemi cevabı uygulanmamış. SRoleWnd.OnShowWind, updateHideFashionBtnState
çağrısında tanımsız fashionInfoMsg.status okuduğu için karakter/eşya/özellik
başlatma zinciri kesilebiliyor. Özgün metotlarla bu hata testte üretildi.

Tanınmış bundle'ın bellek yaması, n0 kurulurken boş özgün i0 mesajı ve
status='1,1,1,1' (gizlenmeyen varsayılan görünüm) oluşturur. Gerçek kostüm
cevabı daha sonra gelirse özgün işleyici bu bilgiyi normal biçimde değiştirir.
Kostüm, kanat, eşya veya nitelik verilmez; veritabanı değişmez.

SRolePropertyCom.onConstruct içindeki 力量/6543218 tasarım metni kaldırılır.
Başlangıç alanları Türkçe adlar ve0 gösterir; setData/updateView özgün karakterin
baseProperty ve attackProrerty değerleriyle dolar. Etiketler Güç, Çeviklik,
Zekâ, Dayanıklılık, Liderlik, Fiziksel/Büyülü Saldırı/Savunma, Can ve Birlik
Kapasitesi olarak Türkçeleştirilir.0 veya6543218 gerçek veri gibi uydurulmaz.

Termux başlatıcısı, VAVEYLA_ASSET_DIR veya kullanıcının verdiği
/storage/emulated/0/DCIM/webroot_web dizini varsa --asset-root ile kullanır.
Hazırlanmış istemcide eksik olan res/ kaynakları mevcut güvenli Assets
çözücüsüyle bu özgün dizinden aranır. Özel dosyalar sunulmaz, istemci
dosyaları değiştirilmez ve eksik resim uydurulmaz.

node scripts/diagnose-bag-visuals.js
komutu gerçek telefonda katalogdaki eşya simgeleri ve altı varsayılan karakter
parçası için dosya varlığını raporlar. Yalnızca JS/kataloglar bu çalışma
ortamına yüklendiği için telefonun FUI/atlas dosyalarının varlığı veya görsel
sonucu burada doğrulanamaz. Bazı resimler hâlâ yoksa /api/client-diagnostics
çıktısı ile bu rapor eksik kaynakları ayırmak için gerekir.

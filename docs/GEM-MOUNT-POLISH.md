# Takılı mücevherlerin savaş gücü ve binek ana ekranı

Takılı (fiziksel bag4) eşya demircide sanal bag0 gösterilirken stats SQL'i
onu tamamen dışlıyordu. Artık fiziksel olarak takılı ekipman, güçlendirmesi
ve mücevherleri sahnelenirken de hesaplanır. Çantadan sahnelenen ekipman
stat vermez. Yerel mevcut savaş gücü formülü korunur: örneğin HP+880 taşı
max_hp+880 ve FC+176 verir. Sahneleme/geri alma gücü açıp kapatmaz.

Binekler listesini açmak artık ücretsiz kalıcı Sfenks sahipliğini idempotent
olarak kaydeder. Bu her karakter için ayrı uygulanır; kart/para gerektirmez.
Geçerli bir seçim yoksa sahip olunan mevcut bineklerden biri, yoksa Sfenks
seçilir. Önizleme hazırlanır; otomatik binilmez. Mevcut geçerli seçim ve
binme durumu korunur. Var olan binekler ve süreleri silinmez.

Mount state cevabı source büyüme/özellik sınıflarını sıfır GP ile başlatır,
özellik üst sınırı yerel1 olur ve sahiplik bonuslarını doğru alanlara koyar.
Gerçek eğitim/geliştirme işlemi bu kapsamda eklenmemiştir. Boş _templateId=0
ana ekranı artık geçerli bir sahipliğe bağlanır. İstemci tüm ordu modellerini
önce günceller/commit eder; ardından binek arayüzü event'i gönderilir. Arayüz
listener hatası, uygulanmış seçimin avatar güncellemesini engellemez.
Özgün Jp/Qp ve WildSoulItem.mountBtnClick ile ağ testi yapılır.

Gerçek ödeme kapalı ifadesi kaldırıldı. Elmas paketi olmayan ve ödül tanımı
henüz bulunmayan market ürünleri açıklayıcı eksik içerik mesajı verir;
ödemeye yönlendirilmez ve başarısız istekten ödül uydurulmaz. Diğer özel
paketlerin ödülleri bu değişiklikte uygulanmış değildir.

Kurulum önce kaynak/SQLite yedeği alır. Sfenks Binekler açıldığında ücretsiz
hazır olur. Sunucu yeniden başlatılıp eski oyun sekmesi tamamen kapatılarak
yeni sekmede giriş yapılmalıdır. Gerçek Android görsel kontrolü yapılmadı.

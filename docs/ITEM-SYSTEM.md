# Eşya kullanımı, EXP kitapları ve demircilik

## Gerçek kaynak kuralları

- 2030703 Büyük EXP Kitabı: doğrudan5000 EXP (önceki kural korunur).
- 2013002 Büyük EXP Kitabı: SonType201/Property1=2030;60 dakika boyunca
  normal bölüm ve baskın EXP'sine +%100. Aynı gruptaki diğer kitaplar
  katalogdaki yüzde/süreyle çalışır. Görev/kitap EXP'si ve eğitim senaryosu
  bu bonusla çarpılmaz. Bonus SQLite'ta süre sonuyla saklanır.
- Aynı yüzdeli kitap kalan süreyi uzatır; daha zayıf kitap güçlü etkin
  bonusu ezmez ve tüketilmez. Daha güçlü kitap kendi süresini başlatır.
- 2060407 Ruh Kristali Paketi: kaynak drop2060407,208014 eşyası x100.
  AppearType1/Random100/süresiz ve miktarı belli paketler aynı kuralla açılır.
  Para ödülleri mevcut negatif kaynak eşya eşleştirmesinden geçer.
  Bilinmeyen kaynak veya seçmeli grup sessizce garantiliye çevrilmez;
  bu güncelleme o gruplara yeni bir düşme kuralı uydurmaz.
- Paket tüketimi/ödülü tek SQLite işlemi içindedir. Eşya taşması mevcut posta
  kuralını kullanır; hata durumunda tüketim de geri alınır.

## Demirciliğin0 çantası

İstemci ekipmanı5005 ile hr.Hide=0 alanına yerleştirir. Önceki denetim yalnızca
1/4/6 çantalarını kabul ettiği için integer(0,1,6) hata veriyordu.
Yeni game_forge_stage tablosu geçici0/1 demircilik yerlerini kaydeder; mevcut
oyuncu eşyası taşınan referanstır, çoğaltılmış bir ekipman değildir.
Fiziksel game_items şeması/kimlikleri korunur. Şans taşı yığınından seçilen
adet ayrı bir kayıt olarak ayrılır.0 alanındaki eşya satılamaz veya başka
bir işlemde tüketilemez. Yeniden girişte geçici referans çözülerek eşya
özgün çanta/ekipman konumunda görünür.

5150 güçlendirmesi özgün istemcideki altın formülünü ve100-grade*10
(minimum%10) başarı oranını kullanır. Şans taşı Property1 kadar şans ekler,
üst sınır%100'dür. Seviye, eşya StrengthenMax, sahiplik ve altın denetlenir.
Başarısızlıkta ekipman/seviyesi korunur; deneme altını ve seçilen tek şans
taşı harcanır. Başarı grade+1 yapar. İstemcideki floor(base*grade*.1+5*grade)
artışı yalnızca ilgili temel özellik0 değilse uygulanır. Güçlendirme görev
koşulu17 mevcut eşyadaki kayıtlı güçlendirmeyi okur.

Yeni tablolar sqlite-schema.json.additional_sql üzerinden mevcut Store
başlangıcında eklenir; var olan tablo/veri silinmez. Enhancement kaydı eşya
kimliğine FK ile bağlanır; eşya satıldıktan sonra yeni eşya aynı SQLite
kimliğini alsa bile eski güçlendirmeyi alamaz. Yer değiştirme kimlikleri
korur, Arrange güçlendirme metadatasını korur.

## Protokol doğrulaması

Özgün StoreRspMsg şeması sağlanan katalogda bulunmuyor. Etiket uydurulmadı:
86 cevabı mevcut item.ItemInfoMsg içinde VAVEYLA_FORGE_V1 işaretiyle kodlanır;
tanınmış bundle'ın native ForgeCtrl işleyicisi bunu özgün sonuç nesnesine
çevirir.5150 isteği mevcut campaign.CampaignReqMsg içinde eşya kimliği,
beklenen seviye ve tekil deneme anahtarı taşır. Aynı anahtar/fingerprint
SQLite makbuzunu döndürür, tekrar ücret veya geliştirme oluşturmaz.
Gecikmiş sonuç başka bir eşyaya uygulanmaz. Kaynak hatasında başarısız cevap
ve sistem mesajı ile düğme yeniden açılır. Eski oyun sekmeleri kapatılmalıdır.

Gerçek şifreli WebSocket ile5005→5150→86, SQLite yeniden açılması,
başarı/başarısızlık, şans taşı bölme, yetersiz altın geri alma, sahiplik,
üst sınır, tekrar istekleri, swap/Arrange/satma/kimlik yeniden kullanımı,
EXP süresi ve normal savaş/baskın EXP'si test edildi. Android'deki gerçek
FUI çizimi bu ortamda doğrudan çalıştırılmadı.

Rastgele AppearType4 paketleri ve doğrudan binek kartı kullanımı sonraki
RANDOM-PACKAGES.md kurallarıyla genişletilmiştir.

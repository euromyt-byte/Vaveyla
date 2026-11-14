# Bölüm sonu ve beş kartlı ödül akışı

Bölüm temizleme, katalogda NodeState=9 olan pasif ek savaşları zorunlu saymaz.
Görünür gerekli savaşların ve bossun gerçek zafer kayıtları korunur; yenilmeyen
bir düşmana öldürme veya XP yazılmaz. Mevcut takılmış koşuda kayıtlı zaferler
bu koşulu sağlıyorsa bölüm, tekrar savaş ya da tekrar dayanıklılık gerektirmeden
tamamlanabilir. Önceden verilmiş bölüm XP'si tekil olayla korunur.

Zafer işleminde mevcut koşu/eğitim JSON'una kalıcı, rastgele token taşıyan bir
beş kart planı yazılır. Yerel ödül politikası: bölümün campaign.Item önizlemesi
sırasından kartlara birer bağlı eşya yerleştirilir; tek ücretsiz seçim vardır.
Eğitimin yeni boss bitişinde ilk normal bölümün önizlemesi kullanılır. Bu bir
resmî rastgele düşürme tablosu değildir. Eski seviye5+ oyuncuların çoktan
bitirdiği eğitim için yeni bir ödül penceresi üretilmez.

İstemcinin özgün CampaignReportMsg ve CampaignTakeCardsMsg alan etiketleri
sağlanan seçilmiş protobuf şemalarında yoktur. Etiketler tahmin edilmez.
Yerel köprü, doğrulanmış CampaignReqMsg.paraString1 içinde sürümlü JSON
zarfıyla137/26 paketlerini taşır. Tanınmış bundle'ın HTTP bellek kopyasındaki
iki alıcı metot bu zarfı özgün pencerenin beklediği nesneye dönüştürür. Gerçek
ChestFrame, beş kart, EXP alanı, kart çevirme ve seçildikten sonraki çıkış
metotları kullanılır. Özgün istemci dosyası diskte değiştirilmez; bu aktarımın
resmî sunucu paketleriyle birebir aynı olduğu iddia edilmez.

5122 seçimi: oturum sahibi, ordu kimliği,0–4 kart indeksi, koşu token'ı,
kayıtlı zafer ve güncel plan sunucuda kontrol edilir. Eşya teslimi ve planın
alındı kaydı tek SQLite işlemidir. Aynı veya farklı kartla tekrar talep ikinci
ödül vermez; ilk seçimin yanıtı döner. Başka bağlantıda alınmış ödül de aynı
kalıcı kayıttan okunur. Dolu çantada mevcut atomik posta taşması kullanılır.

Ödül seçilmeden çıkış, bölüm değiştirme ve baskın başlatma engellenir. Normal
savaş bitişindeki özgün kısa animasyon geçişiyle mücadele haritasına dönülür;
ödül penceresi bu haritada açılır. Eski12/14 saniyelik koşulsuz şehir dönüşü
bu akıştan çıkarılmıştır. Seçim yanıtından sonra özgün kart penceresi8 saniyede
5180 gönderir; sunucu kaydedilmiş seçim sonrasında9 saniyelik yedek dönüş de
sağlar. Bağlantı kesilirse bekleyen plan yeniden açılır; seçilmiş ödül yeniden
verilmez.

Görevler gerçek kill/campaign_clear olaylarından ilerler. Görevin diğer
koşulları tamamlanmadan sahte görev teslimi yapılmaz. Sonuç, görev, EXP ve
seçilen eşya mevcut83 sistem sohbetine senkronize edilir.

Doğrulama: 45 bölüm/91 harita ve alternatif güzergâhlar; bekleyen ödülle tekrar
giriş; özgün kart penceresinin OnShowWind, kart seçimi, çevirme ve çıkış
metotları; gerçek şifreli WebSocket137→5122→26→5180→22 akışı; SQL yazma
hatasında geri alma; SQLite yeniden açma; tekrar seçim ve dolu çanta/posta.
Telefon üzerinde FUI/atlas çizimi ayrıca gözlenmemiştir.

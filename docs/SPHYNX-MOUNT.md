# Sfenks Muhafızı — VAVEYLA özel bineği

TemplateId990001, AvatarPath /mount_vaveyla_sphynx, Normal sekmesi Sort0.
Özgün katalog 463 binek içeriyor; en büyük kaynak kimliği20004 idi. Kaynak
kaydı silinmez/değiştirilmez. Çakışan özel kimlik reddedilir.

Oyuncu Normal sekmesinde Etkinleştir'e basarak ücretsiz ve kalıcı açar.
Kart, elmas veya altın harcanmaz. Sonra Bin/Değiştir ile seçer; İn düğmesi
binekten indirir. Aktif seçimi game_mount_state ek tablosunda, sahipliği
mevcut game_mounts tablosunda saklanır. Tablo additive oluşturulur, mevcut
SQLite sıfırlanmaz. Seçili olmayan karakterlerin eski snapshot yapısı
korunur. Binek savaş istatistiklerini veya hızı artırmaz, uçamaz.

Kullanıcının referansındaki pembe tüysüz sfenks, turkuaz gözler, mavi-altın
zırh/saddle görselleri yeni üretildi. İnsan binici görsele gömülmez; istemci
oyuncunun kendi avatarını ayrıca yerleştirir. Harita atlası özgün55 kare
adını ve ekstra bağlantı parametrelerini, önizleme26 kare adını korur.
Yürümede 5 yön ve4 çizim pozu kullanılır,8 karelik döngüye yinelenir; duruş
kareleri sabit pozdur. Sol yönler istemcinin normal aynalama akışındadır.
Küçük liste önizlemesi (_s) ve büyük önizleme için ayrı JSON ad alanı vardır.
Yeni PNG'ler şeffaf RGBA'dır, atlas sınırları test edilir.

Görseller yalnızca res/animation/{swf/avatar,equip_show}/mount_vaveyla_sphynx
ve equip_show/mount_vaveyla_sphynx_s altında sunulur. Telefonda özgün oyun
klasörüne yazılmaz; proje data/custom-mount içinde tutulur. version.zip
elle düzenlenmez. İstemcinin parseConfigToDic aşamasında özgün iat sınıfıyla
kayıt eklenir, hem ZIP hem tek JSON yüklemesinde aynı yol kullanılır.

8532 seçme ve8533 bin/in, bilinen CampaignReqMsg köprüsünü kullanır;
4426 aynı bilinen mesajın VAVEYLA_MOUNT_STATE_V1 JSON işaretli cevabıdır.
Bilinmeyen protobuf etiketleri tahmin edilmez. Yerel ordu, Gökyüzü Şehri
karakteri ve varsa kampanya karakteri mountTemplateId setter/commit ile
yenilenir; sahne yeniden açılmaz. 4427 mevcut sahiplik listesi korunur.

Ücretsiz etkinleştirme, tekrar basma, sahiplik reddi, süresi bitmiş kayıt,
SQLite yeniden açılması, Türkçe özgün şablon sınıfı, atlaslar/HTTP ve şifreli
WebSocket seç/bin/in akışı test edilir. Gerçek Android görsel testi burada
yapılmamıştır; oyuncu-binek oturma hizası telefonda kontrol edilmelidir.

Kurulumdan önce kaynaklar ve mevcut SQLite tutarlı yedeklenir. Sunucu yeniden
başlatılır, eski oyun sekmesi kapatılır ve yeni sekmeden giriş yapılır.

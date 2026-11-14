# Görev 944: 10 seviye ekipman donat

Kaynak katalog: questtemplate944, önkoşul130, koşul tipi4,
Para1=10 (eşyanın NeedGrades seviyesi), Para2=1 (takılı parça sayısı).
Koşul4 desteklenmediği için kabul edilmiş görev de sürekli0/1 kalıyordu.

Koşul, aynı karakterin game_items tablosunda bag=4 (takılı ekipman)
kayıtlarını okuyarak MasterType=1 ve NeedGrades>=10 parçalarını sayar.
Çanta/depo, başka karakterin eşyası, düşük seviye ekipman sayılmaz.
Karakter seviyesi ve güçlendirme seviyesi eşyanın kullanım seviyesi değildir.
Önceden takılmış ekipman ve yeniden giriş mevcut SQLite durumundan hesaplanır;
canlı kayıt veya görev önkoşulları elle değiştirilmez. Çıkarılan eşya artık sayılmaz.

Mevcut5005 ekipman hareketi zaten112 görev güncellemesi gönderiyor;
5014 ödül isteği kaynak2000 altını tek kez verir. Yeni kod bu paketlerin
şemasını, ödülü, sonraki görevleri veya ekipman takma kurallarını değiştirmez.

Altı avatar için düşük/yeterli/yüksek seviyeli ekipman, takma/çıkarma,
sahiplik, SQLite yeniden açılması ve tekrar ödül engeli sınandı.
Şifreli WebSocket testinde5005→112 ve5014→52 zinciri de doğrulanır.

# Yerel API

HTTP: `127.0.0.1:8080`. Hesap işlemleri JSON alır. Oyun ve oyuncu uç noktalarında `Authorization: Bearer <token>` gerekir. Sunucu hesabı token üzerinden seçer; istemciden gelen `account_id` sahiplik yetkisi sağlamaz.

| İşlem | Yol | Gövde |
|---|---|---|
| Hesap oluştur | POST /api/register | `{ "username": "oyuncu", "password": "en-az-10-karakter" }` |
| Oturum aç | POST /api/login | aynı alanlar; yanıtta token |
| Hesap/karakter | GET /api/me | yok |
| Bildirim geçmişi | GET /api/game/notifications?after=0&limit=100 | yok; hesap sahibiyle sınırlı |
| Oyun durumu | GET /api/game | yok |
| Oyun işlemi | POST /api/game/OPERATION | `{ "request_id": "benzersiz-istek-1", "data": { ... } }` |
| Loncalar | GET /api/game/guilds | yok |
| Düello | GET /api/game/duels/ID | yok |
| Eğitim kaydı | GET /api/training-status | yok |
| Destek kapsamı | GET /api/capabilities | yok |
| Tanı sonucu | GET /api/client-diagnostics | yok |
| Oyuncular | GET /api/admin/players | yönetici anahtarı gerekir |
| Elmas bakiyesi | POST /api/admin/players/CHARACTER_ID/diamonds | `{ "amount": 500, "reason": "yerel yönetim" }`, yönetici anahtarı gerekir |

`request_id` aynı veriyle tekrar gönderilirse önceki sonuç döner. Aynı kimlik farklı veri/işlemle kullanılırsa reddedilir. Elmas, ödül, görev ve envanter değişimleri atomik SQLite işlemlerindedir. Alanlar tam olmalı; bilinmeyen alanlar sessizce kabul edilmez.

Desteklenen işlem adları ve zorunlu `data` alanları:

| İşlem | Alanlar |
|---|---|
| quest.accept | quest_id |
| quest.claim | quest_id, selected_item |
| inventory.move | item_id, bag, position, count |
| inventory.arrange | bag |
| inventory.sell | item_id, count |
| building.create / building.upgrade | son_type |
| army.recruit / army.dismiss | template_id, count |
| army.deploy | template_id, slot, count |
| army.upgrade | template_id |
| army.formation | hero_pos, pawn_pos |
| tax.collect | boş nesne |
| skill.learn | template_id |
| skill.equip | fast_keys |
| world.enter | map_id |
| world.move | x, y, revision |
| guild.create | name |
| guild.apply | guild_id |
| guild.application | character_id, accept |
| guild.transfer / guild.kick | character_id |
| guild.rank | character_id, rank |
| guild.leave | boş nesne |
| guild.donate | amount |
| duel.invite | target_id |
| duel.reply | duel_id, accept |

Özgün oyun WebSocket'i: `ws://127.0.0.1:8081/ws`. Binary paketler ve protokol giriş sırası gerekir. 20001 için HTTP oturumuna bağlı, geçerli ve tek kullanımlık bilet gerekir. Kullanılmış biletle otomatik tekrar giriş yetkilendirilmez; istemciye eklenen kurtarma kodu tekrar hesap/gateway girişi başlatır.

Geliştirici JSON WebSocket'i: `ws://127.0.0.1:8765/ws`:

```json
{"id":"1","type":"auth","data":{"token":"HTTP_GIRIS_TOKENI"}}
```

Ardından `character.list`, `character.create` (`name`, `archetype`: warrior/archer/mage), `game.state`, `game.bootstrap`, `game.action` (`operation`, `request_id`, `data`), `ping`. Bu JSON protokolü özgün oyun istemcisinin binary protokolünden ayrıdır. Her yetkili istekte oturum tekrar doğrulanır.

Yönetim `X-Admin-Token` veya yönetici anahtarını içeren Bearer başlığı kullanır; sıradan oyuncu oturumu yönetim yetkisi vermez.

## 1.1.0 hizmet uç noktaları

Tüm `/api/game/*` uç noktaları oyuncu Bearer oturumu ister.

| GET | Sonuç |
|---|---|
| /api/game/mail | Yalnızca hesap sahibinin postaları ve ek durumu |
| /api/game/shop | Kaynak katalog ve kişisel satın alma sayıları |
| /api/game/daily | Giriş günü, birikimli günler ve ödül bitleri |
| /api/game/chat?peer=PLAYER_ID | Yalnızca bu oyuncu ile hesap sahibinin özel geçmişi |

Yeni POST işlem adları, mevcut request_id/data zarfını kullanır:

| İşlem | data alanları |
|---|---|
| inventory.use | item_id, count |
| shop.buy | shop_id, count, pay_type |
| mail.send | recipient, subject, body |
| mail.read / mail.claim / mail.delete | mail_id |
| daily.sign | boş nesne |
| daily.claim | day |
| guild.edit | description, placard |
| guild.open | enabled |
| guild.invite | character_id |
| guild.invite_reply | invite_id, accept |
| guild.upgrade | boş nesne |

Oyuncu kimliği ile fiziksel karakter kimliği aynı kabul edilmez. `mail.send.recipient`, özel sohbet peer ve özgün profil istekleri network PLAYER_ID kullanır. Lonca API üyelik işlemleri açıkça CHARACTER_ID kullanır; özgün lonca paketleri istemcinin beklediği kimliğe çevrilir.

Yönlendirme kapsamı `/api/protocol-coverage` içinde bulunur. `router_present` ilgili komutun kodda işlendiğini söyler; bütün varyantlarının veya Android arayüzünün doğrulandığını söylemez. Ücretli/VIP/etkinlik koşulları bilinmeyen ürünlerde uydurma başarı yanıtı gönderilmez. Sanal para ve fiziksel eşya ödülleri aynı atomik ödül akışına girer.

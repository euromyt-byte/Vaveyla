// Keep rule-specific explanations; translate bare error identifiers for players.
const errors = {
  unknown_skill: "Beceri kaydı özgün katalogda bulunamadı.",
  talent_level: "Yetenek için karakter seviyen yeterli değil.",
  talent_points: "Önce merkezdeki yetenek seviyesini geliştirerek puan kazan.",
  talent_grade: "Bu yetenek için merkezdeki yetenek seviyesini yükseltmelisin.",
  talent_sequence: "Yetenek kademelerini sırayla öğrenmelisin.",
  talent_prerequisite: "Önce ağaçtaki bağlı önceki yetenekleri öğrenmelisin.",
  talent_job: "Bu yetenek karakterinin mesleğine ait değil.",
  talent_max_grade: "Özgün katalogdaki yetenek seviye sınırına ulaşıldı.",
  talent_effect_missing: "Bu yeteneğin özgün etki kaydı eksik; puan harcanmadı.",
  fashion_skill_missing: "Bu moda için özgün değerlendirme becerisi veya özellik kaydı eksik; kaynaklar korundu.",
  fashion_appraisal_max: "Bu moda değerlendirmesi en yüksek kademede.",
  invalid_source_catalog: "Özgün katalog alanları beklenen biçimde değil; işlem uygulanmadı.",

  craft_level: "Bu tarif için seviyen yeterli değil.",
  invalid_recipe: "Birleştirme tarifi geçerli değil; malzemelerin korunuyor.",
  unknown_recipe: "Bu tarif özgün oyun kataloğunda bulunamadı.",
  invalid_transform: "Bu iki eşya aynı dönüştürme grubunda değil.",
  invalid_fashion_material: "Moda birleştirmeye moda eşyası, Moda Ruhu veya Moda Şans Taşı koymalısın.",
  craft_request_conflict: "İşlem bilgisi değişti; eşyayı tekrar seç.",
  skill_effect_unsupported: "Bu becerinin etkisi henüz sunucuda uygulanmadı.",

  reward_pending: "Önce savaş ödülünü seçmelisin.",
  reward_not_ready: "Bu savaşın ödülü hazır değil veya bağlantın güncel değil. Yeniden giriş yapmalısın.",
  invalid_reward_request: "Ödül seçimi geçerli değil. Beş karttan birini seçmelisin.",
  insufficient_funds: "Bu işlem için yeterli paran veya kaynağın yok.",
  insufficient_stamina: "Bu işlem için yeterli dayanıklılığın yok.",
  inventory_full: "Çantanda yeterli boş yer yok.",
  item_not_owned: "Bu eşya çantanda bulunamadı veya sana ait değil.",
  item_level: "Bu eşyayı kullanmak için seviyen yeterli değil.",
  invalid_value: "İşlem için geçerli bir miktar veya seçim gerekli.",
  campaign_busy: "Başka bir mücadele açık. Önce mevcut bölümden çıkmalısın.",
  campaign_not_completed: "Bu bölüm henüz tamamlanmadı.",
  campaign_closed: "Bu mücadele sona ermiş. Yeniden bölüm seçmelisin.",
  unsupported_campaign: "Bu mücadele bölümü henüz kullanılamıyor.",
  campaign_arrival_map: "Bu hedef bulunduğun mücadele haritasında değil.",
  stale_battle: "Savaş başka bağlantıda değişti. Yeniden giriş yapmalısın.",
  sweep_busy: "Bir baskın sürüyor. Önce bitmesini bekle veya iptal et.",
  quest_unavailable: "Bu görev henüz alınamıyor; görev koşullarını kontrol et.",
  quest_not_complete: "Görevin bütün koşulları henüz tamamlanmadı.",
  building_queue_full: "Bu geliştirme sırasında başka bir işlem sürüyor.",
  skill_level: "Bu beceri için seviyen yeterli değil.",
  mail_has_attachment: "Postayı silmeden önce ekindeki ödülü almalısın.",
  chat_attachment_unsupported: "Bu sohbet eki henüz desteklenmiyor.",
  invalid_chat_channel: "Bu kanala mesaj gönderilemez.",
};
export function systemErrorText(error) {
  if (error.message && error.message !== error.code) return error.message;
  return errors[error.code] ?? "İşlem tamamlanamadı. Gerekli koşulları ve seçimini kontrol et.";
}
export function unavailableFeatureText(code) {
  const name = {
    5122: "Savaş ödül kartı", 8780: "Başarımlar", 8782: "Çevrimiçi ödüller",
    8788: "Çevrimiçi ödül onayı", 8529: "Binek düzenleme", 8530: "Binek görünümleri",
    8847: "Lonca bossu çağırma", 8846: "Lonca bossu geliştirme",
  }[code];
  return name ? name + " bu sunucuda henüz kullanılamıyor." : "İstenen oyun özelliği bu sunucuda henüz kullanılamıyor.";
}

import {packagePlan,drawPackage} from "./item-effects.js";
import { need, integer, nonce, MAX, job, casefold } from "./util.js";
import { services, table, title, config } from "./catalog.js";
const shops = new Map(services.shop.map((r) => [r.Id, r]));
const virtual = {
  [-5500]: "vip_xp",
  [-100]: "gold",
  [-200]: "crystals",
  [-300]: "souls",
  [-400]: "diamonds",
  [-500]: "bound_diamonds",
  [-600]: "strategy",
  [-700]: "xp",
  [-800]: "glory",
  [-900]: "blank_pet_cards",
};
export const serviceRules = {
  consumeItemRequest(r,req){
    integer(req.id,1);integer(req.template_id,1);integer(req.bag,0,6);integer(req.pos,0,99);integer(req.count,1);
    const key=/^VAVEYLA_ITEM_USE_V1:([0-9]+):([0-9]+):[a-z0-9-]{6,64}$/.exec(req.token);need(key&&Number(key[1])===req.id&&Number(key[2])===req.template_id,"invalid_item_use_request");
    const old=this.get("select * from game_item_use_actions where character_id=? and token=?",r.id,req.token);
    if(old){need(old.item_id===req.id&&old.template_id===req.template_id&&old.bag===req.bag&&old.pos===req.pos&&old.count===req.count,"item_use_request_conflict");return JSON.parse(old.result_json);}
    const item=this.item(r,req.id);need(item.bag===req.bag&&item.position===req.pos&&item.template_id===req.template_id,"item_not_owned");
    const result=this.useItem(r,item.id,req.count);
    this.run("insert into game_item_use_actions values(?,?,?,?,?,?,?,?)",r.id,req.token,item.id,item.template_id,req.bag,req.pos,req.count,JSON.stringify(result));return result;
  },
  resource(r, key, delta, reason = "local_service") {
    need(/^[a-z_]{1,40}$/.test(key), "invalid_resource");
    integer(Math.abs(delta));
    const before =
      this.get(
        "select amount from game_resources where character_id=? and currency=?",
        r.id,
        key,
      )?.amount ?? (key === "stamina" ? +config("Player_weary", 200) : 0);
    const after = before + delta;
    need(
      after >= 0 &&
        after <= (key === "stamina" ? +config("Weary_Limit", 5000) : MAX),
      after < 0
        ? key === "stamina"
          ? "insufficient_stamina"
          : "insufficient_funds"
        : "currency_limit",
    );
    this.run(
      "insert into game_resources values(?,?,?) on conflict(character_id,currency) do update set amount=excluded.amount",
      r.id,
      key,
      after,
    );
    if (delta)
      this.run(
        "insert into game_resource_ledger(character_id,currency,delta,before_amount,after_amount,reason,created_at) values(?,?,?,?,?,?,?)",
        r.id,
        key,
        delta,
        before,
        after,
        reason,
        this.now(),
      );
    return after;
  },
  useItem(r, id, count) {
    const i = this.item(r, id);
    integer(count, 1, i.count);
    need(i.bag === 1 && !this.forgeStage(r,id), "item_equipped");
    const t = table("itemtemplate")[i.template_id];
    need(t.MasterType === 2 && r.level >= t.NeedGrades, "item_level");
    need(count === 1 || t.IsCanBatch, "item_not_batch");
    if(t.SonType===218){
      need(count===1,"mount_card_single","Binek kartları tek tek kullanılır.");
      const already=this.ownedMounts(r).some(m=>m.template_id===Number(t.Property1));
      const mount=this.activateMount(r,Number(t.Property1),0,id);
      if(already)this.notice(r,"mount-card-owned:"+id+":"+this.now(),"mount","Bu binek zaten etkin; kartın çantanda kaldı.");
      else this.fact(r,"item_use",i.template_id,1);
      return {item_id:id,used_count:already?0:1,mount};
    }
    const pack=packagePlan(t);
    if(pack){
      this.normalizeReward({items:[...pack.fixed,...pack.weighted].map(({template_id,count,bound})=>({template_id,count,bound}))});
      const items=drawPackage(pack,count,this.packageRoll);
      this.normalizeReward({items});
      if(count===i.count)this.run("delete from game_items where id=?",id);else this.run("update game_items set count=count-? where id=?",count,id);
      const reward=this.reward(r,"item-use:"+nonce(),{items});this.fact(r,"item_use",i.template_id,count);return {item_id:id,used_count:count,reward};
    }
    if(t.SonType===201 && t.Property1===2030){
      integer(t.Property2,1);integer(t.Property3,1);const old=this.get("select * from game_item_buffs where character_id=? and kind='campaign_xp'",r.id),active=old&&old.expires_at>this.now();
      need(!active||old.percent<=t.Property3,"buff_weaker","Daha güçlü bir EXP bonusun zaten etkin; kitap korundu.");
      const expires=(active&&old.percent===t.Property3?old.expires_at:this.now())+t.Property2*60*count;integer(expires,1,Number.MAX_SAFE_INTEGER);
      this.run("insert into game_item_buffs values(?,'campaign_xp',?,?) on conflict(character_id,kind) do update set percent=excluded.percent,expires_at=excluded.expires_at",r.id,t.Property3,expires);
      if(count===i.count)this.run("delete from game_items where id=?",id);else this.run("update game_items set count=count-? where id=?",count,id);
      this.notice(r,"item-use:"+nonce(),"item_buff",`EXP bonusu +%${t.Property3} etkin: ${t.Property2*count} dakika.`);this.fact(r,"item_use",i.template_id,count);return {item_id:id,used_count:count,bonus_percent:t.Property3,expires_at:expires};
    }
    const kind = {
      1: "gold",
      3: "diamonds",
      4: "bound_diamonds",
      5: "stamina",
      6: "honor",
      7: "xp",
      8: "guild_offer",
    }[t.Property1];
    need(
      t.SonType === 203 && kind && t.Property2 > 0,
      "unsupported_item_effect",
      "Bu eşyanın kullanma kuralı henüz doğrulanmadı; eşya korunuyor.",
    );
    const amount = t.Property2 * count;
    integer(amount);
    if (count === i.count) this.run("delete from game_items where id=?", id);
    else this.run("update game_items set count=count-? where id=?", count, id);
    const reward = this.reward(
      r,
      "item-use:" + nonce(),
      ["gold", "diamonds", "xp", "honor", "guild_offer"].includes(kind)
        ? { [kind]: amount }
        : { resources: { [kind]: amount } },
    );
    this.fact(r, "item_use", i.template_id, count);
    return { item_id: id, used_count: count, reward };
  },
  normalizeReward(input) {
    const out = {
      ...input,
      items: [],
      resources: { ...(input.resources ?? {}) },
    };
    for (const item of input.items ?? []) {
      integer(item.count, 1);
      if (item.template_id > 0) {
        out.items.push(item);
        continue;
      }
      const kind = virtual[item.template_id];
      need(kind, "unknown_currency_reward");
      if (["gold", "diamonds", "xp"].includes(kind))
        out[kind] = (out[kind] ?? 0) + item.count;
      else out.resources[kind] = (out.resources[kind] ?? 0) + item.count;
    }
    return out;
  },
  mail(r, id) {
    const m = this.get(
      "select * from game_mail where id=? and character_id=? and deleted=0",
      integer(id, 1),
      r.id,
    );
    need(m, "mail_not_owned", "Posta bu karaktere ait değil.", 404);
    return { ...m, reward: JSON.parse(m.reward_json) };
  },
  mails(r) {
    return this.all(
      "select id from game_mail where character_id=? and deleted=0 order by id desc limit 300",
      r.id,
    ).map((m) => this.mail(r, m.id));
  },
  systemMail(r, event, subject, body, reward) {
    need(typeof event === "string" && event.length <= 128, "invalid_event");
    this.run(
      "insert or ignore into game_mail(character_id,subject,body,reward_json,created_at,event_key) values(?,?,?,?,?,?)",
      r.id,
      subject,
      body,
      JSON.stringify(this.normalizeReward(reward)),
      this.now(),
      event,
    );
    return this.get(
      "select id from game_mail where character_id=? and event_key=?",
      r.id,
      event,
    ).id;
  },
  sendMail(r, recipient, subject, body) {
    integer(recipient, 1);
    const dest = this.s.role(recipient);
    need(dest && dest.id !== r.id, "invalid_recipient");
    for (const [v, max] of [
      [subject, 80],
      [body, 2000],
    ])
      need(
        typeof v === "string" &&
          v.trim() &&
          Array.from(v).length <= max &&
          !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v),
        "invalid_mail",
      );
    need(
      this.get(
        "select count(*) as n from game_mail where sender_id=? and created_at>?",
        r.id,
        this.now() - 60,
      ).n < 10,
      "mail_rate_limit",
    );
    const id = Number(
      this.run(
        "insert into game_mail(character_id,sender_id,subject,body,reward_json,created_at,event_key) values(?,?,?,?,?,?,?)",
        dest.id,
        r.id,
        subject.trim(),
        body.trim(),
        "{}",
        this.now(),
        "player:" + nonce(),
      ).lastInsertRowid,
    );
    return { mail_id: id, recipient };
  },
  readMail(r, id) {
    const m = this.mail(r, id);
    if (m.read_at === null)
      this.run("update game_mail set read_at=? where id=?", this.now(), id);
    return this.mail(r, id);
  },
  claimMail(r, id) {
    const m = this.mail(r, id);
    if (m.claimed_at !== null)
      return { mail_id: id, already_claimed: true, reward: m.reward };
    const reward = this.reward(r, "mail:" + id, m.reward);
    this.run(
      "update game_mail set claimed_at=?,read_at=coalesce(read_at,?) where id=?",
      this.now(),
      this.now(),
      id,
    );
    return { mail_id: id, already_claimed: false, reward };
  },
  deleteMail(r, id) {
    const m = this.mail(r, id),
      w = m.reward;
    need(
      m.claimed_at !== null ||
        !(
          w.gold ||
          w.diamonds ||
          w.xp ||
          w.honor ||
          w.guild_offer ||
          Object.values(w.resources ?? {}).some(Boolean) ||
          w.items?.length
        ),
      "mail_has_attachment",
      "Önce posta ödülünü al.",
    );
    this.run("update game_mail set deleted=1 where id=?", id);
    return { mail_id: id, deleted: true };
  },
  daily(r) {
    this.run("insert or ignore into game_daily(character_id) values(?)", r.id);
    const d = this.get("select * from game_daily where character_id=?", r.id);
    return {
      ...d,
      can_sign: d.last_day < Math.floor(this.now() / 86400),
      policy: "local_UTC_day_cumulative_source_seven_rewards",
    };
  },
  signDaily(r) {
    const d = this.daily(r),
      today = Math.floor(this.now() / 86400);
    if (d.last_day === today) return { ...d, already_signed: true };
    need(today > d.last_day, "clock_reversal");
    const energy = this.get(
      "select amount from game_resources where character_id=? and currency='stamina'",
      r.id,
    )?.amount;
    if (energy !== undefined && energy < +config("Player_weary", 200))
      this.resource(
        r,
        "stamina",
        +config("Player_weary", 200) - energy,
        "daily_stamina_floor",
      );
    this.run(
      "update game_daily set last_day=?,total_days=total_days+1 where character_id=?",
      today,
      r.id,
    );
    this.notice(r, "sign:" + today, "daily", "Günlük giriş kaydedildi.", {
      day: today,
    });
    this.fact(r, "sign", 0);
    return { ...this.daily(r), already_signed: false };
  },
  claimDaily(r, day) {
    integer(day, 1, 7);
    const d = this.daily(r);
    need(d.total_days >= day, "daily_not_available");
    if (d.reward_bits & (1 << (day - 1))) return { day, already_claimed: true };
    const row = services.sevensignin.find((x) => x.Day === day);
    need(row, "unknown_daily");
    const items = row.Item.split("|")
      .filter(Boolean)
      .map((p) => {
        const [template_id, count] = p.split(",").map(Number);
        return { template_id, count, bound: true };
      });
    const reward = this.reward(r, "seven-day:" + day, { items });
    this.run(
      "update game_daily set reward_bits=reward_bits|? where character_id=?",
      1 << (day - 1),
      r.id,
    );
    return { day, already_claimed: false, reward };
  },
  shopList(r) {
    return services.shop
      .filter(
        (t) =>
          table("itemtemplate")[t.ItemId] &&
          r.level >= Math.max(t.NeedGrades, t.NeedMinGrade, t.ShowLevel) &&
          (!t.NeedMaxGrade || r.level <= t.NeedMaxGrade),
      )
      .map((t) => ({ ...t, bought: this.shopBought(r, t.Id) }));
  },
  shopBought(r, id) {
    const now = this.now(),
      d = Math.floor(now / 86400) * 86400,
      w = (Math.floor((now / 86400 + 3) / 7) * 7 - 3) * 86400,
      date = new Date(now * 1000),
      m = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000;
    const rows = this.all(
      "select count,created_at from game_shop_purchases where character_id=? and shop_id=?",
      r.id,
      id,
    );
    return {
      day: rows
        .filter((x) => x.created_at >= d)
        .reduce((n, x) => n + x.count, 0),
      week: rows
        .filter((x) => x.created_at >= w)
        .reduce((n, x) => n + x.count, 0),
      month: rows
        .filter((x) => x.created_at >= m)
        .reduce((n, x) => n + x.count, 0),
    };
  },
  buyShop(r, id, count, payType = 0) {
    integer(id, 1);
    integer(count, 1, 999);
    need([0, 1].includes(payType), "invalid_pay_type");
    const t = shops.get(id);
    need(t && table("itemtemplate")[t.ItemId], "unknown_shop_item");
    need(
      r.level >= Math.max(t.NeedGrades, t.NeedMinGrade, t.ShowLevel) &&
        (!t.NeedMaxGrade || r.level <= t.NeedMaxGrade),
      "shop_level",
    );
    need(
      !t.NeedMinVip &&
        !t.NeedItem &&
        !t.MazeLayers &&
        !t.MazeLayers2 &&
        !t.FirstPrice &&
        !t.IsNeedPoint &&
        !t.Discount,
      "unsupported_shop_condition",
    );
    if (t.NeedConsortiaLevels) {
      const g = this.membership(r);
      need(
        g && this.guild(g.guild_id).level >= t.NeedConsortiaLevels,
        "guild_level_required",
      );
    }
    const bought = this.shopBought(r, id);
    for (const [period, limit] of [
      ["day", t.Vipp0],
      ["week", t.WeeklyLimit],
      ["month", t.MonthLimit],
    ])
      if (limit >= 0) need(bought[period] + count <= limit, "shop_limit");
    const charge = (key, n) => {
      n = Number(n ?? 0) * count;
      integer(n);
      if (!n) return;
      if (["gold", "diamonds"].includes(key))
        this.wallet(r, key, -n, "shop:" + id);
      else this.resource(r, key, -n);
    };
    charge("gold", t.Gold);
    charge("diamonds", t.Point);
    if (t.GiftToken) {
      let bill = t.GiftToken * count;
      integer(bill);
      if (payType === 0) {
        const bound =
            this.get(
              "select amount from game_resources where character_id=? and currency=?",
              r.id,
              "bound_diamonds",
            )?.amount ?? 0,
          used = Math.min(bound, bill);
        if (used) this.resource(r, "bound_diamonds", -used);
        bill -= used;
      }
      if (bill) this.wallet(r, "diamonds", -bill, "shop:" + id);
    }
    for (const [col, key] of [
      ["Honor", "honor"],
      ["ConsortiaOffer", "guild_offer"],
      ["LordsScore", "glory"],
      ["Score", "score"],
      ["MazeCoin", "maze_coin"],
      ["MineScore", "mine_score"],
      ["ConsortiaPve", "guild_pve"],
    ])
      charge(key, t[col]);
    need(
      [
        t.Gold,
        t.Point,
        t.GiftToken,
        t.Honor,
        t.ConsortiaOffer,
        t.LordsScore,
        t.Score,
        t.MazeCoin,
        t.MineScore,
        t.ConsortiaPve,
      ].some((v) => v > 0),
      "unpriced_shop_item",
    );
    this.addItem(r, t.ItemId, count, true);
    this.run(
      "insert into game_shop_purchases(character_id,shop_id,count,created_at) values(?,?,?,?)",
      r.id,
      id,
      count,
      this.now(),
    );
    this.fact(r, "shop_buy", id, count);
    this.notice(
      r,
      "shop:" + nonce(),
      "shop",
      `${title(table("itemtemplate")[t.ItemId])} ×${count} satın alındı.`,
      { shop_id: id, count },
    );
    return {
      shop_id: id,
      template_id: t.ItemId,
      count,
      bought: this.shopBought(r, id),
    };
  },
  guildEdit(r, description, placard) {
    const m = this.guildPermission(r, true);
    for (const v of [description, placard])
      need(
        typeof v === "string" &&
          Array.from(v).length <= 500 &&
          !/[<>\u0000-\u001f]/.test(v),
        "invalid_text",
      );
    this.run(
      "update game_guilds set description=? where id=?",
      description,
      m.guild_id,
    );
    this.run(
      "insert into game_guild_meta(guild_id,placard) values(?,?) on conflict(guild_id) do update set placard=excluded.placard",
      m.guild_id,
      placard,
    );
    return this.guild(m.guild_id);
  },
  inviteGuild(r, id) {
    const m = this.guildPermission(r),
      t = this.roleByCharacter(id);
    need(!this.membership(t), "already_in_guild");
    this.run(
      "insert or ignore into game_guild_invites(guild_id,character_id,inviter_id,created_at) values(?,?,?,?)",
      m.guild_id,
      id,
      r.id,
      this.now(),
    );
    return this.get(
      "select id from game_guild_invites where guild_id=? and character_id=?",
      m.guild_id,
      id,
    );
  },
  guildInviteReply(r, id, accept) {
    integer(id, 1);
    need(typeof accept === "boolean", "invalid_value");
    const v = this.get(
      "select * from game_guild_invites where id=? and character_id=?",
      id,
      r.id,
    );
    need(v, "invite_not_owned");
    if (accept) {
      this.applyGuild(r, v.guild_id);
      this.guildApplication(this.roleByCharacter(v.inviter_id), r.id, true);
    }
    this.run("delete from game_guild_invites where id=?", id);
    return { accepted: accept, guild_id: v.guild_id };
  },
  upgradeGuild(r) {
    const m = this.guildPermission(r, true),
      g = this.guild(m.guild_id);
    need(
      !this.get("select 1 from game_guild_upgrades where guild_id=?", g.id),
      "guild_upgrade_busy",
    );
    const next = services.consortialevel.find(
      (t) => t.Types === 1 && t.Levels === g.level + 1,
    );
    need(next, "guild_max_level");
    const cost = next.NeedOffer;
    need(
      Number.isSafeInteger(cost) && cost > 0,
      "guild_upgrade_source_unknown",
    );
    need(g.bank >= cost, "insufficient_funds");
    this.run("update game_guilds set bank=bank-? where id=?", cost, g.id);
    this.run(
      "insert into game_guild_upgrades values(?,?,?)",
      g.id,
      g.level + 1,
      this.now() + next.CodeTime,
    );
    return {
      ...this.guild(g.id),
      upgrade_finishes_at: this.now() + next.CodeTime,
    };
  },
  guildOpen(r, enabled) {
    need(typeof enabled === "boolean", "invalid_value");
    const m = this.guildPermission(r, true);
    this.run(
      "insert into game_guild_meta(guild_id,open_app) values(?,?) on conflict(guild_id) do update set open_app=excluded.open_app",
      m.guild_id,
      +enabled,
    );
    return this.guild(m.guild_id);
  },
  chatHistory(r, peer) {
    const target = this.s.role(integer(peer, 1));
    need(target, "character_not_found");
    return this.all(
      "select id,character_id,recipient_id,message,created_at from game_chat where channel=20 and ((character_id=? and recipient_id=?) or (character_id=? and recipient_id=?)) order by id desc limit 100",
      r.id,
      peer,
      target.id,
      r.player_id,
    ).reverse();
  },
  chat(r, channel, message, recipient = 0, scope = "world") {
    need([5, 8, 10, 20].includes(channel), "invalid_chat_channel");
    need(
      typeof message === "string" &&
        message.trim() &&
        Array.from(message).length <= 500 &&
        !/[<>\u0000-\u001f]/.test(message),
      "invalid_chat_message",
    );
    need(
      this.get(
        "select count(*) as n from game_chat where character_id=? and created_at>?",
        r.id,
        this.now() - 10,
      ).n < 5,
      "chat_rate_limit",
    );
    if (channel === 5) need(this.membership(r), "not_in_guild");
    if (channel === 20) {
      const t = this.s.role(integer(recipient, 1));
      need(t && t.id !== r.id, "invalid_recipient");
    }
    this.run(
      "insert into game_chat(character_id,channel,recipient_id,scope,message,created_at) values(?,?,?,?,?,?)",
      r.id,
      channel,
      channel === 20 ? recipient : null,
      scope,
      message.trim(),
      this.now(),
    );
    return { channel, message: message.trim(), recipient, scope };
  },
};

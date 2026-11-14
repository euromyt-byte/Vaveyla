import {hotEventRules} from './rules-hot-events.js';
import {progressionRules} from "./rules-progression.js";
import {craftingRules} from "./rules-crafting.js";
import {fashionRules} from "./rules-fashion.js";
import {giftPackageRules} from "./rules-gift-packages.js";
import {skyRules} from "./rules-sky.js";
import {gemRules} from "./rules-gems.js";
import {collectibleRules} from "./rules-collectibles.js";
import {forgeRules} from "./rules-forge.js";
import { vipRules } from "./rules-vip.js";
import { need, integer, hash, canonical, job, MAX, GameError } from "./util.js";
import { table, et, config, title, xpAfter } from "./catalog.js";
import { freeRechargeRules } from "./rules-recharge.js";
import { campaignRules } from "./rules-campaign.js";
import { cityRules } from "./rules-city.js";
import { questRules } from "./rules-quests.js";
import { socialRules } from "./rules-social.js";
import { serviceRules } from "./rules-services.js";
export class Game {
  constructor(store) {
    this.s = store;
    this.now = store.clock;

  }
  get(sql, ...args) {
    return this.s.get(sql, ...args);
  }
  all(sql, ...args) {
    return this.s.all(sql, ...args);
  }
  run(sql, ...args) {
    return this.s.run(sql, ...args);
  }
  tx(account, fn) {
    return this.s.tx(() => {
      const r = this.s.role(integer(account, 1));
      need(r, "character_required", "Karakter bulunamadı.", 404);
      this.ensure(r);
      return fn(r);
    });
  }
  ensure(r) {
    this.initVip(r);
    this.run(
      "insert or ignore into game_progress(character_id,origin) values(?,?)",
      r.id,
      r.level === 1 ? "new_character" : "legacy_level_without_xp_history",
    );
    this.run(
      "insert or ignore into game_world(character_id,map_id,x,y,moved_at) values(?,5,15000,15000,?)",
      r.id,
      this.now(),
    );
    for (const id of [90101, 120101, 40201])
      this.run(
        "insert or ignore into game_buildings(character_id,son_type,template_id) values(?,?,?)",
        r.id,
        table("buildingtemplate")[id].SonType,
        id,
      );
    // The source level1 Treasury is free and depends only on the default Town Hall.
    this.run("insert or ignore into game_buildings(character_id,son_type,template_id) values(?,301,30101)",r.id);
    this.settleBuildings(r);
    this.income(r);
    this.skills(r);
    this.autoAccept(r);
  }
  wallet(r, currency, delta, reason) {
    need(["gold", "diamonds"].includes(currency), "unsupported_currency");
    integer(Math.abs(delta));
    const before = this.get(
        `select ${currency} as n from characters where id=?`,
        r.id,
      ).n,
      after = before + delta;
    need(
      after >= 0 && after <= MAX,
      after < 0 ? "insufficient_funds" : "currency_limit",
      "Bakiye yetersiz veya sınırı aşıyor.",
    );
    this.run(`update characters set ${currency}=? where id=?`, after, r.id);
    this.run(
      "insert into game_wallet_log(character_id,currency,delta,before_amount,after_amount,reason,created_at) values(?,?,?,?,?,?,?)",
      r.id,
      currency,
      delta,
      before,
      after,
      reason,
      this.now(),
    );
    if (currency === "diamonds")
      this.run(
        "insert into diamond_ledger(character_id,before_amount,after_amount,reason,created_at) values(?,?,?,?,?)",
        r.id,
        before,
        after,
        reason,
        this.now(),
      );
    r[currency] = after;
    return after;
  }
  addXP(r, amount) {
    const beforeLevel = r.level;
    const current = this.get(
        "select xp from game_progress where character_id=?",
        r.id,
      ).xp,
      [level, xp] = xpAfter(
        r.level,
        current,
        integer(amount, 0, Number.MAX_SAFE_INTEGER),
      );
    this.run("update characters set level=? where id=?", level, r.id);
    this.run(
      "update game_progress set xp=?,revision=revision+1 where character_id=?",
      xp,
      r.id,
    );
    r.level = level;
    if (level > beforeLevel)
      this.notice(r, "level:" + level, "level", `${level}. seviyeye ulaştın.`, {
        from: beforeLevel,
        to: level,
      });
    return [level, xp];
  }
  notice(r, key, kind, message, payload = {}) {
    this.run(
      "insert or ignore into game_notifications(character_id,event_key,kind,message,payload_json,created_at) values(?,?,?,?,?,?)",
      r.id,
      key,
      kind,
      message,
      JSON.stringify(payload),
      this.now(),
    );
  }
  notices(r, after = 0, limit = 100) {
    integer(after, 0, Number.MAX_SAFE_INTEGER);
    integer(limit, 1, 100);
    return this.all(
      "select * from game_notifications where character_id=? and id>? order by id limit ?",
      r.id,
      after,
      limit,
    ).map(({ payload_json, ...row }) => ({
      ...row,
      payload: JSON.parse(payload_json),
    }));
  }
  fact(r, kind, subject, amount = 1) {
    integer(amount, 1);
    this.run(
      "insert into game_facts values(?,?,?,?) on conflict(character_id,kind,subject) do update set amount=min(2147483647,amount+excluded.amount)",
      r.id,
      kind,
      subject,
      amount,
    );
  }
  factCount(r, kind, subject) {
    return (
      this.get(
        "select amount from game_facts where character_id=? and kind=? and subject=?",
        r.id,
        kind,
        subject,
      )?.amount ?? 0
    );
  }
  reward(
    r,
    event,
    {
      xp = 0,
      gold = 0,
      diamonds = 0,
      items = [],
      honor = 0,
      guild_offer = 0,
      resources = {},
    } = {},
  ) {
    const old = this.get(
      "select payload_json from game_reward_events where character_id=? and event_id=?",
      r.id,
      event,
    );
    if (old) return JSON.parse(old.payload_json);
    ({ xp, gold, diamonds, items, resources } = this.normalizeReward({
      xp,
      gold,
      diamonds,
      items,
      resources,
    }));
    const result = { xp, gold, diamonds, items, honor, guild_offer };
    if (Object.keys(resources).length) result.resources = resources;
    for (const n of [xp, gold, diamonds])
      integer(n, 0, Number.MAX_SAFE_INTEGER);
    if (gold) this.wallet(r, "gold", gold, event);
    if (diamonds) this.wallet(r, "diamonds", diamonds, event);
    for (const [key, amount] of Object.entries(resources)) {
      integer(amount);
      if (key === "vip_xp") this.addVipXP(r, amount, "reward:" + event);
      else this.resource(r, key, amount);
    }
    const delivered = [],
      mailed = [];
    for (const i of items) {
      try {
        this.s.tx(() =>
          this.addItem(r, i.template_id, i.count, i.bound ?? true),
        );
        delivered.push(i);
      } catch (e) {
        if (e.code !== "bag_full" || event.startsWith("mail:")) throw e;
        this.systemMail(
          r,
          "overflow:" + event + ":" + mailed.length,
          "Çantaya sığmayan ödül",
          "Ödülün korunuyor. Çantanda yer açtıktan sonra alabilirsin.",
          { items: [i] },
        );
        mailed.push(i);
      }
    }
    if (mailed.length) {
      result.items = delivered;
      result.mailed_items = mailed;
    }
    for (const [key, n] of [
      ["honor", honor],
      ["guild_offer", guild_offer],
    ])
      if (n) {
        integer(n);
        const before =
          this.get(
            "select amount from game_resources where character_id=? and currency=?",
            r.id,
            key,
          )?.amount ?? 0;
        need(before + n <= MAX, "currency_limit");
        this.run(
          "insert into game_resources values(?,?,?) on conflict(character_id,currency) do update set amount=excluded.amount",
          r.id,
          key,
          before + n,
        );
      }
    let pendingXp = 0;
    if (xp) {
      const saved = this.get(
        "select state_json from wartune_training where character_id=?",
        r.id,
      );
      if (saved && !JSON.parse(saved.state_json).completed) {
        pendingXp = xp;
        result.xp = 0;
        result.pending_xp = xp;
        this.run(
          "update game_progress set pending_xp=pending_xp+? where character_id=?",
          xp,
          r.id,
        );
      } else this.addXP(r, xp);
    }
    this.run(
      "insert into game_reward_events values(?,?,?,?)",
      r.id,
      event,
      JSON.stringify(result),
      this.now(),
    );
    const parts = [];
    if (xp)
      parts.push(
        pendingXp ? `+${xp} XP (eğitim tamamlanınca uygulanacak)` : `+${xp} XP`,
      );
    if (gold) parts.push(`+${gold} altın`);
    if (diamonds) parts.push(`+${diamonds} elmas`);
    if (honor) parts.push(`+${honor} onur`);
    if (guild_offer) parts.push(`+${guild_offer} lonca katkısı`);
    for (const [key, amount] of Object.entries(resources))
      if (amount)
        parts.push(
          `+${amount} ${{ bound_diamonds: "bağlı elmas", crystals: "kristal", souls: "ruh", strategy: "strateji", glory: "zafer puanı", stamina: "dayanıklılık", blank_pet_cards: "boş ruh kartı", guild_pve: "lonca puanı", vip_xp: "VIP EXP" }[key] ?? key}`,
        );
    for (const item of delivered)
      parts.push(
        `${title(table("itemtemplate")[item.template_id] ?? { TemplateId: item.template_id })} ×${item.count}`,
      );
    for (const item of mailed)
      parts.push(
        `${title(table("itemtemplate")[item.template_id] ?? { TemplateId: item.template_id })} ×${item.count} (çanta dolu: posta kutuna gönderildi)`,
      );
    if (parts.length)
      this.notice(
        r,
        "reward:" + event,
        "reward",
        "Ödül alındı: " + parts.join(", "),
        result,
      );
    return result;
  }
  player(r) {
    return {
      ...Object.fromEntries(
        ["id", "name", "level", "gold", "diamonds", "icon"].map((k) => [
          k,
          r[k],
        ]),
      ),
      ...this.get(
        "select xp,pending_xp,origin,revision from game_progress where character_id=?",
        r.id,
      ),
    };
  }
  snapshot(account) {
    return this.tx(account, (r) => {
      this.syncTraining(r);
      this.autoAccept(r);
      const mount=this.mountState(r),fashion=this.fashionInfo(r),talent=this.talentInfo(r);
      return {
        ...(this.runePacket(r).runeinfo.length?{runes:this.runePacket(r)}:{}),
        ...(mount.selected?{mount}:{}),
        ...(talent.talentGrade?{talent}:{}),
        ...(Object.values(fashion.appearance).some(Boolean)||fashion.status!=="1,1,1,1"?{fashion}:{}),
        player: this.player(r),
        inventory: this.inventory(r),
        quests: this.quests(r),
        guild: this.membership(r)
          ? this.guild(this.membership(r).guild_id)
          : null,
        world: this.world(r),
        buildings: this.buildings(r),
        combat: this.stats(r),
        army: this.army(r),
        skills: this.skills(r),
        economy: this.income(r),
        skill_preferences: this.preferences(r),
        resources: Object.fromEntries(
          this.all(
            "select currency,amount from game_resources where character_id=?",
            r.id,
          ).map((x) => [x.currency, x.amount]),
        ),
      };
    });
  }
  trainingEvent(r, state, result = null, finalize = true) {
    if (result?.won) {
      const n =
          et("campaigndata")[result.node_id] ??
          this.trainingNode(result.node_id),
        key = "training-node:" + n.Id;
      if (
        !this.get(
          "select 1 from game_reward_events where character_id=? and event_id=?",
          r.id,
          key,
        )
      ) {
        this.run(
          "update game_progress set pending_xp=pending_xp+? where character_id=?",
          n.HeroGP,
          r.id,
        );
        for (const pair of n.Soldiers.split("|").filter(Boolean))
          this.fact(r, "kill", +pair.split(",")[0]);
        this.run(
          "insert into game_reward_events values(?,?,?,?)",
          r.id,
          key,
          JSON.stringify({ pending_xp: n.HeroGP }),
          this.now(),
        );
        this.notice(
          r,
          "bank:" + key,
          "pending_xp",
          `+${n.HeroGP} eğitim XP'si kaydedildi; eğitim tamamlandığında uygulanacak.`,
          { pending_xp: n.HeroGP, node_id: n.Id },
        );
      }
    }
    if (state.completed && finalize) {
      const pending = this.get(
        "select pending_xp from game_progress where character_id=?",
        r.id,
      ).pending_xp;
      if (pending) {
        this.reward(r, "tutorial-xp-final", { xp: pending });
        this.run(
          "update game_progress set pending_xp=0 where character_id=?",
          r.id,
        );
      }
    }
  }
  syncTraining(r) {
    const raw = this.get(
      "select state_json from wartune_training where character_id=?",
      r.id,
    );
    if (!raw) return;
    const state = JSON.parse(raw.state_json);
    for (const b of this.all(
      "select * from wartune_training_results where character_id=? and won=1 order by created_at,battle_id",
      r.id,
    ))
      this.trainingEvent(r, state, b, false);
    this.trainingEvent(r, state);
  }
  action(account, operation, body, requestId) {
    const def = OPERATIONS[operation];
    need(def, "unknown_game_operation", "Oyun işlemi desteklenmiyor.", 404);
    need(
      body &&
        typeof body === "object" &&
        !Array.isArray(body) &&
        (Object.keys(body).sort().join("|") === def.args.slice().sort().join("|") ||
          operation==="recharge.free"&&Object.keys(body).sort().join("|")==="count|product_id"),
      "invalid_game_fields",
    );
    need(
      typeof requestId === "string" &&
        /^[A-Za-z0-9_.:-]{1,96}$/.test(requestId),
      "invalid_request_id",
    );
    return this.tx(account, (r) => {
      const fingerprint = hash(canonical(body)),
        old = this.get(
          "select * from game_actions where character_id=? and request_id=?",
          r.id,
          requestId,
        );
      if (old) {
        need(
          old.operation === operation && old.payload_hash === fingerprint,
          "request_conflict",
        );
        return JSON.parse(old.result_json);
      }
      this.syncTraining(r);
      const result = this[def.method](r, ...def.args.map((k) => body[k]));
      this.autoAccept(r);
      const out = { operation, result, player: this.player(r) };
      this.run(
        "insert into game_actions values(?,?,?,?,?)",
        r.id,
        requestId,
        operation,
        fingerprint,
        JSON.stringify(out),
      );
      return out;
    });
  }
}
Object.assign(
  Game.prototype,
  cityRules,
  questRules,
  socialRules,
  serviceRules,
  campaignRules,
  forgeRules,
  gemRules,
  collectibleRules,
  hotEventRules, progressionRules, craftingRules, fashionRules,
  giftPackageRules,
  skyRules,
  freeRechargeRules,
  vipRules,
);
export const OPERATIONS = {};
for (const [op, method, args] of [
  ["quest.accept", "acceptQuest", ["quest_id"]],
  ["quest.claim", "claimQuest", ["quest_id", "selected_item"]],
  ["inventory.move", "moveItem", ["item_id", "bag", "position", "count"]],
  ["inventory.arrange", "arrangeItems", ["bag"]],
  ["inventory.sell", "sellItem", ["item_id", "count"]],
  ["inventory.use", "useItem", ["item_id", "count"]],
  ["shop.buy", "buyShop", ["shop_id", "count", "pay_type"]],
  ["recharge.free", "freeRecharge", ["product_id", "count", "other_id", "active_type"]],
  ["vip.gift", "claimVipGift", ["type", "grade"]],
  ["mail.send", "sendMail", ["recipient", "subject", "body"]],
  ["mail.read", "readMail", ["mail_id"]],
  ["mail.claim", "claimMail", ["mail_id"]],
  ["mail.delete", "deleteMail", ["mail_id"]],
  ["daily.sign", "signDaily", []],
  ["daily.claim", "claimDaily", ["day"]],
  ["guild.edit", "guildEdit", ["description", "placard"]],
  ["guild.invite", "inviteGuild", ["character_id"]],
  ["guild.invite_reply", "guildInviteReply", ["invite_id", "accept"]],
  ["guild.upgrade", "upgradeGuild", []],
  ["guild.open", "guildOpen", ["enabled"]],
  ["building.upgrade", "upgradeBuilding", ["son_type"]],
  ["building.create", "createBuilding", ["son_type"]],
  ["building.speed", "speedBuildings", ["order_id", "pay_type"]],
  ["army.recruit", "recruit", ["template_id", "count"]],
  ["army.deploy", "deploy", ["template_id", "slot", "count"]],
  ["army.dismiss", "dismiss", ["template_id", "count"]],
  ["army.upgrade", "upgradePawn", ["template_id"]],
  ["army.formation", "formation", ["hero_pos", "pawn_pos"]],
  ["tax.collect", "levyTax", []],
  ["skill.learn", "learnSkill", ["template_id"]],
  ["skill.equip", "equipSkills", ["fast_keys"]],
  ["world.enter", "enterWorld", ["map_id"]],
  ["world.move", "moveWorld", ["x", "y", "revision"]],
  ["guild.create", "createGuild", ["name"]],
  ["guild.apply", "applyGuild", ["guild_id"]],
  ["guild.application", "guildApplication", ["character_id", "accept"]],
  ["guild.transfer", "guildTransfer", ["character_id"]],
  ["guild.rank", "guildRank", ["character_id", "rank"]],
  ["guild.leave", "guildLeave", []],
  ["guild.kick", "guildKick", ["character_id"]],
  ["guild.donate", "guildDonate", ["amount"]],
  ["duel.invite", "duelInvite", ["target_id"]],
  ["duel.reply", "duelReply", ["duel_id", "accept"]],
])
  OPERATIONS[op] = { method, args };

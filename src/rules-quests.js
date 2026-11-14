import { need, integer, job } from "./util.js";
import { table, pt, group, title, training } from "./catalog.js";
import { inventoryRules } from "./rules-inventory.js";
const SUPPORTED = new Set([
  1, 2, 3, 4, 10, 14, 17, 22, 25, 26, 27, 28, 29, 31, 32, 34, 37, 39, 42, 49, 51, 76, 78, 18, 85,
  104,
]);
export const questRules = {
  ...inventoryRules,
  trainingNode(id) {
    return training.campaigndata.find((n) => n.Id === id);
  },
  baseline(r) {
    return Object.fromEntries(
      this.all("select * from game_facts where character_id=?", r.id).map(
        (f) => [f.kind + ":" + f.subject, f.amount],
      ),
    );
  },
  questPeriod(q) {
    return +q.IsRepeat ? Math.floor((this.now() - 18000) / 86400) : 0;
  },
  questAvailable(r, q) {
    const now = this.now() * 1000,
      start = Date.parse(q.StartDate.replace(" ", "T") + "Z"),
      end = Date.parse(q.EndDate.replace(" ", "T") + "Z");
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      now < start ||
      now > end ||
      r.level < q.NeedMinLevel ||
      r.level > q.NeedMaxLevel ||
      q.HourSpace ||
      q.WeekSpace
    )
      return false;
    const conditions = group("questcondiction", q.TemplateId);
    if (!conditions.length) return false;
    if (
      !conditions.every((c) => SUPPORTED.has(c.CondictionType)) &&
      !(q.TemplateType === 0 && q.PreQuestId)
    )
      return false;
    if (conditions.some((c) => c.CondictionType === 51 && +c.Para1 !== 1))
      return false;
    for (const id of String(q.PreQuestId).match(/\d+/g) ?? [])
      if (
        +id &&
        !this.get(
          "select 1 from game_quests where character_id=? and quest_id=? and status='claimed'",
          r.id,
          +id,
        )
      )
        return false;
    if (q.IsLeague && !this.membership(r)) return false;
    if (q.NeedBuildingTemp) {
      const t = table("buildingtemplate")[q.NeedBuildingTemp],
        b =
          t &&
          this.get(
            "select template_id from game_buildings where character_id=? and son_type=?",
            r.id,
            t.SonType,
          );
      if (
        !b ||
        table("buildingtemplate")[b.template_id].BuildingGrade < t.BuildingGrade
      )
        return false;
    }
    return (
      !q.NeedItemTemp ||
      !!this.get(
        "select 1 from game_items where character_id=? and template_id=?",
        r.id,
        q.NeedItemTemp,
      )
    );
  },
  acceptQuest(r, id) {
    const q = table("questtemplate")[integer(id, 1)];
    need(q, "unknown_quest");
    need(this.questAvailable(r, q), "quest_unavailable");
    const old = this.get(
        "select * from game_quests where character_id=? and quest_id=?",
        r.id,
        id,
      ),
      period = this.questPeriod(q);
    if (old) {
      if (old.status === "accepted" || !+q.IsRepeat)
        return this.questStatus(r, q, old);
      need(
        old.period !== period || old.claims < q.RepeatMax,
        "quest_repeat_limit",
      );
      this.run(
        "update game_quests set status='accepted',accepted_at=?,baseline_json=?,claims=?,period=? where character_id=? and quest_id=?",
        this.now(),
        JSON.stringify(this.baseline(r)),
        old.period === period ? old.claims : 0,
        period,
        r.id,
        id,
      );
    } else
      this.run(
        "insert into game_quests(character_id,quest_id,status,accepted_at,period,baseline_json) values(?,?,'accepted',?,?,?)",
        r.id,
        id,
        this.now(),
        period,
        JSON.stringify(this.baseline(r)),
      );
    return this.questStatus(
      r,
      q,
      this.get(
        "select * from game_quests where character_id=? and quest_id=?",
        r.id,
        id,
      ),
    );
  },
  autoAccept(r) {
    for (const q of Object.values(table("questtemplate")))
      if (
        +q.IsAuto &&
        this.questAvailable(r, q) &&
        !this.get(
          "select 1 from game_quests where character_id=? and quest_id=?",
          r.id,
          q.TemplateId,
        )
      )
        this.acceptQuest(r, q.TemplateId);
  },
  condition(r, c, base) {
    const type = c.CondictionType,
      raw = String(c.Para1);
    let subject = +raw,
      required = Math.max(1, c.Para2),
      current = 0;
    if (!SUPPORTED.has(type))
      return {
        type,
        subject: raw,
        current: 0,
        required,
        complete: false,
        supported: false,
      };
    if (type === 25 || type === 26) {
      const ids = (raw.match(/\d+/g) ?? []).map(Number);
      subject = ids.length === 1 ? ids[0] : ids;
      current = ids.reduce(
        (n, i) =>
          n +
          Math.max(0, this.factCount(r, "kill", i) - (base["kill:" + i] ?? 0)),
        0,
      );
    } else if (type === 31) {
      if (subject === 1)
        current = this.all(
          "select subject,amount from game_facts where character_id=? and kind='campaign_clear'",
          r.id,
        ).reduce(
          (n, row) =>
            n +
            Math.max(
              0,
              row.amount - (base["campaign_clear:" + row.subject] ?? 0),
            ),
          0,
        );
      else
        return {
          type,
          subject,
          current: 0,
          required,
          complete: false,
          supported: false,
        };
    } else if (type === 42)
      current = Math.max(0, this.factCount(r, "tax", 0) - (base["tax:0"] ?? 0));
    else if (type === 39)
      current = +(
        this.daily(r).last_day >
        (base.__accepted_day ?? Math.floor(this.now() / 86400))
      );
    else if (type === 85)
      current = Math.max(
        0,
        this.factCount(r, "npc_talk", c.TemplateId) -
          (base["npc_talk:" + c.TemplateId] ?? 0),
      );
    else if (type === 104) {
      const ids = (raw.match(/\d+/g) ?? []).map(Number);
      current = ids.filter((id) =>
        this.get(
          "select 1 from game_quests where character_id=? and quest_id=? and status='claimed'",
          r.id,
          id,
        ),
      ).length;
    } else if (type === 4) {
      // Equipment level is its catalog requirement, not hero/enchantment level.
      // Read current owned gear so pre-equipped items and reconnects work too.
      current = this.all(
        "select template_id from game_items where character_id=? and bag=4 and not exists(select 1 from game_forge_stage s where s.item_id=game_items.id)",
        r.id,
      ).filter((i) => {
        const t = table("itemtemplate")[i.template_id];
        return t?.MasterType === 1 && t.NeedGrades >= subject;
      }).length;
    } else if (type === 17) {
      current=this.get("select count(*) n from game_item_enhancements e join game_items i on i.id=e.item_id where e.character_id=? and e.grade>=?",r.id,subject).n;
    } else if(type===18){current=this.get("select count(*) n from game_item_gems where character_id=?",r.id).n;}
    else if(type===76||type===78){const rows=this.all("select rune_type from game_runes where character_id=?",r.id);current=subject?Number(rows.some(x=>x.rune_type===subject)):(type===76?rows.length:Number(rows.length>0));}
    else if (type === 1) current = r.level;
    else if (type === 2) {
      const b = this.get(
        "select template_id from game_buildings where character_id=? and son_type=?",
        r.id,
        subject,
      );
      current = b ? table("buildingtemplate")[b.template_id].BuildingGrade : 0;
    } else if ([3, 10, 34].includes(type)) {
      const a = this.army(r),
        u = a.units.filter(
          (u) => !subject || pt()[u.template_id].MasterType === subject,
        );
      current =
        type === 3
          ? u.reduce((n, u) => n + u.reserve + u.deployed, 0)
          : type === 10
            ? Math.max(0, ...u.map((u) => u.level))
            : a.formation.sorted;
    } else if (type === 14)
      current = Math.max(
        0,
        this.factCount(r, "campaign_clear", subject) -
          (base["campaign_clear:" + subject] ?? 0),
      );
    else if (type === 22) current = +!!this.membership(r);
    else if ([27, 28, 32, 49].includes(type))
      current = this.get(
        "select coalesce(sum(count),0) as n from game_items where character_id=? and template_id=?",
        r.id,
        subject,
      ).n;
    else if (type === 29) current = this.membership(r)?.contribution ?? 0;
    else if (type === 51) {
      const g = this.membership(r);
      current = g && subject === 1 ? this.guild(g.guild_id).level : 0;
    } else if (type === 37) {
      subject = c.Para2;
      required = 1;
      current = +(this.world(r).map_id === subject);
    } else
      current = Math.max(
        0,
        this.factCount(r, "map_enter", subject) -
          (base["map_enter:" + subject] ?? 0),
      );
    return { type, subject, current, required, complete: current >= required };
  },
  questStatus(r, q, row) {
    const conditions = group("questcondiction", q.TemplateId).map((c) =>
      this.condition(r, c, {
        ...JSON.parse(row.baseline_json),
        __accepted_day: Math.floor(row.accepted_at / 86400),
      }),
    );
    return {
      quest_id: q.TemplateId,
      title: title(q, "Title"),
      status: row.status,
      unsupported_conditions: [
        ...new Set(
          conditions.filter((c) => c.supported === false).map((c) => c.type),
        ),
      ].sort((a, b) => a - b),
      accepted_at: row.accepted_at,
      claimed_at: row.claimed_at,
      claims: row.claims,
      conditions,
      complete: !!conditions.length && conditions.every((c) => c.complete),
      reward: { xp: q.RewardPlayGP, gold: q.RewardGold },
    };
  },
  quests(r) {
    return this.all(
      "select * from game_quests where character_id=? order by quest_id",
      r.id,
    ).map((row) =>
      this.questStatus(r, table("questtemplate")[row.quest_id], row),
    );
  },
  claimQuest(r, id, selected = 0) {
    const q = table("questtemplate")[integer(id, 1)],
      row = this.get(
        "select * from game_quests where character_id=? and quest_id=?",
        r.id,
        id,
      );
    need(q, "unknown_quest");
    need(row, "quest_not_accepted");
    if (row.status === "claimed" && !+q.IsRepeat) {
      const old = this.get(
        "select payload_json from game_reward_events where character_id=? and event_id=?",
        r.id,
        `quest:${id}:0:1`,
      );
      return {
        quest_id: id,
        already_claimed: true,
        reward: old ? JSON.parse(old.payload_json) : null,
      };
    }
    need(row.status === "accepted", "quest_not_accepted");
    need(this.questAvailable(r, q), "quest_unavailable");
    if (group("questcondiction", id).some((c) => c.CondictionType === 85)) {
      const training = this.get(
          "select state_json from wartune_training where character_id=?",
          r.id,
        ),
        run = this.get(
          "select state_json from game_campaign_runs where character_id=?",
          r.id,
        );
      const active = run && JSON.parse(run.state_json);
      need(
        (!training || JSON.parse(training.state_json).completed) &&
          (!active || active.completed || active.abandoned) &&
          this.world(r).map_id === (Number(String(group("questcondiction",id).find(c=>c.CondictionType===85)?.Para4??"").split(",")[0])||5),
        "dialogue_requires_city",
        "Görevin konuşma konumuna git; Gökyüzü görevlerini Gökyüzü Şehri’nde teslim et.",
      );
      this.fact(r, "npc_talk", id);
    }
    need(
      this.questStatus(r, q, row).complete,
      "quest_incomplete",
      "Görev koşulları sunucuda tamamlanmadı.",
    );
    const old = this.get(
      "select state_json from wartune_training where character_id=?",
      r.id,
    );
    if (q.RewardPlayGP && old)
      need(JSON.parse(old.state_json).completed, "tutorial_in_progress");
    integer(selected, -900);
    const candidates = group("questgood", id).filter((i) =>
        [0, job(r)].includes(i.ToJob),
      ),
      options = candidates.filter((i) => i.IsSelect);
    need(
      options.length
        ? options.some((i) => i.RewardItemID === selected)
        : selected === 0,
      "invalid_reward_choice",
    );
    need(
      ![
        "RewardHeroGP",
        "RewardMoney",
        "RewardCrystal",
        "RewardDower",
        "RewardStrategy",
      ].some((k) => +q[k]),
      "unsupported_reward",
    );
    const items = candidates
        .filter((i) => !i.IsSelect || i.RewardItemID === selected)
        .map((i) => ({
          template_id: i.RewardItemID,
          count: i.RewardItemCount,
          bound: true,
        })),
      event = `quest:${id}:${row.period}:${row.claims + 1}`,
      reward = this.reward(r, event, {
        xp: q.RewardPlayGP,
        gold: q.RewardGold,
        items,
        honor: q.RewardPlayerOffer,
        guild_offer: q.RewardConsortiaOffer,
      });
    this.run(
      "update game_quests set status='claimed',claimed_at=?,claims=claims+1 where character_id=? and quest_id=?",
      this.now(),
      r.id,
      id,
    );
    this.autoAccept(r);
    return { quest_id: id, already_claimed: false, reward };
  },
};

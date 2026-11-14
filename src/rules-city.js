import { need, integer, MAX } from "./util.js";
import { table, title, config } from "./catalog.js";
import { armyRules } from "./rules-army.js";
import { skillRules } from "./rules-skills.js";
export const buildingQueue = (t) => ([13, 14].includes(t.MasterType) ? 2 : 1);
export const cityRules = {
  ...armyRules,
  ...skillRules,
  incomeRate(r) {
    const b = this.get(
      "select template_id from game_buildings where character_id=? and son_type=901",
      r.id,
    );
    return b ? +table("buildingtemplate")[b.template_id].Property1 : 0;
  },
  income(r, now = this.now(), flush = false) {
    const rate = this.incomeRate(r),
      day = Math.floor(now / 86400);
    this.run(
      "insert or ignore into game_economy(character_id,settled_at,hourly_rate,tax_day) values(?,?,?,?)",
      r.id,
      now,
      rate,
      day,
    );
    const row = this.get(
        "select * from game_economy where character_id=?",
        r.id,
      ),
      elapsed = Math.max(0, now - row.settled_at),
      sec =
        flush || rate !== row.hourly_rate
          ? elapsed
          : Math.floor(elapsed / 60) * 60,
      whole = row.remainder + sec * row.hourly_rate,
      remainder = whole % 3600;
    const current = this.get(
        "select gold from characters where id=?",
        r.id,
      ).gold,
      amount = Math.min(Math.floor(whole / 3600), MAX - current);
    if (amount) {
      this.wallet(r, "gold", amount, "townhall_hourly_income");
      this.notice(
        r,
        `income:${row.settled_at}:${sec}:${row.remainder}:${row.hourly_rate}`,
        "income",
        `Üretim: +${amount} altın.`,
        { gold: amount },
      );
    } else r.gold = current;
    const used = day > row.tax_day ? 0 : row.tax_used;
    this.run(
      "update game_economy set settled_at=?,remainder=?,hourly_rate=?,tax_day=?,tax_used=? where character_id=?",
      sec === elapsed ? Math.max(row.settled_at, now) : row.settled_at + sec,
      remainder,
      rate,
      Math.max(day, row.tax_day),
      used,
      r.id,
    );
    return {
      hourly_gold: rate,
      tax_used: used,
      tax_daily_limit: 5,
      tax_min_level: 14,
      income_policy: "source_hourly_rate_minute_credit",
      tax_day_policy: "local_five_free_per_UTC_day",
    };
  },
  levyTax(r) {
    const info = this.income(r, this.now(), true);
    need(r.level >= 14, "tax_level", "Vergi14. seviyede açılır.");
    need(info.tax_used < 5, "tax_daily_limit");
    const gold = 6 * info.hourly_gold;
    this.wallet(r, "gold", gold, "townhall_free_tax");
    this.run(
      "update game_economy set tax_used=tax_used+1 where character_id=?",
      r.id,
    );
    this.fact(r, "tax", 0);
    this.notice(
      r,
      `tax:${Math.floor(this.now() / 86400)}:${info.tax_used + 1}`,
      "tax",
      `Vergi toplandı: +${gold} altın.`,
      { gold },
    );
    return { ...info, gold, tax_used: info.tax_used + 1 };
  },
  settleBuildings(r) {
    for (const b of this.all(
      "select * from game_buildings where character_id=? and finishes_at<=?",
      r.id,
      this.now(),
    )) {
      if (b.son_type === 901) this.income(r, b.finishes_at, true);
      this.run(
        "update game_buildings set template_id=target_template,target_template=null,finishes_at=null where character_id=? and son_type=?",
        r.id,
        b.son_type,
      );
      if (b.son_type === 901) this.income(r, b.finishes_at, true);
    }
  },
  buildings(r) {
    this.settleBuildings(r);
    return this.all(
      "select * from game_buildings where character_id=? order by son_type",
      r.id,
    ).map((b) => ({
      ...b,
      grade: table("buildingtemplate")[b.template_id].BuildingGrade,
      name: title(table("buildingtemplate")[b.template_id], "BuildingName"),
    }));
  },
  checkBuildingQueue(r, t) {
    this.settleBuildings(r);
    const busy = this.all(
      "select * from game_buildings where character_id=? and target_template is not null",
      r.id,
    );
    need(
      !busy.some(
        (b) =>
          buildingQueue(table("buildingtemplate")[b.target_template]) ===
          buildingQueue(t),
      ),
      "building_queue_full",
      "Bu türde başka bir geliştirme sürüyor; süre dolunca tekrar dene.",
    );
  },
  speedBuildings(r, orderId, payType) {
    integer(orderId, 0, 2);
    need([0, 1, 2].includes(payType), "invalid_pay_type");
    this.settleBuildings(r);
    const busy = this.all(
      "select * from game_buildings where character_id=? and target_template is not null",
      r.id,
    ).filter(
      (b) =>
        !orderId ||
        buildingQueue(table("buildingtemplate")[b.target_template]) === orderId,
    );
    const price = busy.reduce(
      (n, b) =>
        n +
        Number(config("QuickenOrder_Price", 2)) *
          Math.ceil((b.finishes_at - this.now()) / 600),
      0,
    );
    this.spendPremium(r, price, payType === 2 ? 2 : 1, "building_speedup");
    for (const b of busy)
      this.run(
        "update game_buildings set finishes_at=? where character_id=? and son_type=?",
        this.now(),
        r.id,
        b.son_type,
      );
    this.settleBuildings(r);
    return { cost: price, buildings: this.buildings(r) };
  },
  checkBuilding(r, t) {
    need(
      r.level >= t.PlayerGrades,
      "building_player_level",
      `Bu geliştirme için karakter seviyesi ${t.PlayerGrades} gerekiyor.`,
    );
    for (const id of String(t.PreTemplateId).match(/\d+/g) ?? []) {
      if (!+id) continue;
      const d = table("buildingtemplate")[id],
        owned = this.get(
          "select template_id from game_buildings where character_id=? and son_type=?",
          r.id,
          d.SonType,
        );
      need(
        owned &&
          table("buildingtemplate")[owned.template_id].BuildingGrade >=
            d.BuildingGrade,
        "building_dependency",
        `Önce ${title(d, "BuildingName")} binasını ${d.BuildingGrade}. seviyeye yükselt.`,
      );
    }
  },
  upgradeBuilding(r, son) {
    integer(son, 1);
    const b = this.get(
      "select * from game_buildings where character_id=? and son_type=?",
      r.id,
      son,
    );
    need(b, "building_not_owned");
    need(b.target_template == null, "building_busy");
    const t =
      table("buildingtemplate")[
        table("buildingtemplate")[b.template_id].NextGradeTemplateId
      ];
    need(t, "building_max_level");
    this.checkBuilding(r, t);
    this.checkBuildingQueue(r, t);
    this.wallet(r, "gold", -t.GoldConsume, "building_upgrade:" + son);
    if (t.CrystalsConsume)
      this.resource(
        r,
        "crystals",
        -t.CrystalsConsume,
        "building_upgrade:" + son,
      );
    this.run(
      "update game_buildings set target_template=?,finishes_at=? where character_id=? and son_type=?",
      t.TemplateId,
      this.now() +
        Math.max(
          0,
          t.UpgradeTime -
            this.vipPrivilegeValue(r, buildingQueue(t) === 2 ? 30 : 29),
        ),
      r.id,
      son,
    );
    return { buildings: this.buildings(r), gold: r.gold };
  },
  createBuilding(r, son) {
    integer(son, 1);
    if (
      this.get(
        "select 1 from game_buildings where character_id=? and son_type=?",
        r.id,
        son,
      )
    )
      return { buildings: this.buildings(r), gold: r.gold };
    const t = Object.values(table("buildingtemplate")).find(
      (x) => x.SonType === son && x.BuildingGrade === 1,
    );
    need(t, "unknown_building");
    this.checkBuilding(r, t);
    this.checkBuildingQueue(r, t);
    this.wallet(r, "gold", -t.GoldConsume, "building_create:" + son);
    if (t.CrystalsConsume)
      this.resource(
        r,
        "crystals",
        -t.CrystalsConsume,
        "building_create:" + son,
      );
    this.run(
      "insert into game_buildings(character_id,son_type,template_id) values(?,?,?)",
      r.id,
      son,
      t.TemplateId,
    );
    return { buildings: this.buildings(r), gold: r.gold };
  },
};

import { need, integer } from "./util.js";
import { table, pt, army as source } from "./catalog.js";
export const armyRules = {
  pawnUnlocked(r, p) {
    const t = table("buildingtemplate")[p.NeedBuilding];
    if (!t) return false;
    const b = this.get(
      "select template_id from game_buildings where character_id=? and son_type=?",
      r.id,
      t.SonType,
    );
    return (
      !!b &&
      table("buildingtemplate")[b.template_id].BuildingGrade >= t.BuildingGrade
    );
  },
  army(r) {
    const own = Object.fromEntries(
        this.all("select * from game_pawns where character_id=?", r.id).map(
          (x) => [x.son_type, x],
        ),
      ),
      slots = this.all(
        "select * from game_pawn_slots where character_id=? order by slot",
        r.id,
      ),
      units = Object.values(pt())
        .filter((p) => p.Level === 1)
        .sort((a, b) => a.SonType - b.SonType)
        .map((first) => {
          const o = own[first.SonType],
            t = o ? pt()[o.template_id] : first;
          return {
            son_type: first.SonType,
            template_id: t.TemplateId,
            level: t.Level,
            reserve: o?.reserve ?? 0,
            deployed: slots
              .filter((s) => s.son_type === first.SonType)
              .reduce((n, s) => n + s.count, 0),
            unlocked: this.pawnUnlocked(r, t),
          };
        });
    const h = this.get(
        "select template_id from game_buildings where character_id=? and son_type=1201",
        r.id,
      ),
      f = this.get(
        "select hero_pos,pawn_pos,sorted from game_army_formation where character_id=?",
        r.id,
      ) ?? { hero_pos: 3, pawn_pos: 2, sorted: 0 };
    return {
      units,
      slots,
      population: units.reduce(
        (n, u) =>
          n + (u.reserve + u.deployed) * pt()[u.template_id].NeedPopulation,
        0,
      ),
      population_capacity: h
        ? +table("buildingtemplate")[h.template_id].Property2
        : 0,
      formation: f,
      commander_capacity: table("herotemplate")[r.icon].Captain,
    };
  },
  pawnAudit(r, op, payload) {
    this.run(
      "insert into game_pawn_audit(character_id,operation,payload_json,created_at) values(?,?,?,?)",
      r.id,
      op,
      JSON.stringify(payload),
      this.now(),
    );
  },
  recruit(r, id, count) {
    integer(id, 1);
    integer(count, 1, 1000000);
    const p = pt()[id];
    need(p, "unknown_pawn");
    need(this.pawnUnlocked(r, p), "pawn_building_locked");
    const old = this.get(
      "select * from game_pawns where character_id=? and son_type=?",
      r.id,
      p.SonType,
    );
    need(
      (!old && p.Level === 1) || old?.template_id === id,
      "pawn_level_mismatch",
    );
    const a = this.army(r);
    need(
      a.population + count * p.NeedPopulation <= a.population_capacity,
      "pawn_population_full",
    );
    need(p.NeedTime === 0 && p.CrystalsConsume === 0, "pawn_rule_unsupported");
    this.wallet(r, "gold", -p.GoldConsume * count, "pawn_recruit:" + id);
    this.run(
      "insert into game_pawns values(?,?,?,?) on conflict(character_id,son_type) do update set reserve=reserve+excluded.reserve",
      r.id,
      p.SonType,
      id,
      count,
    );
    this.pawnAudit(r, "recruit", { template_id: id, count });
    return this.army(r);
  },
  deploy(r, id, slot, count) {
    integer(id, 0);
    integer(slot, 0, 1);
    integer(count, 0, 1000000);
    const old = this.get(
      "select * from game_pawn_slots where character_id=? and slot=?",
      r.id,
      slot,
    );
    if (old) {
      this.run(
        "update game_pawns set reserve=reserve+? where character_id=? and son_type=?",
        old.count,
        r.id,
        old.son_type,
      );
      this.run(
        "delete from game_pawn_slots where character_id=? and slot=?",
        r.id,
        slot,
      );
    }
    if (count) {
      const p = pt()[id];
      need(p, "unknown_pawn");
      const own = this.get(
        "select * from game_pawns where character_id=? and son_type=?",
        r.id,
        p.SonType,
      );
      need(own?.template_id === id && own.reserve >= count, "pawn_not_owned");
      const a = this.army(r);
      need(
        a.slots.reduce(
          (n, s) =>
            n +
            s.count *
              pt()[a.units.find((u) => u.son_type === s.son_type).template_id]
                .NeedPopulation,
          0,
        ) +
          count * p.NeedPopulation <=
          a.commander_capacity,
        "pawn_commander_full",
      );
      this.run(
        "update game_pawns set reserve=reserve-? where character_id=? and son_type=?",
        count,
        r.id,
        p.SonType,
      );
      this.run(
        "insert into game_pawn_slots values(?,?,?,?)",
        r.id,
        slot,
        p.SonType,
        count,
      );
    }
    this.pawnAudit(r, "deploy", { template_id: id, slot, count });
    return this.army(r);
  },
  dismiss(r, id, count) {
    integer(id, 1);
    integer(count, 1, 1000000);
    const p = pt()[id];
    need(p, "unknown_pawn");
    const own = this.get(
      "select * from game_pawns where character_id=? and son_type=?",
      r.id,
      p.SonType,
    );
    need(own?.template_id === id && own.reserve >= count, "pawn_not_owned");
    this.run(
      "update game_pawns set reserve=reserve-? where character_id=? and son_type=?",
      count,
      r.id,
      p.SonType,
    );
    this.pawnAudit(r, "dismiss", { template_id: id, count });
    return this.army(r);
  },
  formation(r, hero, pawn) {
    integer(hero, 2, 3);
    integer(pawn, 2, 3);
    need(hero !== pawn, "invalid_army_formation");
    this.run(
      "insert into game_army_formation values(?,?,?,1) on conflict(character_id) do update set hero_pos=excluded.hero_pos,pawn_pos=excluded.pawn_pos,sorted=1",
      r.id,
      hero,
      pawn,
    );
    this.pawnAudit(r, "formation", { hero_pos: hero, pawn_pos: pawn });
    return this.army(r);
  },
  upgradePawn(r, id) {
    const p = pt()[integer(id, 1)];
    need(p, "unknown_pawn");
    const own = this.get(
      "select * from game_pawns where character_id=? and son_type=?",
      r.id,
      p.SonType,
    );
    need(
      (!own && p.Level === 1) || own?.template_id === id,
      "pawn_level_mismatch",
    );
    const t = pt()[p.NextLevelTemplateId];
    need(t, "pawn_max_level");
    need(this.pawnUnlocked(r, t), "pawn_building_locked");
    const b = this.get(
      "select template_id from game_buildings where character_id=? and son_type=402",
      r.id,
    );
    need(
      b && table("buildingtemplate")[b.template_id].BuildingGrade >= t.Level,
      "pawn_building_locked",
    );
    const price = source.upgradetemplate.find(
      (p) => p.TemplateId === t.TemplateId && p.Grades === t.Level,
    );
    need(price, "pawn_upgrade_price_missing");
    this.wallet(r, "gold", -price.Data, "pawn_upgrade:" + id);
    this.run(
      "insert into game_pawns values(?,?,?,0) on conflict(character_id,son_type) do update set template_id=excluded.template_id",
      r.id,
      p.SonType,
      t.TemplateId,
    );
    this.pawnAudit(r, "upgrade", {
      template_id: id,
      next_template: t.TemplateId,
      gold: price.Data,
    });
    return this.army(r);
  },
};

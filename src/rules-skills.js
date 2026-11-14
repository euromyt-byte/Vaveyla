import {skillStatus} from './combat-status.js';
import { need, integer, job, MAX } from "./util.js";
import { table, et, config } from "./catalog.js";
export const skillRules = {
  skills(r) {
    const j = job(r);
    this.run(
      "insert or ignore into game_skills values(?,?,?,0)",
      r.id,
      JSON.stringify([j * 10000 + 711, j * 10000 + 811]),
      `${j * 100 + 7},${j * 100 + 8},-1,-1,-1`,
    );
    const v = this.get("select * from game_skills where character_id=?", r.id);
    return {
      learned: JSON.parse(v.learned_json),
      fast_keys: v.fast_keys,
      points: Math.max(
        0,
        r.level - Number(config("AddSkill_Grade")) + 1 - v.spent,
      ),
      spent: v.spent,
      point_policy: "local_one_per_level_from_source_AddSkill_Grade",
    };
  },
  preferences(r) {
    const s = this.skills(r),
      normal = s.learned
        .filter(
          (t) =>
            this.skillTemplates()[t].UseWay !== 2 &&
            !this.skillTemplates()[t].IsDelphic,
        )
        .map((t) => "1:" + t)
        .join(",");
    this.run(
      "insert or ignore into game_skill_preferences values(?,1,50,?,?)",
      r.id,
      normal,
      "",
    );
    const p = this.get(
      "select * from game_skill_preferences where character_id=?",
      r.id,
    );
    return {
      enabled: !!p.enabled,
      percent: p.percent,
      normal_skill: p.normal_skill,
      special_skill: p.special_skill,
    };
  },
  editPreferences(r, enabled, percent, normal, special) {
    need(typeof enabled === "boolean", "invalid_skill_preferences");
    integer(percent, 0, 100);
    const owned = this.skills(r).learned,
      used = [];
    for (const text of [normal, special]) {
      need(
        typeof text === "string" && text.length <= 160,
        "invalid_skill_preferences",
      );
      const parts = text ? text.split(",") : [];
      need(parts.length <= 4, "invalid_skill_preferences");
      for (const v of parts) {
        need(/^1:[1-9][0-9]*$/.test(v), "unsupported_skill_preferences");
        const t = +v.slice(2);
        need(
          owned.includes(t) && this.skillTemplates()[t].UseWay !== 2,
          "skill_not_learned",
        );
        used.push(t);
      }
    }
    need(new Set(used).size === used.length, "invalid_skill_preferences");
    this.preferences(r);
    this.run(
      "update game_skill_preferences set enabled=?,percent=?,normal_skill=?,special_skill=? where character_id=?",
      +enabled,
      percent,
      normal,
      special,
      r.id,
    );
    return this.preferences(r);
  },
  learnSkill(r, id) {
    integer(id, 1);
    const t = this.skillTemplates()[id];
    need(t && t.MasterType === job(r), "skill_job");
    need(
      t.UseWay !== 1 || t.Parameter1 !== 0 || t.Parameter2 !== 0 || skillStatus(t)?.kind==='endurance' || (t.SonType===113 && /^113[1-5]1$/.test(String(t.TemplateId))),
      "skill_effect_unsupported",
    );
    const cur = this.skills(r),
      own = cur.learned
        .map((i) => this.skillTemplates()[i])
        .find((s) => s.SonType === t.SonType);
    if (own?.TemplateId === id) return cur;
    const first = Object.values(this.skillTemplates())
      .filter((s) => s.MasterType === job(r) && s.SonType === t.SonType)
      .sort((a, b) => a.Grades - b.Grades)[0];
    need(
      (!own && first.TemplateId === id) || Number(own?.NextTemplateId) === id,
      "skill_sequence",
    );
    need(t.NeedPlayerGrade <= r.level, "skill_level");
    for (const prior of String(t.PreTemplateId??"").match(/\d+/g) ?? []) {
      const n = this.skillTemplates()[prior];
      need(
        n &&
          cur.learned.some(
            (s) =>
              this.skillTemplates()[s].SonType === n.SonType &&
              this.skillTemplates()[s].Grades >= n.Grades,
          ),
        "skill_prerequisite",
      );
    }
    need(cur.points > 0, "skill_points");
    this.run(
      "update game_skills set learned_json=?,spent=spent+1 where character_id=?",
      JSON.stringify([
        ...cur.learned.filter((t) => !own || t !== own.TemplateId),
        id,
      ]),
      r.id,
    );
    if (own) {
      const p = this.get(
        "select normal_skill,special_skill from game_skill_preferences where character_id=?",
        r.id,
      );
      if (p)
        this.run(
          "update game_skill_preferences set normal_skill=?,special_skill=? where character_id=?",
          ...[p.normal_skill, p.special_skill].map((s) =>
            s
              .split(",")
              .map((v) => (v === "1:" + own.TemplateId ? "1:" + id : v))
              .join(","),
          ),
          r.id,
        );
    }
    return this.skills(r);
  },
  equipSkills(r, text) {
    need(typeof text === "string" && text.length <= 100, "invalid_fast_keys");
    const parts = text.replace(/,+$/, "").split(",");
    need(
      [5,6].includes(parts.length) && parts.every((p) => /^-1$|^[1-9][0-9]*$/.test(p)),
      "invalid_fast_keys",
    );
    const s = this.skills(r),
      allowed = s.learned
        .filter((t) => this.skillTemplates()[t].UseWay !== 2)
        .map((t) => this.skillTemplates()[t].SonType),
      used = parts.filter((p) => p !== "-1").map(Number);
    need(
      new Set(used).size === used.length &&
        used.every((x) => allowed.includes(x)),
      "skill_not_learned",
    );
    this.run(
      "update game_skills set fast_keys=? where character_id=?",
      parts.join(",")+(parts.length===6?",":""),
      r.id,
    );
    return this.skills(r);
  },
  stats(r) {
    const h = table("herotemplate")[r.icon],
      items = this.all(
        "select id,template_id from game_items where character_id=? and bag=4",
        r.id,
      ).map((x) => {const t=table("itemtemplate")[x.template_id],g=this.forgeGrade(r,x.id),out={...t};if(g)for(const k of ["Power","Agility","Intellect","Physique","Captain","Attack","MagicAttack","Defence","MagicDefence","ForceHit","Parry","Live","Conat"])if(t[k])out[k]+=Math.floor(t[k]*g*.1+5*g);for(const gem of this.itemGems(r,x.id)){const gt=table("itemtemplate")[gem.gem_template_id];for(const k of ["Power","Agility","Intellect","Physique","Captain","Attack","MagicAttack","Defence","MagicDefence","ForceHit","Parry","Live","Conat"])out[k]=(out[k]||0)+(Number(gt[k])||0);}return out;}),
      mountStats=this.ownedMounts(r).map(m=>JSON.parse(m.template_json)),
      bonus=this.progressionBonuses(r),
      sum = (k) => (bonus.flat[k]||0)+items.reduce((n, i) => n + (Number(i[k]) || 0), 0)+mountStats.reduce((n,m)=>n+(Number(m[k])||0),0),
      g = (r.level - 1) * 2,
      p = h.Power + g + sum("Power"),
      i = h.Intellect + g + sum("Intellect"),
      a = h.Agility + g + sum("Agility");
    const out = {
      max_hp: Math.max(
        1,
        300 + (r.level - 1) * 30 + sum("Live") + sum("Physique") * 20,
      ),
      physical_attack: Math.max(1, h.Attack + p * 4 + sum("Attack")),
      magic_attack: Math.max(1, h.MagicAttack + i * 4 + sum("MagicAttack")),
      physical_defense: Math.max(0, h.Defence + a * 4 + sum("Defence")),
      magic_defense: Math.max(0, h.MagicDefence + a * 4 + sum("MagicDefence")),
      crit_basis_points: Math.min(
        3000,
        Math.floor(Math.max(0, h.ForceHit + sum("ForceHit")) / 2),
      ),
      formula_version: "vaveyla-local-duel-2-hp300",
      official_formula_verified: false,
    };
    const mapping = {
        Live: "max_hp",
        Attack: "physical_attack",
        MagicAttack: "magic_attack",
        Defence: "physical_defense",
        MagicDefence: "magic_defense",
      },
      flat = {},
      percent = {};
    for (const k in mapping) {
      flat[k] = 0;
      percent[k] = bonus.percent[k]||0;
    }
    for (const id of this.skills(r).learned) {
      if (this.skillTemplates()[id]?.UseWay !== 2) continue;
      const p = this.skillProperty(id);
      if (!p) continue;
      for (const k in mapping)
        (p.AddType === 0 ? percent : flat)[k] += Number(p[k]);
    }
    for (const [source, key] of Object.entries(mapping))
      out[key] = Math.max(
        key === "max_hp" ? 1 : 0,
        Math.floor(((out[key] + flat[source]) * (100 + percent[source])) / 100),
      );
    out.fighting_capacity = Math.min(
      MAX,
      Math.floor(out.max_hp / 5) +
        out.physical_attack +
        out.magic_attack +
        out.physical_defense +
        out.magic_defense,
    );
    return out;
  },
};

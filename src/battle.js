import {skillStatus,incomingStatusDamage} from './combat-status.js';
import {
  need,
  integer,
  nonce,
  mono,
  date,
  job,
  mage,
  MAX,
  GameError,
} from "./util.js";
import {
  table,
  et,
  pt,
  maps,
  nodes,
  fights,
  training,
  config,
} from "./catalog.js";
import { mapIntro, owned, battleBases } from "./packets.js";
import { battleRewardRules } from "./battle-rewards.js";
export const FIGHTS = [1000103, 1000104, 1000106, 1000203, 1000205],
  APPROACH = { 1000110: 1000106, 1000208: 1000205 },
  CHECKS = {
    20: 1000103,
    50: 1000104,
    70: 1000106,
    90: 1000106,
    110: 1000106,
    140: 1000203,
    150: 1000205,
  };
export const freshTraining = () => ({
  format: 1,
  map_id: 10001,
  position: [480, 1320],
  entered: false,
  defeated: [],
  ui_nodes: [],
  active: null,
  completed: false,
  healed: false,
  observed_ui_nodes: [],
});
const tnode = (id) => training.campaigndata.find((n) => n.Id === id),
  tskill = (id) => training.skilltemplate.find((s) => s.TemplateId === id),
  thero = (id) => training.herotemplate.find((h) => h.TemplateId === id);
const skillList = (r, id) => [
  job(r) * 10000,
  job(r) * 10000 + 711,
  ...(FIGHTS.indexOf(id) >= 2 ? [job(r) * 10000 + 811] : []),
];
export function trainingState(store, r) {
  const row = store.get(
    "select * from wartune_training where character_id=?",
    r.id,
  );
  return row ? JSON.parse(row.state_json) : freshTraining();
}
export class Battle {
  constructor(game, role, campaignId = null, options = {}) {
    this.game = game;
    this.s = game.s;
    this.role = role;
    this.campaign = campaignId !== null;
    this.nextDue = null;
    this.startedAt = null;
    this.attached = false;
    this.entered = false;
    if (this.campaign) this.enterCampaign(campaignId, options.resume);
    else {
      const old = this.s.get(
        "select * from wartune_training where character_id=?",
        role.id,
      );
      this.document = old ? JSON.parse(old.state_json) : freshTraining();
      this.revision = old?.revision ?? -1;
      need(this.document.format === 1, "training_state_invalid");
    }
  }
  // VAVEYLA_UI_SAVAS_171
  get active() {
    return this.document.active;
  }
  get stage() {
    return this.active?.stage ?? "map";
  }
  get id() {
    return this.active?.id ?? null;
  }
  bind(role) {
    need(
      role.id === this.role.id && role.account_id === this.role.account_id,
      "campaign_owner",
    );
    if (!this.campaign)
      need(
        role.level === 1 || this.document.completed,
        "training_level_unsupported",
      );
    this.role = role;
  }
  row(id) {
    return this.campaign ? et("campaigndata")[id] : tnode(id);
  }
  skillRow(id) {
    return this.campaign ? this.game.combatSkill(this.role,id,this.active?.nextTalent??0) : tskill(id);
  }
  routeCleared() {
    const rows = nodes(this.document.map_id);
    return (
      !rows.some((n) => n.MasterType === 62 && n.MoveToNodeIds.length) &&
      rows.some(
        (n) => n.NodeState !== 9 && [41, 42].includes(n.MasterType) && (n.Soldiers || n.Heros),
      ) &&
      rows
        .filter(
          (n) => n.NodeState !== 9 && [41, 42].includes(n.MasterType) && (n.Soldiers || n.Heros),
        )
        .every((n) => this.document.defeated.includes(n.Id))
    );
  }
  enterCampaign(cid, resume = false) {
    this.game.tx(this.role.account_id, (r) => {
      const c = et("campaign")[cid];
      need(c, "unsupported_campaign");
      need(
        r.level >= c.MinLevel,
        "campaign_level",
        `Bu bölüm için ${c.MinLevel}. seviye gerekiyor.`,
      );
      need(
        !c.PreCampaignId ||
          this.game.factCount(r, "campaign_clear", c.PreCampaignId) > 0,
        "campaign_prerequisite",
        "Önce önceki bölümü zaferle bitirmelisin.",
      );
      need(
        !this.game.activeSweep(r),
        "sweep_busy",
        "Önce süren baskını bitir veya iptal et.",
      );
      const old = this.s.get(
          "select * from game_campaign_runs where character_id=?",
          r.id,
        ),
        doc = old ? JSON.parse(old.state_json) : null;
      this.revision = old?.revision ?? -1;
      need(!doc?.card_reward || doc.card_reward.claimed || doc.campaign_id === cid,"reward_pending","Önce savaş ödülünü seçmelisin.");
      if (doc?.campaign_id === cid && !doc.abandoned && (!doc.completed || resume || (doc.card_reward && !doc.card_reward.claimed))) {
        this.document = doc;
        if (doc.active && doc.active.stage !== "finished")
          doc.active.stage = "preparing";
      } else {
        need(!doc || doc.completed || doc.abandoned, "campaign_busy");
        this.game.resource(
          r,
          "stamina",
          -Number(config("SingleCampaign_Weary", 20)),
          "campaign_entry:" + cid,
        );
        const first = maps(cid)[0],
          spawn = nodes(first.Id).find((n) => n.MasterType === 40);
        need(spawn, "campaign_spawn_missing");
        this.document = {
          format: 1,
          run_id: nonce(12),
          campaign_id: cid,
          map_id: first.Id,
          position: [spawn.Property1 * 20, spawn.Property2 * 20],
          defeated: [],
          active: null,
          completed: false,
          abandoned: false,
          visited: [],
        };
      }
      this.s.run(
        "insert into game_campaign_runs values(?,?,?) on conflict(character_id) do update set revision=excluded.revision,state_json=excluded.state_json",
        r.id,
        ++this.revision,
        JSON.stringify(this.document),
      );
      this.role = r;
      this.entered = true;
    });
  }
  commit(kind, outcome = false) {
    const raw = JSON.stringify(this.document);
    need(raw.length <= (this.campaign ? 262144 : 65536), "battle_state_size");
    this.s.tx(() => {
      const r = this.s.role(this.role.account_id);
      need(r?.id === this.role.id, "campaign_owner");
      this.game.ensure(r);
      const dbtable = this.campaign ? "game_campaign_runs" : "wartune_training";
      const old = this.s.get(
        `select revision from ${dbtable} where character_id=?`,
        r.id,
      );
      need(
        (old?.revision ?? -1) === this.revision,
        "stale_battle",
        "Savaş başka bağlantıda değişti.",
      );
      if (this.campaign) {
        this.s.run(
          "update game_campaign_runs set revision=revision+1,state_json=? where character_id=?",
          raw,
          r.id,
        );
        if (outcome) {
          const b = this.active,
            won = b.player_hp > 0 && b.enemies.every((a) => a.hp === 0);
          need(
            b.stage === "finished" && (won || b.player_hp === 0),
            "invalid_campaign_result",
          );
          this.s.run(
            "insert into game_campaign_results values(?,?,?,?,?,?,?,?,?)",
            b.id,
            r.id,
            this.document.run_id,
            this.document.campaign_id,
            b.node_id,
            +won,
            b.player_hp,
            JSON.stringify(b.enemies),
            this.s.clock(),
          );
          if (won) {
            for (const a of b.enemies) this.game.fact(r, "kill", a.template);
            this.game.reward(r, "campaign-battle:" + b.id, {
              xp: b.campaign_xp ?? this.game.campaignXp(r,this.row(b.node_id).HeroGP),
            });
            if (this.document.completed) this.awardClear(r);
            this.game.autoAccept(r);
          }
        }
        if (kind === "route_completion") {
          const b = this.active,
            proof = this.s.get(
              "select won from game_campaign_results where character_id=? and run_id=? and node_id=? and battle_id=?",
              r.id,
              this.document.run_id,
              b.node_id,
              b.id,
            );
          need(
            proof?.won === 1 && this.routeCleared(),
            "invalid_campaign_result",
          );
          this.awardClear(r);
          this.game.autoAccept(r);
        }
      } else {
        need(
          r.level === 1 || this.document.completed,
          "training_level_unsupported",
        );
        if (old)
          this.s.run(
            "update wartune_training set revision=?,state_json=?,updated_at=? where character_id=?",
            this.revision + 1,
            raw,
            this.s.clock(),
            r.id,
          );
        else
          this.s.run(
            "insert into wartune_training values(?,?,?,?)",
            r.id,
            0,
            raw,
            this.s.clock(),
          );
        let result = null;
        if (outcome) {
          const b = this.active,
            won = b.player_hp > 0 && b.enemies.every((a) => a.hp === 0);
          need(
            b.stage === "finished" && (won || b.player_hp === 0),
            "invalid_training_result",
          );
          this.s.run(
            "insert into wartune_training_results values(?,?,?,?,?,?,?)",
            b.id,
            r.id,
            b.node_id,
            +won,
            b.player_hp,
            JSON.stringify(b.enemies.map((a) => a.hp)),
            this.s.clock(),
          );
          result = { won, node_id: b.node_id };
        }
        this.game.trainingEvent(r, this.document, result);
        this.s.run(
          "insert into wartune_training_events values(?,?,?,?,?,?)",
          nonce(),
          r.id,
          this.revision + 1,
          kind,
          raw,
          this.s.clock(),
        );
      }
      if (outcome) {
        const b = this.active,
          won = b.player_hp > 0 && b.enemies.every(a => a.hp === 0);
        this.game.notice(
          r, "battle-result:" + b.id, "battle",
          won ? "Savaş tamamlandı: Zafer!" : "Savaş tamamlandı: Yenilgi.",
          { battle_id: b.id, node_id: b.node_id, won },
        );
      }
    });
    this.revision++;
  }
  awardClear(r) {
    const key = "campaign-clear:" + this.document.run_id;
    if (
      this.s.get(
        "select 1 from game_reward_events where character_id=? and event_id=?",
        r.id,
        key,
      )
    )
      return;
    this.game.fact(r, "campaign_clear", this.document.campaign_id);
    this.game.reward(r, key, {
      xp: this.active?.clear_xp || this.game.campaignXp(r,et("campaign")[this.document.campaign_id].BaseGp),
    });
  }
  completeIfWon() {
    if (this.campaign) {
      if (
        !this.document.completed &&
        !this.document.abandoned &&
        this.active &&
        this.stage === "finished" &&
        this.active.player_hp > 0 &&
        this.routeCleared()
      ) {
        const before = structuredClone(this.document);
        this.document.completed = true;
        try {
          this.commit("route_completion");
        } catch (e) {
          this.document = before;
          throw e;
        }
      }
      this.ensureRewardPlan();
      return [];
    }
    if (
      !this.document.completed &&
      FIGHTS.every((n) => this.document.defeated.includes(n))
    )
      return this.checkpoint({ newNoviceProcess: 150 });
    this.ensureRewardPlan();
    return [];
  }
  intro() {
    if (this.entered) return;
    this.bind(this.role);
    if (this.active) {
      const b = this.active;
      if (!b.player_max_hp) {
        if (b.player_hp > 0) b.player_hp += 210;
        b.player_max_hp = 300;
      }
      b.allowed_skills = skillList(this.role, b.node_id);
      if (b.stage !== "finished") {
        // Repair old map2 saves without resetting HP, rage or cooldowns.
        if (
          this.document.map_id === 10002 &&
          FIGHTS.slice(0, 3).every((id) => this.document.defeated.includes(id))
        ) {
          if (!b.support) {
            const h = thero(1004);
            b.support = {
              id: 10,
              template: 1004,
              hp: h.Live,
              max_hp: h.Live,
              skill: h.DefaultSkill,
              attack: h.MagicAttack,
            };
          }
          if (
            b.node_id === FIGHTS.at(-1) &&
            !b.enemies.some((a) => a.id === 11)
          ) {
            const h = thero(1021);
            b.enemies.push({
              id: 11,
              template: 1021,
              kind: "hero",
              pos: 5,
              hp: h.Live,
              max_hp: h.Live,
              attack: Math.min(h.Attack, 45),
              skill: h.DefaultSkill,
            });
          }
        }
        if (b.stage === "paused") b.pause_requested = true;
        b.stage = "preparing";
      }
    }
    this.document.entered = true;
    this.commit("enter_or_reconnect");
    this.entered = true;
  }
  introPackets() {
    const packets = mapIntro(
      this.role,
      this.game.snapshot(this.role.account_id),
      this.document,
      this.campaign,
    );
    if (this.active && this.stage !== "finished")
      packets.push(...this.prepare());
    return [...packets, ...this.rewardPackets()];
  }
  update(id, status) {
    const n = this.row(id === 1000202 ? 1000107 : id);
    return [
      128,
      "campaign.CampaignNodeUpdateMsg",
      {
        nodeId: id,
        nodeState: status,
        userId: this.role.player_id,
        sonType: n.SonType,
        uuId: status === 4 ? this.id : "",
        visitUserIds: status === 4 ? [this.role.player_id] : [],
        visitServerName: status === 4 ? ["VAVEYLA"] : [],
      },
    ];
  }
  move(role, q) {
    this.bind(role);
    need(!this.pendingReward(),"reward_pending","Önce savaş ödülünü seçmelisin.");
    need(q.armyId === role.player_id, "campaign_move_owner");
    const m = this.campaign
      ? et("map")[q.mapId]
      : { Width: 2000, Height: 1500 };
    need(
      m &&
        (this.campaign
          ? maps(this.document.campaign_id).some((x) => x.Id === q.mapId)
          : q.mapId === this.document.map_id),
      "campaign_move_map",
    );
    if (q.mapId !== this.document.map_id) return [];
    need(
      q.routes.length >= 1 &&
        q.routes.length <= 256 &&
        [0, 1, 2].includes(q.moveType),
      "campaign_route",
    );
    need(
      q.routes.every(
        (p) => p.x >= 0 && p.y >= 0 && p.x < m.Width && p.y < m.Height,
      ),
      "campaign_position",
    );
    if (
      this.document.completed ||
      this.document.abandoned ||
      !["map", "finished"].includes(this.stage)
    )
      return [];
    const p = q.routes.at(-1);
    this.document.position = [p.x, p.y];
    this.commit("move");
    return [];
  }
  arrive(role, q) {
    this.bind(role);
    need(!this.pendingReward(),"reward_pending","Önce savaş ödülünü seçmelisin.");
    if (!this.campaign) need(this.entered, "training_arrival_state");
    let id = q.paraInt1,
      n = this.row(id),
      prefix = [];
    need(
      ![
        "paraInt2",
        "paraInt3",
        "paraInt4",
        "paraInt5",
        "paraString1",
        "isCross",
      ].some((k) => q[k]),
      "campaign_arrival_fields",
    );
    need(!q.serverName || q.serverName === "VAVEYLA", "campaign_owner");
    if (!this.campaign && id === 1000202 && this.document.map_id === 10002)
      return [this.update(id, 2)];
    need(n && n.CampaignId === this.document.map_id, "campaign_arrival_map");
    need(
      Math.hypot(
        this.document.position[0] - n.Property1 * 20,
        this.document.position[1] - n.Property2 * 20,
      ) <= (this.campaign ? 240 : 600),
      "campaign_arrival_distance",
    );
    if (this.document.defeated.includes(id)) return [this.update(id, 8)];
    if (!this.campaign && id === 1000107) {
      need(
        q.paraBool1 &&
          FIGHTS.slice(0, 3).every((n) => this.document.defeated.includes(n)),
        "training_npc_locked",
      );
      return [this.update(id, 2)];
    }
    if (!this.campaign && id === 1000108) {
      need(
        this.document.defeated.includes(1000106) &&
          this.document.ui_nodes.includes(110),
        "training_portal_locked",
      );
      Object.assign(this.document, {
        map_id: 10002,
        position: [1400, 1360],
        active: null,
      });
      this.commit("portal");
      return this.introPackets();
    }
    if (this.campaign && n.MasterType === 62 && n.MoveToNodeIds.length) {
      need(
        nodes(n.CampaignId)
          .filter(
            (x) => x.NodeState !== 9 && [41, 42].includes(x.MasterType) && (x.Soldiers || x.Heros),
          )
          .every((x) => this.document.defeated.includes(x.Id)),
        "campaign_map_uncleared",
      );
      const dest =
        et("campaigndata")[
          n.MoveToNodeIds[
            this.branchChoice
              ? this.branchChoice(n.MoveToNodeIds)
              : Math.floor(Math.random() * n.MoveToNodeIds.length)
          ]
        ];
      need(
        maps(this.document.campaign_id).some((m) => m.Id === dest.CampaignId),
        "campaign_portal",
      );
      Object.assign(this.document, {
        map_id: dest.CampaignId,
        position: [dest.Property1 * 20, dest.Property2 * 20],
        active: null,
      });
      this.commit("portal");
      return this.introPackets();
    }
    if (!this.campaign && APPROACH[id]) {
      prefix.push(this.update(id, 8));
      this.document.position = n.Param4.split(",").map((x) => +x * 20);
      id = APPROACH[id];
      n = this.row(id);
      prefix.push([
        131,
        "army.ArmyMsg",
        {
          armyId: role.player_id,
          playerId: role.player_id,
          mapId: this.document.map_id,
          curPosX: this.document.position[0] / 20,
          curPosY: this.document.position[1] / 20,
          state: 0,
          serverName: "VAVEYLA",
        },
      ]);
    }
    if (this.active && this.stage !== "finished") {
      need(this.active.node_id === id, "campaign_battle_busy");
      return prefix;
    }
    need(
      !this.document.completed && !this.document.abandoned,
      "campaign_closed",
    );
    if (this.campaign && ![41, 42].includes(n.MasterType)) {
      if (!this.document.visited.includes(id)) this.document.visited.push(id);
      this.commit("visited");
      return [this.update(id, 8)];
    }
    if (!this.campaign) {
      const index = FIGHTS.indexOf(id);
      need(
        q.paraBool1 &&
          index >= 0 &&
          (index === 0 || this.document.defeated.includes(FIGHTS[index - 1])),
        "training_encounter_locked",
      );
    }
    const enemies = [];
    for (const [field, type] of [
      ["Soldiers", "pawntemplate"],
      ["Heros", "herotemplate"],
    ]) {
      if (!this.campaign && field === "Heros") continue;
      for (const pair of n[field].split("|").filter(Boolean)) {
        const [template, pos] = pair.split(",").map(Number),
          p = this.campaign
            ? et(type)[template]
            : training[type].find((p) => p.TemplateId === template);
        enemies.push({
          id: (this.campaign ? 20 : 2) + enemies.length,
          template,
          pos,
          ...(field === "Heros" ? { kind: "hero" } : {}),
          hp: p.Live,
          max_hp: p.Live,
          attack: this.campaign ? Math.max(p.Attack, p.MagicAttack) : p.Attack,
          defense: this.campaign
            ? mage(role)
              ? p.MagicDefence
              : p.Defence
            : 0,
          skill: p.DefaultSkill,
        });
      }
    }
    need(enemies.length, "campaign_formation_missing");
    const v = this.game.snapshot(role.account_id),
      normal = job(role) * 10000,
      equipped = v.skills.fast_keys.split(",").map(Number),
      allowed = this.campaign
        ? [
            normal,
            ...String(v.talent?.talentSkill??'').split(',').map(Number).filter(id=>{const t=this.game.skillTemplates()[id];return t?.MasterType===100&&t.Index===10&&t.UseWay===1;}),
            ...v.skills.learned.filter(
              (t) =>
                equipped.includes(this.game.skillTemplates()[t].SonType) &&
                this.game.skillTemplates()[t].UseWay !== 2,
            ),
          ]
        : skillList(role, id),
      allies = [];
    if (this.campaign)
      for (const slot of v.army.slots) {
        const unit = v.army.units.find((u) => u.son_type === slot.son_type),
          p = et("pawntemplate")[unit.template_id];
        allies.push({
          id: 2 + slot.slot,
          template: p.TemplateId,
          pos: v.army.formation.pawn_pos + 3 * slot.slot,
          hp: Math.min(MAX, p.Live * slot.count),
          max_hp: Math.min(MAX, p.Live * slot.count),
          attack: Math.max(
            1,
            Math.floor((Math.max(p.Attack, p.MagicAttack) * slot.count) / 10),
          ),
          skill: p.DefaultSkill,
        });
      }
    this.document.active = {
      id: nonce(),
      node_id: id,
      stage: "preparing",
      battle_type: n.BattleType || 6,
      player_hp: this.campaign ? v.combat.max_hp : 300,
      player_max_hp: this.campaign ? v.combat.max_hp : 300,
      rage: Number.isFinite(this.document.scene_rage) ? this.document.scene_rage : 30,
      enemies,
      actor: 1,
      enemy_cursor: 0,
      sequence: 0,
      normal,
      allowed_skills: allowed,
      queued_skill: normal,
      cooldowns: {},
      elapsed: 0,
      delay: 3.5,
    };
    if (this.campaign)
      Object.assign(this.active, {
        allies,
        stats: v.combat,
        auto: v.skill_preferences,
        hero_pos: v.army.formation.hero_pos,
      });
    else if (this.document.map_id === 10002) {
      const h = thero(1004);
      this.active.support = {
        id: 10,
        template: 1004,
        hp: h.Live,
        max_hp: h.Live,
        skill: h.DefaultSkill,
        attack: h.MagicAttack,
      };
      if (id === FIGHTS.at(-1)) {
        const p = thero(1021);
        this.active.enemies.push({
          id: 11,
          template: 1021,
          kind: "hero",
          pos: 5,
          hp: p.Live,
          max_hp: p.Live,
          attack: Math.min(p.Attack, 45),
          skill: p.DefaultSkill,
        });
      }
    }
    this.attached = false;
    this.commit("prepare");
    return [...prefix, ...this.prepare()];
  }
  prepare() {
    const b = this.active,
      n = this.row(b.node_id),
      body = owned(battleBases[this.role.icon], this.role);
    Object.assign(body, {
      battleId: b.id,
      mapTempId: this.document.map_id,
      battleType: b.battle_type,
      blueTeamName: n.NodeName_en,
    });
    Object.assign(body.heros[0], {
      grade: this.role.level,
      pos: b.hero_pos ?? 5,
      hp: b.player_hp,
      initHp: b.player_hp,
      maxHp: b.player_max_hp ?? 300,
      sp: b.rage,
      spMax: 100,
      skillId: b.allowed_skills,
    });
    body.soldiers = [];
    const actors = [
      ...(b.allies ?? []).map((a) => [1, a]),
      ...b.enemies.map((a) => [2, a]),
      ...(b.support ? [[1, b.support]] : []),
    ];
    for (const [side, a] of actors) {
      const h = {
        livingId: a.id,
        tempId: a.template,
        side,
        pos: a.pos ?? 6,
        type: 1,
        grade: Math.max(1, n.Level),
        initHp: a.hp,
        hp: a.hp,
        maxHp: a.max_hp,
        skillId: [a.skill],
        castTime: this.campaign
          ? Math.max(500, this.skillRow(a.skill).CastTime)
          : this.skillRow(a.skill).CastTime,
        qteTime: 0,
      };
      if (a.kind === "hero" || (a.id === 10 && b.support)) {
        const p = this.campaign
          ? et("herotemplate")[a.template]
          : thero(a.template);
        Object.assign(h, {
          heroId: a.id,
          userId: 0,
          serverName: "VAVEYLA",
          res: p.ResPath,
          headId: a.template,
          nickName: p.TemplateName_en,
          isShow: false,
          hasShadow: true,
          type: 3,
        });
        body.heros.push(h);
      } else body.soldiers.push(h);
    }
    body.soldierTemplated = [
      ...new Set(body.soldiers.map((s) => s.tempId)),
    ].sort((a, b) => a - b);
    return [this.update(b.node_id, 4), [157, "battle.BattlePrepareMsg", body]];
  }
  completedBattle(id) {
    return !!this.s.get(
      `select 1 from ${this.campaign ? "game_campaign_results" : "wartune_training_results"} where character_id=? and battle_id=?`,
      this.role.id,
      id,
    );
  }
  load(role, q, now = mono()) {
    this.bind(role);
    need(
      q.armyId === role.player_id && q.serverName === "VAVEYLA",
      "campaign_owner",
    );
    if (q.battleId !== this.id && this.completedBattle(q.battleId)) return [];
    need(this.active && q.battleId === this.id, "battle_id");
    // VAVEYLA_UI_SAVAS_171
    if (this.stage === "finished") {
      if (!this.completedBattle(q.battleId)) return [];
      const b = this.active;
      const won = b.player_hp > 0 &&
        b.enemies.every(x => x.hp <= 0);
      return [[4103, "battle.BattleReportMsg", structuredClone(b.report ?? {
        battleId: b.id,
        battleResult: won ? 1 : 2,
        battleScene: b.battle_type,
        gpBonus: 0, goldBonus: 0, baseItem: []
      })], ...this.rewardPackets()];
    }
    if (this.attached) return [];
    need(this.stage === "preparing", "battle_state");
    const b = this.active,
      terminal = b.player_hp === 0 || b.enemies.every((a) => a.hp === 0);
    b.stage = terminal ? "finishing" : b.pause_requested ? "paused" : "running";
    this.startedAt = now - b.elapsed;
    this.nextDue = b.stage === "paused" ? null : now + b.delay;
    this.attached = true;
    this.commit("loaded");
    return [
      [
        156,
        "battle.BattleStartMsg",
        { frame: 0, mainType: b.battle_type, countDown: 0 },
      ],
    ];
  }
  targets(id) {
    const alive = this.active.enemies.filter((a) => a.hp > 0);
    if (!alive.length) return [];
    if (this.campaign) {
      const t = this.skillRow(id);
      if ([3, 8, 9, 10].includes(t.AcceptObject)) return alive;
      if ([2, 12].includes(t.AcceptObject)) return alive.slice(0, 2);
    } else {
      if (id === 30811) return alive;
      if (id === 20811) return [alive[0], alive.at(-1)];
    }
    return [
      alive.reduce((a, b) => (a.hp / a.max_hp <= b.hp / b.max_hp ? a : b)),
    ];
  }
  skill(q, now = mono()) {
    if (q.battleId !== this.id && this.completedBattle(q.battleId)) {
      need(q.heroId === 1, "campaign_owner");
      return [];
    }
    need(this.active && q.battleId === this.id && q.heroId === 1, "battle_id");
    if (this.stage !== "running") return [];
    const b = this.active,
      id = q.skillId;
    if (!b.allowed_skills.includes(id)) return [];
    const s = this.skillRow(id),
      elapsed = Math.max(0, now - this.startedAt);
    if ((b.cooldowns[id] ?? 0) > elapsed || b.rage + s.Cost < 0) return [];
    b.queued_skill = id;
    this.commit("select_skill");
    return [
      [
        75,
        "battle.HeroOrderMsg",
        {
          battleId: b.id,
          heroIndexId: 1,
          skillId: id,
          result: 0,
          castTime: s.CastTime,
          qteTime: s.QteTime,
          targetIndexs: this.targets(id).map((a) => a.id),
        },
      ],
    ];
  }
  pause(q, paused, now = mono()) {
    if (q.battleId !== this.id && this.completedBattle(q.battleId)) return [];
    need(this.active && q.battleId === this.id, "battle_id");
    need(
      !Object.entries(q).some(([k, v]) => k !== "battleId" && v),
      "invalid_battle_operation",
    );
    const b = this.active;
    if (this.stage === "preparing") {
      if (!!b.pause_requested !== paused) {
        b.pause_requested = paused;
        this.commit("pause_before_load");
      }
      return [];
    }
    if (
      ["finishing", "finished"].includes(this.stage) ||
      (paused && this.stage === "paused") ||
      (!paused && this.stage === "running")
    )
      return [];
    if (paused) {
      b.delay = Math.max(0, this.nextDue - now);
      b.elapsed = Math.max(0, now - this.startedAt);
      b.stage = "paused";
      this.nextDue = null;
    } else {
      b.stage = "running";
      this.startedAt = now - b.elapsed;
      this.nextDue = now + b.delay;
    }
    b.pause_requested = paused;
    this.commit("pause");
    return [];
  }
  tick(now = mono()) {
    if (this.stage !== "running" || this.nextDue == null || now < this.nextDue)
      return [];
    // VAVEYLA_FIX_INLINE_160
    const b0 = this.active;
    if (b0.player_hp <= 0 ||
        (b0.enemies.length &&
         b0.enemies.every(x => x.hp <= 0))) {
      b0.stage = "finishing";
      b0.delay = 1;
      this.nextDue = now + 1;
      this.commit("recover_battle_finish");
      return [];
    }
    const b = this.active,
      caster = b.actor,
      elapsed = Math.max(0, now - this.startedAt),
      damages = [];
    let skill;
    const hurt = (target, amount) => {
      amount = Math.min(target.hp, Math.max(1, amount));
      target.hp -= amount;
      return {
        livingId: target.id,
        damageType: 6,
        damageValue: amount,
        leftValue: target.hp,
        hpLimit: target.max_hp,
        isHarmful: true,
        hasIcon: false,
        order: damages.length,
      };
    };
    const hitHero = (amount, healing = false, criticalPercent=0) => {
      if(!healing)amount=incomingStatusDamage(amount,b.endurance,criticalPercent,this.statusRoll);
      if(!healing && b.shield?.hp>0){const absorbed=Math.min(amount,b.shield.hp);b.shield.hp-=absorbed;amount-=absorbed;}
      amount = healing
        ? Math.min(b.player_max_hp - b.player_hp, amount)
        : Math.min(b.player_hp, amount);
      b.player_hp += healing ? amount : -amount;
      damages.push({
        livingId: 1,
        damageType: 6,
        damageValue: healing ? -amount : amount,
        leftValue: b.player_hp,
        hpLimit: b.player_max_hp,
        isHarmful: !healing,
        hasIcon: false,
        order: 0,
      });
    };
    if (caster === 1) {
      skill = b.queued_skill;
      if (this.campaign && skill === b.normal && b.auto.enabled) {
        const values = (b.auto.normal_skill + "," + b.auto.special_skill)
          .split(",")
          .filter((v) => v.startsWith("1:"))
          .map((v) => +v.slice(2))
          .reverse();
        for (const id of values) {
          const row = this.skillRow(id);
          if (
            b.allowed_skills.includes(id) &&
            (b.cooldowns[id] ?? 0) <= elapsed &&
            b.rage + row.Cost >= 0
          ) {
            skill = id;
            break;
          }
        }
      }
      let data = this.skillRow(skill);
      if ((b.cooldowns[skill] ?? 0) > elapsed || b.rage + data.Cost < 0) {
        skill = b.normal;
        data = this.skillRow(skill);
      }
      if (this.campaign) {
        if(b.shield && --b.shield.turns<=0)delete b.shield;
        if(b.endurance && --b.endurance.turns<=0)delete b.endurance;
        const status=skillStatus(data);if(status?.kind==='endurance'){b.endurance={blockPercent:status.blockPercent,criticalDelta:status.criticalDelta,turns:status.turns};hitHero(Math.floor(b.player_max_hp*status.healPercent/100),true);}
        if(data.SonType===113)b.shield={hp:Math.floor(b.player_max_hp*(10+5*data.Grades)/100),turns:3};
        if (data.Parameter1 < 0)
          hitHero(
            Math.max(
              1,
              Math.floor((-b.stats.magic_attack * data.Parameter1) / 100),
            ),
            true,
          );
        if (data.Parameter1 > 0 || data.Parameter2 > 0)
          for (const target of this.targets(skill)) {
            if(status?.kind==='bleed')target.bleed={damage:Math.floor(b.stats.physical_attack*status.attackPercent/100),turns:status.turns};
            const attack =
              b.stats[mage(this.role) ? "magic_attack" : "physical_attack"];
            damages.push(
              hurt(
                target,
                Math.max(
                  1,
                  Math.floor((attack * Math.max(100, data.Parameter1)) / 100) +
                    data.Parameter2 -
                    Math.floor(target.defense / 2),
                ),
              ),
            );
          }
      } else
        for (const target of this.targets(skill))
          damages.push(
            hurt(
              target,
              Math.max(
                1,
                Math.floor((5 * data.Parameter1) / 100) + data.Parameter2,
              ),
            ),
          );
      b.rage = Math.min(100, b.rage + data.Cost);
      if(data.MasterType===100&&data.Index===10)b.nextTalent=data.TemplateId;else delete b.nextTalent;
      b.cooldowns[skill] = elapsed + data.CoolDown / 1000;
      b.queued_skill = b.normal;
    } else if (!this.campaign && caster === 10 && b.support) {
      skill = b.support.skill;
      const data = this.skillRow(skill);
      hitHero(
        Math.max(0, Math.floor((-data.Parameter1 * b.support.attack) / 100)),
        true,
      );
    } else if (this.campaign && b.allies.some((a) => a.id === caster)) {
      const a = b.allies.find((a) => a.id === caster);
      skill = a.skill;
      const target = this.targets(skill)[0];
      if (target)
        damages.push(
          hurt(target, Math.max(1, a.attack - Math.floor(target.defense / 2))),
        );
    } else {
      const enemy = b.enemies.find((a) => a.id === caster);
      skill = enemy.skill;
      if (this.campaign) {
        const ally = b.allies.find((a) => a.hp > 0),
          amount = Math.max(
            1,
            enemy.attack - Math.floor(b.stats.physical_defense / 2),
          );
        if (ally) damages.push(hurt(ally, amount));
        else hitHero(amount,false,enemy.criticalPercent??0);
      } else hitHero(enemy.attack);
      if(enemy.hp>0&&enemy.bleed?.turns>0){damages.push(hurt(enemy,enemy.bleed.damage));if(--enemy.bleed.turns<=0)delete enemy.bleed;}
    }
    b.sequence++;
    b.elapsed = elapsed;
    const body = {
      battleId: b.id,
      frame: Math.floor(elapsed * 25),
      orderId: skill,
      livingId: caster,
      attackMillis: date(this.s.clock()),
      attackOrderSeq: b.sequence,
      curTurn: b.sequence,
      execFrame: Math.floor(elapsed * 25),
      sp: b.rage,
      damages,
      buffers: [],
      awakenSoldiers: [],
    };
    if (!this.campaign) body.spAdded = 0;
    const alive = b.enemies.filter((a) => a.hp > 0);
    if (!alive.length || b.player_hp === 0) {
      b.stage = "finishing";
      b.delay = 0.25;
    } else if (this.campaign) {
      const order = [
        1,
        ...b.allies.filter((a) => a.hp > 0).map((a) => a.id),
        ...alive.map((a) => a.id),
      ];
      b.actor = order[(order.indexOf(caster) + 1) % order.length];
      b.delay = 3.5;
    } else if (caster === 1) {
      const enemy = alive[b.enemy_cursor++ % alive.length];
      b.actor = enemy.id;
      b.delay = this.skillRow(enemy.skill).CastTime / 1000;
    } else if (b.support && caster !== 10) {
      b.actor = 10;
      b.delay = this.skillRow(b.support.skill).CastTime / 1000;
    } else {
      b.actor = 1;
      b.delay = this.skillRow(b.queued_skill).CastTime / 1000;
    }
    this.nextDue = now + b.delay;
    this.commit("attack");
    return [[153, "battle.AttackOrderMsg", body]];
  }
  finish(role, now = mono()) {
    this.bind(role);
    if (
      this.stage !== "finishing" ||
      this.nextDue == null ||
      now < this.nextDue
    )
      return [];
    const old = structuredClone(this.document),
      b = this.active,
      won = b.player_hp > 0 && b.enemies.every((a) => a.hp === 0);
    if (won && !this.document.defeated.includes(b.node_id))
      this.document.defeated.push(b.node_id);
    b.stage = "finished";
    this.document.scene_rage = b.rage;
    if (this.campaign) this.document.completed = won && this.routeCleared();
    if(won&&this.campaign){
      b.campaign_xp=this.game.campaignXp(role,this.row(b.node_id).HeroGP);
      b.clear_xp=this.document.completed?this.game.campaignXp(role,et("campaign")[this.document.campaign_id].BaseGp):0;
    }
    const xpBonus = won
      ? this.campaign
        ? b.campaign_xp + b.clear_xp
        : b.node_id === FIGHTS.at(-1)
          ? (this.s.get(
              "select pending_xp from game_progress where character_id=?",
              role.id,
            )?.pending_xp ?? 0) + this.row(b.node_id).HeroGP
          : 0
      : 0;
    // Persist the exact client report with the result transaction. Replaying a
    // completed battle must not recalculate its XP or grant its rewards again.
    b.report = {
      battleId: b.id,
      battleResult: won ? 1 : 2,
      battleScene: b.battle_type,
      gpBonus: xpBonus,
      goldBonus: 0,
      baseItem: [],
    };
    this.makeRewardPlan();
    try {
      this.commit("result", true);
    } catch (e) {
      this.document = old;
      throw e;
    }
    this.nextDue = null;
    const replies = [
      [
        4103,
        "battle.BattleReportMsg",
        structuredClone(b.report),
      ],
      this.update(b.node_id, won ? 8 : 1),
    ];
    if (this.campaign && won)
      replies.push([
        129,
        "campaign.CampaignNodeSuccMsg",
        { nodeId: b.node_id },
      ]);
    if (!this.campaign && won && b.node_id === FIGHTS.at(-1))
      replies.push(...this.completeIfWon());
    return [...replies, ...this.rewardPackets()];
  }
  checkpoint(q) {
    if (this.campaign) return [];
    const cp = q.newNoviceProcess;
    need(
      !Object.entries(q).some(([k, v]) => k !== "newNoviceProcess" && v),
      "invalid_training_request",
    );
    need(
      training.nodes.some((n) => n.id === cp),
      "invalid_training_request",
    );
    if (this.document.ui_nodes.includes(cp)) return [];
    if (CHECKS[cp])
      need(
        this.document.defeated.includes(CHECKS[cp]),
        "invalid_training_request",
      );
    else if (cp === 10) need(this.entered, "invalid_training_request");
    else {
      if (!this.document.observed_ui_nodes.includes(cp)) {
        this.document.observed_ui_nodes.push(cp);
        this.commit("unverified_ui_observation");
      }
      return [];
    }
    this.document.ui_nodes.push(cp);
    if (cp === 150) this.document.completed = true;
    this.commit("checkpoint");
    return cp === 150
      ? [
          [
            6,
            "player.LoginStateMsg",
            { playerId: this.role.player_id, state: 2 },
          ],
        ]
      : [];
  }
  callback(q) {
    need(
      !this.campaign &&
        q.mapId === 10001 &&
        q.nodeId === 1000106 &&
        q.cmd === 2 &&
        (!q.serverName || q.serverName === "VAVEYLA"),
      "training_callback",
    );
    need(
      this.document.defeated.includes(1000106) &&
        this.document.ui_nodes.includes(90),
      "training_callback",
    );
    if (!this.document.healed) {
      this.document.healed = true;
      this.commit("npc_dialogue");
    }
    return [];
  }
  preload(mapId) {
    if (this.campaign)
      need(
        maps(this.document.campaign_id).some((m) => m.Id === mapId),
        "campaign_preload_map",
      );
    else need([10001, 10002].includes(mapId), "training_preload_map");
    const rows = this.campaign
        ? nodes(mapId)
        : training.campaigndata.filter((n) => n.CampaignId === mapId),
      hero = new Set(),
      soldier = new Set();
    for (const n of rows)
      for (const [field, set] of [
        ["Heros", hero],
        ["Soldiers", soldier],
      ])
        for (const p of n[field].split("|").filter(Boolean))
          set.add(+p.split(",")[0]);
    return [
      20,
      "campaign.SystemArmyMsg",
      {
        heroTemplated: [...hero].sort((a, b) => a - b),
        soldierTemplated: [...soldier].sort((a, b) => a - b),
      },
    ];
  }
  fog(q) {
    need(this.campaign, "campaign_fog");
    need(q.dataList.length <= 4096, "campaign_fog_batch");
    const m = et("map")[this.document.map_id],
      max = Math.ceil(m.Width / 110) * Math.ceil(m.Height / 86),
      values = new Map();
    for (const row of q.dataList)
      if (
        row.index >= 0 &&
        row.index < max &&
        row.fogByte >= 0 &&
        row.fogByte <= 5
      )
        values.set(
          row.index,
          Math.max(values.get(row.index) ?? 0, row.fogByte),
        );
    return [
      19,
      "campaign.CampaignFogUpdateMsg",
      {
        fogUpdate: [...values].map(([index, fogByte]) => ({ index, fogByte })),
      },
    ];
  }
  abandon() {
    need(!this.pendingReward(),"reward_pending","Önce savaş ödülünü seçmelisin.");
    if (this.campaign && !this.document.completed && !this.document.abandoned) {
      this.document.abandoned = true;
      this.nextDue = null;
      this.commit("abandon");
    }
  }
}
Object.assign(Battle.prototype, battleRewardRules);

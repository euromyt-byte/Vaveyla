import { need, integer, nonce, MAX } from "./util.js";
import { config, et, maps, table } from "./catalog.js";

// Local raid policy: no waiting. Gold and stamina costs still apply.
export const SWEEP = Object.freeze({ seconds: 0, gold: 100, maxCount: 250 });
export function sourceSweepLoot(cid, count) {
  const pool = (et("campaign")[cid]?.Item ?? []).filter(
    (id) => id > 0 && table("itemtemplate")[id],
  );
  return Array.from({ length: count }, (_, i) =>
    pool.length
      ? [{ template_id: pool[i % pool.length], count: 1, bound: true }]
      : [],
  );
}
export const campaignRules = {
  spendPremium(r, cost, payType, reason) {
    integer(cost);
    need([1, 2].includes(payType), "invalid_pay_type");
    const bound =
      this.get(
        "select amount from game_resources where character_id=? and currency='bound_diamonds'",
        r.id,
      )?.amount ?? 0;
    const used = payType === 2 ? Math.min(bound, cost) : 0;
    if (used) this.resource(r, "bound_diamonds", -used, reason);
    if (cost - used) this.wallet(r, "diamonds", -(cost - used), reason);
  },
  activeSweep(r) {
    const row = this.get(
      "select * from game_campaign_sweeps where character_id=? and json_extract(state_json,'$.status')='running' limit 1",
      r.id,
    );
    return row ? { ...row, state: JSON.parse(row.state_json) } : null;
  },
  pendingSweep(r) {
    const row = this.get(
      "select * from game_campaign_sweeps where character_id=? order by created_at desc,rowid desc limit 1",
      r.id,
    );
    if (!row) return null;
    const state = JSON.parse(row.state_json);
    return state.status === "finished" && state.awaiting_ack ? {...row, state} : null;
  },
  sweepProof(r, cid) {
    const c = et("campaign")[cid];
    need(c, "unsupported_campaign", "Bu bölümün kaynak verisi bulunamadı.");
    need(
      r.level >= c.MinLevel,
      "campaign_level",
      `Bu bölüm için ${c.MinLevel}. seviye gerekiyor.`,
    );
    const proof = this.get(
      `select b.run_id from game_campaign_results b join game_reward_events e
      on e.character_id=b.character_id and e.event_id='campaign-clear:'||b.run_id
      where b.character_id=? and b.campaign_id=? group by b.run_id order by max(b.created_at) desc limit 1`,
      r.id,
      cid,
    );
    need(
      proof,
      "sweep_first_clear",
      "Baskın için bu bölümü önce savaşarak bitirmelisin.",
    );
    const mids = new Set(maps(cid).map((m) => m.Id));
    const rows = this.all(
      "select * from game_campaign_results where character_id=? and run_id=? and campaign_id=?",
      r.id,
      proof.run_id,
      cid,
    );
    const unique = new Set(), kills = new Map();
    let xp = c.BaseGp;
    for (const row of rows) {
      const n = et("campaigndata")[row.node_id],
        enemies = JSON.parse(row.enemies_json);
      need(
        row.won === 1 &&
          row.player_hp > 0 &&
          n &&
          mids.has(n.CampaignId) &&
          enemies.length &&
          enemies.every((e) => e.hp === 0),
        "sweep_result_proof",
      );
      if (!unique.has(row.node_id)){xp += n.HeroGP;for(const enemy of enemies)if(Number.isSafeInteger(enemy.template)&&enemy.template>0)kills.set(enemy.template,(kills.get(enemy.template)||0)+1);}
      unique.add(row.node_id);
    }
    integer(xp, 0, MAX);
    return { xp, proofRun: proof.run_id, kills:[...kills].map(([template_id,count])=>({template_id,count})) };
  },
  saveSweep(row) {
    this.run(
      "update game_campaign_sweeps set state_json=? where id=? and character_id=?",
      JSON.stringify(row.state),
      row.id,
      row.character_id,
    );
  },
  settleSweep(r, row) {
    const d = row.state,
      before = d.finished;
    if (d.status !== "running") return 0;
    // Finish new and pre-update timed jobs immediately, without clock math.
    const due = d.count;
    d.seconds = 0;
    d.awaiting_ack = true;
    // Local source-preview round-robin; never retroactively award finished runs.
    if (!d.loot) d.loot = sourceSweepLoot(row.campaign_id, d.count);
    for (let i = d.finished; i < due; i++) {
      this.reward(r, `sweep:${row.id}:${i + 1}`, {
        xp: d.xp,
        items: d.loot[i],
      });
      for(const enemy of d.kills??[])this.fact(r,"kill",enemy.template_id,enemy.count);
      this.fact(r, "campaign_clear", row.campaign_id);
      this.notice(
        r,
        `sweep:${row.id}:${i + 1}`,
        "sweep",
        `Baskın tamamlandı: ${i + 1}/${d.count}.`,
        { campaign_id: row.campaign_id },
      );
      d.finished = i + 1;
    }
    if (d.finished === d.count) d.status = "finished";
    this.saveSweep(row);
    this.autoAccept(r);
    return d.finished - before;
  },
  sweepResponse(r, row, status, gained = 0) {
    const d = row.state,
      running = d.status === "running";
    const aggregate = (lists) => {
      const rows = new Map();
      for (const item of lists.flat()) {
        const old = rows.get(item.template_id) ?? {
          templateId: item.template_id,
          count: 0,
        };
        old.count += item.count;
        rows.set(item.template_id, old);
      }
      return [...rows.values()];
    };
    const earned = aggregate(
      (d.loot ?? []).slice(d.finished - gained, d.finished),
    );
    const remaining =
      d.status === "cancelled"
        ? earned
        : aggregate((d.loot ?? []).slice(d.finished - gained));
    const result = [];
    if (gained || !running)
      result.push({
        type: 1,
        gp: gained * d.xp,
        gold: 0,
        campaignId: row.campaign_id,
        finishCount: d.finished,
        count: d.count,
        cIndex: d.finished,
        level: r.level,
        items: earned,
      });
    if (running)
      result.push({
        type: 2,
        campaignId: row.campaign_id,
        gp: 0,
        time: Math.max(
          1,
          Math.ceil(d.started + (d.finished + 1) * d.seconds - this.now()),
        ),
        finishCount: d.finished,
        count: d.count,
        cIndex: d.finished,
        items: [],
      });
    return {
      status,
      sweepType: 1,
      campaignId: row.campaign_id,
      totalGp: d.finished * d.xp,
      dropItems: remaining,
      result,
    };
  },
  campaignSweep(r, q) {
    need(
      q.sweepType === 1 &&
        [0, 1, 2, 3, 4].includes(q.opType) &&
        !q.eIndex &&
        [0, 1].includes(q.enterType),
      "unsupported_sweep",
      "Yalnızca normal bölüm baskını destekleniyor.",
    );
    let row = this.activeSweep(r);
    if (q.opType === 1) {
      integer(q.count, 1, SWEEP.maxCount);
      if (row) {
        need(
          row.campaign_id === q.campaignId && row.state.count === q.count,
          "sweep_busy",
          "Başka bir baskın sürüyor.",
        );
        const gained = this.settleSweep(r, row);
        return this.sweepResponse(
          r,
          row,
          row.state.status === "running" ? 1 : 11,
          gained,
        );
      }
      // Native op1 has no request ID. Until Confirm/Close acknowledges the
      // result, an identical retry returns its receipt without another charge.
      const pending = this.pendingSweep(r);
      if (pending && pending.campaign_id === q.campaignId && pending.state.count === q.count)
        return this.sweepResponse(r, pending, 11, pending.state.finished);
      const proof = this.sweepProof(r, q.campaignId);
      const battle = this.get(
        "select state_json from game_campaign_runs where character_id=?",
        r.id,
      );
      const doc = battle ? JSON.parse(battle.state_json) : null;
      need(!doc?.card_reward || doc.card_reward.claimed,"reward_pending","Önce savaş ödülünü seçmelisin.");
      need(
        !doc || doc.completed || doc.abandoned,
        "campaign_busy",
        "Önce açık bölümden çık.",
      );
      const stamina = Number(config("SingleCampaign_Weary", 20));
      const gold = Number(config("Campaign_Sweep_Gold", SWEEP.gold));
      const seconds = 0;
      integer(gold);
      integer(stamina, 1);
      this.wallet(r, "gold", -gold * q.count, "sweep_start");
      this.resource(r, "stamina", -stamina * q.count, "sweep_start");
      row = {
        id: nonce(),
        character_id: r.id,
        campaign_id: q.campaignId,
        state: {
          status: "running",
          started: this.now(),
          count: q.count,
          finished: 0,
          seconds,
          gold,
          stamina,
          xp: this.campaignXp(r,proof.xp),
          loot: sourceSweepLoot(q.campaignId, q.count),
          proofRun: proof.proofRun,
          kills: proof.kills,
        },
      };
      this.run(
        "insert into game_campaign_sweeps values(?,?,?,?,?)",
        row.id,
        r.id,
        q.campaignId,
        JSON.stringify(row.state),
        this.now(),
      );
      const gained = this.settleSweep(r, row);
      return this.sweepResponse(r, row, 11, gained);
    }
    if (!row) {
      const last = this.get(
        "select * from game_campaign_sweeps where character_id=? order by created_at desc,rowid desc limit 1",
        r.id,
      );
      if (last) row = { ...last, state: JSON.parse(last.state_json) };
    }
    if (!row)
      return {
        status: 9,
        sweepType: 1,
        campaignId: 0,
        result: [],
        totalGp: 0,
        dropItems: [],
      };
    need(
      !q.campaignId || q.campaignId === row.campaign_id,
      "sweep_campaign_mismatch",
    );
    let gained = this.settleSweep(r, row);
    if (q.opType === 4 && row.state.awaiting_ack) {
      row.state.awaiting_ack = false;
      this.saveSweep(row);
    }
    const status =
      q.opType === 0
        ? 10
        : row.state.status === "cancelled"
          ? 15
          : row.state.status === "finished"
            ? 11
            : 4;
    // Reopening an unacknowledged completed job shows its whole receipt.
    // This changes only the response: settleSweep already deduplicates grants.
    const reported = q.opType === 0 && row.state.awaiting_ack
      ? row.state.finished : gained;
    return this.sweepResponse(r, row, status, reported);
  },
};

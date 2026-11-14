import { need, integer, nonce } from "./util.js";
import { et, table } from "./catalog.js";

export const CARD_PREFIX = "VAVEYLA_REWARD_V1:";
export const rewardEnvelope = (code, body) => [code, "campaign.CampaignReqMsg", {
  paraString1: CARD_PREFIX + JSON.stringify(body),
}];
// Independent local loot policy: one bound item from the source campaign
// preview; five persisted choices in source order, no paid extra draws.
export const battleRewardRules = {
  pendingReward() { return !!this.document.card_reward && !this.document.card_reward.claimed; },
  makeRewardPlan() {
    if (this.document.card_reward) return false;
    const b = this.active;
    if (!b || b.stage !== "finished" || b.player_hp <= 0 || !b.enemies.every(e => e.hp === 0)) return false;
    if (this.campaign ? !this.document.completed : b.node_id !== 1000205) return false;
    const source = et("campaign")[this.campaign ? this.document.campaign_id : 1001];
    const pool = (source?.Item ?? []).filter(id => id > 0 && table("itemtemplate")[id]);
    if (!pool.length) return false;
    this.document.card_reward = {
      version: 1, token: nonce(16), battle_id: b.id,
      total_gp: this.campaign ? source.BaseGp : b.report?.gpBonus ?? 0,
      slots: Array.from({length:5}, (_,i) => ({template_id:pool[i % pool.length], count:1, bound:true})),
      claimed: null,
    };
    return true;
  },
  ensureRewardPlan() {
    // Do not reopen long-finished tutorial rewards on existing level5+ roles.
    // Fresh tutorials already persist their plan before checkpoint150.
    if (!this.campaign && this.role.level >= 5 && !this.document.card_reward) return;
    if (this.document.abandoned || this.document.card_reward || !this.document.completed ||
        !this.active || !this.completedBattle(this.active.id)) return;
    const before = structuredClone(this.document);
    if (this.makeRewardPlan()) {
      try { this.commit("reward_plan"); }
      catch (error) { this.document = before; throw error; }
    }
  },
  rewardPackets() {
    if (!this.pendingReward()) return [];
    const p = this.document.card_reward;
    return [rewardEnvelope(137, {
      token:p.token, totalGp:p.total_gp, vipJoin:0, teamJoin:0, propJoin:0,
      otherJoin:0, petGp:0, isSendReward:true,
      dropItems:p.slots.map(i=>({templateId:i.template_id,count:i.count,bind:true})),
    })];
  },
  claimReward(role, q) {
    this.bind(role);
    need(q.paraInt1 === role.player_id, "campaign_owner");
    integer(q.paraInt2,0,4);
    need(!Object.entries(q).some(([k,v]) => !["paraInt1","paraInt2","paraBool1","paraString1"].includes(k) && v), "invalid_reward_request");
    const before = structuredClone(this.document), revision = this.revision;
    try {
      return this.s.tx(() => {
        const dbtable = this.campaign ? "game_campaign_runs" : "wartune_training";
        const saved = this.s.get(`select state_json,revision from ${dbtable} where character_id=?`,role.id);
        need(saved,"reward_not_ready");
        const doc = JSON.parse(saved.state_json), plan = doc.card_reward;
        need(plan && plan.token === this.document.card_reward?.token && q.paraString1 === plan.token, "reward_not_ready");
        this.document = doc; this.revision = saved.revision;
        need(doc.completed && !doc.abandoned && this.active?.id === plan.battle_id && this.completedBattle(plan.battle_id) &&
          this.active.player_hp > 0 && this.active.enemies.every(e=>e.hp===0),"reward_not_ready");
        if (!plan.claimed) {
          const item = plan.slots[q.paraInt2], r = this.s.role(role.account_id);
          const receipt = this.game.reward(r,"battle-card:"+plan.battle_id,{items:[item]});
          plan.claimed = {index:q.paraInt2,item,receipt,at:this.s.clock()};
          this.commit("claim_card");
        }
        const c = plan.claimed;
        return rewardEnvelope(26, {
          token:plan.token, playerId:role.player_id, name:role.name, index:c.index,
          templateId:c.item.template_id, count:c.item.count, bind:true,
          randomSkill_1:0,randomSkill_2:0,randomSkill_3:0,randomSkill_4:0,randomSkill_5:0,
        });
      });
    } catch (error) { this.document = before; this.revision = revision; throw error; }
  },
};

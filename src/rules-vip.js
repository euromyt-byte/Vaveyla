import { jsonFile, need, integer, MAX } from "./util.js";
import { freeRechargeCatalog } from "./rules-recharge.js";
export const vipSource = jsonFile("vip-source.json");
const levels = vipSource.upgradetemplate.sort((a, b) => a.Grades - b.Grades);
export const vipRules = {
  initVip(r) {
    this.run("insert or ignore into game_vip(character_id) values(?)", r.id);
    if (
      !this.get("select imported from game_vip where character_id=?", r.id)
        .imported
    ) {
      this.run("update game_vip set imported=1 where character_id=?", r.id);
      for (const a of this.all(
        "select request_id,result_json from game_actions where character_id=? and operation='recharge.free'",
        r.id,
      )) {
        const result = JSON.parse(a.result_json).result;
        const p = freeRechargeCatalog.packages.find(
          (p) => p.ProductId === result?.product_id,
        );
        if (
          !p ||
          result.vip_xp !== undefined ||
          !Number.isSafeInteger(result.count) ||
          result.count < 1 ||
          result.count > 100
        )
          continue;
        this.addVipXP(
          r,
          Number(p.VIPEx) * result.count,
          "legacy-recharge:" + a.request_id,
        );
      }
    }
  },
  addVipXP(r, amount, event) {
    integer(amount);
    this.initVip(r);
    if (
      this.get(
        "select 1 from game_vip_events where character_id=? and event_id=?",
        r.id,
        event,
      )
    )
      return;
    const xp = this.get(
      "select xp from game_vip where character_id=?",
      r.id,
    ).xp;
    need(xp + amount <= MAX, "vip_xp_limit");
    this.run(
      "insert into game_vip_events values(?,?,?,?)",
      r.id,
      event,
      amount,
      this.now(),
    );
    this.run("update game_vip set xp=xp+? where character_id=?", amount, r.id);
    if (amount)
      this.notice(r, "vip:" + event, "vip", `+${amount} VIP EXP.`, {
        vip_xp: amount,
      });
  },
  vipStatus(r) {
    this.initVip(r);
    const xp = this.get(
      "select xp from game_vip where character_id=?",
      r.id,
    ).xp;
    const level = levels.filter((l) => l.Data <= xp).at(-1)?.Grades ?? 0;
    return {
      xp,
      level,
      next_threshold: levels.find((l) => l.Grades === level + 1)?.Data ?? null,
    };
  },
  vipPacket(r) {
    const v = this.vipStatus(r),
      period = Math.floor(this.now() / 86400),
      claimed = (grade, type, p) =>
        this.get(
          "select created_at from game_vip_claims where character_id=? and grade=? and type=? and period=?",
          r.id,
          grade,
          type,
          p,
        );
    return [
      4410,
      "vip.VipInfoMsg",
      {
        vipGp: v.xp,
        vipGrade: v.level,
        isGainBuff: false,
        buffGainTime: 0,
        buffEndTime: 0,
        giftState: levels
          .filter((l) => l.Grades > 0)
          .map((l) => ({
            vipGrade: l.Grades,
            dayGiftState:
              v.level >= l.Grades && !claimed(l.Grades, -1, period) ? 1 : 0,
            dayGiftTime:
              (claimed(l.Grades, -1, period)?.created_at ?? 0) * 1000,
            isFreeGift: v.level >= l.Grades && !claimed(l.Grades, 0, 0),
            isPayGift: v.level >= l.Grades && !claimed(l.Grades, 1, 0),
          })),
      },
    ];
  },
  claimVipGift(r, type, grade) {
    need([-1, 0, 1].includes(type), "unsupported_vip_gift");
    integer(grade, 1, levels.at(-1).Grades);
    need(
      this.vipStatus(r).level >= grade,
      "vip_level_required",
      "VIP seviyesi yetersiz.",
    );
    const p = vipSource.vippackage.find((p) => p.Id === grade * 100 + type + 2);
    need(p, "unknown_vip_gift");
    const period = type === -1 ? Math.floor(this.now() / 86400) : 0;
    if (
      this.get(
        "select 1 from game_vip_claims where character_id=? and grade=? and type=? and period=?",
        r.id,
        grade,
        type,
        period,
      )
    )
      return { already_claimed: true };
    if (p.Price) this.wallet(r, "diamonds", -p.Price, "vip-gift:" + p.Id);
    const items = String(p.Item)
      .split("|")
      .filter(Boolean)
      .map((x) => {
        const [id, count] = x.split(",").map(Number);
        return { template_id: id, count, bound: true };
      });
    const reward = this.reward(r, `vip-gift:${grade}:${type}:${period}`, {
      items,
    });
    this.run(
      "insert into game_vip_claims values(?,?,?,?,?)",
      r.id,
      grade,
      type,
      period,
      this.now(),
    );
    return { already_claimed: false, reward };
  },
  vipPrivilegeValue(r, type) {
    const grade = this.vipStatus(r).level;
    return Number(
      vipSource.vipprerogativetemplate.find(
        (p) => p.grade === grade && p.type === type,
      )?.para1 ?? 0,
    );
  },
  vipPrivilege(r, type) {
    const grade = this.vipStatus(r).level;
    return (
      grade > 0 &&
      vipSource.vipprerogativetemplate.some(
        (p) => p.grade === grade && p.type === type && Number(p.para1) !== 0,
      )
    );
  },
};

// CPython Random(version=2 string seed) MT19937 compatibility for saved local duels.
import crypto from "node:crypto";
export class PythonRandom {
  constructor(seed) {
    const b = Buffer.from(String(seed)),
      raw = Buffer.concat([b, crypto.createHash("sha512").update(b).digest()]);
    let n = BigInt("0x" + raw.toString("hex"));
    const keys = [];
    while (n) {
      keys.push(Number(n & 0xffffffffn));
      n >>= 32n;
    }
    if (!keys.length) keys.push(0);
    this.mt = new Uint32Array(624);
    this.mt[0] = 19650218;
    for (let i = 1; i < 624; i++)
      this.mt[i] =
        (Math.imul(this.mt[i - 1] ^ (this.mt[i - 1] >>> 30), 1812433253) +
          i) >>>
        0;
    let i = 1,
      j = 0;
    for (let k = Math.max(624, keys.length); k > 0; k--) {
      this.mt[i] =
        ((this.mt[i] ^
          Math.imul(this.mt[i - 1] ^ (this.mt[i - 1] >>> 30), 1664525)) +
          keys[j] +
          j) >>>
        0;
      if (++i >= 624) {
        this.mt[0] = this.mt[623];
        i = 1;
      }
      if (++j >= keys.length) j = 0;
    }
    for (let k = 623; k > 0; k--) {
      this.mt[i] =
        ((this.mt[i] ^
          Math.imul(this.mt[i - 1] ^ (this.mt[i - 1] >>> 30), 1566083941)) -
          i) >>>
        0;
      if (++i >= 624) {
        this.mt[0] = this.mt[623];
        i = 1;
      }
    }
    this.mt[0] = 0x80000000;
    this.index = 624;
  }
  word() {
    if (this.index >= 624) {
      for (let i = 0; i < 624; i++) {
        const y =
          (this.mt[i] & 0x80000000) | (this.mt[(i + 1) % 624] & 0x7fffffff);
        this.mt[i] =
          (this.mt[(i + 397) % 624] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0)) >>>
          0;
      }
      this.index = 0;
    }
    let y = this.mt[this.index++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }
  below(n) {
    const k = Math.floor(Math.log2(n)) + 1;
    let r;
    do r = this.word() >>> (32 - k);
    while (r >= n);
    return r;
  }
}
export function resolveDuel(left, right, seed) {
  const rng = new PythonRandom(seed),
    actors = [left, right],
    hp = actors.map((a) => a.stats.max_hp),
    actions = [];
  let turn = rng.below(2);
  for (let n = 1; n <= 400; n++) {
    const target = 1 - turn,
      s = actors[turn].stats,
      d = actors[target].stats,
      mage = [3, 6].includes(actors[turn].icon),
      attack = s[mage ? "magic_attack" : "physical_attack"],
      defense = d[mage ? "magic_defense" : "physical_defense"],
      critical = rng.below(10000) < s.crit_basis_points;
    let damage = Math.max(1, attack - Math.floor(defense / 2));
    if (critical) damage = Math.floor((damage * 3) / 2);
    damage = Math.min(hp[target], damage);
    hp[target] -= damage;
    actions.push({
      turn: n,
      actor: actors[turn].character_id,
      target: actors[target].character_id,
      damage,
      remaining_hp: hp[target],
      critical,
    });
    if (!hp[target]) break;
    turn = target;
  }
  return {
    winner: hp.every((h) => h > 0)
      ? null
      : actors[hp[0] > 0 ? 0 : 1].character_id,
    hp,
    actors,
    actions,
    formula_version: "vaveyla-local-duel-2-hp300",
    official_formula_verified: false,
    seed,
  };
}

import { need, integer, nonce, casefold, MAX } from "./util.js";
import { table, config, title } from "./catalog.js";
import { resolveDuel } from "./random.js";
export const socialRules = {
  membership(r) {
    return (
      this.get("select * from game_guild_members where character_id=?", r.id) ??
      null
    );
  },
  guild(id) {
    integer(id, 1);
    this.s.tx(() => {
      const row = this.get(
        "select * from game_guild_upgrades where guild_id=? and finishes_at<=?",
        id,
        this.now(),
      );
      if (row) {
        this.run(
          "update game_guilds set level=? where id=?",
          row.target_level,
          id,
        );
        this.run("delete from game_guild_upgrades where guild_id=?", id);
      }
    });
    const g = this.get(
      "select g.*,c.account_id as creator_player_id,c.name as creator_name from game_guilds g join characters c on c.id=g.creator_id where g.id=?",
      integer(id, 1),
    );
    need(g, "guild_not_found");
    return {
      ...g,
      placard:
        this.get("select placard from game_guild_meta where guild_id=?", id)
          ?.placard ?? "",
      open_app: !!(
        this.get("select open_app from game_guild_meta where guild_id=?", id)
          ?.open_app ?? 1
      ),
      upgrade:
        this.get(
          "select target_level,finishes_at from game_guild_upgrades where guild_id=?",
          id,
        ) ?? null,
      capacity: 30 + g.level * Number(config("Consortia_Member", 2)),
      members: this.all(
        "select m.character_id,m.rank,m.contribution,c.account_id as player_id,c.name,c.level from game_guild_members m join characters c on c.id=m.character_id where guild_id=? order by joined_at,character_id",
        id,
      ),
    };
  },
  roleByCharacter(id) {
    const a = this.get(
      "select account_id from characters where id=?",
      integer(id, 1),
    );
    need(a, "character_required");
    return this.s.role(a.account_id);
  },
  createGuild(r, name) {
    need(!this.membership(r), "already_in_guild");
    need(r.level >= +config("Consortia_Grade", 12), "guild_level_required");
    need(typeof name === "string", "invalid_name");
    name = name.normalize("NFC").trim();
    need(
      Array.from(name).length >= 3 &&
        Array.from(name).length <= 32 &&
        !/[\x00-\x1f]/.test(name),
      "invalid_name",
    );
    const key = casefold(name);
    need(
      !this.get("select 1 from game_guilds where name_key=?", key),
      "guild_name_taken",
    );
    this.wallet(
      r,
      "gold",
      -Number(config("Consortia_Gold", 700000)),
      "guild_create",
    );
    const id = Number(
      this.run(
        "insert into game_guilds(name,name_key,leader_id,creator_id,created_at) values(?,?,?,?,?)",
        name,
        key,
        r.id,
        r.id,
        this.now(),
      ).lastInsertRowid,
    );
    this.run(
      "insert into game_guild_members(character_id,guild_id,rank,joined_at) values(?,?,'leader',?)",
      r.id,
      id,
      this.now(),
    );
    return this.guild(id);
  },
  applyGuild(r, id) {
    need(!this.membership(r), "already_in_guild");
    const g = this.guild(id);
    need(g.open_app, "guild_applications_closed");
    need(g.members.length < g.capacity, "guild_full");
    need(r.level >= +config("Consortia_Grade", 12), "guild_level_required");
    this.run(
      "insert or ignore into game_guild_applications values(?,?,?)",
      id,
      r.id,
      this.now(),
    );
    return { guild_id: id, application: "pending" };
  },
  guildPermission(r, leader = false) {
    const m = this.membership(r);
    need(m, "not_in_guild");
    need(
      leader ? m.rank === "leader" : ["leader", "officer"].includes(m.rank),
      "guild_permission",
      "Lonca yetkisi yetersiz.",
      403,
    );
    return m;
  },
  guildApplication(r, id, accept) {
    const m = this.guildPermission(r);
    integer(id, 1);
    need(typeof accept === "boolean", "invalid_value");
    need(
      this.get(
        "select 1 from game_guild_applications where guild_id=? and character_id=?",
        m.guild_id,
        id,
      ),
      "application_missing",
    );
    if (accept) {
      const t = this.roleByCharacter(id),
        g = this.guild(m.guild_id);
      need(t.level >= +config("Consortia_Grade", 12), "guild_level_required");
      need(!this.membership(t), "already_in_guild");
      need(g.members.length < g.capacity, "guild_full");
      this.run(
        "insert into game_guild_members(character_id,guild_id,rank,joined_at) values(?,?,'member',?)",
        id,
        m.guild_id,
        this.now(),
      );
      this.run("delete from game_guild_applications where character_id=?", id);
    } else
      this.run(
        "delete from game_guild_applications where guild_id=? and character_id=?",
        m.guild_id,
        id,
      );
    return this.guild(m.guild_id);
  },
  guildTransfer(r, id) {
    const m = this.guildPermission(r, true);
    integer(id, 1);
    need(id !== r.id, "invalid_target");
    need(
      this.get(
        "select 1 from game_guild_members where character_id=? and guild_id=?",
        id,
        m.guild_id,
      ),
      "member_missing",
    );
    this.run(
      "update game_guild_members set rank='member' where character_id=?",
      r.id,
    );
    this.run(
      "update game_guild_members set rank='leader' where character_id=?",
      id,
    );
    this.run("update game_guilds set leader_id=? where id=?", id, m.guild_id);
    return this.guild(m.guild_id);
  },
  guildLeave(r) {
    const m = this.membership(r);
    need(m, "not_in_guild");
    if (m.rank === "leader") {
      need(
        this.get(
          "select count(*) as n from game_guild_members where guild_id=?",
          m.guild_id,
        ).n === 1,
        "transfer_leadership",
      );
      this.run("delete from game_guilds where id=?", m.guild_id);
    } else
      this.run("delete from game_guild_members where character_id=?", r.id);
    return { left: true, guild_id: m.guild_id };
  },
  guildRank(r, id, rank) {
    const m = this.guildPermission(r, true);
    integer(id, 1);
    need(["officer", "member"].includes(rank), "invalid_rank");
    need(id !== r.id, "transfer_leadership");
    need(
      this.run(
        "update game_guild_members set rank=? where character_id=? and guild_id=? and rank!='leader'",
        rank,
        id,
        m.guild_id,
      ).changes === 1,
      "member_missing",
    );
    return this.guild(m.guild_id);
  },
  guildKick(r, id) {
    const m = this.guildPermission(r, true);
    integer(id, 1);
    need(id !== r.id, "invalid_target");
    need(
      this.run(
        "delete from game_guild_members where character_id=? and guild_id=? and rank!='leader'",
        id,
        m.guild_id,
      ).changes === 1,
      "member_missing",
    );
    return this.guild(m.guild_id);
  },
  guildDonate(r, amount) {
    const m = this.membership(r);
    need(m, "not_in_guild");
    integer(amount, 1);
    const g = this.guild(m.guild_id);
    need(
      g.bank + amount <= MAX && m.contribution + amount <= MAX,
      "currency_limit",
    );
    this.wallet(r, "gold", -amount, "guild_donation");
    this.run("update game_guilds set bank=bank+? where id=?", amount, g.id);
    this.run(
      "update game_guild_members set contribution=contribution+? where character_id=?",
      amount,
      r.id,
    );
    this.resource(r, "guild_offer", amount, "guild_donation");
    return this.guild(g.id);
  },
  actor(r) {
    return {
      character_id: r.id,
      level: r.level,
      icon: r.icon,
      stats: this.stats(r),
    };
  },
  duelInvite(r, target) {
    integer(target, 1);
    const t = this.roleByCharacter(target);
    need(t.id !== r.id, "invalid_target");
    need(
      !this.get(
        "select 1 from game_duels where state='invited' and expires_at>? and ((challenger=? and target=?) or (challenger=? and target=?))",
        this.now(),
        r.id,
        target,
        target,
        r.id,
      ),
      "duel_pending",
    );
    const id = nonce(),
      end = this.now() + 60;
    this.run(
      "insert into game_duels values(?,?,?,'invited',?,?,null,?)",
      id,
      r.id,
      target,
      end,
      nonce(),
      this.now(),
    );
    return {
      duel_id: id,
      state: "invited",
      target,
      expires_at: end,
      mode: "local_unranked",
    };
  },
  duelReply(r, id, accept) {
    need(typeof id === "string" && id.length === 32, "invalid_duel");
    need(typeof accept === "boolean", "invalid_value");
    const d = this.get("select * from game_duels where id=?", id);
    need(d?.target === r.id, "duel_not_owned", "Davet başkasına ait.", 403);
    if (d.state === "finished") return JSON.parse(d.result_json);
    need(d.state === "invited" && d.expires_at > this.now(), "duel_expired");
    if (!accept) {
      this.run("update game_duels set state='rejected' where id=?", id);
      return { duel_id: id, state: "rejected" };
    }
    const result = {
      ...resolveDuel(
        this.actor(this.roleByCharacter(d.challenger)),
        this.actor(r),
        d.seed,
      ),
      duel_id: id,
      state: "finished",
      mode: "local_unranked",
      reward: null,
    };
    this.run(
      "update game_duels set state='finished',result_json=? where id=?",
      JSON.stringify(result),
      id,
    );
    return result;
  },
  duelStatus(r, id) {
    const d = this.get(
      "select * from game_duels where id=? and (challenger=? or target=?)",
      id,
      r.id,
      r.id,
    );
    need(d, "duel_not_owned");
    return d.state === "finished"
      ? JSON.parse(d.result_json)
      : {
          duel_id: id,
          state:
            d.state === "invited" && d.expires_at <= this.now()
              ? "expired"
              : d.state,
          challenger: d.challenger,
          target: d.target,
          expires_at: d.expires_at,
        };
  },
  world(r) {
    const w = this.get("select * from game_world where character_id=?", r.id);
    return {
      ...w,
      map_name: title(table("map")[w.map_id], "MapName"),
      coordinate_unit: "pixel",
      collision_verified: false,
      movement_speed_rule: "local_240_pixels_per_second",
    };
  },
  enterWorld(r, id) {
    const t = table("map")[integer(id, 1)];
    need(t, "unknown_map");
    need(t.Types === 0, "instance_requires_session");
    need(r.level >= t.MinLevel && r.level <= t.MaxLevel, "map_level");
    const w = this.world(r);
    if (w.map_id !== id)
      this.run(
        "update game_world set map_id=?,x=?,y=?,moved_at=?,move_revision=move_revision+1 where character_id=?",
        id,
        Math.floor(t.Width / 2),
        Math.floor(t.Height / 2),
        this.now(),
        r.id,
      );
    this.fact(r, "map_enter", id);
    return this.world(r);
  },
  moveWorld(r, x, y, revision) {
    const w = this.world(r),
      t = table("map")[w.map_id];
    integer(x, 0, t.Width - 1);
    integer(y, 0, t.Height - 1);
    integer(revision, 0, Number.MAX_SAFE_INTEGER);
    need(w.move_revision === revision, "stale_world_position");
    const elapsed = Math.min(60, Math.max(0, this.now() - w.moved_at));
    need(
      Math.hypot(x - w.x, y - w.y) <= Math.max(40, elapsed * 240),
      "movement_too_fast",
    );
    this.run(
      "update game_world set x=?,y=?,moved_at=?,move_revision=move_revision+1 where character_id=?",
      x,
      y,
      this.now(),
      r.id,
    );
    return this.world(r);
  },
};

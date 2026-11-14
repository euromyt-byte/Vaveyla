import { date, nonce, job } from "./util.js";
import { guildBody } from "./packets.js";
export const guildRanks = { leader: 1, officer: 2, member: 9 };
export function simplePlayer(g, r, extra = {}) {
  const v = g.snapshot(r.account_id),
    m = g.membership(r);
  return {
    userId: r.player_id,
    nickName: r.name,
    isExist: 1,
    sexs: r.sex,
    pics: r.icon,
    camp: 1,
    grades: r.level,
    gp: v.player.xp,
    job: job(r),
    heroTempId: r.icon,
    consortiaID: m?.guild_id ?? 0,
    consortiaName: v.guild?.name ?? "",
    dutyId: m ? guildRanks[m.rank] : 0,
    consortiaOffer: m?.contribution ?? 0,
    consortiaTotalOffer: m?.contribution ?? 0,
    fightingCapacity: v.combat.fighting_capacity,
    logOutTime: date(null),
    serverName: "VAVEYLA",
    ...extra,
  };
}
export function guildPackets(g, r) {
  const m = g.membership(r),
    guild = m ? g.guild(m.guild_id) : null;
  const rows = [[4138, "consortia.ConsortiaInfoMsg", guildBody(guild)]];
  if (!guild) return rows;
  rows.push([
    4133,
    "simple.SimplePlayerListRspMsg",
    {
      totalRows: guild.members.length,
      uuid: nonce(),
      playerInfo: guild.members.map((u) =>
        simplePlayer(g, g.roleByCharacter(u.character_id)),
      ),
    },
  ]);
  return rows;
}
export function guildDuties() {
  return [
    4137,
    "consortia.ConsortiaDutyListRspMsg",
    {
      dutyInfo: [
        ["leader", 1, "Başkan"],
        ["officer", 2, "Yetkili"],
        ["member", 9, "Üye"],
      ].map(([rank, levels, dutyName]) => {
        const rights = Buffer.alloc(48);
        const indices =
          rank === "leader"
            ? Array.from({ length: 48 }, (_, i) => i)
            : rank === "officer"
              ? [6, 8, 9, 12, 13, 14, 15, 16, 23, 28, 34]
              : [12, 13, 14, 15, 16, 23, 34];
        for (const n of indices) rights[n] = 1;
        return { levels, dutyName, rights };
      }),
    },
  ];
}
export function mailInfo(g, r, m) {
  const sender = m.sender_id
    ? g.s.get(
        "select account_id,name,level from characters where id=?",
        m.sender_id,
      )
    : null;
  const body = {
    id: m.id,
    mailType: sender ? 1 : 2,
    sendId: sender?.account_id ?? 0,
    sendNickName: sender?.name ?? "VAVEYLA",
    receiveId: r.player_id,
    receiveNickName: r.name,
    sendDate: date(m.created_at),
    readDate: date(m.read_at),
    removeDate: date(null),
    title: m.subject,
    contents: m.body,
    validityDate: 36500,
    isExist: !m.deleted,
    sendType: 0,
    sendPlayerGrades: sender?.level ?? 0,
    params: "",
  };
  const w = m.reward,
    items = [
      ...(w.items ?? []),
      ...[
        [w.gold, -100],
        [w.diamonds, -400],
        [w.xp, -700],
        ...Object.entries(w.resources ?? {}).map(([k, n]) => [
          n,
          {
            bound_diamonds: -500,
            crystals: -200,
            souls: -300,
            strategy: -600,
            glory: -800,
            blank_pet_cards: -900,
          }[k],
        ]),
      ]
        .filter(([n, id]) => n && id)
        .map(([count, template_id]) => ({ template_id, count })),
    ];
  items.slice(0, 5).forEach((i, n) =>
    Object.assign(body, {
      ["annex" + (n + 1)]: i.template_id,
      ["annex" + (n + 1) + "Name"]: i.template_id,
      ["annex" + (n + 1) + "Count"]: i.count,
      ["isAnnex" + (n + 1)]: m.claimed_at !== null,
    }),
  );
  return body;
}
export function mailPages(g, r) {
  const all = g.mails(r).map((m) => mailInfo(g, r, m)),
    pages = Math.max(1, Math.ceil(all.length / 6)),
    rows = [];
  for (let page = 1; page <= pages; page++)
    rows.push([
      4853,
      "mail.MailListRspMsg",
      {
        mailInfos: all.slice((page - 1) * 6, page * 6),
        curPage: page,
        maxPage: pages,
      },
    ]);
  return rows;
}
export function mailUpdates(g, r, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 6)
    out.push([
      4131,
      "mail.ReceiveMailMsg",
      {
        mailInfos: ids
          .slice(i, i + 6)
          .map((id) => mailInfo(g, r, g.mail(r, id))),
      },
    ]);
  return out;
}
export function userInvites(g, r) {
  const pending = g
    .all(
      "select i.*,g.name as guild_name,g.level,g.leader_id from game_guild_invites i join game_guilds g on g.id=i.guild_id where i.character_id=?",
      r.id,
    )
    .map((i) => ({
      id: i.id,
      consortiaId: i.guild_id,
      consortiaName: i.guild_name,
      createDate: date(i.created_at),
      userId: r.player_id,
      userNickname: r.name,
      inviteId: g.roleByCharacter(i.inviter_id).player_id,
      inviteNickname: g.roleByCharacter(i.inviter_id).name,
      chairmanNickname: g.roleByCharacter(i.leader_id).name,
      inviteDate: date(i.created_at),
      fromType: true,
      isexist: true,
      consortiaLevels: i.level,
      consortiaCount: g.guild(i.guild_id).members.length,
    }));
  for (const a of g.all(
    "select a.*,g.name as guild_name,g.level,g.leader_id from game_guild_applications a join game_guilds g on g.id=a.guild_id where a.character_id=?",
    r.id,
  ))
    pending.push({
      id: a.guild_id,
      consortiaId: a.guild_id,
      consortiaName: a.guild_name,
      createDate: date(a.created_at),
      inviteDate: date(a.created_at),
      userId: r.player_id,
      userNickname: r.name,
      inviteId: 0,
      inviteNickname: "",
      chairmanNickname: g.roleByCharacter(a.leader_id).name,
      fromType: false,
      isexist: true,
      consortiaLevels: a.level,
      consortiaCount: g.guild(a.guild_id).members.length,
    });
  return [
    4135,
    "consortia.ConsortiaUserInviteInfoListRspMsg",
    { inviteInfo: pending },
  ];
}

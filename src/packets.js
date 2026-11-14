import {schemas} from "./pb.js";
import { buildingQueue } from "./rules-city.js";
import { jsonFile, date, job, MAX } from "./util.js";
import { table, et, pt, nodes, training, config } from "./catalog.js";
// Native U_CH_CHANNEL_CHA=83 reaches HF and the System/All chat history.
// U_C_CHANNEL_ALERT=111 only shows a transient tip outside battle.
// Original client zr.SYSTEM=2; channel 0 is the UI filter.
export function systemMessage(text, now = Date.now()) {
  const encodeMsg = String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return [
    83,
    "chat.ChatChannelMsg",
    {
      channel: 2,
      type: 1,
      userType: 1,
      name: "VAVEYLA",
      serverName: "VAVEYLA",
      encodeMsg,
      isCenterTip: true,
      isBigTip: false,
      curTime: Math.floor(now),
    },
  ];
}
// VAVEYLA_UI_SAVAS_171
export function systemLogMessage(text, now = Date.now()) {
  const x = systemMessage(text, now);
  x[2].isCenterTip = false;
  x[2].isBigTip = false;
  return x;
}
export const nativeFastKeys=text=>{const keys=String(text).replace(/,+$/,"").split(",");while(keys.length<6)keys.push("-1");return keys.join(",")+",";};
export const base = jsonFile("packet-bases.json"),
  battleBases = jsonFile("battle-bases.json");
const ids = new Set([
  "id",
  "userId",
  "playerId",
  "armyId",
  "masterId",
  "ownerId",
  "houseOwnerId",
  "castleId",
  "occupyPlayerId",
  "roomId",
]);
export function owned(value, r) {
  if (Array.isArray(value)) return value.map((v) => owned(v, r));
  if (value && typeof value === "object") {
    if ("$bytes" in value) return Buffer.from(value.$bytes, "hex");
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        k === "heroId" && v === 3
          ? r.id
          : ids.has(k) && v === 17
            ? r.player_id
            : owned(v, r),
      ]),
    );
  }
  return value === "VAVEYLA_BASE" ? r.name : value;
}
export function questBits(view) {
  const done = view.quests
      .filter((q) => q.status === "claimed")
      .map((q) => q.quest_id),
    buf = Buffer.alloc(Math.ceil(Math.max(0, ...done) / 8));
  for (const id of done) buf[(id - 1) >> 3] |= 1 << (id - 1) % 8;
  return buf;
}
export function player(r, view, state) {
  return [
    3,
    "player.PlayerMsg",
    {
      ...owned(base.player, r),
      playerId: r.player_id,
      nickName: r.name,
      sex: r.sex,
      pic: r.icon,
      camp: 1,
      point: r.diamonds,
      giftToken: view.resources.bound_diamonds ?? 0,
      weary: view.resources.stamina ?? Number(config("Player_weary", 200)),
      strategy: view.resources.strategy ?? 0,
      consortiaOffer:
        view.guild?.members.find((m) => m.character_id === r.id)
          ?.contribution ?? 0,
      consortiaTotaloffer:
        view.guild?.members.find((m) => m.character_id === r.id)
          ?.contribution ?? 0,
      grades: r.level,
      job: r.icon,
      gp: view.player.xp,
      fightingCapacity: view.combat.fighting_capacity,
      questSite: questBits(view),
      questSiteLen: questBits(view).length,
      consortiaId: view.guild?.id ?? 0,
      consortiaName: view.guild?.name ?? "",
      newNoviceProcess: (state?.ui_nodes ?? [])
        .slice()
        .sort((a, b) => a - b)
        .map((n) => "_" + n)
        .join(""),
    },
  ];
}
export function questPacket(view) {
  const bits = questBits(view);
  return [
    112,
    "quest.QuestUpdatedRspMsg",
    {
      statesLength: bits.length,
      states: bits,
      quest: view.quests
        .filter((q) => q.status !== "claimed")
        .map((q) => {
          const row = {
            templateId: q.quest_id,
            isComplete: q.complete,
            completedDate: date(q.claimed_at),
            addDate: date(q.accepted_at),
            repeatFinish: q.claims,
            isAccept: true,
            isSelect: true,
          };
          for (let i = 0; i < Math.min(4, q.conditions.length); i++)
            row["condition_" + (i + 1)] = Math.min(
              q.conditions[i].current,
              MAX,
            );
          return row;
        }),
    },
  ];
}
export function itemsPacket(r, items, before = []) {
  const moved = before
    .filter(
      (i) => !items.some((j) => j.bag === i.bag && j.position === i.position),
    )
    .map((i) => ({
      changeType: i.bag,
      changeObjId: i.bag === 4 ? r.id : 0,
      changePos: i.position,
    }));
  for (const i of items) {
    const objectId = i.bag === 4 ? r.id : 0;
    moved.push({
      changeType: i.bag,
      changeObjId: objectId,
      changePos: i.position,
      item: {
        id: i.id,
        templateId: i.template_id,
        pos: i.position,
        exist: true,
        objectId,
        bagType: i.bag,
        bind: !!i.bound,
        count: i.count,
        strengthenGrade:i.strengthen_grade??0,
        join_1:i.join_1??0,join_2:i.join_2??0,join_3:i.join_3??0,join_4:i.join_4??0,
        beginDate: date(null),
        validDate: 0,
        userId: r.player_id,
      },
    });
  }
  return [115, "item.ItemMovedListMsg", { moved }];
}
export const buildingId = (b) =>
  ({ 901: 1, 1201: 2, 402: 3 })[b.son_type] ?? b.son_type;
export function buildings(r, v, initial = false, now = Date.now() / 1000) {
  return [
    [
      initial ? 4154 : 4130,
      "building.BuildingInfoListMsg",
      {
        result: true,
        building: v.buildings.map((b) => ({
          userId: r.player_id,
          castleId: r.player_id,
          buildingId: buildingId(b),
          sonType: b.son_type,
          templateId: b.template_id,
          isExist: true,
          createdDate: date(null),
          propterty1: b.son_type === 901 ? v.economy.tax_used : 0,
          propterty2: b.son_type === 901 ? v.economy.tax_daily_limit : 0,
          levyNum: 0,
        })),
      },
    ],
    [
      initial ? 4155 : 4187,
      "building.BuildOrderList",
      {
        buildOrder: [1, 2, 3].map((type) => {
          const busy =
            type === 3
              ? null
              : v.buildings.find(
                  (b) =>
                    b.target_template != null &&
                    buildingQueue(
                      table("buildingtemplate")[b.target_template],
                    ) === type,
                );
          const needTime = busy
            ? table("buildingtemplate")[busy.target_template].UpgradeTime
            : 0;
          return {
            orderId: type,
            orderType: type,
            userId: r.player_id,
            remainTime: busy
              ? Math.max(0, Math.ceil(busy.finishes_at - now))
              : 0,
            needTime,
            beginTime: busy ? date(busy.finishes_at - needTime) : date(null),
          };
        }),
      },
    ],
  ];
}
export function pawnInfo(r, u, slot = null, pos = 2) {
  return {
    armyId: r.player_id,
    sites: slot ?? 0,
    sonType: u.son_type,
    tempateId: u.template_id,
    ownPawns: slot == null ? u.reserve : u.count,
    pawnLive: [{}, {}, {}, {}, {}, {}],
    fightPos: pos,
    specialTempIds: pt()[u.template_id].DefaultSpecialTemps,
    comprehednTempIds: "",
  };
}
export function deployed(r, a) {
  return [0, 1].map((slot) => {
    const s = a.slots.find((s) => s.slot === slot),
      unit = s
        ? { ...a.units.find((u) => u.son_type === s.son_type), count: s.count }
        : { son_type: 101, template_id: 10101, count: 0 };
    return pawnInfo(r, unit, slot, a.formation.pawn_pos);
  });
}
export function armyPackets(r, v, withDeployed = false) {
  const rows = v.army.units
    .filter((u) => u.unlocked || u.reserve || u.deployed)
    .map((u) => pawnInfo(r, u));
  const result = [[100, "army.ArmyPawnUpdatedMsg", { armyPawn: rows }]];
  if (withDeployed)
    result.push([93, "army.ArmyEditRspMsg", { armyPawn: deployed(r, v.army) }]);
  return result;
}
export function fullArmy(r, v) {
  const a = owned(base.novice[r.icon][0][2], r),
    s = v.combat;
  Object.assign(a, {
    mapId: v.world.map_id,
    curPosX: Math.floor(v.world.x / 20),
    curPosY: Math.floor(v.world.y / 20),
    grades: r.level,
    fightingCapacity: s.fighting_capacity,
    ...(v.fashion?v.fashion.appearance:{}),
    ...(v.mount?{mountTempId:v.mount.mounted?v.mount.selected:0,mountGrade:v.mount.grade}:{}),
    armyPawn: deployed(r, v.army),
  });
  const h = a.simpleHeroInfo;
  if(v.runes)h.rune=v.runes;
  if(v.talent)Object.assign(h,{talentPoint:v.talent.talentPoint,talentGrade:v.talent.talentGrade,talentSkill:v.talent.talentSkill});
  Object.assign(h, {
    grade: r.level,
    hp: s.max_hp,
    totalLive: s.max_hp,
    totalConatArmy: v.army.commander_capacity,
    fightPos: v.army.formation.hero_pos,
    fightingCapacity: s.fighting_capacity,
    skillScript: v.skills.learned.join(","),
    fastKey: nativeFastKeys(v.skills.fast_keys),
    skillPoint: v.skills.points,
    extraSkillPoint: 0,
    skillIndex: 0,
  });
  for (const [suffix, key] of [
    ["PhyAttack", "physical_attack"],
    ["PhyDefence", "physical_defense"],
    ["MagicAttack", "magic_attack"],
    ["MagicDefence", "magic_defense"],
  ])
    h["total" + suffix] = s[key];
  return [150, "army.ArmyMsg", a];
}
export function resources(r, v) {
  const packet = owned(
    base.initial.castle.find((p) => p[0] === 109),
    r,
  );
  Object.assign(packet[2], {
    goldTotalCount: v.player.gold,
    goldMax: MAX,
    goldYield: v.economy.hourly_gold,
    curPopulation: v.army.population,
    maxPopulation: v.army.population_capacity,
    crystalsCount: v.resources.crystals ?? 0,
  });
  return packet;
}
export function initial(
  r,
  v,
  flags,
  initializeHero = true,
  now = Date.now() / 1000,
) {
  const result = [],
    unique = new Map();
  for (const flag in flags)
    if (flags[flag])
      for (const p of base.initial[flag] ?? []) unique.set(p[0], owned(p, r));
  for (const code of [
    4233, 4153, 4154, 4155, 4156, 4157, 4160, 4173, 4176, 4245, 109,
  ]) {
    const p = unique.get(code);
    if (p) {
      if (code === 4154) result.push(buildings(r, v, true, now)[0]);
      else if (code === 4155) result.push(buildings(r, v, true, now)[1]);
      else if (code === 109) result.push(resources(r, v));
      else {
        if (code === 4160)
          Object.assign(p[2], {
            sysCurtime: date(now),
            sysStarTime: date(now),
          });
        result.push(p);
      }
    }
  }
  if (flags.reward) result.unshift(owned(base.sign, r));
  if (flags.bag) {
    if (initializeHero && v.inventory.length) result.push(fullArmy(r, v));
    result.push(itemsPacket(r, v.inventory));
  }
  if (flags.quest) result.push(questPacket(v));
  return result;
}
export function nodeBody(n, state) {
  const row = {
    nodeId: n.Id,
    campDataId: n.Id,
    nodeName: n.NodeName_en ?? "",
    masterType: n.MasterType,
    sonType: n.SonType,
    preNodeIds: n.PreNodeIds,
    nextNodeIds: n.NextNodeIds,
    state: state ?? n.NodeState,
    posX: n.Property1,
    posY: n.Property2,
    curX: n.Property1,
    curY: n.Property2,
    resetX: n.Property1,
    resetY: n.Property2,
    heroTempId: n.Heros ? +n.Heros.split(",")[0] : 0,
    visitUserIds: [],
    visitServerName: [],
  };
  for (const f of [
    "RefreshSpeed",
    "Level",
    "StyleType",
    "AttackTypes",
    "NameColor",
    "SizeType",
    "Toward",
    "Resource",
    "HandlerRange",
    "FixX",
    "FixY",
    "Param1",
    "Param2",
    "Param3",
    "Param4",
    "Param5",
  ])
    row[f[0].toLowerCase() + f.slice(1)] = n[f];
  return row;
}
export function mapIntro(r, v, d, campaign = false) {
  const packets = owned(base.novice[r.icon], r),
    mid = d.map_id,
    [x, y] = d.position.map((n) => Math.floor(n / 20));
  if (campaign) packets[0] = fullArmy(r, v);
  const a = packets[0][2];
  Object.assign(a, { mapId: mid, curPosX: x, curPosY: y });
  if (!campaign && mid === 10002)
    Object.assign(a.simpleHeroInfo, {
      fastKey: `${job(r) * 100 + 7},${job(r) * 100 + 8},-1,-1,-1`,
    });
  Object.assign(packets[1][2].room, { campaignId: mid, roomId: r.player_id });
  Object.assign(packets[2][2].player[0], {
    roomId: r.player_id,
    campaignId: mid,
    curPosX: x,
    curPosY: y,
    grades: r.level,
    hp: v.combat.max_hp,
    maxHp: v.combat.max_hp,
    fightingCapacity: v.combat.fighting_capacity,
  });
  const rows = campaign
    ? nodes(mid)
    : training.campaigndata.filter((n) => n.CampaignId === mid);
  packets[3][2].node = rows.map((n) => {
    const approach = { 1000110: 1000106, 1000208: 1000205 }[n.Id],
      used =
        approach &&
        (d.defeated.includes(approach) || d.active?.node_id === approach);
    return nodeBody(
      n,
      !campaign && n.Id === 1000107 && d.defeated.includes(1000106)
        ? 2
        : d.defeated.includes(n.Id) || d.visited?.includes(n.Id) || used
          ? 8
          : undefined,
    );
  });
  if (!campaign && mid === 10002 && !d.completed) {
    const n = training.campaigndata.find((n) => n.Id === 1000107),
      row = nodeBody(n, 2);
    Object.assign(row, {
      nodeId: 1000202,
      campDataId: 1000107,
      preNodeIds: "",
      nextNodeIds: "",
      posX: Math.max(0, x - 1),
      curX: Math.max(0, x - 1),
      posY: y,
      curY: y,
      heroTempId: 1004,
      attackTypes: 0,
      fixX: Math.max(0, x - 1) * 20,
      fixY: y * 20,
    });
    packets[3][2].node.push(row);
    packets.push([
      4124,
      "campaign.NPCFollowMsg",
      {
        escortId: 1000202,
        followId: r.player_id,
        curPosX: Math.max(0, x - 1),
        curPosY: y,
      },
    ]);
  }
  if (campaign) {
    const m = et("map")[mid],
      row = Math.ceil(m.Height / 86),
      col = Math.ceil(m.Width / 110);
    packets.push([
      130,
      "campaign.CampaignFogMsg",
      {
        mapTempId: mid,
        row,
        col,
        forArray: Array.from({ length: row }, () => Buffer.alloc(col, 1)),
      },
    ]);
    const prior = d.defeated.filter(
      (id) => et("campaigndata")[id].CampaignId === mid,
    );
    if (prior.length)
      packets.push([
        129,
        "campaign.CampaignNodeSuccMsg",
        { nodeId: prior.at(-1) },
      ]);
  }
  return packets;
}
export function rank(game, r) {
  return [
    4151,
    "campaign.RankListRspMsg",
    {
      rankInfo: game
        .all(
          "select subject from game_facts where character_id=? and kind='campaign_clear' and amount>0 order by subject",
          r.id,
        )
        .map((x) => ({ userId: r.player_id, campaignId: x.subject, rank: 1 })),
    },
  ];
}
export const fashionPacket=(g,r)=>[301,"campaign.CampaignReqMsg",{paraString1:"VAVEYLA_FASHION_V1:"+JSON.stringify(g.fashionInfo(r))}];
export function skyMember(r,v) {
  const a=fullArmy(r,v)[2],h=a.simpleHeroInfo;
  const member={...a,heroId:h.heroId,templateId:h.tempateId,campaignId:10000,
    playerId:r.player_id,armyId:r.player_id,grades:r.level,sex:r.sex??1,
    hp:h.totalLive,maxHp:h.totalLive,onlineState:true,playerState:0};
  return Object.fromEntries(schemas["room.RoomPlayerMsg"].fields.filter(f=>Object.hasOwn(member,f.name)).map(f=>[f.name,member[f.name]]));
}
export function sky(r,v) {
  return [fullArmy(r,v),
    [4598,"simple.PropertyMsg",{param1:10000}],
    [4595,"room.RoomEnterMsg",{result:1,player:[skyMember(r,v)],userIds:[r.player_id]}]];
}
export function city(game, r, state, exitingCampaign=false) {
  const v = game.snapshot(r.account_id);
  r = game.s.role(r.account_id);
  if(v.world.map_id===10000)return [...(exitingCampaign?[[22,"campaign.CampaignExitMsg",{result:1,playerId:r.player_id,armyId:r.player_id,serverName:"VAVEYLA"}]]:[]),player(r,v,state),...sky(r,v),resources(r,v),questPacket(v)];
  return [
    player(r, v, state),
    ...buildings(r, v, false, game.now()),
    fullArmy(r, v),
    ...armyPackets(r, v),
    resources(r, v),
    questPacket(v),
    [
      22,
      "campaign.CampaignExitMsg",
      {
        result: 1,
        playerId: r.player_id,
        armyId: r.player_id,
        serverName: "VAVEYLA",
      },
    ],
    [6, "player.LoginStateMsg", { playerId: r.player_id, state: 2 }],
  ];
}

export function guildBody(g) {
  const v = Object.fromEntries(
    [
      "createDate",
      "kickDate",
      "deductDate",
      "warnDate",
      "quitDate",
      "codeBeginDate",
      "currentDate",
      "votingDate",
      "altarDate",
    ].map((k) => [k, date(null)]),
  );
  Object.assign(v, {
    consortiaId: 0,
    levels: 0,
    isExist: false,
    consortiaName: "",
  });
  if (g) {
    const l = g.members.find((m) => m.character_id === g.leader_id);
    Object.assign(v, {
      consortiaId: g.id,
      creatorId: g.creator_player_id,
      chairmanId: l.player_id,
      levels: g.level,
      isExist: true,
      consortiaName: g.name,
      placard: g.placard ?? "",
      openApp: g.open_app ?? true,
      codeType: g.upgrade ? 1 : 0,
      codeNeedDate: g.upgrade?.finishes_at ?? 0,
      chairmanName: l.name,
      creatorName: g.creator_name,
      description: g.description,
      currentCount: g.members.length,
      offer: Math.min(g.bank, 2147483647),
      createDate: date(g.created_at),
    });
  }
  return v;
}

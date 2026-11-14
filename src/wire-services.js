import {hotEnvelope} from './rules-hot-events.js';
import {packagePlan} from "./item-effects.js";
import { need, date, nonce } from "./util.js";
import { decode } from "./pb.js";
import {
  guildPackets,
  guildDuties,
  simplePlayer,
  mailInfo,
  mailPages,
  mailUpdates,
  userInvites,
} from "./service-packets.js";
import * as p from "./packets.js";
import { services,table } from "./catalog.js";
const guildOps = new Set([
  5130, 5131, 5132, 5133, 5134, 5135, 5137, 5139, 5140, 5141, 5142, 5143, 5144,
  5146, 5149,
]);
export function servicePacket(session, role, packet, mutate) {
  const g = session.g,
    s = session.s,
    c = packet.code,
    q = (n) => decode(n, packet.payload),
    v = () => g.snapshot(role.account_id);
  const push = (ids, fn) => session.app.push?.(ids, fn, session);
  if (c === 15038 || c === 8200) {
    const req = q("simple.InfoReqMsg");
    need(
      [0, role.player_id].includes(req.userId) &&
        ["", "local", "VAVEYLA"].includes(req.otherSite),
      "invalid_profile_request",
    );
    const target = s.role(req.otherId);
    need(target, "character_not_found");
    return [
      [
        c === 15038 ? 4256 : 4128,
        "simple.InfoRspMsg",
        { info: simplePlayer(g, target), from: req.from },
      ],
    ];
  }
  if (c === 15023) {
    const req = q("chat.ChatFriendMsg");
    need([0, role.player_id].includes(req.fromId), "chat_identity_mismatch");
    mutate("chat", 20, req.encodeMsg, req.toId, "private");
    const member = g.membership(role),
      body = {
        fromId: role.player_id,
        fromNick: role.name,
        toId: req.toId,
        encodeMsg: req.encodeMsg,
        sendDate: date(s.clock()),
        result: 1,
        job: ((role.icon - 1) % 3) + 1,
        headid: role.icon,
        level: role.level,
        consortiaId: member?.guild_id ?? 0,
        consortiaName: member ? g.guild(member.guild_id).name : "",
        fight: v().combat.fighting_capacity,
      };
    push([req.toId], () => [[4231, "chat.ChatFriendMsg", body]]);
    return [[4236, "chat.ChatFriendMsg", body]];
  }
  if(c===5151||c===5152){
    const req=q("campaign.CampaignReqMsg"),before=v().inventory;
    if(c===5151)mutate("inlayGem",req.paraInt1,req.paraInt3,req.paraInt2);
    else{need(!req.paraBool1,"gem_slot_already_open","Bu ekipmanın yuvaları zaten açık.");mutate("removeGem",req.paraInt1);}
    return [p.itemsPacket(role,v().inventory,before)];
  }
  if(c===9061){
    const req=q("campaign.CampaignReqMsg");need(req.paraString1==="VAVEYLA_SHOP_GIFT_V1"&&[0,1].includes(req.paraInt1),'invalid_gift_request');
    if(req.paraInt1===1)mutate("claimGiftPackage",req.paraInt2,1,"");
    return [[4971,"campaign.CampaignReqMsg",{paraString1:"VAVEYLA_SHOP_GIFT_V1:"+JSON.stringify(g.giftCounts(role))}],p.itemsPacket(role,v().inventory)];
  }
  if(c===8586){
    const req=q("campaign.CampaignReqMsg");need(req.paraString1.startsWith("VAVEYLA_HOT_V1:")&&req.paraString1.length<2048,"invalid_hot_event_request");let data;try{data=JSON.parse(req.paraString1.slice("VAVEYLA_HOT_V1:".length));}catch{need(false,"invalid_hot_event_request");}const before=v().inventory;const state=mutate("hotEventRequest",data);return [hotEnvelope(4476,state),p.itemsPacket(role,v().inventory,before),p.resources(role,v())];
  }
  if(c===8625){need(!packet.payload.length,"invalid_fashion_request");return [p.fashionPacket(g,role),[4542,"campaign.CampaignReqMsg",{paraString1:"VAVEYLA_FASHION_BOOK_V1:"+JSON.stringify(g.fashionBook(role))}]];}
  if([5153,8538,8594,8595].includes(c)){
    const req=q("campaign.CampaignReqMsg");need(req.paraString1.startsWith("VAVEYLA_CRAFT_V1:")&&req.paraString1.length<4096,"invalid_craft_request");
    let data;try{data=JSON.parse(req.paraString1.slice("VAVEYLA_CRAFT_V1:".length));}catch{need(false,"invalid_craft_request");}const before=v().inventory;
    let result;if(c===5153)result=mutate("composeItem",data);else if(c===8538)result=mutate("transformItem",data);else if(c===8594)result=mutate("composeFashion",data);else result=mutate("saveFashionBook",data.templateId);
    const rows=[p.itemsPacket(role,v().inventory,before),p.fullArmy(role,v())];
    if(c===5153)rows.push([89,"campaign.CampaignReqMsg",{paraString1:"VAVEYLA_CRAFT_V1:"+JSON.stringify(result)}]);
    if(c===8594)rows.push(p.fashionPacket(g,role),[4487,"campaign.CampaignReqMsg",{paraString1:"VAVEYLA_CRAFT_V1:"+JSON.stringify(result)}]);
    if(c===8594||c===8595)rows.push([4542,"campaign.CampaignReqMsg",{paraString1:"VAVEYLA_FASHION_BOOK_V1:"+JSON.stringify(g.fashionBook(role))}]);
    return rows;
  }
  if(c===5187||c===8781){
    const req=q("campaign.CampaignReqMsg");need(req.paraString1.startsWith("VAVEYLA_PROGRESS_V1:")&&req.paraString1.length<4096,"invalid_progress_request");let data;try{data=JSON.parse(req.paraString1.slice("VAVEYLA_PROGRESS_V1:".length));}catch{need(false,"invalid_progress_request");}
    if(c===5187){const info=mutate("upgradeTalent",data);return [[4430,"campaign.CampaignReqMsg",{paraString1:"VAVEYLA_TALENT_GRADE_V1:"+JSON.stringify({upresult:true})}],[4431,"campaign.CampaignReqMsg",{paraString1:"VAVEYLA_TALENT_V1:"+JSON.stringify(info)}],p.fullArmy(role,v())];}
    const before=v().inventory;mutate("appraiseFashion",data);return [p.itemsPacket(role,v().inventory,before),[4542,"campaign.CampaignReqMsg",{paraString1:"VAVEYLA_FASHION_BOOK_V1:"+JSON.stringify(g.fashionBook(role))}],p.fashionPacket(g,role),p.fullArmy(role,v())];
  }
  if(c===9582){
    const req=q("campaign.CampaignReqMsg");need(req.paraString1.startsWith("VAVEYLA_FASHION_V1:")&&req.paraString1.length<=4096,"invalid_fashion_request");
    mutate("changeFashion",JSON.parse(req.paraString1.slice("VAVEYLA_FASHION_V1:".length)));
    return [p.fashionPacket(g,role),p.itemsPacket(role,v().inventory),p.fullArmy(role,v())];
  }
  if(c===8532||c===8533){
    const req=q("campaign.CampaignReqMsg");
    need(req.paraString1==="VAVEYLA_MOUNT_STATE_V1","client_refresh_required");
    const result=mutate(c===8532?"selectMount":"rideMount",req.paraInt1);
    return [[4426,"campaign.CampaignReqMsg",{paraString1:"VAVEYLA_MOUNT_STATE_V1:"+JSON.stringify(g.mountView(role))}]];
  }
  if(c===8530||c===8536){
    const before=v().inventory;let result;
    if(c===8530){need(!packet.payload.length,"invalid_mount_request");result=mutate("mountList");}
    else{const req=q("campaign.CampaignReqMsg");result=mutate("activateMount",req.paraInt1,req.paraInt2);}
    return [p.itemsPacket(role,v().inventory,before),[4427,"campaign.CampaignReqMsg",{paraString1:"VAVEYLA_MOUNTS_V1:"+JSON.stringify(result)}],[4426,"campaign.CampaignReqMsg",{paraString1:"VAVEYLA_MOUNT_STATE_V1:"+JSON.stringify(g.mountView(role))}]];
  }
  if(c===8605){
    const req=q("campaign.CampaignReqMsg"),before=v().inventory;
    need(req.paraString1==="VAVEYLA_RUNE_LEARN_V1","unsupported_rune_operation","Bu işlemde sembol öğrenme isteği gerekli.");
    const result=mutate("learnRune",req.paraInt1,req.paraInt2,req.paraInt3);
    return [p.itemsPacket(role,v().inventory,before),[4495,"campaign.CampaignReqMsg",{paraString1:"VAVEYLA_RUNES_V1:"+JSON.stringify({opType:1,opResult:true,runeInfo:result})}]];
  }
  if(c===5150){
    need(packet.payload.length>0,"client_refresh_required","Oyunu yeni sekmede açıp tekrar dene.");
    const req=q("campaign.CampaignReqMsg"),before=v().inventory;
    const result=mutate("strengthenItem",req);
    return [p.itemsPacket(role,v().inventory,before),[86,"item.ItemInfoMsg",result]];
  }
  if (c === 5006) {
    const req=q("item.ItemUseMsg"),match=/^VAVEYLA_ITEM_USE_V1:([0-9]+):([0-9]+):[a-z0-9-]{6,64}$/.exec(req.battleId);
    need((!req.battleId||match)&&!req.friendId&&!req.selectItemInfos.length,"unsupported_item_use");
    const before=v().inventory;let outcome;
    if(match)outcome=mutate("consumeItemRequest",{id:Number(match[1]),template_id:Number(match[2]),token:req.battleId,bag:req.bagType,pos:req.pos,count:req.count});
    else{
      const item=before.find(i=>i.bag===req.bagType&&i.position===req.pos);need(item,"item_not_owned");
      const t=table("itemtemplate")[item.template_id];
      need(t.SonType!==218&&!packagePlan(t)?.weighted.length,"client_refresh_required","Yeni eşya kuralları için oyunu yeni sekmede aç.");
      outcome=mutate("useItem",item.id,req.count);
    }
    const usedRows=[p.itemsPacket(role,v().inventory,before),p.fullArmy(s.role(role.account_id),v())];
    if(outcome.mount)usedRows.push([4427,"campaign.CampaignReqMsg",{paraString1:"VAVEYLA_MOUNTS_V1:"+JSON.stringify(g.mountList(role))}]);
    return usedRows;
  }
  if (c === 8204) {
    const req = q("mail.MailListReqMsg");
    need([0, 1, 2].includes(req.reqType), "invalid_mail_list");
    return mailPages(g, role);
  }
  if (c === 8205) {
    const req = q("mail.MailSendReqMsg");
    need(
      req.sendType === 0 && [0, 1].includes(req.payType),
      "unsupported_mail_payment",
    );
    mutate("sendMail", req.receiverUserId, req.title, req.contents);
    push([req.receiverUserId], (r) => mailPages(g, r));
    return [p.systemMessage("Posta gönderildi.")];
  }
  if (c === 8206) {
    const req = q("mail.MailDelReqMsg");
    need(
      [0, 1, 2, 3].includes(req.reqType) && req.delList.length <= 100,
      "invalid_mail_delete",
    );
    const ids = req.delList.length
      ? req.delList
      : g
          .mails(role)
          .filter((m) => m.claimed_at !== null || !Object.keys(m.reward).length)
          .map((m) => m.id);
    g.tx(role.account_id, (r) => {
      for (const id of ids) g.deleteMail(r, id);
    });
    return [
      [4132, "mail.MailDelReqMsg", { delList: ids, reqType: req.reqType }],
    ];
  }
  if (c === 5022) {
    const req = q("mail.MailMsg");
    need(
      [0, role.player_id].includes(req.playerId) &&
        [0, 1, 2, 3].includes(req.reqType) &&
        req.mailsIdArray.length <= 100,
      "invalid_mail_operation",
    );
    const ids = req.mailsIdArray.length
      ? req.mailsIdArray
      : req.mailId
        ? [req.mailId]
        : g
            .mails(role)
            .filter((m) => m.claimed_at === null)
            .map((m) => m.id);
    need(ids.length <= 100, "mail_batch_limit");
    const before = v().inventory;
    g.tx(role.account_id, (r) => {
      for (const id of ids)
        req.reqType === 1 ? g.readMail(r, id) : g.claimMail(r, id);
    });
    if (req.reqType === 1)
      return [
        [
          4854,
          "mail.MailReadRspMsg",
          { mailId: ids, readDate: date(s.clock()), validityDate: 36500 },
        ],
      ];
    return [
      [
        114,
        "mail.MailPickupRspMsg",
        {
          pickupResult: ids.map((mailId) => ({
            mailId,
            attachIndex: 0,
            result: true,
          })),
          isfull: false,
        },
      ],
      ...mailUpdates(g, role, ids),
      p.itemsPacket(role, v().inventory, before),
    ];
  }
  if (c === 5154) {
    const req = q("shop.ShopMsg");
    need(
      req.buyInfo &&
        [0, role.player_id].includes(req.buyInfo.receiveId) &&
        !req.buyInfo.isDiscount &&
        !req.discountTempId &&
        !req.hasDataInfo.length &&
        !req.weeklyDataInfo.length &&
        !req.monthDataInfo.length,
      "unsupported_shop_order",
    );
    const before = v().inventory;
    mutate("buyShop", req.buyInfo.goodId, req.buyInfo.count, req.payType);
    return [
      [
        90,
        "shop.ShopMsg",
        {
          buyInfo: { ...req.buyInfo, receiveId: role.player_id, result: 1 },
          payType: req.payType,
        },
      ],
      p.itemsPacket(role, v().inventory, before),
    ];
  }
  if (c === 8218) {
    need(!packet.payload.length, "invalid_shop_history");
    return [
      [
        4145,
        "shop.ShopMsg",
        {
          hasDataInfo: g
            .all(
              "select shop_id,sum(count) as counts,max(created_at) as at from game_shop_purchases where character_id=? group by shop_id",
              role.id,
            )
            .map((r) => ({
              userId: role.player_id,
              itemId: r.shop_id,
              counts: r.counts,
              buyDate: date(r.at),
              isDiscount: false,
            })),
        },
      ],
    ];
  }
  if (c === 8789 || c === 8790) {
    const d = g.tx(role.account_id, (r) => {
      g.signDaily(r);
      if (c === 8789) {
        const req = q("active.SevenSignReceiveReq");
        g.claimDaily(r, req.site);
      }
      return g.daily(r);
    });
    return c === 8790
      ? [
          [
            4705,
            "active.SevenSignInfoRsp",
            {
              startTime: role.created_at,
              days: d.total_days,
              rewardSite: d.reward_bits << 1,
              rewardInfo: services.sevensignin.map((r) => ({
                days: r.Day,
                item: r.Item,
              })),
            },
          ],
        ]
      : [
          [
            4704,
            "active.SevenSignReceiveRsp",
            { rewardSite: d.reward_bits << 1 },
          ],
        ];
  }
  if (c === 8207) {
    need(!packet.payload.length, "invalid_guild_request");
    need(g.membership(role), "not_in_guild");
    return guildPackets(g, role).filter((r) => r[0] === 4133);
  }
  if (c === 8211) {
    need(!packet.payload.length, "invalid_guild_request");
    need(g.membership(role), "not_in_guild");
    return [guildDuties()];
  }
  if (c === 8209) {
    need(!packet.payload.length, "invalid_guild_request");
    return [userInvites(g, role)];
  }
  if (c === 8214) {
    const req = q("consortia.SearchConditionMsg"),
      m = g.guildPermission(role);
    need([0, 1].includes(req.pageIndex), "unsupported_page");
    const users = g.all(
      "select character_id from game_guild_applications where guild_id=? order by created_at",
      m.guild_id,
    );
    return [
      [
        4140,
        "simple.SimplePlayerListRspMsg",
        {
          totalRows: users.length,
          uuid: nonce(),
          playerInfo: users.map((a) =>
            simplePlayer(g, g.roleByCharacter(a.character_id), {
              parameter1: a.character_id,
            }),
          ),
        },
      ],
    ];
  }
  if (c === 8208) {
    q("consortia.ConsortiaOfferReqMsg");
    const m = g.membership(role);
    need(m, "not_in_guild");
    const users = g.guild(m.guild_id).members.map((u) => ({
      nickName: u.name,
      totalOffer: u.contribution,
      todayOffer: u.contribution,
    }));
    return [
      [
        4134,
        "consortia.ConsortiaContributeRspMsg",
        {
          totalRows: users.length,
          contributeInfo: users,
          selfInfo: users.find((u) => u.nickName === role.name),
          selfOrder: users.findIndex((u) => u.nickName === role.name) + 1,
        },
      ],
    ];
  }
  if (guildOps.has(c)) {
    const before = g.membership(role),
      oldIds = before
        ? g.guild(before.guild_id).members.map((m) => m.player_id)
        : [];
    let req = {},
      reply = c;
    if (c === 5146) {
      req = q("consortia.ConsortiaQuitReqMsg");
      need(!req.clear_CDType && !req.payType, "paid_guild_exit_unsupported");
      mutate("guildLeave");
      reply = 4138;
    } else if (c === 5144) {
      req = q("consortia.ConsortiaUserOfferReqMsg");
      need(
        !req.offerPoint && [0, 1].includes(req.payType),
        "diamond_guild_donation_unsupported",
      );
      mutate("guildDonate", req.offerGold);
      reply = 42;
    } else {
      req = q("consortia.ConsortiaMsg");
      const allowed = {
        5130: ["consortiaName"],
        5133: ["upgradeType"],
        5149: ["result"],
        5131: ["otherId"],
        5132: ["otherId"],
        5134: ["applyId", "result"],
        5135: ["consortiaId"],
        5137: ["otherId", "positionId"],
        5139: ["placard"],
        5140: ["description"],
        5141: ["applyId"],
        5142: ["otherId"],
        5143: ["applyId", "result"],
      }[c];
      need(
        allowed &&
          !Object.entries(req).some(([k, v]) => !allowed.includes(k) && v),
        "unsupported_guild_fields",
      );
      if (c === 5133) {
        need(
          [0, 1].includes(req.upgradeType),
          "guild_component_not_implemented",
        );
        mutate("upgradeGuild");
        reply = 4138;
      }
      if (c === 5149) {
        mutate("guildOpen", req.result);
        reply = 51;
      }
      if (c === 5130) {
        mutate("createGuild", req.consortiaName);
        reply = 34;
      }
      if (c === 5131) {
        mutate("guildTransfer", g.s.role(req.otherId)?.id);
        reply = 47;
      }
      if (c === 5132) {
        mutate("guildKick", g.s.role(req.otherId)?.id);
        reply = 4138;
      }
      if (c === 5134) {
        mutate("guildApplication", req.applyId, req.result);
        reply = 40;
      }
      if (c === 5135) {
        mutate("applyGuild", req.consortiaId);
        req.applyId = req.consortiaId;
        reply = 35;
      }
      if (c === 5137) {
        need([2, 9].includes(req.positionId), "invalid_rank");
        mutate(
          "guildRank",
          g.s.role(req.otherId)?.id,
          req.positionId === 2 ? "officer" : "member",
        );
        reply = 50;
      }
      if (c === 5139 || c === 5140) {
        const own = v().guild;
        mutate(
          "guildEdit",
          c === 5140 ? req.description : own.description,
          c === 5139 ? req.placard : (own.placard ?? ""),
        );
        reply = c === 5139 ? 38 : 39;
      }
      if (c === 5141) {
        g.tx(role.account_id, (r) =>
          g.run(
            "delete from game_guild_applications where guild_id=? and character_id=?",
            req.applyId,
            r.id,
          ),
        );
        reply = 36;
      }
      if (c === 5142) {
        const invited = mutate("inviteGuild", g.s.role(req.otherId)?.id);
        req.applyId = invited.id;
        reply = 41;
        push([req.otherId], (r) => [userInvites(g, r)]);
      }
      if (c === 5143) {
        mutate("guildInviteReply", req.applyId, req.result);
        reply = 37;
      }
    }
    const membership = g.membership(role),
      ids = [
        ...new Set([
          ...oldIds,
          ...(membership
            ? g.guild(membership.guild_id).members.map((m) => m.player_id)
            : []),
        ]),
      ];
    push(ids, (r) => [
      p.player(r, g.snapshot(r.account_id)),
      ...guildPackets(g, r),
    ]);
    const rows = guildPackets(g, s.role(role.account_id));
    if (reply !== 4138)
      rows.unshift([
        reply,
        "consortia.ConsortiaMsg",
        {
          ...req,
          result: true,
          consortiaId: membership?.guild_id ?? req.consortiaId ?? 0,
        },
      ]);
    return rows;
  }
  if (c === 15005 || c === 25024 || c === 10509) {
    const req = q("chat.ChatChannelMsg");
    need(
      !req.items.length && !req.stars.length && !req.powcards.length,
      "chat_attachment_unsupported",
    );
    const guild = g.membership(role),
      scope =
        req.channel === 5
          ? "guild:" + guild?.guild_id
          : req.channel === 8
            ? "map:" + session.encounter?.document.map_id
            : "world";
    const result = mutate(
      "chat",
      req.channel,
      req.encodeMsg,
      req.otherId,
      scope,
    );
    const body = {
      channel: req.channel,
      encodeMsg: result.message,
      otherId: role.player_id,
      name: role.name,
      serverName: "VAVEYLA",
      headid: role.icon,
      level: role.level,
      job: ((role.icon - 1) % 3) + 1,
      curTime: s.clock() * 1000,
      receiveName: req.channel === 20 ? s.role(req.otherId).name : "",
      consortiaId: guild?.guild_id ?? 0,
    };
    session.app.chatBroadcast?.(session, body, scope, req.otherId);
    return [[83, "chat.ChatChannelMsg", body]];
  }
  return null;
}

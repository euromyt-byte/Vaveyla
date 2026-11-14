import { systemOpenPacket } from "./system-open.js";
import crypto from "node:crypto";
import { GameError, need, hash, casefold, date, mono } from "./util.js";
import { Cipher, LoginReader, RESET, INITIAL_KEY, packet } from "./wire.js";
import { encode, decode } from "./pb.js";
import { Battle, trainingState } from "./battle.js";
import { table, et, pt } from "./catalog.js";
import * as p from "./packets.js";
import { servicePacket } from "./wire-services.js";
import { systemErrorText, unavailableFeatureText } from "./system-text.js";
export class Session {
  constructor(app) {
    this.app = app;
    this.s = app.store;
    this.g = app.game;
    this.reader = new LoginReader();
    this.sender = new Cipher();
    this.state = "new";
    this.account = null;
    this.token = null;
    this.sessionHash = null;
    this.heroInitialized = false;
    this.encounter = null;
    this.cityDue = null;
    this.resourceDue = null;
    this.close = null;
    this.unknown = new Set();
    this.noticeCursor = null;
    this.noticeReplayThrough = 0;
  }
  reply(code, name = null, body = {}) {
    if (code === 150) this.heroInitialized = true;
    return packet(
      code,
      name ? encode(name, body) : Buffer.alloc(0),
      this.account?.id ?? 0,
    );
  }
  sendable(rows) {
    if(rows.some(r=>[4595,4606].includes(r[0])))this.skyActive=true;
    else if(rows.some(r=>r[0]===22))this.skyActive=false;
    const r =
      this.state === "gateway_active" && this.noticeCursor !== null
        ? this.s.role(this.account.id)
        : null;
    const notices = r ? this.g.notices(r, this.noticeCursor, 50) : [];
    if (notices.some((n) => ["reward", "level"].includes(n.kind))) {
      const v = this.g.snapshot(r.account_id);
      for (const row of [
        p.player(r, v, trainingState(this.s, r)),
        p.fullArmy(r, v),
        p.itemsPacket(r, v.inventory),
        p.resources(r, v),
        p.questPacket(v),
      ])
        if (!rows.some((existing) => existing[0] === row[0])) rows.push(row);
    }
    const e = this.encounter,
      leaving = rows.some(
        (row) => [22,4595,4606].includes(row[0]) || (row[0] === 6 && row[2]?.state === 2),
      );
    if (
      !leaving && !this.skyActive &&
      e?.entered &&
      !e.document.abandoned &&
      (!e.document.completed || e.pendingReward?.() || this.cityDue !== null)
    ) {
      for (const row of rows.filter((row) => row[0] === 150)) {
        Object.assign(row[2], {
          mapId: e.document.map_id,
          curPosX: Math.floor(e.document.position[0] / 20),
          curPosY: Math.floor(e.document.position[1] / 20),
        });
        const hero = row[2].simpleHeroInfo;
        if (hero && !e.campaign && e.document.map_id === 10002) {
          const j = ((this.s.role(this.account.id).icon - 1) % 3) + 1;
          Object.assign(hero, {
            skillScript: `${j * 10000 + 711},${j * 10000 + 811}`,
            fastKey: `${j * 100 + 7},${j * 100 + 8},-1,-1,-1`,
          });
        }
        if (hero && e.active && e.stage !== "finished")
          Object.assign(hero, {
            hp: e.active.player_hp,
            totalLive: e.active.player_max_hp,
          });
      }
    }
    // Send the authoritative source system list after player level changes.
    if (this.state === "gateway_active" && rows.some((row) => row[0] === 3)) {
      const role = this.s.role(this.account.id),
        open = systemOpenPacket(role),
        fingerprint = JSON.stringify(open[2]);
      if (this.systemOpenFingerprint !== fingerprint) {
        rows.push(open);
        this.systemOpenFingerprint = fingerprint;
      }
    }
    if (this.state === "gateway_active" && rows.some((row) => row[0] === 3)) {
      const vip = this.g.tx(this.account.id, (r) => this.g.vipPacket(r));
      const signature = JSON.stringify(vip[2]);
      if (signature !== this.vipSignature) {
        if (!rows.some((row) => row[0] === 4410)) rows.push(vip);
        this.vipSignature = signature;
      }
    }
    const output = [
      ...rows,
      ...notices.map((n) => {
        const liveTip = n.id > this.noticeReplayThrough &&
          ["reward", "level", "vip", "pending_xp"].includes(n.kind);
        return (liveTip ? p.systemMessage : p.systemLogMessage)(n.message, n.created_at * 1000);
      }),
    ].map(([c, n, b]) => this.reply(c, n, b));
    if (notices.length) this.noticeCursor = notices.at(-1).id;
    return output;
  }
  nextDue() {
    const v = [this.encounter?.nextDue, this.cityDue, this.resourceDue].filter(
      (n) => n != null,
    );
    return v.length ? Math.min(...v) : null;
  }
  // Selecting another activity in the native campaign window is an explicit
  // request to leave the current run. Keep abandonment and the new operation
  // in one transaction, including restoration of the live encounter on error.
  changeCampaignActivity(action) {
    const e = this.encounter;
    need(!e?.pendingReward?.(),"reward_pending","Önce savaş ödülünü seçmelisin.");
    if (!e?.campaign || e.document.completed || e.document.abandoned)
      return action();
    const before = {
      document: structuredClone(e.document),
      revision: e.revision,
      nextDue: e.nextDue,
    };
    try {
      return this.s.tx(() => {
        e.abandon();
        return action();
      });
    } catch (error) {
      Object.assign(e, before);
      throw error;
    }
  }
  checkAccount(q) {
    const a = this.s.authenticate(this.token);
    need(
      this.account?.id === a.id &&
        casefold(q.userName) === casefold(a.username) &&
        q.site === this.site,
      "identity_mismatch",
      "Hesap kimliği uyuşmuyor.",
      401,
    );
    return a;
  }
  handle(packet) {
    if (RESET.has(packet.code)) this.sender.setKey(INITIAL_KEY);
    try {
      return this.sendable(this.route(packet));
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
      const mapping = {
        28678: [3846, "login.createLoginRsp", { result: 5 }],
        28672: [3843, "login.GetPlayerListRsp", { loginState: -1 }],
        28674: [
          3844,
          "login.playerLoginRsp",
          { result: false, message: e.message },
        ],
        28676: [
          3845,
          "login.registerRoleRsp",
          { value: false, message: e.message },
        ],
      };
      if (e.status === 401 || packet.code === 28678)
        this.close = [1008, "Authentication failed"];
      if (mapping[packet.code]) return this.sendable([mapping[packet.code]]);
      if (
        this.state === "gateway_active" &&
        e.status !== 401 &&
        ![
          "malformed_protobuf",
          "recursion_limit",
          "missing_required",
          "guide_owner",
        ].includes(e.code)
      ) {
        console.info(
          "wartune_game_rejected command=" +
            packet.code +
            " reason=" +
            e.code +
            (e.code === "building_dependency"
              ? " requirement=" + JSON.stringify(e.message)
              : ""),
        );
        const rows = [p.systemMessage(systemErrorText(e))];
        if(packet.code===5039){rows[0][2].isCenterTip=false;rows.push([111,"chat.ChatChannelMsg",p.systemMessage(systemErrorText(e))[2]]);}
        if(packet.code===8586&&this.account?.id){const role=this.s.role(this.account.id);if(role)rows.push(...this.g.hotEventPackets(role));}
        if(packet.code===5187)rows.push([4430,"campaign.CampaignReqMsg",{paraString1:"VAVEYLA_TALENT_GRADE_V1:"+JSON.stringify({upresult:false})}]);
        if(packet.code===8781){const role=this.s.role(this.account.id);rows.push(p.fashionPacket(this.g,role),[4542,"campaign.CampaignReqMsg",{paraString1:"VAVEYLA_FASHION_BOOK_V1:"+JSON.stringify(this.g.fashionBook(role))}]);}
        if([5153,8594].includes(packet.code))rows.unshift([packet.code===8594?4487:89,"campaign.CampaignReqMsg",{paraString1:"VAVEYLA_CRAFT_V1:"+JSON.stringify({composeResult:false})}]);
        if (packet.code === 8504) {
          const req = decode("vip.OpenGiftReq", packet.payload);
          rows.unshift([
            4409,
            "vip.OpenGiftRsp",
            { type: req.type, grade: req.grade, ret: 0 },
          ]);
        }
        if (packet.code === 5150)rows.unshift([86,"item.ItemInfoMsg",{id:0,pos:0,bagType:0,objectId:0,strengthenGrade:0,exist:false,property1:"VAVEYLA_FORGE_V1"}]);
        if (packet.code === 8528)
          rows.unshift([
            4425,
            "campaign.CampaignSweepRsp",
            { sweepType: 1, status: 2, result: [], dropItems: [] },
          ]);
        if ([8202, 8203, 5172].includes(packet.code))
          rows.push(
            ...p.buildings(
              this.s.role(this.account.id),
              this.g.snapshot(this.account.id),
              false,
              this.s.clock(),
            ),
          );
        return this.sendable(rows);
      }
      throw e;
    }
  }
  route(packet) {
    const code = packet.code,
      q = (name) => decode(name, packet.payload);
    if (code === 28678) {
      const r = q("login.createLoginReq"),
        a = this.s.authenticate(r.token);
      need(
        casefold(r.userName) === casefold(a.username),
        "identity_mismatch",
        "Hesap kimliği uyuşmuyor.",
        401,
      );
      need(
        r.site.length >= 1 &&
          r.site.length <= 64 &&
          r.pass.length >= 1 &&
          r.pass.length <= 256,
        "invalid_login",
      );
      Object.assign(this, {
        account: a,
        token: r.token,
        site: r.site,
        correlation: r.pass,
        state: "authenticated",
      });
      return [
        [
          3846,
          "login.createLoginRsp",
          { userName: a.username, site: this.site, result: 0 },
        ],
      ];
    }
    if (code === 20001) {
      need(
        this.state === "new",
        "invalid_ticket",
        "Yeni gateway bağlantısı gerekli.",
        401,
      );
      const r = q("player.LoginReqMsg");
      need(
        r.ekeys.length === 8 &&
          r.ekeys.every((n) => Number.isInteger(n) && n >= 1 && n <= 255),
        "invalid_key",
      );
      const ticket = this.s.consumeTicket(r.playerId, r.key);
      this.account = ticket.account;
      this.sessionHash = ticket.session_token_hash;
      const role = this.s.role(this.account.id);
      need(role, "character_required");
      this.reader.key = Buffer.from(r.ekeys);
      this.sender.setKey(Buffer.from(r.ekeys));
      this.state = "gateway_active";
      this.g.tx(role.account_id, (r) => this.g.signDaily(r));
      this.noticeCursor = this.s.get(
        "select coalesce(max(id),0) as n from game_notifications where character_id=?",
        role.id,
      ).n;
      this.noticeHistoryPending = true;
      this.encounter = new Battle(this.g, role);
      const old = this.s.get(
        "select state_json from game_campaign_runs where character_id=?",
        role.id,
      );
      if (old) {
        const d = JSON.parse(old.state_json);
        if (!d.abandoned && !this.g.activeSweep(role) &&
            (!d.completed || (d.active && !d.card_reward?.claimed)))
          this.encounter = new Battle(this.g, role, d.campaign_id, {resume:true});
      }
      this.encounter.completeIfWon();
      if (this.encounter.pendingReward()) this.encounter.intro();
      const view = this.g.snapshot(role.account_id);
      this.resourceDue = mono() + 30;
      return [
        [3841],
        p.player(
          this.s.role(role.account_id),
          view,
          trainingState(this.s, role),
          true,
        ),
      ];
    }
    if (this.state === "gateway_active") return this.world(packet);
    need(this.account, "invalid_session", "Önce oturum doğrulanmalı.", 401);
    if (code === 28680) {
      this.checkAccount(q("login.SynchronizedTimeReq"));
      return [[28680]];
    }
    if (code === 28672) {
      need(this.state === "authenticated", "invalid_state");
      const r = q("login.GetPlayerListReq"),
        a = this.checkAccount(r);
      need(
        r.key === this.correlation,
        "invalid_key",
        "Bağlantı anahtarı uyuşmuyor.",
        401,
      );
      const role = this.s.role(a.id);
      this.state = "listed";
      return [
        [
          3843,
          "login.GetPlayerListRsp",
          {
            userName: a.username,
            site: this.site,
            loginState: 0,
            infoList: role
              ? [
                  {
                    userId: a.id,
                    userName: a.username,
                    nickName: role.name,
                    grade: role.level,
                    sex: role.sex,
                    site: this.site,
                    active: true,
                    isOnline: false,
                  },
                ]
              : [],
          },
        ],
      ];
    }
    if (code === 28674) {
      need(this.state === "listed", "invalid_state");
      const r = q("login.playerLoginReq"),
        a = this.checkAccount(r);
      need(
        r.loginKey === this.correlation && [0, a.id].includes(r.userId),
        "identity_mismatch",
        "Bağlantı kimliği uyuşmuyor.",
        401,
      );
      need(r.password.length >= 1 && r.password.length <= 256, "invalid_key");
      this.passwordMd5 = crypto
        .createHash("md5")
        .update(r.password)
        .digest("hex");
      const role = this.s.role(a.id);
      if (role)
        this.s.issueTicket(a.id, this.passwordMd5, this.token, this.site);
      this.state = "prepared";
      return [
        [
          3844,
          "login.playerLoginRsp",
          {
            userName: a.username,
            site: this.site,
            result: true,
            message: role ? "Login Succeed" : "Login Succeed No Visualize",
            userId: a.id,
            gateIp: this.app.host,
            port: this.app.wartunePort,
            todayFirstLogin: false,
          },
        ],
      ];
    }
    if (code === 28676) {
      need(this.state === "prepared", "invalid_state");
      const r = q("login.registerRoleReq"),
        a = this.checkAccount(r);
      need(
        r.userId === a.id && r.md5Password.toLowerCase() === this.passwordMd5,
        "identity_mismatch",
        "Karakter kimliği uyuşmuyor.",
        401,
      );
      this.s.createRoleTicket(
        a.id,
        r.nickName,
        r.sex,
        r.icon,
        r.camp,
        this.site,
        this.passwordMd5,
        this.token,
      );
      this.state = "registered";
      return [
        [
          3845,
          "login.registerRoleRsp",
          {
            userName: a.username,
            site: this.site,
            value: true,
            message: "Character Created",
            gateIp: this.app.host,
            port: this.app.wartunePort,
            userId: a.id,
          },
        ],
      ];
    }
    throw new GameError("unsupported_command");
  }
  world(packet) {
    this.s.gateway(this.account.id, this.sessionHash);
    let role = this.s.role(this.account.id);
    need(role, "character_required");
    const code = packet.code,
      q = (name) => decode(name, packet.payload),
      e = this.encounter,
      state = () => trainingState(this.s, role),
      view = () => this.g.snapshot(role.account_id),
      mutate = (method, ...args) =>
        this.g.tx(role.account_id, (r) => this.g[method](r, ...args));
    if (code === 20008) {
      need(!packet.payload.length, "invalid_clock_request");
      return [
        [
          4234,
          "player.SynchronizedTimeMsg",
          { sysCurtime: date(this.s.clock()), sysMillisecond: Date.now() },
        ],
      ];
    }
    if (code === 5015) return [p.resources(role, view())];
    if (code === 5016) return [p.player(role, view(), state())];
    if (code === 8224) {
      const flags = q("player.PlayerDataMsg"),
        rows = [];
      if(flags.user&&!this.forgeRecovered){mutate("recoverForgeItems");this.forgeRecovered=true;}
      // Independent local recovery for the single tutorial hand-in deadlock.
      // All source claim checks and the existing reward event remain in force.
      if (flags.user && !e.campaign && state().completed && !e.pendingReward()) {
        const pending = this.s.get(
          "select * from game_quests where character_id=? and quest_id=45",
          role.id,
        );
        if (
          pending?.status === "accepted" &&
          this.g.questStatus(role, table("questtemplate")[45], pending).complete
        ) {
          mutate("claimQuest", 45, 0);
          role = this.s.role(role.account_id);
          rows.push([52, "quest.QuestFinishedRspMsg", { templateId: 45 }]);
        }
      }
      const v = view();
      if(flags.user||flags.army)rows.push(p.fashionPacket(this.g,role));
      if (flags.user) {
        if (this.noticeHistoryPending) {
          const recent = this.s.all(
            "select id from game_notifications where character_id=? order by id desc limit 20",
            role.id,
          );
          if (recent.length) {
            this.noticeCursor = recent.at(-1).id - 1;
            this.noticeReplayThrough = recent[0].id;
          }
          this.noticeHistoryPending = false;
        }
        if (this.g.activeSweep(role) || this.g.pendingSweep(role))
          rows.push([
            4425,
            "campaign.CampaignSweepRsp",
            mutate("campaignSweep", {
              sweepType: 1,
              opType: 0,
              campaignId: 0,
              eIndex: 0,
              enterType: 1,
            }),
          ]);
        if (e.pendingReward() || (e.campaign && !e.document.completed && !e.document.abandoned))
          rows.push(...e.introPackets());
        else if (v.world.map_id===10000 && role.level>=15) {
          if(!this.skyActive){this.skyActive=true;rows.push(...p.sky(role,v));}
          else rows.push([4597,"room.RoomEnterMsg",{result:1,player:[p.skyMember(role,v)]}]);
        }
        else if (e.document.completed) {
          rows.push(
            p.fullArmy(role, v),
            ...p.armyPackets(role, v),
            p.questPacket(v),
            [
              22,
              "campaign.CampaignExitMsg",
              {
                result: 1,
                playerId: role.player_id,
                armyId: role.player_id,
                serverName: "VAVEYLA",
              },
            ],
            [6, "player.LoginStateMsg", { playerId: role.player_id, state: 2 }],
          );
        } else
          rows.push([
            6,
            "player.LoginStateMsg",
            { playerId: role.player_id, state: role.level >= 15 ? 2 : 0 },
          ]);
      }
      rows.push(
        ...p.initial(
          role,
          v,
          flags,
          !this.heroInitialized && !rows.some((r) => r[0] === 150),
          this.s.clock(),
        ),
      );
      if(flags.user){rows.push(...this.g.hotEventPackets(role,true));this.hotEventDay=this.g.hotEventDay();}
      if (flags.quest || flags.army) rows.push(p.rank(this.g, role));
      return rows;
    }
    if (code === 8688) {
      const req=q("simple.PropertyMsg");
      need(req.param1===10000,"unknown_map");
      need(state().completed || (role.level>=15&&!e.entered) || e.campaign,"tutorial_in_progress");
      if(this.skyActive&&view().world.map_id===10000)return [[4597,"room.RoomEnterMsg",{result:1,player:[p.skyMember(role,view())]}]];
      this.changeCampaignActivity(()=>mutate("enterSky"));
      this.cityDue=null;this.skyActive=true;
      return [p.player(role,view(),state()),...p.sky(role,view())];
    }
    if (code === 8689) {
      need(this.skyActive,"sky_required");
      q("simple.PropertyMsg");
      need(!e.pendingReward(),"reward_pending","Önce savaş ödülünü seçmelisin.");
      mutate("leaveSky");this.skyActive=false;
      return p.city(this.g,role,state());
    }
    if (code === 8690) {
      need(this.skyActive,"sky_required");
      // The native walker reports already-traversed tiles, not a new route.
      // Echoing them to the sender restarts its local walk and reports again.
      mutate("moveSky",q("worldmap.PosMoveMsg"));
      return [];
    }
    if (code === 8701) {
      need(q("simple.PropertyMsg").param1===10000&&view().world.map_id===10000,"sky_required");
      return [[4597,"room.RoomEnterMsg",{result:1,player:[p.skyMember(role,view())]}]];
    }
    if (code === 8692) {
      const req=q("simple.PropertyMsg"),w=this.g.world(role);
      need(w.map_id===10000,"sky_required");
      const node=mutate("interactSkyNode",req.param1);
      return [[4601,"simple.PropertyMsg",{param1:node.id}],p.questPacket(view())];
    }
    if (code === 8700) {
      need(this.skyActive,"sky_required");
      need(view().world.map_id===10000,"sky_required");
      return [[4606,"room.RoomEnterMsg",{result:1,player:[p.skyMember(role,view())]}]];
    }
    if (code === 5039) {
      need(!e.pendingReward(),"reward_pending","Önce savaş ödülünü seçmelisin.");
      const r = q("campaign.CampaignReqMsg");
      need(
        [0, 1].includes(r.paraInt1) &&
          !Object.entries(r).some(
            ([k, v]) => !["paraInt1", "paraInt2"].includes(k) && v,
          ),
        "unsupported_campaign_mode",
      );
      need(state().completed || role.level >= 15, "tutorial_in_progress");
      const enter = () => new Battle(this.g, role, r.paraInt2);
      const next = e.campaign && e.document.campaign_id !== r.paraInt2
        ? this.changeCampaignActivity(enter)
        : enter();
      this.skyActive=false;
      this.encounter = next;
      this.cityDue = null;
      return [
        p.player(this.s.role(role.account_id), view(), state()),
        ...this.encounter.introPackets(),
      ];
    }
    // C_ENTER_CASTLE is a presence notification emitted by setScene itself.
    // In particular param7=false on SPACE_SCENE entry must not recreate it.
    if(code===8747){
      const req=q("simple.PropertyMsg");
      if(!req.param7)return [];
      if(this.skyActive){
        need(!e.pendingReward(),"reward_pending","Önce savaş ödülünü seçmelisin.");
        mutate("leaveSky");this.skyActive=false;this.cityDue=null;
        return p.city(this.g,role,state());
      }
    }
    // The original toolbar confirmation sends ROOM_EXIT (5025), whereas
    // other scene exit controls send CAMPAIGN_EXIT (5120).
    if ([5180, 5025, 5120, 8747].includes(code)) {
      need(!e.pendingReward(),"reward_pending","Önce savaş ödülünü seçmelisin.");
      if ([5025, 5120].includes(code))
        need(!q("room.RoomExitMsg").msg, "invalid_campaign_exit");
      if (e.campaign) {
        if (code === 5180) need(e.document.completed, "campaign_not_completed");
        e.abandon();
      } else {
        e.completeIfWon();
        need(
          e.document.completed,
          "tutorial_in_progress",
          "Şehre geçmek için eğitim bossunu yenmelisin.",
        );
      }
      this.cityDue = null;
      return [...p.city(this.g, role, state(),true), p.rank(this.g, role)];
    }
    if (code === 5122) {
      const receipt = e.claimReward(role, q("campaign.CampaignReqMsg"));
      this.cityDue ??= mono() + 9;
      return [receipt];
    }
    if (code === 5038)
      return [e.preload(q("campaign.CampaignReqMsg").paraInt1)];
    if (code === 5126) return [e.fog(q("campaign.CampaignFogDataListReqMsg"))];
    if (code === 5127) {
      const r = q("novice.NoviceReqMsgMsg");
      if (r.type === 1) {
        need(
          !Object.entries(r).some(([k, v]) => k !== "type" && v),
          "invalid_novice_entry",
        );
        if (role.level !== 1) return [];
        e.intro();
        return e.introPackets();
      }
    }
    if (code === 5017) {
      const r = q("novice.NoviceReqMsgMsg");
      if (e.campaign) return [];
      need([0, role.player_id].includes(r.armyId), "guide_owner");
      try {
        e.bind(role);
        return e.checkpoint(r);
      } catch (err) {
        if (
          err.code === "invalid_training_request" ||
          err.code === "training_level_unsupported"
        )
          return [];
        throw err;
      }
    }
    if (code === 5032)
      return e.campaign ? [] : e.callback(q("campaign.CallBackReqMsg"));
    if ([10010, 10022].includes(code))
      return e.pause(q("battle.BattleReqMsg"), code === 10010);
    if (code === 5124) return e.move(role, q("worldmap.PosMoveMsg"));
    if (code === 5125) return e.arrive(role, q("campaign.CampaignReqMsg"));
    if (code === 10007) return e.load(role, q("battle.LoadOverMsg"));
    if (code === 10008) return e.skill(q("battle.UseSkillMsg"));
    if (code === 8266) {
      const r = q("player.PlayerSignReqMsg");
      if (r.optType === 1) {
        need(
          !r.prizeSite && !r.payType && !r.index,
          "invalid_sign_status_request",
        );
        return [p.owned(p.base.sign, role)];
      }
    }
    const handled = this.gamePacket(role, packet, mutate);
    if (handled !== null) {
      const v = view();
      const busy = v.buildings
        .filter((b) => b.finishes_at != null)
        .map((b) => mono() + Math.max(0, b.finishes_at - this.s.clock()));
      this.resourceDue = Math.min(mono() + 30, ...busy);
      role = this.s.role(role.account_id);
      const questRows = handled.filter((row) => row[0] === 112),
        rows = handled.filter((row) => row[0] !== 112);
      rows.push(p.player(role, v, state()));
      if(code===5005)rows.push(p.fashionPacket(this.g,role));
      if ([5014, 5005, 5185, 5186, 5167, 5150, 5151, 5152, 8536, 8605].includes(code))
        rows.push(p.fullArmy(role, v));
      if ([8202, 8203, 5172, 8281].includes(code))
        rows.push(...p.armyPackets(role, v));
      rows.push(p.resources(role, v));
      if (
        [
          8202, 8203, 5172, 5155, 5156, 5157, 5158, 8276, 5005, 5007, 8220,
          8327, 5185, 5150, 5006, 5151, 5152, 8536, 8605,
        ].includes(code)
      )
        questRows.push(p.questPacket(v));
      rows.push(...questRows);
      if (code === 8851 && e.campaign && e.stage === "running") {
        e.active.auto = v.skill_preferences;
        e.commit("auto_preferences");
      }
      return rows;
    }
    if (this.app.unsupported) {
      const old = this.app.unsupported.get(code);
      if (old || this.app.unsupported.size < 128)
        this.app.unsupported.set(code, {
          count: (old?.count ?? 0) + 1,
          last_seen: this.s.clock(),
          stage: e.stage,
        });
    }
    if (!this.unknown.has(code)) {
      this.unknown.add(code);
      console.info(
        "wartune_feature_unimplemented code=" +
          code +
          " payload_bytes=" +
          packet.payload.length,
      );
      return [p.systemLogMessage(unavailableFeatureText(code))];
    }
    return [];
  }
  gamePacket(role, packet, mutate) {
    const service = servicePacket(this, role, packet, mutate);
    if (service !== null) return service;
    const c = packet.code,
      q = (n) => decode(n, packet.payload),
      view = () => this.g.snapshot(role.account_id),
      baseResult = (n, args) => mutate(n, ...args);
    if (c === 8504) {
      const req = q("vip.OpenGiftReq");
      mutate("claimVipGift", req.type, req.grade);
      return [
        [4409, "vip.OpenGiftRsp", { type: req.type, grade: req.grade, ret: 1 }],
        this.g.tx(role.account_id, (r) => this.g.vipPacket(r)),
      ];
    }
    if (c === 8528) {
      const req = q("campaign.CampaignSweepReq");
      const perform = () => mutate("campaignSweep", req);
      const body = req.opType === 1
        ? this.changeCampaignActivity(perform)
        : perform();
      const rows = [[4425, "campaign.CampaignSweepRsp", body],p.itemsPacket(this.s.role(role.account_id),this.g.snapshot(role.account_id).inventory),p.questPacket(this.g.snapshot(role.account_id))];
      if (req.opType === 1) this.cityDue = null;
      if (this.encounter?.campaign &&
          (this.encounter.document.abandoned || this.encounter.document.completed)) {
        this.cityDue = null;
        // Keep the native raid window visible while it runs. Its close/cancel
        // request is the point at which the underlying old map should leave.
        if (req.opType === 4)
          rows.push(...p.city(this.g, this.s.role(role.account_id), trainingState(this.s, role)));
      }
      return rows;
    }
    if (c === 5172) {
      const q1 = q("building.BuildingReqMsg");
      need(
        !q1.position && !q1.userId && !q1.nodeId && !q1.sonNodeId,
        "invalid_building_request",
      );
      mutate("speedBuildings", q1.orderId, q1.index);
      const rows = p.buildings(role, view(), false, this.s.clock());
      rows.push([
        102,
        "building.OrderQuickRspMsg",
        {
          orderInfo: rows[1][2].buildOrder
            .filter((o) => !q1.orderId || o.orderId === q1.orderId)
            .map((o) => o),
        },
      ]);
      return rows;
    }
    if ([8202, 8203, 8279, 8281].includes(c)) {
      if ([8279, 8281].includes(c))
        need(!packet.payload.length, "invalid_building_request");
      else {
        const r = q("building.BuildingOptionReqMsg");
        if (c === 8203) {
          need(r.buildingId > 0 && !r.sonType, "invalid_building_request");
          const owned = view().buildings.find(
            (b) => p.buildingId(b) === r.buildingId,
          );
          need(owned, "building_not_owned");
          mutate("upgradeBuilding", owned.son_type);
        } else {
          need(!r.buildingId && r.sonType > 0, "invalid_building_request");
          mutate("createBuilding", r.sonType);
        }
      }
      const rows = p.buildings(role, view(), false, this.s.clock());
      if ([8202, 8203].includes(c))
        rows.push(
          ...rows[1][2].buildOrder
            .filter((o) => o.remainTime > 0)
            .map((o) => [151, "building.OrderInfoMsg", o]),
        );
      return rows;
    }
    if (c === 8327) {
      const r = q("simple.GoldImposeReqMsg");
      need(r.op === 0 && [0, 1].includes(r.payType), "paid_tax_unsupported");
      const r1 = mutate("levyTax");
      return [
        [
          4242,
          "simple.GoldImposeMsg",
          {
            leftImpose: r1.tax_used,
            maxImpose: r1.tax_daily_limit,
            payImpose: 0,
          },
        ],
      ];
    }
    if ([5185, 5186, 5167].includes(c)) {
      if (c === 5185) {
        const r = q("army.HeroAddPointReqMsg");
        need(
          [0,1].includes(r.type)&&!Object.entries(r).some(([k,v])=>!["skillTempId","type"].includes(k)&&v),
          "unsupported_skill_operation",
        );
        const t = this.g.skillTemplates()[r.skillTempId];
        need(t,"unknown_skill");const talent=r.type===1||[9,10,20,30,100].includes(t.MasterType);
        mutate(talent?"learnTalent":"learnSkill",r.skillTempId);
        return [
          [
            60,
            "army.UpdatedSkillMsg",
            { templateId: t.TemplateId, index: t.Index, type: talent?1:0 },
          ],
        ];
      }
      if (c === 5167) {
        const r = q("army.HeroFastKeyMsg");
        need(!r.setResult, "invalid_skill_request");
        const v = mutate("equipSkills", r.fastKey);
        return [
          [
            64,
            "army.HeroFastKeyMsg",
            { fastKey: p.nativeFastKeys(v.fast_keys), setResult: true },
          ],
        ];
      }
      need(!packet.payload.length, "invalid_skill_request");
      return [];
    }
    if (c === 8851) {
      const r = q("skilledit.SkillEditReqMsg");
      need(
        [1, 2, 3, 4].includes(r.op) && !r.petId,
        "invalid_skill_preferences",
      );
      this.g.tx(role.account_id, (role) => {
        const old = this.g.preferences(role);
        if (r.op === 3)
          need(
            !Object.entries(r).some(([k, v]) => k !== "op" && v),
            "invalid_skill_preferences",
          );
        else if (r.op === 4) {
          need(
            !Object.entries(r).some(
              ([k, v]) => !["op", "isOpen"].includes(k) && v,
            ),
            "invalid_skill_preferences",
          );
          this.g.editPreferences(
            role,
            r.isOpen,
            old.percent,
            old.normal_skill,
            old.special_skill,
          );
        } else {
          need(r.job === ((role.icon - 1) % 3) + 1, "skill_job");
          const defaultSkills = this.g
            .skills(role)
            .learned.filter(
              (t) =>
                et("skilltemplate")[t].UseWay !== 2 &&
                !et("skilltemplate")[t].IsDelphic,
            )
            .map((t) => "1:" + t)
            .join(",");
          this.g.editPreferences(
            role,
            r.isOpen,
            r.op === 1 ? r.percent : 50,
            r.op === 1 ? r.normalSkill : defaultSkills,
            r.op === 1 ? r.specialSkill : "",
          );
        }
      });
      const pref = view().skill_preferences;
      return [
        [
          4740,
          "skilledit.SkillEditResMsg",
          {
            isOpen: pref.enabled,
            skillInfo: [1, 2, 3].map((job) => ({
              job,
              percent: job === ((role.icon - 1) % 3) + 1 ? pref.percent : 50,
              defaultSkill: job * 100 + 7,
              petId: 0,
              normalSkill:
                job === ((role.icon - 1) % 3) + 1 ? pref.normal_skill : "",
              specialSkill:
                job === ((role.icon - 1) % 3) + 1 ? pref.special_skill : "",
            })),
          },
        ],
      ];
    }
    if ([5155, 5156, 5157, 5158, 5163, 8276].includes(c)) {
      if (c === 8276) {
        const r = q("army.ArmyFightPosEditMsg");
        need(
          r.userId === role.player_id &&
            ["", "VAVEYLA", null].includes(r.serverName),
          "army_not_owned",
        );
        mutate("formation", r.heroPos, r.pawnPos);
        return [p.fullArmy(role, view())];
      }
      if (c === 5163) {
        need(!packet.payload.length, "invalid_pawn_request");
        return p.armyPackets(role, view());
      }
      const r = q("army.ArmyPawnInfoMsg");
      need(
        !Object.entries(r).some(
          ([k, v]) =>
            !["tempateId", "ownPawns", "sites", "armyId"].includes(k) &&
            (Array.isArray(v) ? v.length > 0 : !!v),
        ) && [0, role.player_id].includes(r.armyId),
        "invalid_pawn_request",
      );
      if (c === 5156) mutate("deploy", r.tempateId, r.sites, r.ownPawns);
      else {
        need(r.sites === 0, "invalid_pawn_request");
        if (c === 5158) {
          need(r.ownPawns === 0, "invalid_pawn_request");
          mutate("upgradePawn", r.tempateId);
        } else
          mutate(c === 5155 ? "recruit" : "dismiss", r.tempateId, r.ownPawns);
      }
      const v = view(),
        rows = p.armyPackets(role, v, [5156, 5158].includes(c));
      if (c === 5158) {
        const u = v.army.units.find(
          (u) => u.son_type === pt()[r.tempateId].SonType,
        );
        rows.unshift([116, "army.ArmyPawnInfoMsg", p.pawnInfo(role, u)]);
      }
      return rows;
    }
    if (c === 5012) {
      const r = q("quest.QuestAddedMsg");
      need(r.questId.length <= 128, "quest_batch_limit");
      this.g.tx(role.account_id, (role) => {
        for (const id of r.questId) {
          const quest = table("questtemplate")[id];
          need(quest, "unknown_quest");
          if (this.g.questAvailable(role, quest)) this.g.acceptQuest(role, id);
        }
      });
      return [p.questPacket(view())];
    }
    if (c === 5014) {
      const r = q("quest.QuestFinishedReqMsg");
      need(!r.isPass, "quest_skip_unsupported");
      const before = view().inventory;
      mutate("claimQuest", r.templateId, r.rewardItemId);
      return [
        [52, "quest.QuestFinishedRspMsg", { templateId: r.templateId }],
        p.itemsPacket(role, view().inventory, before),
        p.questPacket(view()),
      ];
    }
    if ([5005, 5007, 8220].includes(c)) {
      const before = view().inventory;
      if (c === 8220) mutate("arrangeItems", q("item.ArrangeReq").bagType);
      else {
        const r = q("item.ItemReqMsg"),
          own = r.beginBagType === 4 ? role.id : 0;
        need(
          r.beginObjId === own && [0, own].includes(r.objectId),
          "item_not_owned",
        );
        const item = before.find(
          (i) => i.bag === r.beginBagType && i.position === r.beginPos,
        );
        need(item, "item_not_owned");
        if (c === 5007) mutate("sellItem", item.id, r.count);
        else {
          need(
            r.endObjId === (r.endBagType === 4 ? role.id : 0),
            "item_not_owned",
          );
          mutate("moveItem", item.id, r.endBagType, r.endPos, r.count);
        }
      }
      return [p.itemsPacket(role, view().inventory, before)];
    }
    if (c === 8212) {
      const r = q("consortia.ConsortiaMsg"),
        g = view().guild;
      need([0, g?.id ?? 0].includes(r.consortiaId), "guild_not_owned");
      need(
        !Object.entries(r).some(([k, v]) => k !== "consortiaId" && v),
        "invalid_guild_read",
      );
      return [[4138, "consortia.ConsortiaInfoMsg", p.guildBody(g)]];
    }
    if (c === 8213) {
      const r = q("consortia.SearchConditionMsg");
      need([0, 1].includes(r.pageIndex), "unsupported_page");
      const rows = this.g
        .all("select id from game_guilds order by id limit 100")
        .map((x) => this.g.guild(x.id))
        .filter(
          (g) =>
            !r.consortiaName ||
            casefold(g.name).includes(casefold(r.consortiaName)),
        );
      return [
        [
          4139,
          "consortia.ConsortiaSearchRspMsg",
          {
            totalRows: rows.length,
            consortiaInfo: rows.map(guildBody),
            isReset: true,
          },
        ],
      ];
    }
    return null;
  }
  tick(now = mono()) {
    this.s.gateway(this.account.id, this.sessionHash);
    const role = this.s.role(this.account.id);
    need(role, "character_required");
    const e = this.encounter;
    let rows = [];
    if (e.nextDue != null) {
      rows.push(...e.tick(now), ...e.finish(role, now));
      if (rows.some((r) => r[0] === 4103)) {
        const b = e.active,
          result = rows.find((r) => r[0] === 4103)[2];
        // VAVEYLA_UI_SAVAS_171
        console.info("SAVAS_SONUC_PAKETI_4103", result.battleId, result.battleResult);
        console.info(
          `wartune_battle_result result=${result.battleResult === 1 ? "victory" : "defeat"} map=${e.document.map_id} node=${b.node_id} player_hp=${b.player_hp} enemies_alive=${b.enemies.filter((a) => a.hp > 0).length}`,
        );
        // VAVEYLA_FIX_INLINE_160
        if (e.active) {
          const v = this.g.snapshot(role.account_id),
            r = this.s.role(role.account_id),
            army = p.fullArmy(r, v);
          Object.assign(army[2], {
            mapId: e.document.map_id,
            curPosX: Math.floor(e.document.position[0] / 20),
            curPosY: Math.floor(e.document.position[1] / 20),
          });
          rows.push(
            p.player(r, v, trainingState(this.s, r)),
            army,
            p.questPacket(v),
          );
          if (result.battleResult === 1) {
            this.battleQuestNotices ??= new Set();
            for (const q of v.quests ?? []) {
              if (q.status === "accepted" &&
                  q.complete &&
                  !this.battleQuestNotices.has(q.quest_id)) {
                this.battleQuestNotices.add(q.quest_id);
                rows.push(p.systemMessage(
                  "Görev tamamlandı: " +
                  (q.title || q.quest_id)
                ));
              }
            }
          }
          if (e.document.completed) {
            if (e.campaign) rows.push(p.rank(this.g, r));
            this.cityDue = e.pendingReward() ? null : now + 2;
          }
        }
      }
      if (rows.some((r) => r[0] === 6)) {
        rows = rows.filter((r) => r[0] !== 6);
        this.cityDue = e.pendingReward() ? null : now + 2;
      }
    }
    if (this.cityDue != null && now >= this.cityDue && !e.pendingReward()) {
      rows.push(
        ...p.city(
          this.g,
          this.s.role(role.account_id),
          trainingState(this.s, role),
          true,
        ),
      );
      this.cityDue = null;
      this.resourceDue = now + 30;
    } else if (this.resourceDue != null && now >= this.resourceDue) {
      if(role.level>=15&&this.hotEventDay!==this.g.hotEventDay()){rows.push(...this.g.hotEventPackets(role,true));this.hotEventDay=this.g.hotEventDay();}
      const v = this.g.snapshot(role.account_id);
      rows.push(
        p.player(this.s.role(role.account_id), v, trainingState(this.s, role)),
        ...p.buildings(role, v, false, this.s.clock()),
        ...p.armyPackets(role, v),
        p.questPacket(v),
        p.resources(role, v),
      );
      if (v.guild)
        rows.push([4138, "consortia.ConsortiaInfoMsg", p.guildBody(v.guild)]);
      this.resourceDue = now + 30;
    }
    return this.sendable(rows);
  }
}

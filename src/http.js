import { safeName } from "./assets.js";
import { systemStatus } from "./system-open.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { GameError, need, fields, casefold, ROOT, jsonFile } from "./util.js";
import { trainingState } from "./battle.js";
export function strictJSON(text) {
  const value = JSON.parse(text);
  const token =
    /\s+|"(?:\\.|[^"\\])*"|[{}\[\]:,]|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/gy;
  const stack = [];
  let m;
  while ((m = token.exec(text))) {
    const s = m[0];
    if (/^\s/.test(s)) continue;
    if (s === "{") {
      need(stack.length < 64, "invalid_json");
      stack.push({ object: true, key: true, keys: new Set() });
    } else if (s === "[") {
      need(stack.length < 64, "invalid_json");
      stack.push({ object: false });
    } else if (s === "}" || s === "]") stack.pop();
    else if (s === ",") {
      if (stack.at(-1)?.object) stack.at(-1).key = true;
    } else if (s.startsWith('"') && stack.at(-1)?.object && stack.at(-1).key) {
      const key = JSON.parse(s),
        top = stack.at(-1);
      need(!top.keys.has(key), "invalid_json", "Tekrarlanan JSON alanı.");
      top.keys.add(key);
      top.key = false;
    } else if (!s.startsWith('"') && /^-?\d/.test(s))
      need(Number.isFinite(Number(s)), "invalid_json");
  }
  return value;
}
export async function body(req, form = false) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    need(size <= 65536, "body_too_large", "İstek gövdesi sınırı aşıyor.", 413);
    chunks.push(chunk);
  }
  const raw = new TextDecoder("utf8", { fatal: true }).decode(
    Buffer.concat(chunks),
  );
  if (form) return new URLSearchParams(raw);
  let data;
  try {
    data = strictJSON(raw);
  } catch {
    throw new GameError(
      "invalid_json",
      "Geçerli ve belirsiz olmayan JSON gerekli.",
      400,
    );
  }
  need(
    data && typeof data === "object" && !Array.isArray(data),
    "invalid_body",
  );
  return data;
}
export function json(res, status, data) {
  if (res.destroyed) return;
  const raw = Buffer.from(
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
  bytes(res, status, raw, "application/json; charset=utf-8");
}
export function bytes(res, status, raw, type) {
  if (res.destroyed) return;
  res.writeHead(status, {
    "Content-Type": type,
    "Content-Length": raw.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    Connection: "close",
  });
  res.end(raw);
}
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".zip": "application/zip",
  ".bin": "application/octet-stream",
  ".dat": "application/octet-stream",
  ".fui": "application/octet-stream",
  ".ktx": "image/ktx",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".txt": "text/plain",
  ".atlas": "text/plain",
  ".sk": "application/octet-stream",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};
export function validateDiagnostics(v) {
  need(
    v &&
      v.schema === 1 &&
      v.state &&
      Array.isArray(v.page_errors) &&
      Array.isArray(v.resource_errors),
    "invalid_diagnostics",
  );
  need(
    Object.keys(v).every((k) =>
      ["schema", "state", "page_errors", "resource_errors", "battle", "sky"].includes(
        k,
      ),
    ),
    "invalid_diagnostics",
  );
  const bools = ["cmd_present", "read_failed"],
    optional = [
      "node10_present",
      "node10_trigger",
      "node10_skip",
      "node10_finish",
      "common_conditions",
      "scene_entered",
    ],
    ints = ["main_node", "sub_node", "sub_node_index"];
  need(
    Object.keys(v.state).length ===
      bools.length + optional.length + ints.length &&
      Object.entries(v.state).every(([k, n]) =>
        bools.includes(k)
          ? typeof n === "boolean"
          : optional.includes(k)
            ? n === null || typeof n === "boolean"
            : ints.includes(k) &&
              (n === null ||
                (Number.isSafeInteger(n) && n >= 0 && n <= 1000000)),
      ),
    "invalid_diagnostics",
  );
  need(
    v.page_errors.length <= 8 && v.resource_errors.length <= 8,
    "invalid_diagnostics",
  );
  for (const e of v.page_errors)
    need(
      e &&
        Object.keys(e).sort().join("|") === "column|line|name|source" &&
        [
          "Error",
          "TypeError",
          "ReferenceError",
          "SyntaxError",
          "RangeError",
          "URIError",
          "EvalError",
          "AggregateError",
        ].includes(e.name) &&
        (e.source === null || /^[A-Za-z0-9_.-]{1,93}\.js$/.test(e.source)) &&
        [e.line, e.column].every(
          (n) =>
            n === null || (Number.isSafeInteger(n) && n >= 0 && n <= 20000000),
        ),
      "invalid_diagnostics",
    );
  for (const r of v.resource_errors)
    need(
      typeof r === "string" &&
        /^res\/[A-Za-z0-9_./-]{1,176}$/.test(r) &&
        r.split("/").every((p) => !p.startsWith(".")),
      "invalid_diagnostics",
    );
  if (v.battle != null)
    need(
      Object.keys(v.battle).sort().join("|") === "phase|result" &&
        ["loading", "visible", "closed", "timeout", "failed"].includes(
          v.battle.phase,
        ) &&
        [1, 2, 3].includes(v.battle.result),
      "invalid_diagnostics",
    );
  if(v.sky!=null){
    const bools=new Set(["tiles_ready","self_ready","view_ready","scene_visible","scene_active","entered"]);
    const ints=new Set(["map_id","node_count","tile_views","load_count","view_x","view_y"]);
    need(typeof v.sky==="object"&&!Array.isArray(v.sky)&&Object.keys(v.sky).length<=17&&
      Object.entries(v.sky).every(([k,x])=>k==="phase"?typeof x==="string"&&["create","preloading","map_view","enter_over","ui_ready","read_failed"].includes(x):
        ["scene","next_scene"].includes(k)?x===null||typeof x==="string"&&/^[A-Z_]{1,40}$/.test(x):
        bools.has(k)?typeof x==="boolean":ints.has(k)?x===null||Number.isSafeInteger(x)&&Math.abs(x)<=1000000:
        k==="transition_alpha"&&(x===null||typeof x==="number"&&Number.isFinite(x)&&x>=0&&x<=1)),"invalid_diagnostics");
  }
  need(Buffer.byteLength(JSON.stringify(v)) <= 4096, "invalid_diagnostics");
  return structuredClone(v);
}
export function httpHandler(app) {
  return async (req, res) => {
    res.on("error", () => {});
    try {
      need(
        typeof req.url === "string" && req.url.startsWith("/"),
        "invalid_url",
      );
      const url = new URL("http://127.0.0.1" + req.url),
        route = decodeURIComponent(url.pathname),
        method = req.method;
      const bearer = () => {
          const h = req.headers.authorization;
          need(
            typeof h === "string" && h.startsWith("Bearer "),
            "invalid_session",
            "Oturum gerekli.",
            401,
          );
          return h.slice(7);
        },
        auth = () => app.store.authenticate(bearer()),
        role = () => {
          const a = auth(),
            r = app.store.role(a.id);
          need(r, "character_required", "Karakter bulunamadı.", 404);
          return r;
        },
        admin = () => {
          const token = app.adminToken,
            got =
              req.headers["x-admin-token"] ??
              req.headers.authorization?.replace(/^Bearer /, "");
          need(
            token &&
              typeof got === "string" &&
              Buffer.byteLength(got) === Buffer.byteLength(token) &&
              crypto.timingSafeEqual(Buffer.from(got), Buffer.from(token)),
            "admin_required",
            "Yönetici yetkisi gerekli.",
            403,
          );
        };
      if (method === "GET" && route === "/health")
        return json(res, 200, {
          status: "ok",
          engine: "nodejs",
          version: app.version,
          protocol: "vaveyla-dev-1",
          wartune_wire: "local_login",
          wartune_compatibility: "unverified",
          wartune_world_bootstrap: "experimental",
          android_termux_device_test: "not_run",
          python_runtime_required: false,
        });
      if (method === "GET" && route === "/api/server-diagnostics")
        return json(res, 200, {
          version: app.version,
          asset_errors: [...app.assetErrors.values()],
          unsupported_requests: [...app.unsupported.entries()].map(
            ([code, value]) => ({ code, ...value }),
          ),
          no_packet_bodies_collected: true,
        });
      if (method === "GET" && route === "/api/client-status")
        return json(res, 200, app.assets.status());
      if (method === "GET" && route === "/api/protocol-coverage")
        return json(res, 200, jsonFile("protocol-coverage.json"));
      if (method === "GET" && route === "/api/capabilities")
        return json(res, 200, {
          engine: "nodejs",
          normal_solo_campaigns: 45,
          normal_maps: 91,
          enemy_formations: 293,
          combat_rule: "local",
          reward_notifications: "sqlite_journal_and_system_channel_2",
          version: app.version,
          feature_status: {
            campaign_reward_cards: "persistent_one_free_choice_original_screen_local_preview_loot",
            account_and_character: "implemented",
            vip: "source_xp_levels_gifts_construction_research_cooldown_local_free_package_policy",
            free_diamond_packages: "local_free_catalog_no_real_payment",
            tutorial_and_normal_solo_campaigns: "implemented_local_rules",
            quest_inventory_skills_buildings_army_income: "implemented_subset",
            normal_campaign_raid:
              "earned_first_clear_timed_persistent_local_rules",
            building_queues:
              "separate_construction_research_source_costs_paid_speedup",
            guild: "basic_management_native_and_api",
            mail: "native_and_api_with_owned_attachments",
            shop: "source_catalog_costs_and_limits",
            daily: "source_seven_rewards_local_UTC_policy",
            chat: "world_private_guild_map",
            consumables: "currency_xp_stamina_subclass",
            pvp: "consensual_local_duel_api",
            official_ranked_pvp_and_all_high_level_systems: "not_implemented",
            official_random_drop_tables: "not_verified",
            android_all_scene_rendering: "not_verified",
          },
          official_formula_verified: false,
          full_original_backend_verified: false,
        });
      if (
        method === "POST" &&
        ["/api/register", "/api/login"].includes(route)
      ) {
        const v = await body(req);
        fields(v, ["username", "password"]);
        return json(
          res,
          route === "/api/register" ? 201 : 200,
          route === "/api/register"
            ? { account: app.store.register(v.username, v.password) }
            : app.store.login(v.username, v.password),
        );
      }
      if (method === "GET" && route === "/api/me") {
        const a = auth();
        return json(res, 200, {
          account: a,
          character: app.store.character(a.id),
        });
      }
      if (route === "/api/game" || route.startsWith("/api/game/")) {
        const a = auth();
        if (method === "GET") {
          if (route === "/api/game/vip")
            return json(
              res,
              200,
              app.game.tx(a.id, (r) => ({
                vip: app.game.vipStatus(r),
                gifts: app.game.vipPacket(r)[2].giftState,
              })),
            );
          if (route === "/api/game/systems")
            return json(
              res,
              200,
              app.game.tx(a.id, (r) => ({ systems: systemStatus(r) })),
            );
          if (route === "/api/game")
            return json(res, 200, app.game.snapshot(a.id));
          if (route === "/api/game/notifications") {
            need(
              [...url.searchParams.keys()].every(
                (k) =>
                  ["after", "limit"].includes(k) &&
                  url.searchParams.getAll(k).length === 1,
              ),
              "invalid_fields",
            );
            const after = Number(url.searchParams.get("after") ?? 0),
              limit = Number(url.searchParams.get("limit") ?? 100);
            return json(res, 200, {
              notifications: app.game.tx(a.id, (r) =>
                app.game.notices(r, after, limit),
              ),
            });
          }
          if (route === "/api/game/chat")
            return json(res, 200, {
              messages: app.game.tx(a.id, (r) =>
                app.game.chatHistory(r, Number(url.searchParams.get("peer"))),
              ),
            });
          if (route === "/api/game/mail")
            return json(res, 200, {
              mails: app.game.tx(a.id, (r) => app.game.mails(r)),
            });
          if (route === "/api/game/shop")
            return json(res, 200, {
              goods: app.game.tx(a.id, (r) => app.game.shopList(r)),
            });
          if (route === "/api/game/daily")
            return json(
              res,
              200,
              app.game.tx(a.id, (r) => app.game.daily(r)),
            );
          if (route === "/api/game/guilds")
            return json(res, 200, {
              guilds: app.game.tx(a.id, () =>
                app.game
                  .all("select id from game_guilds order by id limit 100")
                  .map((g) => app.game.guild(g.id)),
              ),
            });
          if (route.startsWith("/api/game/duels/"))
            return json(
              res,
              200,
              app.game.tx(a.id, (r) =>
                app.game.duelStatus(r, route.split("/").at(-1)),
              ),
            );
        }
        if (method === "POST") {
          const v = await body(req);
          fields(v, ["request_id", "data"]);
          return json(
            res,
            200,
            app.game.action(
              a.id,
              route.slice("/api/game/".length),
              v.data,
              v.request_id,
            ),
          );
        }
      }
      if (method === "GET" && route === "/api/training-status") {
        const r = role(),
          row = app.store.get(
            "select revision,state_json from wartune_training where character_id=?",
            r.id,
          );
        return json(res, 200, {
          level: r.level,
          revision: row?.revision ?? -1,
          progress: trainingState(app.store, r),
          full_game_verified: false,
          android_battle_rendering_verified: false,
        });
      }
      if (method === "GET" && route === "/vaveyla-client-diagnostics.js")
        return bytes(
          res,
          200,
          fs.readFileSync(path.join(ROOT, "src/client-diagnostics.js")),
          "application/javascript",
        );
      if (method === "POST" && route === "/api/client-diagnostics") {
        auth();
        app.diagnostics = {
          received_at: app.store.clock(),
          report: validateDiagnostics(await body(req)),
        };
        return json(res, 200, { status: "received" });
      }
      if (method === "GET" && route === "/api/client-diagnostics")
        return json(res, 200, {
          version: app.version,
          available: !!app.diagnostics,
          latest: app.diagnostics,
          asset_errors: [...app.assetErrors.values()],
        });
      if (method === "GET" && route === "/client-diagnostics")
        return bytes(
          res,
          200,
          Buffer.from(
            '<!doctype html><meta charset=utf-8><h2>VAVEYLA Node.js istemci teşhisi</h2><p>Oyunu başka sekmede açık bırak.</p><pre id=r></pre><script>async function update(){try{r.textContent=JSON.stringify(await(await fetch("/api/client-diagnostics")).json(),null,2)}catch{r.textContent="Sunucuya erişilemiyor"}}update();setInterval(update,3000)</script>',
          ),
          "text/html; charset=utf-8",
        );
      if (method === "GET" && route === "/local-account")
        return bytes(
          res,
          200,
          fs.readFileSync(path.join(ROOT, "src/local-account.html")),
          "text/html; charset=utf-8",
        );
      if (route.startsWith("/api/admin/")) {
        admin();
        if (method === "GET" && route === "/api/admin/players")
          return json(res, 200, {
            players: app.store.all(
              "select a.id as account_id,a.username,c.id as character_id,c.name,c.archetype,c.level,c.gold,c.diamonds from accounts a left join characters c on c.account_id=a.id order by a.id limit 100",
            ),
          });
        if (
          method === "POST" &&
          /^\/api\/admin\/players\/\d+\/diamonds$/.test(route)
        ) {
          const v = await body(req);
          fields(v, ["amount", "reason"]);
          return json(res, 200, {
            character: app.store.setDiamonds(
              +route.split("/")[4],
              v.amount,
              v.reason,
            ),
          });
        }
      }
      if (method === "GET" && route === "/admin")
        return bytes(
          res,
          200,
          Buffer.from(ADMIN_HTML),
          "text/html; charset=utf-8",
        );
      if (
        method === "POST" &&
        route.replace(/\/$/, "").endsWith("/nicknamecheck")
      ) {
        const v = await body(req, true),
          names = v.getAll("nickname"),
          name = names.length === 1 ? names[0].normalize("NFC").trim() : "";
        const valid =
          Array.from(name).length >= 3 &&
          Array.from(name).length <= 20 &&
          /^[\p{L}\p{N} _-]+$/u.test(name) &&
          /[\p{L}\p{N}]/u.test(name) &&
          !app.store.get(
            "select 1 from characters where name_key=?",
            casefold(name),
          );
        return bytes(
          res,
          200,
          Buffer.from(
            `<Result value="${valid}" message="${valid ? "" : "Karakter adı geçersiz veya kullanılıyor."}"/>`,
          ),
          "application/xml",
        );
      }
      if (
        method === "POST" &&
        route.replace(/\/$/, "").endsWith("/clientsiteinfoservlet")
      ) {
        await body(req, true);
        const site = {
          siteId: 1,
          showName: "VAVEYLA",
          type: 1,
          siteName: "local",
          loginUrl: app.host,
          webUrl: `http://${app.host}:${app.httpPort}/`,
          mainSite: 1,
          isOpen: true,
          isRepair: false,
          order: 1,
          openTime: 0,
        };
        return bytes(
          res,
          200,
          zlib.deflateSync(
            Buffer.from(
              JSON.stringify({
                isWhiteUser: false,
                platformId: "local",
                platformName: "VAVEYLA",
                ret: 0,
                msg: "",
                curTime: Date.now(),
                groups: [
                  { groupId: 1, groupName: "VAVEYLA", order: 1, sites: [site] },
                ],
              }),
            ),
          ),
          "application/octet-stream",
        );
      }
      if (method === "GET") {
        const name = route === "/" ? "index.html" : route.slice(1),
          type = mime[path.extname(name).toLowerCase()];
        try {
          need(type, "not_found", "Dosya bulunamadı.", 404);
          const f = app.assets.locate(name);
          if (!f) {
            if (name.startsWith("res/"))
              console.warn("wartune_asset_missing path=" + name);
            throw new GameError("not_found", "Dosya bulunamadı.", 404);
          }
          return bytes(res, 200, app.assets.body(name, f), type);
        } catch (e) {
          if (
            safeName(name) &&
            (name.startsWith("res/") || name.startsWith("js/"))
          ) {
            const old = app.assetErrors.get(name);
            if (old || app.assetErrors.size < 128)
              app.assetErrors.set(name, {
                path: name,
                reason: e.code || "asset_error",
                count: (old?.count ?? 0) + 1,
                last_seen: app.store.clock(),
              });
          }
          throw e;
        }
      }
      throw new GameError("not_found", "Uç nokta bulunamadı.", 404);
    } catch (e) {
      if (res.destroyed) return;
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const known = e instanceof GameError;
      json(res, known ? e.status : 500, {
        error: {
          code: known ? e.code : "internal_error",
          message: known ? e.message : "Sunucu hatası.",
        },
      });
      if (!known)
        console.error("http_internal_error type=" + e.constructor.name);
    }
  };
}
const ADMIN_HTML = `<!doctype html><meta charset=utf-8><title>VAVEYLA yönetim</title><h2>VAVEYLA Node.js oyuncu yönetimi</h2><label>Yönetici anahtarı <input id=token type=password autocomplete=off></label><button id=load>Oyuncuları getir</button><pre id=output></pre><form id=form><input id=character type=number min=1 placeholder="Karakter ID" required><input id=amount type=number min=0 max=2147483647 placeholder="Elmas" required><input id=reason placeholder="Açıklama" required><button>Kaydet</button></form><script>async function request(url,body){const r=await fetch(url,{method:body?'POST':'GET',headers:{'X-Admin-Token':token.value,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});output.textContent=JSON.stringify(await r.json(),null,2)}load.onclick=()=>request('/api/admin/players');form.onsubmit=e=>{e.preventDefault();request('/api/admin/players/'+Number(character.value)+'/diamonds',{amount:Number(amount.value),reason:reason.value})}</script>`;

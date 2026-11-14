import {runtimeCatalog} from "./runtime-catalog.js";
import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { Store } from "./store.js";
import { Game } from "./game.js";
import { Assets } from "./assets.js";
import { Session } from "./session.js";
import { httpHandler, strictJSON, json } from "./http.js";
import { GameError, need, fields, mono } from "./util.js";
export class App {
  constructor({
    database,
    host = "127.0.0.1",
    httpPort = 8080,
    wartunePort = 8081,
    wsPort = 8765,
    clientRoot = null,
    assetRoot = null,
    adminToken = process.env.VAVEYLA_ADMIN_TOKEN ?? null,
    backupExisting = true,
    clock,
  } = {}) {
    this.version = "1.5.0";
    Object.assign(this, {
      host,
      httpPort,
      wartunePort,
      wsPort,
      adminToken,
      backupExisting,
    });
    this.store = new Store(database, { ...(clock ? { clock } : {}) });
    this.game = new Game(this.store);
    this.assets = new Assets(clientRoot, assetRoot);
    const sourceCache=new Map();this.game.sourceCatalog=name=>{if(!sourceCache.has(name))sourceCache.set(name,runtimeCatalog(this.assets,name));return sourceCache.get(name);};
    this.diagnostics = null;
    this.sockets = new Set();
    this.sessions = new Set();
    this.unsupported = new Map();
    this.assetErrors = new Map();
    this.timers = new Map();
    this.servers = [];
    this.wsServers = [];
    this.closed = false;
  }
  async start() {
    try {
      await this.store.initialize({ backupExisting: this.backupExisting });
      this.httpServer = http.createServer(httpHandler(this));
      this.httpPort = await this.listen(this.httpServer, this.httpPort);
      this.warServer = http.createServer((req, res) => {
        res.writeHead(426);
        res.end("WebSocket required");
      });
      this.wartunePort = await this.listen(this.warServer, this.wartunePort);
      this.jsonServer = http.createServer((req, res) =>
        json(res, 404, {
          error: { code: "not_found", message: "WebSocket required" },
        }),
      );
      this.wsPort = await this.listen(this.jsonServer, this.wsPort);
      const war = new WebSocketServer({
          server: this.warServer,
          path: "/ws",
          perMessageDeflate: false,
          maxPayload: 1048576,
        }),
        dev = new WebSocketServer({
          server: this.jsonServer,
          path: "/ws",
          perMessageDeflate: false,
          maxPayload: 65536,
        });
      this.wsServers.push(war, dev);
      war.on("connection", (ws) => this.wartune(ws));
      dev.on("connection", (ws) => this.development(ws));
      return this;
    } catch (e) {
      await this.close();
      throw e;
    }
  }
  listen(server, port) {
    this.servers.push(server);
    return new Promise((resolve, reject) => {
      const error = (e) => reject(e);
      server.once("error", error);
      server.listen(port, this.host, () => {
        server.off("error", error);
        resolve(server.address().port);
      });
    });
  }
  track(ws) {
    this.sockets.add(ws);
    ws.on("error", () => {});
    ws.on("close", () => {
      this.sockets.delete(ws);
      clearTimeout(this.timers.get(ws));
      this.timers.delete(ws);
    });
  }
  wartune(ws) {
    this.track(ws);
    const session = new Session(this);
    this.sessions.add(session);
    ws.on("close", () => this.sessions.delete(session));
    let last = mono();
    const send = (rows) => {
        for (const raw of rows) {
          if (ws.readyState !== WebSocket.OPEN) return;
          need(ws.bufferedAmount <= 8388608, "send_buffer_limit");
          ws.send(session.sender.encrypt(raw));
        }
      },
      fail = (e) => {
        console.info(
          "wartune_session_rejected reason=" +
            (e.code ?? "internal_error") +
            " stage=" +
            (session.encounter?.stage ?? "login"),
        );
        if (ws.readyState === WebSocket.OPEN)
          ws.close(
            e.status === 401 ? 1008 : e instanceof GameError ? 1002 : 1011,
            "Local session rejected",
          );
      };
    session.deliver = (rows) => {
      try {
        send(session.sendable(rows));
      } catch (e) {
        fail(e);
      }
    };
    const arm = () => {
      clearTimeout(this.timers.get(ws));
      if (ws.readyState !== WebSocket.OPEN || this.closed) return;
      const due = session.nextDue(),
        idle =
          (session.state === "gateway_active" ? 180 : 60) - (mono() - last),
        delay = Math.max(0, Math.min(idle, due == null ? 180 : due - mono()));
      this.timers.set(
        ws,
        setTimeout(
          () => {
            try {
              if (
                mono() - last >=
                (session.state === "gateway_active" ? 180 : 60)
              ) {
                ws.close(1008, "Receive timeout");
                return;
              }
              if (
                session.state === "gateway_active" &&
                session.nextDue() != null &&
                mono() >= session.nextDue()
              ) {
                // VAVEYLA_FIX_INLINE_160
                const fighting =
                  ["running", "finishing"].includes(
                    session.encounter?.stage
                  );
                const output = session.tick();
                if (fighting && output.length)
                  last = mono();
                send(output);
              }
              arm();
            } catch (e) {
              fail(e);
            }
          },
          Math.ceil(delay * 1000),
        ),
      );
    };
    ws.on("message", (raw, isBinary) => {
      try {
        need(isBinary, "binary_required");
        last = mono();
        session.reader.append(Buffer.from(raw));
        let packet;
        while ((packet = session.reader.next())) {
          send(session.handle(packet));
          if (session.close) {
            ws.close(...session.close);
            return;
          }
        }
        arm();
      } catch (e) {
        fail(e);
      }
    });
    arm();
  }
  push(ids, builder, exclude = null) {
    const targets = new Set(ids);
    for (const session of this.sessions) {
      if (
        session === exclude ||
        session.state !== "gateway_active" ||
        !targets.has(session.account.id)
      )
        continue;
      try {
        this.store.gateway(session.account.id, session.sessionHash);
        const r = this.store.role(session.account.id);
        if (r) session.deliver(builder(r));
      } catch (e) {
        console.info(
          "live_update_rejected reason=" + (e.code ?? "internal_error"),
        );
      }
    }
  }
  chatBroadcast(origin, body, scope, recipient) {
    const ids = [];
    for (const session of this.sessions) {
      if (session === origin || session.state !== "gateway_active") continue;
      const r = this.store.role(session.account.id);
      if (!r) continue;
      const allowed =
        body.channel === 10 ||
        (body.channel === 20 && r.player_id === recipient) ||
        (body.channel === 5 &&
          scope === "guild:" + this.game.membership(r)?.guild_id) ||
        (body.channel === 8 &&
          scope === "map:" + session.encounter?.document.map_id);
      if (allowed) ids.push(r.player_id);
    }
    this.push(ids, () => [[83, "chat.ChatChannelMsg", body]], origin);
  }
  development(ws) {
    this.track(ws);
    let token = null;
    ws.on("message", (raw, isBinary) => {
      let id = null;
      try {
        need(!isBinary, "unsupported_binary");
        const request = strictJSON(raw.toString("utf8"));
        need(
          request && typeof request === "object" && !Array.isArray(request),
          "invalid_envelope",
        );
        need(
          Object.keys(request).every((k) => ["id", "type", "data"].includes(k)),
          "invalid_envelope",
        );
        id = request.id;
        need(
          typeof id === "string" && id.trim() && id.length <= 64,
          "invalid_id",
        );
        const data = request.data ?? {};
        need(
          data && typeof data === "object" && !Array.isArray(data),
          "invalid_data",
        );
        let out;
        if (request.type === "ping") out = { server_time: this.store.clock() };
        else if (request.type === "auth") {
          const a = this.store.authenticate(data.token);
          token = data.token;
          const c = this.store.character(a.id);
          out = { account: a, character: c, needs_character: !c };
        } else {
          const a = this.store.authenticate(token);
          if (request.type === "character.list") {
            const c = this.store.character(a.id);
            out = { characters: c ? [c] : [] };
          } else if (request.type === "character.create") {
            const icon = { warrior: 1, archer: 2, mage: 3 }[data.archetype];
            out = {
              character: this.store.createRole(a.id, data.name, 1, icon),
            };
          } else if (request.type === "game.state") {
            fields(data, []);
            out = this.game.snapshot(a.id);
          } else if (request.type === "game.notifications") {
            fields(data, ["after", "limit"]);
            out = {
              notifications: this.game.tx(a.id, (r) =>
                this.game.notices(r, data.after ?? 0, data.limit ?? 100),
              ),
            };
          } else if (request.type === "game.action") {
            fields(data, ["operation", "request_id", "data"]);
            out = this.game.action(
              a.id,
              data.operation,
              data.data,
              data.request_id,
            );
          } else if (request.type === "game.bootstrap") {
            fields(data, []);
            const c = this.store.character(a.id);
            need(c, "character_required");
            const view = this.game.snapshot(a.id);
            out = {
              character: c,
              inventory: view.inventory,
              quests: view.quests,
              server_time: this.store.clock(),
              data_version: "vaveyla-dev-1",
            };
          } else throw new GameError("unsupported_message_type");
        }
        ws.send(
          JSON.stringify({ id, type: request.type, ok: true, data: out }),
        );
      } catch (e) {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(
            JSON.stringify({
              id: typeof id === "string" ? id : null,
              ok: false,
              error: {
                code: e.code ?? "invalid_json",
                message:
                  e instanceof GameError ? e.message : "Geçerli JSON gerekli.",
              },
            }),
          );
      }
    });
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    for (const ws of this.sockets) ws.terminate();
    await Promise.all(
      this.wsServers.map(
        (w) => new Promise((resolve) => w.close(() => resolve())),
      ),
    );
    await Promise.all(
      this.servers.map(
        (s) => new Promise((resolve) => s.close(() => resolve())),
      ),
    );
    this.store.close();
  }
}

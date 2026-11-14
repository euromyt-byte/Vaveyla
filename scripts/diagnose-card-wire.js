// Isolated protocol probe. It never opens the installed player's database.
import fs from "node:fs";
import os from "node:os";
import vm from "node:vm";
import assert from "node:assert/strict";
import { once } from "node:events";
import WebSocket from "ws";
import { App } from "../src/app.js";
import { Cipher, packet, unpack } from "../src/wire.js";
import { encode, decode } from "../src/pb.js";

const dir = fs.mkdtempSync(os.tmpdir() + "/vaveyla-card-wire-");
let app, ws;
try {
  app = await new App({ database: dir + "/probe.sqlite3", httpPort: 0, wartunePort: 0, wsPort: 0 }).start();
  const account = app.store.register("card_probe", "local-probe-password-123");
  app.store.createRole(account.id, "CardProbe", 1, 1);
  const login = app.store.login(account.username, "local-probe-password-123");
  const key = "c".repeat(32);
  app.store.issueTicket(account.id, key, login.token, "local");
  const queue = [], readers = [];
  ws = new WebSocket("ws://127.0.0.1:" + app.wartunePort + "/ws");
  ws.on("message", data => { const body = Buffer.from(data); const reader = readers.shift(); reader ? reader(body) : queue.push(body); });
  const readRaw = () => queue.length ? Promise.resolve(queue.shift()) : new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Protocol probe timed out")), 10000);
    readers.push(body => { clearTimeout(timer); resolve(body); });
  });
  await once(ws, "open");
  const keys = Buffer.from([1, 3, 5, 7, 9, 11, 13, 15]);
  const incoming = new Cipher(keys), outgoing = new Cipher(keys);
  ws.send(new Cipher().encrypt(packet(20001, encode("player.LoginReqMsg", {playerId:account.id,key,ekeys:[...keys]}))));
  for (const expected of [3841, 3, 537, 4410]) assert.equal(unpack(incoming.decrypt(await readRaw())).code, expected);

  let sent;
  const context = vm.createContext({
    gl: class {},
    Bn: { U_C_CAMPAIGN_TAKE_CARD: 5122, U_C_CAMPAIGN_FINISH: 5180 },
    vZ: { Instance: { send(code, body) { sent = {code, body: JSON.parse(JSON.stringify(body))}; } } },
  });
  vm.runInContext(fs.readFileSync(new URL("../test/fixtures/client-card-out.js", import.meta.url), "utf8"), context);
  new context.SourceCardOut().sendCampaignCard(false, 2, account.id);
  assert.equal(sent.code, 5122);
  const body = encode("campaign.CampaignReqMsg", sent.body);
  const decoded = decode("campaign.CampaignReqMsg", body);
  assert.equal(decoded.paraInt1, account.id);
  assert.equal(decoded.paraInt2, 2);
  assert.equal(decoded.paraBool1, false);
  const before = app.store.get("select count(*) n from game_reward_events").n;
  ws.send(outgoing.encrypt(packet(sent.code, body)));
  ws.send(outgoing.encrypt(packet(20008)));
  let response, rejection;
  do {
    response = unpack(incoming.decrypt(await readRaw()));
    if (response.code === 83) rejection = decode("chat.ChatChannelMsg", response.payload);
  } while (response.code !== 4234);
  assert.equal(app.unsupported.has(5122), false);
  assert.ok(rejection?.encodeMsg);
  assert.equal(app.store.get("select count(*) n from game_reward_events").n, before);
  console.log(JSON.stringify({ transport:"real_encrypted_websocket", client_sender:"extracted_original_method_without_pending_reward", command:sent.code, request:sent.body, heartbeat:response.code, server_route:"implemented_rejects_unearned_reward", rejection:rejection.encodeMsg, new_reward_events:0, android_visual_test:false }, null, 2));
} finally {
  ws?.terminate();
  await app?.close();
  fs.rmSync(dir, {recursive:true});
}

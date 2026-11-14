import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { fixture, enter } from "./network.test.js";
import { decode } from "../src/pb.js";
import { unpack } from "../src/wire.js";
async function next(c, code) {
  for (let i = 0; i < 30; i++) {
    const p = unpack(c.in.decrypt(await c.raw()));
    if (p.code === code) return p;
  }
  throw Error("expected " + code);
}
test("real encrypted chat routes private and guild messages only to authorized sessions", async (t) => {
  const app = await fixture(t),
    people = [];
  for (let i = 0; i < 3; i++) {
    const a = app.store.register("chat_" + i, "chat-password-123");
    app.store.createRole(a.id, "Chat " + i, 1, 1);
    app.store.run(
      "update characters set level=80,gold=2000000 where account_id=?",
      a.id,
    );
    const token = app.store.login("chat_" + i, "chat-password-123").token,
      key = crypto.randomBytes(16).toString("hex");
    app.store.issueTicket(a.id, key, token, "local");
    people.push({ a, c: await enter(app, a, key) });
  }
  const [left, right, outside] = people;
  left.c.send(15005, "chat.ChatChannelMsg", {
    channel: 20,
    otherId: right.a.id,
    encodeMsg: "Özel mesaj",
    name: "FORGED",
  });
  const own = decode("chat.ChatChannelMsg", (await next(left.c, 83)).payload),
    received = decode(
      "chat.ChatChannelMsg",
      (await next(right.c, 83)).payload,
    );
  assert.equal(received.name, "Chat 0");
  assert.equal(received.otherId, left.a.id);
  assert.equal(own.encodeMsg, received.encodeMsg);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(outside.c.queue.length, 0);
  const guild = app.game.action(
    left.a.id,
    "guild.create",
    { name: "Chat Guild" },
    "guild",
  ).result;
  app.game.action(right.a.id, "guild.apply", { guild_id: guild.id }, "apply");
  app.game.action(
    left.a.id,
    "guild.application",
    { character_id: app.store.role(right.a.id).id, accept: true },
    "accept",
  );
  left.c.send(15005, "chat.ChatChannelMsg", {
    channel: 5,
    encodeMsg: "Lonca mesajı",
  });
  assert.equal(
    decode("chat.ChatChannelMsg", (await next(left.c, 83)).payload).channel,
    5,
  );
  assert.equal(
    decode("chat.ChatChannelMsg", (await next(right.c, 83)).payload).encodeMsg,
    "Lonca mesajı",
  );
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(outside.c.queue.length, 0);
  outside.c.send(25024, "chat.ChatChannelMsg", {
    channel: 2,
    encodeMsg: "Fake server notice",
  });
  const reject = decode(
    "chat.ChatChannelMsg",
    (await next(outside.c, 83)).payload,
  );
  assert.equal(reject.channel, 2);
  assert.notEqual(reject.encodeMsg, "Fake server notice");
  left.c.send(15023, "chat.ChatFriendMsg", {
    fromId: left.a.id,
    toId: right.a.id,
    encodeMsg: "Gerçek IM protokolü",
    fromNick: "FORGED",
  });
  const im = decode("chat.ChatFriendMsg", (await next(right.c, 4231)).payload);
  assert.equal(im.fromNick, "Chat 0");
  assert.equal(im.result, 1);
  assert.equal(
    decode("chat.ChatFriendMsg", (await next(left.c, 4236)).payload).toId,
    right.a.id,
  );
  right.c.send(15038, "simple.InfoReqMsg", { otherId: left.a.id, from: 1 });
  assert.equal(
    decode("simple.InfoRspMsg", (await next(right.c, 4256)).payload).info
      .nickName,
    "Chat 0",
  );
  assert.equal(
    app.game.tx(outside.a.id, (r) => app.game.chatHistory(r, left.a.id)).length,
    0,
  );
  for (const p of people) p.c.ws.close();
});

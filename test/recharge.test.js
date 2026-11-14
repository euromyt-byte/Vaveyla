import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { coreFixture } from "./core.test.js";
import { freeRechargeCatalog } from "../src/rules-recharge.js";
import { jsonFile } from "../src/util.js";
test("free source diamond packages credit exact amounts and bound extras with transaction replay protection", async (t) => {
  const { s, g, a } = await coreFixture(t);
  g.snapshot(a.id);
  let total = 0,
    bound = 0;
  for (const p of freeRechargeCatalog.packages) {
    const id = "free:" + p.ProductId,
      args = { product_id: p.ProductId, count: 1 },
      one = g.action(a.id, "recharge.free", args, id);
    assert.deepEqual(g.action(a.id, "recharge.free", args, id), one);
    total += Number(p.Para2);
    bound += p.FreePoint;
  }
  assert.equal(g.snapshot(a.id).player.diamonds, total);
  assert.equal(g.snapshot(a.id).resources.bound_diamonds, bound);
  assert.throws(() =>
    g.action(a.id, "recharge.free", { product_id: "fake", count: 1 }, "fake"),
  );
  assert.throws(() =>
    g.action(
      a.id,
      "recharge.free",
      { product_id: freeRechargeCatalog.packages[0].ProductId, count: -1 },
      "negative",
    ),
  );
  assert.equal(g.snapshot(a.id).player.diamonds, total);
});
test("free recharge browser helper uses own token, deduplicates active clicks and retries the same purchase ID", async () => {
  let resolve,
    requests = [];
  const ctx = {
    sessionStorage: { getItem: () => JSON.stringify({ token: "own-token" }) },
    crypto: { randomUUID: () => String(requests.length + 1) },
    window: {},
    JSON,
    Map,
    Error,
    fetch: (url, opt) => {
      requests.push({ url, opt });
      return new Promise((r) => (resolve = r));
    },
  };
  vm.createContext(ctx);
  const code = fs.readFileSync(
    new URL("../src/client-recovery.js", import.meta.url),
    "utf8",
  );
  vm.runInContext(code.slice(code.indexOf("// Local free diamond")), ctx);
  const f = ctx.window.VAVEYLA_FREE_RECHARGE,
    p = freeRechargeCatalog.packages[0].ProductId;
  const one = f(p),
    duplicate = f(p);
  assert.equal(one, duplicate);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].opt.headers.Authorization, "Bearer own-token");
  resolve({ ok: false, json: async () => ({ message: "retry" }) });
  await assert.rejects(one);
  const retry = f(p);
  assert.equal(
    JSON.parse(requests[1].opt.body).request_id,
    JSON.parse(requests[0].opt.body).request_id,
  );
  resolve({ ok: true, json: async () => ({ ok: true }) });
  await retry;
  const next = f(p);
  assert.notEqual(
    JSON.parse(requests[2].opt.body).request_id,
    JSON.parse(requests[1].opt.body).request_id,
  );
  resolve({ ok: true, json: async () => ({ ok: true }) });
  await next;
});

import { fixture as networkFixture, http } from "./network.test.js";
test("free recharge HTTP endpoint requires authentication and cannot credit another character", async (t) => {
  const app = await networkFixture(t),
    a = app.store.register("free_http", "free-http-password"),
    b = app.store.register("other_http", "other-http-password");
  app.store.createRole(a.id, "FreeHttp", 1, 1);
  app.store.createRole(b.id, "OtherHttp", 1, 1);
  const data = {
    request_id: "free-http",
    data: { product_id: "wartuneh5.gem.pay0.99", count: 1 },
  };
  assert.equal(
    (await http(app, "POST", "/api/game/recharge.free", data)).status,
    401,
  );
  const token = app.store.login(a.username, "free-http-password").token;
  const result = await http(
    app,
    "POST",
    "/api/game/recharge.free",
    data,
    token,
  );
  assert.equal(result.status, 200);
  assert.equal(app.store.role(a.id).diamonds, 100);
  assert.equal(app.store.role(b.id).diamonds, 0);
  assert.equal(
    (await http(app, "POST", "/api/game/recharge.free", data, token)).status,
    200,
  );
  assert.equal(app.store.role(a.id).diamonds, 100);
  const forged = await http(
    app,
    "POST",
    "/api/game/recharge.free",
    {
      request_id: "forged",
      data: { ...data.data, character_id: app.store.role(b.id).id },
    },
    token,
  );
  assert.equal(forged.status, 409);
  assert.equal(app.store.role(b.id).diamonds, 0);
});

test("original recharge getter shows free diamond price even when catalog comes from packed config", () => {
  const patch = jsonFile("client-patches.json").patches.find(([s]) =>
    s.startsWith("getRechargeTempleteByProductID"),
  );
  const prototype = {
      get label() {
        return this.ProductId;
      },
    },
    product = Object.assign(Object.create(prototype), {
      ProductType: 1,
      ProductId: "wartuneh5.gem.pay0.99",
      MoneyNum: "0.99",
      MoneyType: "USD",
      VIPEx: 100,
    });
  const ctx = {
    I_t: { Instance: { getTemplateByID: () => product } },
    u_t: { t_s_recharge: 1 },
  };
  vm.createContext(ctx);
  const getter = vm.runInContext("({" + patch[1] + "})", ctx);
  const shown = getter.getRechargeTempleteByProductID(product.ProductId);
  assert.equal(shown.MoneyNum, "0");
  assert.equal(shown.MoneyType, "");
  assert.equal(shown.VIPEx, 100);
  assert.equal(shown.label, product.ProductId);
  assert.equal(product.MoneyNum, "0.99");
});

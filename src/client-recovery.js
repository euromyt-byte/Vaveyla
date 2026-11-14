(() => {
  "use strict";
  if (window.__vaveylaRecovery || !window.WebSocket) return;
  window.__vaveylaRecovery = true;
  const Native = window.WebSocket,
    key = "VAVEYLA_RECOVERY_ATTEMPTS";
  let pending = false;
  function state() {
    try {
      const x = JSON.parse(sessionStorage.getItem(key) || "{}");
      return Date.now() - x.at < 120000 ? x : { at: Date.now(), count: 0 };
    } catch (_) {
      return { at: Date.now(), count: 0 };
    }
  }
  async function recover() {
    if (pending) return;
    pending = true;
    try {
      const session = JSON.parse(
        sessionStorage.getItem("VAVEYLA_LOCAL_SESSION") || "null",
      );
      if (
        !session ||
        typeof session.token !== "string" ||
        !session.token ||
        session.token.length > 512 ||
        /[\r\n]/.test(session.token)
      )
        return;
      const tries = state();
      if (tries.count >= 3) return;
      tries.count++;
      sessionStorage.setItem(key, JSON.stringify(tries));
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch("/api/me", {
          headers: { Authorization: "Bearer " + session.token },
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (response.status === 401) {
          location.assign("/local-account");
          return;
        }
        if (response.ok) {
          location.reload();
          return;
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (_) {
    } finally {
      pending = false;
    }
  }
  window.WebSocket = new Proxy(Native, {
    construct(Target, args) {
      const socket = Reflect.construct(Target, args);
      let url;
      try {
        url = new URL(args[0], location.href);
      } catch (_) {
        return socket;
      }
      if (
        !["/", "/ws"].includes(url.pathname) ||
        ![location.hostname, "127.0.0.1", "localhost", "[::1]"].includes(
          url.hostname,
        )
      )
        return socket;
      let stable;
      socket.addEventListener("open", () => {
        stable = setTimeout(() => sessionStorage.removeItem(key), 30000);
      });
      socket.addEventListener("close", (event) => {
        clearTimeout(stable);
        if ([1001, 1002, 1006, 1008, 1011].includes(event.code))
          setTimeout(recover, 1500);
      });
      return socket;
    },
  });
})();

// Local free diamond catalog; no payment SDK, redirect or external transaction.
(() => {
  const pending = new Map(),
    requests = new Map();
  window.VAVEYLA_FREE_RECHARGE = (productId, count = 1, otherId = 0, activeType = 0) => {
    const key = JSON.stringify([productId, count, otherId, activeType]);
    if (pending.has(key)) return pending.get(key);
    const run = (async () => {
      const session = JSON.parse(
        sessionStorage.getItem("VAVEYLA_LOCAL_SESSION") || "null",
      );
      if (!session?.token)
        throw Error("Elmas almak için /local-account üzerinden giriş yap.");
      let id = requests.get(key);
      if (!id) {
        id = crypto.randomUUID();
        requests.set(key, id);
      }
      const response = await fetch("/api/game/recharge.free", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + session.token,
        },
        body: JSON.stringify({
          request_id: id,
          data: { product_id: productId, count, other_id: otherId, active_type: activeType },
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(
          result.error?.message || result.message || "Paket alınamadı.",
        );
      requests.delete(key);
      return result;
    })();
    pending.set(key, run);
    run.finally(() => pending.delete(key)).catch(() => {});
    return run;
  };
})();

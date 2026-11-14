(() => {
  "use strict";
  const pageErrors = [],
    resourceErrors = [];
  const names = new Set([
    "Error",
    "TypeError",
    "ReferenceError",
    "SyntaxError",
    "RangeError",
    "URIError",
    "EvalError",
    "AggregateError",
  ]);
  const integer = (value, max = 1000000) =>
    Number.isSafeInteger(value) && value >= 0 && value <= max ? value : null;
  function remember(list, item) {
    if (
      list.length < 8 &&
      !list.some((old) => JSON.stringify(old) === JSON.stringify(item))
    )
      list.push(item);
  }
  function errorLocation(error, event) {
    let name = "Error",
      source = null,
      line = null,
      column = null;
    try {
      if (error && names.has(error.name)) name = error.name;
      if (event && event.filename) {
        const filename = new URL(event.filename, location.href).pathname
          .split("/")
          .pop();
        if (/^[A-Za-z0-9_.-]{1,93}\.js$/.test(filename)) {
          source = filename;
          line = integer(event.lineno, 20000000);
          column = integer(event.colno, 20000000);
        }
      }
      if (!source && error && typeof error.stack === "string") {
        const match = error.stack.match(
          /(?:^|[/(])([A-Za-z0-9_.-]{1,93}\.js)(?:[?#][^:\n)]*)?:(\d+):(\d+)/m,
        );
        if (match) {
          source = match[1];
          line = integer(Number(match[2]), 20000000);
          column = integer(Number(match[3]), 20000000);
        }
      }
    } catch (_) {}
    return { name, source, line, column };
  }
  window.addEventListener(
    "error",
    (event) => {
      try {
        const target = event.target;
        if (
          target &&
          target !== window &&
          (target.currentSrc || target.src || target.href)
        ) {
          const url = new URL(
            target.currentSrc || target.src || target.href,
            location.href,
          );
          const path = url.pathname.replace(/^\//, "");
          if (
            url.origin === location.origin &&
            path.length <= 180 &&
            /^res\/[A-Za-z0-9_./-]+$/.test(path) &&
            !path.split("/").some((part) => part.startsWith("."))
          )
            remember(resourceErrors, path);
        } else remember(pageErrors, errorLocation(event.error, event));
      } catch (_) {}
    },
    true,
  );
  window.addEventListener("unhandledrejection", (event) => {
    try {
      remember(
        pageErrors,
        errorLocation(
          typeof event.reason === "object" ? event.reason : null,
          null,
        ),
      );
    } catch (_) {}
  });
  function snapshot() {
    const state = {
      cmd_present: false,
      main_node: null,
      sub_node: null,
      node10_present: null,
      node10_trigger: null,
      node10_skip: null,
      node10_finish: null,
      sub_node_index: null,
      common_conditions: null,
      scene_entered: null,
      read_failed: false,
    };
    const read = (func, fallback = null) => {
      try {
        return func();
      } catch (_) {
        state.read_failed = true;
        return fallback;
      }
    };
    const cmd = read(() => window.cmd);
    state.cmd_present = !!cmd;
    if (cmd) {
      state.main_node = read(() => integer(cmd.curExeMainNodeId));
      state.sub_node = read(() => integer(cmd.curExeSubNodeId));
      if (typeof cmd.checkCommonCons === "function")
        state.common_conditions = read(() => !!cmd.checkCommonCons());
      const node = read(() =>
        typeof cmd.getNodeById === "function" ? cmd.getNodeById(10) : null,
      );
      state.node10_present = !!node;
      if (node) {
        state.sub_node_index = read(() =>
          integer(node.data && node.data.curSubNodeIdx),
        );
        if (typeof node.isTrigger === "function")
          state.node10_trigger = read(() => !!node.isTrigger());
        // isSkip() completes the tutorial node; isFinish() writes its cache.
        // Read their existing data/conditions instead of invoking those methods.
        state.node10_finish = read(
          () =>
            node._isFinish === true ||
            (typeof cmd.finishNodeStr === "string" &&
              cmd.finishNodeStr.split("_").includes("10")),
        );
        if (
          node.data &&
          Array.isArray(node.data.subNodeInfoArr) &&
          node.data.subNodeInfoArr[0] &&
          typeof node.checkConditions === "function"
        ) {
          const first = node.data.subNodeInfoArr[0];
          state.node10_skip = read(
            () =>
              !!node.checkConditions(
                first.skipConditions,
                first.skipConditionParams,
                first.skipConditionInverted,
                first.skipConditionSymbol,
                false,
              ),
          );
        }
      }
    }
    const mediator = read(() =>
      typeof Laya !== "undefined" &&
      Laya.ClassUtils &&
      typeof Laya.ClassUtils.getClass === "function"
        ? Laya.ClassUtils.getClass("NewbieBaseConditionMediator")
        : null,
    );
    if (mediator && typeof mediator.checkInScene === "function")
      state.scene_entered = read(() => !!mediator.checkInScene(3, 10001));
    let battle = null;
    const result = read(() => window.VAVEYLA_BATTLE_RESULT);
    if (
      result &&
      ["loading", "visible", "closed", "timeout", "failed"].includes(
        result.phase,
      ) &&
      [1, 2, 3].includes(result.result)
    )
      battle = { phase: result.phase, result: result.result };
    return {
      schema: 1,
      state,
      page_errors: pageErrors.slice(),
      resource_errors: resourceErrors.slice(),
      battle,
      sky: read(() => typeof window.VAVEYLA_SKY_DIAGNOSTICS === "function" ? window.VAVEYLA_SKY_DIAGNOSTICS() : null),
    };
  }
  function report() {
    try {
      const raw = sessionStorage.getItem("VAVEYLA_LOCAL_SESSION");
      if (!raw) return;
      const session = JSON.parse(raw);
      if (
        !session ||
        typeof session.token !== "string" ||
        !session.token ||
        session.token.length > 512 ||
        /[\r\n]/.test(session.token)
      )
        return;
      const body = JSON.stringify(snapshot());
      if (body.length > 4096) return;
      fetch("/api/client-diagnostics", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + session.token,
        },
        body,
      }).catch(() => {});
    } catch (_) {}
  }
  report();
  setInterval(report, 3000);
})();

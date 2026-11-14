import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { App } from "./app.js";
import { ROOT } from "./util.js";
const { values } = parseArgs({
  options: {
    database: {
      type: "string",
      default: path.join(ROOT, "data/vaveyla.sqlite3"),
    },
    host: { type: "string", default: "127.0.0.1" },
    "http-port": { type: "string", default: "8080" },
    "wartune-port": { type: "string", default: "8081" },
    "ws-port": { type: "string", default: "8765" },
    "client-root": { type: "string" },
    "asset-root": { type: "string" },
    help: { type: "boolean", default: false },
  },
});
if (values.help) {
  console.log(
    "VAVEYLA Node.js24+ bağımsız sunucu\nnode src/main.js --database FILE --client-root PREPARED_CLIENT [--asset-root ORIGINAL_GAME]",
  );
  process.exit(0);
}
if (+process.versions.node.split(".")[0] < 24) {
  console.error("Node.js24+ gerekli. Termux: pkg install nodejs-lts");
  process.exit(1);
}
const ports = ["http-port", "wartune-port", "ws-port"].map((k) =>
  Number(values[k]),
);
if (
  ports.some((p) => !Number.isInteger(p) || p < 1 || p > 65535) ||
  new Set(ports).size !== 3
) {
  console.error("Üç farklı,1–65535 arası port gerekli.");
  process.exit(1);
}
const app = new App({
  database: values.database,
  host: values.host,
  httpPort: ports[0],
  wartunePort: ports[1],
  wsPort: ports[2],
  clientRoot: values["client-root"],
  assetRoot: values["asset-root"],
});
try {
  await app.start();
  console.log("VAVEYLA Node.js " + app.version);
  if (app.store.backupPath)
    console.log("SQLite backup: " + app.store.backupPath);
  console.log(
    "HTTP http://" + app.host + ":" + app.httpPort + "/local-account",
  );
  console.log("Wartune ws://" + app.host + ":" + app.wartunePort + "/ws");
  console.log("JSON WS ws://" + app.host + ":" + app.wsPort + "/ws");
  console.log("Wartune compatibility UNVERIFIED; Android device test NOT_RUN");
  const pidfile = path.join(ROOT, "data/node-server.pid.json");
  fs.mkdirSync(path.dirname(pidfile), { recursive: true });
  fs.writeFileSync(
    pidfile,
    JSON.stringify({ pid: process.pid, entry: path.join(ROOT, "src/main.js") }),
    { mode: 0o600 },
  );
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await app.close();
    try {
      const p = JSON.parse(fs.readFileSync(pidfile));
      if (p.pid === process.pid) fs.unlinkSync(pidfile);
    } catch {}
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
} catch (e) {
  console.error(
    e.code === "EADDRINUSE"
      ? "Port kullanımda. Eski sunucunun Termux oturumunda Ctrl+C kullan."
      : "Başlatılamadı: " + (e.code ?? e.constructor.name) + " " + e.message,
  );
  process.exitCode = 1;
}

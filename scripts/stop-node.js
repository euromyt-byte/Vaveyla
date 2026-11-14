#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../src/util.js";
const file = path.join(ROOT, "data/node-server.pid.json");
try {
  if (!fs.existsSync(file)) {
    console.log("Kayıtlı Node sunucusu yok. Eski oturum açıksa Ctrl+C kullan.");
    process.exit(0);
  }
  const info = JSON.parse(fs.readFileSync(file)),
    expected = path.join(ROOT, "src/main.js");
  if (
    !Number.isInteger(info.pid) ||
    info.pid <= 1 ||
    info.pid === process.pid ||
    info.entry !== expected
  )
    throw new Error("Sunucu PID kaydı doğrulanamadı.");
  let args;
  try {
    args = fs
      .readFileSync("/proc/" + info.pid + "/cmdline")
      .toString()
      .split("\0")
      .filter(Boolean);
  } catch (e) {
    if (e.code === "ENOENT") {
      fs.unlinkSync(file);
      console.log("Önceki Node sunucusu zaten kapanmış.");
      process.exit(0);
    }
    throw e;
  }
  if (
    !/^node(?:js)?$/.test(path.basename(args[0])) ||
    path.resolve(args[1] ?? "") !== expected
  )
    throw new Error("PID başka bir işleme ait; durdurulmadı.");
  process.kill(info.pid, "SIGINT");
  let finished = false;
  for (let n = 0; n < 50; n++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      process.kill(info.pid, 0);
    } catch {
      finished = true;
      break;
    }
  }
  if (!finished)
    throw new Error("Sunucu kapanmadı; kendi Termux oturumunda Ctrl+C kullan.");
  console.log("Node sunucusu kapandı.");
} catch (e) {
  console.error("Durdurulamadı: " + e.message);
  process.exitCode = 1;
}

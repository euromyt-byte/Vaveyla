#!/usr/bin/env node
// Online SQLite snapshot: never copy a live WAL database as an ordinary file.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { parseArgs } from "node:util";
import { need, jsonFile, GameError } from "../src/util.js";
const { values } = parseArgs({
  options: { source: { type: "string" }, destination: { type: "string" } },
});
try {
  need(
    values.source && values.destination,
    "missing_paths",
    "--source ve --destination gerekli.",
  );
  const source = path.resolve(values.source),
    dest = path.resolve(values.destination);
  need(
    source !== dest && fs.existsSync(source),
    "invalid_source",
    "Mevcut oyuncu veritabanı bulunamadı.",
  );
  need(!fs.lstatSync(source).isSymbolicLink(), "unsafe_source");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  need(
    !fs.existsSync(dest),
    "destination_exists",
    "Node oyuncu veritabanı zaten var; üzerine yazılmadı.",
  );
  const db = new DatabaseSync(source, { readOnly: true });
  let reserved = false;
  try {
    const schema = jsonFile("sqlite-schema.json");
    need(
      db.prepare("PRAGMA user_version").get().user_version === 1,
      "schema_mismatch",
    );
    for (const [name, columns] of Object.entries(schema.core_columns)) {
      const found = new Set(
        db
          .prepare('PRAGMA table_info("' + name + '")')
          .all()
          .map((r) => r.name),
      );
      need(
        columns.every((c) => found.has(c)),
        "schema_mismatch",
      );
    }
    fs.closeSync(fs.openSync(dest, "wx", 0o600));
    reserved = true;
    await backup(db, dest);
    const check = new DatabaseSync(dest, { readOnly: true });
    try {
      need(
        check.prepare("PRAGMA integrity_check").get().integrity_check === "ok",
        "backup_failed",
      );
    } finally {
      check.close();
    }
    reserved = false;
    console.log(
      JSON.stringify({
        status: "copied",
        source,
        destination: dest,
        source_modified: false,
        live_wal_snapshot: true,
      }),
    );
  } finally {
    db.close();
    if (reserved) fs.unlinkSync(dest);
  }
} catch (e) {
  console.error("Kayıt aktarımı tamamlanamadı: " + (e.message ?? e));
  process.exitCode = 1;
}

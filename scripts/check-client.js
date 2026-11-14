#!/usr/bin/env node
import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { Assets } from "../src/assets.js";
import { et, maps, fights } from "../src/catalog.js";
const { values } = parseArgs({
  options: {
    client: { type: "string" },
    report: { type: "string" },
    "all-scenes": { type: "boolean", default: false },
    "require-all-scenes": { type: "boolean", default: false },
  },
});
try {
  console.error("İstemci ve version.zip okunuyor…");
  const assets = new Assets(values.client),
    basic = assets.status();
  console.error("Başlangıç kontrolü tamamlandı.");
  const groups = new Map();
  for (const n of [
    "res/release/UI/BattleResult.fui",
    "res/release/UI/BattleResult_atlas0.png",
  ])
    groups.set(n, [n]);
  if (values["all-scenes"] || values["require-all-scenes"])
    for (const id of Object.keys(et("campaign")).map(Number)) {
      for (const m of maps(id)) {
        for (const ext of ["bin", "dat"]) {
          const n = `res/animation/maps/${m.MapFileId}/${m.MapFileId}.${ext}`;
          groups.set(n, [n]);
        }
        const base = `res/animation/sceneima/${m.BattleGround}/map${m.BattleGround}/${m.BattleGround}`;
        groups.set(base, [base + ".jpg", base + ".ktx"]);
      }
      for (const n of fights(id))
        for (const [field, type, key] of [
          ["Heros", "herotemplate", "ResPath"],
          ["Soldiers", "pawntemplate", "Swf"],
        ])
          for (const pair of n[field].split("|").filter(Boolean)) {
            const name = et(type)[+pair.split(",")[0]][key].toLowerCase();
            for (const ext of ["json", "png"]) {
              const p = `res/animation/swf/${name}/${name}/${name}.${ext}`;
              groups.set(p, [p]);
            }
          }
    }
  const missing = [];
  let checked = 0;
  console.error("Sahne dosyası grupları: " + groups.size);
  for (const names of groups.values()) {
    if (!names.some((n) => assets.locate(n))) missing.push(names);
    checked++;
    if (checked % 25 === 0) console.error(`Kontrol: ${checked}/${groups.size}`);
  }
  const report = {
    ready: basic.ready && !missing.length,
    bootstrap: basic,
    audit_scope:
      values["all-scenes"] || values["require-all-scenes"]
        ? "all_normal_scenes"
        : "startup_and_shared_result_ui",
    required_scene_groups: groups.size,
    missing_scene_files: missing,
    file_presence_only: true,
    android_visual_verified: false,
  };
  if (values.report) {
    const file = path.resolve(values.report);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n", {
      mode: 0o600,
    });
    console.log(
      JSON.stringify({
        bootstrap_ready: basic.ready,
        audit_scope:
          values["all-scenes"] || values["require-all-scenes"]
            ? "all_normal_scenes"
            : "startup_and_shared_result_ui",
        required_scene_groups: groups.size,
        missing_scene_groups: missing.length,
        full_report: file,
        android_visual_verified: false,
      }),
    );
  } else console.log(JSON.stringify(report));
  if (missing.length)
    console.error(
      "Eksik sahne grubu: " +
        missing.length +
        ". Listelenen sahnelerin görüntülenmesi doğrulanamaz.",
    );
  if (!basic.ready || (values["require-all-scenes"] && missing.length))
    process.exitCode = 1;
} catch (e) {
  console.error("İstemci kontrolü tamamlanamadı: " + e.message);
  process.exitCode = 1;
}

#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ROOT, hash, need } from "../src/util.js";
try {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, "SOURCE-MANIFEST.json")),
  );
  need(manifest.algorithm === "sha256", "invalid_manifest");
  for (const [name, expected] of Object.entries(manifest.files)) {
    const file = path.resolve(ROOT, name);
    need(
      file.startsWith(ROOT + path.sep) &&
        fs.realpathSync(file).startsWith(ROOT + path.sep),
      "unsafe_path",
    );
    need(
      hash(fs.readFileSync(file)) === expected,
      "source_mismatch",
      name + " değişmiş veya eksik.",
    );
  }
  console.log(
    "Kaynak dosyaları doğrulandı: " + Object.keys(manifest.files).length,
  );
} catch (e) {
  console.error("Doğrulanamadı: " + e.message);
  process.exitCode = 1;
}

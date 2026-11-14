import {customMountAsset} from "./custom-mount.js";
import fs from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";
import { need, GameError, jsonFile, hash, ROOT } from "./util.js";
const recharge = jsonFile("free-recharge-source.json");
const blocked = new Set([
    "data",
    "logs",
    "server",
    "tokens",
    "backups",
    "backup",
    "node_modules",
    ".git",
  ]),
  manifestCache = new Map();
export function safeName(name) {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    !name.startsWith("/") &&
    !/[\\:\x00]/.test(name) &&
    name
      .split("/")
      .every(
        (p) =>
          p &&
          p !== "." &&
          p !== ".." &&
          !p.startsWith(".") &&
          !blocked.has(p.toLowerCase()) &&
          !/^backups?(?:[._-]|$)/i.test(p),
      )
  );
}
function localFile(root, name) {
  if (!safeName(name)) return null;
  try {
    const p = path.resolve(root, name),
      real = fs.realpathSync(p);
    if (!real.startsWith(root + path.sep) || !fs.statSync(real).isFile())
      return null;
    return real;
  } catch {
    return null;
  }
}
function flatMap(raw) {
  raw = raw.replace(/^\ufeff/, "");
  let p = 0,
    n = 0;
  const out = Object.create(null),
    ws = () => {
      while (/\s/.test(raw[p] ?? "") && p < raw.length) p++;
    },
    read = () => {
      ws();
      need(raw[p] === '"', "invalid_manifest");
      const start = p++;
      let escaped = false;
      while (p < raw.length) {
        const c = raw[p++];
        if (c === '"' && !escaped) return JSON.parse(raw.slice(start, p));
        if (c === "\\" && !escaped) escaped = true;
        else escaped = false;
      }
      throw new GameError("invalid_manifest");
    };
  ws();
  need(raw[p++] === "{", "invalid_manifest");
  ws();
  if (raw[p] === "}") {
    p++;
    return out;
  }
  while (p < raw.length) {
    const k = read();
    need(!Object.hasOwn(out, k) && ++n <= 250000, "invalid_manifest");
    ws();
    need(raw[p++] === ":", "invalid_manifest");
    const v = read();
    out[k] = v;
    ws();
    const c = raw[p++];
    if (c === "}") break;
    need(c === ",", "invalid_manifest");
  }
  ws();
  need(p === raw.length, "invalid_manifest");
  return out;
}
export function manifest(root) {
  let file = localFile(root, "version.zip");
  if (!file) {
    const found = fs.existsSync(root)
      ? fs
          .readdirSync(root)
          .filter((n) => /^version-[0-9a-f]{10}\.zip$/i.test(n))
      : [];
    need(found.length <= 1, "manifest_ambiguous");
    file = found.length ? localFile(root, found[0]) : null;
  }
  if (!file) return null;
  const st = fs.statSync(file),
    key = file + ":" + st.size + ":" + st.mtimeMs;
  if (manifestCache.has(key)) return manifestCache.get(key);
  need(st.size <= 33554432, "manifest_too_large");
  let count = 0,
    total = 0;
  const seen = new Set(),
    files = unzipSync(fs.readFileSync(file), {
      filter: (f) => {
        need(
          ++count <= 16 &&
            f.originalSize <= 33554432 &&
            (total += f.originalSize) <= 33554432 &&
            !seen.has(f.name),
          "manifest_too_large",
        );
        seen.add(f.name);
        return f.name.endsWith(".json");
      },
    });
  const keys = Object.keys(files),
    selected = keys.includes("version.json")
      ? "version.json"
      : keys.length === 1
        ? keys[0]
        : null;
  need(selected, "invalid_manifest");
  const mapping = flatMap(
      new TextDecoder("utf8", { fatal: true }).decode(files[selected]),
    ),
    reverse = new Map();
  for (const [a, b] of Object.entries(mapping))
    if (
      safeName(a) &&
      safeName(b) &&
      path.extname(a).toLowerCase() === path.extname(b).toLowerCase()
    ) {
      if (!reverse.has(b)) reverse.set(b, []);
      reverse.get(b).push(a);
    }
  const result = { mapping, reverse };
  if (manifestCache.size >= 4) manifestCache.clear();
  manifestCache.set(key, result);
  return result;
}
export function resolve(root, name) {
  if (!root || !safeName(name)) return null;
  root = path.resolve(root);
  const exact = localFile(root, name);
  if (exact) return exact;
  const ext = path.extname(name);
  if (!ext) return null;
  let m = null;
  try {
    m = manifest(root);
  } catch (e) {
    if (
      ![
        "manifest_ambiguous",
        "invalid_manifest",
        "manifest_too_large",
      ].includes(e.code)
    )
      throw e;
  }
  const candidates = [m?.mapping[name], ...(m?.reverse.get(name) ?? [])].filter(
      Boolean,
    ),
    found = new Set();
  for (const n of candidates)
    if (path.extname(n).toLowerCase() === ext.toLowerCase()) {
      const f = localFile(root, n);
      if (f) found.add(f);
    }
  need(found.size <= 1, "asset_ambiguous");
  if (found.size) return [...found][0];
  if (m && (Object.hasOwn(m.mapping, name) || m.reverse.has(name))) return null;
  const parent = path.join(root, path.dirname(name)),
    stem = path.basename(name, ext),
    re = new RegExp(
      "^" +
        stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        "-[0-9a-fA-F]{10}" +
        ext.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        "$",
    );
  try {
    for (const n of fs.readdirSync(parent))
      if (re.test(n)) {
        const f = localFile(root, path.join(path.dirname(name), n));
        if (f) found.add(f);
      }
  } catch {}
  need(found.size <= 1, "asset_ambiguous");
  return [...found][0] ?? null;
}
export class Assets {
  constructor(clientRoot = null, assetRoot = null) {
    this.clientRoot = clientRoot ? fs.realpathSync(clientRoot) : null;
    this.assetRoot = assetRoot ? fs.realpathSync(assetRoot) : null;
    this.overlayCache = null;
    this.patch = jsonFile("client-patches.json");
    if (this.clientRoot && !this.assetRoot) {
      const meta = path.join(this.clientRoot, ".vaveyla-prepared.json");
      if (
        fs.existsSync(meta) &&
        !fs.lstatSync(meta).isSymbolicLink() &&
        fs.statSync(meta).size <= 2097152
      ) {
        const v = JSON.parse(fs.readFileSync(meta));
        if (typeof v.source_root === "string" && fs.existsSync(v.source_root))
          this.assetRoot = fs.realpathSync(v.source_root);
      }
    }
  }
  locate(name) {
    const custom=customMountAsset(name);if(custom&&fs.existsSync(custom))return custom;
    const f = this.clientRoot && resolve(this.clientRoot, name);
    return (
      f ??
      (name.startsWith("res/") && this.assetRoot
        ? resolve(this.assetRoot, name)
        : null)
    );
  }
  status() {
    const def = jsonFile("client-required.json"),
      missing = def.files.filter(
        (n) => !this.clientRoot || !resolve(this.clientRoot, n),
      ),
      warnings = [];
    let recognized = false;
    try {
      const entry = this.clientRoot && resolve(this.clientRoot, "gameindex.js");
      recognized =
        !!entry && hash(fs.readFileSync(entry)) === def.gameindex_sha256;
      if (!recognized) warnings.push("gameindex.js sürümü doğrulanamadı.");
      const m = this.clientRoot && manifest(this.clientRoot);
      if (!m || !Object.keys(m.mapping).length)
        warnings.push("Gerçek, dolu version.zip gerekli.");
    } catch (e) {
      warnings.push(e.message);
    }
    return {
      configured: !!this.clientRoot,
      missing,
      warnings,
      ready:
        !!this.clientRoot && recognized && !missing.length && !warnings.length,
      ui_verified: false,
      bootstrap_recognized: recognized,
      supported_version: "release",
    };
  }

  body(name, file) {
    const st = fs.statSync(file);
    need(st.size <= 134217728, "asset_too_large");
    if (name === this.patch.relative ||
        path.basename(file) === path.basename(this.patch.relative)) {
      const key = file + ":" + st.size + ":" + st.mtimeMs;
      if (this.overlayCache?.key === key) return this.overlayCache.body;
      let body = fs.readFileSync(file);
      const sourceHash = hash(body);
      need(
        sourceHash === this.patch.prepared_sha256 ||
          (this.patch.compatible_sha256 ?? []).includes(sourceHash),
        "game_client_version_mismatch",
        "Doğrulanmış hazırlanmış istemci gerekli.",
      );
      let text = body.toString("utf8");
      for (const [old, replacement] of this.patch.patches) {
        need(text.split(old).length === 2, "game_client_version_mismatch");
        text = text.replace(old, replacement);
      }
      body = Buffer.from(text);
      this.overlayCache = { key, body };
      return body;
    }
    let body = fs.readFileSync(file);
    if (
      name === "res/release/config/" + recharge.source ||
      name === "res/release/config/t_s_recharge.json"
    ) {
      need(hash(body) === recharge.source_sha256, "recharge_catalog_mismatch");
      return Buffer.from(
        JSON.stringify({
          t_s_recharge: recharge.rows.map((p) => ({
            ...p,
            MoneyNum: "0",
            MoneyType: "",
            ProductName:
              p.ProductType === 1
                ? p.Para2 + " elmas — Ücretsiz"
                : p.ProductName,
          })),
        }),
      );
    }
    if (name === "index.html") {
      const recovery = fs.readFileSync(
          path.join(ROOT, "src/client-recovery.js"),
          "utf8",
        ),
        marker =
          "<script>" +
          recovery +
          '</script><script src="/vaveyla-client-diagnostics.js"></script>';
      let text = body.toString("utf8"),
        pos = text.toLowerCase().indexOf("</head>");
      body = Buffer.from(
        pos >= 0
          ? text.slice(0, pos) + marker + text.slice(pos)
          : marker + text,
      );
    }
    return body;
  }
}

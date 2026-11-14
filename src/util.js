import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
export const ROOT = path.dirname(import.meta.dirname),
  MAX = 2147483647;
export const jsonFile = (n) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, "data", n), "utf8"));
export class GameError extends Error {
  constructor(code, message = code, status = 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export function need(ok, code, message = code, status = 409) {
  if (!ok) throw new GameError(code, message, status);
}
export function integer(x, min = 0, max = MAX) {
  need(
    Number.isSafeInteger(x) && x >= min && x <= max,
    "invalid_value",
    "Geçerli tam sayı gerekli.",
    400,
  );
  return x;
}
export const hash = (x) => crypto.createHash("sha256").update(x).digest("hex");
export const nonce = (bytes = 16) => crypto.randomBytes(bytes).toString("hex");
export const epoch = () => Math.floor(Date.now() / 1000),
  mono = () => performance.now() / 1000;
export const date = (x) =>
  x == null
    ? "1970-01-01 00:00:00"
    : new Date(x * 1000).toISOString().slice(0, 19).replace("T", " ");
export const clone = structuredClone;
const folds = jsonFile("casefold.json");
export const casefold = (x) =>
  Array.from(x.normalize("NFC"))
    .map((c) => folds[c] ?? c.toLowerCase())
    .join("");
export function canonical(x) {
  return JSON.stringify(sort(x)).replace(
    /[^\x00-\x7f]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}
function sort(x) {
  if (Array.isArray(x)) return x.map(sort);
  if (x && typeof x === "object" && !Buffer.isBuffer(x))
    return Object.fromEntries(
      Object.keys(x)
        .sort()
        .map((k) => [k, sort(x[k])]),
    );
  return x;
}
export function fields(x, allowed) {
  need(
    x &&
      typeof x === "object" &&
      !Array.isArray(x) &&
      Object.keys(x).sort().join("|") === [...allowed].sort().join("|"),
    "invalid_game_fields",
    "İşlem alanları geçersiz.",
    400,
  );
}
export const job = (role) => ((role.icon - 1) % 3) + 1;
export const mage = (role) => job(role) === 3;

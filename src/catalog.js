import { jsonFile, integer, need } from "./util.js";
export const game = jsonFile("wartune_game_data.json"),
  expansion = jsonFile("wartune_expansion_source.json"),
  training = jsonFile("wartune_training_source.json"),
  army = jsonFile("wartune_army_source.json");
export const services = jsonFile("wartune_services_source.json");
const indexes = new Map();
export function table(name, source = game) {
  const key =
    (source === game
      ? "g"
      : source === expansion
        ? "e"
        : source === army
          ? "a"
          : "t") + name;
  if (!indexes.has(key)) {
    const col =
      name === "map" || name === "campaigndata"
        ? "Id"
        : name === "campaign"
          ? "CampaignId"
          : name === "config"
            ? "ConfigName"
            : name === "upgradetemplate" && source === game
              ? "Grades"
              : "TemplateId";
    indexes.set(key, Object.fromEntries(source[name].map((r) => [r[col], r])));
  }
  return indexes.get(key);
}
export const et = (n) => table(n, expansion),
  pt = () => table("pawntemplate", army);
export const group = (name, id) =>
  game[name].filter((r) => r.TemplateId === id);
export const config = (name, fallback = null) =>
  table("config")[name]?.ConfigValue ?? fallback;
export const maps = (cid) =>
  Object.values(et("map"))
    .filter((m) => m.CampaignId === cid)
    .sort((a, b) => a.Index - b.Index || a.Id - b.Id);
export const nodes = (mid) =>
  Object.values(et("campaigndata"))
    .filter((n) => n.CampaignId === mid)
    .sort((a, b) => a.Id - b.Id);
export const fights = (cid) =>
  maps(cid)
    .flatMap((m) => nodes(m.Id))
    .filter((n) => n.NodeState !== 9 && [41, 42].includes(n.MasterType) && (n.Soldiers || n.Heros));
export const title = (r, p = "TemplateName") =>
  r[p + "_tr"] || r[p + "_en"] || String(r.TemplateId ?? r.Id);
export function xpAfter(level, xp, award) {
  integer(xp, 0, Number.MAX_SAFE_INTEGER);
  integer(award, 0, Number.MAX_SAFE_INTEGER);
  const levels = table("upgradetemplate");
  need(levels[level], "xp_unavailable");
  xp += award;
  while (levels[level + 1] && xp >= levels[level + 1].Data)
    xp -= levels[++level].Data;
  return [level, xp];
}
export const SLOTS = {
  101: [0],
  103: [1],
  104: [2],
  106: [3],
  107: [4, 5],
  108: [6, 7],
  109: [8],
  110: [9],
  112: [10],
  111: [11],
  117: [12],
  118: [13],
};

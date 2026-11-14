import { jsonFile } from "./util.js";
export const systemOpenSource = jsonFile("system-open-source.json");
// Publish only implemented entry points. Unlocking an icon is not a substitute
// for implementing its transactions, persistence, combat and source responses.
const supported = new Set([
  103, 101, 10101, 1010101, 10102, 10103, 105, 128, 129, 135, 136, 155,
]);
export function systemOpenPacket(role) {
  const sysId = systemOpenSource.rows
    .filter(
      (r) =>
        supported.has(r.SystemID) &&
        role.level >= Math.max(+r.Grades, +r.ShowGrades) &&
        !r.QuestId &&
        !r.QuestCondition,
    )
    .map((r) => r.SystemID);
  return [537, "systemopen.SystemOpenHashOpenList", { sysId }];
}
export function systemStatus(role) {
  const opened = new Set(systemOpenPacket(role)[2].sysId);
  return systemOpenSource.rows.map((r) => ({
    system_id: r.SystemID,
    name: r.IconName_tr || r.IconName_en || r.Mark,
    required_level: Math.max(+r.Grades, +r.ShowGrades),
    level_met: role.level >= Math.max(+r.Grades, +r.ShowGrades),
    implemented_entry: supported.has(r.SystemID),
    open: opened.has(r.SystemID),
  }));
}

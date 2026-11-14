import { need, integer, job, MAX, GameError } from "./util.js";
import { table, title, SLOTS } from "./catalog.js";
export const inventoryRules = {
  freePosition(r, bag = 1) {
    const used = new Set(
      this.all(
        "select position from game_items where character_id=? and bag=?",
        r.id,
        bag,
      ).map((x) => x.position),
    );
    for (let i = 0; i < (bag === 4 ? 15 : 100); i++) if (!used.has(i)) return i;
    throw new GameError("bag_full", "Çanta dolu.");
  },
  addItem(r, id, count, bound = true) {
    integer(id, 1);
    integer(count, 1);
    const t = table("itemtemplate")[id];
    need(t, "unknown_item");
    const limit = Math.max(1, t.MaxCount);
    for (const row of this.all(
      "select * from game_items where character_id=? and bag=1 and template_id=? and bound=? and count<? order by position",
      r.id,
      id,
      +bound,
      limit,
    )) {
      const add = Math.min(count, limit - row.count);
      this.run("update game_items set count=count+? where id=?", add, row.id);
      count -= add;
      if (!count) return;
    }
    while (count) {
      const n = Math.min(count, limit);
      this.run(
        "insert into game_items(character_id,template_id,bag,position,count,bound) values(?,?,1,?,?,?)",
        r.id,
        id,
        this.freePosition(r),
        n,
        +bound,
      );
      count -= n;
    }
  },
  inventory(r) {
    return this.all(
      "select * from game_items where character_id=? order by bag,position",
      r.id,
    ).map((i) => {const stage=this.forgeStage(r,i.id),grade=this.forgeGrade(r,i.id);return {...i,...(stage?{bag:0,position:stage.slot}:{}),...(grade?{strengthen_grade:grade}:{}),...Object.fromEntries(this.itemGems(r,i.id).map(g=>["join_"+g.slot,g.gem_template_id])),name:title(table("itemtemplate")[i.template_id])};});
  },
  item(r, id) {
    const i = this.get(
      "select * from game_items where id=? and character_id=?",
      integer(id, 1, Number.MAX_SAFE_INTEGER),
      r.id,
    );
    need(i, "item_not_owned", "Eşya bu karaktere ait değil.", 404);
    return i;
  },
  checkDestination(r, i, bag, pos) {
    integer(bag, 1, 6);
    integer(pos, 0, 99);
    need([1, 4, 6].includes(bag), "unsupported_bag");
    if (bag === 4) {
      const t = table("itemtemplate")[i.template_id];
      need(t.MasterType === 1 && i.count === 1, "not_equipment");
      need(SLOTS[t.SonType]?.includes(pos), "invalid_equipment_slot");
      need(r.level >= t.NeedGrades, "equipment_level");
      need(t.Job.includes(0) || t.Job.includes(job(r)), "equipment_class");
      need([2, r.sex].includes(t.Sexs), "equipment_sex");
    }
  },
  moveItem(r, id, bag, pos, count) {
    const i = this.item(r, id);
    integer(count, 1, i.count);
    if(bag===0)return this.stageForge(r,i,pos,count);
    const staged=this.forgeStage(r,id);
    if(staged){
      need(bag===1&&count===i.count,"forge_return_only","Demircilikteki eşyayı önce çantaya geri al.");
      this.run("delete from game_forge_stage where item_id=?",id);
      pos=i.bag===1?i.position:this.freePosition(r);
    }
    this.checkDestination(r, { ...i, count }, bag, pos);
    if (i.bag === bag && i.position === pos)
      return { items: this.inventory(r), changed: false };
    const target = this.get(
      "select * from game_items where character_id=? and bag=? and position=?",
      r.id,
      bag,
      pos,
    );
    if(target)need(!this.forgeStage(r,target.id),"forge_item_reserved");
    if (!target) {
      if (count === i.count)
        this.run(
          "update game_items set bag=?,position=? where id=?",
          bag,
          pos,
          id,
        );
      else {
        this.run("update game_items set count=count-? where id=?", count, id);
        this.run(
          "insert into game_items(character_id,template_id,bag,position,count,bound) values(?,?,?,?,?,?)",
          r.id,
          i.template_id,
          bag,
          pos,
          count,
          i.bound,
        );
      }
    } else if (
      target.template_id === i.template_id &&
      target.bound === i.bound &&
      bag !== 4
    ) {
      need(
        target.count + count <= table("itemtemplate")[i.template_id].MaxCount,
        "stack_limit",
      );
      this.run(
        "update game_items set count=count+? where id=?",
        count,
        target.id,
      );
      if (count === i.count) this.run("delete from game_items where id=?", id);
      else
        this.run("update game_items set count=count-? where id=?", count, id);
    } else {
      need(count === i.count, "partial_swap");
      this.checkDestination(r, target, i.bag, i.position);
      // Swap in place so enhancement metadata remains attached to item IDs.
      const temp=this.get("select coalesce(max(position),0)+1 n from game_items where character_id=? and bag=?",r.id,i.bag).n;
      this.run("update game_items set position=? where id=?",temp,i.id);
      this.run("update game_items set bag=?,position=? where id=?",i.bag,i.position,target.id);
      this.run("update game_items set bag=?,position=? where id=?",bag,pos,i.id);
    }
    return { items: this.inventory(r), changed: true };
  },
  arrangeItems(r, bag) {
    need(!this.get("select 1 from game_forge_stage where character_id=?",r.id),"forge_return_first","Önce demircilikteki eşyaları geri al.");
    need([1, 6].includes(bag), "unsupported_bag");
    const grades=this.all("select e.* from game_item_enhancements e join game_items i on i.id=e.item_id where e.character_id=? and i.bag=?",r.id,bag);
    const gems=this.all("select g.* from game_item_gems g join game_items i on i.id=g.item_id where g.character_id=? and i.bag=?",r.id,bag);
    const groups = new Map();
    for (const row of this.all(
      "select * from game_items where character_id=? and bag=? order by template_id,bound,id",
      r.id,
      bag,
    )) {
      const key = row.template_id + ":" + row.bound;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    this.run(
      "delete from game_items where character_id=? and bag=?",
      r.id,
      bag,
    );
    let pos = 0;
    for (const rows of groups.values()) {
      const id = rows[0].template_id,
        limit = table("itemtemplate")[id].MaxCount;
      let count = rows.reduce((n, r) => n + r.count, 0),
        index = 0;
      while (count) {
        const n = Math.min(count, limit);
        this.run(
          "insert into game_items values(?,?,?,?,?,?,?)",
          rows[index++].id,
          r.id,
          id,
          bag,
          pos++,
          n,
          rows[0].bound,
        );
        count -= n;
      }
    }
    for(const g of gems)this.run("insert into game_item_gems values(?,?,?,?,?)",g.item_id,r.id,g.slot,g.gem_template_id,g.bound);
    for(const e of grades)if(this.get("select 1 from game_items where id=? and character_id=?",e.item_id,r.id))this.run("insert into game_item_enhancements values(?,?,?)",e.item_id,r.id,e.grade);
    return { items: this.inventory(r) };
  },
  sellItem(r, id, count) {
    const i = this.item(r, id);
    integer(count, 1, i.count);
    need([1, 6].includes(i.bag), "item_equipped");
    need(!this.forgeStage(r,id),"forge_item_reserved");
    need(!this.itemGems(r,id).length,"item_has_gems","Önce ekipmandaki mücevherleri çıkar.");
    const gold = integer(table("itemtemplate")[i.template_id].SellGold) * count;
    need(gold <= MAX, "currency_limit");
    if (gold) this.wallet(r, "gold", gold, "sell:" + id);
    if (count === i.count) this.run("delete from game_items where id=?", id);
    else this.run("update game_items set count=count-? where id=?", count, id);
    return { sold_count: count, gold_received: gold, items: this.inventory(r) };
  },
};

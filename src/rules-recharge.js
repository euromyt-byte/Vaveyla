import { jsonFile, integer, need, nonce } from "./util.js";
export const freeRechargeCatalog = jsonFile("free-recharge-source.json");
export const freeRechargeRules = {
  freeRecharge(r, productId, count, otherId=0, activeType=0) {
    need(typeof productId === "string", "invalid_product");
    integer(count, 1, 100);
    const p = freeRechargeCatalog.packages.find(
      (p) => p.ProductId === productId,
    );
    if(!p){
      integer(otherId,0);integer(activeType,0);need(activeType===0,"unsupported_event_package");
      need(freeRechargeCatalog.rows.some(t=>t.ProductId===productId&&[4,6,7].includes(t.ProductType)),"unsupported_free_package","Bu ürün yerel market paketleri arasında değil.");
      const candidates=[...this.sourceRows('giftpackage').values()].filter(t=>t.ProductId===productId);
      const id=otherId||(candidates.length===1?candidates[0].Id:0);need(id>0,"gift_selection_required","Önce almak istediğin paketi seç.");
      return this.claimGiftPackage(r,id,count,productId);
    }
    need(
      p,
      "unsupported_free_package",
      "Bu paketin ödül içeriği henüz tanımlı değil.",
    );
    const diamonds = integer(Number(p.Para2), 1) * count,
      bound = integer(Number(p.FreePoint)) * count;
    const vipXP = integer(Number(p.VIPEx)) * count;
    this.reward(r, "free-recharge:" + nonce(), {
      diamonds,
      resources: { ...(bound ? { bound_diamonds: bound } : {}), vip_xp: vipXP },
    });
    return {
      product_id: productId,
      count,
      diamonds,
      bound_diamonds: bound,
      vip_xp: vipXP,
      real_payment: false,
    };
  },
};

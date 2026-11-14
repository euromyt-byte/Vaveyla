globalThis.Craft0=class{static sendCompose(t,e,i=!1,s=!0){let n=new $q;n.composeId=t,n.composeNum=e,n.autoBuy=i,n.payType=0,s||(n.payType=1),vZ.Instance.send(Bn.U_C_ITEM_COMPOSE,n)}};
globalThis.Craft1=class{static sendUpdateEquip(t,e,i=!0,s=!1){let n=new $q;n.composeId=t,n.composeNum=e,n.payType=1,n.operate=s,i||(n.payType=1),vZ.Instance.send(Bn.U_C_ITEM_COMPOSE,n)}};
globalThis.Craft2=class{static sendSwitch(t,e,i){let s=new $q;s.desItemid=e,s.srcItemid=t,s.count=i,vZ.Instance.send(Bn.C_ITEM_TRANSFORM,s)}};
globalThis.Craft3=class{static sendFashionCompose(t=!1,e=0){let i=new $q;i.count=e,vZ.Instance.send(Bn.C_FASHION_COMPOSE,i)}};
globalThis.SkyRecovery=class{getStartPoint(t,e,i){if(this.getWalkable(t/20,e/20))return new Laya.Point(t,e);let s=this._model.getNeighborII(t/20,e/20);return s.x=20*s.x,s.y=20*s.y,s}};
globalThis.FashionComposeReply=class{__onComposeCallback(t){let e=t.readBody(W$);if(!e.composeResult)return void(this.btn_compose.enabled=!0);let i=dJ.Instance.getItemByPOB(e.pos,e.objectId,e.bagType);this.updateView(i),this.displayObject.event(Oi.COMPOSE_SUCCEED,i),Im.Instance.getFashionBook()}};

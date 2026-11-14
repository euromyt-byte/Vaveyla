// Exact native normal item-use sender.
globalThis.NativeItemUse=class{sendUseItem(t,e=1,i=1,s="",n=0,a=null){let r=new yo;r.pos=t,r.count=e,r.bagType=i,r.battleId=s,r.friendId=n,a&&(r.selectItemInfos=a),vZ.Instance.send(Bn.U_C_BAG_USEITEM,r)}};

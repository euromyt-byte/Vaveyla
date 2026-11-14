// Exact native outgoing method and result dispatcher, patched by the compatibility overlay.
globalThis.NativeForgeSend=class{static sendItemIntensify(){vZ.Instance.send(Bn.U_C_ITEM_STRENGTHEN)}};
globalThis.NativeForgeResult=class{__onIntensifyResult(t){let e=t.readBody(sz);y_t.log("[ForgeCtrl]__onIntensifyResult",e),this.view.refresh(cJ.TabIndex.QH,"IntensifyResult",t)}};

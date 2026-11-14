// Exact methods from the user-supplied bundle; source fingerprint in docs/client-card-evidence.json.
globalThis.SourceCardOut=class{sendCampaignCard(t,e,i){var s=new gl;s.paraInt1=i,s.paraBool1=t,s.paraInt2=e,vZ.Instance.send(Bn.U_C_CAMPAIGN_TAKE_CARD,s)}sendCampaignFinish(t){var e=new gl;e.paraInt1=t,vZ.Instance.send(Bn.U_C_CAMPAIGN_FINISH,e)}};

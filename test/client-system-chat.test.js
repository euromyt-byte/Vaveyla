import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { systemMessage, systemLogMessage } from "../src/packets.js";
import { encode, decode } from "../src/pb.js";

test("original client stores server rewards and warnings in System history during battle", () => {
  const tips=[];
  const ctx=vm.createContext({
    zr:{ALL:0,BIGBUGLE:1,SYSTEM:2,INFO:3,CONSORTIA:5,TEAM:6,ALERT:7,CURRENT:8,WORLD:10,SYS_ALERT:11,NOTICE:12,CROSS_BIGBUGLE:13,GOLD_BIGBUGLE:15,BATTLE_CHAT:16},
    rn:{Instance:{sendNotification(){}}},pi:{},MF:class{},ZH:class{},
    IK:class{commit(){this.htmlText=this.msg;}},
    y_t:{warn(){}},s6:{Instance:{currentType:"battle"}},sa:{BATTLE_SCENE:"battle"},
    G$:{Instance:{loginState:1,currentPlayerModel:{zoneOffset:0}}},
    f_t:{formatTimeZone:t=>new Date(t)},a6:{Instance:{show:t=>tips.push(t)}},Date,
  });
  vm.runInContext(fs.readFileSync(new URL("./fixtures/client-system-chat.js",import.meta.url),"utf8"),ctx);
  const model=new ctx.SourceChatModel(),handler=new ctx.SourceChatHandler();
  model.currentOutChannel=2;
  Object.assign(handler,{model,_model:model,playerInfo:{userId:123},analyzeExpression:m=>m.encodeMsg});
  ctx.HF={Instance:handler};
  const dispatch=([code,name,body])=>{
    const pkt={extend1:0,readBody:()=>decode(name,encode(name,body))};
    if(code===ctx.SourceChatCode)handler.__channelChatHandler(pkt);
    else if(code===ctx.SourceAlertCode)new ctx.SourceAlertHandler().__serverBroadcastHandler(pkt);
  };
  dispatch(systemLogMessage("Ödül alındı: +300 XP, Kılıç ×2",1794375635000));
  dispatch(systemMessage("Bu işlem için yeterli dayanıklılığın yok.",1794375635000));
  assert.equal(model.getChatsByOutputChannel().length,2,"both packets must reach native System history even in battle");
  assert.match(model.getChatsByOutputChannel()[0].msg,/300 XP.*Kılıç ×2/);
  assert.match(model.getChatsByOutputChannel()[1].msg,/dayanıklılığın/);
  assert.equal(tips.length,1,"warnings retain their native centre tip");
  model.currentOutChannel=0;
  assert.equal(model.getChatsByOutputChannel().length,2,"the All filter also includes server notices");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import { jsonFile } from "../src/util.js";
test("claimed quest bits precede successor eligibility and remove stale claimed task without removing repeats", () => {
  const patch = jsonFile("client-patches.json").patches.find(([old]) =>
    old.startsWith("__questUpdateHandler"),
  );
  // Exact original handler; the unchanged tail updates bits too late for eligibility.
  const original =
    "__questUpdateHandler(t){var e=new Array;let i=t.readBody(kB);for(var s=i.quest.length,n=0;n<s;n++){var a,r=i.quest[n],o=this.getTaskByID(r.templateId);if(o){if(o.taskInfo)this._cate.hasTask(o)?this.readTaskInfo(o,r):this.isAvailableTask(o)&&(this.readTaskInfo(o,r),a=!0);else if(o.taskInfo=new SB,this.readTaskInfo(o,r),a=!0,!this.isAvailableTask(o))continue;a&&(o.isNew&&this.checkShowNewTask(o)&&e.push(o),o.addConditionListener(),this._cate.beginChanges(),this._cate.addAccepted(o),this._cate.commit())}}if(this._taskLog.clear(),this._taskLog.writeArrayBuffer(i.states),this._isFirstLoad)return this.requestCanAcceptTask(),void(this._isFirstLoad=!1);this._cate.hasCompletedTask()&&!this._newComplete&&(this._newComplete=!0),a&&this.newTaskHandler(e)}";
  function run(text) {
    let completed = false;
    const stale = { TemplateId: 45, IsRepeat: false, removeEvent() {} },
      repeat = {
        TemplateId: 45,
        IsRepeat: true,
        removeEvent() {
          throw Error("repeat removed");
        },
      },
      next = { TemplateId: 51, addConditionListener() {} };
    const ctx = { kB: {}, SB: class {} };
    vm.createContext(ctx);
    const handler = vm.runInContext(
      "({" + text + "}).__questUpdateHandler",
      ctx,
    );
    const cate = {
      acceptedList: [stale, repeat],
      beginChanges() {},
      commit() {},
      hasTask: (q) => cate.acceptedList.includes(q),
      removeTask(q) {
        this.acceptedList = this.acceptedList.filter((t) => t !== q);
      },
      addAccepted(q) {
        this.acceptedList.push(q);
      },
      hasCompletedTask: () => false,
    };
    handler.call(
      {
        _cate: cate,
        _taskLog: {
          clear() {
            completed = false;
          },
          writeArrayBuffer() {
            completed = true;
          },
        },
        _isFirstLoad: false,
        getTaskByID: () => next,
        IsTaskFinish: () => completed,
        isAvailableTask: () => completed,
        readTaskInfo() {},
        newTaskHandler() {},
      },
      {
        readBody: () => ({
          quest: [{ templateId: 51 }],
          states: new Uint8Array([1]),
        }),
      },
    );
    return { cate, stale, repeat, next };
  }
  let r = run(original);
  assert.ok(!r.cate.acceptedList.includes(r.next));
  r = run(original.replace(patch[0], patch[1]));
  assert.ok(r.cate.acceptedList.includes(r.next));
  assert.ok(!r.cate.acceptedList.includes(r.stale));
  assert.ok(r.cate.acceptedList.includes(r.repeat));
});

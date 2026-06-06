import { request } from "../../utils/api";
import { ensureUserId } from "../../utils/auth";
import { spritePath } from "../../utils/format";

type Result = {
  archetypeKey: string;
  displayName: string;
  reveal: { title: string; lines: string[] };
};

Page({
  data: {
    result: null as Result | null,
    phase: "reveal" as "reveal" | "name" | "hatched",
    spriteSrc: "",
    babySrc: "",
    birthLine: "",
    name: "",
    submitting: false,
  },

  onLoad() {
    const r = wx.getStorageSync("hatch_result") as Result | "";
    if (!r || !r.archetypeKey) { wx.reLaunch({ url: "/pages/quiz/quiz" }); return; }
    this.setData({
      result: r,
      spriteSrc: spritePath(r.archetypeKey, "egg", ""),
      name: r.displayName,
    });
  },

  toName() { this.setData({ phase: "name" }); },

  onNameInput(e: WechatMiniprogram.Input) { this.setData({ name: e.detail.value }); },

  useDefault() {
    const r = this.data.result;
    if (r) { this.setData({ name: r.displayName }); this.confirm(); }
  },

  async confirm() {
    if (this.data.submitting) return;
    const name = (this.data.name || "").trim() || (this.data.result?.displayName ?? "小宠");
    this.setData({ submitting: true });
    try {
      await ensureUserId();
      await request({ path: "/pet/rename", method: "POST", body: { name } });
      const hatched = await request<{ line: string; sprite: { creatureId: string; stage: string; mood: string } }>({
        path: "/pet/hatch", method: "POST",
      });
      wx.removeStorageSync("hatch_result");
      this.setData({
        phase: "hatched",
        submitting: false,
        name,
        babySrc: spritePath(hatched.sprite.creatureId, hatched.sprite.stage, hatched.sprite.mood),
        birthLine: hatched.line || "我出来啦！",
      });
    } catch (e) {
      console.error("hatch failed", e);
      // pet exists regardless — just go home.
      wx.removeStorageSync("hatch_result");
      wx.reLaunch({ url: "/pages/home/home" });
    }
  },

  goHome() { wx.reLaunch({ url: "/pages/home/home" }); },
});

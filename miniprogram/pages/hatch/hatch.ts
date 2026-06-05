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
    phase: "reveal" as "reveal" | "name",
    spriteSrc: "",
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
      wx.removeStorageSync("hatch_result");
      wx.reLaunch({ url: "/pages/home/home" });
    } catch (e) {
      console.error("rename failed", e);
      // even if rename fails, the pet exists with its default name — go home.
      wx.removeStorageSync("hatch_result");
      wx.reLaunch({ url: "/pages/home/home" });
    }
  },
});

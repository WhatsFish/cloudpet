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
    // No pending hatch result means this pet already hatched (result is cleared on confirm) — a
    // re-entry to hatch should NOT flash through the quiz. Go home; home self-routes to the quiz
    // only if there's genuinely no pet (its /pet read 404s).
    if (!r || !r.archetypeKey) { wx.reLaunch({ url: "/pages/home/home" }); return; }
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
      const data = (e as { data?: { error?: string; message?: string } })?.data || null;
      if (data?.error === "name_rejected") {
        // naming hit content moderation — stay on the name step so they can retry
        this.setData({ submitting: false, phase: "name" });
        wx.showModal({ title: "换个名字试试", content: data.message || "这个名字不太合适～", showCancel: false });
        return;
      }
      console.error("hatch failed", e);
      // pet exists regardless — just go home.
      wx.removeStorageSync("hatch_result");
      wx.reLaunch({ url: "/pages/home/home" });
    }
  },

  goHome() { wx.reLaunch({ url: "/pages/home/home" }); },
});

import { request, type ApiError } from "../../utils/api";
import { ensureUserId } from "../../utils/auth";

type Q = { id: string; prompt: string; options: { id: string; label: string }[] };

Page({
  data: {
    questions: [] as Q[],
    idx: 0,
    answers: {} as Record<string, string>,
    submitting: false,
    loaded: false,
  },

  async onLoad() {
    try {
      await ensureUserId();
      // If a pet already exists, skip straight to home.
      try {
        await request({ path: "/pet" });
        wx.reLaunch({ url: "/pages/home/home" });
        return;
      } catch (e) {
        if ((e as ApiError).statusCode !== 404) throw e;
      }
      const resp = await request<{ questions: Q[] }>({ path: "/quiz" });
      this.setData({ questions: resp.questions, loaded: true });
    } catch (e) {
      console.error("quiz load failed", e);
      wx.showToast({ title: "加载失败，下拉重试", icon: "none" });
    }
  },

  onPick(e: WechatMiniprogram.TouchEvent) {
    if (this.data.submitting) return;
    const { qid, oid } = e.currentTarget.dataset as { qid: string; oid: string };
    const answers = { ...this.data.answers, [qid]: oid };
    const nextIdx = this.data.idx + 1;
    if (nextIdx >= this.data.questions.length) {
      this.setData({ answers });
      this.submit(answers);
    } else {
      this.setData({ answers, idx: nextIdx });
    }
  },

  onBack() {
    if (this.data.idx > 0) this.setData({ idx: this.data.idx - 1 });
  },

  async submit(answers: Record<string, string>) {
    this.setData({ submitting: true });
    wx.showLoading({ title: "正在为你寻找…" });
    try {
      const resp = await request<{ ok: boolean; archetypeKey: string; displayName: string; reveal: { title: string; lines: string[] } }>({
        path: "/quiz", method: "POST", body: { answers },
      });
      wx.setStorageSync("hatch_result", resp);
      wx.hideLoading();
      wx.reLaunch({ url: "/pages/hatch/hatch" });
    } catch (e) {
      wx.hideLoading();
      const err = e as ApiError;
      if (err.statusCode === 409) { wx.reLaunch({ url: "/pages/home/home" }); return; }
      console.error("quiz submit failed", err);
      wx.showToast({ title: "提交失败，再试一次", icon: "none" });
      this.setData({ submitting: false });
    }
  },
});

import { request, type ApiError } from "../../utils/api";
import { ensureUserId } from "../../utils/auth";
import { VERB_LABEL } from "../../utils/format";

type Voice = { local_date: string; line: string; created_at: string };
type Action = { verb: string; line: string | null; created_at: string; local_date: string };

Page({
  data: {
    voices: [] as Voice[],
    actions: [] as { label: string; line: string | null; time: string }[],
    loading: true,
    noPet: false,
  },

  onShow() { this.load(); },
  async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh(); },

  async load() {
    try {
      await ensureUserId();
      const resp = await request<{ voices: Voice[]; actions: Action[] }>({ path: "/pet/diary" });
      const actions = resp.actions.map((a) => ({
        label: VERB_LABEL[a.verb] ?? a.verb,
        line: a.line,
        time: (a.created_at || "").slice(5, 16).replace("T", " "),
      }));
      this.setData({ voices: resp.voices, actions, loading: false, noPet: false });
    } catch (e) {
      if ((e as ApiError).statusCode === 404) { this.setData({ loading: false, noPet: true }); return; }
      console.error("diary load failed", e);
      this.setData({ loading: false });
    }
  },

  goQuiz() { wx.reLaunch({ url: "/pages/quiz/quiz" }); },
});

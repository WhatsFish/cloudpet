import { request, type ApiError } from "../../utils/api";
import { ensureUserId } from "../../utils/auth";
import { cooldownText, FALLBACK_SPRITE, spritePath, STAGE_LABEL, STAT_META } from "../../utils/format";

type PetView = {
  pet: { id: number; name: string; archetypeKey: string; stage: string; daysKnown: number; level: number };
  stats: Record<string, number>;
  bond: number; exp: number; level: number; evolveProgress: number; expForNextStage: number | null;
  moodBand: string; dominantState: string; badges: string[]; needHint: string; asleep: boolean;
  sprite: { creatureId: string; stage: string; mood: string; animation: string };
  careCharges: number; chargesRefreshInMs: number; dailyResetInMs: number; careCoveredToday: boolean;
  streakDays: number; theme: string; voice: { line: string } | null;
  actions: { verb: string; enabled: boolean; reason?: string; remainingMs?: number }[];
};
type ActionResp = PetView & { ok: boolean; line: string; fx: string; animation: string; promoted: string | null; promoteLine: string | null; completed: boolean; completeBonus: { exp: number; bond: number } | null };

const ICONS = [
  { key: "feed", emoji: "🍙", label: "喂", kind: "care" },
  { key: "clean", emoji: "🛁", label: "洗", kind: "care" },
  { key: "doctor", emoji: "💊", label: "医", kind: "care" },
  { key: "play", emoji: "🎮", label: "玩", kind: "free" },
  { key: "pet", emoji: "💛", label: "摸", kind: "free" },
  { key: "sleep", emoji: "🌙", label: "睡", kind: "free" },
  { key: "status", emoji: "📊", label: "状态", kind: "screen" },
  { key: "diary", emoji: "📓", label: "心声", kind: "nav" },
  { key: "codex", emoji: "📖", label: "图鉴", kind: "nav" },
  { key: "settings", emoji: "⚙️", label: "设置", kind: "screen" },
];
const FX_EMOJI: Record<string, string> = { hearts: "💛", sparkle: "✨", food: "🍙", bubbles: "🫧", notes: "🎵", zzz: "💤" };
const ANIM: Record<string, string> = { mochi_pudding: "anim-jiggle", ember_imp: "anim-pop", echo_fox: "anim-float" };
const CARE = ["feed", "clean", "doctor"];

Page({
  data: {
    loading: true, error: "", pet: null as PetView | null,
    theme: "cream", spriteSrc: "", animClass: "anim-bob", stageLabel: "",
    bubble: "", icons: ICONS, cursor: 0,
    pips: ["off", "off", "off"], chargeCd: "",
    fxEmoji: "", floatTag: "", fxKey: 0,
    showStatus: false, showSettings: false, statBars: [] as { label: string; color: string; value: number; pct: number }[],
    nameInput: "", reacting: false,
  },

  onShow() { this.load(); },
  async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh(); },

  async load() {
    try {
      await ensureUserId();
      const pet = await request<PetView>({ path: "/pet" });
      this.apply(pet, pet.voice?.line ?? "");
      this.setData({ loading: false, error: "" });
    } catch (e) {
      const err = e as ApiError;
      if (err.statusCode === 404) { wx.reLaunch({ url: "/pages/quiz/quiz" }); return; }
      this.setData({ loading: false, error: "和它的连接断了一下" });
    }
  },

  apply(pet: PetView, bubble: string) {
    const pips = [0, 1, 2].map((i) => (i < pet.careCharges ? "on" : "off"));
    const statBars = STAT_META.map((m) => {
      const v = pet.stats[m.key] ?? 0;
      return { label: m.label, color: m.color, value: v, pct: Math.max(2, Math.min(100, v)) };
    });
    this.setData({
      pet, bubble,
      theme: pet.theme || "cream",
      spriteSrc: spritePath(pet.sprite.creatureId, pet.sprite.stage, pet.sprite.mood),
      animClass: ANIM[pet.pet.archetypeKey] || "anim-bob",
      stageLabel: (STAGE_LABEL[pet.pet.stage] || pet.pet.stage).replace(/^.. /, ""),
      pips, statBars,
      chargeCd: pet.careCharges > 0 ? "" : cooldownText(pet.chargesRefreshInMs),
      nameInput: pet.pet.name,
    });
  },

  onIcon(e: WechatMiniprogram.TouchEvent) { this.activate(e.currentTarget.dataset.key as string); },
  onA() { this.setData({ cursor: (this.data.cursor + 1) % ICONS.length }); },
  onB() { this.activate(ICONS[this.data.cursor].key); },
  onC() { if (this.data.showStatus || this.data.showSettings) this.setData({ showStatus: false, showSettings: false }); },

  activate(key: string) {
    const idx = ICONS.findIndex((i) => i.key === key);
    if (idx >= 0) this.setData({ cursor: idx });
    const ic = ICONS.find((i) => i.key === key);
    if (!ic) return;
    if (ic.kind === "care" || ic.kind === "free") this.doAction(key);
    else if (ic.key === "status") this.setData({ showStatus: true });
    else if (ic.key === "settings") this.setData({ showSettings: true });
    else if (ic.kind === "nav") wx.navigateTo({ url: `/pages/${ic.key}/${ic.key}` });
  },

  async doAction(verb: string) {
    if (this.data.reacting) return;
    this.setData({ reacting: true });
    try {
      const resp = await request<ActionResp>({ path: "/action", method: "POST", body: { verb } });
      this.apply(resp, resp.line || this.data.bubble);
      this.fxBurst(FX_EMOJI[resp.fx] || "✨", CARE.includes(verb) ? "+25 ✨" : "");
      this.bounce();
      if (resp.completed) setTimeout(() => wx.showToast({ title: `今天照顾好啦 +${resp.completeBonus?.exp || 30} ✨`, icon: "none" }), 500);
      if (resp.promoted) setTimeout(() => wx.showToast({ title: resp.promoteLine || "它进化啦！", icon: "none" }), 950);
    } catch (e) {
      const err = e as ApiError;
      const d = (err.data ?? {}) as { error?: string; reason?: string; line?: string; chargesRefreshInMs?: number };
      if (d.line) this.setData({ bubble: d.line });
      let msg = "它现在不想这样";
      if (d.error === "no_charge") msg = `照顾电量空啦，下次 +1：${cooldownText(d.chargesRefreshInMs)}`;
      else if (d.reason === "sick") msg = "它有点不舒服，先看医生吧";
      else if (d.reason === "locked") msg = "长大后才能解锁哦";
      wx.showToast({ title: msg, icon: "none" });
    } finally {
      this.setData({ reacting: false });
    }
  },

  fxBurst(emoji: string, tag: string) {
    this.setData({ fxEmoji: emoji, floatTag: tag, fxKey: this.data.fxKey + 1 });
    setTimeout(() => this.setData({ fxEmoji: "", floatTag: "" }), 900);
  },
  bounce() {
    this.setData({ animClass: "anim-bounce" });
    setTimeout(() => {
      const pet = this.data.pet;
      if (pet) this.setData({ animClass: ANIM[pet.pet.archetypeKey] || "anim-bob" });
    }, 500);
  },
  onSpriteError() { this.setData({ spriteSrc: FALLBACK_SPRITE }); },

  async pickTheme(e: WechatMiniprogram.TouchEvent) {
    const theme = e.currentTarget.dataset.theme as string;
    this.setData({ theme });
    try { await request({ path: "/theme", method: "POST", body: { theme } }); } catch { /* cosmetic */ }
  },
  onNameInput(e: WechatMiniprogram.Input) { this.setData({ nameInput: e.detail.value }); },
  async saveName() {
    const name = (this.data.nameInput || "").trim();
    if (name.length < 1 || name.length > 12) { wx.showToast({ title: "1-12 个字哦", icon: "none" }); return; }
    try {
      await request({ path: "/pet/rename", method: "POST", body: { name } });
      this.setData({ "pet.pet.name": name });
      wx.showToast({ title: "改好啦", icon: "none" });
    } catch { wx.showToast({ title: "改名失败", icon: "none" }); }
  },
  closeModals() { this.setData({ showStatus: false, showSettings: false }); },
  noop() {},
});

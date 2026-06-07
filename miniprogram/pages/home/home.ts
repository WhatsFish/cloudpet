import { request, type ApiError } from "../../utils/api";
import { ensureUserId } from "../../utils/auth";
import { spritePath, FALLBACK_SPRITE } from "../../utils/format";

type NeedView = { kind: string; verb: string; label: string };
type Roadmap = {
  level: { level: number; expInto: number; expSpan: number; expRemaining: number };
  stage: { stage: string | null; towardName: string; expRemaining: number; daysRemaining: number; bondRemaining: number; etaDays: number } | null;
  line: string;
};
type Recap = { kind: string; daysAway: number; levelFrom: number; levelTo: number; stageFrom: string; stageTo: string; evolvedToName: string | null; expGained: number; line: string };
type NurtureTilt = { leaning: string; towardName: string; label: string };
type PetView = {
  pet: { id: number; name: string; archetypeKey: string; stage: string; daysKnown: number; level: number };
  stats: Record<string, number>;
  bond: number; exp: number; level: number; evolveProgress: number; moodBand: string; dominantState: string; badges: string[]; needHint: string; asleep: boolean;
  sprite: { creatureId: string; stage: string; mood: string; animation: string };
  needs: NeedView[]; topNeed: NeedView | null; roadmap: Roadmap; recap: Recap | null;
  streakDays: number; theme: string; voice: { line: string } | null;
  nurtureTilt: NurtureTilt;
};
type ActionResp = PetView & { ok: boolean; line: string; fx: string; animation: string; promoted: string | null; promoteLine: string | null; needReward: { kind: string; base: number; bonus: number; bond: number } | null };

const VERB_META: Record<string, { emoji: string; label: string; stat: string }> = {
  feed: { emoji: "🍙", label: "喂喂它", stat: "satiety" },
  clean: { emoji: "🛁", label: "洗个澡", stat: "cleanliness" },
  doctor: { emoji: "💊", label: "看医生", stat: "health" },
  play: { emoji: "🎮", label: "陪它玩", stat: "mood" },
  pet: { emoji: "💛", label: "摸摸", stat: "" },
  sleep: { emoji: "🌙", label: "哄睡", stat: "" },
};
const FX_EMOJI: Record<string, string> = { hearts: "💛", sparkle: "✨", food: "🍙", bubbles: "🫧", notes: "🎵", zzz: "💤" };
const ANIM: Record<string, string> = { mochi_pudding: "anim-jiggle", ember_imp: "anim-pop", echo_fox: "anim-float", sproutling: "anim-bob" };
const STAGE_CN: Record<string, string> = { egg: "蛋", baby: "幼年", child: "童年", teen: "少年", adult: "成年" };
const STAGE_CAP: Record<string, number> = { egg: 80, baby: 85, child: 90, teen: 95, adult: 100 };
const STAT_META = [
  { key: "satiety", label: "饱食", color: "#FFB84D" },
  { key: "mood", label: "心情", color: "#FF9EC4" },
  { key: "cleanliness", label: "清洁", color: "#7FD4F2" },
  { key: "energy", label: "精力", color: "#9ED47F" },
  { key: "health", label: "健康", color: "#FF7A7A" },
];

Page({
  data: {
    loading: true, error: "", pet: null as PetView | null,
    theme: "cream", spriteSrc: "", bgSrc: "/assets/bg/room.png", animClass: "anim-bob", stageLabel: "",
    needCard: "", ctaVerb: "play", ctaEmoji: "🎮", ctaLabel: "陪它玩", ctaReward: "", ctaPrimary: true,
    roadmapLine: "", levelPct: 0, levelNum: 1,
    showDrawer: false, showRoadmap: false, showStatus: false, showSettings: false,
    recap: null as Recap | null,
    statBars: [] as { label: string; color: string; value: number; pct: number }[],
    fxEmoji: "", floatTag: "", fxKey: 0, reacting: false,
    nameInput: "",
  },

  onShow() { this.load(); },
  async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh(); },

  async load() {
    try {
      await ensureUserId();
      const pet = await request<PetView>({ path: "/pet" });
      this.apply(pet, pet.voice?.line ?? "");
      if (pet.recap) this.setData({ recap: pet.recap });
      this.setData({ loading: false, error: "" });
    } catch (e) {
      const err = e as ApiError;
      if (err.statusCode === 404) { wx.reLaunch({ url: "/pages/quiz/quiz" }); return; }
      this.setData({ loading: false, error: "和它的连接断了一下" });
    }
  },

  chooseBg(pet: PetView): string {
    const h = new Date().getHours();
    if (pet.asleep || h >= 22 || h < 6) return "/assets/bg/night.png";
    if (h < 9) return "/assets/bg/sky.png";
    if ((pet.moodBand === "好" || pet.moodBand === "极好") && !pet.topNeed) return "/assets/bg/meadow.png";
    return "/assets/bg/room.png";
  },

  rewardFor(verb: string, pet: PetView, isNeed: boolean): string {
    const meta = VERB_META[verb];
    if (!isNeed) return "";
    let base = 0;
    if (meta?.stat) {
      const cap = STAGE_CAP[pet.pet.stage] ?? 90;
      const deficit = Math.max(0, cap - (pet.stats[meta.stat] ?? cap));
      base = Math.round(6 + 8 * (deficit / cap));
    }
    return `+${base + 40} ✨`;
  },

  apply(pet: PetView, bubble: string) {
    const top = pet.topNeed;
    let ctaVerb: string, ctaLabel: string, ctaReward: string, ctaPrimary: boolean, needCard: string;
    if (top) {
      ctaVerb = top.verb; ctaPrimary = true;
      ctaLabel = VERB_META[top.verb]?.label ?? "照顾它";
      ctaReward = this.rewardFor(top.verb, pet, true);
      needCard = top.label;
    } else {
      ctaVerb = "play"; ctaPrimary = false; ctaLabel = "陪它玩"; ctaReward = "";
      needCard = pet.needHint || "它现在很满足，陪它待一会儿就好～";
    }
    const statBars = STAT_META.map((m) => {
      const v = pet.stats[m.key] ?? 0;
      return { label: m.label, color: m.color, value: v, pct: Math.max(2, Math.min(100, v)) };
    });
    this.setData({
      pet, theme: pet.theme || "cream",
      spriteSrc: spritePath(pet.sprite.creatureId, pet.sprite.stage, pet.sprite.mood),
      bgSrc: this.chooseBg(pet),
      animClass: ANIM[pet.pet.archetypeKey] || "anim-bob",
      stageLabel: STAGE_CN[pet.pet.stage] || pet.pet.stage,
      needCard, ctaVerb, ctaEmoji: VERB_META[ctaVerb]?.emoji ?? "🎮", ctaLabel, ctaReward, ctaPrimary,
      roadmapLine: pet.roadmap?.line ?? "", levelPct: Math.max(3, pet.evolveProgress), levelNum: pet.level,
      statBars, nameInput: pet.pet.name,
    });
  },

  async doAction(verb: string) {
    if (this.data.reacting) return;
    this.setData({ reacting: true, showDrawer: false });
    try {
      const resp = await request<ActionResp>({ path: "/action", method: "POST", body: { verb } });
      this.apply(resp, resp.line || this.data.needCard);
      const tag = resp.needReward ? `+${resp.needReward.base + resp.needReward.bonus} 正好需要!` : "";
      this.fxBurst(FX_EMOJI[resp.fx] || "✨", tag);
      this.bounce();
      if (resp.line) wx.showToast({ title: resp.line, icon: "none", duration: 1800 });
      if (resp.promoted) setTimeout(() => wx.showToast({ title: resp.promoteLine || "它长大啦！", icon: "none", duration: 2200 }), 900);
    } catch (e) {
      const err = e as ApiError;
      const d = (err.data ?? {}) as { reason?: string; line?: string };
      let msg = d.line || "它现在不想这样";
      if (d.reason === "sick") msg = "它不太舒服，先看医生吧";
      else if (d.reason === "locked") msg = "长大后才能解锁哦";
      wx.showToast({ title: msg, icon: "none" });
    } finally {
      this.setData({ reacting: false });
    }
  },

  // primary CTA + free buttons + drawer
  onPrimary() { this.doAction(this.data.ctaVerb); },
  onPetFree() { this.haptic(); this.doAction("pet"); },
  onPlayFree() { this.haptic(); this.doAction("play"); },
  onDrawerAction(e: WechatMiniprogram.TouchEvent) { this.doAction(e.currentTarget.dataset.verb as string); },
  toggleDrawer() { this.setData({ showDrawer: !this.data.showDrawer }); },

  // hardware buttons: A=选(do the need) · B=摸(bond) · C=看(roadmap)
  onA() { this.haptic(); this.doAction(this.data.ctaVerb); },
  onB() { this.haptic(); this.doAction("pet"); },
  onC() { this.haptic(); this.setData({ showRoadmap: true }); },
  haptic() { try { wx.vibrateShort({ type: "light" }); } catch { /* unsupported */ } },

  // recap overlay
  dismissRecap() { const hug = !!this.data.recap; this.setData({ recap: null }); if (hug) this.doAction("pet"); },

  // nav / modals
  openStatus() { this.setData({ showStatus: true, showDrawer: false }); },
  openSettings() { this.setData({ showSettings: true, showDrawer: false }); },
  goDiary() { wx.navigateTo({ url: "/pages/diary/diary" }); },
  goCodex() { wx.navigateTo({ url: "/pages/codex/codex" }); },
  closeModals() { this.setData({ showStatus: false, showSettings: false, showRoadmap: false }); },
  noop() {},

  fxBurst(emoji: string, tag: string) {
    this.setData({ fxEmoji: emoji, floatTag: tag, fxKey: this.data.fxKey + 1 });
    setTimeout(() => this.setData({ fxEmoji: "", floatTag: "" }), 1000);
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
});

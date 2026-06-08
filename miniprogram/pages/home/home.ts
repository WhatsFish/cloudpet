import { request, type ApiError } from "../../utils/api";
import { ensureUserId } from "../../utils/auth";
import { spritePath, FALLBACK_SPRITE } from "../../utils/format";

type NeedView = { kind: string; verb: string; label: string };
type ActionAvail = { verb: string; enabled: boolean; reason?: string };
type Roadmap = {
  level: { level: number; expInto: number; expSpan: number; expRemaining: number };
  stage: { stage: string | null; towardName: string; expRemaining: number; daysRemaining: number; bondRemaining: number; etaDays: number } | null;
  line: string;
};
type Recap = { kind: string; daysAway: number; levelFrom: number; levelTo: number; stageFrom: string; stageTo: string; evolvedToName: string | null; expGained: number; line: string };
type NurtureTilt = { leaning: string; towardName: string; label: string };
type ForkOpt = { branch: string; speciesId: string; name: string; blurb: string };
type PetView = {
  pet: { id: number; name: string; archetypeKey: string; stage: string; daysKnown: number; level: number };
  stats: Record<string, number>;
  bond: number; exp: number; level: number; evolveProgress: number; moodBand: string; needHint: string; asleep: boolean;
  sprite: { creatureId: string; stage: string; mood: string; animation: string };
  needs: NeedView[]; topNeed: NeedView | null; asleepNow: boolean; roadmap: Roadmap; recap: Recap | null;
  growthPerDay: number; bondHearts: number; streakDays: number; theme: string; voice: { line: string } | null;
  actions: ActionAvail[]; nurtureTilt: NurtureTilt;
  dominantState?: string; badges?: string[];
  fork?: { pending: boolean; recommended: string; options: ForkOpt[] };
};
type ActionResp = PetView & { ok: boolean; line: string; fx: string; animation: string; woke: boolean; promoted: string | null; promoteLine: string | null; needReward: { kind: string; exp: number; bond: number } | null };

const VERB_META: Record<string, { emoji: string; label: string; stat: string }> = {
  feed: { emoji: "🍙", label: "喂喂它", stat: "satiety" },
  clean: { emoji: "🛁", label: "洗个澡", stat: "cleanliness" },
  doctor: { emoji: "💊", label: "看医生", stat: "health" },
  play: { emoji: "🎮", label: "陪它玩", stat: "mood" },
  pet: { emoji: "💛", label: "摸摸", stat: "" },
  sleep: { emoji: "🌙", label: "哄睡", stat: "" },
};
const PARTICLE: Record<string, string> = { hearts: "💛", sparkle: "✨", food: "🍚", bubbles: "🫧", notes: "🎵", zzz: "💤" };
const REACT_ANIM: Record<string, string> = { feed: "anim-eat", clean: "anim-bounce", doctor: "anim-bounce", play: "anim-hop", pet: "anim-squish", sleep: "" };
const IDLE_ANIM: Record<string, string> = { puff: "anim-jiggle", bear: "anim-pop", penguin: "anim-float", claude: "anim-bob", blocky: "anim-bob" };
const STAGE_CN: Record<string, string> = { egg: "蛋", baby: "幼年", child: "童年", teen: "少年", adult: "成年" };
const STAGE_CAP: Record<string, number> = { egg: 80, baby: 85, child: 90, teen: 95, adult: 100 };
const STAT_META = [
  { key: "satiety", label: "饱食", color: "#FFB84D" },
  { key: "mood", label: "心情", color: "#FF9EC4" },
  { key: "cleanliness", label: "清洁", color: "#7FD4F2" },
  { key: "energy", label: "精力", color: "#9ED47F" },
  { key: "health", label: "健康", color: "#FF7A7A" },
];
const CARE_ROW = ["feed", "clean", "doctor"];
const AFFECTION_ROW = ["play", "pet", "sleep"];

Page({
  data: {
    loading: true, error: "", pet: null as PetView | null,
    theme: "cream", spriteSrc: "", bgSrc: "/assets/bg/room.png", animClass: "anim-bob", stageLabel: "",
    asleepNow: false, needCard: "",
    aVerb: "", aEmoji: "✓", aLabel: "照顾好啦", aReward: "", aGlow: false,
    bVerb: "play", bEmoji: "🎮", bLabel: "陪玩",
    roadmapLine: "", levelPct: 0, levelNum: 1, growthPerDay: 0, hearts: [0, 0, 0, 0, 0],
    showDrawer: false, showRoadmap: false, showStatus: false, showSettings: false,
    showFork: false, forkDismissed: false,
    forkOptions: [] as (ForkOpt & { sprite: string; recommended: boolean })[],
    recap: null as Recap | null,
    careActs: [] as { verb: string; emoji: string; label: string; enabled: boolean }[],
    funActs: [] as { verb: string; emoji: string; label: string; enabled: boolean }[],
    statBars: [] as { label: string; color: string; value: number; pct: number }[],
    particles: [] as { key: number; emoji: string; x: number; rot: number; delay: number }[],
    floatTag: "", fxKey: 0, reacting: false, nameInput: "",
  },

  onShow() { this.load(); },
  async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh(); },

  async load() {
    try {
      await ensureUserId();
      this.setData({ forkDismissed: false }); // a fresh load may re-surface the teen fork
      const pet = await request<PetView>({ path: "/pet" });
      this.apply(pet);
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
    if (pet.asleepNow || h >= 22 || h < 6) return "/assets/bg/night.png";
    if (h < 9) return "/assets/bg/sky.png";
    if ((pet.moodBand === "好" || pet.moodBand === "极好") && !pet.topNeed) return "/assets/bg/meadow.png";
    return "/assets/bg/room.png";
  },

  rewardFor(verb: string, pet: PetView): string {
    if (verb !== "feed" && verb !== "clean" && verb !== "doctor") return ""; // affection needs give bond, no exp chip
    const meta = VERB_META[verb];
    const cap = STAGE_CAP[pet.pet.stage] ?? 90;
    const deficit = Math.max(0, cap - (pet.stats[meta.stat] ?? cap));
    return `+${Math.round(6 + 8 * (deficit / cap)) + 40} ✨`;
  },

  apply(pet: PetView) {
    const avail: Record<string, boolean> = {};
    for (const a of pet.actions) avail[a.verb] = a.enabled;
    const asleep = pet.asleepNow;
    const sick = pet.dominantState === "SICK" || (pet.badges || []).indexOf("生病") >= 0;

    // need card: voice what it wants (tap the pet or the card to 摸摸)
    let needCard: string;
    if (asleep) needCard = "💤 它睡着啦…点它轻轻摸摸，别吵醒它";
    else if (pet.topNeed) needCard = pet.topNeed.label;
    else needCard = pet.needHint || "它现在很满足，点点它陪它待一会儿就好～";

    // A = 照顾: the due CARE need (feed/clean/doctor). Glows when there's one to do; otherwise
    // it reads "今天照顾好啦" and a tap just reassures (no server call).
    const careNeed = asleep ? null : pet.needs.find((n) => n.kind === "unwell" || n.kind === "hungry" || n.kind === "dirty");
    let aVerb = "", aEmoji = "✓", aLabel = "照顾好啦", aReward = "", aGlow = false;
    if (asleep) { aEmoji = "💤"; aLabel = "睡着啦"; }
    else if (careNeed) {
      aVerb = careNeed.verb; aGlow = true;
      aEmoji = VERB_META[aVerb]?.emoji ?? "🍙";
      aLabel = (VERB_META[aVerb]?.label ?? "照顾").replace("喂喂它", "喂食").replace("洗个澡", "洗澡").replace("看医生", "看病");
      aReward = this.rewardFor(aVerb, pet);
    }

    // B = 陪伴: a context affection that is always valid in the form shown.
    let bVerb = "play", bEmoji = "🎮", bLabel = "陪玩";
    if (asleep) { bVerb = "sleep"; bEmoji = "🔔"; bLabel = "叫醒"; }
    else if (sick) { bVerb = "pet"; bEmoji = "💛"; bLabel = "摸摸"; }
    else if (avail["sleep"]) { bVerb = "sleep"; bEmoji = "🌙"; bLabel = "哄睡"; }

    const statBars = STAT_META.map((m) => ({ label: m.label, color: m.color, value: pet.stats[m.key] ?? 0, pct: Math.max(2, Math.min(100, pet.stats[m.key] ?? 0)) }));
    const mkActs = (verbs: string[]) => verbs.map((v) => ({ verb: v, emoji: VERB_META[v].emoji, label: VERB_META[v].label.replace("喂喂它", "喂食").replace("洗个澡", "洗澡").replace("陪它玩", "陪玩"), enabled: avail[v] !== false }));

    this.setData({
      pet, theme: pet.theme || "cream", asleepNow: asleep,
      spriteSrc: spritePath(pet.sprite.creatureId, pet.sprite.stage, pet.sprite.mood),
      bgSrc: this.chooseBg(pet),
      animClass: IDLE_ANIM[pet.pet.archetypeKey] || "anim-bob",
      stageLabel: STAGE_CN[pet.pet.stage] || pet.pet.stage,
      needCard, aVerb, aEmoji, aLabel, aReward, aGlow, bVerb, bEmoji, bLabel,
      roadmapLine: pet.roadmap?.line ?? "", levelPct: Math.max(3, pet.evolveProgress), levelNum: pet.level,
      growthPerDay: pet.growthPerDay, hearts: [0, 1, 2, 3, 4].map((i) => (i < pet.bondHearts ? 1 : 0)),
      careActs: mkActs(CARE_ROW), funActs: mkActs(AFFECTION_ROW),
      statBars, nameInput: pet.pet.name,
    });

    // teen fork: build the 4 choosable forms (preview sprites + 推荐 marker), and auto-open the
    // chooser when the pet is waiting at the fork (unless dismissed for this load).
    const fk = pet.fork;
    if (fk) {
      const opts = fk.options.map((o) => ({ ...o, sprite: spritePath(o.speciesId, "teen", "happy"), recommended: o.branch === fk.recommended }));
      this.setData({ forkOptions: opts });
      if (fk.pending && !this.data.showFork && !this.data.forkDismissed) this.setData({ showFork: true });
    }
  },

  async doAction(verb: string) {
    if (this.data.reacting) return;
    this.setData({ reacting: true, showDrawer: false });
    try {
      const resp = await request<ActionResp>({ path: "/action", method: "POST", body: { verb } });
      this.burst(PARTICLE[resp.fx] || "✨", verb);
      this.apply(resp);
      this.activityPose(verb, resp); // briefly show it DOING the action (颠锅/泡泡/手柄)
      const tag = resp.needReward ? (resp.needReward.exp ? `+${resp.needReward.exp} 正好需要!` : `+${resp.needReward.bond}♥ 懂它!`) : "";
      if (tag) { this.setData({ floatTag: tag }); setTimeout(() => this.setData({ floatTag: "" }), 1100); }
      if (resp.line) wx.showToast({ title: resp.line, icon: "none", duration: 1800 });
      if (resp.promoted) setTimeout(() => wx.showToast({ title: resp.promoteLine || "它长大啦！", icon: "none", duration: 2200 }), 900);
    } catch (e) {
      const err = e as ApiError;
      const d = (err.data ?? {}) as { line?: string };
      wx.showToast({ title: d.line || "它现在不想这样", icon: "none" });
    } finally {
      this.setData({ reacting: false });
    }
  },

  onDrawerAction(e: WechatMiniprogram.TouchEvent) {
    // tapping a disabled action still calls the server, which returns the friendly reason
    this.doAction(e.currentTarget.dataset.verb as string);
  },
  toggleDrawer() { this.setData({ showDrawer: !this.data.showDrawer }); },

  // hardware buttons, each a distinct job — A=照顾(due care) · B=陪伴(陪玩/哄睡/叫醒/摸摸) · C=路线/进化.
  onA() {
    this.haptic();
    if (this.data.aVerb) this.doAction(this.data.aVerb);
    else wx.showToast({ title: this.data.asleepNow ? "它睡着啦～" : "今天照顾好啦 ✓", icon: "none" });
  },
  onB() { this.haptic(); this.doAction(this.data.bVerb); },
  onC() { this.haptic(); this.setData({ showRoadmap: true }); },
  onPet() { this.haptic(); this.doAction("pet"); }, // tapping the creature itself = 摸摸
  haptic() { try { wx.vibrateShort({ type: "light" }); } catch { /* unsupported */ } },

  // teen fork chooser
  openFork() { this.setData({ showRoadmap: false, showFork: true, forkDismissed: false }); },
  closeFork() { this.setData({ showFork: false, forkDismissed: true }); },
  async chooseFork(e: WechatMiniprogram.TouchEvent) {
    if (this.data.reacting) return;
    const branch = e.currentTarget.dataset.branch as string;
    this.setData({ reacting: true });
    try {
      const resp = await request<ActionResp & { evolved?: { name: string } }>({ path: "/pet/evolve", method: "POST", body: { branch } });
      this.apply(resp);
      this.setData({
        showFork: false, forkDismissed: true,
        recap: { kind: "evolve", daysAway: 0, levelFrom: resp.level, levelTo: resp.level, stageFrom: "child", stageTo: "teen", evolvedToName: resp.evolved?.name || "", expGained: 0, line: resp.line },
      });
    } catch (err) {
      const e2 = err as ApiError;
      const d = (e2.data ?? {}) as { line?: string };
      wx.showToast({ title: d.line || "它还没准备好长大", icon: "none" });
    } finally {
      this.setData({ reacting: false });
    }
  },

  dismissRecap() { const hug = !!this.data.recap; this.setData({ recap: null }); if (hug) this.doAction("pet"); },

  openStatus() { this.setData({ showStatus: true, showDrawer: false }); },
  openSettings() { this.setData({ showSettings: true, showDrawer: false }); },
  goDiary() { wx.navigateTo({ url: "/pages/diary/diary" }); },
  goCodex() { wx.navigateTo({ url: "/pages/codex/codex" }); },
  closeModals() { this.setData({ showStatus: false, showSettings: false, showRoadmap: false }); },
  noop() {},

  // richer reaction: a burst of particles + a per-action sprite reaction
  burst(emoji: string, verb: string) {
    const n = verb === "pet" || verb === "play" ? 5 : 3;
    const base = this.data.fxKey;
    const particles = Array.from({ length: n }, (_, i) => ({
      key: base * 10 + i, emoji,
      x: 120 + ((i * 97 + base * 53) % 240), rot: ((i * 71) % 40) - 20, delay: i * 70,
    }));
    this.setData({ particles, fxKey: base + 1, animClass: REACT_ANIM[verb] || "anim-bounce" });
    setTimeout(() => {
      const pet = this.data.pet;
      this.setData({ particles: [], animClass: pet ? (IDLE_ANIM[pet.pet.archetypeKey] || "anim-bob") : "anim-bob" });
    }, 1000);
  },
  // show the activity pose (颠锅/泡泡/手柄) for ~1.3s, then settle back to the mood sprite
  activityPose(verb: string, resp: ActionResp) {
    if ((verb !== "feed" && verb !== "clean" && verb !== "play") || !resp.sprite) return;
    this.setData({ spriteSrc: spritePath(resp.sprite.creatureId, resp.sprite.stage, verb) });
    setTimeout(() => {
      const p = this.data.pet;
      if (p && p.sprite) this.setData({ spriteSrc: spritePath(p.sprite.creatureId, p.sprite.stage, p.sprite.mood) });
    }, 1300);
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

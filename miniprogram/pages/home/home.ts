import { request, type ApiError } from "../../utils/api";
import { ensureUserId } from "../../utils/auth";
import { spritePath, FALLBACK_SPRITE } from "../../utils/format";
import { HEAD_ANCHORS, HAT_BASE, HAT_DROP } from "../../utils/anchors";

const DECO_K = 208 / 64; // sprite px → rpx (sprite is a 64-canvas rendered at 208rpx)
type DecoItem = { id: string; slot: string; name: string; blurb: string; unlocked: boolean; lockHint: string; equipped: boolean };

type NeedView = { kind: string; verb: string; label: string; rewardExp?: number; rewardBond?: number };
type ActionAvail = { verb: string; enabled: boolean; reason?: string };
type Roadmap = {
  level: { level: number; expInto: number; expSpan: number; expRemaining: number };
  stage: { stage: string | null; towardName: string; expRemaining: number; daysRemaining: number; bondRemaining: number; etaDays: number; daysSavedByBond: number; daysCouldSaveMore: number } | null;
  line: string;
};
type Recap = { kind: string; daysAway: number; levelFrom: number; levelTo: number; stageFrom: string; stageTo: string; evolvedToName: string | null; expGained: number; line: string };
type ForkOpt = { branch: string; speciesId: string; name: string; blurb: string };
type PetView = {
  pet: { id: number; name: string; archetypeKey: string; stage: string; daysKnown: number; level: number };
  stats: Record<string, number>;
  bond: number; exp: number; level: number; evolveProgress: number; moodBand: string; needHint: string; asleep: boolean;
  sprite: { creatureId: string; stage: string; mood: string; animation: string };
  needs: NeedView[]; topNeed: NeedView | null; asleepNow: boolean; roadmap: Roadmap; recap: Recap | null;
  growthPerDay: number; bondHearts: number; bondNextPct?: number; bondNextRemaining?: number; streakDays: number; theme: string; voice: { line: string } | null;
  actions: ActionAvail[];
  weight?: number; sizeScale?: number; sparks?: number; sparkEtaSec?: number;
  careTimers?: { verb: string; due: boolean; etaSec: number | null; label: string }[];
  dominantState?: string; badges?: string[];
  fork?: { pending: boolean; options: ForkOpt[] };
  checkin?: { firstOpenToday: boolean; bond: number; streakDays: number; milestoneExp: number; greet: string } | null;
  equipped?: { hat: string | null };
};
type ActionResp = PetView & { ok: boolean; line: string; fx: string; animation: string; woke: boolean; promoted: string | null; promoteLine: string | null; needReward: { kind: string; exp: number; bond: number } | null; gainExp?: number; gainBond?: number };

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

function fmtEta(sec: number): string {
  if (sec <= 0) return "马上";
  if (sec < 3600) return Math.max(1, Math.round(sec / 60)) + "分钟";
  return Math.round(sec / 3600) + "小时";
}
function fmtClock(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
}

Page({
  data: {
    loading: true, error: "", pet: null as PetView | null,
    theme: "cream", spriteSrc: "", bgSrc: "/assets/bg/room.png", animClass: "anim-bob", stageLabel: "",
    asleepNow: false, needCard: "",
    aVerb: "", aEmoji: "✓", aLabel: "照顾好啦", aReward: "", aGlow: false,
    bVerb: "play", bEmoji: "🎮", bLabel: "陪玩",
    roadmapLine: "", levelPct: 0, levelNum: 1, growthPerDay: 0, hearts: [0, 0, 0, 0, 0],
    bondNextPct: 0, bondNextRemaining: 0,
    spriteScale: 1, weightKg: "1.0", sparkN: 0, sparkEta: 0, sparkText: "",
    showDrawer: false, showRoadmap: false, showStatus: false, showSettings: false,
    showFork: false, forkDismissed: false,
    showWardrobe: false, decoItems: [] as DecoItem[], decoLoading: false,
    decoOn: false, decoSrc: "", decoStyle: "",
    forkOptions: [] as (ForkOpt & { sprite: string })[],
    recap: null as Recap | null,
    careActs: [] as { verb: string; emoji: string; label: string; enabled: boolean }[],
    funActs: [] as { verb: string; emoji: string; label: string; enabled: boolean }[],
    statBars: [] as { label: string; color: string; value: number; pct: number }[],
    particles: [] as { key: number; emoji: string; x: number; rot: number; delay: number }[],
    floatTag: "", fxKey: 0, reacting: false, nameInput: "", statusFx: "", comeback: "",
  },

  // "today's care is done" = awake, no need is due, and the 灵感 are spent — i.e. nothing
  // growth-y left to do right now. This is exactly the day-1 wall (after feed×2 + wash + the 3
  // starter sparks). We surface a gentle come-back-tomorrow hook (banner + once/day toast) so
  // closing the app has a reason to return — paired with the overnight soft-recap (V8.7) that
  // pays it off ("它趁你不在长大了").
  spentState(pet: PetView): boolean {
    return !pet.asleepNow && !pet.topNeed && (pet.sparks || 0) === 0;
  },
  localDateStr(): string { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; },
  comebackNudge(delayMs: number) {
    const pet = this.data.pet;
    if (!pet || !this.spentState(pet)) return;
    let last = ""; try { last = wx.getStorageSync("comeback_date") || ""; } catch { /* ignore */ }
    const today = this.localDateStr();
    if (last === today) return; // at most once per day
    try { wx.setStorageSync("comeback_date", today); } catch { /* ignore */ }
    setTimeout(() => wx.showToast({ title: "今天照顾好啦 🌙 明天再来看它长大～", icon: "none", duration: 2600 }), delayMs);
  },

  // When the pet is in a bad state its sprite shows the sad/sick frame — drive a matching idle
  // MOTION (feverish shiver / hungry slump / dirty fidget) so the distress reads at a glance,
  // instead of the normal happy bob. Falls back to the per-creature idle when it's fine.
  idleAnimFor(pet: PetView): string {
    if (pet.asleepNow) return "";
    const b = pet.badges || [];
    if (pet.dominantState === "SICK" || b.indexOf("生病") >= 0) return "anim-sick";
    if (b.indexOf("饿") >= 0) return "anim-weak";
    if (b.indexOf("脏") >= 0) return "anim-itch";
    return IDLE_ANIM[pet.pet.archetypeKey] || "anim-bob";
  },
  // 可装饰: overlay the equipped hat on the sprite. Same 64-canvas as the sprite, translated so the
  // hat's contact row lands on this creature/stage's head-top (HEAD_ANCHORS, verified via QA montage).
  // Hidden while the pet is hiding (it's curled away). Lives inside .sprite-scale so it scales with 体型.
  decoFor(pet: PetView): { on: boolean; src: string; style: string } {
    const hat = pet.equipped && pet.equipped.hat;
    if (!hat || pet.sprite.mood === "hide") return { on: false, src: "", style: "" };
    const sid = pet.sprite.creatureId, stage = pet.sprite.stage;
    const a = (HEAD_ANCHORS[sid] && HEAD_ANCHORS[sid][stage])
      || (HEAD_ANCHORS[sid.split("__")[0]] && HEAD_ANCHORS[sid.split("__")[0]][stage])
      || { x: 32, y: 20 };
    const dy = (a.y - HAT_BASE + HAT_DROP) * DECO_K;
    return { on: true, src: `/assets/deco/${hat}.png`, style: `transform:translateY(${dy.toFixed(1)}rpx)` };
  },

  // a small looping ambient mark near the pet that reinforces a bad state
  statusFxFor(pet: PetView): string {
    if (pet.asleepNow) return "";
    const b = pet.badges || [];
    if (pet.dominantState === "SICK" || b.indexOf("生病") >= 0) return "💢";
    if (b.indexOf("饿") >= 0) return "💫";
    if (b.indexOf("脏") >= 0) return "🪰";
    return "";
  },

  onShow() { this.load(); this.startTick(); },
  onHide() { this.stopTick(); },
  onUnload() { this.stopTick(); },
  async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh(); },

  // a 1s ticker drives the spark countdown so the user SEES it refilling; when it reaches 0
  // (and not already at max) it pulls a fresh /pet so the newly-regenerated spark shows up.
  startTick() {
    this.stopTick();
    (this as unknown as { _tick: number })._tick = setInterval(() => {
      const sparkN = this.data.sparkN;
      if (sparkN >= 6) return;
      const sparkEta = Math.max(0, this.data.sparkEta - 1);
      this.setData({ sparkEta, sparkText: this.sparkTextFor(sparkN, sparkEta) });
      // refresh ONCE when the countdown elapses; the _loading guard in load() prevents this
      // from stacking a /pet read every second if the server keeps returning eta 0.
      if (sparkEta <= 0 && !(this as unknown as { _loading?: boolean })._loading) this.load();
    }, 1000) as unknown as number;
  },
  stopTick() {
    const self = this as unknown as { _tick?: number };
    if (self._tick) { clearInterval(self._tick); self._tick = undefined; }
  },
  sparkTextFor(n: number, eta: number): string {
    return n > 0 ? "接住灵感 +10 经验" : "灵感攒取中 " + fmtClock(eta);
  },
  async onSpark() {
    if ((this.data.sparkN ?? 0) <= 0) { wx.showToast({ title: "火花还在攒，过会儿来～", icon: "none" }); return; }
    if (this.data.reacting) return;
    this.haptic();
    this.setData({ reacting: true });
    try {
      const resp = await request<ActionResp & { sparkGain?: { exp: number }; promoteLine?: string }>({ path: "/pet/spark", method: "POST" });
      this.burst("✨", "pet");
      this.apply(resp);
      this.setData({ floatTag: `+${resp.sparkGain?.exp ?? 10} ✨` });
      setTimeout(() => this.setData({ floatTag: "" }), 1100);
      if (resp.promoted) setTimeout(() => wx.showToast({ title: resp.promoteLine || "它长大啦！", icon: "none", duration: 2000 }), 700);
      else this.comebackNudge(1500); // tapping the last spark can empty the growth loop → nudge a return
    } catch (e) {
      const d = ((e as ApiError).data ?? {}) as { line?: string };
      wx.showToast({ title: d.line || "火花还在攒", icon: "none" });
    } finally {
      this.setData({ reacting: false });
    }
  },

  async load() {
    const self = this as unknown as { _loading?: boolean };
    if (self._loading) return; // non-reentrant: the 1s spark ticker / rapid onShow must not stack /pet reads
    self._loading = true;
    try {
      await ensureUserId();
      const pet = await request<PetView>({ path: "/pet" });
      this.apply(pet);
      if (pet.recap) this.setData({ recap: pet.recap });
      else if (pet.checkin && pet.checkin.firstOpenToday) {
        // celebrate the daily return (otherwise +8 bond / milestone EXP land silently). Gated on
        // !recap so we don't stack a toast on top of the grew-while-away modal.
        const c = pet.checkin;
        if (c.milestoneExp > 0) wx.showToast({ title: `连续 ${c.streakDays} 天！+${c.milestoneExp} ✨`, icon: "none", duration: 2400 });
        else wx.showToast({ title: c.greet || `今天也来啦 +${c.bond}♥ · 连续 ${c.streakDays} 天`, icon: "none", duration: 1800 });
      } else this.comebackNudge(700); // opened to an all-done pet → gentle come-back nudge (once/day)
      this.setData({ loading: false, error: "" });
    } catch (e) {
      const err = e as ApiError;
      if (err.statusCode === 404) { wx.reLaunch({ url: "/pages/quiz/quiz" }); return; }
      this.setData({ loading: false, error: "和它的连接断了一下" });
    } finally {
      self._loading = false;
    }
  },

  chooseBg(pet: PetView): string {
    const h = new Date().getHours();
    if (pet.asleepNow || h >= 22 || h < 6) return "/assets/bg/night.png";
    if (h < 9) return "/assets/bg/sky.png";
    if ((pet.moodBand === "好" || pet.moodBand === "极好") && !pet.topNeed) return "/assets/bg/meadow.png";
    return "/assets/bg/room.png";
  },

  // The A-button reward chip. Prefer the server-computed reward carried on the due need
  // (exact value the tap will grant); fall back to the local estimate only if it's absent.
  rewardFor(verb: string, pet: PetView): string {
    if (verb !== "feed" && verb !== "clean" && verb !== "doctor") return ""; // affection needs give bond, no exp chip
    const need = pet.needs.find((n) => n.verb === verb);
    if (need && typeof need.rewardExp === "number") return `+${need.rewardExp} ✨`;
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
    // care needs (饿/脏/病) now surface even while asleep — caring gently wakes the pet.
    const careNeed = pet.needs.find((n) => n.kind === "unwell" || n.kind === "hungry" || n.kind === "dirty");

    // need card: voice what it wants (tap the pet/card to 摸摸).
    let needCard: string;
    if (pet.topNeed) needCard = (asleep ? "💤 睡着了…不过" : "") + pet.topNeed.label;
    else if (asleep) needCard = "💤 它睡着啦…点它轻轻摸摸就好";
    // content state: speak today's authored 心声 (the "soul") instead of a generic engine string
    else needCard = (pet.voice && pet.voice.line) || pet.needHint || "它现在很满足，点点它陪它待一会儿就好～";

    // A = 照顾: the due CARE need (feed/clean/doctor). Works even asleep (it'll gently wake it);
    // otherwise reads "照顾好啦" / "睡着啦" and a tap just reassures (no server call).
    let aVerb = "", aEmoji = "✓", aLabel = "照顾好啦", aReward = "", aGlow = false;
    if (careNeed) {
      aVerb = careNeed.verb; aGlow = true;
      aEmoji = VERB_META[aVerb]?.emoji ?? "🍙";
      aLabel = (VERB_META[aVerb]?.label ?? "照顾").replace("喂喂它", "喂食").replace("洗个澡", "洗澡").replace("看医生", "看病");
      aReward = this.rewardFor(aVerb, pet);
    } else if (asleep) { aEmoji = "💤"; aLabel = "睡着啦"; }

    // B = 陪伴: a context affection that is always valid in the form shown.
    let bVerb = "play", bEmoji = "🎮", bLabel = "陪玩";
    if (asleep) { bVerb = "sleep"; bEmoji = "🔔"; bLabel = "叫醒"; }
    else if (sick) { bVerb = "pet"; bEmoji = "💛"; bLabel = "摸摸"; }
    else if (avail["sleep"]) { bVerb = "sleep"; bEmoji = "🌙"; bLabel = "哄睡"; }

    const statBars = STAT_META.map((m) => ({ label: m.label, color: m.color, value: pet.stats[m.key] ?? 0, pct: Math.max(2, Math.min(100, pet.stats[m.key] ?? 0)) }));
    // care actions carry a 倒计时 sub-line (现在可做 / Xm后 / 状态) so a visit shows "what & when".
    const timers: Record<string, { due: boolean; etaSec: number | null; label: string }> = {};
    for (const t of pet.careTimers || []) timers[t.verb] = t;
    const lab = (v: string) => VERB_META[v].label.replace("喂喂它", "喂食").replace("洗个澡", "洗澡").replace("陪它玩", "陪玩");
    const subFor = (v: string) => { const t = timers[v]; return t ? (t.due ? "现在可做" : t.label) : ""; };
    const careActs = CARE_ROW.map((v) => ({ verb: v, emoji: VERB_META[v].emoji, label: lab(v), enabled: avail[v] !== false, due: !!timers[v]?.due, sub: subFor(v) }));
    const funActs = AFFECTION_ROW.map((v) => ({ verb: v, emoji: VERB_META[v].emoji, label: lab(v), enabled: avail[v] !== false, due: false, sub: "" }));

    const sparkN = pet.sparks ?? 0, sparkEta = pet.sparkEtaSec ?? 0;
    const comeback = this.spentState(pet) ? "🌙 今天照顾好啦～睡一觉它会悄悄长大，明天再来看看它" : "";

    this.setData({
      pet, theme: pet.theme || "cream", asleepNow: asleep, comeback,
      spriteSrc: spritePath(pet.sprite.creatureId, pet.sprite.stage, pet.sprite.mood),
      bgSrc: this.chooseBg(pet),
      animClass: this.idleAnimFor(pet),
      statusFx: this.statusFxFor(pet),
      ...(() => { const d = this.decoFor(pet); return { decoOn: d.on, decoSrc: d.src, decoStyle: d.style }; })(),
      stageLabel: STAGE_CN[pet.pet.stage] || pet.pet.stage,
      needCard, aVerb, aEmoji, aLabel, aReward, aGlow, bVerb, bEmoji, bLabel,
      roadmapLine: pet.roadmap?.line ?? "", levelPct: Math.max(3, pet.evolveProgress), levelNum: pet.level,
      growthPerDay: pet.growthPerDay, hearts: [0, 1, 2, 3, 4].map((i) => (i < pet.bondHearts ? 1 : 0)),
      bondNextPct: pet.bondNextPct ?? 0, bondNextRemaining: pet.bondNextRemaining ?? 0,
      spriteScale: pet.sizeScale ?? 1, weightKg: ((pet.weight ?? 100) / 100).toFixed(1),
      sparkN, sparkEta, sparkText: this.sparkTextFor(sparkN, sparkEta),
      careActs, funActs,
      statBars, nameInput: pet.pet.name,
    });

    // teen fork: build the 4 choosable forms (preview sprites + 推荐 marker), and auto-open the
    // chooser when the pet is waiting at the fork (unless dismissed for this load).
    const fk = pet.fork;
    if (fk) {
      const opts = fk.options.map((o) => ({ ...o, sprite: spritePath(o.speciesId, "teen", "happy") }));
      this.setData({ forkOptions: opts });
      if (fk.pending && !this.data.showFork && !this.data.forkDismissed) this.setData({ showFork: true });
    }
  },

  async doAction(verb: string) {
    if (this.data.reacting) return;
    this.setData({ reacting: true }); // keep the drawer open so 陪伴/照顾 can be tapped again
    try {
      const resp = await request<ActionResp>({ path: "/action", method: "POST", body: { verb } });
      this.burst(PARTICLE[resp.fx] || "✨", verb);
      this.apply(resp);
      this.activityPose(verb, resp); // briefly show it DOING the action (颠锅/泡泡/手柄)
      // exp case → show the TOTAL gained (gainExp = careExp + need bonus) so it matches the chip;
      // bond-only needs (sleepy/bored) → show the bond gained.
      const tag = resp.needReward ? (resp.needReward.exp ? `+${resp.gainExp ?? resp.needReward.exp} 正好需要!` : `+${resp.needReward.bond}♥ 懂它!`) : "";
      if (tag) { this.setData({ floatTag: tag }); setTimeout(() => this.setData({ floatTag: "" }), 1100); }
      if (resp.line) wx.showToast({ title: resp.line, icon: "none", duration: 1800 });
      if (resp.promoted) setTimeout(() => wx.showToast({ title: resp.promoteLine || "它长大啦！", icon: "none", duration: 2200 }), 900);
      else this.comebackNudge(1900); // just finished caring → if nothing's left to do, nudge a return (once/day)
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
  closeModals() { this.setData({ showStatus: false, showSettings: false, showRoadmap: false, showWardrobe: false }); },

  // 衣柜: list hats with unlock state; tap an unlocked one to equip/unequip (toggles).
  async openWardrobe() {
    this.setData({ showWardrobe: true, showDrawer: false, decoLoading: true });
    try {
      const r = await request<{ items: DecoItem[] }>({ path: "/deco" });
      this.setData({ decoItems: r.items || [], decoLoading: false });
    } catch { this.setData({ decoLoading: false }); wx.showToast({ title: "衣柜没打开，再试一次", icon: "none" }); }
  },
  async equipHat(e: WechatMiniprogram.TouchEvent) {
    if (this.data.reacting) return;
    const item = e.currentTarget.dataset.item as DecoItem;
    if (!item.unlocked) { wx.showToast({ title: item.lockHint || "还没解锁哦", icon: "none" }); return; }
    const hatId = item.equipped ? null : item.id; // tapping the equipped one takes it off
    this.haptic();
    this.setData({ reacting: true });
    try {
      await request({ path: "/deco/equip", method: "POST", body: { hatId } });
      const pet = this.data.pet;
      if (pet) { pet.equipped = { hat: hatId }; this.apply(pet); } // re-render the sprite overlay
      this.setData({ decoItems: this.data.decoItems.map((d) => ({ ...d, equipped: d.id === hatId })) });
      wx.showToast({ title: hatId ? "戴上啦～" : "摘下来啦", icon: "none" });
    } catch (err) {
      const d = ((err as ApiError).data ?? {}) as { line?: string };
      wx.showToast({ title: d.line || "戴不上,再试试", icon: "none" });
    } finally { this.setData({ reacting: false }); }
  },
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
      this.setData({ particles: [], animClass: pet ? this.idleAnimFor(pet) : "anim-bob" });
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
    } catch (e) {
      const data = (e as { data?: { error?: string; message?: string } })?.data || null;
      if (data?.error === "name_rejected") {
        wx.showModal({ title: "换个名字试试", content: data.message || "这个名字不太合适～", showCancel: false });
      } else {
        wx.showToast({ title: "改名失败", icon: "none" });
      }
    }
  },
});

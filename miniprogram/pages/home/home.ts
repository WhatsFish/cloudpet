import { request, type ApiError } from "../../utils/api";
import { ensureUserId } from "../../utils/auth";
import {
  cooldownText, FALLBACK_SPRITE, spritePath, STAGE_LABEL, STAT_META, VERB_LABEL,
} from "../../utils/format";

type Sprite = { creatureId: string; stage: string; mood: string; animation: string };
type Action = { verb: string; enabled: boolean; reason?: string; remainingMs?: number };
type PetView = {
  pet: { id: number; name: string; archetypeKey: string; stage: string; daysKnown: number };
  stats: Record<string, number>;
  bond: number; exp: number; expForNextStage: number | null;
  moodBand: string; badges: string[]; asleep: boolean;
  sprite: Sprite; inventory: Record<string, number>;
  streakDays: number;
  voice: { line: string; lineId: string } | null;
  actions: Action[];
};

const ANIM: Record<string, string> = {
  mochi_pudding: "anim-jiggle", ember_imp: "anim-pop", echo_fox: "anim-float",
};
const REASON_HINT: Record<string, string> = {
  locked: "长大后解锁", cooldown: "", no_item: "缺道具", done_today: "今天做过啦",
  sleeping: "睡着啦", sick: "生病中", sulking: "在闹脾气", daily_cap: "今天够啦",
};
const ITEM_LABEL: Record<string, string> = { kibble: "猫粮", snack: "零食", soap: "香皂", heart: "爱心" };

Page({
  data: {
    loading: true,
    error: "",
    pet: null as PetView | null,
    spriteSrc: "",
    animClass: "",
    stageLabel: "",
    bubble: "",
    statBars: [] as { label: string; color: string; value: number; pct: number }[],
    actionBtns: [] as { verb: string; label: string; enabled: boolean; hint: string }[],
    expPct: 0,
    items: [] as { key: string; label: string; qty: number }[],
    reacting: false,
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
      console.error("pet load failed:", err);
      this.setData({ loading: false, error: "和它的连接断了一下" });
    }
  },

  apply(pet: PetView, bubble: string) {
    const statBars = STAT_META.map((m) => {
      const v = pet.stats[m.key] ?? 0;
      return { label: m.label, color: m.color, value: v, pct: Math.max(2, Math.min(100, v)) };
    });
    const actionBtns = pet.actions.map((a) => ({
      verb: a.verb,
      label: VERB_LABEL[a.verb] ?? a.verb,
      enabled: a.enabled,
      hint: a.enabled ? "" : (a.reason === "cooldown" ? cooldownText(a.remainingMs) : (REASON_HINT[a.reason ?? ""] ?? "")),
    }));
    const expPct = pet.expForNextStage ? Math.min(100, Math.round((pet.exp / pet.expForNextStage) * 100)) : 100;
    const items = Object.keys(ITEM_LABEL).map((k) => ({ key: k, label: ITEM_LABEL[k], qty: pet.inventory[k] ?? 0 }));

    this.setData({
      pet,
      bubble,
      spriteSrc: spritePath(pet.sprite.creatureId, pet.sprite.stage, pet.sprite.mood),
      animClass: ANIM[pet.pet.archetypeKey] ?? "anim-bob",
      stageLabel: STAGE_LABEL[pet.pet.stage] ?? pet.pet.stage,
      statBars, actionBtns, expPct, items,
    });
  },

  onSpriteError() { this.setData({ spriteSrc: FALLBACK_SPRITE }); },

  async onAction(e: WechatMiniprogram.TouchEvent) {
    if (this.data.reacting) return;
    const verb = e.currentTarget.dataset.verb as string;
    const btn = this.data.actionBtns.find((b) => b.verb === verb);
    if (btn && !btn.enabled) {
      if (btn.hint) wx.showToast({ title: btn.hint, icon: "none" });
      return;
    }
    this.setData({ reacting: true });
    try {
      const resp = await request<PetView & { line: string; animation: string; rewards: Record<string, number> | null; promoted: string | null; promoteLine: string | null }>({
        path: "/action", method: "POST", body: { verb },
      });
      this.apply(resp, resp.line || this.data.bubble);
      this.bounce();
      if (resp.rewards) {
        const got = Object.entries(resp.rewards).map(([k, v]) => `${ITEM_LABEL[k] ?? k}+${v}`).join(" ");
        if (got) wx.showToast({ title: `签到 ${got}`, icon: "none" });
      }
      if (resp.promoted) {
        setTimeout(() => wx.showToast({ title: resp.promoteLine || "它长大了一点！", icon: "none" }), 600);
      }
    } catch (e2) {
      const err = e2 as ApiError;
      const data = (err.data ?? {}) as { error?: string; reason?: string; remainingMs?: number; line?: string };
      if (data.line) this.setData({ bubble: data.line });
      let msg = "它现在不想这样";
      if (data.error === "cooldown") msg = data.reason === "daily_cap" ? "今天够啦" : (data.reason === "checked_in_today" ? "今天签过到啦" : `等等再来：还要 ${cooldownText(data.remainingMs)}`);
      else if (data.reason === "locked") msg = "长大后才能解锁哦";
      else if (data.reason === "sick") msg = "它生病了，先看医生吧";
      else if (data.reason === "sulking") msg = "它在闹脾气，先哄哄";
      else if (data.error === "no_item") msg = "道具不够啦";
      wx.showToast({ title: msg, icon: "none" });
    } finally {
      this.setData({ reacting: false });
    }
  },

  bounce() {
    this.setData({ animClass: "anim-bounce" });
    setTimeout(() => {
      const pet = this.data.pet;
      if (pet) this.setData({ animClass: ANIM[pet.pet.archetypeKey] ?? "anim-bob" });
    }, 500);
  },
});

import { request, type ApiError } from "../../utils/api";
import { ensureUserId } from "../../utils/auth";
import { spritePath, STAGE_LABEL } from "../../utils/format";

const ITEM_LABEL: Record<string, string> = { kibble: "猫粮", snack: "零食", soap: "香皂", heart: "爱心" };

Page({
  data: {
    loading: true,
    noPet: false,
    name: "",
    stageLabel: "",
    daysKnown: 0,
    streakDays: 0,
    bond: 0,
    sprite: "",
    items: [] as { label: string; qty: number }[],
    editing: false,
    nameInput: "",
  },

  onShow() { this.load(); },
  async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh(); },

  async load() {
    try {
      await ensureUserId();
      const pet = await request<{
        pet: { name: string; archetypeKey: string; stage: string; daysKnown: number };
        bond: number; streakDays: number; inventory: Record<string, number>;
        sprite: { creatureId: string; stage: string; mood: string };
      }>({ path: "/pet" });
      this.setData({
        loading: false, noPet: false,
        name: pet.pet.name,
        stageLabel: STAGE_LABEL[pet.pet.stage] ?? pet.pet.stage,
        daysKnown: pet.pet.daysKnown,
        streakDays: pet.streakDays,
        bond: pet.bond,
        sprite: spritePath(pet.sprite.creatureId, pet.sprite.stage, pet.sprite.mood),
        items: Object.keys(ITEM_LABEL).map((k) => ({ label: ITEM_LABEL[k], qty: pet.inventory[k] ?? 0 })),
        nameInput: pet.pet.name,
      });
    } catch (e) {
      if ((e as ApiError).statusCode === 404) { this.setData({ loading: false, noPet: true }); return; }
      console.error("me load failed", e);
      this.setData({ loading: false });
    }
  },

  startEdit() { this.setData({ editing: true, nameInput: this.data.name }); },
  onNameInput(e: WechatMiniprogram.Input) { this.setData({ nameInput: e.detail.value }); },

  async saveName() {
    const name = (this.data.nameInput || "").trim();
    if (name.length < 1 || name.length > 12) { wx.showToast({ title: "1-12 个字哦", icon: "none" }); return; }
    try {
      await request({ path: "/pet/rename", method: "POST", body: { name } });
      this.setData({ name, editing: false });
      wx.showToast({ title: "改好啦", icon: "none" });
    } catch (e) {
      console.error("rename failed", e);
      wx.showToast({ title: "改名失败", icon: "none" });
    }
  },

  goQuiz() { wx.reLaunch({ url: "/pages/quiz/quiz" }); },
});

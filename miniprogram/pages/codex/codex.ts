import { request, type ApiError } from "../../utils/api";
import { ensureUserId } from "../../utils/auth";
import { spritePath } from "../../utils/format";

// 4 V4 evolution lines (mirrors web/src/data/lines.json). Each: true form + the 3
// care-branch variants it can grow into. Shown at the teen (V4-ceiling) stage.
const LINES = [
  { key: "mochi_pudding", name: "抖抖布丁", forms: [
    { id: "mochi_pudding", label: "本形", lean: "均衡养" },
    { id: "mochi_pudding__brim", label: "圆奶冻", lean: "喂食多" },
    { id: "mochi_pudding__hop", label: "跳跳冻", lean: "洗澡多" },
    { id: "mochi_pudding__ward", label: "守心冻", lean: "看医生" },
  ] },
  { key: "echo_fox", name: "墨影狐", forms: [
    { id: "echo_fox", label: "本形", lean: "均衡养" },
    { id: "echo_fox__plush", label: "绒裘狐", lean: "喂食多" },
    { id: "echo_fox__swift", label: "流影狐", lean: "洗澡多" },
    { id: "echo_fox__ward", label: "守灯狐", lean: "看医生" },
  ] },
  { key: "ember_imp", name: "炸毛团", forms: [
    { id: "ember_imp", label: "本形", lean: "均衡养" },
    { id: "ember_imp__brimimp", label: "饱嗝魔", lean: "喂食多" },
    { id: "ember_imp__crackle", label: "噼啪魔", lean: "洗澡多" },
    { id: "ember_imp__forge", label: "炉心魔", lean: "看医生" },
  ] },
  { key: "sproutling", name: "探探芽", forms: [
    { id: "sproutling", label: "本形", lean: "均衡养" },
    { id: "sproutling__harvest", label: "饱穗芽", lean: "喂食多" },
    { id: "sproutling__gust", label: "风信芽", lean: "洗澡多" },
    { id: "sproutling__dorm", label: "眠墩芽", lean: "看医生" },
  ] },
];

type Form = { id: string; label: string; lean: string; sprite: string };
type Line = { key: string; name: string; bonded: boolean; forms: Form[] };

Page({
  data: { lines: [] as Line[] },

  onShow() { this.load(); },

  async load() {
    let bondedKey = "";
    try {
      await ensureUserId();
      const pet = await request<{ pet: { archetypeKey: string } }>({ path: "/pet" });
      bondedKey = pet.pet.archetypeKey;
    } catch (e) {
      if ((e as ApiError).statusCode !== 404) console.error(e);
    }
    const lines: Line[] = LINES.map((l) => ({
      key: l.key, name: l.name, bonded: l.key === bondedKey,
      forms: l.forms.map((f) => ({ ...f, sprite: spritePath(f.id, "teen", "idle") })),
    }));
    this.setData({ lines });
  },
});

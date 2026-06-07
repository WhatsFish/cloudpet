import { request, type ApiError } from "../../utils/api";
import { ensureUserId } from "../../utils/auth";
import { spritePath } from "../../utils/format";

// V7 roster: 5 creatures (mirrors web/src/data/lines.json). Each: true form + the 3
// care-branch variants it can grow into. Shown at the teen (V4-ceiling) stage.
const LINES = [
  { key: "puff", name: "奶团", forms: [
    { id: "puff", label: "本形", lean: "均衡养" },
    { id: "puff__round", label: "圆奶团", lean: "喂食多" },
    { id: "puff__bunny", label: "兔耳团", lean: "洗澡多" },
    { id: "puff__horn", label: "独角团", lean: "看医生" },
  ] },
  { key: "claude", name: "克劳德", forms: [
    { id: "claude", label: "本形", lean: "均衡养" },
    { id: "claude__round", label: "饱墩克", lean: "喂食多" },
    { id: "claude__curl", label: "卷须克", lean: "洗澡多" },
    { id: "claude__ears", label: "团耳克", lean: "看医生" },
  ] },
  { key: "blocky", name: "方头崽", forms: [
    { id: "blocky", label: "本形", lean: "均衡养" },
    { id: "blocky__round", label: "胖方崽", lean: "喂食多" },
    { id: "blocky__antenna", label: "天线崽", lean: "洗澡多" },
    { id: "blocky__wing", label: "飞翅崽", lean: "看医生" },
  ] },
  { key: "penguin", name: "波波企鹅", forms: [
    { id: "penguin", label: "本形", lean: "均衡养" },
    { id: "penguin__round", label: "圆肚企鹅", lean: "喂食多" },
    { id: "penguin__crest", label: "呆毛企鹅", lean: "洗澡多" },
    { id: "penguin__fluff", label: "绒球企鹅", lean: "看医生" },
  ] },
  { key: "bear", name: "墩墩熊", forms: [
    { id: "bear", label: "本形", lean: "均衡养" },
    { id: "bear__round", label: "饱墩熊", lean: "喂食多" },
    { id: "bear__roundear", label: "圆耳熊", lean: "洗澡多" },
    { id: "bear__ahoge", label: "呆毛熊", lean: "看医生" },
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

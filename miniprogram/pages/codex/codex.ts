import { request, type ApiError } from "../../utils/api";
import { ensureUserId } from "../../utils/auth";
import { spritePath } from "../../utils/format";

// V8 roster: 6 creatures (mirrors web/src/data/lines.json). Each: a true form + 3 named
// variant forms it can grow into. The form is the PLAYER's choice at the teen fork — it is
// NOT decided by how you care for the pet. penguin/bear/seal's 3 forms are real related
// species. Shown at the teen (V8-ceiling) stage.
const LINES = [
  { key: "puff", name: "奶团", forms: [
    { id: "puff", label: "本形", isTrue: true },
    { id: "puff__round", label: "圆奶团" },
    { id: "puff__bunny", label: "兔耳团" },
    { id: "puff__horn", label: "独角团" },
  ] },
  { key: "claude", name: "克劳德", forms: [
    { id: "claude", label: "本形", isTrue: true },
    { id: "claude__round", label: "饱墩克" },
    { id: "claude__curl", label: "卷须克" },
    { id: "claude__ears", label: "团耳克" },
  ] },
  { key: "blocky", name: "方头崽", forms: [
    { id: "blocky", label: "本形", isTrue: true },
    { id: "blocky__round", label: "胖方崽" },
    { id: "blocky__antenna", label: "天线崽" },
    { id: "blocky__wing", label: "飞翅崽" },
  ] },
  { key: "penguin", name: "波波企鹅", forms: [
    { id: "penguin", label: "本形", isTrue: true },
    { id: "penguin__emperor", label: "帝企鹅" },
    { id: "penguin__rockhopper", label: "跳岩企鹅" },
    { id: "penguin__galapagos", label: "加拉帕戈斯" },
  ] },
  { key: "bear", name: "墩墩熊", forms: [
    { id: "bear", label: "本形", isTrue: true },
    { id: "bear__brown", label: "棕熊崽" },
    { id: "bear__polar", label: "北极熊崽" },
    { id: "bear__panda", label: "熊猫崽" },
  ] },
  { key: "seal", name: "团团海豹", forms: [
    { id: "seal", label: "本形", isTrue: true },
    { id: "seal__harp", label: "雪团" },
    { id: "seal__elephant", label: "阔鼻" },
    { id: "seal__leopard", label: "豹斑" },
  ] },
];

type Form = { id: string; label: string; isTrue?: boolean; sprite: string };
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

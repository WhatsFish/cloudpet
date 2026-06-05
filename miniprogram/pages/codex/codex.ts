import { request, type ApiError } from "../../utils/api";
import { ensureUserId } from "../../utils/auth";
import { spritePath } from "../../utils/format";

const ARCHETYPES: { key: string; name: string }[] = [
  { key: "mochi_pudding", name: "抖抖布丁" },
  { key: "echo_fox", name: "墨影狐" },
  { key: "ember_imp", name: "炸毛团" },
  { key: "sproutling", name: "探探芽" },
  { key: "puff_seal", name: "奶昔豹" },
  { key: "stone_egg", name: "闷石墩" },
  { key: "wisp_moth", name: "提灯蛾" },
  { key: "clay_golem", name: "陶墩墩" },
  { key: "spark_sprite", name: "噼啪豆" },
  { key: "dream_jelly", name: "梦漂漂" },
];
// Only these 3 are fully built in V1; the rest are previews.
const SHIPPED = new Set(["mochi_pudding", "echo_fox", "ember_imp"]);

Page({
  data: {
    list: [] as { key: string; name: string; sprite: string; bonded: boolean; shipped: boolean }[],
  },

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
    const list = ARCHETYPES.map((a) => ({
      key: a.key, name: a.name,
      sprite: spritePath(a.key, "child", "idle"),
      bonded: a.key === bondedKey,
      shipped: SHIPPED.has(a.key),
    }));
    this.setData({ list });
  },
});

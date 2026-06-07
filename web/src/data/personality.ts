// The shared personality spine. Three axes; ten archetypes as fixed anchor points
// in axis space. The onboarding quiz produces an AxisVector and matches it to the
// nearest anchor (express-weighted). See PLAN §3 / §6.

import type { Archetype, AxisVector } from "@/lib/types";

export const AXES = [
  { key: "attach", nameCN: "黏人 ↔ 独立", low: "独立", high: "黏人" },
  { key: "curio", nameCN: "好奇 ↔ 安稳", low: "安稳", high: "好奇" },
  { key: "express", nameCN: "理性 ↔ 撒娇", low: "理性", high: "撒娇" },
] as const;

// express most determines the felt "voice", so it is weighted highest in matching.
export const MATCH_WEIGHTS = { attach: 1.0, curio: 1.0, express: 1.3 } as const;

// Anchors are the rebalanced set from PLAN §6 (validated by the enumeration test
// in scripts/quiz-distribution-test.mjs — no archetype < ~6% or > ~16%).
export const ARCHETYPES: Archetype[] = [
  { key: "mochi_pudding", nameCN: "抖抖布丁", anchor: { attach: 6, curio: -5, express: 6 },
    vibe: "黏人暖团子，一切照旧就最幸福", coreNeed: "稳定的陪伴与抱抱" },
  { key: "sproutling", nameCN: "探探芽", anchor: { attach: 4, curio: 8, express: -3 },
    vibe: "顶着好奇雷达，安安静静拉你去看看", coreNeed: "和你一起发现新鲜事" },
  { key: "ember_imp", nameCN: "炸毛团", anchor: { attach: 6, curio: 3, express: 8 },
    vibe: "一点就炸、一哄就笑的小火球", coreNeed: "被立刻回应的实时存在感" },
  { key: "stone_egg", nameCN: "闷石墩", anchor: { attach: 0, curio: -6, express: -6 },
    vibe: "慢吞吞冷面金句，最省心", coreNeed: "不被打扰的安稳与可预测节奏" },
  { key: "echo_fox", nameCN: "墨影狐", anchor: { attach: -6, curio: 6, express: -5 },
    vibe: "高冷清贵，爱要靠你赢来", coreNeed: "被尊重的距离感 + 智识新鲜" },
  { key: "puff_seal", nameCN: "奶昔豹", anchor: { attach: 6, curio: 0, express: 4 },
    vibe: "软如奶盖，见你就拱来求摸", coreNeed: "持续的温柔接触与被需要感" },
  { key: "wisp_moth", nameCN: "提灯蛾", anchor: { attach: -3, curio: 6, express: 1 },
    vibe: "白天蔫、夜里亮的提灯小蛾", coreNeed: "在它的时间（夜晚）被看见" },
  { key: "clay_golem", nameCN: "陶墩墩", anchor: { attach: 4, curio: -5, express: -3 },
    vibe: "笨手笨脚却忠心守着你", coreNeed: "被托付的责任感与稳定羁绊" },
  { key: "spark_sprite", nameCN: "噼啪豆", anchor: { attach: 0, curio: 6, express: 7 },
    vibe: "停不下来的电气小豆，自嗨拉你下水", coreNeed: "释放过剩精力的玩的舞台" },
  { key: "dream_jelly", nameCN: "梦漂漂", anchor: { attach: -4, curio: -4, express: 1 },
    vibe: "慢飘的水母，伞盖浮一片星云", coreNeed: "被理解的内心 + 不被催促的留白" },
];

const BY_KEY = new Map(ARCHETYPES.map((a) => [a.key, a]));

export function archetype(key: string): Archetype {
  const a = BY_KEY.get(key);
  if (!a) throw new Error(`unknown archetype: ${key}`);
  return a;
}

export function isArchetype(key: string): boolean {
  return BY_KEY.has(key);
}

/** Express-weighted squared distance between a vector and an anchor. */
export function weightedDist2(v: AxisVector, anchor: AxisVector): number {
  const da = v.attach - anchor.attach;
  const dc = v.curio - anchor.curio;
  const de = v.express - anchor.express;
  return MATCH_WEIGHTS.attach * da * da + MATCH_WEIGHTS.curio * dc * dc + MATCH_WEIGHTS.express * de * de;
}

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
// V7 roster: 5 creatures, one per design language. Anchors spread across the 3 axes so
// the quiz routes to all 5. (Old 10 archetypes retired — see lines.json.)
export const ARCHETYPES: Archetype[] = [
  { key: "puff", nameCN: "奶团", anchor: { attach: 7, curio: -4, express: 5 },
    vibe: "软乎乎黏人团子，一切照旧最幸福", coreNeed: "稳稳的陪伴与抱抱" },
  { key: "claude", nameCN: "克劳德", anchor: { attach: 3, curio: 7, express: 1 },
    vibe: "好奇又淡定，爱捣鼓爱陪你做事", coreNeed: "和你一起鼓捣新鲜事" },
  { key: "blocky", nameCN: "方头崽", anchor: { attach: -3, curio: -6, express: -6 },
    vibe: "复古冷面，话少金句最省心", coreNeed: "不被打扰的安稳节奏" },
  { key: "penguin", nameCN: "波波企鹅", anchor: { attach: -5, curio: 5, express: -3 },
    vibe: "高冷优雅，慢条斯理看世界", coreNeed: "被尊重的距离感" },
  { key: "bear", nameCN: "墩墩熊", anchor: { attach: 5, curio: 3, express: 8 },
    vibe: "大大咧咧傻乐，热闹又黏人", coreNeed: "随时被回应的实时热闹" },
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

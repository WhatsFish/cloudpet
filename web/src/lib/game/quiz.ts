// Quiz scoring + reveal. Sum the scored options into an axis vector, then match to
// the nearest SHIPPED creature (V1 routes only among the 3 built creatures — a
// vector closest to a non-shipped archetype still resolves to its nearest shipped
// neighbour by the same express-weighted distance, so the user always meets a real,
// voice-true pet). Tiebreak chain per PLAN §6.

import type { AxisVector } from "@/lib/types";
import { ARCHETYPES, MATCH_WEIGHTS, archetype, weightedDist2 } from "@/data/personality";
import { LINE_HEADS, reachableFor, speciesName } from "@/lib/game/evolve";
import { QUIZ } from "@/data/quiz-questions";

const EPS = 2.0;

export type QuizScore = {
  vector: AxisVector;
  archetypeKey: string; // bonded SEED creature (one of the shipped) — the baby you meet
  reveal: { title: string; lines: string[] };
  reachable: { id: string; name: string }[]; // V3: the forms it could grow into (care decides)
};

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function scoreVector(answers: Record<string, string>): AxisVector {
  const v: AxisVector = { attach: 0, curio: 0, express: 0 };
  for (const q of QUIZ) {
    if (!q.scored) continue;
    const chosen = answers[q.id];
    const opt = q.options.find((o) => o.id === chosen);
    if (!opt?.w) continue;
    v.attach += opt.w.attach ?? 0;
    v.curio += opt.w.curio ?? 0;
    v.express += opt.w.express ?? 0;
  }
  return v;
}

function loudestAxis(v: AxisVector): "attach" | "curio" | "express" {
  const score = {
    attach: Math.abs(v.attach) * MATCH_WEIGHTS.attach,
    curio: Math.abs(v.curio) * MATCH_WEIGHTS.curio,
    express: Math.abs(v.express) * MATCH_WEIGHTS.express,
  };
  let best: "attach" | "curio" | "express" = "express";
  if (score.attach > score[best]) best = "attach";
  if (score.curio > score[best]) best = "curio";
  if (score.express > score[best]) best = "express";
  return best;
}

export function matchShipped(v: AxisVector, answers: Record<string, string>, userId: string): string {
  // V4: match among the 4 LINE HEADS (each a quiz archetype + an evolution line).
  const ranked = LINE_HEADS
    .map((key) => ({ key, d: weightedDist2(v, archetype(key).anchor) }))
    .sort((a, b) => a.d - b.d);

  // 1) clear winner
  if (ranked.length === 1 || ranked[1].d - ranked[0].d > EPS) return ranked[0].key;

  // tied within EPS
  const best = ranked[0].d;
  const tied = ranked.filter((r) => r.d - best <= EPS).map((r) => r.key);

  // 2) loudest axis: pick the tied anchor closest on that single axis
  const axis = loudestAxis(v);
  let byAxis = tied
    .map((key) => ({ key, da: Math.abs(v[axis] - archetype(key).anchor[axis]) }))
    .sort((a, b) => a.da - b.da);
  if (byAxis.length === 1 || byAxis[0].da !== byAxis[1].da) return byAxis[0].key;

  // 3) Q7 wildcard nudges toward a creature
  const wild = QUIZ.find((q) => q.id === "q7")?.options.find((o) => o.id === answers["q7"]);
  const favored = (wild?.map ?? []).filter((k) => tied.includes(k));
  if (favored.length === 1) return favored[0];

  // 4) stable hash fallback (never random-feeling; same answers+user → same pet)
  const idx = hashStr(userId + "|" + JSON.stringify(answers)) % tied.length;
  return tied[idx];
}

const USER_MIRROR: Record<string, { pos: string; neg: string }> = {
  attach: { pos: "你比谁都怕一个人。", neg: "你享受一个人的自在。" },
  curio: { pos: "你对没见过的一切都好奇。", neg: "你最安心的，是熟悉和不变。" },
  express: { pos: "你的情绪藏不住，开心就想让全世界知道。", neg: "你把在乎放在心里，不轻易说出口。" },
};

// V3: the bonded baby is a starting point, not a fixed identity. The intro frames the
// adult form as "what you'll grow into together" (care decides), never a creature that
// later swaps — the panel's bait-and-switch mitigation.
const CREATURE_INTRO: Record<string, string> = {
  puff: "于是，一只软乎乎、把你当成全世界的「奶团」赖进了你手心里。它会长成什么样子，全看你往后怎么疼它。",
  claude: "于是，一只好奇又淡定的「克劳德」认下了你——它爱捣鼓、爱陪你做事。往后长成什么样，藏在你们一起折腾的日子里。",
  blocky: "于是，一只方头方脑、冷面又靠谱的「方头崽」选中了你。它话不多，但你的节奏它都记着。",
  penguin: "于是，一只高冷优雅的「波波企鹅」慢悠悠踱到你身边。它的偏爱要你慢慢赢，而那正是它珍贵的地方。",
  bear: "于是，一只顶着大红脸蛋、傻乎乎直乐的「墩墩熊」一头扑进你怀里。它要的，是你随时都在。",
  seal: "于是，一只圆滚滚、憨憨的「团团海豹」慢悠悠挪到你脚边，一声不吭地贴住了你。它不爱说话，却会一直一直黏着你。",
};

export function reveal(v: AxisVector, archetypeKey: string): { title: string; lines: string[] } {
  const axis = loudestAxis(v);
  const sign = v[axis] >= 0 ? "pos" : "neg";
  const mirror = USER_MIRROR[axis][sign as "pos" | "neg"];
  const intro = CREATURE_INTRO[archetypeKey] ?? "于是，它找到了你。接下来怎么长，要看你怎么养。";
  return { title: `你的本命宝宝 · ${archetype(archetypeKey).nameCN}`, lines: [mirror, intro] };
}

export function scoreQuiz(answers: Record<string, string>, userId: string): QuizScore {
  const vector = scoreVector(answers);
  const archetypeKey = matchShipped(vector, answers, userId);
  const reachable = reachableFor(archetypeKey).map((id) => ({ id, name: speciesName(id) }));
  return { vector, archetypeKey, reveal: reveal(vector, archetypeKey), reachable };
}

// re-export for callers/tests
export { ARCHETYPES };

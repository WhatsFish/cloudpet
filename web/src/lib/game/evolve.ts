// V3 / Model C — care-history-driven divergent evolution.
//
// The quiz still bonds you to a NAMED baby (the "seed" archetype) on day 1. But HOW you
// raise it then steers which form it grows into at the teen fork. For each V1 seed, the
// care behaviour you favour most grows the pet into a specific, on-theme member of the
// roster; balanced care → it stays its own true form. The three seeds' branches together
// span ALL TEN creatures, so the whole bestiary is the payoff for how you raise it.
// Pure, deterministic, no LLM. This is the mechanic that makes care decisions MATTER.

import type { CareCounts, NurtureLean, NurtureTilt } from "@/lib/types";
import { archetype } from "@/data/personality";

// seed → (dominant care lean → destination creature). balanced is implicit (→ seed).
// Authored for legibility + guaranteed visible divergence; spans the full roster:
//   mochi: puff/ember/dream/clay · echo: sprout/spark/wisp/stone · ember: mochi/spark/puff/clay
const BRANCH: Record<string, Partial<Record<NurtureLean, string>>> = {
  mochi_pudding: { feed: "puff_seal", play: "ember_imp", clean: "dream_jelly", doctor: "clay_golem" },
  echo_fox: { feed: "sproutling", play: "spark_sprite", clean: "wisp_moth", doctor: "stone_egg" },
  ember_imp: { feed: "mochi_pudding", play: "spark_sprite", clean: "puff_seal", doctor: "clay_golem" },
};

const KINDS: [Exclude<NurtureLean, "balanced">, keyof CareCounts][] = [
  ["feed", "feed"], ["clean", "clean"], ["doctor", "doctor"], ["play", "affection"],
];

// Seeds that have an authored branch tree (the V1 quiz-reachable seeds).
export const SEED_KEYS = Object.keys(BRANCH);

// The branch tree for a seed (for the codex / onboarding preview): which care lean grows
// it into which form. Balanced (→ the seed's own true form) is implicit.
export function branchesFor(seedKey: string): { lean: Exclude<NurtureLean, "balanced">; speciesId: string }[] {
  const b = BRANCH[seedKey] ?? {};
  return (["feed", "clean", "doctor", "play"] as const)
    .filter((l) => b[l]).map((l) => ({ lean: l, speciesId: b[l]! }));
}

// Which care leans hardest. Needs a few interactions AND a clear lead, else "balanced".
export function dominantLean(care: CareCounts): NurtureLean {
  const total = care.feed + care.clean + care.doctor + care.affection;
  if (total < 4) return "balanced";
  const ranked = KINDS.map(([lean, k]) => [lean, care[k]] as [NurtureLean, number]).sort((a, b) => b[1] - a[1]);
  const [top, second] = ranked;
  return top[1] > 0 && top[1] - second[1] >= 2 ? top[0] : "balanced";
}

// The form the pet is growing toward given its care so far. Balanced → its true (seed)
// form; a decisive lean → the authored destination. Used for BOTH the live 养育倾向 meter
// and the teen-gate resolution, so they always agree.
export function resolveSpecies(seedKey: string, care: CareCounts): string {
  const lean = dominantLean(care);
  if (lean === "balanced") return seedKey;
  return BRANCH[seedKey]?.[lean] ?? seedKey;
}

// All forms reachable from a seed (true form + its branch destinations), deduped — for
// the codex / onboarding preview.
export function reachableFor(seedKey: string): string[] {
  return [...new Set<string>([seedKey, ...Object.values(BRANCH[seedKey] ?? {})])];
}

const VERB_CN: Record<Exclude<NurtureLean, "balanced">, string> = {
  feed: "喂食", clean: "洗澡", doctor: "看医生", play: "陪玩",
};

// The legibility surface: which care leans hardest, and where it is heading — shown on
// the home screen so the consequence of care is felt from week 1, not deferred to teen.
export function nurtureTilt(seedKey: string, care: CareCounts): NurtureTilt {
  const total = care.feed + care.clean + care.doctor + care.affection;
  const leaning = dominantLean(care);
  const toward = resolveSpecies(seedKey, care);
  const towardName = archetype(toward).nameCN;
  const shares: CareCounts = total > 0
    ? { feed: care.feed / total, clean: care.clean / total, doctor: care.doctor / total, affection: care.affection / total }
    : { feed: 0, clean: 0, doctor: 0, affection: 0 };

  let label: string;
  if (total < 4) label = "再多照顾它几次，就能看出它在往哪儿长啦 🌱";
  else if (leaning === "balanced") label = `照顾得很均衡 → 正长成本来的样子「${towardName}」`;
  else label = `你更常${VERB_CN[leaning as Exclude<NurtureLean, "balanced">]} → 正长成「${towardName}」`;

  return { leaning, towardSpeciesId: toward, towardName, shares, label };
}

// V4 / within-lineage divergent evolution.
//
// A pet is bonded to a LINE head (= its quiz archetype). How you raise it steers the
// TEEN fork into a variant OF ITSELF — never a different species. The care kinds collapse
// to 3 branches: feed → 丰裕形, engage (洗澡 + 陪玩/摸) → 敏捷形, tend (看医生) → 守护形;
// balanced care → the line's own true form. Reads web/src/data/lines.json (the same
// source the art engine uses), so the rule always matches the rendered sprites. Pure,
// deterministic, no LLM.

import type { CareCounts, NurtureLean, NurtureTilt } from "@/lib/types";
import linesData from "@/data/lines.json";

type Branch = { variant: string; name: string; blurb: string };
type Line = { name: string; accent: string; trueBlurb: string; branches: { feed: Branch; engage: Branch; tend: Branch } };
const LINES = linesData.lines as Record<string, Line>;

export const LINE_HEADS = Object.keys(LINES);

// the display name of any species_id (line head or `<line>__<variant>`)
export function speciesName(speciesId: string): string {
  const [line, variant] = speciesId.split("__");
  const L = LINES[line];
  if (!L) return speciesId;
  if (!variant) return L.name;
  for (const b of Object.values(L.branches)) if (b.variant === variant) return b.name;
  return L.name;
}

type CareBranch = Exclude<NurtureLean, "balanced">;

// Which care branch dominates. Driven ONLY by the 3 gated CARE actions (feed→丰裕,
// 洗澡→敏捷, 看医生→守护) — play/pet stay free and decoupled from growth, so they never
// steer the form. Equal care → balanced (true form). Needs a few care acts AND a clear lead.
export function careBranch(care: CareCounts): NurtureLean {
  const g: Record<CareBranch, number> = { feed: care.feed, engage: care.clean, tend: care.doctor };
  const total = g.feed + g.engage + g.tend;
  if (total < 6) return "balanced";
  const ranked = (["feed", "engage", "tend"] as CareBranch[]).map((k) => [k, g[k]] as [CareBranch, number]).sort((a, b) => b[1] - a[1]);
  const [top, second] = ranked;
  return top[1] > 0 && top[1] - second[1] >= 2 ? top[0] : "balanced";
}

// The species the pet is growing toward given its care so far. Balanced → the line head
// (true form); a decisive branch → `<line>__<variant>`. Used for BOTH the teen-gate
// resolution and the live 养育倾向 meter, so they always agree.
export function resolveSpecies(line: string, care: CareCounts): string {
  const b = careBranch(care);
  if (b === "balanced") return line;
  const variant = LINES[line]?.branches?.[b]?.variant;
  return variant ? `${line}__${variant}` : line;
}

// All forms reachable from a line: its true form + the 3 branch variants. For the
// onboarding reveal / preview.
export function reachableFor(line: string): string[] {
  const L = LINES[line];
  if (!L) return [line];
  return [line, ...Object.values(L.branches).map((b) => `${line}__${b.variant}`)];
}

const LEAN_CN: Record<CareBranch, string> = { feed: "喂食", engage: "洗澡梳理", tend: "看医生" };

// The legibility surface: which care leans hardest + where it is heading. Shown on the
// home screen so the consequence of care is felt early, not only at the teen fork.
export function nurtureTilt(line: string, care: CareCounts): NurtureTilt {
  const total = care.feed + care.clean + care.doctor; // affection is free, doesn't steer the form
  const leaning = careBranch(care);
  const toward = resolveSpecies(line, care);
  const towardName = speciesName(toward);
  const shares: CareCounts = total > 0
    ? { feed: care.feed / total, clean: care.clean / total, doctor: care.doctor / total, affection: care.affection / total }
    : { feed: 0, clean: 0, doctor: 0, affection: 0 };

  let label: string;
  if (total < 6) label = "再多照顾它几次，就能看出它在往哪儿长啦 🌱";
  else if (leaning === "balanced") label = `照顾得很均衡 → 正长成本来的样子「${towardName}」`;
  else label = `你更常${LEAN_CN[leaning as CareBranch]} → 正长成「${towardName}」`;

  return { leaning, towardSpeciesId: toward, towardName, shares, label };
}

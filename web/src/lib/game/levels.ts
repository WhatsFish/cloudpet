// Level is DERIVED from EXP at read time (no column).
//
// V2 §2 curve — per-level gap grows so leveling stays meaningful into the endgame and a 1–2
// login/day player reaches Lv30 ≈ day 50 (instead of the old flat curve that gave 1–2 levels
// every login). Stage gates (web/src/data/stage-table.ts) are unchanged — only the level number
// and the per-level pacing move; new pets' stage timing is identical to before.
//
//   gap(n)        = round(90 + 20·n + 1.1·n²)      // EXP from Lv n → n+1
//   expToReach(N) = Σ gap(1..N-1)                  // cumulative EXP to REACH Lv N (Lv1 = 0)
//
// A one-time migration (scripts/migrate-exp-v2.mjs) repositions existing pets' stored EXP so the
// curve swap does NOT drop anyone's displayed level (preserves level + in-level progress fraction).

const MAX_LV = 200;
const gap = (n: number): number => Math.round(90 + 20 * n + 1.1 * n * n);

// REACH[L] = cumulative EXP to reach level L. REACH[1] = 0.
const REACH: number[] = (() => {
  const a = [0, 0]; // index 0 unused, a[1]=0
  for (let L = 2; L <= MAX_LV + 1; L++) a[L] = a[L - 1] + gap(L - 1);
  return a;
})();

export function expToReach(level: number): number {
  if (level <= 1) return 0;
  if (level <= MAX_LV) return REACH[level];
  // linear continuation past the table (defensive; never hit in practice)
  return REACH[MAX_LV] + gap(MAX_LV) * (level - MAX_LV);
}

export function levelFromExp(exp: number): number {
  const e = Math.max(0, exp);
  let lv = 1;
  while (lv < MAX_LV && REACH[lv + 1] <= e) lv++;
  return lv;
}

/** Progress (0–100) through the CURRENT level toward the next. */
export function levelProgress(exp: number): number {
  const lv = levelFromExp(exp);
  const lo = expToReach(lv);
  const hi = expToReach(lv + 1);
  if (hi <= lo) return 100;
  return Math.max(0, Math.min(100, Math.round(((exp - lo) / (hi - lo)) * 100)));
}

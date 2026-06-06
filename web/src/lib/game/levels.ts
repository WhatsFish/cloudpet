// Level is DERIVED from EXP at read time (no column). Mild quadratic curve so Lv
// ticks up almost every day even past the V1 art ceiling (PLAN/REDESIGN_V2 §4).
//   expToReach(N) = 60·(N−1) + 10·(N−1)²
//   Lv(exp)       = 1 + floor( (−60 + sqrt(3600 + 40·exp)) / 20 )

export function expToReach(level: number): number {
  const n = level - 1;
  return 60 * n + 10 * n * n;
}

export function levelFromExp(exp: number): number {
  return 1 + Math.floor((-60 + Math.sqrt(3600 + 40 * Math.max(0, exp))) / 20);
}

/** Progress (0–100) through the CURRENT level toward the next. */
export function levelProgress(exp: number): number {
  const lv = levelFromExp(exp);
  const lo = expToReach(lv);
  const hi = expToReach(lv + 1);
  if (hi <= lo) return 100;
  return Math.max(0, Math.min(100, Math.round(((exp - lo) / (hi - lo)) * 100)));
}

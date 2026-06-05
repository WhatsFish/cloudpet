// The copy selector — the rule-based "soul". Pure functions: given an event + a
// CopyContext, pick an on-voice line from the creature's pack, filtered by the
// line's `requires`, with a fallback chain so a pool is never empty, then fill
// archetype-scoped {slots} + engine tokens (PLAN §7.1 / §7.3).

import type { CopyContext, CopyLine, CopyRequires, CreatureCopyPack, DiaryPart } from "@/lib/types";
import { STATE } from "@/lib/types";

const FLAG_BIT: Record<string, number> = {
  SICK: STATE.SICK, SULKING: STATE.SULKING, HIDING: STATE.HIDING, LONELY: STATE.LONELY,
};

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function requiresMatch(req: CopyRequires | undefined, ctx: CopyContext): boolean {
  if (!req) return true;
  if (req.stage && !req.stage.includes(ctx.stage)) return false;
  if (req.moodBand && !req.moodBand.includes(ctx.moodBand)) return false;
  if (req.timeBand && !req.timeBand.includes(ctx.timeBand)) return false;
  if (req.stateFlag) {
    const ok = req.stateFlag.some((f) =>
      f === "none" ? ctx.stateFlags === 0 : (ctx.stateFlags & (FLAG_BIT[f] ?? 0)) !== 0,
    );
    if (!ok) return false;
  }
  if (req.streakMin != null && ctx.streakDays < req.streakMin) return false;
  if (req.bondMin != null && ctx.bond < req.bondMin) return false;
  if (req.daysMin != null && ctx.daysKnown < req.daysMin) return false;
  if (req.pattern && !req.pattern.some((p) => ctx.pattern.includes(p))) return false;
  return true;
}

function weightedPick<T extends { weight?: number }>(pool: T[], rng: () => number): T {
  const total = pool.reduce((a, x) => a + (x.weight ?? 1), 0);
  let r = rng() * total;
  for (const x of pool) {
    r -= x.weight ?? 1;
    if (r <= 0) return x;
  }
  return pool[pool.length - 1];
}

function pickString(pool: string[], rng: () => number): string {
  if (pool.length === 0) return "";
  return pool[Math.floor(rng() * pool.length) % pool.length];
}

function fillSlots(text: string, pack: CreatureCopyPack, ctx: CopyContext, rng: () => number): string {
  return text.replace(/\{([a-zA-Z_]+)\}/g, (_, key: string) => {
    if (key === "streak") return String(ctx.streakDays);
    if (key === "days") return String(ctx.daysKnown);
    if (key === "bond") return String(ctx.bond);
    const pool = pack.slots[key];
    if (pool && pool.length) return pickString(pool, rng);
    return ""; // unknown token → drop quietly
  });
}

// Fallback families so a never-authored event still resolves to something on-voice.
const FALLBACK: Record<string, string[]> = {
  "greet.return": ["greet.open"],
  "greet.return_long": ["greet.open"],
  "greet.morning": ["greet.open"],
  "greet.latenight": ["greet.open", "idle.mutter"],
  "feed.neutral": ["feed.love"],
  "feed.dislike": ["feed.neutral", "feed.love"],
  "feed.overfed": ["feed.neutral", "feed.love"],
  "feed.sick_refuse": ["state.sick", "idle.mutter"],
  "snack": ["feed.love"],
  "play.declined": ["idle.mutter"],
  "mood.elated": ["greet.open"],
  "beg.want": ["idle.mutter"],
  "growth.promote": ["mood.elated", "greet.open"],
  "streak.milestone": ["checkin", "mood.elated"],
  "reunion.gift": ["greet.return_long"],
  "name.given": ["greet.open"],
};

function poolFor(pack: CreatureCopyPack, event: string, ctx: CopyContext): CopyLine[] {
  // 1) exact event + requires
  let pool = pack.lines.filter((l) => l.event === event && requiresMatch(l.requires, ctx));
  if (pool.length) return pool;
  // 2) exact event, relax requires
  pool = pack.lines.filter((l) => l.event === event);
  if (pool.length) return pool;
  // 3) fallback families
  for (const alt of FALLBACK[event] ?? []) {
    pool = pack.lines.filter((l) => l.event === alt && requiresMatch(l.requires, ctx));
    if (pool.length) return pool;
    pool = pack.lines.filter((l) => l.event === alt);
    if (pool.length) return pool;
  }
  // 4) last resort: idle.mutter, else any line
  pool = pack.lines.filter((l) => l.event === "idle.mutter");
  return pool.length ? pool : pack.lines;
}

export type SelectedLine = { text: string; lineId: string };

/** Pick one finished line for an event. `salt` lets the caller vary repeats. */
export function selectCopy(
  pack: CreatureCopyPack,
  event: string,
  ctx: CopyContext,
  salt = "",
): SelectedLine {
  const pool = poolFor(pack, event, ctx);
  if (pool.length === 0) return { text: "", lineId: `${event}.empty` };
  const rng = mulberry32(ctx.seed ^ hashStr(event + "|" + salt));
  const line = weightedPick(pool, rng);
  return { text: fillSlots(line.text, pack, ctx, rng), lineId: line.id };
}

/**
 * Build today's 每日心声 = OPENER + BODY + [MEMORY] + SIGNOFF. Each part has its
 * own anti-repeat against `recentIds` (the last ~10 days of diary line_ids) for
 * combinatorial freshness; memory clauses (which reference accumulating history)
 * fire when their requires match.
 */
export function buildDiary(
  pack: CreatureCopyPack,
  ctx: CopyContext,
  recentIds: string[],
): SelectedLine {
  const recent = new Set(recentIds);
  const rng = mulberry32(ctx.seed ^ hashStr("diary"));

  const pickPart = (parts: DiaryPart[], required: boolean): DiaryPart | null => {
    let pool = parts.filter((p) => requiresMatch(p.requires, ctx));
    if (!pool.length) {
      if (required) pool = parts; // openers/bodies/signoffs must always yield something
      else return null;
    }
    const fresh = pool.filter((p) => !recent.has(p.id));
    return weightedPick((fresh.length ? fresh : pool).map((p) => ({ ...p, weight: 1 })), rng);
  };

  const opener = pickPart(pack.diary.openers, true);
  const body = pickPart(pack.diary.bodies, true);
  const memory = rng() < 0.7 ? pickPart(pack.diary.memory, false) : null;
  const signoff = pickPart(pack.diary.signoffs, true);

  const parts = [opener, body, memory, signoff].filter(Boolean) as DiaryPart[];
  const text = parts.map((p) => fillSlots(p.text, pack, ctx, rng)).join("");
  const lineId = parts.map((p) => p.id).join("+");
  return { text, lineId };
}

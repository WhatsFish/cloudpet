// V2 §7.1 解锁路线 (unlock roadmap) — the SINGLE place that answers "到多少级 / 多久能拿到什么".
// Merges every earnable cosmetic (deco hats + auras) and 称号 (titles) into one ordered timeline so
// the client can (a) preview the NEXT reward on the home screen ("再升到 Lv12 解锁缎带花环"), and
// (b) show a full Lv→奖励 对照表. Without this the rewards exist but are invisible, so leveling
// feels pointless — which is exactly the player's complaint.

import { DECO, isUnlocked, type DecoCtx, type DecoUnlock } from "./deco";
import { TITLES, titleEarned, type TitleCond } from "./titles";

export type UnlockKind = "hat" | "aura" | "title";
export type UnlockCond = DecoUnlock | TitleCond; // structurally identical (shared `type` tag)

export type UnlockEntry = {
  kind: UnlockKind;
  kindLabel: string;   // 头饰 / 光环 / 称号
  id: string;
  name: string;
  cond: UnlockCond;
  earned: boolean;
  sortKey: number;     // for the timeline ordering (level-first, then the rest)
  reqLabel: string;    // "Lv12" / "30天" / "亲密900" / "连签7天" / "成年"
  hint: string;        // full sentence: "升到 Lv12 解锁"
  remaining: string;   // short gap when locked: "还差 3 级" / "还差 12 天" — "" when earned
};

const KIND_LABEL: Record<UnlockKind, string> = { hat: "头饰", aura: "光环", title: "称号" };

// A coarse sort key so the timeline reads naturally: level-gated items ordered by level (the spine
// the player asked about), then day/streak/bond/stage rewards interleaved by a rough "when" estimate.
function sortKeyFor(c: UnlockCond): number {
  switch (c.type) {
    case "level": return c.lv * 100;              // primary spine
    case "days": return c.days * 100 + 1;         // ~1 level/day early, so day≈level scale
    case "streak": return c.days * 100 + 2;
    case "stage": return [0, 100, 500, 1200, 2100][c.order] ?? c.order * 600; // egg..adult → rough day*100
    case "bond": return c.bond * 3 + 3;           // bond 0..1000 → 0..3000, lands late
    default: return 0;
  }
}

function reqLabel(c: UnlockCond): string {
  switch (c.type) {
    case "level": return `Lv${c.lv}`;
    case "days": return `${c.days}天`;
    case "streak": return `连签${c.days}天`;
    case "bond": return `亲密${c.bond}`;
    case "stage": return ["蛋", "幼年", "童年", "少年", "成年"][c.order] ?? "更大";
    default: return "";
  }
}

function hintFor(c: UnlockCond): string {
  switch (c.type) {
    case "level": return `升到 Lv${c.lv} 解锁`;
    case "days": return `相伴满 ${c.days} 天解锁`;
    case "streak": return `连续陪它 ${c.days} 天解锁`;
    case "bond": return `亲密度到 ${c.bond} 解锁`;
    case "stage": return `养到${["蛋", "幼年", "童年", "少年", "成年"][c.order] ?? "更大"}解锁`;
    default: return "";
  }
}

function remainingFor(c: UnlockCond, ctx: DecoCtx): string {
  switch (c.type) {
    case "level": return `还差 ${Math.max(0, c.lv - ctx.level)} 级`;
    case "days": return `还差 ${Math.max(0, c.days - ctx.daysKnown)} 天`;
    case "streak": return `还需连签 ${Math.max(0, c.days - Math.max(ctx.streakDays, ctx.maxStreak))} 天`;
    case "bond": return `亲密还差 ${Math.max(0, c.bond - Math.round(ctx.bond))}`;
    case "stage": return `还要长大`;
    default: return "";
  }
}

export function buildUnlockTimeline(ctx: DecoCtx): UnlockEntry[] {
  const entries: UnlockEntry[] = [];
  for (const d of DECO) {
    const earned = isUnlocked(d.unlock, ctx);
    entries.push({
      kind: d.slot, kindLabel: KIND_LABEL[d.slot], id: d.id, name: d.name, cond: d.unlock, earned,
      sortKey: sortKeyFor(d.unlock), reqLabel: reqLabel(d.unlock), hint: hintFor(d.unlock),
      remaining: earned ? "" : remainingFor(d.unlock, ctx),
    });
  }
  for (const t of TITLES) {
    const earned = titleEarned(t.cond, ctx);
    entries.push({
      kind: "title", kindLabel: KIND_LABEL.title, id: t.id, name: t.name, cond: t.cond, earned,
      sortKey: sortKeyFor(t.cond), reqLabel: reqLabel(t.cond), hint: hintFor(t.cond),
      remaining: earned ? "" : remainingFor(t.cond, ctx),
    });
  }
  return entries.sort((a, b) => a.sortKey - b.sortKey);
}

// The single most "imminent" reward to preview on home. Prefers the nearest LEVEL unlock (the player
// asked about levels, and it's the steady drip), falling back to the nearest non-level unlock when
// no level rewards remain. Returns null only when everything is earned.
export function nextUnlock(ctx: DecoCtx): { name: string; kindLabel: string; reqLabel: string; hint: string; remaining: string; isLevel: boolean } | null {
  const locked = buildUnlockTimeline(ctx).filter((e) => !e.earned);
  if (!locked.length) return null;
  const levels = locked.filter((e) => e.cond.type === "level").sort((a, b) => (a.cond as { lv: number }).lv - (b.cond as { lv: number }).lv);
  const pick = levels[0] ?? locked[0];
  return { name: pick.name, kindLabel: pick.kindLabel, reqLabel: pick.reqLabel, hint: pick.hint, remaining: pick.remaining, isLevel: pick.cond.type === "level" };
}

// Items that became unlocked between two life-fact snapshots (before → after a care action / check-in).
// Drives the "🎁 解锁了X！" celebration so earning a reward is a FELT moment, not a silent state change.
export function newlyUnlocked(before: DecoCtx, after: DecoCtx): { kind: UnlockKind; kindLabel: string; id: string; name: string }[] {
  const out: { kind: UnlockKind; kindLabel: string; id: string; name: string }[] = [];
  for (const e of buildUnlockTimeline(after)) {
    if (!e.earned) continue;
    const wasEarned =
      e.kind === "title"
        ? TITLES.some((t) => t.id === e.id && titleEarned(t.cond, before))
        : DECO.some((d) => d.id === e.id && isUnlocked(d.unlock, before));
    if (!wasEarned) out.push({ kind: e.kind, kindLabel: e.kindLabel, id: e.id, name: e.name });
  }
  return out;
}

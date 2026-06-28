// 称号 (titles) — V2 §7 纪元轨道 (the art-light core). A title is EARNED compute-on-read from the
// pet's life facts (level / days / bond / streak / stage) — no table, no new art. Titles give the
// post-Lv20 player a stream of NAMED goals ("差一点就到『相伴百日』了"), which is the concrete answer
// to "等级数字没意义了". The day30 / Lv20 "本命觉醒" is the headline title (the §3 觉醒 大事件 moment,
// delivered without needing new body sprites — it pairs with the Lv20 觉醒 aura from §5).

import type { DecoCtx } from "./deco"; // same fact bag the deco unlocks read

export type TitleCond =
  | { type: "level"; lv: number }
  | { type: "days"; days: number }
  | { type: "streak"; days: number }
  | { type: "bond"; bond: number }
  | { type: "stage"; order: number };

export type Title = {
  id: string;
  name: string;        // the badge text
  blurb: string;       // one line shown in the 纪元 panel
  cond: TitleCond;
  rank: number;        // higher = more prestigious; bestTitle picks the max earned
  awakening?: boolean; // the §3 觉醒 headline milestone
};

// Ordered roughly by the journey. rank drives "best title"; cond drives earned/locked.
export const TITLES: Title[] = [
  { id: "newborn",   name: "初见",        blurb: "你们的故事刚刚开始", cond: { type: "stage", order: 0 }, rank: 0 },
  { id: "firstweek", name: "一周之约",    blurb: "相伴满 7 天", cond: { type: "days", days: 7 }, rank: 10 },
  { id: "teen",      name: "少年同行",    blurb: "陪它长成了少年", cond: { type: "stage", order: 3 }, rank: 20 },
  { id: "streak7",   name: "七日不缺席",  blurb: "连续陪它 7 天", cond: { type: "streak", days: 7 }, rank: 25 },
  { id: "adult",     name: "成年见证",    blurb: "陪它长成了大成宠", cond: { type: "stage", order: 4 }, rank: 30 },
  { id: "lv15",      name: "羁绊渐深",    blurb: "升到 Lv15", cond: { type: "level", lv: 15 }, rank: 35 },
  { id: "moon",      name: "相伴一月",    blurb: "相伴满 30 天", cond: { type: "days", days: 30 }, rank: 40 },
  { id: "awaken",    name: "本命觉醒",    blurb: "Lv20 · 本命之力觉醒，点亮星辉光环", cond: { type: "level", lv: 20 }, rank: 50, awakening: true },
  { id: "streak30",  name: "月度全勤",    blurb: "连续陪它 30 天", cond: { type: "streak", days: 30 }, rank: 55 },
  { id: "bond900",   name: "心有灵犀",    blurb: "亲密度到 900", cond: { type: "bond", bond: 900 }, rank: 60 },
  { id: "century",   name: "相伴百日",    blurb: "相伴满 100 天", cond: { type: "days", days: 100 }, rank: 70 },
  { id: "bond1000",  name: "此生本命",    blurb: "亲密度满 1000——再没有谁比你更懂它", cond: { type: "bond", bond: 1000 }, rank: 80 },
  { id: "lv30",      name: "纪元守护者",  blurb: "升到 Lv30，走完了这趟漫长的养成", cond: { type: "level", lv: 30 }, rank: 90 },
];

export function titleEarned(c: TitleCond, ctx: DecoCtx): boolean {
  switch (c.type) {
    case "level": return ctx.level >= c.lv;
    case "days": return ctx.daysKnown >= c.days;
    case "streak": return Math.max(ctx.streakDays, ctx.maxStreak) >= c.days;
    case "bond": return ctx.bond >= c.bond;
    case "stage": return ctx.stageOrder >= c.order;
  }
}

export function titleHint(c: TitleCond): string {
  switch (c.type) {
    case "level": return `升到 Lv${c.lv}`;
    case "days": return `相伴满 ${c.days} 天`;
    case "streak": return `连续陪它 ${c.days} 天`;
    case "bond": return `亲密度到 ${c.bond}`;
    case "stage": return ["养到蛋", "养到幼年", "养到童年", "养到少年", "养到成年"][c.order] ?? "继续养";
  }
}

/** The most prestigious earned title (the one to show as the headline badge), or null if none. */
export function bestTitle(ctx: DecoCtx): Title | null {
  let best: Title | null = null;
  for (const t of TITLES) if (titleEarned(t.cond, ctx) && (!best || t.rank > best.rank)) best = t;
  return best;
}

/** The next unearned title (the carrot), or null if all earned. */
export function nextTitle(ctx: DecoCtx): Title | null {
  const unearned = TITLES.filter((t) => !titleEarned(t.cond, ctx)).sort((a, b) => a.rank - b.rank);
  return unearned[0] ?? null;
}

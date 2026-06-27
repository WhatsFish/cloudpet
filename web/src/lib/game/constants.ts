// All tuning numbers (REDESIGN_V2). The engine reads ONLY from here.
// V2 economy: NO items/currency. Care (feed/clean/doctor) draws a shared 3-charge
// "care battery"; affection (play/pet) is free & unlimited & 0-growth.

import type { LiveStat, NeedKind, Stage, Verb } from "@/lib/types";
export type { NeedKind };

export const H = 3600_000;
export const MIN = 60_000;

// --- decay (per real hour) ---
export const DECAY: Record<"satiety" | "mood" | "cleanliness" | "energyAwake", number> = {
  satiety: 4.0, mood: 2.5, cleanliness: 3.0, energyAwake: 3.5,
};
export const ENERGY_REGEN = { activeSleep: 9, passiveNap: 5 };

// --- multiplicative decay modifiers ---
export const M_STAGE: Record<Stage, number> = { egg: 1.15, baby: 1.15, child: 1.0, teen: 0.9, adult: 0.9 };
export const M_SLEEP: Partial<Record<LiveStat, number>> = { satiety: 0.35, mood: 0.25, cleanliness: 0.5 }; // 睡着掉得更慢，尤其饱食
export const M_SICK: Partial<Record<LiveStat, number>> = { satiety: 1.4, cleanliness: 1.2 };
export const M_BOND_MAX_REDUCTION = 0.3;

// --- health (derived) ---
export const HEALTH = {
  neglect: { satietyLt: 20, satietyW: 1.5, cleanLt: 20, cleanW: 1.5, energyLt: 15, energyW: 1.0, moodLt: 15, moodW: 0.5 },
  recovery: { satietyGe: 60, cleanGe: 60, energyGe: 50, rate: 1.0 },
  sickBelow: 30, sickClearAt: 60,
};

export const DH_CAP = 720;
export const LIVE_FLOOR = 5;
export const HEALTH_FLOOR = 15;

export const STATE_THRESH = {
  hungry: 30, dirty: 30, sleepy: 25,
  sulkMoodLt: 25, sulkAfterH: 2,
  hideMoodLt: 12, hideAfterH: 36,
  lonelyAfterH: 48, reunionAfterH: 48,
};

export const STREAK_EXP = { day7: 50, day30: 150 }; // legacy (superseded by STREAK_MILESTONES below)

// V2 §6 连续登录 / 打卡奖励. Reuses pet_cooldown.{streak_days,max_streak_reached}. Two parts:
//  (1) a small ESCALATING DAILY gift just for showing up on a streak (exp + a little bond), and
//  (2) richer one-time MILESTONES at day 3/7/14/30/60/100, each paid ONCE EVER (gated on the
//      max-streak high-water mark, so a halve-and-reclimb past an already-passed day never re-grants).
// Daily gift is deliberately modest so it rewards the ritual without trivialising leveling.
export const STREAK_DAILY = { base: 8, perDay: 2, expCap: 60, bondFrom: 5, bondCap: 4 };
export function streakDailyExp(streak: number): number {
  return Math.min(STREAK_DAILY.expCap, STREAK_DAILY.base + STREAK_DAILY.perDay * Math.max(0, streak));
}
export function streakDailyBond(streak: number): number {
  // a tiny extra warmth once you're a few days deep, capped — long streaks feel a bit cosier.
  return streak >= STREAK_DAILY.bondFrom ? Math.min(STREAK_DAILY.bondCap, 1 + Math.floor(streak / 14)) : 0;
}
export type StreakMilestone = { day: number; exp: number; bond: number; label: string };
export const STREAK_MILESTONES: StreakMilestone[] = [
  { day: 3,   exp: 20,  bond: 5,  label: "连签三天" },
  { day: 7,   exp: 50,  bond: 8,  label: "连签一周" },
  { day: 14,  exp: 90,  bond: 10, label: "连签两周" },
  { day: 30,  exp: 150, bond: 15, label: "连签一个月" },
  { day: 60,  exp: 250, bond: 20, label: "连签两个月" },
  { day: 100, exp: 400, bond: 30, label: "连签百日" },
];
// the HIGHEST milestone newly crossed this check-in (day in (prevMax, streak]); null if none.
export function newlyCrossedMilestone(streak: number, prevMax: number): StreakMilestone | null {
  let hit: StreakMilestone | null = null;
  for (const m of STREAK_MILESTONES) if (m.day <= streak && m.day > prevMax) hit = m; // ascending → last wins = highest
  return hit;
}
export function nextStreakMilestone(streak: number): StreakMilestone | null {
  return STREAK_MILESTONES.find((m) => m.day > streak) ?? null;
}

// --- V4 economy: needs loop (battery removed) ---
export const CARE = { maxCharges: 3, regenMs: 5 * H }; // DORMANT (kept for legacy imports)
export const CARE_EXP = 14; // ceiling label

// Deficit-weighted EXP for raw care taps — now deliberately SMALL (6..14): the big growth
// comes from answering a DUE need (NEED_REWARD), not from button-mashing (V4 §F).
export const CARE_EXP_MIN = 6;
export const CARE_EXP_MAX = 14;
export const CARE_BOND = 4;
export function careExp(preStat: number, cap: number): number {
  const deficit = Math.max(0, Math.min(cap, cap - preStat));
  return Math.round(CARE_EXP_MIN + (CARE_EXP_MAX - CARE_EXP_MIN) * (deficit / cap));
}

// V5 CIRCADIAN needs — care follows a real-pet rhythm (meals / ~daily bath / sick-only),
// NOT infinite taps. Feeding is only "due" inside a meal window (once per meal); washing
// ~once a day; doctor only when sick; sleep at night. Affection (play/pet) stays the
// always-available free outlet so there's an interaction even between needs.
export const MEALS: { from: number; to: number }[] = [{ from: 7, to: 10 }, { from: 11, to: 14 }, { from: 17, to: 20 }];
export const NIGHT_FROM = 22, NIGHT_TO = 7; // sleepy window; feeding/play are suppressed here
export const SLEEPY_ENERGY = 35; // below this (or at night) the pet will accept 哄睡
export const HUNGER_SAFETY = 25; // very low satiety → hungry even outside a meal window

export const NEED_DUE: Record<"dirty" | "bored" | "unwell", number> = { dirty: 50, bored: 45, unwell: 35 };
export const NEED_COOLDOWN_MS: Record<NeedKind, number> = { hungry: 3 * H, dirty: 20 * H, bored: 4 * H, unwell: 8 * H, sleepy: 12 * H };

// V8.2 STAT-DRIVEN needs (replaces meal-windows / care cooldowns): a care need fires purely
// when its stat falls below threshold. Stats decay over time (≈每小时一点) + occasional random
// dips, so hunger/dirty/sick arise organically from time, not a clock — "吃了过一阵才饿".
// The care action lifts the stat back above threshold, so it won't re-fire until it decays again.
export const NEED_THRESH: Record<"hungry" | "dirty" | "unwell" | "bored", number> = { hungry: 45, dirty: 42, unwell: 35, bored: 40 };

// occasional random dips so needs feel organic ("蹭脏了 / 漏了一口饭 / 打了个喷嚏"), not clockwork.
// Deterministic per (pet, absolute-hour) so compute-on-read stays stable across reads.
export const DIP_CHANCE_PCT = 14; // ~14% of whole hours get an extra dip on one stat
export const DIP_AMOUNT = 8;
export const DIP_STATS: LiveStat[] = ["satiety", "cleanliness", "mood"];
export const DIP_WINDOW_CAP = 6;  // max dips applied per single recompute (decay dominates long absences)

// 进化提速: high 亲密度 (= an active player — checkin streak / care / play all feed bond) compresses
// the stage day-gate, so frequent visitors see evolution sooner (child 5d → ~3d at full bond).
// 进化提速 tuning. BOND_SPEED_FULL lowered 550→500 so the full day-compression is reachable
// within the teen/adult windows (a daily player who bonds steadily actually gets there), and
// STAGE_SPEED_MIN 0.45→0.40 widens the payoff (child 5d→2d, teen 12d→5d, adult 21d→9d at full
// bond) — so "多陪它能更快进化" is a real, felt swing, not a rounding nudge. The roadmap now
// shows the realized + remaining day-savings (see buildRoadmap) so the link is visible.
export const BOND_SPEED_FULL = 500; // bond at/above which the gate is at its fastest
export const STAGE_SPEED_MIN = 0.40; // min day-gate multiplier (×minDays) at full bond
export const NEED_MAX_ACTIVE = 3;
export const NEED_PRIORITY: NeedKind[] = ["unwell", "sleepy", "hungry", "dirty", "bored"];
export const NEED_VERB: Record<NeedKind, Verb> = { unwell: "doctor", sleepy: "sleep", hungry: "feed", dirty: "clean", bored: "play" };

// CARE needs (hungry/dirty/unwell) reward EXP + bond — the growth draw, rhythm-limited.
// AFFECTION needs (sleepy/bored) reward BOND only — answering them deepens the bond but
// never grows EXP (keeps play/sleep decoupled from growth).
export const CARE_NEEDS: NeedKind[] = ["hungry", "dirty", "unwell"];
export const NEED_REWARD = { exp: 40, bond: 10 };
export const AFFECTION_NEED_BOND = 8;

// Passive EXP drip over real time — rate scaled by stats + bond (good care → faster growth
// even while away), bounded per recompute window so a long absence can't fast-forward.
export const PASSIVE_BASE = 2.5; // exp/hour at neutral
export const PASSIVE_CARE: [number, number] = [0.4, 1.5]; // multiplier range by avg stat
export const PASSIVE_BOND: [number, number] = [0.6, 1.4]; // multiplier range by bond
export const PASSIVE_WINDOW_CAP = 200; // max passive exp per single recompute

// Affection bond (free, unlimited; pet has a daily soft cap then tapers).
export const PET_BOND = 3;
export const PLAY_BOND = 2;
export const PET_BOND_SOFTCAP = 6; // taps/day at full PET_BOND, then +1

export const WANTS_PERIOD_MS = 6 * H;
export const RECAP_MIN_AWAY_MS = 8 * H;
// A daily overnight returner rarely gains a whole level in one night (early levels need ~80
// exp; an 8-10h sleep drips ~25-45), so the "我长大啦" recap almost never fired for them — the
// comeback felt like nothing happened. SOFT_RECAP_EXP lets a meaningful overnight EXP gain (no
// full level needed) fire a gentle "睡了一觉又长大一点" recap, so returning ALWAYS shows a
// because-you-care-for-me payoff. Gated to once per local day (see GET /api/pet).
export const SOFT_RECAP_EXP = 22;
export const COMPLETE_BONUS = { exp: 30, bond: 10 }; // 「照顾够了」完成奖 (once/day)
export const CHECKIN_BOND = 8; // auto check-in on first open
export const CARE_COVERED_AT = 30; // careCoveredToday = all of satiety/cleanliness/health >= 30
export const OVERFEED_ABOVE = 80; // feed past this → feed.overfed flavor

// New pets aren't strangers: the quiz + naming + hatch already built a first bond. Starts at a
// clean 2 hearts (bondHearts = round(bond/200) → round(1.5) = 2) so the newborn reads as warmly
// bonded the moment it hatches. Clears the child bond gate (60), and a day-1 active player just
// crosses the teen gate (180) — bonding PAST 300 is what drives the visible heart climb
// (3♥@500 / 4♥@700 / 5♥@900), the decay-reduction, and the evolution-speed payoff
// (BOND_SPEED_FULL 550), so bonding still clearly matters. Does not rush/skip any gate: teen is
// bound by exp 620 + ~9-10 real days, adult by bond 400 + 21 days.
export const INITIAL_BOND = 300;

// A newborn must have something to DO on first open, or a brand-new user lands on a pet that
// needs nothing and there's no first experience at all. So it hatches a little HUNGRY and DIRTY
// (the two friendly, obvious needs) — but healthy, rested and content (no scary sick/sleepy/
// sulky newborn). Hunger is tuned to take TWO feeds to clear: satiety 15 → +25 → 40 (still
// < NEED_THRESH.hungry 45, so still hungry) → +25 → 65 (satisfied). Each satisfied need pays the
// full NEED_REWARD, so the first session is three juicy reward bursts (feed, feed, wash).
export const NEWBORN_STATS = { satiety: 15, cleanliness: 28, mood: 62, energy: 82, health: 82 };

// --- 体重 / 体型 (V8): grows a little every day (faster when well-cared) + a bit per feed,
// up to a per-stage soft cap. Drives the displayed body size, so the pet visibly gets
// bigger over real days — a steady, legible sense of "它在我手里一天天长大". ---
export const WEIGHT_START = 100;            // 1.0kg (displayed as weight/100)
export const WEIGHT_PER_DAY = 14;           // base daily gain at neutral care
export const WEIGHT_FEED = 3;               // +per feed (a good meal → grew a bit)
export const WEIGHT_CARE: [number, number] = [0.5, 1.25]; // daily-gain multiplier by avg stat
export const WEIGHT_STAGE_MAX: Record<Stage, number> = { egg: 110, baby: 155, child: 215, teen: 300, adult: 400 };
export const WEIGHT_SIZE_SPAN = 230;        // weight above START that maps to the full size range (legacy)
export const WEIGHT_SIZE_RANGE: [number, number] = [0.92, 1.32]; // display scale at START..START+SPAN (legacy)

// V2 体型显示 (screen-fit): STAGE drives the big size step (authored target占框比), WEIGHT only nudges
// ±SIZE_WITHIN_BAND inside a stage. This BOUNDS the sprite so even an adult at full weight + tallest
// hat fits the LCD safe frame (the old single weight→[0.92,1.32] range let adult hit 1.32 and 顶破取景框).
// "长大" reads via the stage step (and a subtle camera zoom-out on the client), not unbounded scaling.
export const STAGE_SIZE_BASE: Record<Stage, number> = { egg: 0.62, baby: 0.72, child: 0.84, teen: 0.95, adult: 1.04 };
export const SIZE_WITHIN_BAND = 0.06; // ±6% within a stage, by where weight sits in the stage's band
// floor = the previous stage's weight ceiling (egg floor = START); ceil = this stage's WEIGHT_STAGE_MAX.
export const STAGE_WEIGHT_FLOOR: Record<Stage, number> = { egg: WEIGHT_START, baby: 110, child: 155, teen: 215, adult: 300 };
export function displaySizeScale(stage: Stage, weight: number): number {
  const floor = STAGE_WEIGHT_FLOOR[stage];
  const ceil = WEIGHT_STAGE_MAX[stage];
  const norm = ceil > floor ? Math.max(0, Math.min(1, (weight - floor) / (ceil - floor))) : 0.5;
  return +(STAGE_SIZE_BASE[stage] * (1 + SIZE_WITHIN_BAND * (2 * norm - 1))).toFixed(3);
}

// --- 灵感火花 / sparks (V8): banked "tap-for-EXP" sparks that regen over time AND while you
// linger. Gives every visit a fresh thing to do for growth (not just 陪玩/摸摸), and keeps
// regenerating so staying in-app is rewarded. Server-authoritative (no client EXP trust). ---
export const SPARK_MAX = 6;
export const SPARK_START = 3;
export const SPARK_REGEN_MS = 12 * MIN;     // +1 every 12 min (offline + while open), cap SPARK_MAX
export const SPARK_EXP = 10;
export const SPARK_BOND = 1;

// --- actions: 3 buttons. care = battery-gated growth; play/pet/sleep = free ---
export type ActionDef = {
  verb: Verb;
  effects: Partial<Record<LiveStat, number>>;
  charge: boolean; // consumes 1 care charge (the growth driver)
  exp: number; // care = CARE_EXP; affection = 0
  bond: number; // care = CARE_BOND; affection = 0
  unlockOrder: number; // min stage order (baby=1)
  fx: string; // reaction FX overlay key (REDESIGN_V2 §5.2)
  blockedWhen?: ("SICK" | "SULKING")[];
  clearsSulk?: boolean;
  togglesSleep?: boolean;
  clearsSick?: boolean;
  intent: string; // copy event
};

export const ACTIONS: Record<Verb, ActionDef> = {
  // care (battery) — growth drivers
  feed: { verb: "feed", effects: { satiety: 25 }, charge: true, exp: CARE_EXP, bond: CARE_BOND, unlockOrder: 1, fx: "food", intent: "feed.love" },
  clean: { verb: "clean", effects: { cleanliness: 40 }, charge: true, exp: CARE_EXP, bond: CARE_BOND, unlockOrder: 1, fx: "bubbles", intent: "clean" },
  doctor: { verb: "doctor", effects: { health: 40 }, charge: true, exp: CARE_EXP, bond: CARE_BOND, unlockOrder: 1, fx: "sparkle", clearsSick: true, intent: "medicine" },
  // affection — free, unlimited, 0 EXP, but now build BOND (V4). Never steer the form.
  play: { verb: "play", effects: { mood: 20 }, charge: false, exp: 0, bond: PLAY_BOND, unlockOrder: 1, fx: "notes", blockedWhen: ["SICK"], clearsSulk: true, intent: "play" },
  pet: { verb: "pet", effects: { mood: 8 }, charge: false, exp: 0, bond: PET_BOND, unlockOrder: 1, fx: "hearts", intent: "pet" },
  sleep: { verb: "sleep", effects: {}, charge: false, exp: 0, bond: 0, unlockOrder: 1, fx: "zzz", togglesSleep: true, intent: "sleep.tuck" },
};

export const CARE_VERBS: Verb[] = ["feed", "clean", "doctor"];
export const FREE_VERBS: Verb[] = ["play", "pet", "sleep"];

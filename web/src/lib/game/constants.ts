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
export const M_SLEEP: Partial<Record<LiveStat, number>> = { satiety: 0.5, mood: 0.25, cleanliness: 0.5 };
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

export const STREAK_EXP = { day7: 50, day30: 150 };

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
export const COMPLETE_BONUS = { exp: 30, bond: 10 }; // 「照顾够了」完成奖 (once/day)
export const CHECKIN_BOND = 8; // auto check-in on first open
export const CARE_COVERED_AT = 30; // careCoveredToday = all of satiety/cleanliness/health >= 30
export const OVERFEED_ABOVE = 80; // feed past this → feed.overfed flavor

// New pets aren't strangers: the quiz + naming + hatch already built a first bond. Starts
// at ~1 heart (bondHearts = round(bond/200)); clears the child bond gate (60) so early
// growth is smooth, yet stays under the teen gate (180) so bonding still matters.
export const INITIAL_BOND = 150;

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

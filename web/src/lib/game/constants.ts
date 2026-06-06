// All tuning numbers (REDESIGN_V2). The engine reads ONLY from here.
// V2 economy: NO items/currency. Care (feed/clean/doctor) draws a shared 3-charge
// "care battery"; affection (play/pet) is free & unlimited & 0-growth.

import type { LiveStat, Stage, Verb } from "@/lib/types";

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

// --- V2 care battery + rewards ---
export const CARE = { maxCharges: 3, regenMs: 5 * H };
export const CARE_EXP = 25; // legacy ceiling; live value is deficit-weighted (V3)
export const CARE_BOND = 6;

// V3: deficit-weighted EXP. Caring for a DEPLETED stat earns full EXP; topping off an
// already-high one earns little. This is what makes satiety/cleanliness/health matter —
// each care tap's value depends on whether the pet actually needed it (REDESIGN_V3 §1).
export const CARE_EXP_MIN = 10;
export const CARE_EXP_MAX = 25;
export function careExp(preStat: number, cap: number): number {
  const deficit = Math.max(0, Math.min(cap, cap - preStat));
  return Math.round(CARE_EXP_MIN + (CARE_EXP_MAX - CARE_EXP_MIN) * (deficit / cap));
}
export const COMPLETE_BONUS = { exp: 30, bond: 10 }; // 「照顾够了」完成奖 (once/day)
export const CHECKIN_BOND = 8; // auto check-in on first open
export const CARE_COVERED_AT = 30; // careCoveredToday = all of satiety/cleanliness/health >= 30
export const OVERFEED_ABOVE = 80; // feed past this → feed.overfed flavor

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
  // affection — free, unlimited, 0 growth
  play: { verb: "play", effects: { mood: 20 }, charge: false, exp: 0, bond: 0, unlockOrder: 1, fx: "notes", blockedWhen: ["SICK"], clearsSulk: true, intent: "play" },
  pet: { verb: "pet", effects: { mood: 8 }, charge: false, exp: 0, bond: 0, unlockOrder: 1, fx: "hearts", intent: "pet" },
  sleep: { verb: "sleep", effects: {}, charge: false, exp: 0, bond: 0, unlockOrder: 1, fx: "zzz", togglesSleep: true, intent: "sleep.tuck" },
};

export const CARE_VERBS: Verb[] = ["feed", "clean", "doctor"];
export const FREE_VERBS: Verb[] = ["play", "pet", "sleep"];

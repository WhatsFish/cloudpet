// All the tuning numbers, in one place (PLAN §5). The engine reads ONLY from here
// so balancing is a data edit, not a logic change.

import type { ItemKey, LiveStat, Stage, Verb } from "@/lib/types";

export const H = 3600_000; // ms per hour
export const MIN = 60_000;

// --- 5.1 base decay per real hour (satiety/mood/cleanliness/energy) ---
export const DECAY: Record<"satiety" | "mood" | "cleanliness" | "energyAwake", number> = {
  satiety: 4.0,
  mood: 2.5,
  cleanliness: 3.0,
  energyAwake: 3.5,
};
// energy regen per hour
export const ENERGY_REGEN = { activeSleep: 9, passiveNap: 5 };

// --- 5.2 multiplicative decay modifiers ---
export const M_STAGE: Record<Stage, number> = {
  egg: 1.15, baby: 1.15, child: 1.0, teen: 0.9, adult: 0.9,
};
export const M_SLEEP: Partial<Record<LiveStat, number>> = { satiety: 0.5, mood: 0.25, cleanliness: 0.5 };
export const M_SICK: Partial<Record<LiveStat, number>> = { satiety: 1.4, cleanliness: 1.2 };
// M_bond applies to mood & satiety only: (1 - 0.30 * bond/1000)
export const M_BOND_MAX_REDUCTION = 0.3;

// --- 5.4 health (derived) ---
export const HEALTH = {
  neglect: { satietyLt: 20, satietyW: 1.5, cleanLt: 20, cleanW: 1.5, energyLt: 15, energyW: 1.0, moodLt: 15, moodW: 0.5 },
  recovery: { satietyGe: 60, cleanGe: 60, energyGe: 50, rate: 1.0 },
  sickBelow: 30,
  sickClearAt: 60,
};

// --- 5.5 / 5.6 floors & clamps ---
export const DH_CAP = 720; // 30-day worst-case floor (clock-skew safe)
export const LIVE_FLOOR = 5;
export const HEALTH_FLOOR = 15;

// --- 5.6 state thresholds ---
export const STATE_THRESH = {
  hungry: 30, // satiety <
  dirty: 30, // cleanliness <
  sleepy: 25, // energy <
  sulkMoodLt: 25, // mood < for > sulkAfterH
  sulkAfterH: 2,
  hideMoodLt: 12, // mood < AND no interaction > hideAfterH
  hideAfterH: 36,
  lonelyAfterH: 48, // default; per-creature override in bestiary
  reunionAfterH: 48, // grant 重逢关怀包 on return after this gap
};

// --- 5.7 EXP from streaks (care-action EXP lives on the ACTIONS table) ---
export const STREAK_EXP = { day7: 50, day30: 150 };
export const PET_EXP_DAILY_CAP = 20; // 抚摸 EXP capped per day

// --- 5.8 actions ---
export type DailyCounter = "feed_count_day" | "snack_count_day" | "pet_count_day";

export type ActionDef = {
  verb: Verb;
  effects: Partial<Record<LiveStat, number>>;
  cost?: { item: ItemKey; qty: number };
  cooldownMs: number;
  daily?: { counter: DailyCounter; max: number };
  oncePerNight?: boolean; // 哄睡
  oncePerDay?: boolean; // 签到
  exp: number;
  bond: number;
  unlockOrder: number; // min stage order (egg=0,baby=1,child=2)
  blockedWhen?: ("SICK" | "SULKING")[];
  intent: string; // base copy event
};

export const ACTIONS: Record<Verb, ActionDef> = {
  feed: {
    verb: "feed", effects: { satiety: 25 }, cost: { item: "kibble", qty: 1 },
    cooldownMs: 90 * MIN, daily: { counter: "feed_count_day", max: 6 },
    exp: 10, bond: 3, unlockOrder: 1, intent: "feed.love",
  },
  snack: {
    verb: "snack", effects: { satiety: 12, mood: 5 }, cost: { item: "snack", qty: 1 },
    cooldownMs: 30 * MIN, daily: { counter: "snack_count_day", max: 4 },
    exp: 4, bond: 2, unlockOrder: 1, blockedWhen: ["SICK"], intent: "feed.love",
  },
  clean: {
    verb: "clean", effects: { cleanliness: 40 }, cost: { item: "soap", qty: 1 },
    cooldownMs: 4 * H, exp: 8, bond: 3, unlockOrder: 1, intent: "clean",
  },
  play: {
    verb: "play", effects: { mood: 18, energy: -8, cleanliness: -5 },
    cooldownMs: 20 * MIN, exp: 12, bond: 4, unlockOrder: 2,
    blockedWhen: ["SULKING", "SICK"], intent: "play",
  },
  pet: {
    verb: "pet", effects: { mood: 10 }, cooldownMs: 5 * MIN,
    daily: { counter: "pet_count_day", max: 20 }, exp: 2, bond: 1, unlockOrder: 0, intent: "pet",
  },
  sleep: {
    verb: "sleep", effects: {}, cooldownMs: 0, oncePerNight: true,
    exp: 15, bond: 5, unlockOrder: 2, intent: "sleep.tuck",
  },
  doctor: {
    verb: "doctor", effects: { health: 40 }, cost: { item: "heart", qty: 5 },
    cooldownMs: 6 * H, exp: 8, bond: 2, unlockOrder: 1, intent: "medicine",
  },
  checkin: {
    verb: "checkin", effects: {}, cooldownMs: 0, oncePerDay: true,
    exp: 20, bond: 8, unlockOrder: 0, intent: "checkin",
  },
};

// overfeed: feeding while already full gives diminished satiety + a mood dip
export const OVERFEED = { aboveSatiety: 80, satietyGain: 8, moodPenalty: 2 };

// --- economy (PLAN §5.8) ---
export const START_KIT: Record<ItemKey, number> = { kibble: 5, snack: 2, soap: 2, heart: 20 };
export const REUNION_PACK: Partial<Record<ItemKey, number>> = { kibble: 2, soap: 1, heart: 5 };
export const REUNION_COOLDOWN_DAYS = 7;

// daily 签到 gift pool (deterministic roll keyed by hash(pet_id, local_date))
export const GIFT_POOL: { items: Partial<Record<ItemKey, number>>; weight: number }[] = [
  { items: { kibble: 3 }, weight: 4 },
  { items: { snack: 1 }, weight: 3 },
  { items: { soap: 1 }, weight: 2 },
  { items: { heart: 5 }, weight: 2 },
];

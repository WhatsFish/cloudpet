// V7 per-creature gameplay config (5 creatures, one per design language). species_id ==
// the line key for the true form, or `<line>__<variant>` for a branch — both inherit the
// line head's temperament (creature() strips the suffix). Personality flavors how stats
// decay and how feeding lands (PLAN §3).

import type { LiveStat } from "@/lib/types";

export type BestiaryEntry = {
  id: string;
  displayName: string;
  shipped: boolean;
  accentHex: string;
  decayMult: Partial<Record<LiveStat, number>>;
  lonelyAfterHours: number;
  feed: { satietyMult: number; moodBonus: number };
};

export const BESTIARY: BestiaryEntry[] = [
  { id: "puff", displayName: "奶团", shipped: true, accentHex: "#FBE0C2",
    decayMult: { mood: 1.15 }, lonelyAfterHours: 36, feed: { satietyMult: 1.0, moodBonus: 3 } }, // clingy, sulks without you
  { id: "claude", displayName: "克劳德", shipped: true, accentHex: "#D96A4A",
    decayMult: { energy: 0.95 }, lonelyAfterHours: 60, feed: { satietyMult: 1.0, moodBonus: 1 } }, // curious, even-keeled
  { id: "blocky", displayName: "方头崽", shipped: true, accentHex: "#A9C27E",
    decayMult: { mood: 0.8 }, lonelyAfterHours: 80, feed: { satietyMult: 0.95, moodBonus: 0 } }, // stoic, slow to sour
  { id: "penguin", displayName: "波波企鹅", shipped: true, accentHex: "#6F8DA9",
    decayMult: { mood: 0.85 }, lonelyAfterHours: 72, feed: { satietyMult: 0.9, moodBonus: 0 } }, // cool, aloof, patient
  { id: "bear", displayName: "墩墩熊", shipped: true, accentHex: "#2E2E3A",
    decayMult: { mood: 1.2, energy: 1.1 }, lonelyAfterHours: 40, feed: { satietyMult: 1.0, moodBonus: 2 } }, // volatile, lively
];

const BY_ID = new Map(BESTIARY.map((b) => [b.id, b]));

export function creature(id: string): BestiaryEntry {
  const b = BY_ID.get(id) ?? BY_ID.get(id.split("__")[0]);
  if (!b) throw new Error(`unknown creature: ${id}`);
  return b;
}

export const SHIPPED_IDS = BESTIARY.map((s) => s.id);
export function isShipped(id: string): boolean {
  return BY_ID.get(id.split("__")[0])?.shipped ?? false;
}

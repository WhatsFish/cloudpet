// Per-creature gameplay config. In V1 species_id == archetype_key, so the creature
// id IS the archetype key. Personality flavors how stats decay and how feeding lands
// (PLAN §3 "how personality flavors gameplay"). Only `shipped` creatures have real
// art + a full copy pack; the other 7 ride placeholder art + the default copy voice.

import type { LiveStat } from "@/lib/types";
import { ARCHETYPES } from "./personality";

export type BestiaryEntry = {
  id: string; // == archetype key
  displayName: string;
  shipped: boolean; // real art + authored copy pack in V1
  accentHex: string; // identity tint for placeholder art
  // Multiply base decay per stat (default 1). Expresses temperament:
  // a needy creature's mood drops faster; a stoic one's slower.
  decayMult: Partial<Record<LiveStat, number>>;
  // Hours of no-interaction before LONELY (overrides the global 48h). Clingy
  // creatures get lonely sooner; aloof ones are patient.
  lonelyAfterHours: number;
  // Feeding tilt: satiety gained is scaled, plus a small mood bonus/penalty.
  feed: { satietyMult: number; moodBonus: number };
};

// The 3 V1-shipped creatures, fully specified.
const SHIPPED: BestiaryEntry[] = [
  {
    id: "mochi_pudding", displayName: "抖抖布丁", shipped: true, accentHex: "#FF9EC4",
    decayMult: { mood: 1.15 }, // melts for attention, sulks without it
    lonelyAfterHours: 36, // gets lonely fastest
    feed: { satietyMult: 1.0, moodBonus: 3 }, // loves soft sweet food
  },
  {
    id: "echo_fox", displayName: "墨影狐", shipped: true, accentHex: "#5B4B8A",
    decayMult: { mood: 0.82 }, // unbothered, slow to sour
    lonelyAfterHours: 72, // aloof and patient
    feed: { satietyMult: 0.9, moodBonus: 0 }, // picky, small portions
  },
  {
    id: "ember_imp", displayName: "炸毛团", shipped: true, accentHex: "#FF6B2C",
    decayMult: { mood: 1.2, energy: 1.1 }, // volatile, restless
    lonelyAfterHours: 40,
    feed: { satietyMult: 1.0, moodBonus: 2 }, // likes bold flavors
  },
];

// The remaining 7 archetypes ride placeholders in V1. Sensible default tilts.
const PLACEHOLDER_ACCENTS: Record<string, string> = {
  sproutling: "#7FB069", stone_egg: "#9C8B7A", puff_seal: "#FFE0E9",
  wisp_moth: "#F2C94C", clay_golem: "#C97B5A", spark_sprite: "#56CCF2",
  dream_jelly: "#B39DDB",
};

const PLACEHOLDERS: BestiaryEntry[] = ARCHETYPES.filter(
  (a) => !SHIPPED.some((s) => s.id === a.key),
).map((a) => ({
  id: a.key,
  displayName: a.nameCN,
  shipped: false,
  accentHex: PLACEHOLDER_ACCENTS[a.key] ?? "#A0A0A0",
  decayMult: {},
  lonelyAfterHours: 48,
  feed: { satietyMult: 1.0, moodBonus: 1 },
}));

export const BESTIARY: BestiaryEntry[] = [...SHIPPED, ...PLACEHOLDERS];

const BY_ID = new Map(BESTIARY.map((b) => [b.id, b]));

export function creature(id: string): BestiaryEntry {
  const b = BY_ID.get(id);
  if (!b) throw new Error(`unknown creature: ${id}`);
  return b;
}

export const SHIPPED_IDS = SHIPPED.map((s) => s.id);

export function isShipped(id: string): boolean {
  return BY_ID.get(id)?.shipped ?? false;
}

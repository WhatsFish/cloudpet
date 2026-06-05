// Items & soft currency. The daily 签到 gift is DETERMINISTIC from hash(pet_id,
// local_date) — not live random() — so the unique-per-day check-in row makes a
// retried request yield the identical gift (replay-safe). Reunion pack on return
// after a long absence guarantees a frictionless recovery (PLAN §5.8).

import type { ItemKey } from "@/lib/types";
import { GIFT_POOL, REUNION_PACK, START_KIT } from "./constants";

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function startKit(): Record<ItemKey, number> {
  return { ...START_KIT };
}

export function reunionPack(): Partial<Record<ItemKey, number>> {
  return { ...REUNION_PACK };
}

/** Deterministic daily gift; streak nudges toward better rolls but stays replay-safe. */
export function rollDailyGift(petId: number, localDate: string, streakDays: number): Partial<Record<ItemKey, number>> {
  const seed = hashStr(`${petId}|${localDate}`);
  const total = GIFT_POOL.reduce((a, g) => a + g.weight, 0);
  let r = seed % total;
  let chosen = GIFT_POOL[0];
  for (const g of GIFT_POOL) {
    if (r < g.weight) { chosen = g; break; }
    r -= g.weight;
  }
  const gift: Partial<Record<ItemKey, number>> = { ...chosen.items };
  // small streak bonus: a 7+ day streak adds a heart
  if (streakDays >= 7) gift.heart = (gift.heart ?? 0) + 2;
  return gift;
}

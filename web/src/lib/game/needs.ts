// V5 circadian needs. A need is DERIVED on read; care now follows a REAL-PET RHYTHM
// rather than infinite taps: hunger fires only inside meal windows (once per meal),
// the bath ~once a day, doctor only when sick, sleep at night. While the pet is asleep
// only "unwell" can surface — feeding/washing/playing wait until it wakes. Answering a
// DUE need is the draw; ignoring one never punishes. Also the passive-drip rate helper.

import type { NeedKind, Snapshot, Verb } from "@/lib/types";
import { STATE } from "@/lib/types";
import {
  NEED_DUE, NEED_COOLDOWN_MS, NEED_PRIORITY, NEED_MAX_ACTIVE, NEED_VERB,
  MEALS, NIGHT_FROM, NIGHT_TO, HUNGER_SAFETY,
  PASSIVE_BASE, PASSIVE_CARE, PASSIVE_BOND,
} from "./constants";
import { localHour } from "./time";

// need_wants_at is repurposed in V5 as "last slept at" (sleepy cooldown anchor).
export type NeedTimes = { fed: number | null; clean: number | null; bored: number | null; unwell: number | null; slept: number | null };
export type Need = { kind: NeedKind; verb: Verb; label: string };

// fallback persona-neutral copy; the routes route the words through the creature's pack.
export const NEED_LABEL: Record<NeedKind, string> = {
  unwell: "我有点不舒服…看看医生好不好",
  sleepy: "好困呀…哄我睡一会儿嘛",
  hungry: "肚子咕咕叫啦，到饭点啦",
  dirty: "身上脏脏的，想洗个香香的澡",
  bored: "好无聊呀，陪我玩一会儿嘛",
};

// which need a given action satisfies
export const VERB_NEED: Partial<Record<Verb, NeedKind>> = { feed: "hungry", clean: "dirty", doctor: "unwell", sleep: "sleepy", play: "bored" };

// the copy event that voices each need IN PERSONA
export const NEED_EVENT: Record<NeedKind, string> = {
  unwell: "state.sick", sleepy: "state.sleepy", hungry: "state.hungry", dirty: "state.dirty", bored: "state.bored",
};

export function isNightHour(hour: number): boolean { return hour >= NIGHT_FROM || hour < NIGHT_TO; }
function currentMeal(hour: number) { return MEALS.find((m) => hour >= m.from && hour < m.to); }

export function deriveNeeds(s: Snapshot, t: NeedTimes, nowMs: number, tzOffsetMin: number, asleep: boolean): Need[] {
  const hour = localHour(nowMs, tzOffsetMin);
  const night = isNightHour(hour);
  const sick = (s.state_flags & STATE.SICK) !== 0;
  const ready = (last: number | null, cd: number) => last == null || nowMs - last >= cd;
  const out: NeedKind[] = [];

  // unwell can surface even while resting
  if ((sick || s.health < NEED_DUE.unwell) && ready(t.unwell, NEED_COOLDOWN_MS.unwell)) out.push("unwell");

  if (!asleep) {
    if (night && ready(t.slept, NEED_COOLDOWN_MS.sleepy)) out.push("sleepy");
    // hunger: only inside a meal window and not yet fed this meal (or critically low)
    if (!night) {
      const meal = currentMeal(hour);
      if (meal) {
        const windowStart = nowMs - (hour - meal.from) * 3600_000;
        if (t.fed == null || t.fed < windowStart) out.push("hungry");
      } else if (s.satiety < HUNGER_SAFETY) out.push("hungry");
    } else if (s.satiety < HUNGER_SAFETY) out.push("hungry");
    if (s.cleanliness < NEED_DUE.dirty && ready(t.clean, NEED_COOLDOWN_MS.dirty)) out.push("dirty");
    if (!night && s.mood < NEED_DUE.bored && ready(t.bored, NEED_COOLDOWN_MS.bored)) out.push("bored");
  }

  return NEED_PRIORITY.filter((k) => out.includes(k))
    .slice(0, NEED_MAX_ACTIVE)
    .map((kind) => ({ kind, verb: NEED_VERB[kind], label: NEED_LABEL[kind] }));
}

export function isDue(needs: Need[], kind: NeedKind): boolean { return needs.some((n) => n.kind === kind); }

// Passive EXP per real hour: scaled by how well-cared (avg of the 4 live stats) and how
// bonded the pet is. A thriving, bonded pet grows ~9x faster passively than a neglected one.
export function passiveRatePerHour(s: Snapshot, cap: number): number {
  const avg01 = (s.satiety + s.cleanliness + s.health + s.mood) / (4 * cap);
  const careMult = Math.max(PASSIVE_CARE[0], Math.min(PASSIVE_CARE[1], 0.4 + 1.1 * avg01));
  const bondMult = Math.max(PASSIVE_BOND[0], Math.min(PASSIVE_BOND[1], 0.6 + 0.8 * (s.bond / 1000)));
  return PASSIVE_BASE * careMult * bondMult;
}

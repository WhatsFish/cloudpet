// V4 needs loop. A need is a DERIVED (not stored) token: its backing stat is low AND
// its cooldown since last satisfied has elapsed. Answering a DUE need is the big EXP
// draw; ignoring one never punishes — it just sits in the hint list and keeps the stat
// (and thus the passive-drip multiplier) low. Also the passive-EXP rate helper.

import type { Snapshot, Verb } from "@/lib/types";
import { STATE } from "@/lib/types";
import type { NeedKind } from "./constants";
import {
  NEED_DUE, NEED_COOLDOWN_MS, NEED_PRIORITY, NEED_MAX_ACTIVE, NEED_VERB,
  PASSIVE_BASE, PASSIVE_CARE, PASSIVE_BOND,
} from "./constants";

export type NeedTimes = { fed: number | null; clean: number | null; bored: number | null; unwell: number | null; wants: number | null };
export type Need = { kind: NeedKind; verb: Verb; label: string };

// fallback persona-neutral copy; M4 routes the words through the creature's copy pack.
export const NEED_LABEL: Record<NeedKind, string> = {
  unwell: "我有点不舒服…看看医生好不好",
  hungry: "肚子咕咕叫啦，喂我一口嘛",
  dirty: "身上脏脏的，想洗个香香的澡",
  bored: "好无聊呀，陪我玩一会儿嘛",
  wants: "想要你陪陪我～",
};

// which need a given action satisfies (for the need-reward check)
export const VERB_NEED: Partial<Record<Verb, NeedKind>> = { feed: "hungry", clean: "dirty", doctor: "unwell", play: "bored", pet: "wants" };

// the copy event that voices each need IN PERSONA (M4). The pet asks in its own voice.
export const NEED_EVENT: Record<NeedKind, string> = {
  hungry: "state.hungry", dirty: "state.dirty", unwell: "state.sick", bored: "state.bored", wants: "beg.want",
};

// The due needs, ordered by priority, capped. wants-X (persona/time) is deferred to M4.
export function deriveNeeds(s: Snapshot, t: NeedTimes, nowMs: number): Need[] {
  const sick = (s.state_flags & STATE.SICK) !== 0;
  const ready = (kind: NeedKind, last: number | null) => last == null || nowMs - last >= NEED_COOLDOWN_MS[kind];
  const due: NeedKind[] = [];
  if ((sick || s.health < NEED_DUE.unwell) && ready("unwell", t.unwell)) due.push("unwell");
  if (s.satiety < NEED_DUE.hungry && ready("hungry", t.fed)) due.push("hungry");
  if (s.cleanliness < NEED_DUE.dirty && ready("dirty", t.clean)) due.push("dirty");
  if (s.mood < NEED_DUE.bored && ready("bored", t.bored)) due.push("bored");
  return NEED_PRIORITY.filter((k) => due.includes(k))
    .slice(0, NEED_MAX_ACTIVE)
    .map((kind) => ({ kind, verb: NEED_VERB[kind], label: NEED_LABEL[kind] }));
}

export function isDue(needs: Need[], kind: NeedKind): boolean {
  return needs.some((n) => n.kind === kind);
}

// Passive EXP per real hour: scaled by how well-cared (avg of the 4 live stats) and how
// bonded the pet is. A thriving, bonded pet grows ~9x faster passively than a neglected one.
export function passiveRatePerHour(s: Snapshot, cap: number): number {
  const avg01 = (s.satiety + s.cleanliness + s.health + s.mood) / (4 * cap);
  const careMult = Math.max(PASSIVE_CARE[0], Math.min(PASSIVE_CARE[1], 0.4 + 1.1 * avg01));
  const bondMult = Math.max(PASSIVE_BOND[0], Math.min(PASSIVE_BOND[1], 0.6 + 0.8 * (s.bond / 1000)));
  return PASSIVE_BASE * careMult * bondMult;
}

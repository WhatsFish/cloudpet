// V5 verb pipeline. Pure: validate the INTERACTION rules, produce a plan the route
// persists. The model is coherent with a real pet:
//   - care (feed/clean/doctor) is gated on its NEED being DUE right now (meal window /
//     ~daily bath / sick) — you can't endlessly tap for EXP;
//   - sleep is a real STATE: while asleep, feeding/washing/playing are refused; only a
//     gentle 摸摸 (doesn't wake) or 叫醒 work. 哄睡 is only accepted when it's sleepy;
//   - affection (play/pet) is the always-available free outlet (bond, never EXP).
// exp/bond are returned, not applied — the route adds the need reward + pet soft cap.

import type { NeedKind, Snapshot, Stage, Verb } from "@/lib/types";
import { STATE } from "@/lib/types";
import type { BestiaryEntry } from "@/data/bestiary";
import { capForStage, stageDef } from "@/data/stage-table";
import { ACTIONS, NIGHT_FROM, NIGHT_TO, OVERFEED_ABOVE, SLEEPY_ENERGY, careExp } from "./constants";
import { VERB_NEED } from "./needs";
import { resolveStateFlags } from "./state";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export type CooldownRow = {
  daily_reset_on: string | null;
  streak_days: number;
  streak_state: "active" | "grace";
  last_active_date: string | null;
  care_charges: number;
  charges_updated_at: string | null;
};

export type ActionInput = {
  verb: Verb;
  stage: Stage;
  state: Snapshot; // already tick-recomputed
  creature: BestiaryEntry;
  nowMs: number;
  localHour: number; // user-local hour (for night / meal reasoning)
  dueKinds: NeedKind[]; // needs that are DUE right now (computed pre-action by the route)
};

export type ActionReject = {
  ok: false;
  error: "locked" | "unavailable";
  reason?: string; // asleep | not_sleepy | not_needed_<verb> | sick | still_young
  flavorEvent?: string;
};

export type ActionPlan = {
  ok: true;
  state: Snapshot;
  expGain: number;
  bondGain: number;
  woke: boolean; // V5: this action just woke the pet
  event: string;
  fx: string;
  animation: string;
};

export function planAction(inp: ActionInput): ActionPlan | ActionReject {
  const { verb, stage, creature, nowMs, localHour, dueKinds } = inp;
  const def = ACTIONS[verb];
  const s: Snapshot = { ...inp.state };
  const cap = capForStage(stage);
  const asleep = s.asleep;
  const night = localHour >= NIGHT_FROM || localHour < NIGHT_TO;

  if (stageDef(stage).order < def.unlockOrder) return { ok: false, error: "locked", reason: "still_young" };

  const apply = (effects: Partial<Record<keyof Snapshot, number>>) => {
    for (const [k, v] of Object.entries(effects) as [keyof Snapshot, number][]) (s[k] as number) = clamp((s[k] as number) + v, 0, cap);
  };
  const finish = (event: string, expGain: number, bondGain: number, fx: string, animation: string, woke = false): ActionPlan => {
    s.state_flags = resolveStateFlags(s, { noInteractionH: 0, lonelyAfterH: creature.lonelyAfterHours });
    s.last_tick = new Date(nowMs).toISOString();
    return { ok: true, state: s, expGain, bondGain, woke, event, fx, animation };
  };

  // ---- ASLEEP ----
  let wokeForCare = false;
  if (asleep) {
    if (verb === "sleep") { s.asleep = false; s.sleep_since = null; return finish("sleep.wake", 0, 1, "sparkle", "react_happy", true); }
    if (verb === "pet") return finish("pet.sleeping", 0, 1, "zzz", "sleep"); // gentle, no stat change, doesn't wake
    if (def.charge) {
      // a DUE care need (feed/clean/doctor) gently WAKES the pet, then we care for it below.
      const kind = VERB_NEED[verb];
      if (!kind || !dueKinds.includes(kind)) return { ok: false, error: "unavailable", reason: `not_needed_${verb}` };
      s.asleep = false; s.sleep_since = null; wokeForCare = true; // wake to be cared for, then fall through
    } else {
      return { ok: false, error: "unavailable", reason: "asleep" }; // e.g. play — don't wake it just to play
    }
  }

  // ---- AWAKE (or just woken for care) ----
  if (verb === "sleep") {
    if (!night && s.energy >= SLEEPY_ENERGY) return { ok: false, error: "unavailable", reason: "not_sleepy" };
    s.asleep = true; s.sleep_since = new Date(nowMs).toISOString();
    return finish("sleep.tuck", 0, def.bond, def.fx, "sleep");
  }

  if (def.charge) { // feed / clean / doctor — gated on its NEED being due (the rhythm limit)
    const kind = VERB_NEED[verb];
    if (!kind || !dueKinds.includes(kind)) return { ok: false, error: "unavailable", reason: `not_needed_${verb}` };
    let event = def.intent;
    if (verb === "feed" && s.satiety > OVERFEED_ABOVE) event = "feed.overfed";
    const statKey = Object.keys(def.effects)[0] as keyof Snapshot;
    const expGain = careExp(inp.state[statKey] as number, cap);
    apply(def.effects);
    return finish(event, expGain, def.bond, def.fx, verb === "feed" ? "eat_happy" : "react_happy", wokeForCare);
  }

  if (verb === "play") {
    if (def.blockedWhen?.includes("SICK") && s.state_flags & STATE.SICK) return { ok: false, error: "unavailable", reason: "sick", flavorEvent: "state.sick" };
    apply(def.effects);
    return finish("play", 0, def.bond, def.fx, "react_happy");
  }

  // pet (awake) — lively, always available
  apply(def.effects);
  return finish("pet", 0, def.bond, def.fx, "react_happy");
}

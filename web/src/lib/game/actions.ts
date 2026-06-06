// The V2 verb pipeline (REDESIGN_V2 §2/§5). Pure: validate gates, produce a plan
// the route persists. care (feed/clean/doctor) spends 1 battery charge → +25 EXP
// +6 bond; affection (play/pet/sleep) is free, 0 growth. No items, no cooldowns.

import type { Snapshot, Stage, Verb } from "@/lib/types";
import { STATE } from "@/lib/types";
import type { BestiaryEntry } from "@/data/bestiary";
import { capForStage, stageDef } from "@/data/stage-table";
import { ACTIONS, OVERFEED_ABOVE, careExp } from "./constants";
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
  charges: number; // already battery-recomputed
  creature: BestiaryEntry;
  nowMs: number;
};

export type ActionReject = {
  ok: false;
  error: "locked" | "no_charge" | "unavailable";
  reason?: string;
  flavorEvent?: string;
};

export type ActionPlan = {
  ok: true;
  state: Snapshot;
  expGain: number;
  bondGain: number;
  chargeSpent: boolean; // care actions spend 1 charge
  event: string; // copy event
  fx: string; // reaction FX overlay
  animation: string;
};

const ANIM: Record<Verb, string> = {
  feed: "eat_happy", clean: "react_happy", doctor: "react_happy",
  play: "react_happy", pet: "react_happy", sleep: "sleep",
};

export function planAction(inp: ActionInput): ActionPlan | ActionReject {
  const { verb, stage, creature, nowMs } = inp;
  const def = ACTIONS[verb];
  const s: Snapshot = { ...inp.state };
  const cap = capForStage(stage);

  // --- gates ---
  if (stageDef(stage).order < def.unlockOrder) return { ok: false, error: "locked", reason: "still_young" };
  if (def.blockedWhen?.includes("SICK") && s.state_flags & STATE.SICK) {
    return { ok: false, error: "unavailable", reason: "sick", flavorEvent: "state.sick" };
  }
  if (def.charge && inp.charges <= 0) return { ok: false, error: "no_charge", reason: "recharging" };

  // --- apply ---
  let event = def.intent;

  if (def.togglesSleep) {
    if (s.asleep) { s.asleep = false; s.sleep_since = null; event = "sleep.wake"; }
    else { s.asleep = true; s.sleep_since = new Date(nowMs).toISOString(); event = "sleep.tuck"; }
  }

  if (verb === "feed" && s.satiety > OVERFEED_ABOVE) event = "feed.overfed";

  // deficit-weighted EXP for care: value the tap by how much the stat NEEDED it
  // (computed from the pre-care value). Affection stays 0-growth (def.exp = 0).
  let expGain = def.exp;
  if (def.charge) {
    const statKey = Object.keys(def.effects)[0] as keyof Snapshot; // feed→satiety, clean→cleanliness, doctor→health
    expGain = careExp(inp.state[statKey] as number, cap);
  }

  for (const [k, v] of Object.entries(def.effects) as [keyof Snapshot, number][]) {
    (s[k] as number) = clamp((s[k] as number) + v, 0, cap);
  }

  s.exp += expGain;
  s.bond = clamp(s.bond + def.bond, 0, 1000);

  // re-resolve flags: an interaction just happened (clears LONELY/HIDING; play's
  // mood+20 from the floor lifts mood to ≥25 so SULKING is recomputed away; doctor
  // raising health clears SICK via the ≥60 hysteresis).
  s.state_flags = resolveStateFlags(s, { noInteractionH: 0, lonelyAfterH: creature.lonelyAfterHours });
  s.last_tick = new Date(nowMs).toISOString();

  return {
    ok: true,
    state: s,
    expGain,
    bondGain: def.bond,
    chargeSpent: def.charge,
    event,
    fx: def.fx,
    animation: ANIM[verb] ?? "react_happy",
  };
}

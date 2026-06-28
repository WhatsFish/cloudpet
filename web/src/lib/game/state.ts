// Mood bands, soft-fail state flags, and the single canonical mapping from
// computed state → sprite frame + animation cue + copy event (PLAN §5.6 / §7.2).

import type { MoodBand, Snapshot, StateFlagName } from "@/lib/types";
import { STATE } from "@/lib/types";
import { CRITICAL, HEALTH, STATE_THRESH } from "./constants";

export function moodBand(mood: number): MoodBand {
  if (mood >= 90) return "极好";
  if (mood >= 70) return "好";
  if (mood >= 40) return "平";
  if (mood >= 15) return "低";
  return "极低";
}

/**
 * Recompute the soft-fail flag bitmask from the current snapshot. SICK uses
 * hysteresis off the *previous* SICK bit (set <30, clear ≥60) so it doesn't
 * flicker. SULKING/HIDING/LONELY are stateless functions of mood + idle time.
 */
export function resolveStateFlags(
  s: Snapshot,
  ctx: { noInteractionH: number; lonelyAfterH: number },
): number {
  let flags = 0;

  const wasSick = (s.state_flags & STATE.SICK) !== 0;
  const sick = wasSick ? s.health < HEALTH.sickClearAt : s.health < HEALTH.sickBelow;
  if (sick) flags |= STATE.SICK;

  // V2 §4 濒危: health bottomed out AND away long enough. An actively-returning player keeps
  // noInteractionH small, so they never see it (anti-anxiety). Revival (action route) heals back
  // above this, so it can't immediately re-fire.
  if (s.health <= CRITICAL.health && ctx.noInteractionH > CRITICAL.afterH) flags |= STATE.CRITICAL;

  if (s.mood < STATE_THRESH.sulkMoodLt) flags |= STATE.SULKING;

  if (s.mood < STATE_THRESH.hideMoodLt && ctx.noInteractionH > STATE_THRESH.hideAfterH) {
    flags |= STATE.HIDING;
  }

  if (ctx.noInteractionH > ctx.lonelyAfterH) flags |= STATE.LONELY;

  return flags;
}

export type SpriteMood = "idle" | "happy" | "sad" | "sleeping" | "sulk" | "hide";

export type Dominant = {
  kind: "CRITICAL" | "SICK" | "HIDING" | "SULKING" | "SLEEPY" | "HUNGRY" | "DIRTY" | "LONELY" | "NORMAL";
  spriteMood: SpriteMood;
  animation: string;
  copyStateEvent: string | null; // a state.* event when a negative state dominates
  stateName: StateFlagName | "none";
};

/** Dominant-state precedence (PLAN §5.6; V2 §4 adds CRITICAL on top): CRITICAL > SICK > HIDING > SULKING > 困 > 饿 > 脏 > LONELY > 正常. */
export function dominant(s: Snapshot, asleep: boolean): Dominant {
  const f = s.state_flags;
  if (f & STATE.CRITICAL)
    // 派生占位美术: reuse the sad sprite + a weak slump; the client darkens the screen (vignette).
    return { kind: "CRITICAL", spriteMood: "sad", animation: "weak", copyStateEvent: "state.critical", stateName: "CRITICAL" };
  if (f & STATE.SICK)
    return { kind: "SICK", spriteMood: "sad", animation: "sick", copyStateEvent: "state.sick", stateName: "SICK" };
  if (f & STATE.HIDING)
    return { kind: "HIDING", spriteMood: "hide", animation: "hide", copyStateEvent: "state.hiding", stateName: "HIDING" };
  if (f & STATE.SULKING)
    return { kind: "SULKING", spriteMood: "sulk", animation: "sulk", copyStateEvent: "state.sulky", stateName: "SULKING" };
  if (asleep || s.energy < STATE_THRESH.sleepy)
    return { kind: "SLEEPY", spriteMood: "sleeping", animation: "sleep", copyStateEvent: "state.sleepy", stateName: "none" };
  if (s.satiety < STATE_THRESH.hungry)
    return { kind: "HUNGRY", spriteMood: "sad", animation: "idle_low", copyStateEvent: "state.hungry", stateName: "none" };
  if (s.cleanliness < STATE_THRESH.dirty)
    return { kind: "DIRTY", spriteMood: "sad", animation: "idle_low", copyStateEvent: "state.dirty", stateName: "none" };
  if (f & STATE.LONELY)
    return { kind: "LONELY", spriteMood: "idle", animation: "lonely", copyStateEvent: "state.lonely", stateName: "LONELY" };

  const mb = moodBand(s.mood);
  if (mb === "极好" || mb === "好")
    return { kind: "NORMAL", spriteMood: "happy", animation: "react_happy", copyStateEvent: null, stateName: "none" };
  if (mb === "平")
    return { kind: "NORMAL", spriteMood: "idle", animation: "idle", copyStateEvent: null, stateName: "none" };
  return { kind: "NORMAL", spriteMood: "sad", animation: "idle_low", copyStateEvent: null, stateName: "none" };
}

/** Small UI badges (all active minor states), in display order. */
export function badges(s: Snapshot, asleep: boolean): string[] {
  const b: string[] = [];
  if (s.state_flags & STATE.CRITICAL) b.push("濒危");
  if (s.state_flags & STATE.SICK) b.push("生病");
  if (s.satiety < STATE_THRESH.hungry) b.push("饿");
  if (s.cleanliness < STATE_THRESH.dirty) b.push("脏");
  if (!asleep && s.energy < STATE_THRESH.sleepy) b.push("困");
  if (s.state_flags & STATE.SULKING) b.push("闹脾气");
  if (s.state_flags & STATE.HIDING) b.push("躲起来");
  if (s.state_flags & STATE.LONELY) b.push("想你");
  return b;
}

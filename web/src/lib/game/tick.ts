// The source of truth: a pure, deterministic compute-on-read tick. Given the
// stored snapshot + last_tick, recompute the live state from elapsed real time
// (PLAN §5.2–5.7). No client trust, no LLM, stateless between reads.

import type { CareCounts, Snapshot, Stage } from "@/lib/types";
import { STATE } from "@/lib/types";
import type { BestiaryEntry } from "@/data/bestiary";
import { resolveSpecies } from "./evolve";
import {
  DECAY, DH_CAP, ENERGY_REGEN, H, HEALTH, HEALTH_FLOOR, LIVE_FLOOR,
  M_BOND_MAX_REDUCTION, M_SICK, M_SLEEP, M_STAGE, PASSIVE_WINDOW_CAP,
} from "./constants";
import { bondFloorForStage, capForStage, nextStage } from "@/data/stage-table";
import { resolveStateFlags } from "./state";
import { passiveRatePerHour } from "./needs";
import { daysBetween, isNight, nextLocalHour } from "./time";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export type RecomputeIn = {
  s: Snapshot;
  stage: Stage;
  createdAtMs: number;
  tzOffsetMin: number;
  lastInteractionMs: number; // max(last_* cooldown, created_at)
  creature: BestiaryEntry;
  nowMs: number;
  seedArchetype: string; // V3: the bonded seed (pet.archetype_key) for the teen fork
  care: CareCounts; // V3: care history that steers divergence
};

export type RecomputeOut = {
  s: Snapshot;
  stage: Stage;
  promoted: Stage | null;
  sick: boolean;
  resolvedSpecies: string | null; // V3: set when promoting into teen (the divergent form)
};

export function recompute(inp: RecomputeIn): RecomputeOut {
  const { creature, tzOffsetMin, nowMs } = inp;
  const s: Snapshot = { ...inp.s };
  let stage = inp.stage;

  const lastTickMs = Date.parse(s.last_tick);
  const dhTotal = clamp((nowMs - lastTickMs) / H, 0, DH_CAP);

  let asleep = s.asleep;
  const sleepSinceMs = s.sleep_since ? Date.parse(s.sleep_since) : null;
  const wakeMs = asleep && sleepSinceMs != null ? nextLocalHour(sleepSinceMs, tzOffsetMin, 7) : null;

  let passiveExp = 0;
  if (dhTotal > 0) {
    const startMs = nowMs - dhTotal * H; // clamped window start
    const bps: number[] = [startMs, nowMs];
    if (wakeMs != null && wakeMs > startMs && wakeMs < nowMs) bps.push(wakeMs);
    for (const hour of [7, 23]) {
      let b = nextLocalHour(startMs, tzOffsetMin, hour);
      while (b < nowMs) { bps.push(b); b += 24 * 3600_000; }
    }
    bps.sort((a, b) => a - b);

    const mBond = 1 - M_BOND_MAX_REDUCTION * (s.bond / 1000); // applies to mood & satiety
    const dm = creature.decayMult;

    for (let i = 0; i < bps.length - 1; i++) {
      const a = bps[i];
      const dh = (bps[i + 1] - a) / H;
      if (dh <= 0) continue;

      const mStage = M_STAGE[stage];
      const sick = (s.state_flags & STATE.SICK) !== 0;
      const activeSleep = asleep && wakeMs != null && bps[i + 1] <= wakeMs;
      const nap = !activeSleep && s.energy < 25 && isNight(a, tzOffsetMin);

      // energy: regen while (active) sleeping / napping; else decay (M_stage only)
      if (activeSleep) s.energy += ENERGY_REGEN.activeSleep * dh;
      else if (nap) s.energy += ENERGY_REGEN.passiveNap * dh;
      else s.energy -= DECAY.energyAwake * mStage * (dm.energy ?? 1) * dh;

      // satiety
      let rSat = DECAY.satiety * mStage * mBond * (dm.satiety ?? 1);
      if (activeSleep) rSat *= M_SLEEP.satiety!;
      if (sick) rSat *= M_SICK.satiety!;
      s.satiety -= rSat * dh;

      // mood
      let rMood = DECAY.mood * mStage * mBond * (dm.mood ?? 1);
      if (activeSleep) rMood *= M_SLEEP.mood!;
      s.mood -= rMood * dh;

      // cleanliness
      let rClean = DECAY.cleanliness * mStage * (dm.cleanliness ?? 1);
      if (activeSleep) rClean *= M_SLEEP.cleanliness!;
      if (sick) rClean *= M_SICK.cleanliness!;
      s.cleanliness -= rClean * dh;

      const cap = capForStage(stage);
      s.satiety = clamp(s.satiety, 0, cap);
      s.mood = clamp(s.mood, 0, cap);
      s.cleanliness = clamp(s.cleanliness, 0, cap);
      s.energy = clamp(s.energy, 0, cap);

      // health cross-effect (derived) from current stats
      const n = HEALTH.neglect;
      const neglect =
        (s.satiety < n.satietyLt ? n.satietyW : 0) +
        (s.cleanliness < n.cleanLt ? n.cleanW : 0) +
        (s.energy < n.energyLt ? n.energyW : 0) +
        (s.mood < n.moodLt ? n.moodW : 0);
      const r = HEALTH.recovery;
      const recov =
        s.satiety >= r.satietyGe && s.cleanliness >= r.cleanGe && s.energy >= r.energyGe && !sick
          ? r.rate
          : 0;
      s.health = clamp(s.health + (recov - neglect) * dh, 0, cap);

      // SICK hysteresis, updated per segment so later segments see it
      const nowSick = sick ? s.health < HEALTH.sickClearAt : s.health < HEALTH.sickBelow;
      if (nowSick) s.state_flags |= STATE.SICK;
      else s.state_flags &= ~STATE.SICK;

      // V4 passive EXP drip — scaled by current stats + bond, accrued per segment.
      passiveExp += passiveRatePerHour(s, cap) * dh;
    }

    s.bond = Math.max(bondFloorForStage(stage), Math.min(1000, s.bond - 0.05 * dhTotal));
    s.exp += Math.min(PASSIVE_WINDOW_CAP, Math.round(passiveExp)); // bounded so a long absence can't fast-forward
  }

  // active-sleep wake-up
  if (asleep && wakeMs != null && nowMs >= wakeMs) asleep = false;
  s.asleep = asleep;
  s.sleep_since = asleep ? s.sleep_since : null;

  // neglect floors — no bleak zero
  s.satiety = Math.max(LIVE_FLOOR, s.satiety);
  s.mood = Math.max(LIVE_FLOOR, s.mood);
  s.cleanliness = Math.max(LIVE_FLOOR, s.cleanliness);
  s.energy = Math.max(LIVE_FLOOR, s.energy);
  s.health = Math.max(HEALTH_FLOOR, s.health);

  // resolve sulk/hide/lonely (sick already settled above)
  const noInteractionH = Math.max(0, (nowMs - inp.lastInteractionMs) / H);
  const flags = resolveStateFlags(s, { noInteractionH, lonelyAfterH: creature.lonelyAfterHours });
  if (flags !== s.state_flags) {
    if (flags !== 0 && s.state_flags === 0) s.state_since = new Date(nowMs).toISOString();
    if (flags === 0) s.state_since = null;
    s.state_flags = flags;
  }

  // growth promotion (may chain), capped at MAX_STAGE_V1 via nextStage(). When the pet
  // crosses into teen, resolve the divergent form from its care history (V3 fork).
  let promoted: Stage | null = null;
  let resolvedSpecies: string | null = null;
  const days = daysBetween(inp.createdAtMs, nowMs);
  let nxt = nextStage(stage);
  while (nxt && s.exp >= nxt.expReq && days >= nxt.minDays && s.bond >= nxt.bondGate) {
    stage = nxt.stage;
    promoted = nxt.stage;
    if (nxt.stage === "teen") resolvedSpecies = resolveSpecies(inp.seedArchetype, inp.care);
    nxt = nextStage(stage);
  }

  // round for integer persistence
  s.satiety = Math.round(s.satiety);
  s.mood = Math.round(s.mood);
  s.cleanliness = Math.round(s.cleanliness);
  s.energy = Math.round(s.energy);
  s.health = Math.round(s.health);
  s.bond = Math.round(s.bond);
  s.last_tick = new Date(nowMs).toISOString();

  return { s, stage, promoted, sick: (s.state_flags & STATE.SICK) !== 0, resolvedSpecies };
}

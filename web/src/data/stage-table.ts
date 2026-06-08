// Growth / life stages. Gated on EXP AND real days AND bond (PLAN §5.7) so you
// can't rush stages by grinding in one sitting. Art for ALL stages (egg→adult,
// true forms + branch variants) is shipped, so promotion runs the full table up
// to MAX_STAGE — adult is the terminal stage, reached ≈week 2-3 (a real post-teen
// goal so the game doesn't go flat after the少年 fork).

import type { Stage } from "@/lib/types";
import { BOND_SPEED_FULL, STAGE_SPEED_MIN } from "@/lib/game/constants";

export type StageDef = {
  stage: Stage;
  order: number;
  expReq: number; // cumulative EXP needed to REACH this stage
  minDays: number; // real days since pet.created_at
  cap: number; // live-stat cap at this stage
  bondGate: number; // bond can't decay below this once reached
};

export const STAGES: StageDef[] = [
  { stage: "egg", order: 0, expReq: 0, minDays: 0, cap: 80, bondGate: 0 },
  { stage: "baby", order: 1, expReq: 120, minDays: 1, cap: 85, bondGate: 0 },
  // V2 (REDESIGN_V2 §4): expReq lands Lv chips exactly on stage-ups (Lv 2/4/7/11)
  // and keeps the day-gate binding before the exp-gate at a realistic ~80 EXP/day.
  // V4: exp re-tuned down (teen 900→620, adult 1700→1100) so under the faster
  // passive+need throughput a cared-for pet hits the exp gate ≈ at the day gate
  // (days/bond stay fixed → care buys SPEED, stages still can't be one-sit rushed).
  { stage: "child", order: 2, expReq: 380, minDays: 5, cap: 90, bondGate: 60 },
  { stage: "teen", order: 3, expReq: 620, minDays: 12, cap: 95, bondGate: 180 },
  { stage: "adult", order: 4, expReq: 1100, minDays: 21, cap: 100, bondGate: 400 },
];

// The terminal stage. The auto-tick promotes up to here (teen→adult is automatic — no fork);
// the only player-chosen transition is the child→teen fork (POST /api/pet/evolve). Named
// MAX_STAGE_V1 for back-compat; adult is now included.
export const MAX_STAGE_V1: Stage = "adult";

const BY_STAGE = new Map(STAGES.map((s) => [s.stage, s]));

export function stageDef(stage: Stage): StageDef {
  const s = BY_STAGE.get(stage);
  if (!s) throw new Error(`unknown stage: ${stage}`);
  return s;
}

export function capForStage(stage: Stage): number {
  return stageDef(stage).cap;
}

export function bondFloorForStage(stage: Stage): number {
  return stageDef(stage).bondGate;
}

/** The next stage up, or null if already at the V1 ceiling / adult. */
export function nextStage(stage: Stage): StageDef | null {
  const cur = stageDef(stage);
  if (cur.stage === MAX_STAGE_V1) return null;
  return STAGES.find((s) => s.order === cur.order + 1) ?? null;
}

export function expForNextStage(stage: Stage): number | null {
  return nextStage(stage)?.expReq ?? null;
}

/**
 * V8.2 进化提速: high 亲密度 (an active player) compresses the stage day-gate. Returns the
 * effective minDays for a pet at the given bond — full `minDays` at low bond, down to
 * `minDays × STAGE_SPEED_MIN` at/above BOND_SPEED_FULL. So frequent visitors (whose bond
 * climbs fast via checkin/care/play) see promotions/evolution sooner (child 5d → ~3d).
 */
export function effectiveMinDays(minDays: number, bond: number): number {
  const speed = Math.max(STAGE_SPEED_MIN, 1 - (1 - STAGE_SPEED_MIN) * Math.min(1, bond / BOND_SPEED_FULL));
  return Math.ceil(minDays * speed);
}

/**
 * True when a child pet has met ALL teen gates (exp + bond-accelerated days + bond) and is
 * therefore waiting at the child→teen fork. The fork is NOT crossed automatically — the player
 * picks the teen form in a modal (POST /api/pet/evolve). Returns false for any non-child stage.
 */
export function pendingTeenFork(stage: Stage, exp: number, bond: number, days: number): boolean {
  const nxt = nextStage(stage);
  return !!nxt && nxt.stage === "teen" && exp >= nxt.expReq && days >= effectiveMinDays(nxt.minDays, bond) && bond >= nxt.bondGate;
}

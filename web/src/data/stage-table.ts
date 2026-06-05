// Growth / life stages. Gated on EXP AND real days AND bond (PLAN §5.7) so you
// can't rush stages by grinding in one sitting. V1 ships egg→baby→child art, so
// promotion is capped at MAX_STAGE_V1 even though teen/adult are in the table.

import type { Stage } from "@/lib/types";

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
  { stage: "child", order: 2, expReq: 400, minDays: 5, cap: 90, bondGate: 60 },
  { stage: "teen", order: 3, expReq: 1000, minDays: 12, cap: 95, bondGate: 180 },
  { stage: "adult", order: 4, expReq: 2200, minDays: 21, cap: 100, bondGate: 400 },
];

export const MAX_STAGE_V1: Stage = "child";

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

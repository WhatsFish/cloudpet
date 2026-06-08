import { NextRequest, NextResponse } from "next/server";
import { withTx, query } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { buildContext, buildPetView, loadRows, tickAndPersistTz } from "@/lib/pet";
import { SPARK_EXP, SPARK_BOND } from "@/lib/game/constants";
import { nextStage } from "@/data/stage-table";
import { daysBetween } from "@/lib/game/time";
import { getPack } from "@/data/copybank";
import { selectCopy } from "@/lib/game/copy";
import { NEED_EVENT } from "@/lib/game/needs";
import type { NeedKind, Stage } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 灵感火花: spend one banked spark for a small EXP + bond bump. Sparks regen over time (the
// tick handles regen); this just consumes + rewards. Server-authoritative — the client can't
// mint EXP. Gives every visit something fresh to do for growth beyond 陪玩/摸摸.
export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const u = await query<{ tz_offset_minutes: number; theme: string }>(
    `SELECT tz_offset_minutes, theme FROM app_user WHERE user_id=$1`, [userId]);
  const tz = u[0]?.tz_offset_minutes ?? 480;
  const theme = u[0]?.theme ?? "cream";
  const now = Date.now();

  const result = await withTx(async (q) => {
    let rows = await loadRows(q, userId, true);
    if (!rows) return { http: 404, body: { error: "no_pet" } };
    ({ rows } = await tickAndPersistTz(q, rows, now, tz)); // regen sparks first

    if (rows.sparks <= 0) return { http: 409, body: { ok: false, error: "no_sparks", line: "火花还在攒，过一会儿再来接～" } };

    const s = rows.state;
    s.exp += SPARK_EXP;
    s.bond = Math.max(0, Math.min(1000, s.bond + SPARK_BOND));
    const sparks = rows.sparks - 1;
    await q(`UPDATE pet_state SET exp=$2, bond=$3, sparks=$4, sparks_at=$5 WHERE pet_id=$1`,
      [rows.pet.id, s.exp, s.bond, sparks, new Date(now).toISOString()]);
    rows = { ...rows, state: s, sparks, sparksAt: now };

    // promote up to child if the spark EXP crossed a gate (teen fork stays a player choice)
    let stage: Stage = rows.pet.stage, promoted: Stage | null = null;
    const days = daysBetween(Date.parse(rows.pet.created_at), now);
    let nx = nextStage(stage);
    while (nx && nx.stage !== "teen" && s.exp >= nx.expReq && days >= nx.minDays && s.bond >= nx.bondGate) { stage = nx.stage; promoted = nx.stage; nx = nextStage(stage); }
    if (promoted) await q(`UPDATE pet SET stage=$2 WHERE id=$1`, [rows.pet.id, stage]);

    const rows2 = { ...rows, pet: { ...rows.pet, stage } };
    const ctx = buildContext(rows2, now, tz);
    const pack = getPack(rows2.pet.archetype_key);
    const promoteLine = promoted ? selectCopy(pack, "growth.promote", ctx, `spark.promote.${now}`).text : null;
    const needLine = (kind: NeedKind) => selectCopy(pack, NEED_EVENT[kind], ctx, `need.${kind}.${now}`).text;
    const view = buildPetView(rows2, { nowMs: now, tz, theme, voice: null, recap: null, needLine });
    return { http: 200, body: { ok: true, ...view, line: `✨ 接住一点灵感，+${SPARK_EXP} 经验！`, sparkGain: { exp: SPARK_EXP, bond: SPARK_BOND }, promoted, promoteLine } };
  });

  return NextResponse.json(result.body, { status: result.http });
}

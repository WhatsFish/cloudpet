import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { loadRows, buildContext } from "@/lib/pet";
import { getPack } from "@/data/copybank";
import { selectCopy } from "@/lib/game/copy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// First-hatch: the egg cracks during onboarding so the user meets their creature
// immediately (no day-long wait). Promotes egg→baby unconditionally; later stages
// keep the slow EXP/days/bond cadence. Idempotent — calling on a non-egg pet just
// returns the current sprite + a greeting.
export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await loadRows(query, userId);
  if (!rows) return NextResponse.json({ error: "no_pet" }, { status: 404 });

  if (rows.pet.stage === "egg") {
    await query(`UPDATE pet SET stage='baby' WHERE id=$1`, [rows.pet.id]);
    rows.pet.stage = "baby";
  }

  const tz = (await query<{ tz_offset_minutes: number }>(
    `SELECT tz_offset_minutes FROM app_user WHERE user_id=$1`, [userId],
  ))[0]?.tz_offset_minutes ?? 480;

  const ctx = buildContext(rows, Date.now(), tz);
  const line = selectCopy(getPack(rows.pet.species_id), "greet.open", ctx, `hatch.${Date.now()}`).text;

  return NextResponse.json({
    ok: true,
    line,
    sprite: { creatureId: rows.pet.species_id, stage: rows.pet.stage, mood: "happy", animation: "react_happy" },
  });
}

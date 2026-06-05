import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import {
  buildContext, buildPetView, ensureDailyVoice, loadRows, tickAndPersistTz,
} from "@/lib/pet";
import { localDateStr } from "@/lib/game/time";
import { getPack } from "@/data/copybank";
import { buildDiary } from "@/lib/game/copy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function userTz(userId: string): Promise<number> {
  const rows = await query<{ tz_offset_minutes: number }>(
    `SELECT tz_offset_minutes FROM app_user WHERE user_id = $1`, [userId],
  );
  return rows[0]?.tz_offset_minutes ?? 480;
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tz = await userTz(userId);
  const now = Date.now();

  let rows = await loadRows(query, userId);
  if (!rows) return NextResponse.json({ error: "no_pet" }, { status: 404 });

  ({ rows } = await tickAndPersistTz(query, rows, now, tz));

  const localDate = localDateStr(now, tz);
  const ctx = buildContext(rows, now, tz);

  const recent = await query<{ line_id: string }>(
    `SELECT line_id FROM voice_log WHERE pet_id=$1 ORDER BY created_at DESC LIMIT 10`,
    [rows.pet.id],
  );
  const recentIds = recent.map((r) => r.line_id);
  const pack = getPack(rows.pet.species_id);

  const voice = await ensureDailyVoice(rows, ctx, localDate, () => buildDiary(pack, ctx, recentIds));

  return NextResponse.json(buildPetView(rows, now, localDate, voice));
}

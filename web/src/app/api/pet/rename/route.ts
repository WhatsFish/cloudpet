import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { loadRows, buildContext } from "@/lib/pet";
import { getPack } from "@/data/copybank";
import { selectCopy } from "@/lib/game/copy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { name?: string };
  try {
    body = (await req.json()) as { name?: string };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (name.length < 1 || name.length > 12) {
    return NextResponse.json({ error: "name must be 1-12 chars" }, { status: 400 });
  }

  const rows = await loadRows(query, userId);
  if (!rows) return NextResponse.json({ error: "no_pet" }, { status: 404 });

  await query(`UPDATE pet SET name=$2 WHERE user_id=$1`, [userId, name]);

  const tz = (await query<{ tz_offset_minutes: number }>(
    `SELECT tz_offset_minutes FROM app_user WHERE user_id=$1`, [userId],
  ))[0]?.tz_offset_minutes ?? 480;
  const ctx = buildContext(rows, Date.now(), tz);
  const line = selectCopy(getPack(rows.pet.species_id), "name.given", ctx, `name.${Date.now()}`).text;

  return NextResponse.json({ ok: true, name, line });
}

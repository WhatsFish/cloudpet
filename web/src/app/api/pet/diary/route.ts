import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const pets = await query<{ id: number }>(`SELECT id FROM pet WHERE user_id=$1`, [userId]);
  const pet = pets[0];
  if (!pet) return NextResponse.json({ error: "no_pet" }, { status: 404 });

  const voices = await query<{ local_date: string; line: string; created_at: string }>(
    `SELECT local_date::text, line, created_at::text
       FROM voice_log WHERE pet_id=$1 ORDER BY created_at DESC LIMIT 30`,
    [pet.id],
  );
  const actions = await query<{ verb: string; line: string | null; created_at: string; local_date: string }>(
    `SELECT verb, line, created_at::text, local_date::text
       FROM action_log WHERE pet_id=$1 ORDER BY created_at DESC LIMIT 40`,
    [pet.id],
  );

  return NextResponse.json({ voices, actions });
}

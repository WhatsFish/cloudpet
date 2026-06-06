import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const THEMES = ["cream", "mint", "dusk"];

// Set the device skin. The pet's data is unchanged; this is purely cosmetic.
export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { theme?: string };
  try { body = (await req.json()) as { theme?: string }; }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const theme = body.theme ?? "";
  if (!THEMES.includes(theme)) return NextResponse.json({ error: "bad theme" }, { status: 400 });

  await query(`UPDATE app_user SET theme=$2 WHERE user_id=$1`, [userId, theme]);
  return NextResponse.json({ ok: true, theme });
}

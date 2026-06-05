import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { exchangeCodeForOpenid } from "@/lib/wechat";
import { query } from "@/lib/db";
import { validateTz } from "@/lib/game/time";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LoginBody = { code?: string; tz_offset_minutes?: number };

export async function POST(req: NextRequest) {
  let body: LoginBody;
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const tz = validateTz(body.tz_offset_minutes);
  let userId: string;
  let isAnonymous = false;

  if (body.code) {
    try {
      const openid = await exchangeCodeForOpenid(body.code);
      if (openid) {
        userId = openid;
      } else {
        userId = `anon-${randomUUID()}`;
        isAnonymous = true;
      }
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "wx login failed" },
        { status: 502 },
      );
    }
  } else {
    userId = `anon-${randomUUID()}`;
    isAnonymous = true;
  }

  await query(
    `INSERT INTO app_user (user_id, is_anonymous, tz_offset_minutes)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET tz_offset_minutes = EXCLUDED.tz_offset_minutes, last_seen = NOW()`,
    [userId, isAnonymous, tz],
  );

  return NextResponse.json({ user_id: userId, is_anonymous: isAnonymous });
}

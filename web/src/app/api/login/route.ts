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

  // Authoritative identity: 微信云托管 injects X-WX-OPENID after authenticating the caller. When
  // present we adopt it directly (no jscode2session needed) — it is the same openid that auth.ts
  // trusts on every later request, so the client never has to be believed about who it is.
  const gwOpenid = req.headers.get("x-wx-openid");
  if (gwOpenid && /^[A-Za-z0-9_-]{6,128}$/.test(gwOpenid)) {
    userId = gwOpenid;
  } else if (body.code) {
    try {
      const openid = await exchangeCodeForOpenid(body.code);
      userId = openid ?? `anon-${randomUUID()}`;
      isAnonymous = !openid;
    } catch (e) {
      // A reused/expired js_code (errcode 40163/40029) must NOT brick onboarding — fall back to
      // an anonymous id so the user still gets a pet. (Best-effort log; not surfaced.)
      console.error("jscode2session failed, falling back to anon:", e instanceof Error ? e.message : e);
      userId = `anon-${randomUUID()}`;
      isAnonymous = true;
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

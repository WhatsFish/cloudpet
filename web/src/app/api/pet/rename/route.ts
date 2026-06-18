import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { checkTextSec } from "@/lib/wechat";
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
  // strip control / zero-width / direction-override chars (.trim() doesn't), then length-gate
  const name = (body.name ?? "")
    .trim()
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e]/g, "");
  if (name.length < 1 || name.length > 12) {
    return NextResponse.json({ error: "name must be 1-12 chars" }, { status: 400 });
  }

  // 内容安全:微信审核要求存储/展示的用户文本必过 msgSecCheck;违规则拒绝(fail-open 容错见 checkTextSec)
  const sec = await checkTextSec(name, userId);
  if (!sec.ok) {
    return NextResponse.json({ error: "name_rejected", message: sec.reason }, { status: 400 });
  }

  const rows = await loadRows(query, userId);
  if (!rows) return NextResponse.json({ error: "no_pet" }, { status: 404 });

  await query(`UPDATE pet SET name=$2 WHERE user_id=$1`, [userId, name]);

  const tz = (await query<{ tz_offset_minutes: number }>(
    `SELECT tz_offset_minutes FROM app_user WHERE user_id=$1`, [userId],
  ))[0]?.tz_offset_minutes ?? 480;
  const ctx = buildContext(rows, Date.now(), tz);
  // copy bank is keyed on the stable line head (archetype_key), NOT species_id — after the teen
  // fork species_id becomes '<line>__<variant>' which isn't a pack key (audit L1 fix).
  const line = selectCopy(getPack(rows.pet.archetype_key), "name.given", ctx, `name.${Date.now()}`).text;

  return NextResponse.json({ ok: true, name, line });
}

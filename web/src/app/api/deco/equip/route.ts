import { NextRequest, NextResponse } from "next/server";
import { withTx } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { loadRows, decoContext } from "@/lib/pet";
import { decoItem, isUnlocked } from "@/data/deco";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Equip (or clear, with hatId=null) the head decoration. Server-authoritative: a hat can only be
// equipped if its unlock condition is currently met — the client never grants ownership.
export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { hatId?: string | null };
  try { body = (await req.json()) as { hatId?: string | null }; }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const hatId = body.hatId ?? null;

  const result = await withTx<{ http: number; body: unknown }>(async (q) => {
    const rows = await loadRows(q, userId, true);
    if (!rows) return { http: 404, body: { error: "no_pet" } };

    if (hatId !== null) {
      const item = decoItem(hatId);
      if (!item || item.slot !== "hat") return { http: 400, body: { ok: false, error: "unknown_hat" } };
      if (!isUnlocked(item.unlock, decoContext(rows, Date.now()))) {
        return { http: 409, body: { ok: false, error: "locked", line: "这顶帽子还没解锁哦" } };
      }
    }
    await q(`UPDATE pet_state SET equipped_hat=$2, updated_at=NOW() WHERE pet_id=$1`, [rows.pet.id, hatId]);
    return { http: 200, body: { ok: true, equipped: hatId } };
  });

  return NextResponse.json(result.body, { status: result.http });
}

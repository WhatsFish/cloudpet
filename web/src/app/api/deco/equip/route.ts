import { NextRequest, NextResponse } from "next/server";
import { withTx } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { loadRows, decoContext } from "@/lib/pet";
import { decoItem, isUnlocked, type DecoSlot } from "@/data/deco";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SLOT_COL: Record<DecoSlot, "equipped_hat" | "equipped_aura"> = { hat: "equipped_hat", aura: "equipped_aura" };

// Equip (or clear, with itemId=null) a decoration in its slot. Server-authoritative: an item can
// only be equipped if its unlock condition is currently met — the client never grants ownership.
// V2 §5: multi-slot. Back-compat — legacy clients POST { hatId } (head slot); new clients POST
// { slot, itemId }. itemId's own slot is authoritative, so { itemId } alone also works.
export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { hatId?: string | null; itemId?: string | null; slot?: string };
  try { body = (await req.json()) as typeof body; }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  // resolve the target id (null = clear). hatId is the legacy field.
  const itemId = body.itemId !== undefined ? body.itemId : (body.hatId ?? null);

  const result = await withTx<{ http: number; body: unknown }>(async (q) => {
    const rows = await loadRows(q, userId, true);
    if (!rows) return { http: 404, body: { error: "no_pet" } };

    let slot: DecoSlot;
    if (itemId !== null && itemId !== undefined) {
      const item = decoItem(itemId);
      if (!item) return { http: 400, body: { ok: false, error: "unknown_item" } };
      slot = item.slot; // the item's own slot wins (ignore a mismatched body.slot)
      if (!isUnlocked(item.unlock, decoContext(rows, Date.now()))) {
        return { http: 409, body: { ok: false, error: "locked", line: "这件装扮还没解锁哦" } };
      }
    } else {
      // clearing — need the slot from the body (default hat for legacy { hatId:null })
      slot = (body.slot as DecoSlot) ?? "hat";
      if (slot !== "hat" && slot !== "aura") return { http: 400, body: { ok: false, error: "bad_slot" } };
    }

    const col = SLOT_COL[slot];
    await q(`UPDATE pet_state SET ${col}=$2, updated_at=NOW() WHERE pet_id=$1`, [rows.pet.id, itemId ?? null]);
    return { http: 200, body: { ok: true, slot, equipped: itemId ?? null } };
  });

  return NextResponse.json(result.body, { status: result.http });
}

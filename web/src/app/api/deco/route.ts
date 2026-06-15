import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { loadRows, decoContext } from "@/lib/pet";
import { DECO, isUnlocked, lockHint } from "@/data/deco";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 衣柜 catalog: every hat + whether it's unlocked (compute-on-read off the pet's life facts) and,
// if locked, how to earn it. No tick/mutation — a plain read.
export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await loadRows(query, userId, false);
  if (!rows) return NextResponse.json({ error: "no_pet" }, { status: 404 });

  const ctx = decoContext(rows, Date.now());
  const items = DECO.map((d) => {
    const unlocked = isUnlocked(d.unlock, ctx);
    return {
      id: d.id, slot: d.slot, name: d.name, blurb: d.blurb,
      unlocked, lockHint: unlocked ? "" : lockHint(d.unlock),
      equipped: rows.equippedHat === d.id,
    };
  });
  return NextResponse.json({ items, equipped: rows.equippedHat });
}

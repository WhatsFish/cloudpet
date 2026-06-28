import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { loadRows, decoContext } from "@/lib/pet";
import { TITLES, titleEarned, titleHint } from "@/data/titles";
import { speciesName } from "@/lib/game/evolve";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// V2 §7 纪元: the title collection (compute-on-read) + a short journey feed (from growth_event).
// A plain read — no tick/mutation.
export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await loadRows(query, userId, false);
  if (!rows) return NextResponse.json({ error: "no_pet" }, { status: 404 });

  const ctx = decoContext(rows, Date.now());
  const titles = TITLES.map((t) => {
    const earned = titleEarned(t.cond, ctx);
    return { id: t.id, name: t.name, blurb: t.blurb, awakening: !!t.awakening, earned, hint: earned ? "" : titleHint(t.cond) };
  });
  const earnedCount = titles.filter((t) => t.earned).length;

  // journey: the milestone growth_events (stage-ups / evolutions / level-ups), newest first.
  const ge = await query<{ kind: string; level_to: number; stage_to: string; evolved_to: string | null; local_date: string }>(
    `SELECT kind, level_to, stage_to, evolved_to, local_date::text AS local_date
     FROM growth_event WHERE pet_id=$1 AND kind IN ('stage','evolve','level')
     ORDER BY created_at DESC LIMIT 30`, [rows.pet.id],
  );
  const STAGE_CN: Record<string, string> = { egg: "蛋", baby: "幼年", child: "童年", teen: "少年", adult: "成年" };
  const journey = ge.map((g) => ({
    date: g.local_date,
    text: g.kind === "evolve" && g.evolved_to ? `进化成「${speciesName(g.evolved_to)}」`
      : g.kind === "stage" ? `长成了${STAGE_CN[g.stage_to] ?? g.stage_to}`
      : `升到 Lv${g.level_to}`,
  }));

  return NextResponse.json({ titles, earnedCount, total: titles.length, journey });
}

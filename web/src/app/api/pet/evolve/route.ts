import { NextRequest, NextResponse } from "next/server";
import { withTx, query } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { buildContext, buildPetView, loadRows, tickAndPersistTz } from "@/lib/pet";
import { speciesForBranch, speciesName } from "@/lib/game/evolve";
import { pendingTeenFork } from "@/data/stage-table";
import { daysBetween, localDateStr } from "@/lib/game/time";
import { getPack } from "@/data/copybank";
import { selectCopy } from "@/lib/game/copy";
import { NEED_EVENT } from "@/lib/game/needs";
import type { NeedKind, NurtureLean } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The player's deliberate child→teen fork. The pet must be waiting at the fork (child stage
// + all teen gates met). The chosen branch sets the teen FORM (species_id) and promotes to
// teen — one-time, irreversible. Care no longer auto-decides the form; it only suggested one.
const BRANCHES: NurtureLean[] = ["balanced", "feed", "engage", "tend"];

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { branch?: string };
  try { body = (await req.json()) as { branch?: string }; }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const branch = body.branch as NurtureLean;
  if (!branch || !BRANCHES.includes(branch)) return NextResponse.json({ error: "bad branch" }, { status: 400 });

  const u = await query<{ tz_offset_minutes: number; theme: string }>(
    `SELECT tz_offset_minutes, theme FROM app_user WHERE user_id=$1`, [userId]);
  const tz = u[0]?.tz_offset_minutes ?? 480;
  const theme = u[0]?.theme ?? "cream";
  const now = Date.now();
  const localDate = localDateStr(now, tz);

  const result = await withTx(async (q) => {
    let rows = await loadRows(q, userId, true);
    if (!rows) return { http: 404, body: { error: "no_pet" } };
    ({ rows } = await tickAndPersistTz(q, rows, now, tz)); // never crosses into teen

    const days = daysBetween(Date.parse(rows.pet.created_at), now);
    if (!pendingTeenFork(rows.pet.stage, rows.state.exp, rows.state.bond, days)) {
      return { http: 409, body: { ok: false, error: "not_ready", line: "它还没到要长大的时候哦，再多陪陪它～" } };
    }

    const species = speciesForBranch(rows.pet.archetype_key, branch);
    await q(`UPDATE pet SET stage='teen', species_id=$2 WHERE id=$1`, [rows.pet.id, species]);
    await q(`INSERT INTO action_log (pet_id, user_id, verb, local_date, line_intent) VALUES ($1,$2,'evolve',$3,'evolve')`,
      [rows.pet.id, userId, localDate]);

    const rows2 = { ...rows, pet: { ...rows.pet, stage: "teen" as const, species_id: species } };
    const ctx = buildContext(rows2, now, tz);
    const pack = getPack(rows2.pet.archetype_key); // variants ride their line head's voice
    const name = speciesName(species);
    const line = `我长成「${name}」啦！这是你为我选的样子，谢谢你～`;
    const promoteLine = selectCopy(pack, "growth.promote", ctx, `evolve.${now}`).text;
    const needLine = (kind: NeedKind) => selectCopy(pack, NEED_EVENT[kind], ctx, `need.${kind}.${now}`).text;
    const view = buildPetView(rows2, { nowMs: now, tz, theme, voice: null, recap: null, needLine });
    return { http: 200, body: { ok: true, ...view, evolved: { speciesId: species, name }, line, promoteLine } };
  });

  return NextResponse.json(result.body, { status: result.http });
}

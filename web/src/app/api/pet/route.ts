import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { buildContext, buildPetView, ensureDailyVoice, loadRows, tickAndPersistTz } from "@/lib/pet";
import { CHECKIN_BOND, RECAP_MIN_AWAY_MS, STREAK_EXP } from "@/lib/game/constants";
import { levelFromExp } from "@/lib/game/levels";
import { speciesName } from "@/lib/game/evolve";
import { localDateStr } from "@/lib/game/time";
import { getPack } from "@/data/copybank";
import { buildDiary, selectCopy } from "@/lib/game/copy";
import { NEED_EVENT } from "@/lib/game/needs";
import type { NeedKind, Recap, Stage } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function daysDiff(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

function recapLine(kind: string, evolvedToName: string | null): string {
  if (kind === "evolve" && evolvedToName) return `你不在的这阵子，我自己长大、还长成了「${evolvedToName}」！快看看我～`;
  if (kind === "stage") return "你不在的这阵子，我自己又长大了一点点，快回来看看我～";
  return "你不在的时候，我也在努力长大哦，等你好久啦～";
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const u = await query<{ tz_offset_minutes: number; theme: string }>(
    `SELECT tz_offset_minutes, theme FROM app_user WHERE user_id=$1`, [userId],
  );
  const tz = u[0]?.tz_offset_minutes ?? 480;
  const theme = u[0]?.theme ?? "cream";
  const now = Date.now();
  const localDate = localDateStr(now, tz);

  let rows = await loadRows(query, userId);
  if (!rows) return NextResponse.json({ error: "no_pet" }, { status: 404 });

  // Self-heal: the egg is only a transient onboarding ceremony — promote to baby.
  if (rows.pet.stage === "egg") {
    await query(`UPDATE pet SET stage='baby' WHERE id=$1`, [rows.pet.id]);
    rows.pet.stage = "baby";
  }

  // snapshot before the offline tick (for the away-then-grew recap)
  const prevExp = rows.state.exp;
  const prevStage = rows.pet.stage as Stage;
  const prevSpecies = rows.pet.species_id;
  const elapsedMs = now - Date.parse(rows.state.last_tick);

  let promoted: Stage | null;
  ({ rows, promoted } = await tickAndPersistTz(query, rows, now, tz));

  // record an offline growth event (recap source) when a long absence produced real growth
  const levelFrom = levelFromExp(prevExp), levelTo = levelFromExp(rows.state.exp);
  if (elapsedMs > RECAP_MIN_AWAY_MS && (promoted || levelTo - levelFrom >= 2)) {
    const evolved = rows.pet.species_id !== prevSpecies;
    const kind = promoted ? (evolved ? "evolve" : "stage") : "level";
    await query(
      `INSERT INTO growth_event (pet_id, kind, level_from, level_to, stage_from, stage_to, evolved_to, days_away, exp_gained, local_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [rows.pet.id, kind, levelFrom, levelTo, prevStage, rows.pet.stage, evolved ? rows.pet.species_id : null,
       Number((elapsedMs / 86400000).toFixed(1)), rows.state.exp - prevExp, localDate],
    );
  }

  // auto check-in (first open per local day; idempotent via uq_checkin_per_day)
  const ins = await query<{ id: number }>(
    `INSERT INTO action_log (pet_id, user_id, verb, local_date, line_intent)
     VALUES ($1,$2,'checkin',$3,'checkin')
     ON CONFLICT (pet_id, local_date) WHERE verb = 'checkin' DO NOTHING RETURNING id`,
    [rows.pet.id, userId, localDate],
  );
  if (ins[0]) {
    const cd = rows.cooldown;
    let streak: number;
    if (cd.last_active_date === localDate) streak = cd.streak_days;
    else {
      const gap = cd.last_active_date ? daysDiff(cd.last_active_date, localDate) : 999;
      streak = gap === 1 ? cd.streak_days + 1 : Math.max(1, Math.floor(cd.streak_days / 2) + 1);
    }
    const streakExp = streak === 7 ? STREAK_EXP.day7 : streak === 30 ? STREAK_EXP.day30 : 0;
    await query(`UPDATE pet_state SET bond = LEAST(1000, bond + $2), exp = exp + $3 WHERE pet_id=$1`,
      [rows.pet.id, CHECKIN_BOND, streakExp]);
    await query(`UPDATE pet_cooldown SET streak_days=$2, streak_state='active', last_active_date=$3 WHERE pet_id=$1`,
      [rows.pet.id, streak, localDate]);
    rows.state.bond = Math.min(1000, rows.state.bond + CHECKIN_BOND);
    rows.state.exp += streakExp;
    rows.cooldown.streak_days = streak;
  }

  // today's 心声
  const ctx = buildContext(rows, now, tz);
  const recent = await query<{ line_id: string }>(
    `SELECT line_id FROM voice_log WHERE pet_id=$1 ORDER BY created_at DESC LIMIT 10`, [rows.pet.id],
  );
  const pack = getPack(rows.pet.archetype_key); // V4: variants ride their line head's voice
  const voice = await ensureDailyVoice(rows, ctx, localDate, () => buildDiary(pack, ctx, recent.map((r) => r.line_id)));

  // one-shot recap: did it grow while you were away?
  let recap: Recap | null = null;
  const ge = await query<{ kind: string; level_from: number; level_to: number; stage_from: Stage; stage_to: Stage; evolved_to: string | null; days_away: string; exp_gained: number }>(
    `SELECT kind, level_from, level_to, stage_from, stage_to, evolved_to, days_away, exp_gained
     FROM growth_event WHERE pet_id=$1 AND seen=false ORDER BY created_at DESC LIMIT 1`, [rows.pet.id],
  );
  if (ge[0]) {
    const g = ge[0];
    const evolvedToName = g.evolved_to ? speciesName(g.evolved_to) : null;
    recap = {
      kind: g.kind as Recap["kind"], daysAway: Number(g.days_away), levelFrom: g.level_from, levelTo: g.level_to,
      stageFrom: g.stage_from, stageTo: g.stage_to, evolvedToName, expGained: g.exp_gained, line: recapLine(g.kind, evolvedToName),
    };
    await query(`UPDATE growth_event SET seen=true WHERE pet_id=$1 AND seen=false`, [rows.pet.id]);
  }

  const needLine = (kind: NeedKind) => selectCopy(pack, NEED_EVENT[kind], ctx, `need.${kind}.${localDate}`).text;
  return NextResponse.json(buildPetView(rows, { nowMs: now, tz, theme, voice, recap, needLine }));
}

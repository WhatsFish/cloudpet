import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { buildContext, buildPetView, ensureDailyVoice, loadRows, tickAndPersistTz } from "@/lib/pet";
import { computeCharges } from "@/lib/game/battery";
import { CHECKIN_BOND, STREAK_EXP } from "@/lib/game/constants";
import { localDateStr } from "@/lib/game/time";
import { getPack } from "@/data/copybank";
import { buildDiary } from "@/lib/game/copy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function daysDiff(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
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

  // Self-heal: the egg is only a transient onboarding ceremony — the home should
  // never show one. If a pet is somehow still an egg here (abandoned/failed hatch,
  // an older client), promote it to baby so it can never get stuck.
  if (rows.pet.stage === "egg") {
    await query(`UPDATE pet SET stage='baby' WHERE id=$1`, [rows.pet.id]);
    rows.pet.stage = "baby";
  }

  ({ rows } = await tickAndPersistTz(query, rows, now, tz));

  // battery (compute-on-read)
  const cs = computeCharges(
    rows.cooldown.care_charges, rows.cooldown.charges_updated_at, rows.cooldown.daily_reset_on, now, tz, localDate,
  );
  if (cs.changed) {
    if (cs.resetDailyTo) {
      await query(`UPDATE pet_cooldown SET care_charges=$2, charges_updated_at=$3, daily_reset_on=$4 WHERE pet_id=$1`,
        [rows.pet.id, cs.charges, cs.chargesUpdatedAt, cs.resetDailyTo]);
      rows.cooldown.daily_reset_on = cs.resetDailyTo;
    } else {
      await query(`UPDATE pet_cooldown SET care_charges=$2, charges_updated_at=$3 WHERE pet_id=$1`,
        [rows.pet.id, cs.charges, cs.chargesUpdatedAt]);
    }
    rows.cooldown.care_charges = cs.charges;
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

  return NextResponse.json(buildPetView(rows, {
    nowMs: now, charges: cs.charges, chargesRefreshInMs: cs.chargesRefreshInMs,
    dailyResetInMs: cs.dailyResetInMs, theme, voice,
  }));
}

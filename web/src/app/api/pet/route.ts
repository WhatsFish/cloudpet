import { NextRequest, NextResponse } from "next/server";
import { withTx } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { buildContext, buildPetView, ensureDailyVoice, loadRows, tickAndPersistTz } from "@/lib/pet";
import { CHECKIN_BOND, RECAP_MIN_AWAY_MS, SOFT_RECAP_EXP, STREAK_EXP } from "@/lib/game/constants";
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

function recapLine(kind: string, evolvedToName: string | null, expGained: number): string {
  if (kind === "evolve" && evolvedToName) return `你不在的这阵子，我自己长大、还长成了「${evolvedToName}」！快看看我～`;
  if (kind === "stage") return "你不在的这阵子，我自己又长大了一阶段，快回来看看我～";
  if (kind === "level") return "你不在的时候我也在努力长大，又升了一级哦～";
  // "rest": gentle overnight growth, no level-up — still a "because you care for me, I grew" beat.
  return `睡了一觉，我又悄悄长大了一点点${expGained > 0 ? `（+${expGained} 经验）` : ""}，想你啦～`;
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const now = Date.now();

  // The whole read runs in ONE transaction holding FOR UPDATE on the pet rows, so the
  // persisting tick + check-in/streak + growth_event + voice are serialized against the
  // mutating POST routes (action/spark/evolve) and against concurrent GETs — otherwise a
  // GET's stale absolute UPDATE would clobber a near-simultaneous action's exp/bond gains.
  // It also collapses what used to be ~15 separate connections into one pooled connection.
  const result = await withTx<{ http: number; body: unknown }>(async (q) => {
    const u = await q<{ tz_offset_minutes: number; theme: string }>(
      `SELECT tz_offset_minutes, theme FROM app_user WHERE user_id=$1`, [userId],
    );
    const tz = u[0]?.tz_offset_minutes ?? 480;
    const theme = u[0]?.theme ?? "cream";
    const localDate = localDateStr(now, tz);

    let rows = await loadRows(q, userId, true);
    if (!rows) return { http: 404, body: { error: "no_pet" } };

    // Self-heal: the egg is only a transient onboarding ceremony — promote to baby.
    if (rows.pet.stage === "egg") {
      await q(`UPDATE pet SET stage='baby' WHERE id=$1`, [rows.pet.id]);
      rows.pet.stage = "baby";
    }

    // snapshot before the offline tick (for the away-then-grew recap)
    const prevExp = rows.state.exp;
    const prevStage = rows.pet.stage as Stage;
    const prevSpecies = rows.pet.species_id;
    const elapsedMs = now - Date.parse(rows.state.last_tick);

    let promoted: Stage | null;
    ({ rows, promoted } = await tickAndPersistTz(q, rows, now, tz));

    // record an offline growth event (recap source) when a long absence produced growth. The
    // bar is deliberately LOW (a single overnight level, or even just SOFT_RECAP_EXP worth of
    // passive growth) so a daily overnight returner reliably gets a "I grew while you slept"
    // payoff — the comeback used to feel like nothing happened. Promotions/evolutions always
    // record; the softer "rest"/"level" events are gated to once per local day so opening twice
    // 8h+ apart in one day doesn't stack two modals.
    const levelFrom = levelFromExp(prevExp), levelTo = levelFromExp(rows.state.exp);
    const expGained = rows.state.exp - prevExp;
    const grewLevel = levelTo > levelFrom;
    if (elapsedMs > RECAP_MIN_AWAY_MS && (promoted || grewLevel || expGained >= SOFT_RECAP_EXP)) {
      let record = true;
      if (!promoted) {
        const already = await q<{ one: number }>(
          `SELECT 1 AS one FROM growth_event WHERE pet_id=$1 AND local_date=$2 LIMIT 1`, [rows.pet.id, localDate]);
        record = already.length === 0;
      }
      if (record) {
        const evolved = rows.pet.species_id !== prevSpecies;
        const kind = promoted ? (evolved ? "evolve" : "stage") : grewLevel ? "level" : "rest";
        await q(
          `INSERT INTO growth_event (pet_id, kind, level_from, level_to, stage_from, stage_to, evolved_to, days_away, exp_gained, local_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [rows.pet.id, kind, levelFrom, levelTo, prevStage, rows.pet.stage, evolved ? rows.pet.species_id : null,
           Number((elapsedMs / 86400000).toFixed(1)), expGained, localDate],
        );
      }
    }

    // auto check-in (first open per local day; idempotent via uq_checkin_per_day)
    const ins = await q<{ id: number }>(
      `INSERT INTO action_log (pet_id, user_id, verb, local_date, line_intent)
       VALUES ($1,$2,'checkin',$3,'checkin')
       ON CONFLICT (pet_id, local_date) WHERE verb = 'checkin' DO NOTHING RETURNING id`,
      [rows.pet.id, userId, localDate],
    );
    // signalled back so the client can CELEBRATE the return (toast) — otherwise +8 bond and the
    // day7/day30 milestone EXP happen silently and the comeback feels like nothing happened.
    let checkin: { firstOpenToday: boolean; bond: number; streakDays: number; milestoneExp: number; greet: string } | null = null;
    if (ins[0]) {
      const cd = rows.cooldown;
      let streak: number;
      if (cd.last_active_date === localDate) streak = cd.streak_days;
      else {
        const gap = cd.last_active_date ? daysDiff(cd.last_active_date, localDate) : 999;
        // gap<=0 is only producible by clock/timezone travel backward — never halve a real
        // streak for it (and never move last_active_date backward, below).
        streak = gap <= 0 ? cd.streak_days
          : gap === 1 ? cd.streak_days + 1
          : Math.max(1, Math.floor(cd.streak_days / 2) + 1);
      }
      // milestone EXP pays once per milestone EVER — gate on a per-pet high-water mark so a
      // halve-and-reclimb past an already-passed 7/30 doesn't re-grant. `>=` (not `===`) also
      // covers a long-absence catch-up that lands past the exact value.
      const prevMax = cd.max_streak_reached ?? 0;
      const streakExp =
        streak >= 30 && prevMax < 30 ? STREAK_EXP.day30 :
        streak >= 7 && prevMax < 7 ? STREAK_EXP.day7 : 0;
      const newMax = Math.max(prevMax, streak);
      // never move last_active_date backward on a gap<=0 (tz travel) read
      const newActiveDate = !cd.last_active_date || localDate >= cd.last_active_date ? localDate : cd.last_active_date;
      await q(`UPDATE pet_state SET bond = LEAST(1000, bond + $2), exp = exp + $3 WHERE pet_id=$1`,
        [rows.pet.id, CHECKIN_BOND, streakExp]);
      await q(`UPDATE pet_cooldown SET streak_days=$2, streak_state='active', last_active_date=$3, max_streak_reached=$4 WHERE pet_id=$1`,
        [rows.pet.id, streak, newActiveDate, newMax]);
      rows.state.bond = Math.min(1000, rows.state.bond + CHECKIN_BOND);
      rows.state.exp += streakExp;
      rows.cooldown.streak_days = streak;
      rows.cooldown.max_streak_reached = newMax;
      checkin = { firstOpenToday: true, bond: CHECKIN_BOND, streakDays: streak, milestoneExp: streakExp, greet: "" };
    }

    // today's 心声
    const ctx = buildContext(rows, now, tz);
    const recent = await q<{ line_id: string }>(
      `SELECT line_id FROM voice_log WHERE pet_id=$1 ORDER BY created_at DESC LIMIT 10`, [rows.pet.id],
    );
    const pack = getPack(rows.pet.archetype_key); // V4: variants ride their line head's voice
    const voice = await ensureDailyVoice(q, rows, ctx, localDate, () => buildDiary(pack, ctx, recent.map((r) => r.line_id)));

    // an in-character "你回来啦" greeting for the check-in toast (surfaces the authored
    // greet.return / greet.return_long beats that otherwise never fire). FALLBACK → greet.open
    // for the thinner packs. elapsedMs = time since the last visit (computed pre-tick above).
    if (checkin) {
      checkin.greet = selectCopy(pack, elapsedMs > RECAP_MIN_AWAY_MS ? "greet.return_long" : "greet.return", ctx, `greet.${localDate}`).text;
    }

    // one-shot recap: did it grow while you were away?
    let recap: Recap | null = null;
    const ge = await q<{ kind: string; level_from: number; level_to: number; stage_from: Stage; stage_to: Stage; evolved_to: string | null; days_away: string; exp_gained: number }>(
      `SELECT kind, level_from, level_to, stage_from, stage_to, evolved_to, days_away, exp_gained
       FROM growth_event WHERE pet_id=$1 AND seen=false ORDER BY created_at DESC LIMIT 1`, [rows.pet.id],
    );
    if (ge[0]) {
      const g = ge[0];
      const evolvedToName = g.evolved_to ? speciesName(g.evolved_to) : null;
      recap = {
        kind: g.kind as Recap["kind"], daysAway: Number(g.days_away), levelFrom: g.level_from, levelTo: g.level_to,
        stageFrom: g.stage_from, stageTo: g.stage_to, evolvedToName, expGained: g.exp_gained, line: recapLine(g.kind, evolvedToName, g.exp_gained),
      };
      await q(`UPDATE growth_event SET seen=true WHERE pet_id=$1 AND seen=false`, [rows.pet.id]);
    }

    const needLine = (kind: NeedKind) => selectCopy(pack, NEED_EVENT[kind], ctx, `need.${kind}.${localDate}`).text;
    return { http: 200, body: { ...buildPetView(rows, { nowMs: now, tz, theme, voice, recap, needLine }), checkin } };
  });

  return NextResponse.json(result.body, { status: result.http });
}

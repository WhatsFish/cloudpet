import { NextRequest, NextResponse } from "next/server";
import { withTx } from "@/lib/db";
import { query } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { buildContext, buildPetView, careCoveredToday, loadRows, tickAndPersistTz } from "@/lib/pet";
import { planAction } from "@/lib/game/actions";
import { ACTIONS, CARE, COMPLETE_BONUS } from "@/lib/game/constants";
import { computeCharges } from "@/lib/game/battery";
import { creature } from "@/data/bestiary";
import { nextStage } from "@/data/stage-table";
import { daysBetween, localDateStr } from "@/lib/game/time";
import { getPack } from "@/data/copybank";
import { selectCopy } from "@/lib/game/copy";
import type { Stage, Verb } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUS: Record<string, number> = { locked: 409, no_charge: 429, unavailable: 409 };

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { verb?: string };
  try { body = (await req.json()) as { verb?: string }; }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const verb = body.verb as Verb;
  if (!verb || !(verb in ACTIONS)) return NextResponse.json({ error: "bad verb" }, { status: 400 });

  const u = await query<{ tz_offset_minutes: number; theme: string }>(
    `SELECT tz_offset_minutes, theme FROM app_user WHERE user_id=$1`, [userId]);
  const tz = u[0]?.tz_offset_minutes ?? 480;
  const theme = u[0]?.theme ?? "cream";
  const now = Date.now();
  const localDate = localDateStr(now, tz);

  const result = await withTx(async (q) => {
    let rows = await loadRows(q, userId, true);
    if (!rows) return { http: 404, body: { error: "no_pet" } };
    ({ rows } = await tickAndPersistTz(q, rows, now, tz));

    // battery recompute + persist
    const cs = computeCharges(rows.cooldown.care_charges, rows.cooldown.charges_updated_at, rows.cooldown.daily_reset_on, now, tz, localDate);
    if (cs.changed) {
      if (cs.resetDailyTo) { await q(`UPDATE pet_cooldown SET care_charges=$2, charges_updated_at=$3, daily_reset_on=$4 WHERE pet_id=$1`, [rows.pet.id, cs.charges, cs.chargesUpdatedAt, cs.resetDailyTo]); rows.cooldown.daily_reset_on = cs.resetDailyTo; }
      else await q(`UPDATE pet_cooldown SET care_charges=$2, charges_updated_at=$3 WHERE pet_id=$1`, [rows.pet.id, cs.charges, cs.chargesUpdatedAt]);
      rows.cooldown.care_charges = cs.charges;
    }

    const coveredBefore = careCoveredToday(rows.state);
    const c = creature(rows.pet.species_id);
    const pack = getPack(rows.pet.species_id);
    const plan = planAction({ verb, stage: rows.pet.stage, state: rows.state, charges: cs.charges, creature: c, nowMs: now });

    if (!plan.ok) {
      let line: string | null = null;
      if (plan.flavorEvent) line = selectCopy(pack, plan.flavorEvent, buildContext(rows, now, tz), `${verb}.${now}`).text;
      return { http: STATUS[plan.error] ?? 409, body: { ok: false, error: plan.error, reason: plan.reason, line, chargesRefreshInMs: cs.chargesRefreshInMs } };
    }

    const s = plan.state;
    await q(`UPDATE pet_state SET satiety=$2, mood=$3, cleanliness=$4, energy=$5, health=$6, bond=$7, exp=$8, last_tick=$9, state_flags=$10, state_since=$11, asleep=$12, sleep_since=$13, updated_at=NOW() WHERE pet_id=$1`,
      [rows.pet.id, s.satiety, s.mood, s.cleanliness, s.energy, s.health, s.bond, s.exp, s.last_tick, s.state_flags, s.state_since, s.asleep, s.sleep_since]);

    // spend a care charge (start the regen timer if we just left full)
    let newCharges = cs.charges;
    let newUpdatedAt = cs.chargesUpdatedAt;
    if (plan.chargeSpent) {
      newCharges = cs.charges - 1;
      newUpdatedAt = cs.charges === CARE.maxCharges ? new Date(now).toISOString() : cs.chargesUpdatedAt;
      await q(`UPDATE pet_cooldown SET care_charges=$2, charges_updated_at=$3 WHERE pet_id=$1`, [rows.pet.id, newCharges, newUpdatedAt]);
    }

    // completion bonus (careCoveredToday false→true), idempotent once/day
    let completed = false;
    if (!coveredBefore && careCoveredToday(s)) {
      const ci = await q<{ id: number }>(
        `INSERT INTO action_log (pet_id, user_id, verb, local_date, line_intent) VALUES ($1,$2,'complete',$3,'complete')
         ON CONFLICT (pet_id, local_date) WHERE verb = 'complete' DO NOTHING RETURNING id`, [rows.pet.id, userId, localDate]);
      if (ci[0]) {
        completed = true;
        s.exp += COMPLETE_BONUS.exp;
        s.bond = Math.min(1000, s.bond + COMPLETE_BONUS.bond);
        await q(`UPDATE pet_state SET exp=$2, bond=$3 WHERE pet_id=$1`, [rows.pet.id, s.exp, s.bond]);
      }
    }

    // growth re-check
    let stage: Stage = rows.pet.stage;
    let promoted: Stage | null = null;
    const days = daysBetween(Date.parse(rows.pet.created_at), now);
    let nx = nextStage(stage);
    while (nx && s.exp >= nx.expReq && days >= nx.minDays && s.bond >= nx.bondGate) { stage = nx.stage; promoted = nx.stage; nx = nextStage(stage); }
    if (promoted) await q(`UPDATE pet SET stage=$2 WHERE id=$1`, [rows.pet.id, stage]);

    const rows2 = { ...rows, pet: { ...rows.pet, stage }, state: s };
    const ctx = buildContext(rows2, now, tz);
    const line = selectCopy(pack, plan.event, ctx, `${verb}.${now}`).text;
    const promoteLine = promoted ? selectCopy(pack, "growth.promote", ctx, `promote.${now}`).text : null;

    await q(`INSERT INTO action_log (pet_id, user_id, verb, local_date, line, line_intent, delta) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [rows.pet.id, userId, verb, localDate, line, plan.event, JSON.stringify({ exp: plan.expGain, bond: plan.bondGain, charge: plan.chargeSpent })]);

    const refreshMs = newCharges >= CARE.maxCharges ? 0 : Math.max(0, Date.parse(newUpdatedAt) + CARE.regenMs - now);
    const view = buildPetView(rows2, { nowMs: now, charges: newCharges, chargesRefreshInMs: refreshMs, dailyResetInMs: cs.dailyResetInMs, theme, voice: null });

    return { http: 200, body: { ok: true, ...view, line, fx: plan.fx, animation: plan.animation, promoted, promoteLine, completed, completeBonus: completed ? COMPLETE_BONUS : null } };
  });

  return NextResponse.json(result.body, { status: result.http });
}

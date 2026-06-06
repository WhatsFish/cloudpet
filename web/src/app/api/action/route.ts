import { NextRequest, NextResponse } from "next/server";
import { query, withTx } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import {
  buildContext, buildPetView, loadRows, normalizeDaily, tickAndPersistTz,
} from "@/lib/pet";
import { planAction, type CooldownRow } from "@/lib/game/actions";
import { ACTIONS } from "@/lib/game/constants";
import { creature } from "@/data/bestiary";
import { nextStage } from "@/data/stage-table";
import { daysBetween, localDateStr } from "@/lib/game/time";
import { getPack } from "@/data/copybank";
import { selectCopy } from "@/lib/game/copy";
import type { ItemKey, Stage, Verb } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUS: Record<string, number> = { cooldown: 429, unavailable: 409, locked: 409, no_item: 409 };

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { verb?: string };
  try {
    body = (await req.json()) as { verb?: string };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const verb = body.verb as Verb;
  if (!verb || !(verb in ACTIONS)) return NextResponse.json({ error: "bad verb" }, { status: 400 });

  const tzRows = await query<{ tz_offset_minutes: number }>(
    `SELECT tz_offset_minutes FROM app_user WHERE user_id=$1`, [userId],
  );
  const tz = tzRows[0]?.tz_offset_minutes ?? 480;
  const now = Date.now();
  const localDate = localDateStr(now, tz);

  const result = await withTx(async (q) => {
    let rows = await loadRows(q, userId, true);
    if (!rows) return { http: 404, body: { error: "no_pet" } };

    // daily counter rollover
    const norm = normalizeDaily(rows.cooldown, localDate);
    if (norm.changed) {
      await q(
        `UPDATE pet_cooldown SET feed_count_day=0, snack_count_day=0, pet_count_day=0, daily_reset_on=$2 WHERE pet_id=$1`,
        [rows.pet.id, localDate],
      );
    }
    rows = { ...rows, cooldown: norm.cd };

    // compute-on-read tick (persisted)
    ({ rows } = await tickAndPersistTz(q, rows, now, tz));

    const c = creature(rows.pet.species_id);
    const pack = getPack(rows.pet.species_id);

    const plan = planAction({
      verb, petId: rows.pet.id, stage: rows.pet.stage, state: rows.state,
      cooldown: rows.cooldown, inventory: rows.inventory, creature: c, nowMs: now, localDate,
    });

    if (!plan.ok) {
      let line: string | null = null;
      if (plan.flavorEvent) {
        const ctx = buildContext(rows, now, tz);
        line = selectCopy(pack, plan.flavorEvent, ctx, `${verb}.${now}`).text;
      }
      return {
        http: STATUS[plan.error] ?? 409,
        body: { ok: false, error: plan.error, reason: plan.reason, remainingMs: plan.remainingMs, line },
      };
    }

    // persist new state
    const s = plan.state;
    await q(
      `UPDATE pet_state SET satiety=$2, mood=$3, cleanliness=$4, energy=$5, health=$6,
         bond=$7, exp=$8, last_tick=$9, state_flags=$10, state_since=$11, asleep=$12,
         sleep_since=$13, updated_at=NOW() WHERE pet_id=$1`,
      [rows.pet.id, s.satiety, s.mood, s.cleanliness, s.energy, s.health, s.bond, s.exp,
       s.last_tick, s.state_flags, s.state_since, s.asleep, s.sleep_since],
    );

    // growth re-check (exp just increased)
    let stage: Stage = rows.pet.stage;
    let promoted: Stage | null = null;
    const days = daysBetween(Date.parse(rows.pet.created_at), now);
    let nx = nextStage(stage);
    while (nx && s.exp >= nx.expReq && days >= nx.minDays && s.bond >= nx.bondGate) {
      stage = nx.stage; promoted = nx.stage; nx = nextStage(stage);
    }
    if (promoted) await q(`UPDATE pet SET stage=$2 WHERE id=$1`, [rows.pet.id, stage]);

    // cooldown / counters
    const entries = Object.entries(plan.cooldownSet);
    if (entries.length) {
      const set = entries.map(([k], i) => `${k}=$${i + 2}`).join(", ");
      await q(`UPDATE pet_cooldown SET ${set} WHERE pet_id=$1`, [rows.pet.id, ...entries.map(([, v]) => v)]);
    }

    // inventory. NOTE: a CHECK(qty>=0) is evaluated on the proposed INSERT tuple
    // BEFORE ON CONFLICT can redirect to UPDATE, so a negative literal would fail
    // even when the row exists. Decrements (always on an existing, validated row)
    // use a plain UPDATE; only positive gifts upsert.
    for (const [item, delta] of Object.entries(plan.inventoryDelta) as [ItemKey, number][]) {
      if (!delta) continue;
      if (delta > 0) {
        await q(
          `INSERT INTO pet_inventory (pet_id, item_key, qty) VALUES ($1,$2,$3)
           ON CONFLICT (pet_id, item_key) DO UPDATE SET qty = pet_inventory.qty + EXCLUDED.qty`,
          [rows.pet.id, item, delta],
        );
      } else {
        await q(
          `UPDATE pet_inventory SET qty = qty + $3 WHERE pet_id=$1 AND item_key=$2`,
          [rows.pet.id, item, delta],
        );
      }
    }

    // updated rows for ctx/view
    const inv2 = { ...rows.inventory };
    for (const [k, d] of Object.entries(plan.inventoryDelta) as [ItemKey, number][]) inv2[k] = (inv2[k] ?? 0) + d;
    const rows2 = {
      ...rows,
      pet: { ...rows.pet, stage },
      state: s,
      cooldown: { ...rows.cooldown, ...plan.cooldownSet } as CooldownRow,
      inventory: inv2,
    };

    const ctx = buildContext(rows2, now, tz);
    const line = selectCopy(pack, plan.event, ctx, `${verb}.${now}`).text;
    const promoteLine = promoted ? selectCopy(pack, "growth.promote", ctx, `promote.${now}`).text : null;

    await q(
      `INSERT INTO action_log (pet_id, user_id, verb, local_date, line, line_intent, delta)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [rows.pet.id, userId, verb, localDate, line, plan.event, JSON.stringify({ exp: plan.expGain, bond: plan.bondGain })],
    );

    const view = buildPetView(rows2, now, localDate, null);
    return {
      http: 200,
      body: {
        ok: true,
        ...view,
        line,
        animation: plan.animation,
        rewards: plan.rewards ?? null,
        promoted,
        promoteLine,
      },
    };
  });

  return NextResponse.json(result.body, { status: result.http });
}

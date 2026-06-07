import { NextRequest, NextResponse } from "next/server";
import { withTx, query } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { buildContext, buildPetView, loadRows, tickAndPersistTz } from "@/lib/pet";
import { planAction } from "@/lib/game/actions";
import { ACTIONS, NEED_REWARD, PET_BOND_SOFTCAP } from "@/lib/game/constants";
import { deriveNeeds, isDue, NEED_EVENT, VERB_NEED } from "@/lib/game/needs";
import { resolveSpecies } from "@/lib/game/evolve";
import { creature } from "@/data/bestiary";
import { nextStage } from "@/data/stage-table";
import { daysBetween, localDateStr } from "@/lib/game/time";
import { getPack } from "@/data/copybank";
import { selectCopy } from "@/lib/game/copy";
import type { NeedKind, Stage, Verb } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUS: Record<string, number> = { locked: 409, unavailable: 409 };
const NEED_COL: Record<NeedKind, string> = { hungry: "need_fed_at", dirty: "need_clean_at", bored: "need_bored_at", unwell: "need_unwell_at", wants: "need_wants_at" };
const NEED_TKEY: Record<NeedKind, "fed" | "clean" | "bored" | "unwell" | "wants"> = { hungry: "fed", dirty: "clean", bored: "bored", unwell: "unwell", wants: "wants" };
const CARE_COL: Partial<Record<Verb, "care_feed" | "care_clean" | "care_doctor">> = { feed: "care_feed", clean: "care_clean", doctor: "care_doctor" };

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

    const c = creature(rows.pet.species_id);
    const pack = getPack(rows.pet.archetype_key); // variants speak in their line head's voice

    // which needs are DUE right now (before the action) — so we can reward answering one
    const dueNeeds = deriveNeeds(rows.state, rows.needTimes, now);
    const plan = planAction({ verb, stage: rows.pet.stage, state: rows.state, creature: c, nowMs: now });
    if (!plan.ok) {
      const line = plan.flavorEvent ? selectCopy(pack, plan.flavorEvent, buildContext(rows, now, tz), `${verb}.${now}`).text : null;
      return { http: STATUS[plan.error] ?? 409, body: { ok: false, error: plan.error, reason: plan.reason, line } };
    }

    const s = plan.state;
    let bondGain = plan.bondGain; // base (CARE_BOND or PLAY/PET base)

    // pet-bond soft cap: after PET_BOND_SOFTCAP pets/local-day, each further pet only +1
    let tapsToday = rows.tapsToday, tapsDay = rows.tapsDay;
    if (verb === "pet") {
      if (tapsDay !== localDate) { tapsToday = 0; tapsDay = localDate; }
      if (tapsToday >= PET_BOND_SOFTCAP) bondGain = 1;
      tapsToday += 1;
    }

    // need reward: did this action answer a DUE need? (the big draw)
    const fulfilledKind = VERB_NEED[verb];
    const fulfilled = !!fulfilledKind && isDue(dueNeeds, fulfilledKind);
    const needBonusExp = fulfilled ? NEED_REWARD.exp : 0;
    const needBonusBond = fulfilled ? NEED_REWARD.bond : 0;

    s.exp += plan.expGain + needBonusExp;
    s.bond = Math.max(0, Math.min(1000, s.bond + bondGain + needBonusBond));

    await q(`UPDATE pet_state SET satiety=$2, mood=$3, cleanliness=$4, energy=$5, health=$6, bond=$7, exp=$8, last_tick=$9, state_flags=$10, state_since=$11, asleep=$12, sleep_since=$13, pet_taps_today=$14, taps_day=$15, updated_at=NOW() WHERE pet_id=$1`,
      [rows.pet.id, s.satiety, s.mood, s.cleanliness, s.energy, s.health, s.bond, s.exp, s.last_tick, s.state_flags, s.state_since, s.asleep, s.sleep_since, tapsToday, tapsDay]);
    rows.tapsToday = tapsToday; rows.tapsDay = tapsDay;

    // stamp the fulfilled need's cooldown anchor
    if (fulfilled && fulfilledKind) {
      await q(`UPDATE pet_state SET ${NEED_COL[fulfilledKind]}=$2 WHERE pet_id=$1`, [rows.pet.id, new Date(now).toISOString()]);
      rows.needTimes[NEED_TKEY[fulfilledKind]] = now;
    }

    // care history (steers the teen fork). allow-listed column names.
    const col = CARE_COL[verb];
    if (col) { await q(`UPDATE pet_state SET ${col} = ${col} + 1 WHERE pet_id=$1`, [rows.pet.id]); rows.care[verb as "feed" | "clean" | "doctor"] += 1; }
    else if (verb === "play" || verb === "pet") { await q(`UPDATE pet_state SET affection_taps = affection_taps + 1 WHERE pet_id=$1`, [rows.pet.id]); rows.care.affection += 1; }

    // growth re-check (this action's EXP/bond may cross a stage gate) + teen fork
    let stage: Stage = rows.pet.stage;
    let promoted: Stage | null = null;
    let species = rows.pet.species_id;
    const days = daysBetween(Date.parse(rows.pet.created_at), now);
    let nx = nextStage(stage);
    while (nx && s.exp >= nx.expReq && days >= nx.minDays && s.bond >= nx.bondGate) {
      stage = nx.stage; promoted = nx.stage;
      if (nx.stage === "teen") species = resolveSpecies(rows.pet.archetype_key, rows.care);
      nx = nextStage(stage);
    }
    if (promoted) await q(`UPDATE pet SET stage=$2 WHERE id=$1`, [rows.pet.id, stage]);
    if (species !== rows.pet.species_id) await q(`UPDATE pet SET species_id=$2 WHERE id=$1`, [rows.pet.id, species]);

    const rows2 = { ...rows, pet: { ...rows.pet, stage, species_id: species }, state: s };
    const ctx = buildContext(rows2, now, tz);
    const line = selectCopy(pack, plan.event, ctx, `${verb}.${now}`).text;
    const promoteLine = promoted ? selectCopy(pack, "growth.promote", ctx, `promote.${now}`).text : null;

    await q(`INSERT INTO action_log (pet_id, user_id, verb, local_date, line, line_intent, delta) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [rows.pet.id, userId, verb, localDate, line, plan.event, JSON.stringify({ exp: plan.expGain + needBonusExp, bond: bondGain + needBonusBond, need: fulfilled ? fulfilledKind : null })]);

    const needLine = (kind: NeedKind) => selectCopy(pack, NEED_EVENT[kind], ctx, `need.${kind}.${now}`).text;
    const view = buildPetView(rows2, { nowMs: now, theme, voice: null, recap: null, needLine });
    return {
      http: 200,
      body: {
        ok: true, ...view, line, fx: plan.fx, animation: plan.animation, promoted, promoteLine,
        needReward: fulfilled ? { kind: fulfilledKind, base: plan.expGain, bonus: needBonusExp, bond: needBonusBond } : null,
      },
    };
  });

  return NextResponse.json(result.body, { status: result.http });
}

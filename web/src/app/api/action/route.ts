import { NextRequest, NextResponse } from "next/server";
import { withTx, query } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { buildContext, buildPetView, loadRows, tickAndPersistTz } from "@/lib/pet";
import { planAction } from "@/lib/game/actions";
import { ACTIONS, AFFECTION_NEED_BOND, CARE_NEEDS, NEED_REWARD, PET_BOND_SOFTCAP, WEIGHT_FEED, WEIGHT_STAGE_MAX } from "@/lib/game/constants";
import { deriveNeeds, NEED_EVENT, VERB_NEED } from "@/lib/game/needs";
import { creature } from "@/data/bestiary";
import { nextStage } from "@/data/stage-table";
import { daysBetween, localDateStr, localHour } from "@/lib/game/time";
import { getPack } from "@/data/copybank";
import { selectCopy } from "@/lib/game/copy";
import type { NeedKind, Stage, Verb } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUS: Record<string, number> = { locked: 409, unavailable: 409 };
const NEED_COL: Record<NeedKind, string> = { hungry: "need_fed_at", dirty: "need_clean_at", bored: "need_bored_at", unwell: "need_unwell_at", sleepy: "need_wants_at" };
const NEED_TKEY: Record<NeedKind, "fed" | "clean" | "bored" | "unwell" | "slept"> = { hungry: "fed", dirty: "clean", bored: "bored", unwell: "unwell", sleepy: "slept" };
const CARE_COL: Partial<Record<Verb, "care_feed" | "care_clean" | "care_doctor">> = { feed: "care_feed", clean: "care_clean", doctor: "care_doctor" };
// friendly refusal lines (not persona — these are gameplay-rule messages)
const REASON_LINE: Record<string, string> = {
  asleep: "嘘…它睡着啦，轻轻摸摸就好，别吵醒它",
  not_sleepy: "它现在精神着呢，还不困～",
  not_needed_feed: "它还饱着呢，到饭点再喂吧",
  not_needed_clean: "它挺干净的，今天不用洗啦",
  not_needed_doctor: "它没生病，健健康康的哦",
  sick: "它不太舒服，先看看医生吧",
  still_young: "它还太小，长大点才能这样玩哦",
};

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
  const hour = localHour(now, tz);

  const result = await withTx(async (q) => {
    let rows = await loadRows(q, userId, true);
    if (!rows) return { http: 404, body: { error: "no_pet" } };
    ({ rows } = await tickAndPersistTz(q, rows, now, tz));

    const c = creature(rows.pet.species_id);
    const pack = getPack(rows.pet.archetype_key);

    const dueNeeds = deriveNeeds(rows.state, rows.needTimes, now, tz, rows.state.asleep);
    const dueKinds = dueNeeds.map((n) => n.kind);
    const wasAsleep = rows.state.asleep;
    const plan = planAction({ verb, stage: rows.pet.stage, state: rows.state, creature: c, nowMs: now, localHour: hour, dueKinds });
    if (!plan.ok) {
      const line = REASON_LINE[plan.reason ?? ""]
        ?? (plan.flavorEvent ? selectCopy(pack, plan.flavorEvent, buildContext(rows, now, tz), `${verb}.${now}`).text : "它现在不想这样");
      return { http: STATUS[plan.error] ?? 409, body: { ok: false, error: plan.error, reason: plan.reason, line } };
    }

    const s = plan.state;
    let bondGain = plan.bondGain;

    // pet-bond soft cap (only an AWAKE pet; the gentle sleep-pet is fixed at +1)
    let tapsToday = rows.tapsToday, tapsDay = rows.tapsDay;
    if (verb === "pet" && !wasAsleep) {
      if (tapsDay !== localDate) { tapsToday = 0; tapsDay = localDate; }
      if (tapsToday >= PET_BOND_SOFTCAP) bondGain = 1;
      tapsToday += 1;
    }

    // need reward: CARE needs → EXP + bond; AFFECTION needs (sleepy/bored) → bond only
    const fulfilledKind = VERB_NEED[verb];
    const fulfilled = !!fulfilledKind && dueKinds.includes(fulfilledKind);
    let needBonusExp = 0, needBonusBond = 0;
    if (fulfilled && fulfilledKind) {
      if (CARE_NEEDS.includes(fulfilledKind)) { needBonusExp = NEED_REWARD.exp; needBonusBond = NEED_REWARD.bond; }
      else needBonusBond = AFFECTION_NEED_BOND;
    }

    s.exp += plan.expGain + needBonusExp;
    s.bond = Math.max(0, Math.min(1000, s.bond + bondGain + needBonusBond));
    if (verb === "feed") s.weight = Math.min(WEIGHT_STAGE_MAX[rows.pet.stage], s.weight + WEIGHT_FEED); // a good meal → grew a bit

    await q(`UPDATE pet_state SET satiety=$2, mood=$3, cleanliness=$4, energy=$5, health=$6, bond=$7, exp=$8, weight=$9, last_tick=$10, state_flags=$11, state_since=$12, asleep=$13, sleep_since=$14, pet_taps_today=$15, taps_day=$16, updated_at=NOW() WHERE pet_id=$1`,
      [rows.pet.id, s.satiety, s.mood, s.cleanliness, s.energy, s.health, s.bond, s.exp, s.weight, s.last_tick, s.state_flags, s.state_since, s.asleep, s.sleep_since, tapsToday, tapsDay]);
    rows.tapsToday = tapsToday; rows.tapsDay = tapsDay;

    // stamp the fulfilled need's cooldown anchor (sleepy → need_wants_at = "last slept")
    if (fulfilled && fulfilledKind) {
      await q(`UPDATE pet_state SET ${NEED_COL[fulfilledKind]}=$2 WHERE pet_id=$1`, [rows.pet.id, new Date(now).toISOString()]);
      rows.needTimes[NEED_TKEY[fulfilledKind]] = now;
    }

    // care history (steers the teen fork) — feed/clean/doctor only
    const col = CARE_COL[verb];
    if (col) { await q(`UPDATE pet_state SET ${col} = ${col} + 1 WHERE pet_id=$1`, [rows.pet.id]); rows.care[verb as "feed" | "clean" | "doctor"] += 1; }
    else if (verb === "play" || verb === "pet") { await q(`UPDATE pet_state SET affection_taps = affection_taps + 1 WHERE pet_id=$1`, [rows.pet.id]); rows.care.affection += 1; }

    // growth re-check. Promotes up to child only — the child→teen fork is a deliberate player
    // choice handled by POST /api/pet/evolve, never auto-resolved from care here.
    let stage: Stage = rows.pet.stage;
    let promoted: Stage | null = null;
    const days = daysBetween(Date.parse(rows.pet.created_at), now);
    let nx = nextStage(stage);
    while (nx && nx.stage !== "teen" && s.exp >= nx.expReq && days >= nx.minDays && s.bond >= nx.bondGate) {
      stage = nx.stage; promoted = nx.stage;
      nx = nextStage(stage);
    }
    if (promoted) await q(`UPDATE pet SET stage=$2 WHERE id=$1`, [rows.pet.id, stage]);

    const rows2 = { ...rows, pet: { ...rows.pet, stage }, state: s };
    const ctx = buildContext(rows2, now, tz);
    const line = plan.event === "pet.sleeping"
      ? "（它在梦里蹭了蹭你的手，小声哼唧了一下～）"
      : selectCopy(pack, plan.event, ctx, `${verb}.${now}`).text;
    const promoteLine = promoted ? selectCopy(pack, "growth.promote", ctx, `promote.${now}`).text : null;

    await q(`INSERT INTO action_log (pet_id, user_id, verb, local_date, line, line_intent, delta) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [rows.pet.id, userId, verb, localDate, line, plan.event, JSON.stringify({ exp: plan.expGain + needBonusExp, bond: bondGain + needBonusBond, need: fulfilled ? fulfilledKind : null })]);

    const needLine = (kind: NeedKind) => selectCopy(pack, NEED_EVENT[kind], ctx, `need.${kind}.${now}`).text;
    const view = buildPetView(rows2, { nowMs: now, tz, theme, voice: null, recap: null, needLine });
    return {
      http: 200,
      body: {
        ok: true, ...view, line, fx: plan.fx, animation: plan.animation, woke: plan.woke, promoted, promoteLine,
        needReward: fulfilled ? { kind: fulfilledKind, exp: needBonusExp, bond: needBonusBond } : null,
      },
    };
  });

  return NextResponse.json(result.body, { status: result.http });
}

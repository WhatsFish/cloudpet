import { NextRequest, NextResponse } from "next/server";
import { withTx } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { scoreQuiz } from "@/lib/game/quiz";
import { creature } from "@/data/bestiary";
import { QUIZ, SCORED_QUESTION_IDS } from "@/data/quiz-questions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Public: the quiz questions (labels only — weights/maps stay server-side).
export async function GET() {
  return NextResponse.json({
    questions: QUIZ.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      options: q.options.map((o) => ({ id: o.id, label: o.label })),
    })),
  });
}

type Body = { answers?: Record<string, string> };

function validAnswers(answers: Record<string, string>): boolean {
  for (const qid of SCORED_QUESTION_IDS) {
    const q = QUIZ.find((x) => x.id === qid)!;
    if (!q.options.some((o) => o.id === answers[qid])) return false;
  }
  return true;
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const answers = body.answers ?? {};
  if (!validAnswers(answers)) {
    return NextResponse.json({ error: "incomplete answers" }, { status: 400 });
  }

  const { vector, archetypeKey, reveal } = scoreQuiz(answers, userId);
  const displayName = creature(archetypeKey).displayName;

  try {
    const petId = await withTx(async (q) => {
      const existing = await q<{ id: number }>(`SELECT id FROM pet WHERE user_id = $1`, [userId]);
      if (existing[0]) throw new Error("already_bonded");

      await q(
        `INSERT INTO quiz_result (user_id, attach, curio, express, archetype_key, answers)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [userId, vector.attach, vector.curio, vector.express, archetypeKey, JSON.stringify(answers)],
      );

      const pet = await q<{ id: number }>(
        `INSERT INTO pet (user_id, archetype_key, species_id, name, stage)
         VALUES ($1,$2,$2,$3,'egg') RETURNING id`,
        [userId, archetypeKey, displayName],
      );
      const id = pet[0].id;

      // pet_state / pet_cooldown use schema defaults = egg start values + 3 care charges.
      await q(`INSERT INTO pet_state (pet_id) VALUES ($1)`, [id]);
      await q(`INSERT INTO pet_cooldown (pet_id) VALUES ($1)`, [id]);
      return id;
    });

    return NextResponse.json({
      ok: true,
      pet_id: petId,
      archetypeKey,
      displayName,
      reveal,
      vector,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    if (msg === "already_bonded" || msg.includes("uq_") || msg.includes("unique") || msg.includes("23505")) {
      return NextResponse.json({ ok: false, error: "already_bonded" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

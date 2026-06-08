// 图鉴 / Codex — internal design-review page (V4). Renders the 4 within-lineage
// evolution LINES: a shared egg→baby→child trunk, then a care-driven fork at teen
// into 3 variants of the SAME creature + the true (balanced) form, plus an adult
// preview (Phase 2). Reads web/src/data/lines.json (the single source of truth the
// art engine also uses). Pixel art is nearest-neighbour upscaled; sprites live at
// web/public/pets, served at /cloudpet/pets/... under the app's basePath.

import linesData from "@/data/lines.json";
import { AXES, archetype, isArchetype } from "@/data/personality";
import { STAGES } from "@/data/stage-table";
import type { Stage } from "@/lib/types";

export const dynamic = "force-static";

const BP = "/cloudpet";
const LINES = linesData.lines as Record<string, Line>;

type Branch = { variant: string; name: string; blurb: string };
type Line = { name: string; accent: string; trueBlurb: string; branches: { feed: Branch; engage: Branch; tend: Branch } };

const STAGE_CN: Record<Stage, string> = { egg: "蛋", baby: "幼年", child: "童年", teen: "少年", adult: "成年" };
const MOODS = ["idle", "happy", "eating", "sad", "sulk", "sleeping", "hide"] as const;
const MOOD_CN: Record<string, string> = { idle: "平常", happy: "开心", eating: "进食", sad: "难过", sulk: "闹脾气", sleeping: "睡觉", hide: "躲起来" };
// V8: the 3 branch slots are just 3 forms now — care does NOT decide which (the player
// picks at the teen fork). So no care-lean labels; each variant is simply 可选.
const LEAN: { key: "feed" | "engage" | "tend"; label: string }[] = [
  { key: "feed", label: "可选" },
  { key: "engage", label: "可选" },
  { key: "tend", label: "可选" },
];

function Sprite({ id, file, size, alt }: { id: string; file: string; size: number; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`${BP}/pets/${id}/${file}.png`} width={size} height={size} alt={alt} style={{ imageRendering: "pixelated", display: "block" }} />;
}

function AxisBar({ value, low, high, name }: { value: number; low: string; high: string; name: string }) {
  const pct = Math.max(0, Math.min(100, ((value + 8) / 16) * 100));
  return (
    <div className="text-[11px]">
      <div className="flex justify-between text-neutral-400 mb-0.5"><span>{low}</span><span className="text-neutral-500">{name}</span><span>{high}</span></div>
      <div className="relative h-1.5 rounded-full bg-neutral-200">
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-neutral-700 ring-2 ring-white" style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}

// one fork outcome: a stage sprite + its care-lean label + variant name + blurb
function Form({ id, stage, lean, name, blurb, accent, isTrue }: { id: string; stage: Stage; lean: string; name: string; blurb?: string; accent: string; isTrue?: boolean }) {
  return (
    <div className="flex flex-col items-center w-[150px] shrink-0">
      <span className={`text-[10px] mb-1 px-1.5 py-0.5 rounded ${isTrue ? "text-white" : "bg-neutral-100 text-neutral-500"}`} style={isTrue ? { background: accent } : undefined}>{lean}</span>
      <div className={`rounded-lg border p-1 ${isTrue ? "border-2" : "bg-neutral-50 border-neutral-200"}`} style={isTrue ? { borderColor: accent, background: "#fff" } : undefined}>
        <Sprite id={id} file={`${stage}_idle`} size={88} alt={name} />
      </div>
      <span className="text-xs font-medium text-neutral-700 mt-1">{name}</span>
      {blurb && <span className="text-[10px] text-neutral-400 text-center leading-tight mt-0.5 px-1">{blurb}</span>}
    </div>
  );
}

export default function Codex() {
  const ids = Object.keys(LINES);
  return (
    <main className="max-w-5xl mx-auto px-5 py-10" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
      <header className="mb-8">
        <h1 className="text-xl font-bold tracking-tight">云宠物 · 图鉴 <span className="text-sm font-normal text-neutral-400">蠢萌 6 只</span></h1>
        <p className="text-neutral-500 text-sm mt-1 leading-relaxed">
          <strong className="text-neutral-700">6 只各有性格的小宠</strong>（奶团 / 克劳德 / 方头崽 / 波波企鹅 / 墩墩熊 / 团团海豹）。每只从蛋到成年都是<strong>同一只</strong>——
          蛋→幼年→童年是主干，到<strong>少年</strong>时<strong className="text-neutral-700">由你亲手选它长成 4 种形态里的哪一种</strong>（本形 + 3 种变体）。
          这是你的<strong>选择</strong>，和你怎么照顾它<strong>无关</strong>（照顾只是满足它当下的需求）。企鹅 / 熊 / 海豹的 3 种变体是<strong>真实的近缘物种</strong>。成年形态先画好留作 Phase 2。
        </p>
      </header>

      {/* overview */}
      <section className="mb-10 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        <div className="text-xs text-neutral-400 mb-3">六条线 · 本形(少年)</div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {ids.map((id) => (
            <a key={id} href={`#${id}`} className="flex flex-col items-center group">
              <div className="rounded-lg bg-white border border-neutral-200 p-1 group-hover:border-neutral-400 transition-colors"><Sprite id={id} file="teen_idle" size={64} alt={LINES[id].name} /></div>
              <span className="text-[11px] text-neutral-600 mt-1">{LINES[id].name}</span>
            </a>
          ))}
        </div>
      </section>

      <div className="space-y-10">
        {ids.map((id) => {
          const line = LINES[id];
          const a = isArchetype(id) ? archetype(id) : null;
          return (
            <article key={id} id={id} className="rounded-xl border border-neutral-200 overflow-hidden scroll-mt-6">
              {/* header */}
              <div className="flex items-center gap-4 px-5 py-4 border-b border-neutral-100 bg-neutral-50">
                <div className="rounded-lg bg-white border p-1 shrink-0" style={{ borderColor: line.accent }}><Sprite id={id} file="teen_idle" size={72} alt={line.name} /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold">{line.name}</h2>
                    <code className="text-[11px] text-neutral-400">{id}</code>
                    <span className="inline-block w-3 h-3 rounded-full border border-neutral-300" style={{ background: line.accent }} />
                  </div>
                  <p className="text-sm text-neutral-500 mt-0.5">{line.trueBlurb}</p>
                </div>
                {a && (
                  <div className="hidden sm:block w-52 shrink-0 space-y-1.5">
                    {AXES.map((ax) => <AxisBar key={ax.key} value={(a.anchor as Record<string, number>)[ax.key]} low={ax.low} high={ax.high} name={ax.nameCN.split(" ")[0]} />)}
                  </div>
                )}
              </div>

              {/* trunk */}
              <div className="px-5 py-4 border-b border-neutral-100">
                <div className="text-xs text-neutral-400 mb-3">成长主干（蛋 → 幼年 → 童年，同一只）</div>
                <div className="flex items-end gap-2">
                  {STAGES.filter((s) => ["egg", "baby", "child"].includes(s.stage)).map((s, i) => (
                    <div key={s.stage} className="flex items-end gap-2">
                      <div className="flex flex-col items-center">
                        <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-1"><Sprite id={id} file={s.stage === "egg" ? "egg" : `${s.stage}_idle`} size={72} alt={STAGE_CN[s.stage]} /></div>
                        <span className="text-[11px] text-neutral-600 mt-1">{STAGE_CN[s.stage]}</span>
                        <span className="text-[10px] text-neutral-400">{s.expReq === 0 ? "起点" : `${s.expReq} EXP · ${s.minDays}天`}</span>
                      </div>
                      {i < 2 && <span className="text-neutral-300 pb-6">→</span>}
                    </div>
                  ))}
                  <span className="text-neutral-300 pb-6 text-lg px-1">⟶</span>
                  <span className="text-[11px] text-amber-600 pb-7">少年起由你选样子 ↓</span>
                </div>
              </div>

              {/* teen fork */}
              <div className="px-5 py-4 border-b border-neutral-100">
                <div className="text-xs text-neutral-400 mb-3">少年形态 · 长大时由你亲手选（4 选 1，与照顾无关）</div>
                <div className="flex flex-wrap gap-2">
                  <Form id={id} stage="teen" lean="本形" name={`${line.name}·本形`} accent={line.accent} isTrue />
                  {LEAN.map(({ key, label }) => <Form key={key} id={`${id}__${line.branches[key].variant}`} stage="teen" lean={label} name={line.branches[key].name} blurb={line.branches[key].blurb} accent={line.accent} />)}
                </div>
              </div>

              {/* adult preview */}
              <div className="px-5 py-4 border-b border-neutral-100">
                <div className="text-xs text-neutral-400 mb-3">成年形态 · Phase 2 预览（画好但暂不开放）</div>
                <div className="flex flex-wrap gap-2 opacity-90">
                  <Form id={id} stage="adult" lean="本形" name={`${line.name}·本形`} accent={line.accent} isTrue />
                  {LEAN.map(({ key, label }) => <Form key={key} id={`${id}__${line.branches[key].variant}`} stage="adult" lean={label} name={line.branches[key].name} accent={line.accent} />)}
                </div>
              </div>

              {/* moods */}
              <div className="px-5 py-4">
                <div className="text-xs text-neutral-400 mb-3">表情 / 反应（本形·少年）</div>
                <div className="flex flex-wrap gap-2">
                  {MOODS.map((m) => (
                    <div key={m} className="flex flex-col items-center">
                      <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-1"><Sprite id={id} file={`teen_${m}`} size={52} alt={MOOD_CN[m]} /></div>
                      <span className="text-[10px] text-neutral-400 mt-1">{MOOD_CN[m]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <footer className="mt-12 pt-6 border-t border-neutral-200 text-xs text-neutral-400">
        程序化美术引擎 v8 · scripts/gen-art.mjs（6 只 × 真形+3变体 = 24 种成年形态 + 活动姿态）。少年形态由玩家在岔口亲手选（本形 + 3 变体，4 选 1），与照顾方式无关；企鹅 / 熊 / 海豹的 3 变体是真实近缘物种。
      </footer>
    </main>
  );
}

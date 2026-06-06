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
const LEAN: { key: "feed" | "engage" | "tend"; label: string }[] = [
  { key: "feed", label: "喂食多" },
  { key: "engage", label: "洗澡·陪玩多" },
  { key: "tend", label: "看医生多" },
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
        <h1 className="text-xl font-bold tracking-tight">云宠物 · 图鉴 <span className="text-sm font-normal text-neutral-400">V4 养成进化</span></h1>
        <p className="text-neutral-500 text-sm mt-1 leading-relaxed">
          4 条<strong className="text-neutral-700">同源进化线</strong>。每只宠物从蛋到成年都是<strong>同一只</strong>——
          <strong className="text-neutral-700">养育决定它长成自己的哪一面</strong>：蛋→幼年→童年是共享主干，
          到<strong>少年</strong>按你最常做的事分叉成 3 种自己的变体 + 均衡的本形；成年形态先画好留作 Phase 2。
          关键节点有<strong className="text-neutral-700">真实的形态变化</strong>(尾巴分叉/焰尾/叶翼/石壳…)，不是单纯变大。
        </p>
      </header>

      {/* overview */}
      <section className="mb-10 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        <div className="text-xs text-neutral-400 mb-3">四条线 · 本形(少年)</div>
        <div className="grid grid-cols-4 gap-3">
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
                  <span className="text-[11px] text-amber-600 pb-7">少年起按养育分叉 ↓</span>
                </div>
              </div>

              {/* teen fork */}
              <div className="px-5 py-4 border-b border-neutral-100">
                <div className="text-xs text-neutral-400 mb-3">少年分叉 · V4 封顶（招牌形态突变在这里发生）</div>
                <div className="flex flex-wrap gap-2">
                  <Form id={id} stage="teen" lean="均衡养" name={`${line.name}·本形`} accent={line.accent} isTrue />
                  {LEAN.map(({ key, label }) => <Form key={key} id={`${id}__${line.branches[key].variant}`} stage="teen" lean={label} name={line.branches[key].name} blurb={line.branches[key].blurb} accent={line.accent} />)}
                </div>
              </div>

              {/* adult preview */}
              <div className="px-5 py-4 border-b border-neutral-100">
                <div className="text-xs text-neutral-400 mb-3">成年形态 · Phase 2 预览（画好但暂不开放）</div>
                <div className="flex flex-wrap gap-2 opacity-90">
                  <Form id={id} stage="adult" lean="均衡养" name={`${line.name}·本形`} accent={line.accent} isTrue />
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
        程序化美术引擎 v3 · scripts/gen-art.mjs（4 线 × 真形+3变体 = 16 种成年剪影）。养育→分叉：喂食→丰裕形，洗澡·陪玩→敏捷形，看医生→守护形，均衡→本形。
      </footer>
    </main>
  );
}

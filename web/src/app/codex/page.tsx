// 图鉴 / Codex — an internal design-review page (NOT the in-app codex). Renders every
// creature's full evolution route (egg→adult) and mood set from the same procedural
// sprites the mini program ships, alongside its personality anchor + care temperament.
// Server component: reads the canonical data modules directly. Pixel art is nearest-
// neighbour upscaled. Public sprites live at web/public/pets (synced by scripts/sync-art.sh)
// and, because the app runs under basePath /cloudpet, are served at /cloudpet/pets/...

import { ARCHETYPES, AXES, archetype } from "@/data/personality";
import { creature } from "@/data/bestiary";
import { STAGES } from "@/data/stage-table";
import { SEED_KEYS, branchesFor } from "@/lib/game/evolve";
import type { Stage } from "@/lib/types";

export const dynamic = "force-static";

const BP = "/cloudpet";

const LEAN_CN: Record<string, string> = { feed: "喂食多", clean: "洗澡多", doctor: "看医生多", play: "陪玩多" };

const STAGE_CN: Record<Stage, string> = {
  egg: "蛋", baby: "幼年", child: "童年", teen: "少年", adult: "成年",
};
const MOODS = ["idle", "happy", "eating", "sad", "sulk", "sleeping", "hide"] as const;
const MOOD_CN: Record<string, string> = {
  idle: "平常", happy: "开心", eating: "进食", sad: "难过", sulk: "闹脾气",
  sleeping: "睡觉", hide: "躲起来",
};

function spriteSrc(id: string, file: string): string {
  return `${BP}/pets/${id}/${file}.png`;
}

function Sprite({ id, file, size, alt }: { id: string; file: string; size: number; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={spriteSrc(id, file)}
      width={size}
      height={size}
      alt={alt}
      style={{ imageRendering: "pixelated", display: "block" }}
    />
  );
}

function Outcome({ id, leanCN, name, highlight }: { id: string; leanCN: string; name: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col items-center shrink-0 w-20">
      <span className={`text-[10px] mb-1 px-1.5 py-0.5 rounded ${highlight ? "bg-amber-100 text-amber-700" : "bg-neutral-100 text-neutral-500"}`}>{leanCN}</span>
      <div className={`rounded-lg border p-1 ${highlight ? "bg-amber-50 border-amber-200" : "bg-neutral-50 border-neutral-200"}`}>
        <Sprite id={id} file="teen_idle" size={56} alt={name} />
      </div>
      <span className="text-[10px] text-neutral-500 mt-1 text-center leading-tight">{name}</span>
    </div>
  );
}

function AxisBar({ value, low, high, name }: { value: number; low: string; high: string; name: string }) {
  const pct = Math.max(0, Math.min(100, ((value + 8) / 16) * 100));
  return (
    <div className="text-[11px]">
      <div className="flex justify-between text-neutral-400 mb-0.5">
        <span>{low}</span>
        <span className="text-neutral-500 font-medium">{name}</span>
        <span>{high}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-neutral-200">
        <div className="absolute top-1/2 -translate-y-1/2 w-1/2 left-1/4 h-px bg-neutral-300" />
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-neutral-700 ring-2 ring-white"
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function careLine(id: string): string {
  const b = creature(id);
  const parts: string[] = [];
  const dm = Object.entries(b.decayMult);
  if (dm.length) {
    parts.push(
      dm.map(([k, v]) => {
        const cn: Record<string, string> = { mood: "心情", satiety: "饱食", cleanliness: "清洁", energy: "精力", health: "健康" };
        return `${cn[k] ?? k}掉得${(v as number) > 1 ? "快" : "慢"}(×${v})`;
      }).join("、"),
    );
  } else {
    parts.push("各项消耗均衡");
  }
  parts.push(`孤独阈值 ${b.lonelyAfterHours}h`);
  const fb = b.feed.moodBonus;
  parts.push(`喂食饱食×${b.feed.satietyMult}${fb ? `、心情${fb > 0 ? "+" : ""}${fb}` : ""}`);
  return parts.join("　·　");
}

export default function Codex() {
  return (
    <main className="max-w-5xl mx-auto px-5 py-10" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
      <header className="mb-8">
        <h1 className="text-xl font-bold tracking-tight">云宠物 · 图鉴</h1>
        <p className="text-neutral-500 text-sm mt-1">
          全 10 只小宠的形象设计与进化路线总览（程序化像素美术，{STAGES.length} 段成长 × 7 表情）。
          <strong className="text-neutral-600">V3 养成分支</strong>：测试给你一只本命宝宝，
          但<strong className="text-neutral-600">怎么养决定它长成谁</strong>（喂食 / 洗澡 / 看医生 / 陪玩 各有去向，均衡→本来的样子）。
          这是给设计审阅用的内部页面。
        </p>
      </header>

      {/* V3 branch trees — the actual evolution routes under Model C */}
      <section className="mb-10 space-y-5">
        <div className="text-sm font-semibold text-neutral-700">养成分支 · 进化路线（童年 → 少年的岔路）</div>
        {SEED_KEYS.map((seed) => {
          const branches = branchesFor(seed);
          return (
            <div key={seed} className="rounded-xl border border-neutral-200 p-4">
              <div className="flex items-center gap-3 overflow-x-auto">
                {/* before the fork: the shared seed baby/child */}
                <div className="flex flex-col items-center shrink-0">
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-1">
                    <Sprite id={seed} file="child_idle" size={64} alt={archetype(seed).nameCN} />
                  </div>
                  <span className="text-[11px] font-medium text-neutral-700 mt-1">「{archetype(seed).nameCN}」宝宝</span>
                  <span className="text-[10px] text-neutral-400">本命种子</span>
                </div>
                <span className="text-neutral-300 text-xl shrink-0">⟶</span>
                {/* outcomes: balanced (true form) + each care lean */}
                <div className="flex items-start gap-2">
                  <Outcome id={seed} leanCN="均衡养" name={`${archetype(seed).nameCN}·真形`} highlight />
                  {branches.map((b) => (
                    <Outcome key={b.lean} id={b.speciesId} leanCN={LEAN_CN[b.lean]} name={archetype(b.speciesId).nameCN} />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
        <p className="text-[11px] text-neutral-400">
          少年（teen）是当前版本的封顶形态，分叉就发生在这里；成年留作 Phase 2。三只种子的分支合起来正好覆盖全部 10 只。
        </p>
      </section>

      {/* overview strip */}
      <section className="mb-10 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        <div className="text-xs text-neutral-400 mb-3">全员一览（成年·平常）</div>
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
          {ARCHETYPES.map((a) => (
            <a key={a.key} href={`#${a.key}`} className="flex flex-col items-center group">
              <div className="rounded-lg bg-white border border-neutral-200 p-1 group-hover:border-neutral-400 transition-colors">
                <Sprite id={a.key} file="adult_idle" size={48} alt={a.nameCN} />
              </div>
              <span className="text-[10px] text-neutral-500 mt-1 text-center leading-tight">{a.nameCN}</span>
            </a>
          ))}
        </div>
      </section>

      <div className="space-y-8">
        {ARCHETYPES.map((a) => {
          const b = creature(a.key);
          return (
            <article key={a.key} id={a.key} className="rounded-xl border border-neutral-200 overflow-hidden scroll-mt-6">
              {/* header band */}
              <div className="flex items-center gap-4 px-5 py-4 border-b border-neutral-100" style={{ background: `${a.key === "stone_egg" ? "#f5f3f0" : "#fafafa"}` }}>
                <div className="rounded-lg bg-white border border-neutral-200 p-1 shrink-0">
                  <Sprite id={a.key} file="adult_idle" size={72} alt={a.nameCN} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold">{a.nameCN}</h2>
                    <code className="text-[11px] text-neutral-400">{a.key}</code>
                    {b.shipped ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">完整美术+文案</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-500">占位美术</span>
                    )}
                    <span className="inline-block w-3 h-3 rounded-full border border-neutral-300" style={{ background: b.accentHex }} title={b.accentHex} />
                  </div>
                  <p className="text-sm text-neutral-600 mt-0.5">{a.vibe}</p>
                  <p className="text-xs text-neutral-400 mt-0.5">核心需求：{a.coreNeed}</p>
                </div>
                <div className="hidden sm:block w-52 shrink-0 space-y-1.5">
                  {AXES.map((ax) => (
                    <AxisBar key={ax.key} value={(a.anchor as Record<string, number>)[ax.key]} low={ax.low} high={ax.high} name={ax.nameCN.split(" ")[0]} />
                  ))}
                </div>
              </div>

              {/* evolution route */}
              <div className="px-5 py-4">
                <div className="text-xs text-neutral-400 mb-3">进化路线</div>
                <div className="flex items-end gap-1 sm:gap-3 overflow-x-auto pb-1">
                  {STAGES.map((s, i) => (
                    <div key={s.stage} className="flex items-end gap-1 sm:gap-3">
                      <div className="flex flex-col items-center shrink-0">
                        <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-1">
                          <Sprite id={a.key} file={s.stage === "egg" ? "egg" : `${s.stage}_idle`} size={80} alt={`${a.nameCN} ${STAGE_CN[s.stage]}`} />
                        </div>
                        <span className="text-[11px] font-medium text-neutral-600 mt-1">{STAGE_CN[s.stage]}</span>
                        <span className="text-[10px] text-neutral-400">
                          {s.expReq === 0 ? "起点" : `${s.expReq} EXP · ${s.minDays}天`}
                        </span>
                      </div>
                      {i < STAGES.length - 1 && <span className="text-neutral-300 pb-6 text-lg">→</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* mood set */}
              <div className="px-5 pb-5">
                <div className="text-xs text-neutral-400 mb-3">表情 / 反应（成年）</div>
                <div className="flex flex-wrap gap-2">
                  {MOODS.map((m) => (
                    <div key={m} className="flex flex-col items-center">
                      <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-1">
                        <Sprite id={a.key} file={`adult_${m}`} size={56} alt={`${a.nameCN} ${MOOD_CN[m]}`} />
                      </div>
                      <span className="text-[10px] text-neutral-400 mt-1">{MOOD_CN[m]}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-neutral-400 mt-3 leading-relaxed">脾性：{careLine(a.key)}</p>
              </div>
            </article>
          );
        })}
      </div>

      <footer className="mt-12 pt-6 border-t border-neutral-200 text-xs text-neutral-400">
        程序化美术引擎 v2 · scripts/gen-art.mjs（{ARCHETYPES.length} 只 × 5 段 × 7 表情）。
        进化条件：EXP + 真实天数 + 羁绊三重门槛。
      </footer>
    </main>
  );
}

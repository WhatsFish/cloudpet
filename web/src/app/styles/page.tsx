// Art-direction REVIEW page — 4 candidate design languages for a cuter / simpler /
// derpy (蠢萌) pet. Not shipped art; pick one and the whole roster gets rebuilt in it.
// Montage sheets are rendered by scripts/gen-styles.mjs → web/public/styles/<scheme>.png.

import type { ReactNode } from "react";

export const dynamic = "force-static";
const BP = "/cloudpet";

type Scheme = { key: string; name: string; tag: string; ref: string; vibe: string; variants: string };
const SCHEMES: Scheme[] = [
  { key: "puff", name: "奶团", tag: "Chiikawa 风 · 大头小身软团子", ref: "ちいかわ / 软糯团子",
    vibe: "一个圆脑袋就是全身，大眼睛 + 腮红 + 小小 w 嘴。最软、最treat、最好画。", variants: "本体 / 加耳朵 / 加独角" },
  { key: "octo", name: "八爪宝", tag: "Claude 吉祥物风 · 圆团 + 小触手", ref: "Claude 八爪鱼吉祥物",
    vibe: "暖珊瑚色圆团，头顶一根小卷须，底下几条短触手。最像 Claude，温暖呆萌。", variants: "短触手 / 卷触手 / 长触手" },
  { key: "blocky", name: "方头崽", tag: "拓麻歌子风 · 厚嘴方块 · 复古点阵", ref: "拓麻歌子 / 复古 LCD",
    vibe: "方头方脑、粗黑描边、错位的呆滞眼睛 + 厚嘴。最简单、最复古、最像电子宠物机。", variants: "本体 / 天线 / 小翅膀" },
  { key: "penguin", name: "企鹅", tag: "Suica 卡小企鹅风 · 圆滚滚蓝灰", ref: "Suica スイカペンギン",
    vibe: "蓝灰圆身 + 白脸白肚，小橙嘴小橙脚，腮红呆呆的。最treat、辨识度最高。", variants: "本体 / 呆毛冠 / 绒球" },
  { key: "bear", name: "熊本熊", tag: "熊本熊 / くまモン风 · 黑团红脸蛋", ref: "熊本熊 くまモン",
    vibe: "炭黑圆团 + 圆耳朵，大白眼睛 + 标志性大红脸蛋。最大胆、最好认、最蠢萌。", variants: "本体 / 大圆耳 / 呆毛" },
];

function Check({ children }: { children: ReactNode }) {
  return <span className="inline-block text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 mr-1.5 mb-1.5">✓ {children}</span>;
}

export default function Styles() {
  return (
    <main className="max-w-3xl mx-auto px-5 py-10" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
      <header className="mb-7">
        <h1 className="text-xl font-bold tracking-tight">云宠物 · 设计语言候选 <span className="text-sm font-normal text-neutral-400">5 套方案给你挑</span></h1>
        <p className="text-neutral-600 text-sm mt-2 leading-relaxed">
          目标：更<strong>简单 · 蠢萌 · 可成长 · 可进化 · 可变形 · 可装饰</strong>。
          这套引擎比现在的更<strong>扁平干净 + 大眼睛</strong>，不再糊。下面 4 套是不同的「设计语言」，
          每套都演示了三件事 —— <strong className="text-neutral-700">成长</strong>、<strong className="text-neutral-700">进化</strong>、<strong className="text-neutral-700">装饰</strong>。
          <strong>挑一套（或说怎么揉），我就用它把全部小宠重做一遍。</strong>当前线上美术先不动。
        </p>
        <div className="mt-3 text-[12px] text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-lg p-3 leading-relaxed">
          每张图三行：<br />
          <strong>第 1 行 成长</strong>：幼 → 童 → 少年，最后一个是笑脸表情；<br />
          <strong>第 2 行 进化</strong>：同一只长成的 3 种变体（最后一个是本体对照）；<br />
          <strong>第 3 行 装饰</strong>：戴帽子 / 蝴蝶结 / 叶子等可换的小装饰。
        </div>
      </header>

      <div className="space-y-10">
        {SCHEMES.map((s, i) => (
          <article key={s.key} className="rounded-xl border border-neutral-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-100 bg-neutral-50">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-xs text-neutral-400">方案 {String.fromCharCode(65 + i)}</span>
                <h2 className="text-lg font-bold">{s.name}</h2>
                <span className="text-xs text-neutral-500">{s.tag}</span>
              </div>
              <p className="text-sm text-neutral-600 mt-1">{s.vibe}</p>
              <p className="text-[12px] text-neutral-400 mt-1">参考：{s.ref}　·　进化变体：{s.variants}</p>
            </div>
            <div className="p-4 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${BP}/styles/${s.key}.png`} alt={s.name} className="w-full rounded-lg border border-neutral-100" style={{ imageRendering: "pixelated" }} />
              <div className="mt-3">
                <Check>简单</Check><Check>蠢萌</Check><Check>可成长</Check><Check>可进化</Check><Check>可变形</Check><Check>可装饰</Check>
              </div>
            </div>
          </article>
        ))}
      </div>

      <footer className="mt-10 pt-6 border-t border-neutral-200 text-sm text-neutral-500 leading-relaxed">
        <p><strong>怎么选</strong>：告诉我喜欢哪套（A 奶团 / B 八爪宝 / C 方头崽 / D 企鹅 / E 熊本熊），或者「A 的脸 + B 的身体」这样揉也行。
        定下方向后，我会用它重画全部进化线（蛋→成年 × 各变体），并接上「可装饰」系统（帽子/围巾等，养出来可换）。</p>
        <p className="mt-2 text-neutral-400">程序化生成 · scripts/gen-styles.mjs · 当前游戏内美术保持不变，等你拍板。</p>
      </footer>
    </main>
  );
}

// 性格测试: 6 scored scenarios (Q1–Q6) + 1 flavor wildcard (Q7, tiebreak only).
// Weights carry a mild, intentional "most people lean a little social/expressive"
// prior (PLAN §6): a perfectly origin-centred quiz over-selects the lone aloof
// creature, so a gentle lean evens the 3-way V1 routing. The distribution is a
// committed guard: scripts/quiz-distribution-test.mjs (mochi 38 / echo 34 / ember 27).

import type { AxisVector } from "@/lib/types";

export type QuizOption = {
  id: string;
  label: string;
  w?: Partial<AxisVector>; // axis weights (scored questions)
  map?: string[]; // favored archetype keys (Q7 wildcard tiebreak)
};
export type QuizQuestion = {
  id: string;
  prompt: string;
  scored: boolean;
  options: QuizOption[];
};

export const QUIZ: QuizQuestion[] = [
  {
    id: "q1", scored: true,
    prompt: "周末一整天没安排，你心里最舒服的状态是——",
    options: [
      { id: "q1a", label: "得有人陪着，一个人待久了会发慌", w: { attach: 3 } },
      { id: "q1b", label: "有人在身边最好，偶尔独处也不错", w: { attach: 2 } },
      { id: "q1c", label: "一个人刚刚好，自在", w: { attach: 0 } },
      { id: "q1d", label: "独处是充电，人多了反而累", w: { attach: -2 } },
    ],
  },
  {
    id: "q2", scored: true,
    prompt: "路过一条从没走过的小巷，你会——",
    options: [
      { id: "q2a", label: "立刻拐进去看看通向哪儿", w: { curio: 3, express: 1 } },
      { id: "q2b", label: "有点心动，瞄一眼再说", w: { curio: 1 } },
      { id: "q2c", label: "还是走熟路安心", w: { curio: -1 } },
      { id: "q2d", label: "没兴趣，熟悉的地方最舒服", w: { curio: -3, express: -1 } },
    ],
  },
  {
    id: "q3", scored: true,
    prompt: "今天碰上一件超开心的事，你的反应是——",
    options: [
      { id: "q3a", label: "又叫又跳，恨不得全世界都知道", w: { attach: 2, express: 3 } },
      { id: "q3b", label: "笑得合不拢嘴，逢人就分享", w: { attach: 1, express: 2 } },
      { id: "q3c", label: "心里美滋滋，表面还算平静", w: { express: -1 } },
      { id: "q3d", label: "默默记在心里，不太外露", w: { attach: -1, express: -2 } },
    ],
  },
  {
    id: "q4", scored: true,
    prompt: "和在乎的人闹了点小别扭，你通常——",
    options: [
      { id: "q4a", label: "马上凑过去撒娇求和好，受不了冷战", w: { attach: 2, curio: 1, express: 2 } },
      { id: "q4b", label: "嘴上不服软，心里等对方先来哄", w: { attach: 1, express: -2 } },
      { id: "q4c", label: "各自冷静一下，过会儿自然就好", w: { attach: -2, express: 1 } },
      { id: "q4d", label: "默默做点什么示好，不爱多说", w: { attach: -1, curio: -1, express: -1 } },
    ],
  },
  {
    id: "q5", scored: true,
    prompt: "理想的一天，你更想——",
    options: [
      { id: "q5a", label: "满城跑去打卡新店新展，越热闹越好", w: { attach: 1, curio: 2, express: 2 } },
      { id: "q5b", label: "宅在家里，安安静静做点喜欢的小事", w: { curio: -2, express: -1 } },
      { id: "q5c", label: "去没去过的地方，慢慢逛慢慢看", w: { curio: 2, express: -1 } },
      { id: "q5d", label: "老地方、老朋友、老节目，最放松", w: { attach: -1, curio: -2 } },
    ],
  },
  {
    id: "q6", scored: true,
    prompt: "交朋友这件事，你更像——",
    options: [
      { id: "q6a", label: "自来熟，很快和一群人打成一片", w: { attach: 2, curio: 2 } },
      { id: "q6b", label: "慢热，但认定了就特别黏", w: { attach: 2, curio: -2 } },
      { id: "q6c", label: "三两知己就够，不爱社交", w: { attach: -2, curio: -1 } },
      { id: "q6d", label: "对新朋友好奇，但习惯保持距离", w: { attach: -2, curio: 1 } },
    ],
  },
  {
    id: "q7", scored: false,
    prompt: "最后——如果送你一盏灯，你希望它是？",
    options: [
      { id: "q7a", label: "暖黄的小灯，照着就安心", map: ["mochi_pudding", "puff_seal", "clay_golem"] },
      { id: "q7b", label: "冷白的探照灯，照向没去过的远方", map: ["echo_fox", "wisp_moth"] },
      { id: "q7c", label: "会蹦会跳的彩色灯，热闹好玩", map: ["ember_imp", "spark_sprite"] },
      { id: "q7d", label: "柔柔的小夜灯，安静地陪着", map: ["stone_egg", "dream_jelly", "sproutling"] },
    ],
  },
];

export const SCORED_QUESTION_IDS = QUIZ.filter((q) => q.scored).map((q) => q.id);

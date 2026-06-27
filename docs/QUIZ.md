# 性格测试 (Onboarding Quiz)

> ⚠️ **过时提示（V8 roster）**：本文档成文于早期 **10 原型 / “3 只 + 7 占位”** 方案，其中具体怪物名（布丁团子 / 影狐 / 夜灯蛾 / `mochi_pudding` / `echo_fox` …）**均已退役**。线上实际是 **6 只全量怪**：奶团 `puff` / 克劳德 `claude` / 方头崽 `blocky` / 波波企鹅 `penguin` / 墩墩熊 `bear` / 团团海豹 `seal`。当前图谱与真相源见 **`docs/BESTIARY.md`** + `web/src/data/{personality.ts,lines.json,bestiary.ts}`。下文的系统/设计思路多数仍适用，只把怪物名当历史示例读。


This is a pure design task with no provider/LLM work (the product explicitly forbids runtime LLM calls, and the quiz scoring is rule-based). I'll produce the spec directly.

# 云宠物 · 本命宠领养测试 (V1)

> 一个 7 题的小测试，不是 MBTI。轻松、好玩、带一点占卜的暖意。答完会有一只**一直在等你**的本命宠破壳而出。

---

## 0. 设计原则（写给工程师）

- 三个轴，与共享模型完全一致：`attach`（黏人+ / 独立−）、`curio`（好奇+ / 安稳−）、`express`（撒娇+ / 理性−）。
- 每个选项给三轴的**带符号整数权重**。题目本身读起来是生活场景，**不暴露**它在测什么。
- 7 题里有 **6 题计分** + **1 题纯彩蛋**（Q7，只在平局时作裁决用，平时不影响向量）。
- 计分后得到向量 `V = (attach, curio, express)`，每轴大致落在 `[-8, +8]`。
- 与 10 个**预置锚点**做加权最近邻匹配。`express` 轴权重略高（它最决定"感觉"）。
- 平局裁决三级，保证 10 个原型都可达、分布不偏。

---

## 1. 七道题（含每个选项的精确轴权重）

格式：`{attach, curio, express}`，缺省为 0。

---

**Q1 · 周末突然下起大雨，你第一反应是——**
- A 缩回被窝继续补觉，雨声正好助眠 → `{attach:0, curio:-2, express:0}`
- B 抓起伞冲出去踩水玩，难得！ → `{attach:0, curio:+2, express:+1}`
- C 立刻拉群约人吃火锅，下雨更要热闹 → `{attach:+2, curio:0, express:+1}`
- D 一个人去咖啡馆靠窗看雨，挺好 → `{attach:-2, curio:0, express:-1}`

**Q2 · 你的手机相册里，最多的是——**
- A 反复拍的同一只猫/同一碗饭/同一个角落 → `{attach:0, curio:-2, express:0}`
- B 各种没见过的店、奇怪的招牌、路边怪东西 → `{attach:0, curio:+2, express:0}`
- C 和朋友的合照、聚会、九宫格 → `{attach:+2, curio:0, express:+1}`
- D 天空、光影、说不清在拍什么的氛围照 → `{attach:-1, curio:0, express:-1}`

**Q3 · 朋友发来"在吗"但没说事，你——**
- A 秒回"在！怎么啦怎么啦😆" → `{attach:+2, curio:0, express:+2}`
- B 直接打过去问，打字太慢了 → `{attach:+1, curio:+1, express:+1}`
- C 回个"嗯"，等他说重点 → `{attach:0, curio:0, express:-2}`
- D 看到了，忙完再说，不急 → `{attach:-2, curio:0, express:-1}`

**Q4 · 点一家从没去过的店，你大概率会点——**
- A 招牌/最多人点的那个，稳 → `{attach:0, curio:-2, express:0}`
- B 菜单上最看不懂、最猎奇的那个 → `{attach:0, curio:+2, express:+1}`
- C 问店员/翻评论"你们家什么最好吃" → `{attach:+1, curio:+1, express:0}`
- D 每次都点同一样，我有我的本命 → `{attach:0, curio:-2, express:-1}`

**Q5 · 开心到不行的时候，你会——**
- A 又叫又跳，恨不得全世界都知道！！ → `{attach:+1, curio:0, express:+3}`
- B 发一长串语音/消息轰炸最好的人 → `{attach:+2, curio:0, express:+2}`
- C 嘴角动一下，心里有数就行 → `{attach:0, curio:0, express:-2}`
- D 自己悄悄记下来，慢慢回味 → `{attach:-1, curio:0, express:-1}`

**Q6 · 你心里"完美的一天"更接近——**
- A 一个人安安静静，不被打扰，做喜欢的事 → `{attach:-2, curio:-1, express:-1}`
- B 说走就走，去个没去过的地方瞎逛 → `{attach:0, curio:+3, express:+1}`
- C 和最在乎的人黏一整天，干嘛都行 → `{attach:+3, curio:-1, express:+1}`
- D 半梦半醒地放空、看云、什么都不想 → `{attach:-1, curio:-1, express:0}`

**Q7 · （彩蛋题，纯靠直觉）夜里你最想点亮哪盏灯？**
> *不计入主向量，仅用于平局裁决。每个选项预先指向一组原型（见 §3 二级裁决表）。*
- A 暖黄小夜灯，照着被窝 → 倾向 `mochi_pudding / puff_seal / clay_golem`
- B 一串彩色霓虹，闪个不停 → 倾向 `spark_sprite / ember_imp`
- C 一盏提灯，想带它去看夜路 → 倾向 `wisp_moth / sproutling`
- D 桌上一支冷白台灯，照着书 → 倾向 `echo_fox / stone_egg`
- E 飘在水里的荧光水母灯 → 倾向 `dream_jelly`

---

### 题面设计说明
- **Q1/Q4/Q6** 主打 `curio`（好奇↔安稳），但混入轻微 `attach`/`express`，避免"这题在测好奇心"一眼看穿。
- **Q3/Q5** 主打 `express`（撒娇↔理性），这是最决定文案语气的轴，所以给了最大幅值（±2、±3）。
- **Q6** 是"压轴定调题"，三轴都给较大权重，用来把中庸答卷推向一个明确角落。
- 每题选项数 3–4，作答轻快；语气口语、带表情，符合"占卜小测"而非问卷。

---

## 2. 计分算法（工程师可直接照做）

### 2.1 累加
```text
V = (0, 0, 0)
for each scored answer in {Q1..Q6}:        # Q7 不计入
    V.attach  += w.attach
    V.curio   += w.curio
    V.express += w.express
```
理论范围（实测各轴落在约 `[-8, +8]`，不必硬裁剪；下方距离度量对幅度不敏感）。

### 2.2 锚点（10 原型在同一 3D 空间的固定坐标）
按 `axisProfile` 编码为目标向量，刻意铺开覆盖四个 attach×curio 象限 + 两个 express 极 + 三个"中位"锚，确保每个区域都可达：

| key | nameCN | attach | curio | express |
|---|---|---:|---:|---:|
| mochi_pudding | 布丁团子 | +6 | −5 | +6 |
| sproutling | 豆芽崽 | +4 | +6 | +1 |
| ember_imp | 暴脾气小火苗 | +6 | +3 | +8 |
| stone_egg | 闷墩儿 | 0 | −6 | −6 |
| echo_fox | 影狐 | −6 | +6 | −5 |
| puff_seal | 奶盖海豹 | +6 | 0 | +4 |
| wisp_moth | 夜灯蛾 | −3 | +6 | +1 |
| clay_golem | 陶土憨憨 | +4 | −5 | −3 |
| spark_sprite | 电跳豆 | 0 | +6 | +7 |
| dream_jelly | 梦泡水母 | −4 | −4 | +1 |

> 近邻对（`ember` vs `spark`、`mochi` vs `puff`、`stone` vs `clay`）刻意在 `express` 上拉开，靠下面的轴权重清晰区分，避免两锚抢同一区域。

### 2.3 加权距离与匹配
```text
WEIGHTS = { attach: 1.0, curio: 1.0, express: 1.3 }   # express 略重，最决定"感觉"

def dist2(V, A):                 # 平方加权欧氏，省去开方
    da = V.attach  - A.attach
    dc = V.curio   - A.curio
    de = V.express - A.express
    return WEIGHTS.attach*da*da + WEIGHTS.curio*dc*dc + WEIGHTS.express*de*de

best = argmin over 10 anchors of dist2(V, anchor)
```
`best` 即匹配到的 `archetypeKey`。**全程不向用户展示分数 / 轴 / 距离。**

---

## 3. 平局裁决（每个原型都可达，分布不偏）

平局之所以"穿帮"，是因为它暴露了机器。三级裁决，全部**确定性**（同一用户永远同一结果）：

### 一级 —— "你最响的那个信号赢"
```text
sort anchors by dist2 ascending
if dist2[1] - dist2[0] > EPS (EPS = 2.0):
    return anchors[0]                       # 明确赢家，直接返回
else:
    # top-2（或多个）在 EPS 内，进入裁决
    loudest_axis = argmax(|V.attach|*1.0, |V.curio|*1.0, |V.express|*1.3)
    among tied anchors, pick the one whose coordinate on loudest_axis
        is closest to V on that single axis (sign-aware)
    if still unique: return it
```
> 直觉："你在某个轴上答得最极端 → 测试'看见了真实的你'"，体验上像被读懂，而非被算出来。

### 二级 —— 彩蛋题裁决（Q7）
仍并列时，用 **Q7（纯彩蛋题）** 的选项→原型映射打破：
```text
Q7_TILT = {
  A: [mochi_pudding, puff_seal, clay_golem],
  B: [spark_sprite, ember_imp],
  C: [wisp_moth, sproutling],
  D: [echo_fox, stone_egg],
  E: [dream_jelly],
}
among the still-tied anchors, prefer the first one that appears in Q7_TILT[user.q7]
```
> 让裁决落在一个"你刚刚亲手选的灯"上，结果反而更有命中感。

### 三级 —— 用户 ID 确定性兜底
```text
if still tied (Q7 不在交集里):
    idx = hash(userId) mod (number of tied anchors)
    return tied[idx]                        # 同一用户永远同一只；重测稳定，绝不"像随机"
```

### 分布不偏的保证
- 锚点已铺满 4 象限 + 两极 + 3 个中位锚 → 任意合理答卷都有归属，不会孤儿化。
- 三个"中位"锚（`puff_seal` attach 极但 curio 中、`spark_sprite` curio 极但 attach 中、`dream_jelly` 安静感性区）专门接住"答得中庸"的人，避免全挤向四角。
- `EPS=2.0` + loudest-axis 裁决让边界用户**按其最强信号**分流，而非总倒向某个坐标接近原点的锚。
- 没有"差"原型：`echo_fox / stone_egg`（独立/理性/低需求）在文案里被卖成"最省心""高冷却偏偏对你好"，不存在读起来像缺点的轴极。

---

## 4. 揭晓时刻（命中感 · 可截图 · 过审安全）

> 框架是**测试 / 领养**，不是抽奖 / 开箱 / 概率。文案里**不出现**几率、稀有度、欧非、抽到等字眼。

### 4.1 蛋壳揭晓节奏（先人格、后立绘）
有意把立绘**延后一拍**，让**名字 + 一句人格台词**先落地，让用户先爱上性格：

```
[黑场，一颗蛋在微光里轻轻晃]
  → 文案逐字浮现：
     "有一只，一直在等你。"
[蛋壳裂开的音效 + 微光炸开]
  → 名字落定（大字）：「布丁团子」
  → 紧接一句它的"心声"（人格台词，archetype-specific）：
     "（探出头，软软地抖）……是你呀。我好像，本来就在等你。"
[再延 0.6s，立绘淡入]
  → 本命宠现身。底部出现卡片。
```

### 4.2 可截图人格卡（每个原型一套模板）
```
┌─────────────────────────────┐
│  根据你的性格，找到了你的本命宠   │
│                             │
│        〔立绘 · baby〕        │
│                             │
│        布丁团子              │
│   「黏人 · 念旧 · 大情绪」      │
│                             │
│  你说下雨只想缩回被窝——        │
│  它也是。它最怕你走开，         │
│  只要你在、只要一切照旧，       │
│  它就是世界上最幸福的团子。     │
│                             │
│  从今天起，你们俩可以一起躲了。  │
│                             │
│        — 云宠物 · 领养证明 —    │
└─────────────────────────────┘
```

### 4.3 让它"命中"的三个机制
1. **引用回答 + 改写成宠物的特质**（"镜像"制造"这不就是我"的电流感）：从用户**实际选过的 1–2 个选项**里抽，按原型改写。每个原型预存一张 `mirror` 模板表：

   | 用户选了 | 改写句（布丁团子示例） |
   |---|---|
   | Q1-A 缩被窝 | "你说下雨只想缩回被窝——它也是，它们俩现在可以一起躲了。" |
   | Q3-A 秒回 | "你'在！怎么啦'秒回的样子，和它扑过来的样子一模一样。" |
   | Q5-A 又叫又跳 | "你开心起来藏不住——它也是，下一秒就在你手心里抖成一团。" |

   选取规则：取**幅值最大的那 1–2 个计分选项**（最能代表用户的答案），查该原型的 `mirror` 表；命中则填入，未命中用原型的通用兜底句。

2. **唯一 + 永久 + 不露 re-roll**：一人一只本命宠，无"再抽一次"按钮（重测入口深埋，见 §5）→ 稀缺 + 承诺 = 本命。

3. **绝不展示百分比 / 匹配度**：结果是**被认出**，不是被计算出。永远用"它一直在等你""它好像认得你"，不用"73% 匹配"。

### 4.4 过审安全话术（WeChat 审核）
- 用词：**领养 / 测试 / 命中 / 缘分 / 心声**；
- 禁用：**抽奖 / 抽卡 / 概率 / 稀有 / 保底 / 欧非 / 转盘**；
- 结果页底部标注"性格测试结果，仅供娱乐"，不承诺任何现实收益，不涉及付费抽取。

---

## 5. 重测策略 & 持久化

### 5.1 重测策略（V1 立场）
- **默认一人一只本命宠，永久绑定。** 完成测试 = 领养成立，主界面**不出现**"重测""换一只"按钮。
- **重测入口存在但深埋**：仅在「设置 → 关于这只宠物 → 重新做性格测试」三级菜单下，且带强确认文案："重新测试会让现在这只回到蛋里等待，你确定吗？"——**用承诺感劝退随意 re-roll**，而非技术封锁。
- 重测**确定性**：同一份答案 + 同一 userId → 永远同一只（§3 兜底用 `hash(userId)`），不会"刷出别的"。所以重测最多换出一只**真实贴合新答案**的宠，绝不像抽奖。
- V1 不做多宠 / 不做交换 / 不做重置进度——保护"本命"的唯一性。

### 5.2 持久化（落库）
测试完成时写入 `pet` 行（对齐核心系统 §0）：

```text
on_quiz_complete(userId, answers[Q1..Q7]):
    V = score(answers)                       # §2.1
    archetypeKey = match(V, answers.q7)      # §2.2–2.3，含裁决
    species_id   = species_of(archetypeKey)  # 原型→创生物种

    # 把测试向量 → 初始人格偏置（钳到锚点邻域，避免极端值破坏语气）
    bias = clamp_to_anchor_neighborhood(V, anchor[archetypeKey], radius=2)
    personality = {
        attach:  bias.attach,
        curio:   bias.curio,
        express: bias.express,
        archetypeKey,                        # 去规范化，驱动 voice-register + decay 查表
        voiceRegisterId: VOICE[archetypeKey],
        decayProfileId:  DECAY[archetypeKey],
    }

    create pet row {
        user_id: userId, species_id, name: default_name(archetypeKey),
        satiety:70, mood:60, cleanliness:80, energy:80, health:90,
        bond:0, exp:0, stage: egg,
        personality,                         # 存为 JSON 列；archetypeKey 同时去规范化成独立列便于索引
        quiz_vector: V,                      # 留档，供"镜像"文案与日后重测对比
        quiz_answers: answers,               # 留档（仅本命相关，便于 §4.3 引用回答）
        created_at: now, last_tick: now,
    }
```

要点：
- **`archetypeKey` 去规范化成独立列**：decay 倍率、voice-register 都靠它单行查表，调一行不动代码（对齐共享模型 production note）。
- **`bias` 钳进锚点邻域（radius=2）**：保留"你这只偏黏一点点"的个体差异，但不会让某个轴极端到把该原型的语气写崩。个体偏置只做**细微**调味，主语气由 `archetypeKey` 决定。
- **`quiz_vector` / `quiz_answers` 留档**：§4.3 的"引用回答"和未来重测对比都要用；属本命宠数据，随宠存储。
- 初始五维 / bond / exp / stage 全部对齐核心系统起始值（egg：satiety 70 / mood 60 / cleanliness 80 / energy 80 / health 90 / bond 0 / exp 0）。

---

### 一句话总结给工程师
`score(answers)` → 6 题累加成 3D 向量 → `argmin` 加权距离配锚点 → 三级确定性裁决 → 写一行 `pet`，把 `archetypeKey` 去规范化、把测试向量钳成初始人格偏置。纯函数、可单测、零外部调用；揭晓时先抛名字+心声、引用用户原话改写成宠物特质，让"本命"是被认出来的，而不是被算出来的。

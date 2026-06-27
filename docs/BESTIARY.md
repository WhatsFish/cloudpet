# 图鉴 / Bestiary — V8 roster (6 creatures)

> **Source of truth = code.** This doc mirrors the live roster. Authoritative data:
> `web/src/data/personality.ts` (anchors / vibe / coreNeed), `web/src/data/lines.json`
> (display name / accent / true-form blurb / the 3 branch forms — also drives the art engine
> `scripts/gen-art.mjs`), `web/src/data/bestiary.ts` (per-creature gameplay config), and each
> creature's voice soul in `web/src/data/copybank/<key>.json`. Stages: `web/src/data/stage-table.ts`.
>
> **The old 10-archetype / "3 shipped + 7 placeholder" plan (抖抖布丁 / 探探芽 / 影狐 …) is RETIRED.**
> V8 ships **6 fully-authored creatures, all `shipped: true`**, one per design language.

## How a creature works

- **Quiz → 本命宠.** The onboarding quiz scores you on 3 axes `(attach 黏人↔独立, curio 好奇↔安稳,
  express 撒娇↔理性)` and matches the nearest anchor (express-weighted, `MATCH_WEIGHTS.express = 1.3`).
  Every quiz result routes to one of these 6 — there are no placeholder/unreachable archetypes.
- **5 life stages** (`stage-table.ts`): `egg → baby → child → teen → adult`. Gated on **EXP ∧ real
  days ∧ bond** so stages can't be grind-rushed in one sitting; high bond (active player) compresses
  the day-gate. Adult ≈ week 2–3 is the terminal stage.
- **child→teen fork (player choice).** At the fork the PLAYER picks the teen/adult form in a modal
  (`POST /api/pet/evolve`) — the line's **true form** or one of **3 named variant forms**. The choice
  is deliberate, **never** decided by how you care (care is need-based and must never gate growth
  direction). The 3 slots are stored as `feed/engage/tend` for back-compat but carry **no**
  care-semantics. `species_id` = the key for the true form, or `<key>__<variant>` for a chosen form.

## Personality axes (anchor = where this creature sits)

`attach`: + 黏人 / − 独立 · `curio`: + 好奇 / − 安稳 · `express`: + 撒娇 / − 理性 (range ≈ −8…+8).

| key | 名字 | accent | anchor (attach/curio/express) | vibe | coreNeed |
|---|---|---|---|---|---|
| `puff` | 奶团 | #FBE0C2 | 7 / −4 / 5 | 软乎乎黏人团子，一切照旧最幸福 | 稳稳的陪伴与抱抱 |
| `claude` | 克劳德 | #D96A4A | 3 / 7 / 1 | 好奇又淡定，爱捣鼓爱陪你做事 | 和你一起鼓捣新鲜事 |
| `blocky` | 方头崽 | #A9C27E | −3 / −6 / −6 | 复古冷面，话少金句最省心 | 不被打扰的安稳节奏 |
| `penguin` | 波波企鹅 | #6F8DA9 | −5 / 5 / −3 | 高冷优雅，慢条斯理看世界 | 被尊重的距离感 |
| `bear` | 墩墩熊 | #2E2E3A | 5 / 3 / 8 | 大大咧咧傻乐，热闹又黏人 | 随时被回应的实时热闹 |
| `seal` | 团团海豹 | #9FB4C2 | 7 / −3 / −4 | 憨厚黏人的小海豹，慢半拍、用身体蹭着表达爱 | 安安静静地贴着你 |

> 奶团 vs 团团海豹 are the deliberate **high-attach split**: both 黏人, but 奶团 is 高 express（爱撒娇的黏），
> 团团海豹 is 低 express（憨憨实在的黏）— "你黏人——是爱撒娇的黏，还是憨憨实在的黏？".

## Gameplay config (`web/src/data/bestiary.ts`)

`decayMult` = per-stat decay speed (1.0 = baseline; >1 faster). `lonelyAfter` = hours alone before
the lonely state. `feed` = how feeding lands (`satietyMult` / `moodBonus`).

| 名字 | decayMult | lonelyAfter | feed (satietyMult / moodBonus) | 体感 |
|---|---|---|---|---|
| 奶团 | mood ×1.15 | 36h | 1.0 / +3 | clingy, sulks without you |
| 克劳德 | energy ×0.95 | 60h | 1.0 / +1 | curious, even-keeled |
| 方头崽 | mood ×0.8 | 80h | 0.95 / 0 | stoic, slow to sour（最耐养） |
| 波波企鹅 | mood ×0.85 | 72h | 0.9 / 0 | cool, aloof, patient |
| 墩墩熊 | mood ×1.2, energy ×1.1 | 40h | 1.0 / +2 | volatile, lively（情绪幅度最大） |
| 团团海豹 | mood ×1.1 | 38h | 1.0 / +2 | clingy, earnest, easygoing |

## The 6 creatures + their fork forms

Each line's **true form** (kept if you don't pick a variant) plus the **3 variant forms** the player
can choose at the child→teen fork. For 波波企鹅 / 墩墩熊 / 团团海豹 the 3 forms are **real related species**.

### 奶团 `puff` — 软乎乎的小团子，黏着你最幸福
- **真形**：奶团
- **分叉三形**：圆奶团 `round`（圆滚滚，顶上一颗小樱桃）· 兔耳团 `bunny`（软软一对兔耳，蹦蹦哒哒）· 独角团 `horn`（顶着一只小独角，乖巧神气）
- 黏人高·撒娇高：见你一拥而上，被冷落很快赌气，是 sulk/躲起来最快触发的一只（但最好哄）。

### 克劳德 `claude` — 好奇又淡定的小家伙，爱捣鼓爱做事
- **真形**：克劳德
- **分叉三形**：饱墩克 `round`（圆滚滚的方墩，懒洋洋）· 卷须克 `curl`（头顶翘起一根灵动卷须）· 团耳克 `ears`（一对圆圆小耳朵）
- 好奇高·情绪平和：陪伴 = 一起鼓捣新鲜事，文案是"搭子/进度/灵感"系（见 `copybank/claude.json`）。

### 方头崽 `blocky` — 复古方头方脑，话不多、冷面金句
- **真形**：方头崽
- **分叉三形**：胖方崽 `round`（方圆方圆，肚子鼓鼓）· 天线崽 `antenna`（顶出一根复古小天线）· 飞翅崽 `wing`（一对方块小翅膀）
- 独立·安稳·理性全低分锚点：所有值掉得慢、最省心，夸它只回一个"嗯"。

### 波波企鹅 `penguin` — 高冷优雅的圆企鹅，慢条斯理
- **真形**：波波企鹅
- **分叉三形（真实近缘种）**：帝企鹅 `emperor`（橙耳橙颈、气场十足）· 跳岩企鹅 `rockhopper`（黄色尖眉冠，蹦蹦跳跳）· 加拉帕戈斯 `galapagos`（白脸纹的赤道小企鹅，娇小机灵）
- 独立·好奇：耐得住你不在，要的是被尊重的距离感。

### 墩墩熊 `bear` — 黑乎乎大红脸蛋，大大咧咧傻乐
- **真形**：墩墩熊
- **分叉三形（真实近缘种）**：棕熊崽 `brown`（圆滚滚、憨厚壮实）· 北极熊崽 `polar`（雪白小耳朵，软乎乎）· 熊猫崽 `panda`（黑白眼圈，圆头圆脑）
- 黏人·撒娇拉满：心情波动最剧烈、最热闹，要的是随时被回应的实时反馈。

### 团团海豹 `seal` — 圆滚滚的灰白斑小海豹，憨厚又黏人
- **真形**：团团海豹
- **分叉三形（真实近缘种）**：雪团 `harp`（竖琴海豹，白绒绒一团、大黑眼睛）· 阔鼻 `elephant`（象海豹，憨憨大鼻子、一脸老实）· 豹斑 `leopard`（豹海豹，身姿流线、慢悠悠透着高冷）
- 黏人高但 express 低：用身体蹭着表达爱，安安静静贴着你就满足。

## Stages (`web/src/data/stage-table.ts`)

| stage | order | 累计 EXP | 最少真实天数 | stat 上限 | bond 地板 |
|---|---|---|---|---|---|
| egg | 0 | 0 | 0 | 80 | 0 |
| baby | 1 | 120 | 1 | 85 | 0 |
| child | 2 | 380 | 5 | 90 | 60 |
| teen | 3 | 620 | 12 | 95 | 180 |
| adult | 4 | 1100 | 21 | 100 | 400 |

Art for **all** stages (egg→adult, true forms + branch variants) is shipped, so promotion runs the full
table. `teen→adult` is automatic; the only player-chosen transition is the **child→teen fork**.

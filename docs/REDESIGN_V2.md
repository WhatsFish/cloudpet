# 云宠物 / 本命小宠 — V2 重设计（极简版 · canonical spec）

> **Status:** canonical, directly implementable. Supersedes the V1 action/economy/growth-presentation layer.
> **Untouched on purpose:** the compute-on-read tick (`tick.ts`), the per-creature copy soul (~114–117 行/只 + 32–33 条日记 part), the `pet_state` core, soft-reversible safety (宠物永不死亡/丢失). We only rebuild the **action / economy / growth-presentation** layer on top of them.
>
> **One-line pitch:** 打开应用 → 一个发光的「今天」卡告诉你唯一要做的事：点几下「照顾」。看它有反应，做完出现一个明确的「✓ 明天见」终点线，今天就结束了。摸摸/逗逗永远免费无限。没有道具、没有货币、没有要操心的额度——刷新规则只有一条：你本地的午夜。

---

## 1. 设计目标

约束自运营反馈，逐条对应到本 spec 的解决方案：

| # | 运营要求 | 本 spec 的落地 |
|---|---|---|
| 1 | 清晰的 **等级 (Lv) + 进化** 体系，逐步可见的进展 | §4：Lv 由 exp 派生（每天都涨），进化按 **Lv ∧ 天数 ∧ 亲密** 三闸；每只精灵一份进化/成熟 spec |
| 2 | 每个动作都有**可见反应** | §5：动作→`(pose)+(FX 浮层)+(animation)+(copy event)` 四元组；无任何静默点击 |
| 3 | 抚摸/逗乐 **完全免费、无限、随时、不喂成长**；只有照顾驱动成长 | §2：摸摸/逗逗 0 消耗 0 冷却 0 额度 0 EXP 0 bond；只有「照顾」给 EXP/bond |
| 4a | 动作太多太繁琐 → 更少更清楚 | §2：**3 个按钮**（照顾 / 摸摸 / 逗逗），从 8 verb 砍下来 |
| 4b | 成本 + 额度刷新要一目了然 | §3：照顾=3 格电池，+1/5h，午夜硬重置满 3；刷新规则**就长在按钮上** |
| 4c | 每天登录 1–2 次即可覆盖全部成长需求（不肝、不 FOMO、不囤资源） | §3 算术证明：1 次 ~30s 登录即让所有照顾 stat 回到安全线，且 EXP 永远略领先于日历闸 |
| 4d | 首次打开就懂「今天做什么」 | §6：单一焦点卡 + 大按钮 + needs 一句话提示 + 一次性 coach mark |

**统领思想：** 唯一的「资源」是你每天一次的注意力。成长由**日历闸控**——多玩抢不了跑、少玩也掉不了队，漏一天只是暂停（软可逆），最多用掉一个 streak 宽限日。最大化「治愈 / 可完成 / 不焦虑」。

---

## 2. 新动作系统

最终动作集：**3 个主页按钮**（从 8 verb 砍到 3）。一个**照顾**（成长驱动，电池额度）+ 两个**免费亲密**（摸摸/逗逗）。

| 动作 | 免费/消耗 | 效果 (stats / bond / exp) | 冷却 | 每日额度 & 刷新 | 驱动成长？ |
|---|---|---|---|---|---|
| **照顾** (auto-router → feed/clean/heal/groom) | 消耗 **1 格电量** | 路由到最低 stat：feed `satiety+25` / clean `cleanliness+40` / heal `health+40` / groom（都高时 top-up）。每格 **bond +6, exp +25** | 无（电量即节流） | **3 格/天**；+1 / 5h 回充，封顶 3；本地 **00:00** 硬重置满 3 | ✅ **是** |
| **摸摸 Pet** | 💛 **免费** | `mood +8` | **无**（可连点） | **∞ 无限** | ❌ 否 (bond 0 / exp 0) |
| **逗逗 Play** | ✨ **免费** | `mood +20`，**无 stat 副作用**（见下方修正） | **2s 动画锁**（仅为播完动画，非平衡闸） | **∞ 无限** | ❌ 否 (bond 0 / exp 0) |

### 关键规则与对运营反馈的逐条兑现

- **照顾 = 唯一成长入口。** 一个按钮，后端 `planAction` 的 auto-router 取 `{satiety, cleanliness, health}` 三者最低的去补，并路由到对应 copy event（`feed.love` / `clean` / `medicine` / `feed.love` 梳毛复用）。每格 **+25 EXP +6 bond**，与路由到哪个 stat 无关——**成长是按格计的，不是按 stat 是否补满计的**（这一点是 §3 证明的核心，务必内化）。
- **摸摸/逗逗 = 纯爱，永不喂成长。** 0 EXP、0 bond、0 额度、0 冷却（逗逗仅 2s 动画锁）。可以在等公交时点 100 次纯图可爱。这满足反馈 #3 的「完全免费 + 与成长解耦」。
- **【修正 · 解 critique】逗逗不再扣 stat。** 现行 `ACTIONS.play` 是 `mood+18, energy-8, cleanliness-5`——意味着白嫖逗逗会**偷偷弄脏/弄累宠物**，再让稀缺的照顾电量去擦屁股，「对用户免费但对宠物不免费」。**V2 把 play 的 effects 改为 `{ mood: +20 }`，删掉 energy/cleanliness 副作用**，让亲密对成长**真正惰性**。
- **【修正 · 解 critique】逗逗在 SULKING 时解禁，且保证真的哄好。** 从 `blockedWhen` 去掉 `SULKING`（保留 `SICK`）。sulk 退出阈值是 `mood<25 持续>2h`；现行 `+18` 从 mood 地板 5 出发只到 23 < 25，点完仍闹脾气——这正是要避免的失败。**修法：play 的 mood 提到 +20（floor 5 → 25 ≥ 阈值），并在一次成功 play 后无条件强制清除 SULKING flag**（不依赖重算的 mood，杜绝边界 off-by-one）。逗逗后宠物**可见地高兴起来**。

### 从「按钮」降级为「自动后台行为」的旧 verb

`喂零食 / 哄睡 / 看医生 / 每日签到` 四个 verb（占了旧 8 个的一半、也是「太繁琐」的主因）**全部移除为按钮**：

- **看医生 → 折叠进照顾。** auto-router 在 health 最低时自动走 heal 效果（`health+40`，copy `medicine`）。删除付费治疗、删除 heart 货币。「治病的方法就是把今天的照顾做了」，完全切题。
- **哄睡 → 环境化。** 精灵能量低时自己打盹（现有 `ENERGY_REGEN.passiveNap` 已有被动回能）；夜间显示睡姿。`sleep.tuck/wake` copy 作为日记/心声氛围行触发，不再是按钮结果。
- **签到 → 折叠进「首开 check-in + 当日完成」。** 首开当日幂等 check-in（§3）+ 照顾够了的「完成」奖励，一个概念两段，而非独立第三个按钮。
- **零食 → 删。** satiety 由照顾覆盖，mood 由免费摸摸/逗逗覆盖。

---

## 3. 额度与刷新

### 替代 4 件道具货币的，是一块「照顾电池」

**彻底删除** `kibble / snack / soap / heart` 四件道具 + heart 货币 + `START_KIT / REUNION_PACK / GIFT_POOL` + 付费治疗。它们制造了运营点名的「额度怎么补充和刷新」困惑——因为旧体系叠了**四套刷新机制**（每动作冷却 + 消耗品计数 + 每日上限 + 签到 RNG 补给）。V2 把它们坍缩成**一条人人都懂的规则**：

> **照顾 = 3 格电量。每 5 小时自动 +1（封顶 3）。每天你本地的 00:00 硬重置满 3。**

- **刷新 UI 就长在按钮上（graft from B · 单一表面原则）：** 照顾按钮显示电量 pips（`● ● ●` / `● ● ○`）。**电量为 0 时按钮文案直接变成实时回充倒计时 `下次 +1：4:12`**——没有第二个地方要看。摸摸/逗逗常驻 `免费` 标签 + 下方 `随时可玩`，杜绝「会不会扣我东西」的犹豫。
- **唯一的时钟是午夜。** `pet_cooldown.daily_reset_on` 已经是用户本地日期（V1 就已构建好的午夜引擎），直接复用：翻天即把电量硬重置为 3、清当日计数。

### 「照顾够了」的判定（终点线，graft from A）

`careCoveredToday` 在 `home.ts` / `buildPetView` 计算：

```
careCoveredToday = satiety >= 30 AND cleanliness >= 30 AND health >= 30
```

- **【修正 · 解 critique 的 off-by-one】边界是 `>= 30`，不是 `> 30`。** 阈值定义是 `<30 == 不好`，所以「安全线」恰好是 30。用 `>= 30`，否则一只刚被治到正好 30 的宠物会显示「还没做完」，逼用户去点一格它可能没有的电量。
- **成长不要求 stat 补满**——EXP/bond 按格累计，与 stat 高低无关；终点线只要求 stat **离开低位**（≥30），auto-router 能可靠做到。

### 算术证明：1–2 次/天登录覆盖全部成长需求

> **【修正 · 解 critique 最重要的一条】** 旧文档抄了 Candidate-A 的「喂2×+45、洗1×+60 恰好抵消衰减、宠物永不饿/脏」证明——那是**为另一个模型用虚构数值算的**，对实际发货的电池模型（feed+25/clean+40、3 格共享）**是假的**：child 每天衰减 96+72=168 点，3 格最多补 120。**所以「宠物永不饿/脏」这句话删除，不再声称。** 正确的保证如下：

**衰减（child, M_STAGE=1.0, 24h, 不计 bond 缓和的最坏情况）：**
- satiety: 4.0/h × 24 = **−96**
- cleanliness: 3.0/h × 24 = **−72**

**3 格电池 auto-router（贪心补最低）能可靠做到的事——经实算验证：**

| 进入时状态 (sat/clean/health) | 3 格路由 | 结果 | covered (全 ≥30)？ |
|---|---|---|---|
| 典型隔日回来 5 / 8 / 50 | feed, clean, feed | 55 / 48 / 50 | ✅ |
| 深度疏忽（all 近地板 + 病） 5 / 5 / 15 | feed, clean, heal | **30 / 45 / 55** | ✅ |

因为 `LIVE_FLOOR=5`、`HEALTH_FLOOR=15`：satiety 最低 5，一格 feed → 30（正好到线）；clean 5 → 45；health 15 → 55。**三格分别补三项，必定把全部三项托到 ≥30。** 所以：

> **结论（正确版）：成长是「按格」覆盖、不是「补满 stat」覆盖。一次 ~30s 登录、点满 3 格照顾，就能把任何正常衰减（乃至深度疏忽）的宠物的 satiety/clean/health 全部托到安全线 ≥30 → `careCoveredToday=true` → 终点线达成。** 没有第二种资源、没有囤货、没有时间表压力。

**EXP 覆盖：** 每天照顾 EXP 上限 = `3×25 + 30(完成奖) = 105 EXP/天`，一次登录可达，之上没有更多——不能囤跑、不能掉队。现实 1–2×/天玩家 ~80 EXP/天，轻量 1×/天 ~55。child→teen 需 900 EXP，@80 是 11.2 天，但 teen 的天数闸是 12——**日历（不是肝度）才是瓶颈**。

**两次登录变体（证明更轻松、但从不必需）：** 早上点 2 格、晚上点 1 格，satiety 全天更平滑，照样 covered、照样 105 EXP 上限。唯一的时钟是「午夜前」，漏一天只暂停成长，最多耗一个宽限日。

**【保留 critique 诚实记录】深度疏忽 + 当日 EXP：** 上表证明 3 格**stat 覆盖**对深度疏忽也成立（30/45/55）。`care_charges` 在 compute-on-read 里随时间回充，回来时若刚好不足 3 格，则可能需等 5h 补第 3 格才能把第三项托过线——这是唯一的边界,但极罕见（要求回来时正好 <3 电量且三项同时贴地板）。文档不再隐瞒，但它不影响典型用例的「一次登录完成」承诺。

---

## 4. 等级与进化

### 两个可见进度数字（严格分离）

| 概念 | 是什么 | 来源 | 显示位置 |
|---|---|---|---|
| **Lv (等级)** | 一个**几乎每天都涨**的整数——慢进化之间的颗粒度多巴胺 | 由 `exp` **读时派生，不建列** | 头部芯片，名字旁 |
| **进化 (stage)** | 蛋→幼年→童年→少年→成年，大的视觉变形 | **Lv(≈exp) ∧ 天数 ∧ 亲密** 三闸全过 | **唯一**那条进化进度条 |

### Lv 曲线（读时派生，`buildPetView`/`pet.ts`）

```
expToReach(N) = 60·(N−1) + 10·(N−1)²        // 每升一级比上一级多花 50 + 20·(N−1)，温和二次
Lv(exp)       = 1 + floor( (−60 + sqrt(3600 + 40·exp)) / 20 )
```

Lv 1 = 0 exp（孵化）。

| 到达 Lv | 累计 EXP | 天数 @105(满) | 天数 @80(现实) |
|---|---|---|---|
| Lv 2 | 70 | 0.7 | 0.9 |
| Lv 4 | 270 | 2.6 | 3.4 |
| Lv 5 | 400 | 3.8 | 5.0 |
| Lv 7 | 720 | 6.9 | 9.0 |
| Lv 11 | 1,600 | 15.2 | 20.0 |

Lv **每天都在涨**，即便过了 V1 的美术天花板（童年）——补上旧版「日复一日什么都没动」的缺口。第 2 周的童年封顶玩家照样看到 Lv 6 → Lv 7。

### EXP 只从照顾来

| 来源 | EXP | bond | 备注 |
|---|---|---|---|
| **照顾**（每格，auto-router） | **+25** | **+6** | 3 格/天 |
| **当日「照顾够了」完成奖** | **+30** | **+10** | `careCoveredToday` 翻 true 时发放（替代独立签到）；**需独立幂等键**，见 §8 |
| **首开 check-in**（GET /pet，幂等） | 0 | **+8** | bump streak；`ON CONFLICT (uq_checkin_per_day) DO NOTHING` |
| 摸摸 / 逗逗 | **0** | **0** | 爱，不是成长——刻意设计 |
| 7 天连续 | +50 | — | 保留 `STREAK_EXP.day7`，周末容忍 |
| 30 天连续 | +150 | — | 保留 |

### 进化曲线 — 日历是瓶颈（反焦虑保证）

**【修正 · 解 critique 的 expReq 三表冲突】** 同一份重设计里曾出现三套 expReq（LEVEL facet 380/900/1700、HOME-UI 与 judge fix 430/1150/2200、线上 stage-table 400/1000/2200）。**本 canonical spec 一锤定音采用 `120 / 380 / 900 / 1700`**，理由：(a) 这组让 Lv 芯片**恰好落在**升阶那天（120→Lv2、380→Lv4、900→Lv7、1700→Lv11，全部已验证）；(b) 让现实 80 EXP/天下**天数闸先于 EXP 闸触发**（430/1150/2200 那组被验证会让 teen/adult 处 EXP 先闸，故否决）。

| 阶段 | 中文 | Lv 闸 | **expReq** | minDays | bond 闸 | ≈ 到达天数 (1–2×/天) | 绑定闸 |
|---|---|---|---|---|---|---|---|
| egg | 蛋 | — | 0 | 0 | 0 | onboarding 内自动孵化（不变） | — |
| baby | 幼年 | Lv 2 | **120** | 1 | 0 | **第 1–2 天**（一个好日子） | exp（故意快） |
| child | 童年 | Lv 4 | **380** | 5 | 60 | **第 5–6 天** | **日历** |
| teen | 少年 | Lv 7 | **900** | 12 | 180 | **第 12–14 天**（Phase 2 美术） | **日历** |
| adult | 成年 | Lv 11 | **1,700** | 21 | 400 | **第 21–24 天**（Phase 2 美术） | **日历（@80 是 21.2d 几乎打平，任一上心日即翻成日历闸）** |

vs 线上 `stage-table.ts`：`baby 120` 不变；child `400→380`、teen `1000→900`、adult `2200→1700`；`minDays` 与 `bondGate` 不变。**V1 仍把晋级封顶在童年**（`MAX_STAGE_V1`）；Lv 继续往上爬。

**校验（全部对最终动作值实算，非假设）：**
- **天数闸先绑定：** @80 EXP/天 → child 4.8d（闸 5 ✓）、teen 11.2d（闸 12 ✓）、adult 21.2d（闸 21，打平，任一 105 日即翻日历 ✓）。轻量 @55/天 child-exp 6.9d，仍在童年封顶窗口内。
- **bond 闸先于其天数闸达成**（净 ~22/天，扣 −0.05/h≈−1.2/天衰减后）：child 60→2.7d（闸 5 ✓）、teen 180→8.2d（闸 12 ✓）、adult 400→18.2d（闸 21 ✓）。bond 永不绑定。注：bond 有 `bondFloorForStage` 地板，到阶后只增不减——失联回归玩家的 bond 闸永久清除，对治愈定位是 intended。
- **Lv–stage 一致：** exp 阈值精确落在 Lv 2/4/7/11，「升到 Lv4 那天进化成童年」读起来干净。

**反焦虑保证文案（graft from A，写进 spec）：** *「成长按天解锁——多玩也不会更快，少玩也不会落下。漏掉一天只是暂停，最多用掉一个补签宽限日。」* 因为日历绑定，你结构上既无法少玩掉队、也无法多玩抢跑。

### 每阶段解锁（只 cosmetic / 行为 / copy，绝不加按钮）

| 阶段 | 解锁 |
|---|---|
| **蛋** | 仅 onboarding：测验 → 孵化动画。照顾按钮休眠。 |
| **幼年** | 照顾+摸摸+逗逗全部激活；每日心声（日记）开始；首次进化庆祝；幼年 sprite 集 + 3 个 transient pose（`eating` 已在盘上、新增 `bathing/wiggle`，均 fallback 到 `happy`）。 |
| **童年**（V1 封顶） | 逗逗获得全屏 confetti 反应；日记解锁**回忆性从句**（per-creature 成熟 note）；图鉴标「已养成 童年」；stat cap 85→90（tick 已读 `capForStage`）。 |
| **少年**（Phase 2） | 少年 silhouette；per-creature 成熟漂移（墨影狐日记回忆从句比例上升；炸毛团逗逗反应开始「收敛」）；一个 cosmetic 房间贴纸。 |
| **成年**（Phase 2） | 终形 sprite + 招牌点缀（布丁团子小皇冠 / 墨影狐双光球尾 / 炸毛团焰翼）；「本命达成」徽章；最慢衰减档（M_STAGE 0.9）。 |

**没有任何阶段解锁新的照顾输入**——每个阶段的每日仪式（照顾 + 完成）完全一致，只有宠物和它的声音在成熟。

### 每只精灵的进化/成熟 SPEC（喂给美术 + copy 作者）

- **布丁团子 (mochi_pudding)** — 蛋:斑点果冻蛋 → 幼年:单颗抖抖布丁,一根呆毛 → 童年:长出短手脚会扒边 → 少年:半透明体内浮现小星点 → 成年:顶部凝出小皇冠尖、晃动更稳。*成熟:* 越大越「端着」,但被摸时还是瞬间塌成一摊——反差萌随年龄加强。
- **墨影狐 (echo_fox)** — 蛋:墨纹漩涡蛋 → 幼年:大耳小狐+小光球尾 → 童年:尾光球变三瓣、耳尖描金 → 少年:身侧浮现墨色流纹、瞳色变深 → 成年:九条墨须如笔锋、尾化双光球。*成熟:* 幼时怕生爱躲,成年后话变少但更「懂你」,diary 回忆性从句比例随 stage 上升。
- **炸毛团 (ember_imp)** — 蛋:焦痕裂纹蛋 → 幼年:一团炸毛+火苗刘海 → 童年:火苗分叉、爪尖带火星 → 少年:背生小焰翼雏形 → 成年:焰翼成形、炸毛收成尖刺鬃。*成熟:* 幼时一逗就炸,成年后「火气内敛」——逗逗反应从全屏 confetti 收敛成一个酷酷的弹指火星,但被忽略久了反弹更凶（仍软可逆）。

### 屏上呈现

- **一条进化进度条，不是五条 stat bar。** `PetView` 加 `level: number` 与单个 `evolveProgress`（0–100，= exp 在当前→下一 `expReq` 区间的占比）。五条 raw stat bar 移到「成长」详情入口。
- 点进度条 → 明文 gate：*「距少年：Lv7（还差 1 级）· 再养 1 天 · 亲密 180/180 ✓」*。
- **童年封顶处理：** `expForNextStage` 在 `MAX_STAGE_V1` 返回 null 时，进度条显示 100% / 「已是当前最大阶段」，**而 Lv 继续上涨**，不出现卡死/超 100% 的条。

---

## 5. 反应系统

**设计铁律：任何点击都不静默。** 每个最终动作、每个关键状态都发出 `(sprite pose/mood) + (FX 浮层) + (one-shot animation) + (copy event)` 四元组。照顾按钮 auto-route 到 `feed/clean/heal/groom`；玩/抱抱是免费亲密。**每个反应都映射到盘上已存在或可优雅降级的资产。**

### 5.1 动作/状态 → 反应表

Legend — **Pose** = `SpriteMood`（✅ 已存在 / 🆕 需新作，均 fallback）。**FX** = §5.2 闭集浮层。**Anim** = `ANIM` one-shot 字符串（新键一律 `?? "react_happy"` 兜底）。**Copy** = copy bank 现有 event key。

| 触发 | 路由 verb | Pose | FX 浮层 | Animation | Copy event | 浮层数字 |
|---|---|---|---|---|---|---|
| **照顾** → satiety 最低 | `feed` | `happy`✅(→`eating`，盘上已有) | `food`🍙 + `hearts`×2 | `eat_happy`✅ | `feed.love`（≥80 则 `feed.overfed`；SICK 则 `feed.sick_refuse`） | `+25 EXP / +6💛` |
| **照顾** → cleanliness 最低 | `clean` | `happy`✅(→`bathing`🆕) | `bubbles`🫧 + `sparkle`✨ | `react_happy`✅(→`bathe`🆕) | `clean` | `+25 EXP / +6💛` |
| **照顾** → health 最低 (SICK) | `heal` | `sad`✅→`happy`✅ | `sparkle`✨ | `react_happy`✅(→`recover`🆕) | `medicine` | `+25 EXP / +6💛` |
| **照顾** → 都高 (top-up groom) | `groom` | `happy`✅ | `sparkle`✨ + `hearts`×1 | `react_happy`✅ | `feed.love`（梳毛变体） | `+25 EXP / +6💛` |
| **照顾** 0 电量 | (拒绝) | `idle`✅ | `sweat`💧(1拍) | `idle_low`✅ | `beg.want` | 按钮变 **`下次 +1：mm:ss`** |
| **逗逗 Play**（免费） | `play` | `happy`✅(→`wiggle`🆕) | `notes`🎵 + `sparkle`✨ | `react_happy`✅(→`wiggle`🆕) | `play` | **无**（爱，非成长） |
| **抱抱 Pet**（免费无限） | `pet` | `happy`✅ | `hearts`💛 ×1–2/点 | `react_happy`✅ | `pet` | **无** |
| **每日首开**（自动 check-in） | `checkin` | `happy`✅ | `sparkle`✨ + `hearts`💛 | `react_happy`✅ | `checkin`→气泡走 `greet.open` | once/day |
| **照顾够了 DONE 态** | — | `happy`✅(idle-happy loop) | `sparkle`✨ ambient | `idle`✅ | 气泡 `mood.elated`；卡片→「今天照顾好啦 ✓ 明天见～」+ 倒计时 | — |
| **升级 Lv up** | — | `happy`✅ | `sparkle`✨ burst | `react_happy`✅ | `streak.milestone` / `+Lv` toast | `Lv N` toast |
| **进化 promote** | — | `happy`✅ | **`evolve`**⭐(全身白闪+环) | `evolve`🆕(→`react_happy`✅) | `growth.promote`（孵化走 egg 变体） | banner |
| (状态) 饿 satiety<30 | — | `sad`✅ | `sweat`💧(loop) | `idle_low`✅ | `state.hungry` | — |
| (状态) 脏 clean<30 | — | `sad`✅ | `sweat`💧(loop) | `idle_low`✅ | `state.dirty` | — |
| (状态) 困 energy<25 | — | `sleeping`✅ | `zzz`💤(loop) | `sleep`✅ | `state.sleepy`/`sleep.tuck` | — |
| (状态) 睡着（夜/午睡） | — | `sleeping`✅ | `zzz`💤(loop) | `sleep`✅ | `sleep.tuck`/`sleep.wake` | — |
| (状态) 病 health<30 | — | `sad`✅ | `sweat`💧+病色 | `sick`✅ | `state.sick` | — |
| (状态) 闹脾气 mood<25 >2h | — | `sulk`✅ | `anger`💢 | `sulk`✅ | `state.sulky` | — |
| (状态) 躲起来 mood<12 +36h | — | `hide`✅ | (peek) | `hide`✅ | `state.hiding` | — |
| (状态) 孤单 48h gap | — | `idle`✅ | `sweat`💧(slow) | `lonely`✅ | `state.lonely` | — |
| **重逢** | — | `happy`✅ | `hearts`💛 burst | `react_happy`✅ | `greet.return_long` | — |
| **空闲 idle**（随机 ~1/45s） | — | `idle`✅ | rand{hearts,notes,sparkle} | `idle`✅ | `idle.mutter`（气泡） | — |
| **取名** | — | `happy`✅ | `hearts`💛 | `react_happy`✅ | `name.given` | — |

**优雅降级铁律（解 critique #8）：** 每个 🆕 pose fall back 到其 base mood（`bathing/wiggle→happy`、`recover/eating→happy`）；每个 🆕 anim 键 fall back 到 `react_happy`（沿用现有 `ANIM[verb] ?? "react_happy"`）。**新美术到货前，FX 浮层独立扛起反应** —— 所以 FX 是 load-bearing 层，不是 pose。

### 5.2 FX 浮层词汇 — 闭集（9 个，全 10 只共享一张 ~10KB atlas）

| # | key | 字形 | 触发 | 动作 |
|---|---|---|---|---|
| 1 | `hearts` | 💛 | pet, feed, reunion, name, idle | 上浮淡出 1–2 个 |
| 2 | `sparkle` | ✨ | clean, heal, groom, checkin, levelup, done, idle | 放射 twinkle |
| 3 | `food` | 🍙 | feed | prop 朝嘴 tween, pop |
| 4 | `bubbles` | 🫧 | clean | 扫过身体, 上浮破 |
| 5 | `zzz` | 💤 | sleepy, asleep | 上飘, looped |
| 6 | `notes` | 🎵 | play | hop bounce-trail |
| 7 | `sweat` | 💧 | hungry, dirty, sick, lonely, blocked | 单滴, 慢 loop |
| 8 | `anger` | 💢 | sulking | 头侧脉冲 |
| 9 | `evolve` | ⭐ | 进化/孵化 only | 全身白闪 + 环 |

**复用策略：9 个浮层全 10 只共享（atlas 级、palette 锁）。** 唯一的 per-creature 差异是底下的 body tint + §7 的 motion tween——**FX 字形本身从不 per-creature**。

### 5.3 美术引擎必须产出的 sprite-pose 清单

- **Tier A — 已存在 6 个 mood（`SpriteMood = idle|happy|sad|sleeping|sulk|hide`），零新作。** `happy/sad/sleeping/sulk/hide` 是 `idle` 的 palette/face 调制，盘上已有。
- **Tier B — 新增 transient 动作 pose，仅 2 个真新作。** **【修正 · 解 critique 盘点错误】** REACTIONS facet 把 `eating/bathing/wiggle` 列为「3 个新作」，但 **`eating` 已在盘上**（29 文件/dir 的第 7 个 mood 就是 eating，只是 `dominant()` 当前从不返回它、故闲置）。真正的新作只有 **`bathing` + `wiggle`（2 个）**，且都 fallback `happy`。`recover` 与 `evolve` 是 **animation 不是 pose**（在 `happy` + `sparkle`/`evolve` 浮层上播），需 0 新 sprite。

> **行动项：** 在 `state.ts` 的 mood 解析里让 `feed`/`eating` 路由能返回 `eating`（启用盘上闲置的 eating sprite）；`SpriteMood` union 是否加 `eating` 由实现决定（加则 7 mood 对齐盘上文件，不加则 `eating→happy` 降级，均可发货）。

---

## 6. 主页 UI 重做

**目标：开屏 3 秒内回答「我今天该干嘛？」** 答案永远只有一句话，在一个发光卡片里。五条 stat bar **从主页消失**，藏进「成长」详情，需求只以 0–2 句温柔提示浮现。

### 默认态（今天还没照顾）

```
┌──────────────────────────────────────────┐
│  布丁团子   幼年 · Lv 4    认识第 6 天      │  ← name·stage·Lv·daysKnown（无连续天数噪音）
│        ╭───────────────────────╮           │
│        │  今天也想第一个见到你~ │           │  ← 心声气泡 (greet.open / voice.line)
│        ╰───────────┬───────────╯           │
│              ░░░░░░░░░░                     │
│             ░ (live sprite) ░               │  ← 每次点击都有反应；困/病自动换 pose
│              ░░░░░░░░░░                     │
│  进化进度 ▶ 童年      [██████████░░░] 78%   │  ← 唯一常驻进度条（点开=成长详情）
├──────────────────────────────────────────┤
│ ┃ 今天                          ⏳ 还剩 7h ┃│  ◀── 焦点卡（全屏最亮）
│ ┃   它有点饿了，喂一口吧 🍙                 ┃│  ← needs 提示（1 句，gentle）
│ ┃        ╭────────────────────╮            ┃│
│ ┃        │   🍙  照顾一下  ◀   │  ← 点这里  ┃│  ← 一个大按钮 = 当日照顾（自动选最该做的）
│ ┃        ╰────────────────────╯            ┃│
│ ┃            ● ● ●   (3 次)                 ┃│  ← 电量 pips
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛│
├──────────────────────────────────────────┤
│   ╭──────────╮              ╭──────────╮    │
│   │ 💛 摸摸   │              │ ✨ 逗逗   │    │  ← 永远免费、无限、无冷却
│   │   免费   │              │   免费   │    │  ← 「免费」常驻标签
│   ╰──────────╯              ╰──────────╯    │
│                  随时可玩                    │
└──────────────────────────────────────────┘
```

### 完成态（`careCoveredToday === true`，A 的终点线 graft，最重要）

焦点卡整张翻成庆祝完成态，「我弄好了吗」永不含糊：

```
│ ┃ 今天                                      ┃│
│ ┃            🎉   ✓                         ┃│
│ ┃        今天照顾好啦 ✓ 明天见～            ┃│  ← 固定庆祝文案
│ ┃        清单 0:00 自动刷新 · 还剩 7h12m    ┃│  ← 单一刷新规则 + 倒计时
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛│
│      💛 摸摸(免费)        ✨ 逗逗(免费)       │  ← 依然亮着，永远能玩
```

### 电量耗尽态（B 的「按钮自己教自己刷新」graft）

`care_charges === 0` 但当日尚未 covered 时，大按钮**不灰成死状态**，把标签换成实时回充倒计时——刷新 UI 就长在按钮上：

```
│ ┃        │   下次 +1：4:12     │            ┃│  ← 按钮即刷新提示（单一表面）
│ ┃            ○ ○ ○   (回充中)               ┃│  ← 空 pips
│ ┃        照顾一下下，它今天就满足啦          ┃│  ← 副提示
```

### 焦点卡三态机

| 态 | 触发 | 大按钮文案 | pips | 副提示 |
|---|---|---|---|---|
| **待办** | `!covered && charges>0` | `照顾一下`（图标随 verb：🍙喂/🛁洗/💊医/🪮梳） | `● ●…` | needs 提示句 |
| **完成** | `careCoveredToday` | 整卡翻 → `今天照顾好啦 ✓ 明天见～` | 隐藏 | `清单 0:00 自动刷新 · 还剩 Xh` |
| **回充** | `!covered && charges===0` | `下次 +1：mm:ss` | `○ ○ ○` | `照顾一下下，它今天就满足啦` |

### 精确文案串

**首次会话一次性 coach mark（A graft 暖版）：**
> `每天来喂一喂、洗个澡，就够它长大啦 🌱 摸摸和逗逗随时都行～`

一句话教会整个经济：照顾够一天 / 摸摸逗逗免费 / 午夜刷新 / 进度条慢慢涨——直接杀死 onboarding FOMO。

**needs 提示句（待办态副提示，按最低 stat 取一句，gentle、≤1 句）：**

| 触发 | 串 |
|---|---|
| satiety 最低且 <30 | `它有点饿了，喂一口吧 🍙` |
| cleanliness 最低且 <30 | `身上有点脏脏的，洗个澡吧 🛁` |
| health 偏低 | `它今天有点蔫，照顾一下就好啦 💊` |
| 都不明显低（但当日未照顾） | `来照顾它一下，今天就长大一点点 🌱` |

**其余串：**

| 位置 | 串 |
|---|---|
| 待办引导（首开按钮旁脉冲） | `← 点这里` |
| 电量耗尽按钮 | `下次 +1：{mm:ss}` |
| 完成态主文案 | `今天照顾好啦 ✓ 明天见～` |
| 完成态刷新行 | `清单 0:00 自动刷新 · 还剩 {Xh Ym}` |
| 免费按钮常驻标签 | `免费` |
| 两按钮下方一行 | `随时可玩` |
| 进度条点击 → gate | `距离 童年：还需 Lv5（还差 1 级）· 再养 1 天 · 亲密 60/60 ✓` |
| 加载中 | `正在唤醒你的小宠…` |
| 拉取失败 | `和它的连接断了一下` + 按钮 `再试一次` |
| 喂已饱（复用 `feed.overfed`） | `今天的饭喂过啦，明天再来` |
| 当日已 covered 又点照顾 | `今天照顾好啦 ✓ 明天见～` |
| 生病时点逗逗（SICK 仍禁） | `它不太舒服，先照顾一下吧` |

### 浮层数字规则（教「照顾=成长、摸摸=爱」by feedback alone）

- 照顾点击成功：浮 `+25 EXP` 与 `+6💛`（小标签，**有数字**）。
- 摸摸/逗逗点击：**仅浮 💛/🎵，无数字**——用户「感觉」到爱≠成长，无需教程。

### 为何「今天做什么」一目了然

- **一个焦点：** 全屏最亮是「今天」卡，眼睛直奔一句话 + 一个大按钮；首开时下一个待办在按钮旁脉冲 `← 点这里`。
- **一条刷新规则：** 只有 0:00；电量、配额、完成态都绕它，没有第二个时钟、道具、货币、RNG。
- **永不含糊的终点线：** `今天照顾好啦 ✓ 明天见～` + 倒计时。
- **免费即可见：** 摸摸/逗逗常驻「免费」「随时可玩」。
- **需求不当五个进度条的保姆：** 5 bar 进「成长」详情，主页只有 ≤1 句 needs 提示 + 1 条进化条。

---

## 7. 美术蓝图方案

纯代码渲染（无 diffusion、无运行时模型），把 `10 creatures × 5 stages × 7 moods` 直接发到**部署客户端已读的精确路径** —— `miniprogram/assets/pets/<id>/<stage>_<mood>.png`（+ `egg.png`、`_fallback/blob.png`）。契约由 `miniprogram/utils/format.ts::spritePath()` 固定，**不得改动**。

扩展现有 `scripts/gen-art.mjs` v2（已做 cel-shaded 球/blob、tinted outline、stage scaling、本命 badge、FX 浮层、PNG 编码）。改动是**架构性的**：把内联命令式 `DRAW[id]()` 函数替换为**声明式 per-creature 蓝图 + 通用解释器**，使非工程师改数据即可调 10 只，且 4-tone ramps + per-part 成熟成为一等公民。

### 7.1 蓝图数据 schema（每只一个 `.mjs` 导出 plain object）

```js
// blueprints/mochi_pudding.mjs
export default {
  id: "mochi_pudding",
  palette: {                                    // 4-TONE ramp（取自 BESTIARY hex，非单 accent）
    body:   { base:"#E8A04B", sh:"#B9743A", hi:"#FFF4E0", out:"#5A3A1E" },
    accent: "#FF9EC4",                          // 身份色，也染蛋 + happy sparkle
    cold:   "#8EC5FF",                          // 委屈蓝，sad/sulk palette 调制用
    parts:  { syrup:{base:"#E6AA5A",sh:"#C2873E",hi:"#FFE6B0",out:"#7A4A1E"},
              heart:{base:"#FF9EC4",sh:"#E06A9A",hi:"#FFD0E2",out:"#9A3A66"} },
  },
  body: { shape:"blob", size:15, aspectY:1.12, cy:40, fill:"body", translucent:0.0, grounded:true },
  parts: [                                       // anchor 以 body-radius 为单位 → 随 scale
    { name:"syrup_curl", kind:"curl",  anchor:[0.06,-1.05], size:5, fill:"syrup", unlockStage:"egg",  grow:"feat", count:5 },
    { name:"heart_ding", kind:"heart", anchor:[0,0.18],     size:4, fill:"heart", unlockStage:"baby", grow:"shrinkWithAge", colorShift:"mood" },
    { name:"hands",      kind:"stubs", anchor:[0.95,0.30],  size:3, fill:"body",  unlockStage:"child" },
    { name:"syrup_rose", kind:"rosette",anchor:[0.06,-1.05],size:6, fill:"syrup", unlockStage:"adult", replaces:"syrup_curl" },
  ],
  stages: { baby:{faceRatio:0.55}, adult:{mark:{kind:"tag",anchor:[0,0.55],color:"accent"}} },
  face:   { anchor:[0,-0.10], eyeGap:0.40, eyeSize:2, style:"round_close" },
  motion: "jiggle",                             // ∈ jiggle|still|jitter|hover|pop|drift|flicker
  moodOverrides: {
    sulk:  { body:{squashY:1.3}, parts:{syrup_curl:{droop:true}} },
    sad:   { body:{squashY:0.7}, palette:"cold" },
    happy: { parts:{heart_ding:{fill:"heart", pulse:true}} },
  },
};
```

### 7.2 共享 STAGE_TABLE（成熟骨架，一张表全 10 只）

| stage | `scale` | `feat`(部件成长 0–1) | `faceRatio`(头身比) | `eyeSize` | unlocks | mark |
|---|---|---|---|---|---|---|
| egg | — | — | — | — | 共享蛋 × accent tint | — |
| baby | 0.66 | 0.45 | **0.58**（头主导） | 3 | core + baby parts | — |
| child | 0.82 | 0.70 | 0.52 | 2 | + child parts（手脚） | — |
| teen | 0.98 | 0.90 | 0.46 | 2 | + teen parts（耳/尾/翼） | — |
| adult | 1.12 | 1.00 | **0.42**（身体充实） | 2 | + adult parts；`replaces` 替换 | **本命 mark on** |

`faceRatio` 从 0.58→0.42 收缩是让每只都「年轻→年长」**而无需重画**的单一杠杆；`feat` 让火焰/叶/尾/耳随龄变长。蛋是**一个共享 silhouette × 10 accent tint**，绝不画 10 个蛋。

`grow` 曲线：`feat`（随龄变大）/ `shrinkWithAge`（婴儿超大特征→成年缩小，如 mochi 心丁）/ `const` / `unlockGrow`。`replaces` 让成年换更华丽部件。`count` 控重复（狐尾、蛾须）。
`kind` 词汇（通用 prim 库）：`ears tail wings flame leaf dome tentacles curl rosette heart stubs antenna orb moss kiln nebula box`，每个 ~15 行解释器增量，全 10 只共享。

### 7.3 cel-shading 规则（看起来「成品」而非「扁平」）

1. **每材质 4-tone ramp**：`base / sh`(降值、色相偏紫 `#261C32`) / `hi`(升值、偏暖白 `#FFF4E0`) / **1px tinted outline**(`out` = base 混 72% 暗紫墨，**绝不纯黑**，让深色 echo_fox `#1E1B2E` 也有可读轮廓)。
2. **单一光源，左上，全 10/全 stage/全 mood 固定。** 每 prim 算 `nl=1−dist/2r` 分 3 区：`>0.74→hi`、`>0.40→base`、else `sh`；阴影恒在右下。
3. **高光 pip**：每个 r≥5 圆形左上一个 hi-白像素 + 每只眼一个白 shine——这是「成品感」的 80%。
4. **64 网格无抗锯齿**，硬边；唯一「AA」是客户端 2× 呈现缩放。
5. **内部分隔**（肢体压身、肚缝、嘴）用相邻 fill 的更暗 shade，**非黑轮廓**；轮廓只描外部 silhouette，`outline()` 在所有 part 之后跑。
6. **dither 仅作材质纹理**（jelly/dream 半透、moth 绒毛），**禁止**作渐变 ramp（读作旧 PC art）。
7. **draw order 是 load-bearing**：back parts → 接触阴影 → body → front parts → `mark` → `outline()` → face → FX 浮层；解释器按 part 的 `z`(back/front) 走，顺序是数据非代码。

### 7.4 反应 = base pose + FX 浮层 + transform

```
cell(stage,mood) = BASE_POSE[poseOf(mood)] + FX_OVERLAY[fxOf(mood)] + MOTION[blueprint.motion]
```

7 个客户端 mood 坍缩为少数 base pose，其余是 `idle` 的 palette/face 调制：`idle`(基准) · `happy`(换脸 `^◡^`+blush+色移 part) · `sad`(全局降饱和 25%+换 cold 蓝+垂嘴+泪) · `sulk`(怒眉+火苗变红) · `sleeping`(闭眼+降值+zzz) · `eating`(开 `o` 嘴，唯一真脸差) · `hide`(共享 box prop)。**每 stage 只需作 `idle` + `eating` 嘴 + 脸-mood 表**，其余确定性派生。`motion`（客户端 transform，零额外美术）：`jiggle/still/jitter/hover/pop/drift/flicker`，从一帧读出「动起来的性格」。

### 7.5 build 矩阵 & 文件命名（零客户端改动落地）

```
egg:        /assets/pets/<id>/egg.png
其余:       /assets/pets/<id>/<stage>_<mood>.png
fallback:   /assets/pets/_fallback/blob.png   (onSpriteError)
```
- `<id>` ∈ 10 archetype（dirs 已存在）·`<stage>` ∈ `egg|baby|child|teen|adult`·`<mood>` ∈ `idle|happy|sad|sleeping|sulk|hide|eating`(7)。

| 轴 | 值 | 数 |
|---|---|---|
| creatures | 10 | 10 |
| egg cell | `egg.png` | 1/只 |
| stage×mood | 4 × 7 | 28/只 |
| **每只** | | **29** |
| **总计** | 10×29 | **290** + `_fallback/blob.png` = **291**（与盘上 29/dir 完全吻合） |

build loop 替换内联 `DRAW[id]` dispatch：编译 ramps → 写 egg（共享形×tint）→ 对每 stage 取 `merge(STAGE_TABLE, blueprint.stages)` + 过滤 unlock/replaces 后的 active parts → `interpret(body,parts,stageParams)` → 对每 mood 套 moodOverrides + paletteModulate + drawFace + composite FX → 编码写 `${stage}_${mood}.png`。

**优雅降级链**（`exact→idle→prevStage→_fallback`）使**部分作画永不破 UI**：手绘 `adult_idle` 升级、或未调的 `teen_sulk`，都逐文件优雅降级。build 可输出覆盖计数（real-art vs procedural vs fallback）上报 /status 的「云宠物」组。

### 7.6 质量天花板（诚实）

程序化 cel-shading 的上限是干净、连贯的「indie toy / Tamagotchi」观感，**永远不及手绘 Stardew/Owlboy** 的刻意不对称与逐帧 squash。**该花力气处：** (a) **脸**（眼/嘴/眉承载 ~全部魅力，给最多数据旋钮）；(b) **身份 silhouette + 一个招牌特征**（mochi 抖心、fox 光球尾、moth 灯笼）在 64px 一眼可辨；(c) **4-tone ramp 直取 BESTIARY**。**别花力气处：** 亚像素细节、复杂纹理、写实解剖。**作战计划：先程序化发全 291 cell（一致、免费、秒级迭代），后续仅手替 ~12 张 hero cell**（每只 `adult_idle` + `adult_happy`，营销/孵化揭晓帧），落到相同路径覆盖在程序化之上，零代码改动。进化读感（5 阶成熟）几乎全靠 `faceRatio 0.58→0.42` + `feat` 部件成长 + adult `replaces`——能产出可读的年轻→年长梯度，但中间阶（child/teen）有「同一只稍大」的风险；好在 **V1 只发到童年**（`MAX_STAGE_V1`），teen/adult 保真度延后、低风险。

---

## 8. 实施计划

按依赖顺序。后端先于客户端；数据先于逻辑。

### 阶段 0 — DB / schema（迁移：additive、非破坏、可回滚）

1. **`pet_cooldown` 加两列**（compute-on-read 电池，镜像 `last_tick`）：
   ```sql
   ALTER TABLE pet_cooldown ADD COLUMN IF NOT EXISTS care_charges INTEGER NOT NULL DEFAULT 3;
   ALTER TABLE pet_cooldown ADD COLUMN IF NOT EXISTS charges_updated_at TIMESTAMPTZ;
   ```
   `daily_reset_on` / `streak_*` / `last_active_date` **原样保留**（午夜引擎 + 连续逻辑复用）。`last_*` 冷却时间戳与 `*_count_day` 计数列**保留但停读**（care 无冷却；保留以备回滚）。
2. **`action_log` 完成奖幂等键**（解 critique 的 double-grant）：完成奖（+30/+10）必须有**独立**于 checkin 的 once-per-day 守卫。新增 `verb='complete'` 行 + 部分唯一索引：
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS uq_complete_per_day
     ON action_log (pet_id, local_date) WHERE verb = 'complete';
   ```
   完成奖以 `ON CONFLICT DO NOTHING` 写入，杜绝 feed→refresh→feed 在翻 true 边界反复发放。`uq_checkin_per_day` 不变（守首开 check-in）。
3. **`pet_inventory` 不删表**（回滚安全）；只在代码层停读写。
4. `stage-table.ts` 数据更新（见阶段 1）。

### 阶段 1 — 后端常量与数据

5. **`constants.ts` 重写 `ACTIONS`** → verb 集收缩为 **`care | play | pet`**：
   - 删 `snack / clean(独立) / sleep / doctor / checkin / feed(独立)` 为按钮——它们折叠进 `care` auto-router 的内部路由 `feed/clean/heal/groom`（仍写各自的 copy intent + effects）。
   - `play.effects = { mood: 20 }`（删 energy/cleanliness 副作用）；`play.blockedWhen = ["SICK"]`（去掉 SULKING）。
   - `pet.effects = { mood: 8 }`，`exp:0 bond:0`，去 `daily` 计数（无限）。
   - care 每格 `exp:25 bond:6`；删 `cost / cooldownMs / daily`（电量即节流）。
   - 删 `START_KIT / REUNION_PACK / GIFT_POOL / OVERFEED.cost`。
   - 新增电池常量：`CARE = { charges: 3, regenMs: 5*H, dailyReset: true }`。
6. **`stage-table.ts`**：`STAGES.expReq` 改 `child 380 / teen 900 / adult 1700`（baby 120、egg 0、minDays、bondGate 不变）。
7. **新增 Lv 派生**（`pet.ts`/新 `levels.ts`）：`expToReach(N)=60(N−1)+10(N−1)²`、`Lv(exp)=1+floor((−60+sqrt(3600+40exp))/20)`。**不建列。**

### 阶段 2 — 后端逻辑（tick / 路由 / API）

8. **`tickCharges()` 纯函数**，接入同一 recompute pass（无 cron）：基于 `charges_updated_at` 算 `+1/5h` 封顶 3；`daily_reset_on` 翻天 → 硬重置 3 + 清当日计数。读时即正确。
9. **`planAction` 的 `care` auto-router**：取 `{satiety, cleanliness, health}` 最低 → 选 `feed/clean/heal/groom` → 套对应 effects + copy event → 扣 1 电量；电量 0 → 友好拒绝 `下次 +1：mm:ss`。verb-in-ACTIONS 守卫随收缩到 `care|play|pet` 更新。强制：成功 `play` 后无条件清 SULKING flag。
10. **`GET /pet` 首开当日 check-in（最重要 buildability fix），全程在 `withTx` 内、幂等：**
    - 若当日首开：bump streak + grant `+8` bond + `INSERT … action_log(verb='checkin', local_date) … ON CONFLICT (uq_checkin_per_day) DO NOTHING`。并发/快刷不重复发放。
11. **完成奖发放**（在 action 路由内，`careCoveredToday` 由 false→true 时）：`INSERT … action_log(verb='complete') … ON CONFLICT (uq_complete_per_day) DO NOTHING`；仅当插入成功才 grant `+30 exp +10 bond`（用 `RETURNING` 判断），杜绝 double-grant。
12. **API 字段扩展（`PetView`）：** 加 `level: number`、`evolveProgress: number(0–100)`、`careCoveredToday: boolean`、`careCharges: number`、`chargesRefreshInMs: number`、`dailyResetInMs: number`、每动作的 `reactionCue { pose, fx, anim, copyEvent }`（驱动客户端反应）。`Verb` union 收缩为 `care|play|pet`（`ActionAvailability` 同步）。`inventory` 字段保留为空/弃用。

### 阶段 3 — 客户端（home UI / 反应 / 额度显示）

13. **`pages/home`（`home.wxml` + `home.ts`）重做** 为 §6 三态焦点卡 + 单进化条 + 摸摸/逗逗免费行；5 stat bar 移到「成长」详情入口；渲染 `Lv`、`认识第 X 天`、电量 pips、倒计时、`← 点这里` 脉冲、一次性 coach mark。
14. **反应系统接线**（§5）：读 `reactionCue`，驱动 `(pose)+(FX 浮层)+(anim)`；照顾浮 `+25 EXP/+6💛`，摸摸/逗逗浮 💛/🎵 **无数字**；完成态庆祝。新 anim 键 `?? "react_happy"` 兜底；启用盘上闲置的 `eating` sprite。
15. **额度显示**：电量 pips / `下次 +1：mm:ss` / `免费` 标签 / `随时可玩` / 完成态倒计时——全在主页，单一表面。

### 阶段 4 — 美术引擎（与 0–3 并行，因有降级链兜底）

16. `gen-art.mjs` 重构：`interpret()` walker over `body+parts+STAGE_TABLE`；加 ~6 个新 `kind`（antenna/orb/moss/kiln/nebula/rosette）；`STAGES/FXOF/ACCENTS` 移进 schema；从 `BESTIARY.md` 作 10 个蓝图 `.mjs`。先程序化全 291 cell，后续手替 ~12 hero cell。

---

## 9. 取舍与风险

### 我们删掉了什么，为什么

- **删 4 件道具 + heart 货币 + 付费治疗 + 签到 RNG 礼包。** 它们唯一的作用是节流照顾，但日历 + 电池节流得**更清楚**；它们正是「额度怎么补充刷新」困惑的根源（四套刷新机制）。坍缩成一条规则：午夜 + 电池（回充就长在按钮上）。**净结果：零经济要管理。** 若日后想要「礼物」多巴胺，它以 cosmetic（帽子、贴纸）回归，**绝不作为照顾输入**——门没关死。
- **删 5 个 verb 按钮（零食/哄睡/看医生/签到 + 把 feed/clean/heal/groom 藏进 1 个照顾）。** 首次者要学的概念从 ~10+ 降到 ~4（照顾够一天 / 摸摸逗逗免费 / 午夜刷新 / 条慢慢涨），一句 coach mark 教完。

### 残留风险（诚实记录）

1. **auto-router 的 agency loss。** 一个按钮藏 4 个 verb：点起来简单，但用户**不能选择**给「干净但饿」的宠物洗澡——router 永远补单一最低 stat。「我点照顾它却去喂了、我想让它洗澡」会让一部分玩家困惑。缓解：needs 提示句明示这次会做什么（`它有点饿了，喂一口吧`），且图标随 verb 变（🍙/🛁/💊/🪮）——点之前就知道。**接受此取舍**以换「3 秒就懂」。
2. **深度疏忽 + 当日 EXP 边界。** §3 证明 3 格 stat 覆盖对深度疏忽成立（5/5/15→30/45/55）；唯一边界是回来时电量 <3 且三项同时贴地板——极罕见，可能需等 5h 补第 3 格。不影响典型用例。
3. **进度条的 gate tooltip 仍露 3 个子数字**（Lv5 · 再养1天 · 亲密60/60）——多闸复杂度的轻微泄漏。可接受：它只在用户主动点进度条时出现，主线体验仍是「一句话 + 一个按钮」。
4. **bond 闸对到过阶的玩家近似 no-op**（`bondFloorForStage` 地板 + 亲密给 0 bond → 失联回归仍清闸）。对治愈定位是 intended，记录确认。
5. **进化读感（5 阶成熟）程序化「够用但不惊艳」。** 中间阶有「同一只稍大」风险；V1 封顶童年使 teen/adult 保真度延后、低风险；hero-replacement 路径覆盖营销帧。
6. **程序化美术质量天花板 = indie toy / Tamagotchi**，非手绘精度。作战计划（先程序化全量、后手替 hero cell）是 plan of record。

### 内部一致性自检（全部已对实际代码值验证）

- expReq 单一来源 **120/380/900/1700**（消除三表冲突）；Lv 精确落在 2/4/7/11 升阶日。
- 电池覆盖证明用**实际** effects（feed+25/clean+40/heal+40、3 格），**不再声称「永不饿/脏」**；改为「按格覆盖、stat 托到 ≥30」，深度疏忽 5/5/15→30/45/55 已实算。
- `careCoveredToday` 边界 `>= 30`（非 `>30`），消除终点线 off-by-one。
- `play` mood `+20`（floor 5→25 ≥ 阈值）+ 成功 play 强制清 SULKING，保证可见哄好（修正 `+18` 不达标 + 「+20 在代码里不存在」）。
- `play` 删 energy/cleanliness 副作用，亲密对成长真正惰性（修正「免费但偷扣 stat」）。
- 新作 sprite 仅 `bathing`+`wiggle`（**2 个**，非 3）；`eating` 盘上已有需启用；`recover/evolve` 是 anim 非 pose（0 新 sprite）。
- 完成奖有**独立** `uq_complete_per_day` 幂等键（非复用 checkin 键），杜绝边界 double-grant。

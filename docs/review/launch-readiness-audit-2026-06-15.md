# cloudpet 上线前深度调研报告

> **日期**：2026-06-15
> **范围**：全量代码（`web/` 后端 + `miniprogram/` 客户端 + `cloudrun/` 反代 + `db/` + `scripts/` + 设计文档），以及活体系统现状（运行中的容器、cron、nginx、共享 DB）。
> **方法**：8 维并行审计（游戏引擎数学 / API 并发事务 / 安全滥用 / 数据与生命周期 / 客户端健壮性 / 留存设计 / 上线运维 / 跨组件契约），每条「bug/安全/数据/性能」类 finding 由独立 Sonnet 审计员做**对抗式验证**（默认立场是驳倒它）。共 22 个 agent、≈100 万 token、389 次工具调用。另：作者本人独立精读并交叉验证了身份/鉴权层、会写库的 `GET /api/pet` 事务、以及 cron/nginx 活体配置。
> **怎么读「验证结论」**：`confirmed`=验证员独立从代码复现；`downgrade`=真实但被过评，已降级；`judgment`=设计/运维判断，未做对抗验证；`unverified-low`=低危未单独验证。原始 42 条中 **1 条被对抗验证驳回**，未纳入本报告。

---

## 0. 一句话结论

**「代码能不能跑」≈ 能**——这套代码比典型的独立开发者上线前代码工程质量明显更高：所有写库路由统一 `withTx + SELECT … FOR UPDATE`、SQL 全参数化、compute-on-read tick 基本正确、迁移规范干净、客户端对缺字段优雅降级。核心养成闭环（测试→孵化→照顾→回访 recap→少年分叉→成年→装饰）端到端跑通。

**「能不能公开上线」= 还差一小簇非玩法的拦截项**，与引擎写得多好无关。真正卡公开发布的是 **2 个微信合规项 + 1 个数据安全项**，外加 **1 个会破坏产品核心体感的引擎 bug** 和 **1 个一旦开启真实登录就会变成真洞的身份信任缝**。这几项做完（估计专注 1–2 天），即具备上线条件。

**严重度分布（41 条入选，1 条已驳回）**：🔴 critical ×1 ｜ 🟠 high ×9 ｜ 🟡 medium ×11 ｜ ⚪ low ×17 ｜ · nit ×3

---

## 1. 上线拦截项（公开发布前必须处理）

这 5 项构成「能跑」与「能上线」之间的全部硬门槛。建议作为上线前冲刺的唯一焦点。

### 🔴 B1. 用户改名无内容安全审核（msgSecCheck 缺失）— 几乎必然被微信审核拒
- **验证**：合规面 `judgment` + 安全面 `confirmed`（两条 finding 合并，取 critical）
- **位置**：`web/src/app/api/pet/rename/route.ts:21-29`；孵化命名 `miniprogram/pages/hatch/hatch.ts:46-58`；改名 `miniprogram/pages/home/home.ts:440-448`。全仓 grep `msgSecCheck` 仅命中 node_modules。
- **现状**：改名只校验 `name.trim()` 长度 1–12，然后直接 `UPDATE pet SET name=$2`。宠物名是被存储+回显的 UGC（还会进 `voice_log`/diary）。微信《运营规范》要求任何被存储/展示的用户文本做服务端 `security.msgSecCheck`。
- **雪上加霜**：调用 msgSecCheck 需要 `AppID+AppSecret` 换取的 access_token，而 **`WX_APP_SECRET` 当前为空**，即便加了检查也调不通。
- **修法**：① `web/.env` 配 `WX_APP_ID`/`WX_APP_SECRET`；② 在 rename（及 hatch/quiz 命名路径）`UPDATE` 之前调 `security.msgSecCheck (v2, scene=1, openid)`，不通过则友好 toast 拒绝；③ 顺手剥离控制字符/零宽/RTL-override（`.trim()` 不管这些）；④ API 失败时记录日志后放行（fail-open，避免误伤）。

### 🟠 B2. 隐私保护指引只是一个 md 文件 — 未在 mp 后台声明、未接进小程序隐私配置、联系邮箱仍是占位符
- **验证**：`judgment`
- **位置**：`docs/privacy.md`（第 53 行邮箱为 `[在此填写你的联系邮箱]`）；`miniprogram/project.config.json` 无 `__usePrivacyCheck__`；`app.json` 无 `permission`/隐私块。
- **现状**：小程序通过 `wx.login` 取 openid（属收集用户信息），微信要求把《用户隐私保护指引》在 `mp.weixin.qq.com → 设置 → 服务内容声明 → 用户隐私保护指引` 登记并经平台单独审核，并提供可用联系渠道。仓库里放个文件这三样都不满足，大概率审核驳回或上线后被限制。
- **修法**：填邮箱；把指引文本贴进 mp 后台提交平台审核；确认已列明 openid 收集；按 libVersion 3.5.5 决定是否需要基础库隐私授权弹窗。

### 🟠 B3. compute-on-read 取整停滞 — 频繁刷新同时冻结「衰减」（完美照顾外挂）和「成长」（惩罚活跃玩家）
- **验证**：`confirmed`（数值模拟复现），`launchBlocking: true`
- **位置**：`web/src/lib/game/tick.ts:45-46, 188-195`；写回 `web/src/lib/pet.ts:108-116`；**对照正确实现** `web/src/lib/pet.ts:85-92`（`regenSparks`）。
- **现状**：`recompute()` 以浮点衰减后,第 188-195 行对每个 stat `Math.round()` 并把 `last_tick=now` 一起写回。下次读取从**取整后的整数**起算、时钟又归零——任何一次读间隔内衰减 < 0.5 单位的部分被永久丢弃。数值验证：child/bond-300 下 satiety 衰减 3.64/小时 → 需 ≥8.2 分钟才掉 1 点；mood≈13 分钟、cleanliness≈10、energy≈8.6。模拟 2 小时内每 30 秒刷新一次：satiety 始终 60；而一次性 2 小时读则掉到 53。**同一根因也卡住向上成长**：`weight`（line 194 取整）每 30 秒只涨 ~0.005→0；passive EXP（line 128 `Math.round`）30 秒 drip ~0.02→0。模拟 24 小时每 30 秒刷新：weight 停在 100（vs 一次读 113）、被动经验累计 0。
- **为何是正常使用而非边角**：home 页有自刷新的 spark/care 倒计时 ticker，频繁读取是常态。
- **影响**：高频返回的活跃玩家「需求永远不到期」（照顾闭环失效、可作弊），同时体型/经验肉眼不长——与产品「按真实时间养大」的核心体感**正好相反**。
- **修法**（三选一，难度递增）：(a) 采用 `regenSparks` 的 anchor 模式——`last_tick` 只前移「实际消耗掉的整单位」对应的时间、保留残差；(b) 加一个 `last_tick_residual` 列回填未消耗毫秒；(c) **最稳**：把 `pet_state` 的 stat 列改为 `numeric(6,2)`/`real`（放宽 INTEGER CHECK），仅在视图层取整（`buildPetView` 本就返回 raw `state.*`，在那取整即可）。任选其一同时修掉 B/L 级的 `bond-decay-stall-minor`。

### 🟠 B4. 共享 Postgres 无任何备份 — 而每晚保留期 DELETE 跑在「没有先 dump」的前面
- **验证**：`confirmed`
- **位置**：`crontab -l` / `/etc/cron.d` 无 `pg_dump`；`scripts/nightly-tick.js:21-24` 直接 `DELETE` 90 天前的 `action_log`/`voice_log`。
- **现状**：`cloudpet` 角色+库与 umami/stock-analyst/ai-feed 等共处一个 `traffic-monitor-db-1` 容器,**无库级备份、无恢复 runbook**。一次坏迁移/误 DROP/卷丢失会带走全体服务的数据;每晚保留 DELETE 是不可逆触发点。`privacy.md` 向用户承诺数据可保留/可按需删除——目前无法兑现恢复。
- **影响**：上线前损失 16 用户;上线后是全体用户的养成进度,且爆炸半径覆盖整个 VM 服务群。
- **修法**：加每晚 `docker exec traffic-monitor-db-1 pg_dump -U umami <db>`（**容器内所有库**）落到 `/data/backups/` 带轮转、**排在保留 DELETE 之前**;注册成 /status 上独立心跳;写两行恢复 runbook。这一项保护的是整个 fleet,不只 cloudpet。

### 🟡 B5.（上线即生效）身份信任缝：`auth.ts` 信任客户端可携带的 `X-WX-OPENID`，而 cloudrun 原样透传它
- **验证**：`downgrade`（high → medium，因 PROXY_TOKEN 闸门是前置缓解）。**作者已独立交叉验证此条代码事实。**
- **位置**：`web/src/lib/auth.ts:25-32`（`getUserId` 优先返回 `x-wx-openid`，注释称「unforgeable」）；`cloudrun/nginx.conf.template:39` = `proxy_set_header X-WX-OPENID $http_x_wx_openid;`（透传**进入容器的**客户端值，而非平台注入的可信变量）；模板里**没有** `proxy_set_header X-User-Id "";`，故客户端自带的 `X-User-Id` 也会被 nginx 默认透传到 Azure，正好对上 `getUserId` 在 openid 缺失时的回退信任。
- **现状/为何当前低危**：根 nginx 的 PROXY_TOKEN 闸门（`/etc/nginx/snippets/cloudpet.conf`）在 `auth.ts` 之前就 403 掉所有直连伪造,公网无法直接打 API;且当前 `WX_APP_SECRET` 空、全是不可枚举的 `anon-<uuid>`,openid 分支实际未用。
- **为何上线即变真洞**：一旦配 `WX_APP_SECRET` 启用真实 openid,恶意 callContainer 客户端可在 header 里塞 `X-WX-OPENID:<受害者>` 走合法云路径(自动带上 token);**它能否到达 `auth.ts` 取决于「微信云托管是否在转发前覆盖/剥离客户端自带的 X-WX-OPENID」——这是未文档化、未验证的平台假设**。若假设不成立 = 任意账号越权读写(IDOR/接管)。
- **修法**：cloudrun 不要原样透传——`proxy_set_header X-WX-OPENID "";` 清掉客户端副本、只从平台真正注入的来源重盖;并显式 `proxy_set_header X-User-Id "";` 让网关流量只能从注入 openid 取身份;上线前实测「客户端塞的 X-WX-OPENID 无法穿过往返」。更稳:后端自己 `jscode2session` 校验并签发 HMAC 会话 token。**必须与「打开 openid 登录」同一次变更一起做。**

---

## 2. 高优先级（不拦截上线，但应尽快做）

### 🟠 H1. 可观测性只有「存活探针」级别 — 500 风暴 / 闸门误配 / DB 撑满都会在 /status 上显示绿色
- **验证**：`judgment`
- **位置**：`scripts/nightly-tick.js:26-34`（心跳只 `GET /cloudpet` **开放落地页**，任何响应都 touch 心跳并 exit 0）；`status/web/src/lib/checks/cloudpet.ts:10-44`（仅查 4 张表存在 + `last_tick` 是否 >24h，且只 WARN）。
- **影响**：若 `/api/action` 开始 500、连接池耗尽、或 token 单边轮转导致闸门 403 掉 100% 真实流量——落地页照样 200、表照样在,/status 维持绿色,作者只能靠用户投诉才发现。与「反代是单点 + 最可能的上线事故正是 token 不一致」叠加。
- **修法**：给 /status 的 cloudpet 检查加 ① 一个带 token 的 `/cloudpet/api` 认证探针（或新增轻量 `/api/healthz`）真正打到 API 路径;② `pg_database_size('cloudpet')` / `action_log` 行数阈值;③ 失败时 `PushNotification`(作者不会盯着 /status)。

### 🟠 H2. 完全没有社交/分享闭环 — 微信的分发引擎和一大返回钩子直接缺席
- **验证**：`judgment`
- **位置**：全树 grep `onShareAppMessage`/`onShareTimeline`/`分享`/好友/排行 = 0 真实命中。
- **影响**：对微信小游戏,分享到群/朋友圈 → 好友打开 → 安装,本身**就是**增长通道,也是顶级返回理由(「看看朋友养的哪只」「给朋友的宠物送顶帽子」)。全无 → 增长只能靠手动驱动。它「不报错」所以隐形,却是留存+增长的最大天花板。
- **修法**：至少上 `onShareAppMessage` + 自动渲染的分享卡(精灵+名字+本命原型+今日心声),最高传播力的两个时刻是「测出本命宠」和「少年分叉揭晓」;再叠一个治愈向社交钩子(串门摸摸/送帽子,绝不竞技)。属上线后,不拦截发布。

### 🟠 H3. 成年后（day-30+）长尾过薄 — 只剩一个几乎不动的 Lv + ~2 顶尾部帽子,日常循环永不变化
- **验证**：`judgment`
- **位置**：`web/src/data/stage-table.ts`（MAX_STAGE=adult）；`web/src/data/deco.ts:19-27`；`web/src/lib/pet.ts:207`「已经长成大成宠啦」；设计文档 `docs/REDESIGN_V2.md §4`「没有任何阶段解锁新的照顾输入」。
- **现状**：成年(~day 21–24)后,Lv 升级公式 `60(N-1)+10(N-1)²` 在 Lv11+ 每级要数百经验、~80/天 → 爬得极慢;7 顶帽子里只有 2 顶(wizard bond≥700、adult crown)在成年后才解,其余 ~day7 就拿全。最该留住的硬核玩家「看遍了」最快。
- **修法**：加真正按周累积的长尾(里程碑心声相册/月度季节卡、按月解锁曲线的更多帽子/房间贴纸,bond 850/1000、streak 30/60/100);帽子槽是对的钩子,只是货太少。属 H2 的另一半,合并成一份上线后留存计划。

### 🟠 H4. 客户端无任何请求超时 — 冷启动可在一行静态 loading 上干等 ~60 秒,无进度、无自动重试
- **验证**：`judgment`
- **位置**：`miniprogram/utils/api.ts:52-70`（未传 `timeout`，类型在 `lib.wx.cloud.d.ts:179` 提供）；loading 屏 `home.wxml:227-229` 仅一行静态「正在唤醒你的小宠…」；错误回退 `home.ts:212`。
- **影响**：cloudrun min-instance 0 时,每天首次请求要冷启容器+Next 路由,整条链可数秒~数十秒;微信 callContainer 默认超时 ~60s。**首开当日 = 最重要的留存时刻**却像卡死,弱网用户会以为坏了直接走人。
- **修法**：给 callContainer/wx.request 传 `timeout: 12000~15000`,失败快速弹重试 UI;loading 屏加动效,~6–8s 后文案切「它还在醒来,网络可能有点慢…」;首个 `/pet` 读在网络错误(statusCode 0)时自动重试一次。**配合把 cloudrun min-instance 设为 1**(见 quick wins)从根上消除冷启动。

---

## 3. 中等优先级

| # | 标题 | 位置 | 验证 | 一句话 |
|---|------|------|------|--------|
| M1 | `POST /api/quiz` 在 500 路径把**原始异常/DB 错误串**回给客户端 | `web/src/app/api/quiz/route.ts:99-105` | `confirmed` | 唯一一处泄露共享 DB 基础设施元信息(表名/列名/角色/“too many connections”);其它路由都返回固定串。**一行修复**(见 QW)。 |
| M2 | 无任何限流;每次 action 都往共享 DB 插一条无上界的 `action_log` | `action/route.ts:126-127`；grep 限流=0 | `judgment` | 单个过闸客户端可驱动数千写/秒,胀大表+打满 max=8 连接池,殃及同容器其它服务(爆炸半径)。加 per-user 令牌桶 + 只记有奖励的 action。 |
| M3 | `anon-<uuid>` 是事实身份,也是 bearer 密钥,还被写进高频 `action_log.user_id` | `login/route.ts:33/39/43`；`action/route.ts:127` | `confirmed`（云路径下已部分被网关 openid 缓解） | 无过期/无绑定/无轮换,泄漏=永久接管且无找回路径。配好 AppSecret 后迁到 openid + 短时签名会话 token,并提供 anon→openid 合并路径让 beta 宠物存活。 |
| M4 | `next@14.2.18` 落后安全补丁(建议 ≥14.2.35) | `web/package.json` | `confirmed`（维持 medium：本项目无 next/image、无 middleware、无 Server Actions,最严重的几类公告不适用） | 公网暴露服务落后 ~17 个补丁。属 **fleet 级 pin**,需作为全 VM 协调升级,非 cloudpet 单独改。升级后 `npm audit`。 |
| M5 | Umami(第 6 个接线点)代码已接但实际关闭 — `NEXT_PUBLIC_UMAMI_*` 为空 | `web/src/app/layout.tsx:5-19`；`web/.env` | `judgment` | 上线零分析;按 CLAUDE.md 缺一即「未完成」。在 Umami 建站点、填 env、重建即可(注意仅覆盖落地页,小程序内行为仍需微信数据助手)。 |
| M6 | 订阅消息(`sub_grant`)客户端完全未实现;nightly 的「Phase 2 提醒」永不触发 — 无召回 push | grep `requestSubscribeMessage`=0；`sub_grant` 0 行 | `judgment` | 长周期养成游戏无召回通道,实打实压留存。**要么**最小实现(我的页→requestSubscribeMessage→`/api/subscribe`→nightly 消费),**要么**明确推迟并改注释,别上半成品订阅 UI 触发审核。 |
| M7 | diary 页 `onShow` 不重置 `loading`/`noPet` — 冷启动/瞬断时显示空的纯页头,无错误无重试 | `miniprogram/pages/diary/diary.ts:16-34`；`diary.wxml:1,22` | `judgment` | 读着像「宠物历史没了」。`load()` 开头置 `loading:true` 并清 `noPet`;非 404 catch 设错误标志渲染重试(对齐 home 错误屏)。 |
| M8 | 帽子叠加层与衣柜缩略图无 `binderror` 回退(精灵有) — 缺失/改名的帽子资源会在宠物头上渲染裂图框 | `home.wxml:18, 212`（对照 `:17` 有 `onSpriteError`） | `judgment` | 正是 version-skew 场景(后端先加第 8 顶帽、客户端未重传)。加 `binderror` 让未知 hat 退化为「无帽」。 |
| M9 | 已编写但**永不触发**的 diary 记忆句(late_feeder/overfeeder)— 承载「活着感」的内容池里的死内容 | `pet.ts:123-129 behaviorPattern()`；各 copybank `diary.memory` | `confirmed` | `behaviorPattern()` 只会产出 daily_regular/neglected_recently/night_owl,而文案库为 `['late_feeder']`/`['overfeeder']` 写了句子 → `requiresMatch` 永远拒绝。这些「你总是很晚才喂我」恰是最该截图、最「它记得我们」的句子,占已很小的记忆池 ~15–25% 却静默失效。补 `behaviorPattern()` 用 `action_log` 聚合(喂食中位时刻→late;过饱次数→over)。 |
| M10 | ~94–114 行/物种、摊到 ~33 个事件偏薄 — 每日高频节拍约 2–3 周出现重复疲劳 | copybank 各包行数 | `judgment` | 日常每天命中 greet.open/feed.love/clean/pet/play 等小集合,每事件仅 3–6 行轮换;diary 组合维度强但每点击气泡先发干。下一轮文案集中加厚这 ~6 个每日必现事件到 ~10–12 行 + 强化 slot 乘法,而非平摊 6 物种。 |

---

## 4. 低 / nit（择机清理；多为一行级）

- **⚪ L1 改名后丢失专属「声音」**（`rename/route.ts:35` 用 `species_id` 而非 `archetype_key`）— 少年分叉后 `species_id` 变成 `puff__feed` 不在 PACKS,`getPack` 退到 DEFAULT_PACK;**其它 4 个路由都用 `archetype_key`**。最该有性格的硬核玩家反而拿到通用 fallback 命名句,QA 难发现(分叉前正常)。**一行修复**,见 QW。`confirmed`(low)。
- **⚪ L2 无幂等键,双击/重试的「陪玩/摸摸」会重复加 bond**（`action/route.ts` play/pet 分支无 need 门）— 受 1000 上限与 per-day 软帽兜底,经济影响小;不加 EXP。V1 可接受。
- **⚪ L3 `hatch`/`rename` 在 `withTx`+FOR UPDATE 之外改 pet** — 与全局不变量不一致,但二者均不发奖,egg→baby 还被 GET 自愈,无失更新风险。为一致性可补锁。
- **⚪ L4 客户端自报 tz 可前移日界刷签到/连胜** — 仅自我作弊,里程碑 EXP 有 `max_streak_reached` 高水位兜底只发一次。若日后加排行榜需把日界钉到服务端 tz。
- **⚪ L5 闸门是单一静态共享密钥,无轮换流程** — 密钥学卫生良好(不在仓库、.env 已 gitignore),但泄漏即闸门坍塌;写轮换 runbook、考虑双 token 并存窗口。
- **⚪ L6 `growth_event` 永不裁剪;`checkin/complete/evolve` 的 `action_log` 永久保留** — 单调增长无上界,10k DAU ≈ 1.5–2GB/年累积在共享盘;UI 只读最新一条 unseen,给 RETENTION_SQL 加一行 90 天裁剪即可(QW)。
- **⚪ L7 死电池代码 `care_charges`** 每次请求都 SELECT,`battery.ts` 整模块无人 import — 无运行 bug,纯误导;从 `CD_COLS`/类型移除并删 `battery.ts`(物理列保留)。
- **⚪ L8 进程级连接池 max=8** 在上线尖峰下排队(9th 等 10s 后 500) — 预期规模触不到;让其 env 可调并文档化上线日临时调到 16–20。
- **⚪ L9 `GET /api/pet` 把所有 unseen growth_event 一次标 seen 但只展示最新一条**(`pet/route.ts:153-165`)— 每日上限一条故罕见,最坏漏一个「我长大了」弹窗,数据不丢。
- **⚪ L10 装备帽子是乐观更新、不与服务端响应对账**(`home.ts:389-406`)— 与 `doAction` 的 `this.apply(resp)` 不一致;下次 `/pet` 自愈。让 `/deco/equip` 返回 equipped 状态并 apply。
- **⚪ L11 1s spark ticker 在错误屏仍运行、eta 归零静默重发 `load()`**(`home.ts:145,152-163`)— `_loading` 守卫防风暴,但「重连」对用户不可见;并入 H4 一起改。
- **· nit N1 bond 被动衰减(0.05/h)在 <10h 刷新间隔下同样停滞** — 与 B3 同根因,numeric 列改造一并修;对活跃玩家「bond 只升不降」甚至可视为良性。
- **· nit N2 确定性 dip 会在熟睡时段触发**,可能把 satiety/cleanliness 推到 care 阈值下、半夜被唤醒(`tick.ts:139-151` 未按 activeSleep 分段)— 确定且有 `DIP_WINDOW_CAP=6` 上界,纯观感;若「睡眠应平静」则按段跳过 dip。
- **· nit N3 recap 弹窗标题硬编码「我长大啦！」** 与新的 `kind:'rest'`(明确是无升级的小成长)语气不符 — WXML 按 `recap.kind` 分标题即可。

---

## 5. 经验证「确认无问题/做得对」的点（同样重要——别动它们）

这些是审计**主动检查并确认健康**的部分,记录下来让你知道边界被走过且是稳的：

- **✅ 进化晋级链正确**（`tick.ts:178-185`，node 实跑追踪）：child→teen 正确停在分叉等玩家选、teen→adult 自动晋级(MAX_STAGE_V1=adult)、不会跳阶/二次晋级/NaN;`effectiveMinDays` 即便给不可能的负 bond 也只返回更大的门槛,无 <0/NaN。唯一 nit：该 while 循环在 4 处(tick/pet roadmap/action/spark)复制粘贴,日后调参有漂移风险,可抽成一个 helper。
- **✅ 写库 API 面异常规整**：每个发奖/推进状态的路由(action/spark/evolve/deco·equip,**连会写库的 `GET /api/pet` 也是**)都在 `withTx` 内对 `pet_state`/`pet_cooldown` 取 `FOR UPDATE` 再 recompute——经典的双花/双晋级/recap 双触发/重复 growth_event 竞态确实被关掉(作者独立追踪 GET 事务确认:checkin/growth_event/recap-seen/streak 全串行化)。`withTx` 在 throw 时总 ROLLBACK 并归还连接,无连接泄漏。
- **✅ SQL 全参数化**,含 env 来源的 `RETENTION_SQL`(`RETENTION_DAYS` 经 `parseInt`),未发现注入。
- **✅ 迁移规范干净**：每个被代码 SELECT 的 `pet_state` 列都在 CREATE 里有;V3 后新增列都配了幂等 ALTER;连唯一不在 CREATE TABLE 里的 `max_streak_reached` 也由同一 bootstrap 文件里的 ALTER 兜住——新库不会缺列 500。
- **✅ 连接池/事务正确**：`withTx` 始终 finally 释放,无 `query()` 嵌在事务内(无重借死锁),max=8 对共享 100 连接库是好邻居(当前仅占 6,不会饿死其它服务)。
- **✅ 客户端对缺字段极稳**：`home.ts` 几乎每个读到的服务端字段都有 `?? 默认`/`|| []` 守卫,后端近期新增字段对旧体验版**向后兼容**(多余字段被忽略)。孵化页闪回测试 bug **确已修复**(`hatch.ts:27` 空结果 reLaunch 回 home)。
- **✅ cloudrun 路径改写 + token 闸门正确**（作者独立核对）：`proxy_pass https://$azure/cloudpet/api$request_uri` 对所有 callContainer 路径(含嵌套 `/pet/evolve`、`/deco/equip`)正确映射;Azure 端 `location /cloudpet/api` 精确校验 token 否则 403、最长前缀匹配使每个 `/cloudpet/api/*` 受闸而开放 `/cloudpet` 落地页不受闸;`/login` 走闸门也正确(此时尚无存储身份)。
- **活体现状已核对**：后端运行中(cloudpet-web-1,16 用户/6 宠物/8.6MB 库),网关端到端可用(**已存在 1 个真实 openid 用户,证明 WX_APP_SECRET 空时网关仍在注入 X-WX-OPENID**);cron 已接(`cloudpet-tick` 每日 12:00,今日心跳已 touch);nginx snippet 已是带闸门版本。CLAUDE.md 六点接线 **5/6 已做**(nginx/site-index/status 组/cron 心跳,成本日志正确判定 N/A),仅 Umami 实际关闭算第 6 点未完成。

---

## 6. 跨维度主题（看这一节就懂全局）

1. **真正卡上线的是微信平台合规,不是玩法**：msgSecCheck、隐私指引声明、空的 WX_APP_SECRET 构成一个「审核就绪」簇,静态审计把它排在任何引擎 bug 之上。
2. **代码在关键处确实规整**(统一 `withTx+FOR UPDATE`、参数化 SQL、客户端字段守卫)——所以残余风险集中在少数几个明确的缝,而非到处稀疏 → **一次聚焦冲刺现实可行**。
3. **反复出现「隔壁兄弟代码已经写对了」**：取整停滞照抄 `regenSparks`;quiz 500 泄露照抄其它路由的错误处理;改名 voice bug 照抄其它 4 个路由的 `archetype_key`。多条头部修复其实是「向已存在的正确模式对齐一行」。
4. **身份信任是写在注释里、而非强制在代码里**：`auth.ts` 信任 cloudrun 原样透传的 header;`anon-<uuid>` 是无过期 bearer 还被写进高频日志表。根 nginx 的 PROXY_TOKEN 闸门(应用之外的缓解)今天救了场,但 openid 一上线该信任模型就成承重墙。
5. **可观测性与运维只到「存活」级、且在共享 DB/盘上**：保留失败、500 风暴、DB 增长、token 误配都在 /status 绿着,又没备份——任何静默故障的爆炸半径覆盖同容器其它个人服务,不止 cloudpet。
6. **留存设计 day1–14 强、之后薄**：让早期「活着感」成立的那套 compute-on-read(也正被 B3 取整 bug 削弱)没有社交乘数、没有真正的 day-30 长尾——即便清掉所有上线拦截项,增长仍被这层天花板压住。

---

## 7. 一行级 Quick Wins（高性价比,建议先扫掉）

1. **quiz 500 泄露**：`quiz/route.ts:104` 把 `error: msg` 换成 `error: "server_error"` + `console.error(msg)`。
2. **改名 voice bug**：`rename/route.ts:35` `getPack(rows.pet.species_id)` → `getPack(rows.pet.archetype_key)`,恢复分叉后玩家的专属性格句。
3. **改名剥离控制/零宽/RTL-override 字符**(`.trim()` 不管)——也是 msgSecCheck 的半步。
4. **cloudrun 不再原样透传 openid**：`nginx.conf.template:39` 清空再重盖 `X-WX-OPENID`、并 `proxy_set_header X-User-Id "";`——在 openid 上线前移除平台信任依赖。
5. **接 Umami**：建站点、填 `NEXT_PUBLIC_UMAMI_*`、重建——闭合第 6 个接线点。
6. **加 `/cloudpet/api/healthz`(带 token)给 /status 探**——抓 token 闸门误配(开放落地页掩盖了它)。
7. **`growth_event` 裁剪**：RETENTION_SQL 加 `DELETE FROM growth_event WHERE created_at < now() - interval '90 days'`——界住唯一无界表,近零风险。
8. **nightly-tick 裁剪失败时 exit 非 0**,让 `&& touch` 心跳不再在静默失败时假绿——让现有 /status 检查变诚实。
9. **deco-hat / ward-img 加 `binderror` 回退**(`home.wxml:18,212`)对齐精灵的 `onSpriteError`——挡住 version-skew 时头上的裂图。
10. **cloudrun min-instance 设为 1**(接受小成本)——从最重要的「首开当日」时刻消除冷启动。

---

## 8. 本次审计无法验证、需你人工确认的

静态代码审计到不了的地方,留给真机/提审/压测：

1. **微信云托管网关是否真的在转发前剥离客户端自带的 `X-WX-OPENID`**——整条 openid 信任风险(B5)成立与否全押在这。须**活体测试**:在 cloudrun 日志里打印进入的该 header,确认客户端无法设置它。
2. **是否真能过微信审核、归在哪个类目**——msgSecCheck/隐私指引拦截项是从《运营规范》推断,真实审核员行为/类目/额外资质只能提审才知道。
3. **真机冷启动到底多久**——4G/弱网下睡眠 cloudrun 容器实际唤醒耗时、~60s 默认超时会否让用户对着卡死的 loading;需真机测量。
4. **负载行为**——max=8 池 + 共享 100 连接是静态读的,真实上线尖峰/订阅消息扇入下的排队-10s 挂起未测,没跑压测。
5. **取整停滞外挂在真实刷新节奏下是否可达**——~8–13 分钟阈值由衰减率推得,实际客户端 ticker 间隔与真人点击频率决定多常触发。
6. **文案重复疲劳**(~94–114 行/物种)是定性预测(~2–3 周),只有真实长期游玩能证实/证伪。
7. **端到端身份边角**(anon→openid 交接、login-anon 回退)有推理但未对真实 openid 往返跑过;且**当前活体后端可能领先活体客户端**(DevTools 重传待办),客户端/服务端契约漂移只能在重传后核。

---

## 9. 建议的上线前冲刺（按依赖排序）

> 目标:把第 1 节 5 项拦截 + 第 7 节 quick wins 收掉。估计专注 1–2 天。

**第一梯队（卡发布,必须先做）**
1. 配 `WX_APP_ID`/`WX_APP_SECRET`(也解锁 msgSecCheck 与真实 openid)→ 在 mp 后台声明隐私指引、填邮箱(B2)。
2. rename/hatch/quiz 命名路径加 `msgSecCheck` + 字符剥离(B1)。
3. **同一次变更**:cloudrun 硬化 `X-WX-OPENID`/`X-User-Id` header(B5,QW#4)——因为它正好随 openid 一起生效。
4. 加每晚 `pg_dump`(排在保留 DELETE 之前)+ 恢复 runbook(B4)。
5. 修 compute-on-read 取整停滞(B3,建议 numeric 列方案)。

**第二梯队（quick wins + 高优运维,半天内可扫）**
6. QW#1/#2/#5/#6/#7/#8/#9/#10 一把过。
7. /status 加认证 API 探针 + DB 大小阈值 + 失败 PushNotification(H1);cloudrun min-instance=1(QW#10)。

**上线后迭代（不拦截,但决定能不能长大）**
8. 社交分享卡 + 一个治愈向社交钩子(H2)。
9. 成年长尾(相册/季节卡/更多帽子曲线)(H3)。
10. 客户端冷启动超时+进度态(H4)、订阅消息召回(M6)、文案加厚每日必现事件(M10)、补 late/over 行为记忆(M9)。

---

*报告完。原始 42 条逐条结构化数据(含每条对抗验证理由)见审计 workflow 输出;本文件已按严重度+主题重组并标注验证结论,供 review。*

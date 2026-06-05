# VM 接线 (VM Wiring & Delivery)

This is a pure design/planning task — the operator wants the VM wiring & delivery plan written out concretely, using the established conventions (exemplar: quit-diary). No code to execute, no LLM provider work. I'll produce the ordered checklist directly with exact file contents.

Let me quickly confirm the project name decision and the next-free-port note before writing, since those anchor every file path.

The CLAUDE.md port list confirms `quit-diary=3009` and goes up through `cc-web=3010`, and the task spec locks `3012` for this project. I'll use the english slug `cloudpet` for `WhatsFish/cloudpet` and the VM `<name>` of `cloudpet` (Chinese product name 云宠物), matching the heartbeat name `cloudpet-tick` already referenced in the systems spec.

Here is the plan.

---

# 云宠物 (cloudpet) — VM WIRING & DELIVERY PLAN

**Repo slug:** `WhatsFish/cloudpet` · **Code:** `/home/liharr/src/cloudpet/` · **Backend port:** `127.0.0.1:3012` (reserved) · **basePath:** `/cloudpet` · **Heartbeat job:** `cloudpet-tick` · **DB role+db:** `cloudpet` · **Exemplar mirrored:** `quit-diary`

Order below is the order to execute. Steps 1–6 are the operator's mandatory new-service checklist; the WeChat go-live section follows.

---

## 0. Pre-reqs (before the 6 steps)

- [ ] `mkdir -p /home/liharr/src/cloudpet` and scaffold the Next.js 14 backend (copy `quit-diary` structure: `next.config.js` with `output:"standalone"`, `basePath:"/cloudpet"`, Docker container binding `127.0.0.1:3012`, joined to external network `traffic-monitor_default`, `env_file: ./.env`).
- [ ] DB bootstrap: `db/bootstrap.sh` connects as the **`umami`** superuser (NOT `postgres`) and applies idempotent `db/schema.sql` creating role `cloudpet`, database `cloudpet`, and the `pet` table (the §0 persistent record) plus a `users` table. Mirror `stock-analyst/db/bootstrap.sh`.
- [ ] Secrets at `~/.config/cloudpet.env` (mode 600): `WX_APPID`, `WX_SECRET` (for `jscode2session`), `CLOUDPET_PG_*`. Anonymous-UUID fallback applies when WX creds absent (mirror quit-diary login flow).

---

## 1. nginx route

**File:** `/etc/nginx/snippets/cloudpet.conf` (mirror an existing snippet):

```nginx
# 云宠物 — WeChat pixel-pet mini program backend
location /cloudpet/ {
    proxy_pass http://127.0.0.1:3012;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade           $http_upgrade;
    proxy_set_header Connection        "upgrade";
}
```

**Edit:** add this line into `/etc/nginx/sites-enabled/personal-site` alongside the other `include snippets/*.conf;` lines:

```nginx
include snippets/cloudpet.conf;
```

**Reload:**

```bash
sudo nginx -t && sudo nginx -s reload
```

> Note: `basePath:"/cloudpet"` means the app already serves all routes under `/cloudpet/...`, so the `proxy_pass` has **no trailing path** (passes the full URI through). This matches quit-diary; don't add a `/` after the port or you'll strip the basePath.

---

## 2. site-index nav entry

**Edit:** `/home/liharr/src/site-index/index.html` — add an `<a class="item">` block in the nav list, mirroring the existing entries (e.g. quit-diary):

```html
<a class="item" href="https://ai-native.japaneast.cloudapp.azure.com/cloudpet/">
  <span class="emoji">🥚</span>
  <span class="title">云宠物</span>
  <span class="desc">领养一只你的本命像素小宠 — 性格测试配对，养成陪伴，永不消失。</span>
</a>
```

> The mini program itself is consumed inside WeChat; this landing entry points at the backend's web landing page (which also carries the Umami tag, step 6) and serves as the project's public face on the site index.

**Push:**

```bash
cd /home/liharr/src/site-index
git add index.html
git commit -m "Add 云宠物 (cloudpet) nav entry

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push   # to WhatsFish/site-index
```

---

## 3. /status dashboard group

All edits under `/home/liharr/src/status/`.

### 3a. HTTP probe — `web/src/lib/checks/http.ts`

Add an entry to the HTTP checks array (mirror the quit-diary probe). The landing page returns 200; the mini program API is internal:

```ts
{
  group: "cloudpet",
  name: "云宠物 landing",
  url: "https://ai-native.japaneast.cloudapp.azure.com/cloudpet/",
  expectStatus: 200,
},
```

### 3b. DB freshness check — NEW file `web/src/lib/checks/cloudpet.ts`

For a pet game, "fresh & healthy DB" means three things, all read-only over the `cloudpet` DB. Mirror the freshness-check shape from an existing DB-backed check (e.g. `quit-diary.ts` / `stock-analyst` checks) and use the `cloudpet` `DbName`:

```ts
import { withDb } from "../pg";
import type { Check } from "./types";

// "Fresh" for a pet game = the world is alive:
//  (1) DB reachable,
//  (2) pets are being TICKED (last_tick advancing — compute-on-read means an
//      active player base keeps last_tick recent; staleness => either no traffic
//      or the recompute path is broken),
//  (3) the funnel is alive (new users/pets created recently — onboarding works),
//  (4) sanity: no pet is in an impossible state (e.g. health<0 or stage NULL).
export async function checkCloudpet(): Promise<Check[]> {
  return withDb("cloudpet", async (q) => {
    const out: Check[] = [];

    // (1) reachability + table presence
    const total = await q<{ n: string }>(
      `select count(*)::text as n from pet`
    );
    out.push({
      group: "cloudpet",
      name: "DB reachable",
      ok: true,
      detail: `${total[0].n} pets total`,
    });

    // (2) ticks advancing — most-recently-ticked pet within 6h means live traffic.
    // Weekend/quiet-night tolerant: warn (not fail) past threshold; the game is
    // still CORRECT without ticks (compute-on-read), so this is a liveness signal.
    const freshTick = await q<{ mins: number | null }>(
      `select extract(epoch from (now() - max(last_tick)))/60 as mins from pet`
    );
    const tickMins = freshTick[0].mins ?? null;
    out.push({
      group: "cloudpet",
      name: "pets being ticked",
      ok: tickMins === null ? true : tickMins < 60 * 24, // <24h = ok
      warn: tickMins !== null && tickMins >= 60 * 6,     // >6h = warn
      detail:
        tickMins === null
          ? "no pets yet"
          : `last tick ${Math.round(tickMins)} min ago`,
    });

    // (3) onboarding funnel alive — a pet created in the last 7d.
    const newPets = await q<{ n: string }>(
      `select count(*)::text as n from pet
       where created_at > now() - interval '7 days'`
    );
    out.push({
      group: "cloudpet",
      name: "new adoptions (7d)",
      ok: Number(newPets[0].n) >= 0, // informational; never fails the dashboard
      detail: `${newPets[0].n} new 本命宠 in 7d`,
    });

    // (4) integrity sanity — no impossible rows.
    const bad = await q<{ n: string }>(
      `select count(*)::text as n from pet
       where health < 0 or health > 100 or stage is null
          or satiety < 0 or mood < 0 or cleanliness < 0 or energy < 0`
    );
    out.push({
      group: "cloudpet",
      name: "stat integrity",
      ok: Number(bad[0].n) === 0,
      detail: Number(bad[0].n) === 0 ? "all stats in range" : `${bad[0].n} bad rows`,
    });

    return out;
  });
}
```

> Adjust the `Check` shape / helper names to whatever the existing checks use (the repo's exact `Check` type and `withDb`/`pool` signature is authoritative — match it, don't invent fields). Freshness semantics above are the design intent.

### 3c. Register the DbName — `web/src/lib/pg.ts`

Extend the `DbName` union and the connection map:

```ts
export type DbName = /* …existing… */ | "cloudpet";
// + add the cloudpet entry to the pool/config lookup, reading CLOUDPET_PG_* env (3f).
```

### 3d. Register the check — `web/src/lib/checks/index.ts`

```ts
import { checkCloudpet } from "./cloudpet";
// …in the registry/array of check runners:
checkCloudpet,
```

### 3e. Group label & order — `web/src/app/page.tsx`

```ts
const GROUP_ORDER = [ /* …existing… */, "cloudpet" ];
const GROUP_LABEL: Record<string, string> = {
  /* …existing… */
  cloudpet: "云宠物",
};
```

### 3f. Status env — `/home/liharr/src/status/.env` (gitignored)

```bash
CLOUDPET_PG_HOST=db
CLOUDPET_PG_PORT=5432
CLOUDPET_PG_DATABASE=cloudpet
CLOUDPET_PG_USER=cloudpet
CLOUDPET_PG_PASSWORD=<same as ~/.config/cloudpet.env CLOUDPET_PG_PASSWORD>
```

### 3g. Cron registration — `web/src/lib/checks/cron.ts`

Yes, there is a cron (the nightly tick, step 4). Add to the `JOBS` array with a **weekend-tolerant** threshold (the job runs nightly every day, but keep generous slack so a single skipped night doesn't red the board):

```ts
{
  group: "cloudpet",
  job: "cloudpet-tick",
  label: "云宠物 nightly tick",
  // runs ~daily ~20:00 local; allow ~30h before warning, weekend-tolerant
  maxAgeHours: 30,
},
```

### 3h. Rebuild status

```bash
cd /home/liharr/src/status && docker compose up -d --build --force-recreate web
```

---

## 4. cron heartbeats

The nightly tick (systems spec §2: reminders + heartbeat + cosmetic pre-warm). It is **not** the source of truth (compute-on-read is), so the game stays fully correct if it never fires — but it must heartbeat for /status freshness.

- [ ] Ensure the heartbeats dir exists: `mkdir -p /home/liharr/.local/share/cron-heartbeats`
- [ ] Add the crontab line (the tick script lives in the repo, e.g. `/home/liharr/src/cloudpet/scripts/nightly-tick.sh`, sources `~/.config/cloudpet.env`):

```cron
# 云宠物 nightly tick — subscribe-msg reminders + cosmetic recompute pre-warm + heartbeat
0 20 * * * /home/liharr/src/cloudpet/scripts/nightly-tick.sh >> /home/liharr/src/cloudpet/logs/tick.log 2>&1 && touch /home/liharr/.local/share/cron-heartbeats/cloudpet-tick
```

> The `&& touch …/cloudpet-tick` must be the **last** clause so the heartbeat only records on success — matching the job name registered in 3g and the spec's `cloudpet-tick`.

---

## 5. cost logging — **SKIP (not applicable)**

**SKIP — intentionally.** The product (locked decision #1) is **pure rule-based scripting: NO LLM / NO Claude / NO Foundry call at runtime.** All personality "soul" comes from the static copy bank + deterministic context selection. There is no per-call AI cost to attribute, so the ai-feed/stock-analyst `cost_event` pattern (`run-agent.sh` sourcing `~/.config/cost-tracker.env`) does **not** apply. No `cost-log.ts`, no `cost_event` INSERT. (If a future version ever adds an LLM-authored copy generator offline, log that batch job's cost then — but V1 has nothing to log.)

---

## 6. Umami tracking (landing page)

The mini program runs in WeChat (no Umami there), but the public **landing page** at `/cloudpet/` has a web UI and gets tagged. Add via `next/script` in the landing `layout.tsx`, gated on the env vars (mirror the fleet pattern):

**File:** `/home/liharr/src/cloudpet/src/app/layout.tsx`

```tsx
import Script from "next/script";

// …inside <body> (or <head>), at the end:
{process.env.NEXT_PUBLIC_UMAMI_SRC &&
  process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && (
    <Script
      src={process.env.NEXT_PUBLIC_UMAMI_SRC}
      data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
      strategy="afterInteractive"
    />
  )}
```

**Env (in `/home/liharr/src/cloudpet/.env`, gitignored, read by `env_file`):**

```bash
NEXT_PUBLIC_UMAMI_SRC=<same umami script URL the fleet uses>
NEXT_PUBLIC_UMAMI_WEBSITE_ID=<id from the manually-created Umami website>
```

> **Operator action required first:** manually create the "云宠物 / cloudpet" website in Umami to obtain its `website-id`, then paste it into `NEXT_PUBLIC_UMAMI_WEBSITE_ID`. The script renders only when both vars are present, so it's a no-op until you do.

---

## ✅ Done-definition recap (the 6 gates)

| # | Gate | This service |
|---|------|--------------|
| 1 | nginx route | `snippets/cloudpet.conf` → 127.0.0.1:3012, included + reloaded |
| 2 | site-index entry | `<a class="item">` 云宠物, pushed to `WhatsFish/site-index` |
| 3 | /status group | http probe + `cloudpet.ts` freshness + `DbName` + register + `GROUP_*` + `.env` + cron job, rebuilt |
| 4 | cron heartbeat | nightly tick `… && touch …/cron-heartbeats/cloudpet-tick` |
| 5 | cost logging | **SKIP** — no LLM/Foundry at runtime |
| 6 | Umami | gated `next/script` in landing `layout.tsx` (operator creates website first) |

---

## WeChat go-live checklist

1. **AppID / 注册小程序** — register the mini program on `mp.weixin.qq.com` (个人 or 企业 主体 as appropriate). Get the **AppID + AppSecret** → put into `~/.config/cloudpet.env` as `WX_APPID` / `WX_SECRET` (used by the `/api/login` → `jscode2session` → openid → stable `user_id` flow; anonymous-UUID fallback if absent).
2. **服务器域名白名单** — in mp.weixin.qq.com → 开发 → 开发管理 → 开发设置 → 服务器域名, add to **request合法域名**:
   ```
   https://ai-native.japaneast.cloudapp.azure.com
   ```
   (HTTPS only, already covered by the VM's Let's Encrypt cert. The client `utils/api.ts` `wx.request` base URL must be `https://ai-native.japaneast.cloudapp.azure.com/cloudpet`.)
3. **App-NAME shortlist** (cute + passes 行业 review; **avoid 抽奖/赌/博彩** framing given the 抽到/测试 mechanic — frame as 领养/养成/测试/陪伴):
   - **本命小宠** — leans into the fated one-pet bond; clean, no gambling read.
   - **领养一只小怪** — 领养 framing, signals the weird-but-cute original critters.
   - **像素小宠养成记** — 养成 framing, names the genre plainly, very review-safe.
   - **测测你的本命宠** — foregrounds the 性格测试 onboarding as 测试 (not 抽奖).
   - **口袋小怪兽** — cozy collectible-creature vibe, no risky terms.
   - *(Avoid: anything with 抽奖/抽卡/扭蛋/盲盒抽/赌 — even though the match is deterministic, those words trip the gambling heuristic. "测试→领养→本命" is the safe narrative.)*
   - **Lead recommendation:** `本命小宠` (primary) with `像素小宠养成记` as the review-safest fallback name.
4. **DevTools build & ship flow:**
   1. Open the project in 微信开发者工具, set the AppID, confirm `request` base URL points at the whitelisted HTTPS domain.
   2. **上传** (upload) a versioned build → it appears under 版本管理 → 开发版本.
   3. Set it as **体验版** (experience version), add 体验成员, smoke-test on real devices (login → 性格测试 → 孵化 → daily loop → soft-fail recovery).
   4. **提交审核** (submit for review) → fill 类目 (建议: 工具 / 休闲娱乐-养成 类目, **not** 抽奖/博彩类目), version notes framed as 养成/陪伴.
   5. On approval → **发布** (release) to 正式版.
5. **Pre-submit sanity:** backend reachable via the whitelisted domain over HTTPS; `/api/login` returns a stable `user_id`; one-pet-per-user enforced server-side; all recovery verbs (喂食/洗澡/看医生/抚摸/哄睡) reachable so a reviewer can confirm the pet **never dies / never lost** (matches the soft-stakes positioning).

---

**Suggested repo slug:** `cloudpet` → **`WhatsFish/cloudpet`** (public). Create with:

```bash
cd /home/liharr/src/cloudpet
gh repo create WhatsFish/cloudpet --public \
  --description "云宠物 — WeChat pixel-pet adoption & care mini program. Rule-based personality engine (no LLM), 6-axis-archetype 性格测试 matching, soft reversible stakes." \
  --source=. --remote=origin --push
```

(Slug rationale: short, lowercase, matches the VM `<name>`, the `cloudpet-tick` heartbeat, and the `cloudpet` DB role/db already threaded through every file above.)

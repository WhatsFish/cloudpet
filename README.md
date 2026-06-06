# 云宠物 (cloudpet)

A WeChat mini-game: take a short personality quiz, get matched to **one fated 本命宠** —
a cute-but-unusual original pixel critter — and raise it in real wall-clock time.
QQ宠物 / Tamagotchi nostalgia, soft & reversible stakes (it gets hungry/sulky/sick but
**never dies and is never lost**). The personality "soul" is **100% rule-based** — no LLM at
runtime — so it works offline and deterministically; the aliveness comes from a richly-authored,
personality-segmented copy bank.

App name: **本命小宠**. Port `3012`, basePath `/cloudpet`, DB role/db `cloudpet`.

## Architecture (mirrors quit-diary)

```
miniprogram/   native WeChat mini program (TypeScript) — the client
web/           Next.js 14 backend (App Router, standalone) on 127.0.0.1:3012
db/            Postgres role + idempotent schema (shared traffic-monitor-db-1 container)
scripts/       nightly-tick.js (cron: reminders + heartbeat, NOT the source of truth)
docs/          design package (PLAN.md is the canonical source of truth)
```

The runtime is three pure functions + a copy selector: `recompute` (compute-on-read tick),
`applyAction`, `resolveStateFlags`, and `selectCopy`. There is **no LLM call**, so there is no
cost tracking. All game state is server-authoritative; the client clock is never trusted.

## Day-to-day

```bash
# One-time: create role + DB + schema in the shared Postgres container (as the umami superuser).
./db/bootstrap.sh

# Build & run the backend container (joins traffic-monitor_default to reach `db`).
docker compose up -d --build --force-recreate web

# Regenerate placeholder sprites (until real pixel art lands).
node scripts/gen-art.mjs
```

Mini program: open `miniprogram/` in WeChat DevTools, set the real AppID, 编译 → 上传 → 体验版.

## Status

V1 vertical slice: quiz → bonded pet, 3 fully-built creatures (布丁团子 / 墨影狐 / 炸毛团) +
placeholder art for the other 7, the core care loop + 每日心声, soft-fail states, egg→baby→child.
See `PLAN.md` §12 for what's in/out of V1.

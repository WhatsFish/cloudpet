#!/usr/bin/env node
// Nightly cron job. NOT the source of truth (the game is fully correct on
// compute-on-read alone). Its V1 job is a liveness heartbeat: confirm the web app
// is reachable so /status shows the cron ran. (Phase 2 will add 订阅消息 reminders
// here.) Always exits 0 so a transient blip never trips the heartbeat — the cron's
// `&& touch <heartbeat>` only fires on exit 0, which is exactly the signal we want.

const http = require("node:http");

const URL = process.env.CLOUDPET_HEALTH_URL || "http://127.0.0.1:3012/cloudpet";
const stamp = new Date().toISOString();

const req = http.get(URL, { timeout: 8000 }, (res) => {
  res.resume();
  console.log(`[${stamp}] nightly-tick: GET ${URL} -> ${res.statusCode}`);
  process.exit(0);
});
req.on("timeout", () => { console.log(`[${stamp}] nightly-tick: timeout`); req.destroy(); process.exit(0); });
req.on("error", (e) => { console.log(`[${stamp}] nightly-tick: ${e.message}`); process.exit(0); });
